-- Historial de Servicios completo (v1).
-- La mesa trae los servicios con list_operator_services(p_limit<=1000) y el Historial se filtraba en el navegador,
-- así que lo anterior a los últimos 500 servicios no aparecía. Esta función nueva trae sólo los servicios cerrados
-- (finalizados y anulados) de un período, por tandas, con la misma forma de fila que list_operator_services.
-- Sólo lectura. No modifica list_operator_services ni ninguna otra función.
-- Para administración/facturación no viaja pricing_snapshot ni billing_snapshot (la pantalla no los usa y son
-- un tercio del peso de cada fila).
create or replace function public.list_operator_service_history_v1(
  p_from date default null, p_to date default null, p_limit integer default 500, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare
  v_role text := app_private.current_auxilios_role();
  v_limit integer := least(greatest(coalesce(p_limit,500),1),1000);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_total integer; v_items jsonb;
begin
  if auth.uid() is null or coalesce(v_role,'') not in ('administracion','facturacion','operador','supervision') then
    raise exception 'Sin permiso para consultar el historial de servicios';
  end if;
  -- Día local de Argentina, igual que el filtro de período de la pantalla.
  select count(*) into v_total from public.operator_services s
   where s.status in ('completed','cancelled')
     and (p_from is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_from)
     and (p_to is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_to);
  if v_role in ('administracion','facturacion') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc, service_id),'[]'::jsonb) into v_items
    from (
      select s.scheduled_for, s.service_id,
        (to_jsonb(s)-'pricing_snapshot'-'billing_snapshot')||jsonb_build_object(
          'company_name',coalesce(c.trade_name,c.legal_name),
          'billing_base_id',s.billing_base_id,
          'branch_id',coalesce(s.billing_base_id,s.branch_id),
          'branch_name',coalesce(bb.name,lb.name),
          'billing_base_name',coalesce(bb.name,lb.name),
          'single_address',coalesce(sc.single_address,false),
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
        select coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
            filter (where oe.customer_payment_method is not null),array[]::text[]) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual')))
      ) excess on true
      where s.status in ('completed','cancelled')
        and (p_from is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_from)
        and (p_to is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_to)
      order by s.scheduled_for desc, s.service_id
      limit v_limit offset v_offset
    ) q;
  else
    select coalesce(jsonb_agg(row_data order by scheduled_for desc, service_id),'[]'::jsonb) into v_items
    from (
      select s.scheduled_for, s.service_id, jsonb_build_object(
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
      ) || jsonb_build_object(
        'origin_lat',s.origin_lat,'origin_lng',s.origin_lng,
        'destination_lat',s.destination_lat,'destination_lng',s.destination_lng,
        'single_address',coalesce(sc.single_address,false)
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
        select coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
            filter (where oe.customer_payment_method is not null),array[]::text[]) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual')))
      ) excess on true
      where s.status in ('completed','cancelled')
        and (p_from is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_from)
        and (p_to is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_to)
      order by s.scheduled_for desc, s.service_id
      limit v_limit offset v_offset
    ) q;
  end if;
  return jsonb_build_object('items',v_items,'total',v_total,'offset',v_offset,
    'has_more',v_offset+jsonb_array_length(v_items)<v_total);
end;
$f$;
revoke all on function public.list_operator_service_history_v1(date,date,integer,integer) from public,anon;
grant execute on function public.list_operator_service_history_v1(date,date,integer,integer) to authenticated;
