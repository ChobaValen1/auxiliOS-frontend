-- AuxiliOS · update_operator_service: una API pública, dos responsabilidades internas.
-- Las correcciones no tarifarias no dependen de la configuración comercial vigente.
-- Los cambios que alteran precio/ruta siguen usando el motor canónico completo.

alter function public.update_operator_service(uuid,jsonb,text) set schema app_private;
alter function app_private.update_operator_service(uuid,jsonb,text) rename to update_operator_service_full;
revoke all on function app_private.update_operator_service_full(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function app_private.update_operator_service_full(uuid,jsonb,text) to service_role;

create or replace function public.update_operator_service(p_service_id uuid,p_payload jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_service public.operator_services%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_reason text := nullif(btrim(p_reason),'');
  v_remito_status text;
  v_remito_signed_at timestamptz;
  v_remito_locked boolean := false;
  v_trip_started boolean := false;
  v_nonpricing_structural boolean := false;
  v_requires_reprice boolean := false;
  v_current_tolls jsonb := '[]'::jsonb;
  v_new_driver uuid;
  v_new_truck integer;
  v_active_driver uuid;
  v_new_code text;
  v_new_customer_name text;
  v_new_customer_phone text;
  v_new_customer_email text;
  v_new_plate text;
  v_new_vehicle text;
  v_new_priority text;
  v_new_logistics text;
  v_new_arrival timestamptz;
  v_new_finish timestamptz;
  v_new_delay integer;
  v_new_operator_notes text;
  v_new_driver_notes text;
  v_concept_name text;
begin
  if v_uid is null or v_role not in ('administracion','operador') then
    raise exception 'Sin permiso para editar servicios';
  end if;

  select * into v_service
  from public.operator_services
  where service_id=p_service_id
  for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado y no puede editarse'; end if;

  v_trip_started := v_service.trip_id is not null or v_service.status not in ('pending','assigned');
  if v_service.remito_id is not null then
    select status,firmado_at into v_remito_status,v_remito_signed_at
    from public.remitos where remito_id=v_service.remito_id;
    v_remito_locked := coalesce(v_remito_status in ('firmado','cerrado_admin'),false) or v_remito_signed_at is not null;
  end if;

  -- Operador no administra importes de peajes. Un frontend productivo anterior puede
  -- enviar `tolls: []` porque el contexto está redactado; se ignora para no borrar datos.
  if v_role='operador' then v_payload := v_payload - 'tolls'; end if;

  -- El frontend productivo anterior manda muchos campos aunque no hayan cambiado.
  -- Los quitamos cuando son iguales para decidir por el cambio real y no por presencia de keys.
  if v_payload ? 'company_id' and nullif(v_payload->>'company_id','')::uuid is not distinct from v_service.company_id then v_payload:=v_payload-'company_id'; end if;
  if v_payload ? 'billing_base_id' and nullif(v_payload->>'billing_base_id','')::uuid is not distinct from v_service.billing_base_id then v_payload:=v_payload-'billing_base_id'; end if;
  if v_payload ? 'primary_concept_id' and nullif(v_payload->>'primary_concept_id','')::uuid is not distinct from v_service.primary_concept_id then v_payload:=v_payload-'primary_concept_id'; end if;
  if v_payload ? 'category_id' and nullif(v_payload->>'category_id','')::uuid is not distinct from v_service.primary_concept_id then v_payload:=v_payload-'category_id'; end if;
  if v_payload ? 'scheduled_for' and nullif(v_payload->>'scheduled_for','')::timestamptz is not distinct from v_service.scheduled_for then v_payload:=v_payload-'scheduled_for'; end if;
  if v_payload ? 'origin' and btrim(coalesce(v_payload->>'origin','')) is not distinct from coalesce(v_service.origin,'') then v_payload:=v_payload-'origin'; end if;
  if v_payload ? 'destination' and btrim(coalesce(v_payload->>'destination','')) is not distinct from coalesce(v_service.destination,'') then v_payload:=v_payload-'destination'; end if;
  if v_payload ? 'estimated_distance_km' and greatest(coalesce(nullif(v_payload->>'estimated_distance_km','')::numeric,0),0) is not distinct from coalesce(v_service.estimated_distance_km,0) then v_payload:=v_payload-'estimated_distance_km'; end if;
  if v_payload ? 'estimated_asphalt_km' and greatest(coalesce(nullif(v_payload->>'estimated_asphalt_km','')::numeric,0),0) is not distinct from coalesce(v_service.estimated_asphalt_km,v_service.estimated_distance_km,0) then v_payload:=v_payload-'estimated_asphalt_km'; end if;
  if v_payload ? 'estimated_gravel_km' and greatest(coalesce(nullif(v_payload->>'estimated_gravel_km','')::numeric,0),0) is not distinct from coalesce(v_service.estimated_gravel_km,0) then v_payload:=v_payload-'estimated_gravel_km'; end if;
  if v_payload ? 'is_holiday' and coalesce((v_payload->>'is_holiday')::boolean,false) is not distinct from coalesce(v_service.is_holiday,false) then v_payload:=v_payload-'is_holiday'; end if;
  if v_payload ? 'toll_estimate' and greatest(coalesce(nullif(v_payload->>'toll_estimate','')::numeric,0),0) is not distinct from coalesce(v_service.toll_estimate,0) then v_payload:=v_payload-'toll_estimate'; end if;

  if v_role='administracion' and v_payload ? 'tolls' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'toll_id',t.toll_id,
      'toll_rate_id',t.toll_rate_id,
      'toll_name',t.toll_name_snapshot,
      'vehicle_category',t.vehicle_category,
      'payment_method',t.payment_method,
      'quantity',t.quantity,
      'unit_amount',t.unit_amount,
      'currency',t.currency,
      'source',t.source,
      'notes',t.notes
    )) order by t.created_at),'[]'::jsonb)
    into v_current_tolls
    from public.operator_service_tolls t
    where t.service_id=p_service_id and t.source in ('planned','manual');
    if coalesce(v_payload->'tolls','[]'::jsonb)=v_current_tolls then v_payload:=v_payload-'tolls'; end if;
  end if;

  v_requires_reprice :=
    v_payload ?| array[
      'company_id','billing_base_id','primary_concept_id','category_id','scheduled_for',
      'items','item_codes','estimated_distance_km','estimated_asphalt_km','estimated_gravel_km',
      'toll_estimate','tolls','is_holiday','origin','destination','origin_lat','origin_lng',
      'destination_lat','destination_lng','origin_place_id','destination_place_id',
      'origin_formatted_address','destination_formatted_address','route_distance_meters',
      'route_duration_seconds','route_toll_estimate','route_toll_currency','route_provider',
      'route_calculated_at','route_legs'
    ];

  if v_requires_reprice then
    return app_private.update_operator_service_full(p_service_id,v_payload,v_reason);
  end if;

  -- Correcciones operativas que no alteran la cotización.
  v_new_code := case when v_payload ? 'service_order_number' then nullif(btrim(v_payload->>'service_order_number'),'') else v_service.service_order_number end;
  if v_new_code is null then raise exception 'El código de prestadora es obligatorio'; end if;
  v_new_customer_name := case when v_payload ? 'customer_name' then nullif(btrim(v_payload->>'customer_name'),'') else v_service.customer_name end;
  v_new_customer_phone := case when v_payload ? 'customer_phone' then nullif(btrim(v_payload->>'customer_phone'),'') else v_service.customer_phone end;
  v_new_customer_email := case when v_payload ? 'customer_email' then nullif(btrim(v_payload->>'customer_email'),'') else v_service.customer_email end;
  v_new_plate := case when v_payload ? 'vehicle_plate' then upper(nullif(btrim(v_payload->>'vehicle_plate'),'')) else v_service.vehicle_plate end;
  v_new_vehicle := case when v_payload ? 'vehicle_make_model' then nullif(btrim(v_payload->>'vehicle_make_model'),'') else v_service.vehicle_make_model end;
  v_new_priority := case when v_payload ? 'priority' then coalesce(nullif(lower(btrim(v_payload->>'priority')),''),v_service.priority) else v_service.priority end;
  if v_new_priority not in ('normal','urgent','critical') then raise exception 'Prioridad inválida'; end if;
  v_new_logistics := case when v_payload ? 'logistics_type' then coalesce(nullif(lower(btrim(v_payload->>'logistics_type')),''),v_service.logistics_type) else v_service.logistics_type end;
  if v_new_logistics not in ('own','third_party') then raise exception 'Tipo de logística inválido'; end if;
  v_new_arrival := case when v_payload ? 'estimated_arrival_at' then nullif(v_payload->>'estimated_arrival_at','')::timestamptz else v_service.estimated_arrival_at end;
  v_new_finish := case when v_payload ? 'estimated_finish_at' then nullif(v_payload->>'estimated_finish_at','')::timestamptz else v_service.estimated_finish_at end;
  v_new_delay := case when v_payload ? 'granted_delay_minutes' then greatest(coalesce(nullif(v_payload->>'granted_delay_minutes','')::integer,0),0) else v_service.granted_delay_minutes end;
  v_new_operator_notes := case when v_payload ? 'operator_notes' then nullif(btrim(v_payload->>'operator_notes'),'') else v_service.operator_notes end;
  v_new_driver_notes := case when v_payload ? 'driver_instructions' then nullif(btrim(v_payload->>'driver_instructions'),'') else v_service.driver_instructions end;
  v_new_driver := case when v_payload ? 'assigned_driver_id' then nullif(v_payload->>'assigned_driver_id','')::uuid else v_service.assigned_driver_id end;
  v_new_truck := case when v_payload ? 'assigned_truck_id' then nullif(v_payload->>'assigned_truck_id','')::integer else v_service.assigned_truck_id end;

  v_nonpricing_structural :=
    v_new_code is distinct from v_service.service_order_number or
    v_new_customer_name is distinct from v_service.customer_name or
    v_new_customer_phone is distinct from v_service.customer_phone or
    v_new_customer_email is distinct from v_service.customer_email or
    v_new_plate is distinct from v_service.vehicle_plate or
    v_new_vehicle is distinct from v_service.vehicle_make_model;

  if v_remito_locked and v_nonpricing_structural then
    raise exception 'El remito ya está firmado o cerrado. Los datos estructurales no pueden modificarse';
  end if;
  if v_trip_started and v_nonpricing_structural and v_reason is null then
    raise exception 'Indicá el motivo de la corrección porque el viaje ya fue iniciado';
  end if;
  if v_trip_started and (v_new_driver is distinct from v_service.assigned_driver_id or v_new_truck is distinct from v_service.assigned_truck_id) then
    raise exception 'La reasignación de un servicio iniciado debe hacerse desde Reasignar';
  end if;
  if (v_new_driver is null) <> (v_new_truck is null) then raise exception 'Chofer y móvil deben asignarse juntos'; end if;

  if v_new_driver is distinct from v_service.assigned_driver_id or v_new_truck is distinct from v_service.assigned_truck_id then
    if v_new_truck is not null then
      select dl.driver_id into v_active_driver
      from public.daily_logs dl
      where dl.truck_id=v_new_truck
        and dl.log_date=(v_service.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
        and coalesce(dl.status,'open')='open' and dl.hora_fin is null
      order by dl.hora_inicio desc,dl.log_id desc limit 1;
      if v_active_driver is not null then v_new_driver:=v_active_driver; end if;
    end if;
    if v_new_driver is not null and not exists(
      select 1 from public.users u join public.roles r on r.role_id=u.role_id
      where u.user_id=v_new_driver and coalesce(u.is_active,true) and r.name='chofer'
    ) then raise exception 'Chofer inválido o inactivo'; end if;
    if v_new_truck is not null and not exists(select 1 from public.trucks t where t.truck_id=v_new_truck and t.status='active') then raise exception 'Móvil inválido o inactivo'; end if;
  end if;

  v_before := jsonb_build_object(
    'service_order_number',v_service.service_order_number,
    'purchase_order_number',v_service.purchase_order_number,
    'priority',v_service.priority,
    'logistics_type',v_service.logistics_type,
    'customer_name',v_service.customer_name,
    'customer_phone',v_service.customer_phone,
    'customer_email',v_service.customer_email,
    'vehicle_plate',v_service.vehicle_plate,
    'vehicle_make_model',v_service.vehicle_make_model,
    'estimated_arrival_at',v_service.estimated_arrival_at,
    'estimated_finish_at',v_service.estimated_finish_at,
    'granted_delay_minutes',v_service.granted_delay_minutes,
    'assigned_driver_id',v_service.assigned_driver_id,
    'assigned_truck_id',v_service.assigned_truck_id,
    'operator_notes',v_service.operator_notes,
    'driver_instructions',v_service.driver_instructions
  );

  update public.operator_services set
    status=case when status in ('pending','assigned') then case when v_new_driver is not null and v_new_truck is not null then 'assigned' else 'pending' end else status end,
    service_order_number=v_new_code,
    purchase_order_number=case when v_payload ? 'purchase_order_number' then nullif(btrim(v_payload->>'purchase_order_number'),'') else purchase_order_number end,
    priority=v_new_priority,
    logistics_type=v_new_logistics,
    customer_name=v_new_customer_name,
    customer_phone=v_new_customer_phone,
    customer_email=v_new_customer_email,
    vehicle_plate=v_new_plate,
    vehicle_make_model=v_new_vehicle,
    estimated_arrival_at=v_new_arrival,
    estimated_finish_at=v_new_finish,
    granted_delay_minutes=v_new_delay,
    assigned_driver_id=v_new_driver,
    assigned_truck_id=v_new_truck,
    assigned_at=case when v_new_driver is distinct from assigned_driver_id or v_new_truck is distinct from assigned_truck_id then case when v_new_driver is null then null else now() end else assigned_at end,
    assigned_by=case when v_new_driver is distinct from assigned_driver_id or v_new_truck is distinct from assigned_truck_id then case when v_new_driver is null then null else v_uid end else assigned_by end,
    operator_notes=v_new_operator_notes,
    driver_instructions=v_new_driver_notes,
    updated_by=v_uid,
    updated_at=now()
  where service_id=p_service_id
  returning * into v_service;

  if v_new_code is distinct from (v_before->>'service_order_number') then
    update public.operator_service_items
    set instance_code=v_new_code,updated_at=now()
    where service_id=p_service_id and instance_code=(v_before->>'service_order_number');
  end if;

  v_after := jsonb_build_object(
    'service_order_number',v_service.service_order_number,
    'purchase_order_number',v_service.purchase_order_number,
    'priority',v_service.priority,
    'logistics_type',v_service.logistics_type,
    'customer_name',v_service.customer_name,
    'customer_phone',v_service.customer_phone,
    'customer_email',v_service.customer_email,
    'vehicle_plate',v_service.vehicle_plate,
    'vehicle_make_model',v_service.vehicle_make_model,
    'estimated_arrival_at',v_service.estimated_arrival_at,
    'estimated_finish_at',v_service.estimated_finish_at,
    'granted_delay_minutes',v_service.granted_delay_minutes,
    'assigned_driver_id',v_service.assigned_driver_id,
    'assigned_truck_id',v_service.assigned_truck_id,
    'operator_notes',v_service.operator_notes,
    'driver_instructions',v_service.driver_instructions
  );

  select coalesce(array_agg(a.key order by a.key),'{}'::text[])
  into v_changed_fields
  from jsonb_each(v_after) a
  join jsonb_each(v_before) b on b.key=a.key
  where a.value is distinct from b.value;

  if cardinality(v_changed_fields)=0 then
    return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'changed_fields','[]'::jsonb,'no_changes',true);
  end if;

  select sc.name into v_concept_name from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;
  if v_service.trip_id is not null then
    update public.trips set
      nro_servicio=coalesce(nullif(v_service.service_order_number,''),v_service.service_number),
      patente=v_service.vehicle_plate,
      tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),
      notes=concat_ws(E'\n',nullif(notes,''),case when v_reason is not null then 'Corrección administrativa: '||v_reason end),
      received_at=now(),sync_status='synced'
    where trip_id=v_service.trip_id;
  end if;
  if v_service.remito_id is not null and not v_remito_locked then
    update public.remitos set
      nro_servicio=coalesce(nullif(v_service.service_order_number,''),nro_servicio),
      patente=coalesce(nullif(v_service.vehicle_plate,''),patente),
      marca_modelo=v_service.vehicle_make_model,
      razon_social=v_service.customer_name,
      telefono=v_service.customer_phone,
      email_cliente=v_service.customer_email,
      tipo_servicio=coalesce(nullif(v_concept_name,''),tipo_servicio),
      historial_ediciones=coalesce(historial_ediciones,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('edited_at',now(),'edited_by',v_uid,'reason',v_reason,'fields',to_jsonb(v_changed_fields))),
      received_at=now(),sync_status='synced'
    where remito_id=v_service.remito_id;
  end if;

  insert into public.operator_service_changes(service_id,service_status,trip_id,remito_id,changed_fields,before_values,after_values,change_reason,changed_by,is_test)
  values(p_service_id,v_service.status,v_service.trip_id,v_service.remito_id,v_changed_fields,v_before,v_after,v_reason,v_uid,v_service.is_test);
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by)
  values(p_service_id,'service_edit',v_service.status,v_service.status,concat_ws(' · ','Campos: '||array_to_string(v_changed_fields,', '),case when v_reason is not null then 'Motivo: '||v_reason end),v_uid);

  return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'changed_fields',to_jsonb(v_changed_fields),'no_changes',false);
end;
$$;

grant execute on function public.update_operator_service(uuid,jsonb,text) to authenticated,service_role;

-- Compatibilidad temporal del editor productivo: Administración conserva los peajes
-- editables; Operador recibe lista vacía y no puede borrar/modificar importes por esta vía.
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
  v_tolls jsonb := '[]'::jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar la edición del servicio'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.remito_id is not null then select status,firmado_at into v_remito_status,v_remito_signed_at from public.remitos where remito_id=v_service.remito_id; end if;
  select coalesce(c.trade_name,c.legal_name) into v_company_name from public.companies c where c.company_id=v_service.company_id;
  select sc.name into v_concept_name from public.service_concepts sc where sc.concept_id=v_service.primary_concept_id;
  select coalesce(jsonb_agg(jsonb_build_object('item_id',i.item_id,'concept_id',i.concept_id,'item_role',i.item_role,'service_name',i.service_name,'pricing_unit',i.pricing_unit,'quantity',i.quantity,'instance_code',i.instance_code,'sort_order',i.sort_order) order by i.sort_order,i.created_at),'[]'::jsonb) into v_items from public.operator_service_items i where i.service_id=p_service_id;
  if v_role='administracion' then
    select coalesce(jsonb_agg(jsonb_build_object('toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,'toll_name_snapshot',t.toll_name_snapshot,'toll_code_snapshot',t.toll_code_snapshot,'road_snapshot',t.road_snapshot,'direction_snapshot',t.direction_snapshot,'vehicle_category',t.vehicle_category,'payment_method',t.payment_method,'quantity',t.quantity,'unit_amount',t.unit_amount,'total_amount',t.total_amount,'currency',t.currency,'source',t.source,'notes',t.notes) order by t.created_at),'[]'::jsonb) into v_tolls from public.operator_service_tolls t where t.service_id=p_service_id;
  end if;
  return jsonb_build_object(
    'service',jsonb_build_object(
      'service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,'priority',v_service.priority,
      'company_id',v_service.company_id,'company_name',v_company_name,'billing_base_id',v_service.billing_base_id,'billing_setting_id',v_service.billing_setting_id,
      'service_order_number',v_service.service_order_number,'purchase_order_number',v_service.purchase_order_number,'scheduled_for',v_service.scheduled_for,
      'estimated_arrival_at',v_service.estimated_arrival_at,'estimated_finish_at',v_service.estimated_finish_at,'granted_delay_minutes',v_service.granted_delay_minutes,
      'logistics_type',v_service.logistics_type,'customer_name',v_service.customer_name,'customer_phone',v_service.customer_phone,'customer_email',v_service.customer_email,
      'vehicle_plate',v_service.vehicle_plate,'vehicle_make_model',v_service.vehicle_make_model,'origin',v_service.origin,'destination',v_service.destination,
      'origin_lat',v_service.origin_lat,'origin_lng',v_service.origin_lng,'destination_lat',v_service.destination_lat,'destination_lng',v_service.destination_lng,
      'origin_place_id',v_service.origin_place_id,'destination_place_id',v_service.destination_place_id,'origin_formatted_address',v_service.origin_formatted_address,
      'destination_formatted_address',v_service.destination_formatted_address,'primary_concept_id',v_service.primary_concept_id,'concept_name',v_concept_name,
      'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'estimated_distance_km',v_service.estimated_distance_km,
      'estimated_asphalt_km',v_service.estimated_asphalt_km,'estimated_gravel_km',v_service.estimated_gravel_km,'is_holiday',v_service.is_holiday,
      'operator_notes',v_service.operator_notes,'driver_instructions',v_service.driver_instructions,'route_distance_meters',v_service.route_distance_meters,
      'route_duration_seconds',v_service.route_duration_seconds,'route_provider',v_service.route_provider,'route_calculated_at',v_service.route_calculated_at,
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
    'tolls',v_tolls
  );
end;
$$;
