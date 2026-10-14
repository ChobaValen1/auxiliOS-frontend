begin;
create or replace function public.get_operator_service_charge_review_report_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operator_services%rowtype; draft jsonb:='{}'; final_decisions jsonb:='{}'; note text:='';
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion','supervision','facturacion') then
   raise exception 'Sin permiso para consultar la revisión';
 end if;
 select * into s from public.operator_services where service_id=p_service_id;
 if not found then raise exception 'Servicio inexistente'; end if;
 select coalesce(e.details->'decisions','{}'),e.notes into draft,note
 from public.operator_service_events e
 where e.service_id=p_service_id and e.event_type='remito_review_pending'
 and e.created_at>=coalesce((select max(c.created_at) from public.operator_service_events c where c.service_id=p_service_id and c.event_type='driver_remito_corrected'),'-infinity'::timestamptz)
 order by e.created_at desc,e.event_id desc limit 1;
 select coalesce(jsonb_object_agg(key,value||jsonb_build_object('saved',true)),'{}') into draft from jsonb_each(coalesce(draft,'{}'));
 select coalesce(jsonb_object_agg(key,result),'{}') into final_decisions from (
   select distinct on (coalesce('toll:'||r.toll_report_id::text,'excess:'||r.excess_report_id::text))
     coalesce('toll:'||r.toll_report_id::text,'excess:'||r.excess_report_id::text) as key,
     jsonb_build_object('value',r.decision,'reason',r.reason,'saved',true,'reviewed_at',r.reviewed_at) as result
   from public.operator_service_document_addon_reviews r
   where r.service_id=p_service_id and r.remito_id=s.remito_id and (r.toll_report_id is not null or r.excess_report_id is not null)
   order by coalesce('toll:'||r.toll_report_id::text,'excess:'||r.excess_report_id::text),r.reviewed_at desc,r.review_line_id desc
 ) decisions;
 return jsonb_build_object('decisions',case when s.status in ('completed','cancelled') then final_decisions else draft||final_decisions end,
   'note',case when s.status in ('completed','cancelled') then '' else coalesce(note,'') end);
end; $$;
revoke all on function public.get_operator_service_charge_review_report_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_charge_review_report_v1(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.get_operator_service_handoff_context_v2(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb; s public.operator_services%rowtype; changes jsonb; signed boolean;
begin
 ctx:=public.get_operator_service_handoff_context_v1(p_service_id);
 select * into s from public.operator_services where service_id=p_service_id;
 signed:=ctx#>>'{service,remito_status}'='firmado';
 select coalesce(jsonb_agg(jsonb_build_object('at',c.changed_at,'by',u.full_name,'fields',c.changed_fields,'before',(select jsonb_object_agg(key,value) from jsonb_each(c.before_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode'])),'after',(select jsonb_object_agg(key,value) from jsonb_each(c.after_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode']))) order by c.changed_at desc),'[]')
 into changes from (select * from public.operator_service_changes where service_id=p_service_id order by changed_at desc limit 30) c left join public.users u on u.user_id=c.changed_by
 where c.service_id=p_service_id and c.remito_id=s.remito_id;
 ctx:=jsonb_set(ctx,'{service}',(ctx->'service')||jsonb_build_object('driver_activated',s.driver_activated,'activation_driver_id',s.activation_driver_id,'activation_truck_id',s.activation_truck_id,'activation_billing',s.activation_billing,'activation_billing_reason',s.activation_billing_reason,'activated_at',s.activated_at,'cancellation_reason_code',s.cancellation_reason_code,'cancellation_reason_detail',s.cancellation_reason_detail,'driver_name',(select full_name from public.users where user_id=coalesce(s.activation_driver_id,s.assigned_driver_id)),'truck_label',(select concat_ws(' · ',numero_interno,plate) from public.trucks where truck_id=coalesce(s.activation_truck_id,s.assigned_truck_id))));
 return ctx||jsonb_build_object('administrative_edit',coalesce(signed,false),
 'administrative_revision',s.administrative_revision,'administrative_changes',changes,
 'administrative_commercial',case when signed then app_private.service_administrative_commercial_v1(p_service_id) end,
 'has_administrative_corrections',s.administrative_revision>0,
 'locks',(ctx->'locks')||case when signed then jsonb_build_object('requires_reason',false,'can_edit',s.status not in ('completed','cancelled') and s.billing_status<>'invoiced','customer_locked',true) else '{}'::jsonb end);
end; $function$;

commit;
