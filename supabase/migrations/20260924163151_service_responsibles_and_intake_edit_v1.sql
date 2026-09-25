begin;
-- Historical responsibility is display data, never a current resource reservation.
create or replace function app_private.service_responsibles_v1(s public.operator_services)
returns table(driver_id uuid,truck_id integer)
language sql stable set search_path='' as $$
 select coalesce(s.assigned_driver_id,s.activation_driver_id,a.driver_id),
        coalesce(s.assigned_truck_id,s.activation_truck_id,a.truck_id)
 from (select 1) singleton
 left join lateral (
   select h.driver_id,h.truck_id from public.operator_service_assignments h
   where h.service_id=s.service_id and s.status in ('completed','cancelled')
   order by h.assignment_sequence desc limit 1
 ) a on true;
$$;
revoke all on function app_private.service_responsibles_v1(public.operator_services) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.list_operator_services(p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,300),1),1000);
  v_result jsonb;
begin
  if v_role in ('administracion','facturacion') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,
        to_jsonb(s)||jsonb_build_object(
          'company_name',coalesce(c.trade_name,c.legal_name),
          'billing_base_id',s.billing_base_id,
          'branch_id',coalesce(s.billing_base_id,s.branch_id),
          'branch_name',coalesce(bb.name,lb.name),
          'billing_base_name',coalesce(bb.name,lb.name),
          'concept_name',sc.name,
          'concept_icon',sc.icon,
          'driver_name',du.full_name,
          'truck_label',coalesce(t.numero_interno,t.plate),
          'customer_amount_due',coalesce(excess.amount_due,0),
          'customer_payment_methods',coalesce(excess.payment_methods,array[]::text[])
        ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join lateral app_private.service_responsibles_v1(s) crew on true
      left join public.users du on du.user_id=crew.driver_id
      left join public.trucks t on t.truck_id=crew.truck_id
      left join lateral (
        select
          coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(
            array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
              filter (where oe.customer_payment_method is not null),
            array[]::text[]
          ) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual'))
        )
      ) excess on true
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  elsif v_role in ('operador','supervision') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,jsonb_build_object(
        'service_id',s.service_id,'service_number',s.service_number,'status',s.status,
        'priority',s.priority,'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name),
        'billing_base_id',s.billing_base_id,
        'branch_id',coalesce(s.billing_base_id,s.branch_id),
        'branch_name',coalesce(bb.name,lb.name),
        'billing_base_name',coalesce(bb.name,lb.name),
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'estimated_arrival_at',s.estimated_arrival_at,
        'estimated_finish_at',s.estimated_finish_at,
        'granted_delay_minutes',s.granted_delay_minutes,
        'logistics_type',s.logistics_type,
        'vehicle_plate',s.vehicle_plate,
        'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,
        'origin_formatted_address',s.origin_formatted_address,
        'destination_formatted_address',s.destination_formatted_address,
        'origin_place_id',s.origin_place_id,'destination_place_id',s.destination_place_id,
        'primary_concept_id',s.primary_concept_id,
        'concept_name',sc.name,'concept_icon',sc.icon,
        'assigned_driver_id',s.assigned_driver_id,'assigned_truck_id',s.assigned_truck_id,
        'driver_name',du.full_name,'truck_label',coalesce(t.numero_interno,t.plate),
        'estimated_distance_km',s.estimated_distance_km,
        'driver_instructions',s.driver_instructions,'operator_notes',s.operator_notes,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,
        'created_at',s.created_at,'updated_at',s.updated_at,
        'customer_amount_due',coalesce(excess.amount_due,0),
        'customer_payment_methods',coalesce(excess.payment_methods,array[]::text[])
      ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join lateral app_private.service_responsibles_v1(s) crew on true
      left join public.users du on du.user_id=crew.driver_id
      left join public.trucks t on t.truck_id=crew.truck_id
      left join lateral (
        select
          coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(
            array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
              filter (where oe.customer_payment_method is not null),
            array[]::text[]
          ) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual'))
        )
      ) excess on true
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  elsif v_role='chofer' then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,jsonb_build_object(
        'service_id',s.service_id,'service_number',s.service_number,'status',s.status,
        'priority',s.priority,'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name),
        'billing_base_id',s.billing_base_id,
        'branch_id',coalesce(s.billing_base_id,s.branch_id),
        'branch_name',coalesce(bb.name,lb.name),'billing_base_name',coalesce(bb.name,lb.name),
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'estimated_arrival_at',s.estimated_arrival_at,
        'estimated_finish_at',s.estimated_finish_at,
        'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,
        'origin_formatted_address',s.origin_formatted_address,
        'destination_formatted_address',s.destination_formatted_address,
        'primary_concept_id',s.primary_concept_id,
        'concept_name',sc.name,'concept_icon',sc.icon,
        'assigned_driver_id',s.assigned_driver_id,'assigned_truck_id',s.assigned_truck_id,
        'truck_label',coalesce(t.numero_interno,t.plate),
        'driver_instructions',s.driver_instructions,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,
        'created_at',s.created_at,'updated_at',s.updated_at
      ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join lateral app_private.service_responsibles_v1(s) crew on true
      left join public.trucks t on t.truck_id=crew.truck_id
      where s.assigned_driver_id=v_uid
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  else
    raise exception 'Sin permiso para consultar servicios';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_operator_service_handoff_context_v2(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb; s public.operator_services%rowtype; changes jsonb; signed boolean; crew record;
begin
 ctx:=public.get_operator_service_handoff_context_v1(p_service_id);
 select * into s from public.operator_services where service_id=p_service_id;
 select * into crew from app_private.service_responsibles_v1(s);
 signed:=ctx#>>'{service,remito_status}'='firmado';
 select coalesce(jsonb_agg(jsonb_build_object('at',c.changed_at,'by',u.full_name,'fields',c.changed_fields,'before',(select jsonb_object_agg(key,value) from jsonb_each(c.before_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode'])),'after',(select jsonb_object_agg(key,value) from jsonb_each(c.after_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode']))) order by c.changed_at desc),'[]')
 into changes from (select * from public.operator_service_changes where service_id=p_service_id order by changed_at desc limit 30) c left join public.users u on u.user_id=c.changed_by
 where c.service_id=p_service_id and c.remito_id=s.remito_id;
 ctx:=jsonb_set(ctx,'{service}',(ctx->'service')||jsonb_build_object('driver_activated',s.driver_activated,'activation_driver_id',s.activation_driver_id,'activation_truck_id',s.activation_truck_id,'activation_billing',s.activation_billing,'activation_billing_reason',s.activation_billing_reason,'activated_at',s.activated_at,'cancellation_reason_code',s.cancellation_reason_code,'cancellation_reason_detail',s.cancellation_reason_detail,'responsible_driver_id',crew.driver_id,'responsible_truck_id',crew.truck_id,'driver_name',(select full_name from public.users where user_id=crew.driver_id),'truck_label',(select concat_ws(' · ',numero_interno,plate) from public.trucks where truck_id=crew.truck_id)));
 return ctx||jsonb_build_object('administrative_edit',coalesce(signed,false),
 'administrative_revision',s.administrative_revision,'administrative_changes',changes,
 'administrative_commercial',case when signed then app_private.service_administrative_commercial_v1(p_service_id) end,
 'has_administrative_corrections',s.administrative_revision>0,
 'locks',(ctx->'locks')||case when signed then jsonb_build_object('requires_reason',false,'can_edit',s.status not in ('completed','cancelled') and s.billing_status<>'invoiced','customer_locked',true) else '{}'::jsonb end);
end; $function$;

commit;
