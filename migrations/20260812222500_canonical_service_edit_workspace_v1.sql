-- AuxiliOS · edición canónica de Servicios
-- Un mismo contrato de datos para Crear/Editar, sin exponer importes al operador.

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
  v_changes jsonb;
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
  select sc.name into v_concept_name from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',i.item_id,'concept_id',i.concept_id,'item_role',i.item_role,
    'service_name',i.service_name,'pricing_unit',i.pricing_unit,'quantity',i.quantity,
    'instance_code',i.instance_code,'sort_order',i.sort_order
  ) order by i.sort_order,i.created_at),'[]'::jsonb)
  into v_items from public.operator_service_items i where i.service_id=p_service_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.changed_at desc),'[]'::jsonb)
  into v_changes from (
    select * from public.operator_service_changes where service_id=p_service_id order by changed_at desc limit 20
  ) x;

  return jsonb_build_object(
    'service',jsonb_build_object(
      'service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,
      'priority',v_service.priority,'company_id',v_service.company_id,'company_name',v_company_name,
      'billing_base_id',v_service.billing_base_id,'billing_setting_id',v_service.billing_setting_id,
      'service_order_number',v_service.service_order_number,'purchase_order_number',v_service.purchase_order_number,
      'scheduled_for',v_service.scheduled_for,'estimated_arrival_at',v_service.estimated_arrival_at,
      'estimated_finish_at',v_service.estimated_finish_at,'granted_delay_minutes',v_service.granted_delay_minutes,
      'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,
      'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,
      'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,
      'origin',v_service.origin,'destination',v_service.destination,
      'origin_lat',v_service.origin_lat,'origin_lng',v_service.origin_lng,
      'destination_lat',v_service.destination_lat,'destination_lng',v_service.destination_lng,
      'origin_place_id',v_service.origin_place_id,'destination_place_id',v_service.destination_place_id,
      'origin_formatted_address',v_service.origin_formatted_address,
      'destination_formatted_address',v_service.destination_formatted_address,
      'primary_concept_id',v_service.primary_concept_id,'concept_name',v_concept_name,
      'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,
      'estimated_distance_km',v_service.estimated_distance_km,
      'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,
      'toll_estimate',v_service.toll_estimate,'is_holiday',v_service.is_holiday,
      'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,
      'route_distance_meters',v_service.route_distance_meters,'route_duration_seconds',v_service.route_duration_seconds,
      'route_toll_estimate',v_service.route_toll_estimate,'route_toll_currency',v_service.route_toll_currency,
      'route_provider',v_service.route_provider,'route_calculated_at',v_service.route_calculated_at,
      'route_legs',coalesce(v_service.route_legs,'[]'::jsonb),'trip_id',v_service.trip_id,'remito_id',v_service.remito_id
    ),
    'locks',jsonb_build_object(
      'closed',v_service.status in ('completed','cancelled'),
      'trip_started',v_service.trip_id is not null or v_service.status not in ('pending','assigned'),
      'remito_locked',coalesce(v_remito_status in ('firmado','cerrado_admin'),false) or v_remito_signed_at is not null,
      'remito_status',v_remito_status,
      'can_edit',v_role in ('administracion','operador') and v_service.status not in ('completed','cancelled'),
      'requires_reason',v_service.trip_id is not null or v_service.status not in ('pending','assigned')
    ),
    'items',v_items,
    'changes',v_changes
  );
end;
$$;

create or replace function public.update_operator_service(p_service_id uuid,p_payload jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_before_items jsonb;
  v_after_items jsonb;
  v_before_tolls jsonb;
  v_after_tolls jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_reason text := nullif(btrim(p_reason),'');
  v_trip_started boolean;
  v_remito_status text;
  v_remito_signed_at timestamptz;
  v_remito_locked boolean := false;
  v_company_id uuid;
  v_base_id uuid;
  v_primary_id uuid;
  v_primary public.service_concepts%rowtype;
  v_legacy_category uuid;
  v_setting public.company_billing_settings%rowtype;
  v_base public.billing_bases%rowtype;
  v_scheduled timestamptz;
  v_date date;
  v_provider_code text;
  v_driver uuid;
  v_truck integer;
  v_active_driver uuid;
  v_items jsonb := '[]'::jsonb;
  v_item_codes jsonb := '{}'::jsonb;
  v_quote jsonb;
  v_component jsonb;
  v_instance_code text;
  v_requires_own boolean;
  v_asphalt numeric;
  v_gravel numeric;
  v_toll_input numeric;
  v_structural_changed boolean := false;
  v_assignment_changed boolean := false;
  v_reprice boolean := false;
  v_has_tolls boolean := coalesce(p_payload ? 'tolls',false);
  v_toll jsonb;
  v_toll_id uuid;
  v_rate_id uuid;
  v_rate public.toll_rates%rowtype;
  v_location public.toll_locations%rowtype;
  v_toll_name text;
  v_toll_code text;
  v_toll_road text;
  v_toll_direction text;
  v_category text;
  v_payment text;
  v_quantity integer;
  v_unit_amount numeric;
  v_currency text;
  v_source text;
  v_concept_name text;
begin
  if v_uid is null or v_role not in ('administracion','operador') then raise exception 'Sin permiso para editar servicios'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado y no puede editarse'; end if;

  v_trip_started := v_service.trip_id is not null or v_service.status not in ('pending','assigned');
  if v_service.remito_id is not null then
    select status,firmado_at into v_remito_status,v_remito_signed_at from public.remitos where remito_id=v_service.remito_id;
    v_remito_locked := coalesce(v_remito_status in ('firmado','cerrado_admin'),false) or v_remito_signed_at is not null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'item_role',item_role,'quantity',quantity,'instance_code',instance_code) order by sort_order),'[]'::jsonb)
  into v_before_items from public.operator_service_items where service_id=p_service_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) into v_before_tolls from public.operator_service_tolls t where t.service_id=p_service_id;

  v_company_id := case when p_payload ? 'company_id' then nullif(p_payload->>'company_id','')::uuid else v_service.company_id end;
  v_base_id := case when p_payload ? 'billing_base_id' then nullif(p_payload->>'billing_base_id','')::uuid else v_service.billing_base_id end;
  v_primary_id := case when p_payload ? 'primary_concept_id' then nullif(p_payload->>'primary_concept_id','')::uuid when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else v_service.primary_concept_id end;
  v_scheduled := case when p_payload ? 'scheduled_for' then coalesce(nullif(p_payload->>'scheduled_for','')::timestamptz,v_service.scheduled_for) else v_service.scheduled_for end;
  v_date := (v_scheduled at time zone 'America/Argentina/Buenos_Aires')::date;
  v_provider_code := case when p_payload ? 'service_order_number' then nullif(btrim(p_payload->>'service_order_number'),'') else v_service.service_order_number end;
  if v_provider_code is null then raise exception 'El código de prestadora es obligatorio'; end if;

  if p_payload ? 'items' then v_items:=coalesce(p_payload->'items','[]'::jsonb);
  else select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'quantity',quantity) order by sort_order),'[]'::jsonb) into v_items from public.operator_service_items where service_id=p_service_id and item_role='secondary'; end if;
  if p_payload ? 'item_codes' then v_item_codes:=coalesce(p_payload->'item_codes','{}'::jsonb);
  else select coalesce(jsonb_object_agg(concept_id::text,instance_code),'{}'::jsonb) into v_item_codes from public.operator_service_items where service_id=p_service_id and item_role='secondary' and instance_code is not null; end if;

  v_asphalt := case when p_payload ? 'estimated_asphalt_km' then greatest(coalesce(nullif(p_payload->>'estimated_asphalt_km','')::numeric,0),0) when p_payload ? 'estimated_distance_km' then greatest(coalesce(nullif(p_payload->>'estimated_distance_km','')::numeric,0),0) else coalesce(v_service.estimated_asphalt_km,v_service.estimated_distance_km,0) end;
  v_gravel := case when p_payload ? 'estimated_gravel_km' then greatest(coalesce(nullif(p_payload->>'estimated_gravel_km','')::numeric,0),0) when p_payload ? 'estimated_distance_km' then 0 else coalesce(v_service.estimated_gravel_km,0) end;
  v_driver := case when p_payload ? 'assigned_driver_id' then nullif(p_payload->>'assigned_driver_id','')::uuid else v_service.assigned_driver_id end;
  v_truck := case when p_payload ? 'assigned_truck_id' then nullif(p_payload->>'assigned_truck_id','')::integer else v_service.assigned_truck_id end;

  v_structural_changed := v_company_id is distinct from v_service.company_id or v_base_id is distinct from v_service.billing_base_id or v_primary_id is distinct from v_service.primary_concept_id or v_provider_code is distinct from v_service.service_order_number or (p_payload ? 'items') or v_asphalt is distinct from coalesce(v_service.estimated_asphalt_km,v_service.estimated_distance_km,0) or v_gravel is distinct from coalesce(v_service.estimated_gravel_km,0) or (p_payload ? 'origin' and btrim(coalesce(p_payload->>'origin','')) is distinct from coalesce(v_service.origin,'')) or (p_payload ? 'destination' and btrim(coalesce(p_payload->>'destination','')) is distinct from coalesce(v_service.destination,'')) or (p_payload ? 'vehicle_plate' and upper(nullif(btrim(p_payload->>'vehicle_plate'),'')) is distinct from v_service.vehicle_plate) or (p_payload ? 'customer_phone' and nullif(btrim(p_payload->>'customer_phone'),'') is distinct from v_service.customer_phone);
  v_assignment_changed := v_driver is distinct from v_service.assigned_driver_id or v_truck is distinct from v_service.assigned_truck_id;
  if v_remito_locked and v_structural_changed then raise exception 'El remito ya está firmado o cerrado. Los datos estructurales no pueden modificarse'; end if;
  if v_trip_started and v_structural_changed and v_reason is null then raise exception 'Indicá el motivo de la corrección porque el viaje ya fue iniciado'; end if;
  if v_trip_started and v_assignment_changed then raise exception 'La reasignación de un servicio iniciado debe hacerse desde Reasignar'; end if;

  if not exists(select 1 from public.companies c where c.company_id=v_company_id and c.status='active') then raise exception 'Prestadora inválida o inactiva'; end if;
  select sc.* into v_primary from public.service_concepts sc join public.company_service_settings css on css.company_id=v_company_id and css.concept_id=sc.concept_id and css.is_enabled where sc.concept_id=v_primary_id and sc.is_active and sc.billing_family<>'system' and sc.service_category in ('primary','mixed');
  if not found then raise exception 'Tipo de Servicio principal inválido o no habilitado'; end if;
  select c.category_id into v_legacy_category from public.service_categories c where c.legacy_primary_concept_id=v_primary.concept_id and c.is_active order by c.sort_order limit 1;

  select s.* into v_setting from public.company_billing_settings s where s.company_id=v_company_id and s.is_active and s.valid_from<=v_date and (s.valid_until is null or s.valid_until>=v_date) order by (s.contract_id is not null) desc,s.valid_from desc,s.created_at desc limit 1;
  if not found then raise exception 'La prestadora no tiene parámetros de facturación vigentes'; end if;
  if v_base_id is null then raise exception 'Seleccioná una base habilitada'; end if;
  select b.* into v_base from public.billing_bases b join public.company_billing_base_links l on l.base_id=b.base_id and l.billing_setting_id=v_setting.billing_setting_id and l.is_active where b.base_id=v_base_id and b.is_active;
  if not found then raise exception 'La base seleccionada no está habilitada para esta prestadora'; end if;
  if coalesce(v_setting.requires_verified_base,false) and not coalesce(v_base.address_verified,false) then raise exception 'La base seleccionada todavía no tiene su dirección verificada'; end if;

  if (v_driver is null) <> (v_truck is null) then raise exception 'Chofer y móvil deben asignarse juntos'; end if;
  if v_assignment_changed and v_truck is not null then
    select dl.driver_id into v_active_driver from public.daily_logs dl where dl.truck_id=v_truck and dl.log_date=v_date and coalesce(dl.status,'open')='open' and dl.hora_fin is null order by dl.hora_inicio desc,dl.log_id desc limit 1;
    if v_active_driver is not null then v_driver:=v_active_driver; end if;
  end if;
  if v_driver is not null and not exists(select 1 from public.users u join public.roles r on r.role_id=u.role_id where u.user_id=v_driver and coalesce(u.is_active,true) and r.name='chofer') then raise exception 'Chofer inválido o inactivo'; end if;
  if v_truck is not null and not exists(select 1 from public.trucks t where t.truck_id=v_truck and t.status='active') then raise exception 'Móvil inválido o inactivo'; end if;

  if v_has_tolls then
    delete from public.operator_service_tolls where service_id=p_service_id and source in ('planned','manual');
    for v_toll in select value from jsonb_array_elements(coalesce(p_payload->'tolls','[]'::jsonb)) loop
      v_toll_id:=nullif(v_toll->>'toll_id','')::uuid; v_rate_id:=nullif(v_toll->>'toll_rate_id','')::uuid;
      v_category:=lower(coalesce(nullif(btrim(v_toll->>'vehicle_category'),''),'light_2_axles'));
      v_payment:=lower(coalesce(nullif(btrim(v_toll->>'payment_method'),''),'any'));
      v_quantity:=greatest(coalesce(nullif(v_toll->>'quantity','')::integer,1),1);
      v_source:=lower(coalesce(nullif(btrim(v_toll->>'source'),''),case when v_toll_id is null then 'manual' else 'planned' end));
      if v_source not in ('planned','manual') then raise exception 'La edición solo admite peajes planificados o manuales'; end if;
      v_rate:=null;v_location:=null;
      if v_rate_id is not null then select * into v_rate from public.toll_rates where toll_rate_id=v_rate_id; if not found then raise exception 'Tarifa de peaje inexistente'; end if; v_toll_id:=v_rate.toll_id;v_category:=v_rate.vehicle_category;v_payment:=v_rate.payment_method; end if;
      if v_toll_id is not null then select * into v_location from public.toll_locations where toll_id=v_toll_id; if not found then raise exception 'Peaje inexistente'; end if; end if;
      v_toll_name:=coalesce(nullif(btrim(v_toll->>'toll_name'),''),v_location.name); if v_toll_name is null then raise exception 'Indicá el nombre del peaje'; end if;
      v_toll_code:=coalesce(nullif(btrim(v_toll->>'toll_code'),''),v_location.code);v_toll_road:=coalesce(nullif(btrim(v_toll->>'road'),''),v_location.road);v_toll_direction:=coalesce(nullif(btrim(v_toll->>'direction'),''),v_location.direction);
      v_unit_amount:=case when v_toll ? 'unit_amount' then coalesce(nullif(v_toll->>'unit_amount','')::numeric,0) when v_rate.toll_rate_id is not null then v_rate.amount else 0 end;if v_unit_amount<0 then raise exception 'El importe del peaje no puede ser negativo';end if;
      v_currency:=upper(coalesce(nullif(btrim(v_toll->>'currency'),''),v_rate.currency,v_service.currency,'ARS'));
      insert into public.operator_service_tolls(service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,vehicle_category,payment_method,quantity,unit_amount,currency,source,notes,created_by,updated_by,is_test) values(p_service_id,v_toll_id,v_rate_id,v_toll_code,v_toll_name,v_toll_road,v_toll_direction,v_category,v_payment,v_quantity,round(v_unit_amount,2),v_currency,v_source,nullif(btrim(v_toll->>'notes'),''),v_uid,v_uid,v_service.is_test);
    end loop;
  end if;

  if v_has_tolls then
    select coalesce(case when count(*) filter(where source='actual')>0 then sum(total_amount) filter(where source='actual') else sum(total_amount) filter(where source in ('planned','manual')) end,0) into v_toll_input from public.operator_service_tolls where service_id=p_service_id;
  elsif p_payload ? 'toll_estimate' then v_toll_input:=greatest(coalesce(nullif(p_payload->>'toll_estimate','')::numeric,0),0);
  else v_toll_input:=coalesce(v_service.toll_estimate,0); end if;

  v_reprice := v_structural_changed or v_has_tolls or (p_payload ? 'scheduled_for') or (p_payload ? 'toll_estimate') or (p_payload ? 'is_holiday');
  if v_reprice then
    v_quote:=app_private.calculate_operator_service_quote_v4_full(v_company_id,v_base_id,v_scheduled,v_primary.concept_id,v_items,v_asphalt,v_gravel,v_toll_input,case when p_payload ? 'is_holiday' then coalesce((p_payload->>'is_holiday')::boolean,false) else coalesce(v_service.is_holiday,false) end);
  else v_quote:=v_service.pricing_snapshot; end if;

  v_before:=jsonb_build_object('company_id',v_service.company_id,'billing_base_id',v_service.billing_base_id,'primary_concept_id',v_service.primary_concept_id,'service_order_number',v_service.service_order_number,'scheduled_for',v_service.scheduled_for,'priority',v_service.priority,'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,'origin',v_service.origin,'destination',v_service.destination,'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,'items',v_before_items,'tolls',v_before_tolls);

  update public.operator_services set
    status=case when status in ('pending','assigned') then case when v_driver is not null and v_truck is not null then 'assigned' else 'pending' end else status end,
    priority=case when p_payload ? 'priority' then coalesce(nullif(lower(btrim(p_payload->>'priority')),''),priority) else priority end,
    company_id=v_company_id,branch_id=null,billing_setting_id=v_setting.billing_setting_id,billing_base_id=v_base_id,
    billing_snapshot=jsonb_build_object('billing_setting_id',v_setting.billing_setting_id,'route_mode',v_setting.route_mode,'toll_calculation_mode',v_setting.toll_calculation_mode,'base',jsonb_build_object('base_id',v_base.base_id,'name',v_base.name,'address',v_base.address,'latitude',v_base.latitude,'longitude',v_base.longitude,'google_place_id',v_base.google_place_id,'address_verified',v_base.address_verified)),
    contract_id=case when v_reprice then (v_quote->>'contract_id')::uuid else contract_id end,rate_card_id=case when v_reprice then (v_quote->>'rate_card_id')::uuid else rate_card_id end,
    service_order_number=v_provider_code,purchase_order_number=case when p_payload ? 'purchase_order_number' then nullif(btrim(p_payload->>'purchase_order_number'),'') else purchase_order_number end,
    scheduled_for=v_scheduled,estimated_arrival_at=case when p_payload ? 'estimated_arrival_at' then nullif(p_payload->>'estimated_arrival_at','')::timestamptz else estimated_arrival_at end,estimated_finish_at=case when p_payload ? 'estimated_finish_at' then nullif(p_payload->>'estimated_finish_at','')::timestamptz else estimated_finish_at end,
    granted_delay_minutes=case when p_payload ? 'granted_delay_minutes' then greatest(coalesce(nullif(p_payload->>'granted_delay_minutes','')::integer,0),0) else granted_delay_minutes end,
    logistics_type=case when p_payload ? 'logistics_type' then coalesce(nullif(lower(btrim(p_payload->>'logistics_type')),''),logistics_type) else logistics_type end,
    customer_name=case when p_payload ? 'customer_name' then nullif(btrim(p_payload->>'customer_name'),'') else customer_name end,customer_phone=case when p_payload ? 'customer_phone' then nullif(btrim(p_payload->>'customer_phone'),'') else customer_phone end,customer_email=case when p_payload ? 'customer_email' then nullif(btrim(p_payload->>'customer_email'),'') else customer_email end,
    vehicle_plate=case when p_payload ? 'vehicle_plate' then upper(nullif(btrim(p_payload->>'vehicle_plate'),'')) else vehicle_plate end,vehicle_make_model=case when p_payload ? 'vehicle_make_model' then nullif(btrim(p_payload->>'vehicle_make_model'),'') else vehicle_make_model end,
    origin=case when p_payload ? 'origin' then btrim(p_payload->>'origin') else origin end,destination=case when p_payload ? 'destination' then btrim(p_payload->>'destination') else destination end,
    origin_lat=case when p_payload ? 'origin_lat' then nullif(p_payload->>'origin_lat','')::numeric else origin_lat end,origin_lng=case when p_payload ? 'origin_lng' then nullif(p_payload->>'origin_lng','')::numeric else origin_lng end,destination_lat=case when p_payload ? 'destination_lat' then nullif(p_payload->>'destination_lat','')::numeric else destination_lat end,destination_lng=case when p_payload ? 'destination_lng' then nullif(p_payload->>'destination_lng','')::numeric else destination_lng end,
    origin_place_id=case when p_payload ? 'origin_place_id' then nullif(btrim(p_payload->>'origin_place_id'),'') else origin_place_id end,destination_place_id=case when p_payload ? 'destination_place_id' then nullif(btrim(p_payload->>'destination_place_id'),'') else destination_place_id end,origin_formatted_address=case when p_payload ? 'origin_formatted_address' then nullif(btrim(p_payload->>'origin_formatted_address'),'') else origin_formatted_address end,destination_formatted_address=case when p_payload ? 'destination_formatted_address' then nullif(btrim(p_payload->>'destination_formatted_address'),'') else destination_formatted_address end,
    primary_concept_id=v_primary.concept_id,category_id=v_legacy_category,assigned_driver_id=v_driver,assigned_truck_id=v_truck,assigned_at=case when v_assignment_changed then case when v_driver is not null then now() else null end else assigned_at end,assigned_by=case when v_assignment_changed then case when v_driver is not null then v_uid else null end else assigned_by end,
    estimated_distance_km=v_asphalt+v_gravel,estimated_asphalt_km=v_asphalt,estimated_gravel_km=v_gravel,toll_estimate=v_toll_input,is_holiday=case when p_payload ? 'is_holiday' then coalesce((p_payload->>'is_holiday')::boolean,false) else is_holiday end,
    currency=case when v_reprice then coalesce(v_quote->>'currency',currency) else currency end,base_subtotal=case when v_reprice then coalesce((v_quote->>'base_subtotal')::numeric,0) else base_subtotal end,surcharge_total=case when v_reprice then coalesce((v_quote->>'surcharge_total')::numeric,0) else surcharge_total end,toll_total=case when v_reprice then coalesce((v_quote->>'toll_total')::numeric,0) else toll_total end,copay_total=case when v_reprice then coalesce((v_quote->>'copay_total')::numeric,0) else copay_total end,estimated_total=case when v_reprice then coalesce((v_quote->>'estimated_total')::numeric,0) else estimated_total end,company_estimated_total=case when v_reprice then coalesce((v_quote->>'company_estimated_total')::numeric,0) else company_estimated_total end,pricing_snapshot=case when v_reprice then v_quote else pricing_snapshot end,
    route_distance_meters=case when p_payload ? 'route_distance_meters' then nullif(p_payload->>'route_distance_meters','')::integer else route_distance_meters end,route_duration_seconds=case when p_payload ? 'route_duration_seconds' then nullif(p_payload->>'route_duration_seconds','')::integer else route_duration_seconds end,route_toll_estimate=case when p_payload ? 'route_toll_estimate' then nullif(p_payload->>'route_toll_estimate','')::numeric else route_toll_estimate end,route_toll_currency=case when p_payload ? 'route_toll_currency' then nullif(p_payload->>'route_toll_currency','') else route_toll_currency end,route_provider=case when p_payload ? 'route_provider' then nullif(p_payload->>'route_provider','') else route_provider end,route_calculated_at=case when p_payload ? 'route_calculated_at' then nullif(p_payload->>'route_calculated_at','')::timestamptz else route_calculated_at end,route_legs=case when p_payload ? 'route_legs' then coalesce(p_payload->'route_legs','[]'::jsonb) else route_legs end,
    operator_notes=case when p_payload ? 'operator_notes' then nullif(btrim(p_payload->>'operator_notes'),'') else operator_notes end,driver_instructions=case when p_payload ? 'driver_instructions' then nullif(btrim(p_payload->>'driver_instructions'),'') else driver_instructions end,updated_by=v_uid,updated_at=now()
  where service_id=p_service_id returning * into v_service;

  if v_reprice then
    delete from public.operator_service_items where service_id=p_service_id;
    insert into public.operator_service_items(service_id,concept_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id)
    values(p_service_id,v_primary.concept_id,'primary',v_primary.code,v_provider_code,v_primary.name,'service',1,0,0,0,'general',jsonb_build_object('role','primary','concept_id',v_primary.concept_id,'service_name',v_primary.name,'provider_code',v_provider_code,'pricing_model','rate_card_v4'),0,v_legacy_category);
    for v_component in select value from jsonb_array_elements(coalesce(v_quote->'components','[]'::jsonb)) loop
      v_requires_own:=coalesce((v_component->>'requires_own_code')::boolean,false);
      if v_requires_own then v_instance_code:=nullif(btrim(coalesce(v_item_codes->>(v_component->>'concept_id'),'')),''); if v_instance_code is null then raise exception 'El servicio % requiere código propio de prestadora',v_component->>'service_name'; end if; else v_instance_code:=v_provider_code; end if;
      insert into public.operator_service_items(service_id,concept_id,rate_item_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id,matrix_rate_id)
      values(p_service_id,(v_component->>'concept_id')::uuid,nullif(v_component->>'rate_item_id','')::uuid,v_component->>'role',v_component->>'service_code',v_instance_code,v_component->>'service_name',v_component->>'pricing_unit',(v_component->>'quantity')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'subtotal')::numeric,coalesce(nullif(v_component->>'price_source',''),'general'),v_component,case v_component->>'role' when 'movement' then 10 when 'distance' then 20 else 30 end,v_legacy_category,null);
    end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'item_role',item_role,'quantity',quantity,'instance_code',instance_code) order by sort_order),'[]'::jsonb) into v_after_items from public.operator_service_items where service_id=p_service_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) into v_after_tolls from public.operator_service_tolls t where t.service_id=p_service_id;
  v_after:=jsonb_build_object('company_id',v_service.company_id,'billing_base_id',v_service.billing_base_id,'primary_concept_id',v_service.primary_concept_id,'service_order_number',v_service.service_order_number,'scheduled_for',v_service.scheduled_for,'priority',v_service.priority,'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,'origin',v_service.origin,'destination',v_service.destination,'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,'items',v_after_items,'tolls',v_after_tolls);
  select coalesce(array_agg(a.key order by a.key),'{}'::text[]) into v_changed_fields from jsonb_each(v_after) a left join jsonb_each(v_before) b on b.key=a.key where a.value is distinct from b.value;
  if cardinality(v_changed_fields)=0 then return jsonb_build_object('service_id',v_service.service_id,'no_changes',true,'changed_fields','[]'::jsonb); end if;

  select sc.name into v_concept_name from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;
  if v_service.trip_id is not null then update public.trips set nro_servicio=coalesce(nullif(v_service.service_order_number,''),v_service.service_number),patente=v_service.vehicle_plate,tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),origin=v_service.origin,destination=v_service.destination,notes=concat_ws(E'\n',nullif(notes,''),case when v_reason is not null then 'Corrección administrativa: '||v_reason end),received_at=now(),sync_status='synced' where trip_id=v_service.trip_id; end if;
  if v_service.remito_id is not null and not v_remito_locked then update public.remitos set nro_servicio=coalesce(nullif(v_service.service_order_number,''),nro_servicio),patente=coalesce(nullif(v_service.vehicle_plate,''),patente),marca_modelo=v_service.vehicle_make_model,razon_social=v_service.customer_name,telefono=v_service.customer_phone,email_cliente=v_service.customer_email,tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),origen=v_service.origin,destino=v_service.destination,imp_peaje=case when v_has_tolls then v_toll_input else imp_peaje end,historial_ediciones=coalesce(historial_ediciones,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('edited_at',now(),'edited_by',v_uid,'reason',v_reason,'fields',to_jsonb(v_changed_fields))),received_at=now(),sync_status='synced' where remito_id=v_service.remito_id; end if;

  insert into public.operator_service_changes(service_id,service_status,trip_id,remito_id,changed_fields,before_values,after_values,change_reason,changed_by,is_test) values(p_service_id,v_service.status,v_service.trip_id,v_service.remito_id,v_changed_fields,v_before,v_after,v_reason,v_uid,v_service.is_test);
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by) values(p_service_id,'service_edit',v_service.status,v_service.status,concat_ws(' · ','Campos: '||array_to_string(v_changed_fields,', '),case when v_reason is not null then 'Motivo: '||v_reason end),v_uid);

  if v_role='administracion' then return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'changed_fields',to_jsonb(v_changed_fields),'no_changes',false); end if;
  return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'changed_fields',to_jsonb(v_changed_fields),'no_changes',false);
end;
$$;

-- El helper anterior solo era consumido por update_operator_service y quedó sustituido por el rebuild canónico v4.
drop function if exists app_private.sync_operator_service_items_from_quote(uuid,jsonb);
