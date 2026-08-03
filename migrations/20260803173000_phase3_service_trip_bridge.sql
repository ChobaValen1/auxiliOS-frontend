-- AuxiliOS · Fase 3A · Puente entre servicio, jornada, viaje, incidentes y remito

create unique index if not exists operator_services_unique_trip_idx
  on public.operator_services(trip_id)
  where trip_id is not null;

create unique index if not exists operator_services_unique_remito_idx
  on public.operator_services(remito_id)
  where remito_id is not null;

create index if not exists trips_open_driver_log_idx
  on public.trips(driver_id, log_id, fecha_hora_inicio desc)
  where fecha_hora_fin is null;

create or replace function app_private.operator_services_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_bridge boolean := coalesce(current_setting('app.phase3_bridge', true), '') = '1';
begin
  if v_bridge then
    new.updated_at := now();
    new.updated_by := coalesce(new.updated_by, auth.uid(), old.updated_by);
    return new;
  end if;

  if v_role = 'chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then
      raise exception 'Servicio no asignado al chofer actual';
    end if;

    if (to_jsonb(new) - array['status','driver_notes','updated_at','updated_by'])
       is distinct from
       (to_jsonb(old) - array['status','driver_notes','updated_at','updated_by']) then
      raise exception 'El chofer solo puede avanzar el estado y registrar una nota';
    end if;

    if not (
      (old.status = 'assigned' and new.status = 'en_route')
      or (old.status = 'en_route' and new.status = 'at_origin')
      or (old.status = 'at_origin' and new.status = 'loaded')
      or (old.status = 'loaded' and new.status = 'at_destination')
      or (old.status = 'at_destination' and new.status = 'completed')
      or old.status = new.status
    ) then
      raise exception 'Transición de estado no permitida';
    end if;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;

  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  if new.assigned_driver_id is not null
     and (
       old.assigned_driver_id is distinct from new.assigned_driver_id
       or old.assigned_truck_id is distinct from new.assigned_truck_id
     ) then
    new.assigned_at := now();
    if v_role in ('administracion','operador','supervision') then
      new.assigned_by := auth.uid();
    end if;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

revoke all on function app_private.operator_services_before_update() from public;

create or replace function app_private.operator_services_log_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.operator_service_events(
      service_id, event_type, to_status, notes, created_by
    )
    values (
      new.service_id, 'created', new.status, 'Servicio creado', new.created_by
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.operator_service_events(
      service_id, event_type, from_status, to_status, notes, created_by
    )
    values (
      new.service_id,
      case when new.status = 'cancelled' then 'cancelled' else 'status_change' end,
      old.status,
      new.status,
      case when new.status = 'cancelled' then new.cancellation_reason else new.driver_notes end,
      auth.uid()
    );
  end if;

  if new.assigned_driver_id is distinct from old.assigned_driver_id
     or new.assigned_truck_id is distinct from old.assigned_truck_id then
    insert into public.operator_service_events(
      service_id, event_type, from_status, to_status, notes, created_by
    )
    values (
      new.service_id, 'assignment', old.status, new.status, 'Asignación actualizada', auth.uid()
    );
  end if;

  if new.trip_id is distinct from old.trip_id then
    insert into public.operator_service_events(
      service_id, event_type, from_status, to_status, notes, created_by
    )
    values (
      new.service_id,
      'trip_linked',
      old.status,
      new.status,
      case when new.trip_id is null
        then 'Viaje desvinculado'
        else 'Viaje #' || new.trip_id::text || ' vinculado'
      end,
      auth.uid()
    );
  end if;

  if new.remito_id is distinct from old.remito_id then
    insert into public.operator_service_events(
      service_id, event_type, from_status, to_status, notes, created_by
    )
    values (
      new.service_id,
      'remito_linked',
      old.status,
      new.status,
      case when new.remito_id is null
        then 'Remito desvinculado'
        else 'Remito #' || new.remito_id::text || ' vinculado'
      end,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.operator_services_log_event() from public;

create or replace function public.advance_operator_service(
  p_service_id uuid,
  p_to_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_expected text;
  v_log public.daily_logs%rowtype;
  v_trip public.trips%rowtype;
  v_trip_id integer;
  v_other_trip integer;
  v_service_type text;
  v_remito public.remitos%rowtype;
begin
  if v_role <> 'chofer' or v_uid is null then
    raise exception 'Solo el chofer asignado puede avanzar el servicio';
  end if;

  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_service.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;

  if v_service.assigned_truck_id is null then
    raise exception 'El servicio no tiene un móvil asignado';
  end if;

  v_expected := case v_service.status
    when 'assigned' then 'en_route'
    when 'en_route' then 'at_origin'
    when 'at_origin' then 'loaded'
    when 'loaded' then 'at_destination'
    when 'at_destination' then 'completed'
    else null
  end;

  if v_expected is null or p_to_status <> v_expected then
    raise exception 'Transición de estado inválida';
  end if;

  select dl.*
  into v_log
  from public.daily_logs dl
  where dl.driver_id = v_uid
    and dl.truck_id = v_service.assigned_truck_id
    and coalesce(dl.status, 'open') = 'open'
    and dl.hora_fin is null
  order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
  limit 1;

  if not found then
    raise exception 'JORNADA_REQUERIDA: iniciá la jornada con el móvil asignado antes de comenzar el servicio';
  end if;

  if v_service.status = 'assigned' then
    select t.trip_id
    into v_other_trip
    from public.trips t
    where t.driver_id = v_uid
      and t.fecha_hora_inicio is not null
      and t.fecha_hora_fin is null
      and (v_service.trip_id is null or t.trip_id <> v_service.trip_id)
    order by t.fecha_hora_inicio desc
    limit 1;

    if v_other_trip is not null then
      raise exception 'VIAJE_EN_CURSO: finalizá el viaje actual antes de iniciar otro servicio';
    end if;

    if v_service.trip_id is null then
      select sc.name
      into v_service_type
      from public.service_concepts sc
      where sc.concept_id = v_service.primary_concept_id;

      insert into public.trips(
        log_id,
        driver_id,
        nro_servicio,
        patente,
        tipo_servicio,
        origin,
        destination,
        fecha_hora_inicio,
        notes,
        created_at_device,
        received_at,
        sync_status
      )
      values (
        v_log.log_id,
        v_uid,
        coalesce(nullif(trim(v_service.service_order_number), ''), v_service.service_number),
        nullif(trim(v_service.vehicle_plate), ''),
        coalesce(nullif(trim(v_service_type), ''), 'Servicio'),
        v_service.origin,
        v_service.destination,
        now(),
        'Creado desde ' || v_service.service_number,
        now(),
        now(),
        'synced'
      )
      returning * into v_trip;

      v_trip_id := v_trip.trip_id;
    else
      select *
      into v_trip
      from public.trips
      where trip_id = v_service.trip_id
        and driver_id = v_uid
        and log_id = v_log.log_id;

      if not found then
        raise exception 'El viaje vinculado no pertenece a la jornada activa';
      end if;

      v_trip_id := v_trip.trip_id;
    end if;
  else
    if v_service.trip_id is null then
      raise exception 'El servicio no tiene un viaje vinculado';
    end if;

    select *
    into v_trip
    from public.trips
    where trip_id = v_service.trip_id
      and driver_id = v_uid
      and log_id = v_log.log_id
    for update;

    if not found then
      raise exception 'El viaje vinculado no pertenece a la jornada activa';
    end if;

    v_trip_id := v_trip.trip_id;
  end if;

  if p_to_status = 'completed' then
    if v_service.remito_id is null then
      raise exception 'REMITO_REQUERIDO: completá y firmá el remito antes de finalizar el servicio';
    end if;

    select *
    into v_remito
    from public.remitos
    where remito_id = v_service.remito_id
      and driver_id = v_uid
    for share;

    if not found then
      raise exception 'El remito vinculado no pertenece al chofer';
    end if;

    if coalesce(v_remito.status, 'pendiente') not in ('firmado', 'cerrado_admin') then
      raise exception 'REMITO_INCOMPLETO: el remito debe estar firmado o cerrado por administración';
    end if;

    if v_remito.trip_id is distinct from v_trip_id then
      raise exception 'El remito no corresponde al viaje del servicio';
    end if;

    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        km_traveled = coalesce(v_remito.km_reales, km_traveled),
        notes = concat_ws(E'\n', nullif(notes, ''), nullif(trim(p_note), '')),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_trip_id;
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  update public.operator_services
  set status = p_to_status,
      trip_id = coalesce(trip_id, v_trip_id),
      driver_notes = case
        when p_to_status = 'completed' then nullif(trim(p_note), '')
        else driver_notes
      end,
      completed_at = case
        when p_to_status = 'completed' then now()
        else completed_at
      end,
      updated_by = v_uid
  where service_id = p_service_id
  returning * into v_service;

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'status', v_service.status,
    'trip_id', v_service.trip_id,
    'remito_id', v_service.remito_id,
    'log_id', v_log.log_id
  );
end;
$$;

revoke all on function public.advance_operator_service(uuid, text, text) from public;
revoke all on function public.advance_operator_service(uuid, text, text) from anon;
grant execute on function public.advance_operator_service(uuid, text, text) to authenticated;

create or replace function public.update_operator_service_assignment(
  p_service_id uuid,
  p_driver_id uuid default null,
  p_truck_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_driver uuid := p_driver_id;
  v_active_driver uuid;
begin
  if v_role not in ('administracion','operador') then
    raise exception 'Sin permiso para asignar servicios';
  end if;

  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_service.status in ('completed','cancelled') then
    raise exception 'El servicio ya está cerrado';
  end if;

  if v_service.trip_id is not null or v_service.status not in ('pending','assigned') then
    raise exception 'No se puede reasignar un servicio que ya inició su viaje';
  end if;

  if (v_driver is null) <> (p_truck_id is null) then
    raise exception 'Chofer y móvil deben asignarse juntos';
  end if;

  if p_truck_id is not null then
    if not exists (
      select 1
      from public.trucks
      where truck_id = p_truck_id
        and status = 'active'
    ) then
      raise exception 'Móvil inválido o inactivo';
    end if;

    select dl.driver_id
    into v_active_driver
    from public.daily_logs dl
    where dl.truck_id = p_truck_id
      and dl.log_date = (v_service.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
      and coalesce(dl.status, 'open') = 'open'
      and dl.hora_fin is null
    order by dl.hora_inicio desc, dl.log_id desc
    limit 1;

    if v_active_driver is not null then
      v_driver := v_active_driver;
    end if;
  end if;

  if v_driver is not null and not exists (
    select 1
    from public.users u
    join public.roles r on r.role_id = u.role_id
    where u.user_id = v_driver
      and coalesce(u.is_active, true)
      and r.name = 'chofer'
  ) then
    raise exception 'Chofer inválido o inactivo';
  end if;

  update public.operator_services
  set assigned_driver_id = v_driver,
      assigned_truck_id = p_truck_id,
      assigned_at = case when v_driver is not null then now() else null end,
      assigned_by = case when v_driver is not null then auth.uid() else null end,
      status = case
        when v_driver is null then 'pending'
        when status = 'pending' then 'assigned'
        else status
      end,
      updated_by = auth.uid()
  where service_id = p_service_id
  returning * into v_service;

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'status', v_service.status,
    'assigned_driver_id', v_service.assigned_driver_id,
    'assigned_truck_id', v_service.assigned_truck_id
  );
end;
$$;

revoke all on function public.update_operator_service_assignment(uuid, uuid, integer) from public;
revoke all on function public.update_operator_service_assignment(uuid, uuid, integer) from anon;
grant execute on function public.update_operator_service_assignment(uuid, uuid, integer) to authenticated;

create or replace function public.cancel_operator_service(
  p_service_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
begin
  if v_role not in ('administracion','operador') then
    raise exception 'Sin permiso para cancelar servicios';
  end if;

  if nullif(trim(p_reason), '') is null then
    raise exception 'Ingresá el motivo de cancelación';
  end if;

  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found or v_service.status in ('completed','cancelled') then
    raise exception 'El servicio no existe o ya está cerrado';
  end if;

  if v_service.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        notes = concat_ws(E'\n', nullif(notes, ''), 'Cancelado: ' || trim(p_reason)),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_service.trip_id
      and fecha_hora_fin is null;
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  update public.operator_services
  set status = 'cancelled',
      cancellation_reason = trim(p_reason),
      cancelled_at = now(),
      updated_by = auth.uid()
  where service_id = p_service_id
  returning * into v_service;

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'status', v_service.status,
    'trip_id', v_service.trip_id
  );
end;
$$;

revoke all on function public.cancel_operator_service(uuid, text) from public;
revoke all on function public.cancel_operator_service(uuid, text) from anon;
grant execute on function public.cancel_operator_service(uuid, text) to authenticated;

create or replace function app_private.phase3_link_remito()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_trip_id integer;
begin
  if new.trip_id is null
     and new.driver_id is not null
     and new.log_id is not null then
    select t.trip_id
    into v_trip_id
    from public.trips t
    join public.operator_services s on s.trip_id = t.trip_id
    where t.driver_id = new.driver_id
      and t.log_id = new.log_id
      and t.fecha_hora_fin is null
      and s.assigned_driver_id = new.driver_id
      and s.status in ('en_route','at_origin','loaded','at_destination')
    order by
      case
        when nullif(trim(new.nro_servicio), '') is not null
         and nullif(trim(new.nro_servicio), '') in (
           nullif(trim(s.service_order_number), ''),
           s.service_number
         )
        then 0 else 1
      end,
      t.fecha_hora_inicio desc,
      t.trip_id desc
    limit 1;

    if v_trip_id is not null then
      update public.remitos
      set trip_id = v_trip_id
      where remito_id = new.remito_id
        and trip_id is null;
      return new;
    end if;
  end if;

  if new.trip_id is not null then
    perform set_config('app.phase3_bridge', '1', true);

    update public.operator_services
    set remito_id = new.remito_id,
        updated_by = coalesce(new.driver_id, updated_by)
    where trip_id = new.trip_id
      and assigned_driver_id is not distinct from new.driver_id
      and remito_id is distinct from new.remito_id;
  end if;

  return new;
end;
$$;

revoke all on function app_private.phase3_link_remito() from public;

drop trigger if exists trg_phase3_link_remito on public.remitos;
create trigger trg_phase3_link_remito
after insert or update of trip_id, status on public.remitos
for each row
execute function app_private.phase3_link_remito();

create or replace function app_private.phase3_link_incident()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_trip_id integer;
begin
  if new.trip_id is not null
     or new.driver_id is null
     or new.log_id is null then
    return new;
  end if;

  select t.trip_id
  into v_trip_id
  from public.trips t
  join public.operator_services s on s.trip_id = t.trip_id
  where t.driver_id = new.driver_id
    and t.log_id = new.log_id
    and t.fecha_hora_fin is null
    and s.assigned_driver_id = new.driver_id
    and s.status in ('en_route','at_origin','loaded','at_destination')
  order by t.fecha_hora_inicio desc, t.trip_id desc
  limit 1;

  if v_trip_id is not null then
    update public.incidents
    set trip_id = v_trip_id
    where incident_id = new.incident_id
      and trip_id is null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.phase3_link_incident() from public;

drop trigger if exists trg_phase3_link_incident on public.incidents;
create trigger trg_phase3_link_incident
after insert on public.incidents
for each row
execute function app_private.phase3_link_incident();

create or replace function public.link_operator_service_remito(
  p_service_id uuid,
  p_remito_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_remito public.remitos%rowtype;
begin
  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_role = 'chofer' then
    if v_service.assigned_driver_id is distinct from v_uid then
      raise exception 'El servicio no está asignado a este chofer';
    end if;
  elsif v_role not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para vincular el remito';
  end if;

  if v_service.trip_id is null then
    raise exception 'El servicio todavía no tiene un viaje iniciado';
  end if;

  select *
  into v_remito
  from public.remitos
  where remito_id = p_remito_id
  for update;

  if not found then
    raise exception 'Remito inexistente';
  end if;

  if v_role = 'chofer' and v_remito.driver_id is distinct from v_uid then
    raise exception 'El remito no pertenece al chofer';
  end if;

  if v_remito.log_id is null then
    raise exception 'El remito no está asociado a una jornada';
  end if;

  if not exists (
    select 1
    from public.trips t
    where t.trip_id = v_service.trip_id
      and t.log_id = v_remito.log_id
      and t.driver_id = v_remito.driver_id
  ) then
    raise exception 'El remito no corresponde al viaje del servicio';
  end if;

  if v_remito.trip_id is null then
    update public.remitos
    set trip_id = v_service.trip_id
    where remito_id = p_remito_id
    returning * into v_remito;
  elsif v_remito.trip_id is distinct from v_service.trip_id then
    raise exception 'El remito ya está vinculado a otro viaje';
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  update public.operator_services
  set remito_id = p_remito_id,
      updated_by = coalesce(v_uid, updated_by)
  where service_id = p_service_id
  returning * into v_service;

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'trip_id', v_service.trip_id,
    'remito_id', v_service.remito_id,
    'remito_status', v_remito.status
  );
end;
$$;

revoke all on function public.link_operator_service_remito(uuid, integer) from public;
revoke all on function public.link_operator_service_remito(uuid, integer) from anon;
grant execute on function public.link_operator_service_remito(uuid, integer) to authenticated;

create or replace function public.get_driver_operator_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_role <> 'chofer' or v_uid is null then
    raise exception 'Solo los choferes pueden consultar esta cola';
  end if;

  select coalesce(jsonb_agg(row_data order by scheduled_for, created_at), '[]'::jsonb)
  into v_result
  from (
    select
      s.scheduled_for,
      s.created_at,
      jsonb_build_object(
        'service_id', s.service_id,
        'service_number', s.service_number,
        'service_order_number', s.service_order_number,
        'status', s.status,
        'priority', s.priority,
        'scheduled_for', s.scheduled_for,
        'estimated_arrival_at', s.estimated_arrival_at,
        'estimated_finish_at', s.estimated_finish_at,
        'company_name', coalesce(c.trade_name, c.legal_name),
        'concept_name', sc.name,
        'concept_icon', sc.icon,
        'customer_name', s.customer_name,
        'customer_phone', s.customer_phone,
        'vehicle_plate', s.vehicle_plate,
        'vehicle_make_model', s.vehicle_make_model,
        'origin', s.origin,
        'destination', s.destination,
        'driver_instructions', s.driver_instructions,
        'assigned_truck_id', s.assigned_truck_id,
        'truck_label', coalesce(t.numero_interno, t.plate),
        'trip_id', s.trip_id,
        'remito_id', s.remito_id,
        'journey_log_id', tr.log_id,
        'trip_started_at', tr.fecha_hora_inicio,
        'trip_finished_at', tr.fecha_hora_fin,
        'remito_number', r.nro_remito,
        'remito_status', r.status,
        'incident_count', (
          select count(*)::integer
          from public.incidents i
          where i.trip_id = s.trip_id
        ),
        'evidence_count', (
          select coalesce(sum(cardinality(i.photo_urls)), 0)::integer
          from public.incidents i
          where i.trip_id = s.trip_id
        )
      ) as row_data
    from public.operator_services s
    join public.companies c on c.company_id = s.company_id
    left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
    left join public.trucks t on t.truck_id = s.assigned_truck_id
    left join public.trips tr on tr.trip_id = s.trip_id
    left join public.remitos r on r.remito_id = s.remito_id
    where s.assigned_driver_id = v_uid
      and s.status not in ('completed','cancelled')
    order by s.scheduled_for, s.created_at
    limit 20
  ) q;

  return v_result;
end;
$$;

revoke all on function public.get_driver_operator_queue() from public;
revoke all on function public.get_driver_operator_queue() from anon;
grant execute on function public.get_driver_operator_queue() to authenticated;

create or replace function public.get_operator_service_trace(
  p_service_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_result jsonb;
begin
  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_role = 'chofer' then
    if v_service.assigned_driver_id is distinct from v_uid then
      raise exception 'Sin permiso para consultar la trazabilidad';
    end if;
  elsif v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la trazabilidad';
  end if;

  select jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'trip', case when tr.trip_id is null then null else jsonb_build_object(
      'trip_id', tr.trip_id,
      'log_id', tr.log_id,
      'started_at', tr.fecha_hora_inicio,
      'finished_at', tr.fecha_hora_fin,
      'km_traveled', tr.km_traveled,
      'sync_status', tr.sync_status
    ) end,
    'journey', case when dl.log_id is null then null else jsonb_build_object(
      'log_id', dl.log_id,
      'log_date', dl.log_date,
      'status', dl.status,
      'km_inicio', dl.km_inicio,
      'km_final', dl.km_final,
      'truck_id', dl.truck_id
    ) end,
    'remito', case when r.remito_id is null then null else jsonb_build_object(
      'remito_id', r.remito_id,
      'nro_remito', r.nro_remito,
      'status', r.status,
      'signed_at', r.firmado_at,
      'km_reales', r.km_reales,
      'photo_count', coalesce(cardinality(r.foto_urls), 0),
      'has_signature', r.firma_imagen_url is not null
    ) end,
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'incident_id', i.incident_id,
        'type', i.type,
        'severity', i.severity,
        'description', i.description,
        'location', i.location,
        'photo_count', coalesce(cardinality(i.photo_urls), 0),
        'created_at', i.created_at
      ) order by i.created_at desc)
      from public.incidents i
      where i.trip_id = tr.trip_id
    ), '[]'::jsonb)
  )
  into v_result
  from public.operator_services s
  left join public.trips tr on tr.trip_id = s.trip_id
  left join public.daily_logs dl on dl.log_id = tr.log_id
  left join public.remitos r on r.remito_id = s.remito_id
  where s.service_id = p_service_id;

  return v_result;
end;
$$;

revoke all on function public.get_operator_service_trace(uuid) from public;
revoke all on function public.get_operator_service_trace(uuid) from anon;
grant execute on function public.get_operator_service_trace(uuid) to authenticated;
