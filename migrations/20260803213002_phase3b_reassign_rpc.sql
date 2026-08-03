-- AuxiliOS Phase 3B · part 3/7
create or replace function public.reassign_operator_service(
  p_service_id uuid,
  p_driver_id uuid,
  p_truck_id integer,
  p_reason_code text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_driver_name text;
  v_truck_label text;
  v_active_driver uuid;
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para reasignar servicios';
  end if;
  if p_driver_id is null or p_truck_id is null then
    raise exception 'Seleccioná el nuevo chofer y el nuevo móvil';
  end if;
  if nullif(btrim(p_reason_code), '') is null then
    raise exception 'Seleccioná el motivo de la reasignación';
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
  if v_service.remito_id is not null then
    raise exception 'El servicio ya tiene un remito vinculado y no puede reasignarse';
  end if;
  if v_service.assigned_driver_id is not distinct from p_driver_id
     and v_service.assigned_truck_id is not distinct from p_truck_id then
    raise exception 'El servicio ya está asignado a ese chofer y móvil';
  end if;

  if not exists (
    select 1
    from public.users u
    join public.roles r on r.role_id = u.role_id
    where u.user_id = p_driver_id
      and coalesce(u.is_active, true)
      and r.name = 'chofer'
  ) then
    raise exception 'Chofer inválido o inactivo';
  end if;

  if not exists (
    select 1
    from public.trucks t
    where t.truck_id = p_truck_id
      and t.status = 'active'
  ) then
    raise exception 'Móvil inválido o inactivo';
  end if;

  select dl.driver_id
  into v_active_driver
  from public.daily_logs dl
  where dl.truck_id = p_truck_id
    and coalesce(dl.status, 'open') = 'open'
    and dl.hora_fin is null
  order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
  limit 1;

  if v_active_driver is not null and v_active_driver is distinct from p_driver_id then
    raise exception 'El móvil tiene una jornada activa con otro chofer';
  end if;

  if v_service.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Reasignado: ' || btrim(p_reason_code),
          nullif(btrim(p_notes), '')
        ),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_service.trip_id
      and fecha_hora_fin is null;
  end if;

  perform set_config('app.phase3_bridge', '1', true);
  perform set_config('app.assignment_reason', btrim(p_reason_code), true);
  perform set_config('app.assignment_notes', coalesce(btrim(p_notes), ''), true);

  update public.operator_services
  set assigned_driver_id = p_driver_id,
      assigned_truck_id = p_truck_id,
      assigned_at = now(),
      assigned_by = v_uid,
      status = 'assigned',
      trip_id = null,
      remito_id = null,
      completed_at = null,
      cancelled_at = null,
      cancellation_reason = null,
      driver_notes = null,
      updated_by = v_uid
  where service_id = p_service_id
  returning * into v_service;

  select u.full_name into v_driver_name
  from public.users u where u.user_id = p_driver_id;
  select coalesce(t.numero_interno, t.plate) into v_truck_label
  from public.trucks t where t.truck_id = p_truck_id;

  insert into public.operator_service_events(
    service_id, event_type, from_status, to_status, notes, created_by
  )
  values (
    p_service_id,
    'reassigned',
    null,
    'assigned',
    concat_ws(
      ' · ',
      'Nuevo chofer: ' || coalesce(v_driver_name, p_driver_id::text),
      'Móvil: ' || coalesce(v_truck_label, p_truck_id::text),
      'Motivo: ' || btrim(p_reason_code),
      nullif(btrim(p_notes), '')
    ),
    v_uid
  );

  return jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'assigned_driver_id', v_service.assigned_driver_id,
    'assigned_truck_id', v_service.assigned_truck_id
  );
end;
$function$;
