-- An explicit recommendation can only claim an unassigned service.
-- The canonical assignment RPC remains responsible for all operational validations/events.
create or replace function public.assign_recommended_operator_service_v1(
 p_service_id uuid, p_driver_id uuid, p_truck_id integer, p_expected_chain uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.operator_services%rowtype; actual_chain uuid[];
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion')
 or not exists(select 1 from public.users where user_id=auth.uid() and coalesce(is_active,true)) then
  raise exception 'Sin permiso para asignar servicios';
 end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found or s.status <> 'pending' or s.assigned_driver_id is not null or s.assigned_truck_id is not null
 or coalesce(s.driver_activated,false) or s.logistics_type='third_party' then
  raise exception 'El servicio cambió. Solo se puede recomendar para un servicio sin asignar';
 end if;
 if not app_private.multi_service_enabled_v1(p_driver_id) then raise exception 'El chofer no admite sumar servicios a la cadena'; end if;
 perform 1 from public.operator_services o where o.assigned_driver_id=p_driver_id
 and o.status in ('assigned','en_route','at_origin','loaded','at_destination') order by o.service_id for update;
 select array_agg(o.service_id order by o.driver_queue_position,o.service_id) into actual_chain
 from public.operator_services o where o.assigned_driver_id=p_driver_id
 and o.status in ('assigned','en_route','at_origin','loaded','at_destination')
 and not app_private.service_driver_done_v1(o.service_id);
 if coalesce(cardinality(actual_chain),0)=0 or actual_chain is distinct from p_expected_chain
 or exists(select 1 from public.operator_services o where o.service_id=any(actual_chain) and o.assigned_truck_id is distinct from p_truck_id) then
  raise exception 'La cadena cambió. Recalculá la recomendación';
 end if;
 return public.set_operator_service_assignment_v2(p_service_id,p_driver_id,p_truck_id);
end;
$$;
revoke all on function public.assign_recommended_operator_service_v1(uuid,uuid,integer,uuid[]) from public,anon;
grant execute on function public.assign_recommended_operator_service_v1(uuid,uuid,integer,uuid[]) to authenticated;
