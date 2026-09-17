-- AuxiliOS · Operaciones: historial, pendientes y activados del Chofer.
begin;

drop policy if exists audit_events_admin_read on public.audit_events;
create policy audit_events_admin_read on public.audit_events for select to authenticated
using (public.current_auxilios_role() in ('administracion','supervision','operador'));

create or replace function public.leave_operator_service_review_pending_v1(p_service_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operator_services%rowtype; v_note text:=btrim(coalesce(p_note,''));
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador') then raise exception 'Sin permiso para dejar pendiente'; end if;
 if length(v_note)<3 then raise exception 'Indicá una nota para dejar pendiente'; end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found then raise exception 'Servicio inexistente'; end if;
 if s.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado'; end if;
 insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
 values(p_service_id,'remito_review_pending',s.status,s.status,v_note,auth.uid(),jsonb_build_object('actor_role',app_private.current_auxilios_role()));
 return jsonb_build_object('service_id',p_service_id,'status',s.status,'pending',true);
end; $$;
revoke all on function public.leave_operator_service_review_pending_v1(uuid,text) from public,anon;
grant execute on function public.leave_operator_service_review_pending_v1(uuid,text) to authenticated;

create or replace function public.list_driver_activated_services_v1(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=app_private.current_auxilios_role(); result jsonb;
begin
 if auth.uid() is null or coalesce(v_role,'') not in ('administracion','operador','supervision') then raise exception 'Sin permiso para consultar servicios activados'; end if;
 select coalesce(jsonb_agg(row_data order by cancelled_at desc),'[]'::jsonb) into result from (
  select s.cancelled_at,to_jsonb(s)||jsonb_build_object(
   'company_name',coalesce(c.trade_name,c.legal_name),'billing_base_name',bb.name,'concept_name',sc.name,
   'driver_name',du.full_name,'truck_label',coalesce(t.numero_interno,t.plate),'driver_activated',true)
  as row_data
  from public.operator_services s
  join public.companies c on c.company_id=s.company_id
  left join public.billing_bases bb on bb.base_id=s.billing_base_id
  left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
  left join public.users du on du.user_id=s.assigned_driver_id
  left join public.trucks t on t.truck_id=s.assigned_truck_id
  where s.status='cancelled' and s.cancellation_reason ilike 'ACTIVADO%'
  order by s.cancelled_at desc limit least(greatest(coalesce(p_limit,200),1),500)
 ) q;
 return result;
end; $$;
revoke all on function public.list_driver_activated_services_v1(integer) from public,anon;
grant execute on function public.list_driver_activated_services_v1(integer) to authenticated;

commit;
