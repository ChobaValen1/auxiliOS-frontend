-- Excedentes del servicio (formulario del operador): lista fija de conceptos.
-- Kms excedentes, Extracción, Hora Trabajo, Hora Espera, Viajero y Otro (nombre libre).
-- El importe siempre lo escribe el operador. Estos conceptos no dependen del
-- tarifario ni de la configuración por prestadora.
insert into public.service_concepts(concept_id,code,name,description,default_can_be_primary,default_can_be_secondary,default_pricing_unit,sort_order,is_active,billing_family,distance_chargeable,matrix_visible,input_mode)
values
 ('a1e5c0de-0001-4000-8000-000000000001','excess_km','Kms excedentes','Excedente que carga el operador',false,true,'km',901,true,'variable',false,false,'quantity'),
 ('a1e5c0de-0002-4000-8000-000000000002','excess_work_hour','Hora Trabajo','Excedente que carga el operador',false,true,'hour',903,true,'variable',false,false,'quantity'),
 ('a1e5c0de-0003-4000-8000-000000000003','excess_wait_hour','Hora Espera','Excedente que carga el operador',false,true,'hour',904,true,'variable',false,false,'quantity'),
 ('a1e5c0de-0004-4000-8000-000000000004','excess_traveler','Viajero','Excedente que carga el operador',false,true,'unit',905,true,'variable',false,false,'quantity'),
 ('a1e5c0de-0005-4000-8000-000000000005','excess_other','Otro','Excedente que carga el operador (nombre libre)',false,true,'unit',906,true,'variable',false,false,'quantity')
on conflict (code) do nothing;

CREATE OR REPLACE FUNCTION app_private.normalize_service_commercial_addons_v1(p_company_id uuid, p_scheduled_for timestamp with time zone, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_mode text:=nullif(v_payload->>'toll_coverage_mode','');
  v_date date:=(coalesce(p_scheduled_for,now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_row jsonb;
  v_toll_id uuid;
  v_rate_id uuid;
  v_qty integer;
  v_payer text;
  v_customer_method text;
  v_provider_unit numeric;
  v_customer_unit numeric;
  v_location public.toll_locations%rowtype;
  v_rate public.toll_rates%rowtype;
  v_tolls jsonb:='[]'::jsonb;
  v_excess jsonb:='[]'::jsonb;
  v_billing_tolls jsonb:='[]'::jsonb;
  v_provider_total numeric:=0;
  v_customer_total numeric:=0;
  v_excess_total numeric:=0;
  v_toll_keys text[]:='{}'::text[];
  v_excess_keys text[]:='{}'::text[];
  v_key text;
  v_concept_id uuid;
  v_concept_name text;
  v_concept_code text;
  v_excess_qty numeric;
  v_excess_unit numeric;
  v_currency text;
  v_collector text;
begin
  if jsonb_typeof(coalesce(v_payload->'tolls','[]'::jsonb))<>'array' then raise exception 'Los peajes deben enviarse como una lista'; end if;
  if jsonb_typeof(coalesce(v_payload->'excess_charges','[]'::jsonb))<>'array' then raise exception 'Los excedentes deben enviarse como una lista'; end if;
  if jsonb_array_length(coalesce(v_payload->'tolls','[]'::jsonb))>0 and v_mode not in ('provider_roundtrip','mixed_manual','customer_roundtrip') then
    raise exception 'Seleccioná el formato de cobro de peajes';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(v_payload->'tolls','[]'::jsonb)) loop
    v_toll_id:=nullif(v_row->>'toll_id','')::uuid;
    v_rate_id:=nullif(v_row->>'toll_rate_id','')::uuid;
    v_qty:=greatest(coalesce(nullif(v_row->>'quantity','')::integer,1),1);
    v_payer:=lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),''));
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    if v_toll_id is null then raise exception 'Seleccioná un peaje dado de alta'; end if;
    if v_payer not in ('provider','customer') then raise exception 'Quién paga debe ser Cliente o Prestadora'; end if;
    if v_mode='provider_roundtrip' and v_payer<>'provider' then raise exception 'En formato A cargo de la Prestadora, todos los peajes deben quedar a cargo de la Prestadora'; end if;
    if v_mode='customer_roundtrip' and v_payer<>'customer' then raise exception 'En formato A cargo del cliente, todos los peajes deben quedar a cargo del cliente'; end if;
    if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Cuando paga el cliente, el medio de pago es obligatorio'; end if;
    if v_payer='provider' then v_customer_method:=null; end if;
    v_key:=v_toll_id::text||'|'||v_payer||'|'||coalesce(v_customer_method,'n/a');
    if v_key=any(v_toll_keys) then raise exception 'Ese peaje ya existe con el mismo pagador y medio de pago; aumentá la cantidad'; end if;
    v_toll_keys:=array_append(v_toll_keys,v_key);
    select l.* into v_location from public.toll_locations l where l.toll_id=v_toll_id and l.is_active;
    if not found then raise exception 'Peaje inexistente o inactivo'; end if;
    if v_rate_id is not null then
      select r.* into v_rate from public.toll_rates r
      where r.toll_rate_id=v_rate_id and r.toll_id=v_toll_id and r.is_active
        and r.valid_from<=v_date and (r.valid_until is null or r.valid_until>=v_date);
    else
      select r.* into v_rate from public.toll_rates r
      where r.toll_id=v_toll_id and r.is_active
        and r.valid_from<=v_date and (r.valid_until is null or r.valid_until>=v_date)
      order by (r.vehicle_category='light_2_axles' and r.payment_method='any') desc,r.valid_from desc,r.created_at desc limit 1;
    end if;
    if not found then raise exception 'El peaje % no tiene una tarifa vigente para la fecha del servicio',v_location.name; end if;
    if v_payer='provider' then
      v_provider_unit:=round(v_rate.amount,2); v_customer_unit:=0;
    else
      v_provider_unit:=0; v_customer_unit:=round(v_rate.amount,2);
    end if;
    v_provider_total:=v_provider_total+(v_provider_unit*v_qty);
    v_customer_total:=v_customer_total+(v_customer_unit*v_qty);
    v_tolls:=v_tolls||jsonb_build_array(jsonb_build_object(
      'toll_id',v_location.toll_id,'toll_rate_id',v_rate.toll_rate_id,'toll_code',v_location.code,'toll_name',v_location.name,
      'road',v_location.road,'direction',v_location.direction,'vehicle_category',v_rate.vehicle_category,'payment_method',v_rate.payment_method,
      'quantity',v_qty,'unit_amount',round(v_rate.amount,2),'currency',upper(v_rate.currency),'source','planned',
      'payer_agent',v_payer,'customer_payment_method',v_customer_method,'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
    ));
    if v_provider_unit>0 then
      v_billing_tolls:=v_billing_tolls||jsonb_build_array(jsonb_build_object(
        'toll_id',v_location.toll_id,'toll_rate_id',v_rate.toll_rate_id,'toll_name',v_location.name,
        'vehicle_category',v_rate.vehicle_category,'payment_method',v_rate.payment_method,'quantity',v_qty,
        'unit_amount',v_provider_unit,'currency',upper(v_rate.currency),'source','planned'
      ));
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_payload->'excess_charges','[]'::jsonb)) loop
    v_concept_id:=nullif(v_row->>'concept_id','')::uuid;
    v_excess_qty:=greatest(coalesce(nullif(v_row->>'quantity','')::numeric,1),0);
    v_excess_unit:=round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,0),0),2);
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    v_currency:=upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS'));
    v_collector:=coalesce(nullif(lower(btrim(v_row->>'collector_agent')),''),'company');
    if v_concept_id is null then raise exception 'Seleccioná el concepto del excedente'; end if;
    if v_excess_qty<=0 then raise exception 'La cantidad del excedente debe ser mayor a cero'; end if;
    if v_excess_unit<=0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
    if v_collector not in ('company','provider') then raise exception 'Seleccioná quién cobró el excedente'; end if;
    if v_collector='provider' then
      v_customer_method:=null;
    elsif v_customer_method not in ('cash','transfer','card','mercado_pago','other') then
      raise exception 'Cuando cobra la Empresa, el medio de pago del excedente es obligatorio';
    end if;
    -- Lista fija de excedentes del operador (no dependen de la prestadora) o, por compatibilidad,
    -- un concepto secundario habilitado para la prestadora.
    select sc.name,sc.code into v_concept_name,v_concept_code from public.service_concepts sc
    where sc.concept_id=v_concept_id and sc.is_active and sc.billing_family<>'system' and sc.service_category in ('secondary','mixed')
      and (sc.code in ('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other')
           or exists(select 1 from public.company_service_settings css where css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled));
    if not found then raise exception 'El concepto de excedente no está habilitado para la prestadora'; end if;
    if v_concept_code='excess_other' then
      v_concept_name:=nullif(btrim(coalesce(v_row->>'concept_name','')),'');
      if v_concept_name is null or v_concept_name='Otro' then raise exception 'Escribí qué es el excedente "Otro"'; end if;
      v_concept_name:=left(v_concept_name,80);
    end if;
    v_key:=v_concept_id::text||'|'||lower(v_concept_name)||'|'||to_char(v_excess_unit,'FM999999999999990.00')||'|'||v_collector||'|'||coalesce(v_customer_method,'n/a');
    if v_key=any(v_excess_keys) then raise exception 'Ese excedente ya existe con el mismo importe, cobrador y medio de pago; aumentá la cantidad'; end if;
    v_excess_keys:=array_append(v_excess_keys,v_key);
    v_excess_total:=v_excess_total+(v_excess_qty*v_excess_unit);
    v_excess:=v_excess||jsonb_build_array(jsonb_build_object(
      'concept_id',v_concept_id,'concept_name',v_concept_name,'quantity',v_excess_qty,'unit_amount',v_excess_unit,
      'currency',v_currency,'payer_agent','customer','collector_agent',v_collector,'customer_payment_method',v_customer_method
    ));
  end loop;

  return jsonb_build_object(
    'toll_coverage_mode',v_mode,'tolls',v_tolls,'billing_tolls',v_billing_tolls,
    'excess_charges',v_excess,'provider_toll_total',round(v_provider_total,2),
    'customer_toll_total',round(v_customer_total,2),'customer_excess_total',round(v_excess_total,2)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_service_commercial_addons_v1(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_tolls jsonb;
  v_excess jsonb;
  v_actual_tolls jsonb;
  v_actual_excess jsonb;
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar peajes y excedentes'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,'quantity',t.quantity,
    'payer_agent',coalesce(t.payer_agent,'provider'),'customer_payment_method',t.customer_payment_method,
    'unit_amount',t.unit_amount,'currency',t.currency
  )) order by t.created_at),'[]'::jsonb) into v_tolls
  from public.operator_service_tolls t where t.service_id=p_service_id and t.source in ('planned','manual') and t.toll_id is not null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',e.concept_id,'concept_name',e.concept_name_snapshot,'quantity',e.quantity,'unit_amount',e.unit_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method
  ) order by e.created_at),'[]'::jsonb) into v_excess
  from public.operator_service_excess_charges e where e.service_id=p_service_id and e.source in ('planned','manual');
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'toll_name',t.toll_name_snapshot,'quantity',t.quantity,
    'unit_amount',t.unit_amount,'total_amount',t.total_amount,'currency',t.currency,'payer_agent',t.payer_agent,
    'customer_payment_method',t.customer_payment_method,'crossed_at',t.crossed_at,'source',t.source
  ) order by t.created_at),'[]'::jsonb) into v_actual_tolls
  from public.operator_service_tolls t where t.service_id=p_service_id and t.source='actual';
  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_charge_id',e.excess_charge_id,'concept_id',e.concept_id,'concept_name',e.concept_name_snapshot,
    'quantity',e.quantity,'unit_amount',e.unit_amount,'total_amount',e.total_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method,'source',e.source
  ) order by e.created_at),'[]'::jsonb) into v_actual_excess
  from public.operator_service_excess_charges e where e.service_id=p_service_id and e.source='actual';
  return jsonb_build_object(
    'toll_coverage_mode',coalesce(v_service.toll_coverage_mode,case when jsonb_array_length(v_tolls)>0 then 'provider_roundtrip' end),
    'tolls',v_tolls,'excess_charges',v_excess,'actual_tolls',v_actual_tolls,'actual_excess_charges',v_actual_excess
  );
end;
$function$;
