-- Restore the original list projection if Services Map V1 is rolled back.
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
          'trip_started',s.trip_id is not null,
          'driver_multi_service',app_private.multi_service_enabled_v1(s.assigned_driver_id),
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
        'estimated_finish_at',s.estimated_finish_at,'arrived_at',s.arrived_at,
        'granted_delay_minutes',s.granted_delay_minutes,
        'logistics_type',s.logistics_type,
        'outsourced_provider_name',(select op.display_name from public.outsourced_service_costs oc join public.outsourced_providers op on op.provider_id=oc.provider_id where oc.service_id=s.service_id),
        'vehicle_plate',s.vehicle_plate,'customer_phone',s.customer_phone,'customer_document',s.customer_document,
        'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,
        'origin_formatted_address',s.origin_formatted_address,
        'destination_formatted_address',s.destination_formatted_address,
        'origin_place_id',s.origin_place_id,'destination_place_id',s.destination_place_id,
        'primary_concept_id',s.primary_concept_id,
        'concept_name',sc.name,'concept_icon',sc.icon,
        'assigned_driver_id',s.assigned_driver_id,'assigned_truck_id',s.assigned_truck_id,
        'driver_name',du.full_name,'truck_label',coalesce(t.numero_interno,t.plate),
        'driver_queue_position',s.driver_queue_position,'trip_started',s.trip_id is not null,
        'driver_multi_service',app_private.multi_service_enabled_v1(s.assigned_driver_id),
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
        'estimated_finish_at',s.estimated_finish_at,'arrived_at',s.arrived_at,
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
$function$;
