-- Operational corrections never rewrite the signed document.
alter table public.operator_services add column if not exists administrative_commercial jsonb;
alter table public.operator_services add column if not exists administrative_revision integer not null default 0;

CREATE OR REPLACE FUNCTION app_private.update_operator_service_administrative_core_v1(p_service_id uuid, p_payload jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text:=app_private.current_auxilios_role(); v_uid uuid:=auth.uid(); v_service public.operator_services%rowtype;
  v_before jsonb; v_after jsonb; v_before_items jsonb; v_after_items jsonb; v_before_tolls jsonb; v_after_tolls jsonb; v_changed_fields text[]:='{}'::text[]; v_reason text:=nullif(btrim(p_reason),'');
  v_trip_started boolean; v_remito_status text; v_remito_signed_at timestamptz; v_remito_locked boolean:=false;
  v_company_id uuid; v_base_id uuid; v_primary_id uuid; v_primary public.service_concepts%rowtype; v_legacy_category uuid; v_setting public.company_billing_settings%rowtype; v_base public.billing_bases%rowtype; v_scheduled timestamptz; v_date date; v_provider_code text;
  v_driver uuid; v_truck integer; v_active_driver uuid; v_items jsonb:='[]'::jsonb; v_item_codes jsonb:='{}'::jsonb; v_quote jsonb; v_component jsonb; v_instance_code text; v_requires_own boolean; v_asphalt numeric; v_gravel numeric; v_toll_input numeric; v_structural_changed boolean:=false; v_assignment_changed boolean:=false; v_reprice boolean:=false;
  v_has_tolls boolean:=coalesce(p_payload ? 'tolls',false); v_toll jsonb; v_toll_id uuid; v_rate_id uuid; v_rate public.toll_rates%rowtype; v_location public.toll_locations%rowtype; v_toll_name text; v_toll_code text; v_toll_road text; v_toll_direction text; v_category text; v_payment text; v_quantity integer; v_unit_amount numeric; v_currency text; v_source text; v_concept_name text;
begin
  if v_uid is null or v_role not in ('administracion','operador') then raise exception 'Sin permiso para editar servicios'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado y no puede editarse'; end if;
  v_trip_started:=v_service.trip_id is not null or v_service.status not in ('pending','assigned');
  if v_service.remito_id is not null then select status,firmado_at into v_remito_status,v_remito_signed_at from public.remitos where remito_id=v_service.remito_id; v_remito_locked:=coalesce(v_remito_status in ('firmado','cerrado_admin'),false) or v_remito_signed_at is not null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'item_role',item_role,'quantity',quantity,'instance_code',instance_code) order by sort_order),'[]'::jsonb) into v_before_items from public.operator_service_items where service_id=p_service_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) into v_before_tolls from public.operator_service_tolls t where t.service_id=p_service_id;
  v_company_id:=case when p_payload ? 'company_id' then nullif(p_payload->>'company_id','')::uuid else v_service.company_id end;
  v_base_id:=case when p_payload ? 'billing_base_id' then nullif(p_payload->>'billing_base_id','')::uuid else v_service.billing_base_id end;
  v_primary_id:=case when p_payload ? 'primary_concept_id' then nullif(p_payload->>'primary_concept_id','')::uuid when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else v_service.primary_concept_id end;
  v_scheduled:=case when p_payload ? 'scheduled_for' then coalesce(nullif(p_payload->>'scheduled_for','')::timestamptz,v_service.scheduled_for) else v_service.scheduled_for end; v_date:=(v_scheduled at time zone 'America/Argentina/Buenos_Aires')::date;
  v_provider_code:=case when p_payload ? 'service_order_number' then nullif(btrim(p_payload->>'service_order_number'),'') else v_service.service_order_number end; if v_provider_code is null then raise exception 'El código de prestadora es obligatorio'; end if;
  if p_payload ? 'items' then v_items:=coalesce(p_payload->'items','[]'::jsonb); else select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'quantity',quantity) order by sort_order),'[]'::jsonb) into v_items from public.operator_service_items where service_id=p_service_id and item_role='secondary'; end if;
  if p_payload ? 'item_codes' then v_item_codes:=coalesce(p_payload->'item_codes','{}'::jsonb); else select coalesce(jsonb_object_agg(concept_id::text,instance_code),'{}'::jsonb) into v_item_codes from public.operator_service_items where service_id=p_service_id and item_role='secondary' and instance_code is not null; end if;
  v_asphalt:=case when p_payload ? 'estimated_asphalt_km' then greatest(coalesce(nullif(p_payload->>'estimated_asphalt_km','')::numeric,0),0) when p_payload ? 'estimated_distance_km' then greatest(coalesce(nullif(p_payload->>'estimated_distance_km','')::numeric,0),0) else coalesce(v_service.estimated_asphalt_km,v_service.estimated_distance_km,0) end;
  v_gravel:=case when p_payload ? 'estimated_gravel_km' then greatest(coalesce(nullif(p_payload->>'estimated_gravel_km','')::numeric,0),0) when p_payload ? 'estimated_distance_km' then 0 else coalesce(v_service.estimated_gravel_km,0) end;
  v_driver:=case when p_payload ? 'assigned_driver_id' then nullif(p_payload->>'assigned_driver_id','')::uuid else v_service.assigned_driver_id end; v_truck:=case when p_payload ? 'assigned_truck_id' then nullif(p_payload->>'assigned_truck_id','')::integer else v_service.assigned_truck_id end;
  v_structural_changed:=v_company_id is distinct from v_service.company_id or v_base_id is distinct from v_service.billing_base_id or v_primary_id is distinct from v_service.primary_concept_id or v_provider_code is distinct from v_service.service_order_number or (p_payload ? 'items') or v_asphalt is distinct from coalesce(v_service.estimated_asphalt_km,v_service.estimated_distance_km,0) or v_gravel is distinct from coalesce(v_service.estimated_gravel_km,0) or (p_payload ? 'origin' and btrim(coalesce(p_payload->>'origin','')) is distinct from coalesce(v_service.origin,'')) or (p_payload ? 'destination' and btrim(coalesce(p_payload->>'destination','')) is distinct from coalesce(v_service.destination,'')) or (p_payload ? 'vehicle_plate' and upper(nullif(btrim(p_payload->>'vehicle_plate'),'')) is distinct from v_service.vehicle_plate) or (p_payload ? 'customer_phone' and nullif(btrim(p_payload->>'customer_phone'),'') is distinct from v_service.customer_phone);
  v_assignment_changed:=v_driver is distinct from v_service.assigned_driver_id or v_truck is distinct from v_service.assigned_truck_id;
  
  if v_role<>'administracion' and v_trip_started and v_service.status <> 'at_origin' and v_structural_changed and v_reason is null then raise exception 'Indicá el motivo de la corrección porque el viaje ya fue iniciado'; end if;
  if v_trip_started and v_assignment_changed then raise exception 'La reasignación de un servicio iniciado debe hacerse desde Reasignar'; end if;
  if not exists(select 1 from public.companies c where c.company_id=v_company_id and c.status='active') then raise exception 'Prestadora inválida o inactiva'; end if;
  select sc.* into v_primary from public.service_concepts sc join public.company_service_settings css on css.company_id=v_company_id and css.concept_id=sc.concept_id and css.is_enabled where sc.concept_id=v_primary_id and sc.is_active and sc.billing_family<>'system' and sc.service_category in ('primary','mixed'); if not found then raise exception 'Tipo de Servicio principal inválido o no habilitado'; end if;
  select c.category_id into v_legacy_category from public.service_categories c where c.legacy_primary_concept_id=v_primary.concept_id and c.is_active order by c.sort_order limit 1;
  select s.* into v_setting from public.company_billing_settings s where s.company_id=v_company_id and s.is_active and s.valid_from<=v_date and (s.valid_until is null or s.valid_until>=v_date) order by (s.contract_id is not null) desc,s.valid_from desc,s.created_at desc limit 1; if not found then raise exception 'La prestadora no tiene parámetros de facturación vigentes'; end if;
  if v_base_id is null then raise exception 'Seleccioná una base habilitada'; end if;
  select b.* into v_base from public.billing_bases b join public.company_billing_base_links l on l.base_id=b.base_id and l.billing_setting_id=v_setting.billing_setting_id and l.is_active where b.base_id=v_base_id and b.is_active; if not found then raise exception 'La base seleccionada no está habilitada para esta prestadora'; end if;
  if coalesce(v_setting.requires_verified_base,false) and not coalesce(v_base.address_verified,false) then raise exception 'La base seleccionada todavía no tiene su dirección verificada'; end if;
  if (v_driver is null) <> (v_truck is null) then raise exception 'Chofer y móvil deben asignarse juntos'; end if;
  if v_assignment_changed and v_truck is not null then select dl.driver_id into v_active_driver from public.daily_logs dl where dl.truck_id=v_truck and dl.log_date=v_date and coalesce(dl.status,'open')='open' and dl.hora_fin is null order by dl.hora_inicio desc,dl.log_id desc limit 1; if v_active_driver is not null then v_driver:=v_active_driver; end if; end if;
  if v_driver is not null and not exists(select 1 from public.users u join public.roles r on r.role_id=u.role_id where u.user_id=v_driver and coalesce(u.is_active,true) and r.name='chofer') then raise exception 'Chofer inválido o inactivo'; end if; if v_truck is not null and not exists(select 1 from public.trucks t where t.truck_id=v_truck and t.status='active') then raise exception 'Móvil inválido o inactivo'; end if;
  if v_has_tolls then delete from public.operator_service_tolls where service_id=p_service_id and source in ('planned','manual'); for v_toll in select value from jsonb_array_elements(coalesce(p_payload->'tolls','[]'::jsonb)) loop v_toll_id:=nullif(v_toll->>'toll_id','')::uuid;v_rate_id:=nullif(v_toll->>'toll_rate_id','')::uuid;v_category:=lower(coalesce(nullif(btrim(v_toll->>'vehicle_category'),''),'light_2_axles'));v_payment:=lower(coalesce(nullif(btrim(v_toll->>'payment_method'),''),'any'));v_quantity:=greatest(coalesce(nullif(v_toll->>'quantity','')::integer,1),1);v_source:=lower(coalesce(nullif(btrim(v_toll->>'source'),''),case when v_toll_id is null then 'manual' else 'planned' end));if v_source not in ('planned','manual') then raise exception 'La edición solo admite peajes planificados o manuales';end if;v_rate:=null;v_location:=null;if v_rate_id is not null then select * into v_rate from public.toll_rates where toll_rate_id=v_rate_id;if not found then raise exception 'Tarifa de peaje inexistente';end if;v_toll_id:=v_rate.toll_id;v_category:=v_rate.vehicle_category;v_payment:=v_rate.payment_method;end if;if v_toll_id is not null then select * into v_location from public.toll_locations where toll_id=v_toll_id;if not found then raise exception 'Peaje inexistente';end if;end if;v_toll_name:=coalesce(nullif(btrim(v_toll->>'toll_name'),''),v_location.name);if v_toll_name is null then raise exception 'Indicá el nombre del peaje';end if;v_toll_code:=coalesce(nullif(btrim(v_toll->>'toll_code'),''),v_location.code);v_toll_road:=coalesce(nullif(btrim(v_toll->>'road'),''),v_location.road);v_toll_direction:=coalesce(nullif(btrim(v_toll->>'direction'),''),v_location.direction);v_unit_amount:=case when v_toll ? 'unit_amount' then coalesce(nullif(v_toll->>'unit_amount','')::numeric,0) when v_rate.toll_rate_id is not null then v_rate.amount else 0 end;if v_unit_amount<0 then raise exception 'El importe del peaje no puede ser negativo';end if;v_currency:=upper(coalesce(nullif(btrim(v_toll->>'currency'),''),v_rate.currency,v_service.currency,'ARS'));insert into public.operator_service_tolls(service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,vehicle_category,payment_method,quantity,unit_amount,currency,source,notes,created_by,updated_by,is_test) values(p_service_id,v_toll_id,v_rate_id,v_toll_code,v_toll_name,v_toll_road,v_toll_direction,v_category,v_payment,v_quantity,round(v_unit_amount,2),v_currency,v_source,nullif(btrim(v_toll->>'notes'),''),v_uid,v_uid,v_service.is_test);end loop;end if;
  if v_has_tolls then select coalesce(case when count(*) filter(where source='actual')>0 then sum(total_amount) filter(where source='actual') else sum(total_amount) filter(where source in ('planned','manual')) end,0) into v_toll_input from public.operator_service_tolls where service_id=p_service_id; elsif p_payload ? 'toll_estimate' then v_toll_input:=greatest(coalesce(nullif(p_payload->>'toll_estimate','')::numeric,0),0); else v_toll_input:=coalesce(v_service.toll_estimate,0); end if;
  v_reprice:=v_structural_changed or v_has_tolls or (p_payload ? 'scheduled_for') or (p_payload ? 'toll_estimate') or (p_payload ? 'is_holiday'); if v_reprice then v_quote:=app_private.calculate_operator_service_quote_v4_full(v_company_id,v_base_id,v_scheduled,v_primary.concept_id,v_items,v_asphalt,v_gravel,v_toll_input,case when p_payload ? 'is_holiday' then coalesce((p_payload->>'is_holiday')::boolean,false) else coalesce(v_service.is_holiday,false) end); else v_quote:=v_service.pricing_snapshot; end if;
  v_before:=jsonb_build_object('company_id',v_service.company_id,'billing_base_id',v_service.billing_base_id,'primary_concept_id',v_service.primary_concept_id,'service_order_number',v_service.service_order_number,'scheduled_for',v_service.scheduled_for,'priority',v_service.priority,'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,'origin',v_service.origin,'destination',v_service.destination,'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,'items',v_before_items,'tolls',v_before_tolls);
  update public.operator_services set status=case when status in ('pending','assigned') then case when v_driver is not null and v_truck is not null then 'assigned' else 'pending' end else status end,priority=case when p_payload ? 'priority' then coalesce(nullif(lower(btrim(p_payload->>'priority')),''),priority) else priority end,company_id=v_company_id,branch_id=null,billing_setting_id=v_setting.billing_setting_id,billing_base_id=v_base_id,billing_snapshot=jsonb_build_object('billing_setting_id',v_setting.billing_setting_id,'route_mode',v_setting.route_mode,'toll_calculation_mode',v_setting.toll_calculation_mode,'base',jsonb_build_object('base_id',v_base.base_id,'name',v_base.name,'address',v_base.address,'latitude',v_base.latitude,'longitude',v_base.longitude,'google_place_id',v_base.google_place_id,'address_verified',v_base.address_verified)),contract_id=case when v_reprice then (v_quote->>'contract_id')::uuid else contract_id end,rate_card_id=case when v_reprice then (v_quote->>'rate_card_id')::uuid else rate_card_id end,service_order_number=v_provider_code,purchase_order_number=case when p_payload ? 'purchase_order_number' then nullif(btrim(p_payload->>'purchase_order_number'),'') else purchase_order_number end,scheduled_for=v_scheduled,estimated_arrival_at=case when p_payload ? 'estimated_arrival_at' then nullif(p_payload->>'estimated_arrival_at','')::timestamptz else estimated_arrival_at end,estimated_finish_at=case when p_payload ? 'estimated_finish_at' then nullif(p_payload->>'estimated_finish_at','')::timestamptz else estimated_finish_at end,granted_delay_minutes=case when p_payload ? 'granted_delay_minutes' then greatest(coalesce(nullif(p_payload->>'granted_delay_minutes','')::integer,0),0) else granted_delay_minutes end,logistics_type=case when p_payload ? 'logistics_type' then coalesce(nullif(lower(btrim(p_payload->>'logistics_type')),''),logistics_type) else logistics_type end,customer_name=case when p_payload ? 'customer_name' then nullif(btrim(p_payload->>'customer_name'),'') else customer_name end,customer_phone=case when p_payload ? 'customer_phone' then nullif(btrim(p_payload->>'customer_phone'),'') else customer_phone end,customer_email=case when p_payload ? 'customer_email' then nullif(btrim(p_payload->>'customer_email'),'') else customer_email end,vehicle_plate=case when p_payload ? 'vehicle_plate' then upper(nullif(btrim(p_payload->>'vehicle_plate'),'')) else vehicle_plate end,vehicle_make_model=case when p_payload ? 'vehicle_make_model' then nullif(btrim(p_payload->>'vehicle_make_model'),'') else vehicle_make_model end,origin=case when p_payload ? 'origin' then btrim(p_payload->>'origin') else origin end,destination=case when p_payload ? 'destination' then btrim(p_payload->>'destination') else destination end,origin_lat=case when p_payload ? 'origin_lat' then nullif(p_payload->>'origin_lat','')::numeric else origin_lat end,origin_lng=case when p_payload ? 'origin_lng' then nullif(p_payload->>'origin_lng','')::numeric else origin_lng end,destination_lat=case when p_payload ? 'destination_lat' then nullif(p_payload->>'destination_lat','')::numeric else destination_lat end,destination_lng=case when p_payload ? 'destination_lng' then nullif(p_payload->>'destination_lng','')::numeric else destination_lng end,origin_place_id=case when p_payload ? 'origin_place_id' then nullif(btrim(p_payload->>'origin_place_id'),'') else origin_place_id end,destination_place_id=case when p_payload ? 'destination_place_id' then nullif(btrim(p_payload->>'destination_place_id'),'') else destination_place_id end,origin_formatted_address=case when p_payload ? 'origin_formatted_address' then nullif(btrim(p_payload->>'origin_formatted_address'),'') else origin_formatted_address end,destination_formatted_address=case when p_payload ? 'destination_formatted_address' then nullif(btrim(p_payload->>'destination_formatted_address'),'') else destination_formatted_address end,primary_concept_id=v_primary.concept_id,category_id=v_legacy_category,assigned_driver_id=v_driver,assigned_truck_id=v_truck,assigned_at=case when v_assignment_changed then case when v_driver is not null then now() else null end else assigned_at end,assigned_by=case when v_assignment_changed then case when v_driver is not null then v_uid else null end else assigned_by end,estimated_distance_km=v_asphalt+v_gravel,estimated_asphalt_km=v_asphalt,estimated_gravel_km=v_gravel,toll_estimate=v_toll_input,is_holiday=case when p_payload ? 'is_holiday' then coalesce((p_payload->>'is_holiday')::boolean,false) else is_holiday end,currency=case when v_reprice then coalesce(v_quote->>'currency',currency) else currency end,base_subtotal=case when v_reprice then coalesce((v_quote->>'base_subtotal')::numeric,0) else base_subtotal end,surcharge_total=case when v_reprice then coalesce((v_quote->>'surcharge_total')::numeric,0) else surcharge_total end,toll_total=case when v_reprice then coalesce((v_quote->>'toll_total')::numeric,0) else toll_total end,copay_total=case when v_reprice then coalesce((v_quote->>'copay_total')::numeric,0) else copay_total end,estimated_total=case when v_reprice then coalesce((v_quote->>'estimated_total')::numeric,0) else estimated_total end,company_estimated_total=case when v_reprice then coalesce((v_quote->>'company_estimated_total')::numeric,0) else company_estimated_total end,pricing_snapshot=case when v_reprice then v_quote else pricing_snapshot end,route_distance_meters=case when p_payload ? 'route_distance_meters' then nullif(p_payload->>'route_distance_meters','')::integer else route_distance_meters end,route_duration_seconds=case when p_payload ? 'route_duration_seconds' then nullif(p_payload->>'route_duration_seconds','')::integer else route_duration_seconds end,route_toll_estimate=case when p_payload ? 'route_toll_estimate' then nullif(p_payload->>'route_toll_estimate','')::numeric else route_toll_estimate end,route_toll_currency=case when p_payload ? 'route_toll_currency' then nullif(p_payload->>'route_toll_currency','') else route_toll_currency end,route_provider=case when p_payload ? 'route_provider' then nullif(p_payload->>'route_provider','') else route_provider end,route_calculated_at=case when p_payload ? 'route_calculated_at' then nullif(p_payload->>'route_calculated_at','')::timestamptz else route_calculated_at end,route_legs=case when p_payload ? 'route_legs' then coalesce(p_payload->'route_legs','[]'::jsonb) else route_legs end,operator_notes=case when p_payload ? 'operator_notes' then nullif(btrim(p_payload->>'operator_notes'),'') else operator_notes end,driver_instructions=case when p_payload ? 'driver_instructions' then nullif(btrim(p_payload->>'driver_instructions'),'') else driver_instructions end,updated_by=v_uid,updated_at=now() where service_id=p_service_id returning * into v_service;
  if v_reprice then delete from public.operator_service_items where service_id=p_service_id;insert into public.operator_service_items(service_id,concept_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id) values(p_service_id,v_primary.concept_id,'primary',v_primary.code,v_provider_code,v_primary.name,'service',1,0,0,0,'general',jsonb_build_object('role','primary','concept_id',v_primary.concept_id,'service_name',v_primary.name,'provider_code',v_provider_code,'pricing_model','rate_card_v4'),0,v_legacy_category);for v_component in select value from jsonb_array_elements(coalesce(v_quote->'components','[]'::jsonb)) loop v_requires_own:=coalesce((v_component->>'requires_own_code')::boolean,false);if v_requires_own then v_instance_code:=nullif(btrim(coalesce(v_item_codes->>(v_component->>'concept_id'),'')),'');if v_instance_code is null then raise exception 'El servicio % requiere código propio de prestadora',v_component->>'service_name';end if;else v_instance_code:=v_provider_code;end if;insert into public.operator_service_items(service_id,concept_id,rate_item_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id,matrix_rate_id) values(p_service_id,(v_component->>'concept_id')::uuid,nullif(v_component->>'rate_item_id','')::uuid,v_component->>'role',v_component->>'service_code',v_instance_code,v_component->>'service_name',v_component->>'pricing_unit',(v_component->>'quantity')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'subtotal')::numeric,coalesce(nullif(v_component->>'price_source',''),'general'),v_component,case v_component->>'role' when 'movement' then 10 when 'distance' then 20 else 30 end,v_legacy_category,null);end loop;end if;
  select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'item_role',item_role,'quantity',quantity,'instance_code',instance_code) order by sort_order),'[]'::jsonb) into v_after_items from public.operator_service_items where service_id=p_service_id;select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) into v_after_tolls from public.operator_service_tolls t where t.service_id=p_service_id;
  v_after:=jsonb_build_object('company_id',v_service.company_id,'billing_base_id',v_service.billing_base_id,'primary_concept_id',v_service.primary_concept_id,'service_order_number',v_service.service_order_number,'scheduled_for',v_service.scheduled_for,'priority',v_service.priority,'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,'origin',v_service.origin,'destination',v_service.destination,'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,'items',v_after_items,'tolls',v_after_tolls);
  select coalesce(array_agg(a.key order by a.key),'{}'::text[]) into v_changed_fields from jsonb_each(v_after) a left join jsonb_each(v_before) b on b.key=a.key where a.value is distinct from b.value;if cardinality(v_changed_fields)=0 then return jsonb_build_object('service_id',v_service.service_id,'no_changes',true,'changed_fields','[]'::jsonb);end if;
  select sc.name into v_concept_name from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;
  if v_service.trip_id is not null then update public.trips set nro_servicio=coalesce(nullif(v_service.service_order_number,''),v_service.service_number),patente=v_service.vehicle_plate,tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),origin=v_service.origin,destination=v_service.destination,notes=concat_ws(E'\n',nullif(notes,''),case when v_reason is not null then 'Corrección administrativa: '||v_reason end),received_at=now(),sync_status='synced' where trip_id=v_service.trip_id;end if;
  if v_service.remito_id is not null and not v_remito_locked then update public.remitos set nro_servicio=coalesce(nullif(v_service.service_order_number,''),nro_servicio),patente=coalesce(nullif(v_service.vehicle_plate,''),patente),marca_modelo=v_service.vehicle_make_model,razon_social=v_service.customer_name,telefono=v_service.customer_phone,email_cliente=v_service.customer_email,tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),origen=v_service.origin,destino=v_service.destination,imp_peaje=case when v_has_tolls then v_toll_input else imp_peaje end,historial_ediciones=coalesce(historial_ediciones,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('edited_at',now(),'edited_by',v_uid,'reason',v_reason,'fields',to_jsonb(v_changed_fields))),received_at=now(),sync_status='synced' where remito_id=v_service.remito_id;end if;
  insert into public.operator_service_changes(service_id,service_status,trip_id,remito_id,changed_fields,before_values,after_values,change_reason,changed_by,is_test) values(p_service_id,v_service.status,v_service.trip_id,v_service.remito_id,v_changed_fields,v_before,v_after,v_reason,v_uid,v_service.is_test);insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by) values(p_service_id,'service_edit',v_service.status,v_service.status,concat_ws(' · ','Campos: '||array_to_string(v_changed_fields,', '),case when v_reason is not null then 'Motivo: '||v_reason end),v_uid);
  return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'changed_fields',to_jsonb(v_changed_fields),'no_changes',false);
end;$function$;

revoke all on function app_private.update_operator_service_administrative_core_v1(uuid,jsonb,text) from public,anon,authenticated;

create or replace function app_private.service_administrative_commercial_v1(p_service_id uuid)
returns jsonb language plpgsql set search_path='' as $$
declare s public.operator_services%rowtype; a jsonb; c jsonb;
begin
 select * into s from public.operator_services where service_id=p_service_id;
 if s.administrative_commercial is not null then return s.administrative_commercial; end if;
 a:=public.get_driver_remito_addons_v2(s.remito_id);
 c:=jsonb_build_object('toll_coverage_mode',s.toll_coverage_mode,
 'tolls',coalesce((select jsonb_agg(x||jsonb_build_object('payer_agent',case s.toll_coverage_mode when 'provider_roundtrip' then 'provider' when 'customer_roundtrip' then 'customer' end)) from jsonb_array_elements(coalesce(a->'tolls','[]')) x),'[]'::jsonb),
 'excess_charges',coalesce((select jsonb_agg(x||jsonb_build_object('payer_agent','customer')) from jsonb_array_elements(coalesce(a->'excesses','[]')) x),'[]'::jsonb));
 return c;
end; $$;
revoke all on function app_private.service_administrative_commercial_v1(uuid) from public,anon,authenticated;

create or replace function app_private.validate_administrative_commercial_v1(p_service_id uuid,p_company_id uuid,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare s public.operator_services%rowtype; x jsonb; original jsonb; id uuid; report_id uuid; client_id uuid; qty numeric; unit numeric; payer text; label text; mode text; kind text; id_key text; report_key text; result jsonb; arr jsonb; seen text[];
begin
 select * into s from public.operator_services where service_id=p_service_id;
 mode:=nullif(p_data->>'toll_coverage_mode','');
 if mode is not null and mode not in ('mixed_manual','provider_roundtrip','customer_roundtrip') then raise exception 'Formato de cobro inválido'; end if;
 result:=jsonb_build_object('toll_coverage_mode',mode);
 foreach kind in array array['tolls','excess_charges'] loop
  if jsonb_typeof(p_data->kind) is distinct from 'array' then raise exception 'Los cargos deben enviarse como listas'; end if;
  if jsonb_array_length(p_data->kind)>100 then raise exception 'Demasiados cargos'; end if;
  arr:='[]'; seen:='{}';
  id_key:=case kind when 'tolls' then 'toll_id' else 'concept_id' end;
  report_key:=case kind when 'tolls' then 'toll_report_id' else 'excess_report_id' end;
  for x in select value from jsonb_array_elements(p_data->kind) loop
   id:=nullif(x->>id_key,'')::uuid; report_id:=nullif(x->>report_key,'')::uuid;
   original:=null;
   if report_id is not null then
    if kind='tolls' then select to_jsonb(t) into original from public.remito_toll_reports t where t.toll_report_id=report_id and t.remito_id=s.remito_id;
    else select to_jsonb(e) into original from public.remito_excess_reports e where e.excess_report_id=report_id and e.remito_id=s.remito_id; end if;
    if original is null then raise exception 'El cargo no pertenece al remito'; end if;
   end if;
   client_id:=coalesce(nullif(x->>'review_line_client_id','')::uuid,gen_random_uuid());
   if coalesce(report_id,client_id)::text=any(seen) then raise exception 'Cargo duplicado'; end if;
   seen:=array_append(seen,coalesce(report_id,client_id)::text);
   qty:=(x->>'quantity')::numeric; unit:=(x->>'unit_amount')::numeric; payer:=x->>'payer_agent';
   if qty is null or unit is null or qty<=0 or unit<=0 or qty>100000 or unit>100000000 or qty::text='NaN' or unit::text='NaN' then raise exception 'Cantidad e importe deben ser positivos'; end if;
   if kind='tolls' and qty<>trunc(qty) then raise exception 'La cantidad de peajes debe ser entera'; end if;
   if payer is null or payer not in ('customer','provider') then raise exception 'Seleccioná quién debe pagar cada cargo'; end if;
   if kind='tolls' then
    if mode is null then raise exception 'Seleccioná el formato de cobro de peajes'; end if;
    if (mode='provider_roundtrip' and payer<>'provider') or (mode='customer_roundtrip' and payer<>'customer') then raise exception 'El pagador no coincide con el formato de peajes'; end if;
    select name into label from public.toll_locations where toll_id=id and is_active;
   else
    select name into label from public.service_concepts c where concept_id=id and is_active and service_category in ('secondary','mixed') and billing_family<>'system'
     and exists(select 1 from public.company_service_settings cs where cs.company_id=p_company_id and cs.concept_id=id and cs.is_enabled);
   end if;
   if label is null then raise exception 'Concepto inexistente o no habilitado'; end if;
   arr:=arr||jsonb_build_array(jsonb_build_object(id_key,id,report_key,report_id,
    'review_line_client_id',case when report_id is null then client_id end,
    case kind when 'tolls' then 'toll_name' else 'concept_name' end,label,
    'quantity',qty,'unit_amount',round(unit,2),'total_amount',round(qty*round(unit,2),2),'currency','ARS','payer_agent',payer,
    'customer_payment_method',original->>'customer_payment_method',
    'reported_total_amount',original->'total_amount','payment_method',coalesce(original->>'payment_method','manual')));
  end loop;
  result:=result||jsonb_build_object(kind,arr);
 end loop;
 return result;
end; $$;
revoke all on function app_private.validate_administrative_commercial_v1(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.update_operator_service_v4(p_service_id uuid,p_payload jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operator_services%rowtype; r public.remitos%rowtype; result jsonb; before_data jsonb; after_data jsonb; commercial jsonb; k text; keys text[]; fields text[]; signed boolean; payload jsonb:=coalesce(p_payload,'{}');
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para editar servicios'; end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found then raise exception 'Servicio inexistente'; end if;
 select * into r from public.remitos where remito_id=s.remito_id for update;
 signed:=r.status='firmado' or r.firmado_at is not null;
 if not coalesce(signed,false) then return public.update_operator_service_v3(p_service_id,payload-'administrative_revision',p_reason); end if;
 if s.status in ('completed','cancelled') or s.billing_status='invoiced' then raise exception 'El servicio cerrado sólo admite consulta en este flujo'; end if;
 if coalesce((payload->>'administrative_revision')::integer,-1)<>s.administrative_revision then raise exception 'El servicio cambió. Volvé a abrirlo antes de guardar'; end if;
 keys:=array['company_id','billing_base_id','primary_concept_id','category_id','service_order_number','scheduled_for','priority','logistics_type','estimated_arrival_at','estimated_finish_at','granted_delay_minutes','origin','destination','origin_lat','origin_lng','destination_lat','destination_lng','origin_place_id','destination_place_id','origin_formatted_address','destination_formatted_address','estimated_asphalt_km','estimated_gravel_km','estimated_distance_km','is_holiday','items','item_codes','operator_notes','driver_instructions','route_distance_meters','route_duration_seconds','route_toll_estimate','route_toll_currency','route_provider','route_calculated_at','route_legs','administrative_commercial','administrative_revision'];
 for k in select jsonb_object_keys(payload) loop
  if not k=any(keys) then raise exception 'Campo protegido o no permitido: %',k; end if;
 end loop;
 before_data:=to_jsonb(s)-'pricing_snapshot'-'billing_snapshot';
 commercial:=case when payload?'administrative_commercial' then app_private.validate_administrative_commercial_v1(p_service_id,coalesce(nullif(payload->>'company_id','')::uuid,s.company_id),payload->'administrative_commercial') else app_private.service_administrative_commercial_v1(p_service_id) end;
 if payload?'company_id' and s.administrative_commercial is not null and not payload?'administrative_commercial' then
  commercial:=app_private.validate_administrative_commercial_v1(p_service_id,(payload->>'company_id')::uuid,commercial);
 end if;
 result:=app_private.update_operator_service_administrative_core_v1(p_service_id,payload-'administrative_commercial'-'administrative_revision',coalesce(p_reason,'Corrección administrativa posterior a la firma'));
 if payload?'administrative_commercial' then
  update public.operator_services set administrative_commercial=commercial,toll_coverage_mode=nullif(commercial->>'toll_coverage_mode','') where service_id=p_service_id;
 end if;
 select to_jsonb(os)-'pricing_snapshot'-'billing_snapshot' into after_data from public.operator_services os where service_id=p_service_id;
 select array_agg(a.key) into fields from jsonb_each(after_data) a where a.key not in ('updated_at','updated_by') and a.value is distinct from before_data->a.key;
 if coalesce(cardinality(fields),0)=0 then return result||jsonb_build_object('administrative_revision',s.administrative_revision,'no_changes',true); end if;
 update public.operator_services set administrative_revision=administrative_revision+1,updated_by=auth.uid(),updated_at=now(),
  document_status='submitted',administrative_review_status='pending',billing_status='not_ready' where service_id=p_service_id;
 insert into public.operator_service_changes(service_id,service_status,trip_id,remito_id,changed_fields,before_values,after_values,changed_by,is_test)
 values(p_service_id,s.status,s.trip_id,s.remito_id,fields,before_data,after_data,auth.uid(),s.is_test);
 insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
 values(p_service_id,'administrative_remito_correction',s.status,s.status,'Corrección administrativa posterior a la firma',auth.uid(),jsonb_build_object('fields',fields,'revision',s.administrative_revision+1));
 return result||jsonb_build_object('administrative_revision',s.administrative_revision+1);
end; $$;
revoke all on function public.update_operator_service_v4(uuid,jsonb,text) from public,anon;
grant execute on function public.update_operator_service_v4(uuid,jsonb,text) to authenticated;

create or replace function public.get_operator_service_handoff_context_v2(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; s public.operator_services%rowtype; changes jsonb; signed boolean;
begin
 ctx:=public.get_operator_service_handoff_context_v1(p_service_id);
 select * into s from public.operator_services where service_id=p_service_id;
 signed:=ctx#>>'{service,remito_status}'='firmado';
 select coalesce(jsonb_agg(jsonb_build_object('at',c.changed_at,'by',u.full_name,'fields',c.changed_fields,'before',(select jsonb_object_agg(key,value) from jsonb_each(c.before_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode'])),'after',(select jsonb_object_agg(key,value) from jsonb_each(c.after_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode']))) order by c.changed_at desc),'[]')
 into changes from (select * from public.operator_service_changes where service_id=p_service_id order by changed_at desc limit 30) c left join public.users u on u.user_id=c.changed_by
 where c.service_id=p_service_id and c.remito_id=s.remito_id;
 return ctx||jsonb_build_object('administrative_edit',coalesce(signed,false),
 'administrative_revision',s.administrative_revision,'administrative_changes',changes,
 'administrative_commercial',case when signed then app_private.service_administrative_commercial_v1(p_service_id) end,
 'has_administrative_corrections',s.administrative_revision>0,
 'locks',(ctx->'locks')||case when signed then jsonb_build_object('requires_reason',false,'can_edit',s.status not in ('completed','cancelled') and s.billing_status<>'invoiced','customer_locked',true) else '{}'::jsonb end);
end; $$;
revoke all on function public.get_operator_service_handoff_context_v2(uuid) from public,anon;
grant execute on function public.get_operator_service_handoff_context_v2(uuid) to authenticated;

create or replace function public.create_and_link_driver_service_intake_v2(p_intake_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; edits jsonb; id uuid; k text;
begin
 -- Existing function locks and authenticates the intake, creates and links atomically.
 result:=public.create_and_link_driver_service_intake_v1(p_intake_id,p_payload);
 if coalesce((result->>'idempotent')::boolean,false) then return result; end if;
 id:=(result->>'service_id')::uuid; edits:='{}';
 foreach k in array array['service_order_number','origin','destination','origin_lat','origin_lng','destination_lat','destination_lng','origin_place_id','destination_place_id','origin_formatted_address','destination_formatted_address','administrative_commercial'] loop
  if p_payload?k then edits:=edits||jsonb_build_object(k,p_payload->k); end if;
 end loop;
 perform public.update_operator_service_v4(id,edits||jsonb_build_object('administrative_revision',0));
 return result;
end; $$;
revoke all on function public.create_and_link_driver_service_intake_v2(uuid,jsonb) from public,anon;
grant execute on function public.create_and_link_driver_service_intake_v2(uuid,jsonb) to authenticated;

create or replace function public.get_operator_service_remito_review_v3(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; s public.operator_services%rowtype; c jsonb; tolls jsonb; excesses jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion','supervision','facturacion') then raise exception 'Sin permiso para consultar'; end if;
 d:=public.get_operator_service_remito_review_v2(p_service_id);
 select * into s from public.operator_services where service_id=p_service_id;
 d:=d||jsonb_build_object('administrative_revision',s.administrative_revision);
 if s.administrative_commercial is null then return d; end if;
 c:=s.administrative_commercial;
 tolls:=coalesce(c->'tolls','[]'); excesses:=coalesce(c->'excess_charges','[]');
 -- Keep excluded originals in the decision set; exclusion is not deletion of a signed line.
 tolls:=tolls||coalesce((select jsonb_agg(x||jsonb_build_object('administratively_excluded',true)) from jsonb_array_elements(d#>'{reported,tolls}') x where not exists(select 1 from jsonb_array_elements(tolls) a where a->>'toll_report_id'=x->>'toll_report_id')),'[]'::jsonb);
 excesses:=excesses||coalesce((select jsonb_agg(x||jsonb_build_object('administratively_excluded',true)) from jsonb_array_elements(d#>'{reported,excesses}') x where not exists(select 1 from jsonb_array_elements(excesses) a where a->>'excess_report_id'=x->>'excess_report_id')),'[]'::jsonb);
 return d||jsonb_build_object('original_reported',d->'reported','administrative_corrections',true,
 'reported',jsonb_build_object('tolls',tolls,'excesses',excesses),
 'service',(d->'service')||jsonb_build_object('toll_coverage_mode',s.toll_coverage_mode));
end; $$;
revoke all on function public.get_operator_service_remito_review_v3(uuid) from public,anon;
grant execute on function public.get_operator_service_remito_review_v3(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.resolve_operator_service_document_v5(p_service_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_from_status text;
  v_toll_decisions jsonb := coalesce(p_payload->'tolls','[]'::jsonb);
  v_excess_decisions jsonb := coalesce(p_payload->'excesses','[]'::jsonb);
  v_row jsonb;
  t public.remito_toll_reports%rowtype;
  x public.remito_excess_reports%rowtype;
  l public.toll_locations%rowtype;
  c public.service_concepts%rowtype;
  v_report_id uuid;
  v_client_line_id uuid;
  v_decision text;
  v_reason text;
  v_toll_id uuid;
  v_concept_id uuid;
  v_name text;
  v_qty numeric;
  v_unit numeric;
  v_method text;
  v_payer text;
  v_collector text;
  v_customer_method text;
  v_provider_unit numeric;
  v_customer_unit numeric;
  v_service_toll_id uuid;
  v_excess_charge_id uuid;
  v_changed boolean;
  v_adjusted boolean := false;
  v_toll_total numeric := 0;
  v_excess_total numeric := 0;
  v_missing text[];
  v_has_review boolean;
  v_stale_toll_ids uuid[];
  v_stale_excess_ids uuid[];
  v_stale_review_snapshot jsonb;
begin
  if v_uid is null or coalesce(v_role,'') not in ('administracion','operador') then
    raise exception 'Solo Operaciones o Administración puede aprobar y finalizar el servicio';
  end if;
  if lower(btrim(coalesce(p_action,''))) <> 'approve_and_finalize' then
    raise exception 'Acción documental inválida';
  end if;
  if jsonb_typeof(v_toll_decisions) <> 'array' or jsonb_typeof(v_excess_decisions) <> 'array' then
    raise exception 'La revisión debe contener listas';
  end if;

  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id = s.remito_id for update;
  if not found or r.status <> 'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado y recibido';
  end if;

  if s.status = 'completed' and s.document_status = 'approved' then
    return jsonb_build_object(
      'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
      'document_status',s.document_status,'billing_status',s.billing_status,
      'review_status',r.addons_review_status,'idempotent',true
    );
  end if;
  if s.status not in ('at_origin','completed') then
    raise exception 'El servicio debe estar ARRIBADO para aprobar el remito y finalizar';
  end if;
  if s.document_status not in ('submitted','approved') then
    raise exception 'El remito no está pendiente de revisión';
  end if;

  if s.status = 'at_origin' then
    v_missing := app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
    if cardinality(v_missing) > 0 then
      raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', ');
    end if;
  end if;

  select exists(
    select 1 from public.operator_service_document_addon_reviews rv
    where rv.service_id = p_service_id and rv.remito_id = r.remito_id
  ) into v_has_review;

  if v_has_review and s.document_status <> 'approved' then
    if exists(
      select 1
      from public.operator_invoice_services invoice_service
      where invoice_service.service_id = p_service_id
    ) or exists(
      select 1
      from public.operator_invoice_tolls invoice_toll
      join public.operator_service_document_addon_reviews stale_review
        on stale_review.service_toll_id = invoice_toll.service_toll_id
      where stale_review.service_id = p_service_id
        and stale_review.remito_id = r.remito_id
    ) then
      raise exception 'El servicio tiene una revisión ya utilizada por Facturación y no puede reemplazarse';
    end if;

    select
      coalesce(jsonb_agg(to_jsonb(stale_review) order by stale_review.reviewed_at),'[]'::jsonb),
      coalesce(array_agg(stale_review.service_toll_id) filter (where stale_review.service_toll_id is not null),'{}'::uuid[]),
      coalesce(array_agg(stale_review.excess_charge_id) filter (where stale_review.excess_charge_id is not null),'{}'::uuid[])
    into v_stale_review_snapshot,v_stale_toll_ids,v_stale_excess_ids
    from public.operator_service_document_addon_reviews stale_review
    where stale_review.service_id = p_service_id
      and stale_review.remito_id = r.remito_id;

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      p_service_id,'stale_remito_review_replaced',s.status,s.status,
      'Revisión previa reemplazada antes de aprobar y finalizar',v_uid,
      jsonb_build_object(
        'remito_id',r.remito_id,
        'previous_reviews',v_stale_review_snapshot,
        'actor_role',v_role
      )
    );

    delete from public.operator_service_document_addon_reviews
    where service_id = p_service_id and remito_id = r.remito_id;
    delete from public.operator_service_tolls
    where service_toll_id = any(v_stale_toll_ids);
    delete from public.operator_service_excess_charges
    where excess_charge_id = any(v_stale_excess_ids);
    v_has_review := false;
  end if;

  if s.administrative_revision>0 and coalesce((p_payload->>'administrative_revision')::integer,-1)<>s.administrative_revision then raise exception 'Las correcciones cambiaron. Volvé a abrir la revisión'; end if;
  if not v_has_review then
    if exists(
      select 1 from public.remito_toll_reports rt
      where rt.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_toll_decisions) d(row)
          where nullif(d.row->>'toll_report_id','')::uuid = rt.toll_report_id
        )
    ) then
      raise exception 'Revisá todos los peajes antes de aprobar';
    end if;
    if exists(
      select 1 from public.remito_excess_reports re
      where re.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_excess_decisions) d(row)
          where nullif(d.row->>'excess_report_id','')::uuid = re.excess_report_id
        )
    ) then
      raise exception 'Revisá todos los excedentes antes de aprobar';
    end if;

    for v_row in select value from jsonb_array_elements(v_toll_decisions) loop
      v_report_id := nullif(v_row->>'toll_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de peaje inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de peaje no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un peaje agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into t from public.remito_toll_reports where toll_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el peaje'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
        continue;
      end if;

      v_toll_id := nullif(v_row->>'toll_id','')::uuid;
      v_name := nullif(btrim(v_row->>'toll_name'),'');
      if v_toll_id is not null then
        select * into l from public.toll_locations where toll_id = v_toll_id;
        if not found then raise exception 'Peaje aceptado inexistente'; end if;
        v_name := l.name;
      elsif v_name is null then raise exception 'Indicá el peaje aceptado';
      end if;
      v_qty := greatest(coalesce(nullif(v_row->>'quantity','')::numeric,t.quantity,1),1);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,t.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del peaje debe ser mayor a cero'; end if;
      v_method := lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),t.payment_method,'manual'));
      if v_method not in ('cash','electronic','telepass','manual','other') then raise exception 'Medio de peaje inválido'; end if;
      v_payer := lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),'provider'));
      if v_payer not in ('provider','customer') then raise exception 'Responsable comercial de peaje inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_payer = 'customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo pagó el cliente el peaje';
      end if;
      if v_payer = 'provider' then
        v_provider_unit := v_unit; v_customer_unit := 0; v_customer_method := null;
      else
        v_provider_unit := 0; v_customer_unit := v_unit;
      end if;
      v_changed := v_report_id is null
        or v_toll_id is distinct from t.toll_id
        or round(v_qty,2) is distinct from t.quantity::numeric
        or v_unit is distinct from t.unit_amount
        or v_method is distinct from t.payment_method;
      if v_changed or v_decision = 'adjusted' then
        
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_tolls(
        service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
        vehicle_category,payment_method,quantity,unit_amount,currency,source,crossed_at,notes,created_by,updated_by,
        is_test,payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,remito_toll_report_id
      ) values (
        p_service_id,v_toll_id,null,case when v_toll_id is null then t.toll_code_snapshot else l.code end,v_name,
        case when v_toll_id is null then t.road_snapshot else l.road end,
        case when v_toll_id is null then t.direction_snapshot else l.direction end,
        'light_2_axles',case when v_method='other' then 'manual' else v_method end,v_qty::integer,
        v_unit,coalesce(t.currency,'ARS'),'actual',t.crossed_at,v_reason,v_uid,v_uid,s.is_test,
        v_payer,v_customer_method,v_provider_unit,v_customer_unit,v_report_id
      ) returning service_toll_id into v_service_toll_id;
      v_toll_total := v_toll_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,service_toll_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,jsonb_build_object(
          'toll_id',v_toll_id,'toll_name',v_name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(t.currency,'ARS'),'payment_method',v_method,
          'payer_agent',v_payer,'customer_payment_method',v_customer_method,
          'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
        ),v_reason,v_service_toll_id,v_uid,s.is_test
      );
    end loop;

    for v_row in select value from jsonb_array_elements(v_excess_decisions) loop
      v_report_id := nullif(v_row->>'excess_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'review_reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de excedente inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de excedente no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un excedente agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into x from public.remito_excess_reports where excess_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los excedentes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el excedente'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
        continue;
      end if;

      v_concept_id := coalesce(nullif(v_row->>'concept_id','')::uuid,x.concept_id);
      select * into c from public.service_concepts
      where concept_id = v_concept_id and is_active and default_can_be_secondary and billing_family <> 'system';
      if not found then raise exception 'Seleccioná el concepto comercial del excedente'; end if;
      v_qty := round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,x.quantity,1),0.01),2);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,x.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
      v_payer := coalesce(nullif(v_row->>'payer_agent',''),'customer');
      if v_payer not in ('customer','provider') then raise exception 'Responsable de excedente inválido'; end if;
      v_collector := case when v_payer='provider' then 'provider' else lower(coalesce(nullif(btrim(v_row->>'collector_agent'),''),'company')) end;
      if v_collector not in ('company','provider') then raise exception 'Cobrador del excedente inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_collector = 'company' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo se cobró el excedente';
      end if;
      if v_collector = 'provider' then v_customer_method := null; end if;
      v_changed := v_report_id is null or v_concept_id is distinct from x.concept_id or v_qty is distinct from x.quantity or v_unit is distinct from x.unit_amount;
      if v_changed or v_decision = 'adjusted' then
        
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_excess_charges(
        service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
        customer_payment_method,created_by,updated_by,is_test,source,remito_excess_report_id
      ) values (
        p_service_id,v_concept_id,c.name,v_qty,v_unit,coalesce(x.currency,'ARS'),v_payer,v_collector,v_customer_method,
        v_uid,v_uid,s.is_test,'actual',v_report_id
      ) returning excess_charge_id into v_excess_charge_id;
      v_excess_total := v_excess_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,excess_charge_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,jsonb_build_object(
          'concept_id',v_concept_id,'concept_name',c.name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(x.currency,'ARS'),'payer_agent',v_payer,'collector_agent',v_collector,
          'customer_payment_method',v_customer_method
        ),v_reason,v_excess_charge_id,v_uid,s.is_test
      );
    end loop;

    update public.remitos set
      addons_review_status = case when v_adjusted then 'adjusted' else 'approved' end,
      accepted_imp_peaje = round(v_toll_total,2),
      accepted_imp_excedente = round(v_excess_total,2),
      accepted_imp_total_extras = round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2),
      addons_reviewed_by = v_uid,
      addons_reviewed_at = now()
    where remito_id = r.remito_id returning * into r;
  end if;

  v_from_status := s.status;
  perform set_config('app.phase3_bridge','1',true);
  if s.status = 'at_origin' and s.trip_id is not null then
    update public.trips set
      fecha_hora_fin = coalesce(fecha_hora_fin,now()),
      received_at = now(),
      sync_status = 'synced',
      km_traveled = coalesce(r.km_reales,km_traveled)
    where trip_id = s.trip_id;
  end if;

  perform set_config('app.lifecycle_transition','finalize',true);
  perform set_config('app.assignment_reason','finalized',true);
  perform set_config('app.remito_atomic_finalize','1',true);
  update public.operator_services set
    document_status = 'approved',
    administrative_review_status = 'approved',
    status = case when status='at_origin' then 'completed' else status end,
    completed_at = case when status='at_origin' then coalesce(completed_at,now()) else completed_at end,
    billing_status = 'pending',
    assigned_driver_id = case when status='at_origin' then null else assigned_driver_id end,
    assigned_truck_id = case when status='at_origin' then null else assigned_truck_id end,
    updated_by = v_uid,
    updated_at = now()
  where service_id = p_service_id returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values (
    p_service_id,'remito_approved_and_service_finalized',v_from_status,s.status,
    case when v_from_status='completed'
      then 'Remito aprobado; servicio histórico habilitado para Facturación'
      else 'Remito aprobado y servicio finalizado' end,
    v_uid,jsonb_build_object(
      'remito_id',r.remito_id,'review_status',r.addons_review_status,
      'reported_toll_total',coalesce(r.imp_peaje,0),'accepted_toll_total',r.accepted_imp_peaje,
      'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_excess_total',r.accepted_imp_excedente,
      'actor_role',v_role
    )
  );

  return jsonb_build_object(
    'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
    'document_status',s.document_status,'billing_status',s.billing_status,
    'review_status',r.addons_review_status,'idempotent',false
  );
end;
$function$;

revoke all on function public.resolve_operator_service_document_v5(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_operator_service_document_v5(uuid,text,jsonb) to authenticated;
