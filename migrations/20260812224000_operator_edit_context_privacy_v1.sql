-- AuxiliOS · privacidad comercial del contexto de edición
-- Operaciones recibe solo datos operativos; importes, snapshots económicos y cambios quedan fuera.

create or replace function public.get_operator_service_edit_context(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_remito_status text;
  v_remito_signed_at timestamptz;
  v_company_name text;
  v_concept_name text;
  v_items jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la edición del servicio';
  end if;

  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;

  if v_service.remito_id is not null then
    select status,firmado_at into v_remito_status,v_remito_signed_at
    from public.remitos where remito_id=v_service.remito_id;
  end if;

  select coalesce(c.trade_name,c.legal_name) into v_company_name
  from public.companies c where c.company_id=v_service.company_id;
  select sc.name into v_concept_name
  from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',i.item_id,
    'concept_id',i.concept_id,
    'item_role',i.item_role,
    'service_name',i.service_name,
    'pricing_unit',i.pricing_unit,
    'quantity',i.quantity,
    'instance_code',i.instance_code,
    'sort_order',i.sort_order
  ) order by i.sort_order,i.created_at),'[]'::jsonb)
  into v_items
  from public.operator_service_items i
  where i.service_id=p_service_id;

  return jsonb_build_object(
    'service',jsonb_build_object(
      'service_id',v_service.service_id,
      'service_number',v_service.service_number,
      'status',v_service.status,
      'priority',v_service.priority,
      'company_id',v_service.company_id,
      'company_name',v_company_name,
      'billing_base_id',v_service.billing_base_id,
      'billing_setting_id',v_service.billing_setting_id,
      'service_order_number',v_service.service_order_number,
      'purchase_order_number',v_service.purchase_order_number,
      'scheduled_for',v_service.scheduled_for,
      'estimated_arrival_at',v_service.estimated_arrival_at,
      'estimated_finish_at',v_service.estimated_finish_at,
      'granted_delay_minutes',v_service.granted_delay_minutes,
      'logistics_type',v_service.logistics_type,
      'customer_name',v_service.customer_name,
      'customer_phone',v_service.customer_phone,
      'customer_email',v_service.customer_email,
      'vehicle_plate',v_service.vehicle_plate,
      'vehicle_make_model',v_service.vehicle_make_model,
      'origin',v_service.origin,
      'destination',v_service.destination,
      'origin_lat',v_service.origin_lat,
      'origin_lng',v_service.origin_lng,
      'destination_lat',v_service.destination_lat,
      'destination_lng',v_service.destination_lng,
      'origin_place_id',v_service.origin_place_id,
      'destination_place_id',v_service.destination_place_id,
      'origin_formatted_address',v_service.origin_formatted_address,
      'destination_formatted_address',v_service.destination_formatted_address,
      'primary_concept_id',v_service.primary_concept_id,
      'concept_name',v_concept_name,
      'assigned_driver_id',v_service.assigned_driver_id,
      'assigned_truck_id',v_service.assigned_truck_id,
      'estimated_distance_km',v_service.estimated_distance_km,
      'estimated_asphalt_km',v_service.estimated_asphalt_km,
      'estimated_gravel_km',v_service.estimated_gravel_km,
      'is_holiday',v_service.is_holiday,
      'operator_notes',v_service.operator_notes,
      'driver_instructions',v_service.driver_instructions,
      'route_distance_meters',v_service.route_distance_meters,
      'route_duration_seconds',v_service.route_duration_seconds,
      'route_provider',v_service.route_provider,
      'route_calculated_at',v_service.route_calculated_at,
      'route_legs',coalesce(v_service.route_legs,'[]'::jsonb),
      'trip_id',v_service.trip_id,
      'remito_id',v_service.remito_id
    ),
    'locks',jsonb_build_object(
      'closed',v_service.status in ('completed','cancelled'),
      'trip_started',v_service.trip_id is not null or v_service.status not in ('pending','assigned'),
      'remito_locked',coalesce(v_remito_status in ('firmado','cerrado_admin'),false) or v_remito_signed_at is not null,
      'remito_status',v_remito_status,
      'can_edit',v_role in ('administracion','operador') and v_service.status not in ('completed','cancelled'),
      'requires_reason',v_service.trip_id is not null or v_service.status not in ('pending','assigned')
    ),
    'items',v_items
  );
end;
$$;
