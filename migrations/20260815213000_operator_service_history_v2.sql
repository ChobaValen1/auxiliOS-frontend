-- AuxiliOS · Historial operativo canónico v2
create or replace function public.get_operator_service_history_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  v_events jsonb;
  v_assignments jsonb;
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;

  if v_role='chofer' then
    if not exists(select 1 from public.operator_service_assignments a where a.service_id=p_service_id and a.driver_id=v_uid) then
      raise exception 'Sin permiso para consultar este historial';
    end if;
  elsif v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar este historial';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',e.event_id,
    'event_type',e.event_type,
    'from_status',e.from_status,
    'to_status',e.to_status,
    'notes',e.notes,
    'created_at',e.created_at,
    'created_by',e.created_by,
    'created_by_name',u.full_name,
    'details',coalesce(e.details,'{}'::jsonb)
  ) order by e.created_at,e.event_id),'[]'::jsonb)
  into v_events
  from public.operator_service_events e
  left join public.users u on u.user_id=e.created_by
  where e.service_id=p_service_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',a.assignment_id,
    'sequence',a.assignment_sequence,
    'status',a.status,
    'driver_id',a.driver_id,
    'driver_name',du.full_name,
    'truck_id',a.truck_id,
    'truck_label',coalesce(t.numero_interno,t.plate),
    'assigned_at',a.assigned_at,
    'assigned_by',a.assigned_by,
    'assigned_by_name',au.full_name,
    'released_at',a.released_at,
    'released_by',a.released_by,
    'released_by_name',ru.full_name,
    'release_reason_code',a.release_reason_code,
    'release_notes',a.release_notes
  ) order by a.assignment_sequence),'[]'::jsonb)
  into v_assignments
  from public.operator_service_assignments a
  left join public.users du on du.user_id=a.driver_id
  left join public.users au on au.user_id=a.assigned_by
  left join public.users ru on ru.user_id=a.released_by
  left join public.trucks t on t.truck_id=a.truck_id
  where a.service_id=p_service_id;

  return jsonb_build_object(
    'service_id',s.service_id,
    'service_number',s.service_number,
    'service_order_number',s.service_order_number,
    'vehicle_plate',s.vehicle_plate,
    'status',s.status,
    'arrived_at',s.arrived_at,
    'arrival_source',s.arrival_source,
    'arrival_reason_code',s.arrival_reason_code,
    'completed_at',s.completed_at,
    'cancelled_at',s.cancelled_at,
    'cancellation_reason',s.cancellation_reason,
    'events',v_events,
    'assignments',v_assignments
  );
end;
$function$;

revoke all on function public.get_operator_service_history_v2(uuid) from public, anon;
grant execute on function public.get_operator_service_history_v2(uuid) to authenticated;
