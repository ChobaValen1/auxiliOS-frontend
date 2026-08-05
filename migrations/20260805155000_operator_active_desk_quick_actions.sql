-- AuxiliOS · Mesa activa · Transiciones rápidas protegidas

create or replace function public.transition_operator_service_from_desk(
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
  v_log public.daily_logs%rowtype;
  v_trip public.trips%rowtype;
  v_trip_id integer;
  v_other_trip integer;
  v_service_type text;
  v_remito public.remitos%rowtype;
  v_note text := nullif(btrim(p_note), '');
  v_allowed boolean := false;
  v_is_correction boolean := false;
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para modificar el estado de servicios';
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

  v_allowed :=
    (v_service.status = 'assigned' and p_to_status = 'en_route')
    or (v_service.status = 'en_route' and p_to_status = 'at_origin')
    or (v_service.status = 'at_origin' and p_to_status in ('loaded','completed','en_route'))
    or (v_service.status = 'loaded' and p_to_status in ('at_destination','completed','at_origin'))
    or (v_service.status = 'at_destination' and p_to_status in ('completed','loaded'));

  if not v_allowed then
    raise exception 'Transición de estado inválida';
  end if;

  v_is_correction :=
    (v_service.status = 'at_origin' and p_to_status = 'en_route')
    or (v_service.status = 'loaded' and p_to_status = 'at_origin')
    or (v_service.status = 'at_destination' and p_to_status = 'loaded');

  if v_is_correction and coalesce(length(v_note), 0) < 5 then
    raise exception 'Ingresá un motivo de corrección de al menos 5 caracteres';
  end if;

  if v_service.assigned_driver_id is null or v_service.assigned_truck_id is null then
    raise exception 'El servicio necesita chofer y móvil asignados';
  end if;

  if v_service.status = 'assigned' then
    select dl.*
    into v_log
    from public.daily_logs dl
    where dl.driver_id = v_service.assigned_driver_id
      and dl.truck_id = v_service.assigned_truck_id
      and coalesce(dl.status, 'open') = 'open'
      and dl.hora_fin is null
    order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
    limit 1;

    if not found then
      raise exception 'JORNADA_REQUERIDA: el chofer debe iniciar una jornada con el móvil asignado antes de marcar En camino';
    end if;

    select t.trip_id
    into v_other_trip
    from public.trips t
    where t.driver_id = v_service.assigned_driver_id
      and t.fecha_hora_inicio is not null
      and t.fecha_hora_fin is null
      and (v_service.trip_id is null or t.trip_id <> v_service.trip_id)
    order by t.fecha_hora_inicio desc
    limit 1;

    if v_other_trip is not null then
      raise exception 'VIAJE_EN_CURSO: el chofer ya tiene otro viaje en curso';
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
        v_service.assigned_driver_id,
        coalesce(nullif(btrim(v_service.service_order_number), ''), v_service.service_number),
        nullif(btrim(v_service.vehicle_plate), ''),
        coalesce(nullif(btrim(v_service_type), ''), 'Servicio'),
        v_service.origin,
        v_service.destination,
        now(),
        concat_ws(E'\n', 'Creado desde ' || v_service.service_number, v_note),
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
        and driver_id = v_service.assigned_driver_id
        and log_id = v_log.log_id
        and fecha_hora_fin is null
      for update;

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
      and driver_id = v_service.assigned_driver_id
    for update;

    if not found then
      raise exception 'El viaje vinculado no pertenece al chofer asignado';
    end if;

    if v_trip.fecha_hora_fin is not null and p_to_status <> 'completed' then
      raise exception 'El viaje vinculado ya está cerrado';
    end if;

    v_trip_id := v_trip.trip_id;
  end if;

  if p_to_status = 'completed' then
    if v_service.remito_id is null then
      raise exception 'REMITO_REQUERIDO: el servicio necesita un remito firmado o cerrado por administración antes de finalizar';
    end if;

    select *
    into v_remito
    from public.remitos
    where remito_id = v_service.remito_id
    for share;

    if not found then
      raise exception 'No se encontró el remito vinculado';
    end if;

    if coalesce(v_remito.status, 'pendiente') not in ('firmado','cerrado_admin') then
      raise exception 'REMITO_INCOMPLETO: el remito debe estar firmado o cerrado por administración';
    end if;

    if v_remito.trip_id is distinct from v_trip_id then
      raise exception 'El remito no corresponde al viaje del servicio';
    end if;

    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        km_traveled = coalesce(v_remito.km_reales, km_traveled),
        notes = concat_ws(E'\n', nullif(notes, ''), v_note),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_trip_id;
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  update public.operator_services
  set status = p_to_status,
      trip_id = coalesce(trip_id, v_trip_id),
      completed_at = case when p_to_status = 'completed' then now() else null end,
      updated_by = v_uid
  where service_id = p_service_id
  returning * into v_service;

  if v_note is not null then
    insert into public.operator_service_events(
      service_id,
      event_type,
      from_status,
      to_status,
      notes,
      created_by
    )
    values (
      p_service_id,
      case when v_is_correction then 'desk_status_correction' else 'desk_status_note' end,
      case
        when p_to_status = 'en_route' and v_is_correction then 'at_origin'
        when p_to_status = 'at_origin' and v_is_correction then 'loaded'
        when p_to_status = 'loaded' and v_is_correction then 'at_destination'
        else null
      end,
      p_to_status,
      v_note,
      v_uid
    );
  end if;

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'trip_id', v_service.trip_id,
    'remito_id', v_service.remito_id,
    'completed_at', v_service.completed_at
  );
end;
$$;

revoke all on function public.transition_operator_service_from_desk(uuid, text, text) from public;
revoke all on function public.transition_operator_service_from_desk(uuid, text, text) from anon;
grant execute on function public.transition_operator_service_from_desk(uuid, text, text) to authenticated;

create or replace function public.void_operator_service_from_desk(
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
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para anular servicios';
  end if;

  if coalesce(length(v_reason), 0) < 5 then
    raise exception 'Ingresá un motivo de anulación de al menos 5 caracteres';
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

  if v_service.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        notes = concat_ws(E'\n', nullif(notes, ''), 'Anulado: ' || v_reason),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_service.trip_id
      and fecha_hora_fin is null;
  end if;

  perform set_config('app.phase3_bridge', '1', true);

  update public.operator_services
  set status = 'cancelled',
      cancellation_reason = 'ANULADO: ' || v_reason,
      cancelled_at = now(),
      updated_by = v_uid
  where service_id = p_service_id
  returning * into v_service;

  insert into public.operator_service_events(
    service_id,
    event_type,
    from_status,
    to_status,
    notes,
    created_by
  )
  values (
    p_service_id,
    'annulled',
    null,
    'cancelled',
    v_reason,
    v_uid
  );

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'annulled', true,
    'cancelled_at', v_service.cancelled_at
  );
end;
$$;

revoke all on function public.void_operator_service_from_desk(uuid, text) from public;
revoke all on function public.void_operator_service_from_desk(uuid, text) from anon;
grant execute on function public.void_operator_service_from_desk(uuid, text) to authenticated;

comment on function public.transition_operator_service_from_desk(uuid, text, text)
  is 'Transiciones rápidas de la Mesa activa para Administración, Operador y Supervisión.';

comment on function public.void_operator_service_from_desk(uuid, text)
  is 'Anulación lógica de servicios creados por error, conservando viaje e historial.';
