-- AuxiliOS · asignación rápida canónica desde la mesa de Servicios
-- Mantiene el lifecycle operativo: pending -> assigned y reassignment sólo mientras siga assigned.

create or replace function public.set_operator_service_assignment_v2(
  p_service_id uuid,
  p_driver_id uuid,
  p_truck_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  s public.operator_services%rowtype;
  v_old_status text;
  v_old_driver uuid;
  v_old_truck integer;
  v_driver_name text;
  v_truck_label text;
  v_old_driver_name text;
  v_old_truck_label text;
  v_active_driver uuid;
  v_driver_active_truck integer;
  v_action text;
begin
  if v_uid is null or v_role <> 'operador' then
    raise exception 'Solo el Operador puede asignar o reasignar servicios';
  end if;
  if p_driver_id is null or p_truck_id is null then
    raise exception 'Seleccioná Chofer y Móvil';
  end if;

  select * into s
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('pending','assigned') then
    raise exception 'Solo un servicio SIN ASIGNAR o ASIGNADO puede cambiar su asignación';
  end if;

  v_old_status := s.status;
  v_old_driver := s.assigned_driver_id;
  v_old_truck := s.assigned_truck_id;
  v_action := case when s.status='pending' then 'Asignación rápida' else 'Reasignación rápida' end;

  if s.status='assigned'
     and s.assigned_driver_id is not distinct from p_driver_id
     and s.assigned_truck_id is not distinct from p_truck_id then
    raise exception 'El servicio ya está asignado a ese Chofer y Móvil';
  end if;

  if not exists (
    select 1
    from public.users u
    join public.roles r on r.role_id=u.role_id
    where u.user_id=p_driver_id
      and coalesce(u.is_active,true)=true
      and r.name='chofer'
  ) then
    raise exception 'Chofer inválido o inactivo';
  end if;

  if not exists (
    select 1 from public.trucks t
    where t.truck_id=p_truck_id and t.status='active'
  ) then
    raise exception 'Móvil inválido o inactivo';
  end if;

  -- Un recurso no puede quedar operativo en dos servicios simultáneamente.
  if exists (
    select 1 from public.operator_services o
    where o.service_id<>p_service_id
      and o.status in ('assigned','en_route','at_origin','loaded','at_destination')
      and o.assigned_driver_id=p_driver_id
  ) then
    raise exception 'El Chofer ya está ocupado en otro servicio activo';
  end if;

  if exists (
    select 1 from public.operator_services o
    where o.service_id<>p_service_id
      and o.status in ('assigned','en_route','at_origin','loaded','at_destination')
      and o.assigned_truck_id=p_truck_id
  ) then
    raise exception 'El Móvil ya está ocupado en otro servicio activo';
  end if;

  -- Si existe una jornada abierta, Chofer y Móvil deben coincidir entre sí.
  select dl.driver_id into v_active_driver
  from public.daily_logs dl
  where dl.truck_id=p_truck_id
    and coalesce(dl.status,'open')='open'
    and dl.hora_fin is null
  order by dl.log_date desc,dl.hora_inicio desc,dl.log_id desc
  limit 1;
  if v_active_driver is not null and v_active_driver is distinct from p_driver_id then
    raise exception 'El Móvil tiene una jornada activa con otro Chofer';
  end if;

  select dl.truck_id into v_driver_active_truck
  from public.daily_logs dl
  where dl.driver_id=p_driver_id
    and coalesce(dl.status,'open')='open'
    and dl.hora_fin is null
  order by dl.log_date desc,dl.hora_inicio desc,dl.log_id desc
  limit 1;
  if v_driver_active_truck is not null and v_driver_active_truck is distinct from p_truck_id then
    raise exception 'El Chofer tiene una jornada activa con otro Móvil';
  end if;

  select u.full_name into v_driver_name from public.users u where u.user_id=p_driver_id;
  select coalesce(t.numero_interno,t.plate) into v_truck_label from public.trucks t where t.truck_id=p_truck_id;
  if v_old_driver is not null then select u.full_name into v_old_driver_name from public.users u where u.user_id=v_old_driver; end if;
  if v_old_truck is not null then select coalesce(t.numero_interno,t.plate) into v_old_truck_label from public.trucks t where t.truck_id=v_old_truck; end if;

  -- Si el Chofer ya había preparado un viaje antes de una reasignación, se cierra
  -- técnicamente ese viaje y el nuevo Chofer generará el suyo al abrir el remito.
  if s.status='assigned' and s.trip_id is not null then
    update public.trips
    set fecha_hora_fin=coalesce(fecha_hora_fin,now()),
        notes=concat_ws(E'\n',nullif(notes,''),'Reasignado desde la mesa de Servicios'),
        received_at=now(),sync_status='synced'
    where trip_id=s.trip_id and fecha_hora_fin is null;
  end if;

  perform set_config('app.assignment_reason',case when s.status='pending' then 'quick_assign' else 'quick_reassign' end,true);
  perform set_config('app.assignment_notes','Cambio confirmado desde Estado en la mesa de Servicios',true);

  update public.operator_services
  set status='assigned',
      assigned_driver_id=p_driver_id,
      assigned_truck_id=p_truck_id,
      assigned_at=now(),
      assigned_by=v_uid,
      trip_id=case when s.status='assigned' then null else trip_id end,
      remito_id=case when s.status='assigned' then null else remito_id end,
      updated_by=v_uid,
      updated_at=now()
  where service_id=p_service_id
  returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,details,created_by
  ) values (
    p_service_id,
    'assignment',
    v_old_status,
    'assigned',
    concat_ws(' · ',v_action,
      case when v_old_driver is not null then 'Chofer: '||coalesce(v_old_driver_name,v_old_driver::text)||' → '||coalesce(v_driver_name,p_driver_id::text) else 'Chofer: '||coalesce(v_driver_name,p_driver_id::text) end,
      case when v_old_truck is not null then 'Móvil: '||coalesce(v_old_truck_label,v_old_truck::text)||' → '||coalesce(v_truck_label,p_truck_id::text) else 'Móvil: '||coalesce(v_truck_label,p_truck_id::text) end
    ),
    jsonb_build_object(
      'old_driver_id',v_old_driver,'old_truck_id',v_old_truck,
      'new_driver_id',p_driver_id,'new_truck_id',p_truck_id,
      'source','status_quick_action'
    ),
    v_uid
  );

  return jsonb_build_object(
    'service_id',s.service_id,
    'service_number',s.service_number,
    'status',s.status,
    'assigned_driver_id',s.assigned_driver_id,
    'assigned_truck_id',s.assigned_truck_id,
    'driver_name',v_driver_name,
    'truck_label',v_truck_label
  );
end;
$function$;

revoke all on function public.set_operator_service_assignment_v2(uuid,uuid,integer) from public,anon;
grant execute on function public.set_operator_service_assignment_v2(uuid,uuid,integer) to authenticated;
