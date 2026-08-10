-- AuxiliOS · Tarifario V3 · motor de cotización y alta

alter table public.operator_services
  add column if not exists estimated_asphalt_km numeric(12,2) not null default 0,
  add column if not exists estimated_gravel_km numeric(12,2) not null default 0;

do $$ begin
  alter table public.operator_service_items drop constraint operator_service_items_price_source_check;
exception when undefined_object then null;
end $$;
alter table public.operator_service_items
  add constraint operator_service_items_price_source_check
  check (price_source in ('general','branch','billing_base','link_override','price_version','matrix_v3'));

create or replace function public.get_operator_category_tariff_v3(
  p_company_id uuid,
  p_base_id uuid default null,
  p_category_id uuid default null,
  p_as_of date default current_date
) returns jsonb
language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); v_commercial boolean; v_contract uuid; v_card uuid; v_currency text;
begin
  if v_role not in ('administracion','facturacion','operador','supervision') then raise exception 'Sin permiso'; end if;
  v_commercial:=v_role in ('administracion','facturacion');

  select c.contract_id into v_contract
  from public.company_contracts c
  where c.company_id=p_company_id and c.status='active' and c.valid_from<=p_as_of and (c.valid_until is null or c.valid_until>=p_as_of)
  order by c.is_primary desc,c.valid_from desc,c.created_at desc limit 1;
  if v_contract is null then raise exception 'La prestadora no tiene un contrato vigente'; end if;

  select r.rate_card_id,r.currency into v_card,v_currency
  from public.company_rate_cards r
  where r.contract_id=v_contract and r.status='active' and r.valid_from<=p_as_of and (r.valid_until is null or r.valid_until>=p_as_of)
  order by r.version desc,r.valid_from desc limit 1;
  if v_card is null then raise exception 'El contrato no tiene un tarifario publicado y vigente'; end if;

  if p_category_id is not null and not exists(
    select 1 from public.company_service_category_settings s
    join public.service_categories c on c.category_id=s.category_id and c.is_active
    where s.company_id=p_company_id and s.category_id=p_category_id and s.is_enabled
  ) then raise exception 'La categoría no está habilitada para la prestadora'; end if;

  return jsonb_build_object(
    'contract_id',v_contract,'rate_card_id',v_card,'currency',v_currency,'as_of',p_as_of,
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object('category_id',c.category_id,'code',c.code,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.name)
      from public.company_service_category_settings s
      join public.service_categories c on c.category_id=s.category_id and c.is_active
      where s.company_id=p_company_id and s.is_enabled
    ),'[]'::jsonb),
    'concepts',case when p_category_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'concept_id',sc.concept_id,'code',sc.code,'name',sc.name,'pricing_unit',r.pricing_unit,
          'quantity_source',sc.quantity_source,'auto_apply',sc.auto_apply,
          'requires_own_code',coalesce(css.requires_own_code,false),
          'tariff_type_code',tt.code,'tariff_type_name',tt.name,
          'rate_version_id',case when v_commercial then r.rate_version_id else null end,
          'unit_price',case when v_commercial then r.unit_price else null end,
          'currency',case when v_commercial then r.currency else null end
        ) order by sc.sort_order,sc.name
      )
      from public.service_concepts sc
      join public.company_service_settings css on css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled
      join lateral (
        select rr.* from public.company_tariff_matrix_rates rr
        where rr.company_id=p_company_id and rr.category_id=p_category_id and rr.concept_id=sc.concept_id and rr.is_current
          and rr.valid_from<=p_as_of and (rr.valid_until is null or rr.valid_until>=p_as_of)
          and (rr.billing_base_id is null or rr.billing_base_id=p_base_id)
        order by (rr.billing_base_id=p_base_id) desc nulls last,rr.valid_from desc,rr.revision desc limit 1
      ) r on true
      left join lateral (
        select t.code,t.name from public.tariff_type_service_links l join public.tariff_types t on t.tariff_type_id=l.tariff_type_id and t.is_active
        where l.concept_id=sc.concept_id and l.is_active order by t.sort_order limit 1
      ) tt on true
      where sc.matrix_visible and sc.is_active and sc.billing_family<>'system'
    ),'[]'::jsonb) end
  );
end $$;

create or replace function app_private.calculate_operator_service_quote_v3_full(
  p_company_id uuid,
  p_base_id uuid,
  p_scheduled_for timestamptz,
  p_category_id uuid,
  p_items jsonb default '[]'::jsonb,
  p_asphalt_km numeric default 0,
  p_gravel_km numeric default 0,
  p_toll_amount numeric default 0,
  p_is_holiday boolean default false
) returns jsonb
language plpgsql
set search_path='public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_local timestamp:=coalesce(p_scheduled_for,now()) at time zone 'America/Argentina/Buenos_Aires';
  v_date date:=v_local::date; v_time time:=v_local::time; v_dow integer:=extract(dow from v_local)::integer;
  v_contract public.company_contracts%rowtype; v_card public.company_rate_cards%rowtype;
  v_category public.service_categories%rowtype; v_rate public.company_tariff_matrix_rates%rowtype;
  v_rule public.company_rate_rules%rowtype; v_billing public.company_rate_billing_settings%rowtype;
  v_auto record; v_manual jsonb; v_concept record; v_qty numeric; v_subtotal numeric;
  v_components jsonb:='[]'::jsonb; v_surcharges jsonb:='[]'::jsonb;
  v_base numeric:=0; v_eligible numeric:=0; v_charge numeric:=0; v_surcharge_total numeric:=0;
  v_toll numeric:=0; v_total numeric:=0; v_copay numeric:=0; v_company_total numeric:=0;
  v_applies boolean; v_currency text:=null; v_seen uuid[]:='{}'::uuid[];
begin
  if v_role not in ('administracion','facturacion','operador','supervision') then raise exception 'Sin permiso para cotizar servicios'; end if;
  if coalesce(p_asphalt_km,0)<0 or coalesce(p_gravel_km,0)<0 or coalesce(p_toll_amount,0)<0 then raise exception 'Kilómetros o peaje inválidos'; end if;

  select * into v_category from public.service_categories where category_id=p_category_id and is_active;
  if not found then raise exception 'Categoría inválida'; end if;
  if not exists(select 1 from public.company_service_category_settings where company_id=p_company_id and category_id=p_category_id and is_enabled) then
    raise exception 'La categoría no está habilitada para la prestadora';
  end if;

  select c.* into v_contract from public.company_contracts c
  where c.company_id=p_company_id and c.status='active' and c.valid_from<=v_date and (c.valid_until is null or c.valid_until>=v_date)
  order by c.is_primary desc,c.valid_from desc,c.created_at desc limit 1;
  if not found then raise exception 'La prestadora no tiene un contrato vigente'; end if;
  select r.* into v_card from public.company_rate_cards r
  where r.contract_id=v_contract.contract_id and r.status='active' and r.valid_from<=v_date and (r.valid_until is null or r.valid_until>=v_date)
  order by r.version desc,r.valid_from desc limit 1;
  if not found then raise exception 'El contrato no tiene un tarifario publicado y vigente'; end if;
  v_currency:=v_card.currency;

  for v_auto in
    select sc.concept_id,sc.code,sc.name,sc.quantity_source,sc.sort_order,
           coalesce(css.requires_own_code,false) requires_own_code,
           tt.code tariff_type_code,tt.name tariff_type_name
    from public.service_concepts sc
    join public.company_service_settings css on css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled
    left join lateral (
      select t.code,t.name from public.tariff_type_service_links l join public.tariff_types t on t.tariff_type_id=l.tariff_type_id and t.is_active
      where l.concept_id=sc.concept_id and l.is_active order by t.sort_order limit 1
    ) tt on true
    where sc.matrix_visible and sc.is_active and sc.auto_apply
    order by sc.sort_order,sc.name
  loop
    select rr.* into v_rate from public.company_tariff_matrix_rates rr
    where rr.company_id=p_company_id and rr.category_id=p_category_id and rr.concept_id=v_auto.concept_id and rr.is_current
      and rr.valid_from<=v_date and (rr.valid_until is null or rr.valid_until>=v_date)
      and (rr.billing_base_id is null or rr.billing_base_id=p_base_id)
    order by (rr.billing_base_id=p_base_id) desc nulls last,rr.valid_from desc,rr.revision desc limit 1;
    if not found then continue; end if;
    v_qty:=case v_auto.quantity_source
      when 'one' then 1
      when 'asphalt_km' then coalesce(p_asphalt_km,0)
      when 'gravel_km' then coalesce(p_gravel_km,0)
      else 0 end;
    if v_qty<=0 then continue; end if;
    if v_rate.currency<>v_currency then raise exception 'La matriz contiene monedas distintas para una misma cotización'; end if;
    v_subtotal:=round(v_qty*v_rate.unit_price,2);
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role',case when v_auto.quantity_source in ('asphalt_km','gravel_km') then 'distance' else 'movement' end,
      'component_type',case when v_auto.quantity_source in ('asphalt_km','gravel_km') then 'distance' else 'movement' end,
      'tariff_type',v_auto.tariff_type_code,'tariff_type_name',v_auto.tariff_type_name,
      'category_id',p_category_id,'category_name',v_category.name,
      'concept_id',v_auto.concept_id,'rate_version_id',v_rate.rate_version_id,
      'service_code',v_auto.code,'service_name',v_auto.name,'pricing_unit',v_rate.pricing_unit,
      'quantity_source',v_auto.quantity_source,'quantity',v_qty,'unit_price',v_rate.unit_price,'subtotal',v_subtotal,
      'requires_own_code',v_auto.requires_own_code,'price_source','matrix_v3',
      'rate_valid_from',v_rate.valid_from,'rate_valid_until',v_rate.valid_until
    ));
    v_base:=v_base+v_subtotal;
  end loop;

  for v_manual in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    begin
      if nullif(v_manual->>'concept_id','') is null then raise exception 'Concepto inválido'; end if;
      if (v_manual->>'concept_id')::uuid=any(v_seen) then raise exception 'El mismo concepto no puede agregarse dos veces'; end if;
      v_seen:=array_append(v_seen,(v_manual->>'concept_id')::uuid);
    exception when invalid_text_representation then raise exception 'Concepto inválido'; end;

    select sc.concept_id,sc.code,sc.name,sc.quantity_source,sc.auto_apply,
           coalesce(css.requires_own_code,false) requires_own_code,
           tt.code tariff_type_code,tt.name tariff_type_name
    into v_concept
    from public.service_concepts sc
    join public.company_service_settings css on css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled
    left join lateral (
      select t.code,t.name from public.tariff_type_service_links l join public.tariff_types t on t.tariff_type_id=l.tariff_type_id and t.is_active
      where l.concept_id=sc.concept_id and l.is_active order by t.sort_order limit 1
    ) tt on true
    where sc.concept_id=(v_manual->>'concept_id')::uuid and sc.matrix_visible and sc.is_active;
    if not found then raise exception 'Un concepto seleccionado no está habilitado para la prestadora'; end if;
    if v_concept.auto_apply then raise exception 'El concepto % se calcula automáticamente',v_concept.name; end if;
    v_qty:=coalesce(nullif(v_manual->>'quantity','')::numeric,1);
    if v_qty<=0 then raise exception 'La cantidad de % debe ser mayor a cero',v_concept.name; end if;

    select rr.* into v_rate from public.company_tariff_matrix_rates rr
    where rr.company_id=p_company_id and rr.category_id=p_category_id and rr.concept_id=v_concept.concept_id and rr.is_current
      and rr.valid_from<=v_date and (rr.valid_until is null or rr.valid_until>=v_date)
      and (rr.billing_base_id is null or rr.billing_base_id=p_base_id)
    order by (rr.billing_base_id=p_base_id) desc nulls last,rr.valid_from desc,rr.revision desc limit 1;
    if not found then raise exception 'El concepto % no tiene tarifa vigente para %',v_concept.name,v_category.name; end if;
    if v_rate.currency<>v_currency then raise exception 'La matriz contiene monedas distintas para una misma cotización'; end if;
    v_subtotal:=round(v_qty*v_rate.unit_price,2);
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','secondary','component_type','variable','tariff_type',v_concept.tariff_type_code,'tariff_type_name',v_concept.tariff_type_name,
      'category_id',p_category_id,'category_name',v_category.name,
      'concept_id',v_concept.concept_id,'rate_version_id',v_rate.rate_version_id,
      'service_code',v_concept.code,'service_name',v_concept.name,'pricing_unit',v_rate.pricing_unit,
      'quantity_source',v_concept.quantity_source,'quantity',v_qty,'unit_price',v_rate.unit_price,'subtotal',v_subtotal,
      'requires_own_code',v_concept.requires_own_code,'price_source','matrix_v3',
      'rate_valid_from',v_rate.valid_from,'rate_valid_until',v_rate.valid_until
    ));
    v_base:=v_base+v_subtotal;
  end loop;

  for v_rule in select * from public.company_rate_rules where rate_card_id=v_card.rate_card_id and enabled order by rule_type loop
    v_applies:=false;
    if v_rule.rule_type='night' and v_rule.start_time is not null and v_rule.end_time is not null then
      v_applies:=case when v_rule.start_time<=v_rule.end_time then v_time between v_rule.start_time and v_rule.end_time else v_time>=v_rule.start_time or v_time<=v_rule.end_time end;
    elsif v_rule.rule_type='weekend_holiday' then
      if v_dow=6 and v_rule.saturday_start is not null and v_rule.saturday_end is not null then
        v_applies:=case when v_rule.saturday_start<=v_rule.saturday_end then v_time between v_rule.saturday_start and v_rule.saturday_end else v_time>=v_rule.saturday_start or v_time<=v_rule.saturday_end end;
      elsif (v_dow=0 or p_is_holiday) and v_rule.sunday_holiday_start is not null and v_rule.sunday_holiday_end is not null then
        v_applies:=case when v_rule.sunday_holiday_start<=v_rule.sunday_holiday_end then v_time between v_rule.sunday_holiday_start and v_rule.sunday_holiday_end else v_time>=v_rule.sunday_holiday_start or v_time<=v_rule.sunday_holiday_end end;
      end if;
    elsif v_rule.rule_type='wide_coverage' then
      v_applies:=(coalesce(p_asphalt_km,0)+coalesce(p_gravel_km,0))>=coalesce(v_rule.distance_threshold_km,0) and coalesce(v_rule.distance_threshold_km,0)>0;
    end if;
    if v_applies then
      select coalesce(sum((x.value->>'subtotal')::numeric),0) into v_eligible
      from jsonb_array_elements(v_components) x(value)
      where not exists(select 1 from public.company_rate_rule_exceptions e where e.rule_id=v_rule.rule_id and e.concept_id=(x.value->>'concept_id')::uuid);
      v_charge:=case when v_eligible<=0 then 0 when v_rule.calculation_mode='fixed' then v_rule.amount else round(v_eligible*v_rule.amount/100,2) end;
      if v_charge>0 then
        v_surcharge_total:=v_surcharge_total+v_charge;
        v_surcharges:=v_surcharges||jsonb_build_array(jsonb_build_object(
          'rule_id',v_rule.rule_id,'rule_type',v_rule.rule_type,'calculation_mode',v_rule.calculation_mode,
          'configured_value',v_rule.amount,'eligible_base',v_eligible,'amount',v_charge
        ));
      end if;
    end if;
  end loop;

  select b.* into v_billing from public.company_rate_billing_settings b where b.rate_card_id=v_card.rate_card_id;
  if found and v_billing.toll_enabled and v_billing.toll_invoice_enabled then
    v_toll:=case v_billing.toll_mode when 'fixed' then v_billing.toll_fixed_amount when 'at_cost' then p_toll_amount else 0 end;
  end if;
  v_total:=round(v_base+v_surcharge_total+v_toll,2);
  if found and v_billing.copay_enabled then
    v_copay:=case when v_billing.copay_mode='percentage' then round(v_total*v_billing.copay_value/100,2) else v_billing.copay_value end;
    v_copay:=least(greatest(v_copay,0),v_total);
  end if;
  v_company_total:=v_total-v_copay;

  return jsonb_build_object(
    'pricing_valid',true,'pricing_model','matrix_v3','company_id',p_company_id,'billing_base_id',p_base_id,
    'contract_id',v_contract.contract_id,'contract_name',v_contract.name,'rate_card_id',v_card.rate_card_id,
    'rate_card_name',v_card.name,'rate_card_version',v_card.version,'currency',v_currency,
    'scheduled_for',p_scheduled_for,'category_id',p_category_id,'category_name',v_category.name,
    'components',v_components,'surcharges',v_surcharges,
    'asphalt_km',coalesce(p_asphalt_km,0),'gravel_km',coalesce(p_gravel_km,0),
    'distance_km',coalesce(p_asphalt_km,0)+coalesce(p_gravel_km,0),'toll_input',p_toll_amount,'is_holiday',p_is_holiday,
    'base_subtotal',round(v_base,2),'surcharge_total',round(v_surcharge_total,2),'toll_total',round(v_toll,2),
    'copay_total',round(v_copay,2),'estimated_total',round(v_total,2),'company_estimated_total',round(v_company_total,2),
    'calculated_at',now()
  );
end $$;

create or replace function public.calculate_operator_service_quote_v3(
  p_company_id uuid,p_base_id uuid,p_scheduled_for timestamptz,p_category_id uuid,
  p_items jsonb default '[]'::jsonb,p_asphalt_km numeric default 0,p_gravel_km numeric default 0,
  p_toll_amount numeric default 0,p_is_holiday boolean default false
) returns jsonb
language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); v_full jsonb; v_components jsonb;
begin
  if v_role not in ('administracion','facturacion','operador','supervision') then raise exception 'Sin permiso para cotizar servicios'; end if;
  v_full:=app_private.calculate_operator_service_quote_v3_full(p_company_id,p_base_id,p_scheduled_for,p_category_id,p_items,p_asphalt_km,p_gravel_km,p_toll_amount,p_is_holiday);
  if v_role in ('administracion','facturacion') then return v_full; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'role',x->>'role','category_id',x->>'category_id','concept_id',x->>'concept_id','service_code',x->>'service_code',
    'service_name',x->>'service_name','pricing_unit',x->>'pricing_unit','quantity',coalesce((x->>'quantity')::numeric,1),
    'quantity_source',x->>'quantity_source','requires_own_code',coalesce((x->>'requires_own_code')::boolean,false)
  )),'[]'::jsonb) into v_components from jsonb_array_elements(coalesce(v_full->'components','[]'::jsonb)) x;
  return jsonb_build_object(
    'pricing_valid',true,'pricing_model','matrix_v3','company_id',v_full->'company_id','billing_base_id',v_full->'billing_base_id',
    'contract_name',v_full->'contract_name','rate_card_name',v_full->'rate_card_name','rate_card_version',v_full->'rate_card_version',
    'scheduled_for',v_full->'scheduled_for','category_id',v_full->'category_id','category_name',v_full->'category_name',
    'components',v_components,'asphalt_km',v_full->'asphalt_km','gravel_km',v_full->'gravel_km','distance_km',v_full->'distance_km',
    'has_surcharges',jsonb_array_length(coalesce(v_full->'surcharges','[]'::jsonb))>0,
    'tolls_included',coalesce((v_full->>'toll_total')::numeric,0)>0,'calculated_at',v_full->'calculated_at'
  );
end $$;

create or replace function public.create_operator_service_v3(p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role(); v_quote jsonb; v_service public.operator_services%rowtype;
  v_component jsonb; v_category public.service_categories%rowtype; v_driver uuid; v_active_driver uuid; v_truck integer;
  v_scheduled timestamptz; v_status text; v_base_id uuid:=nullif(coalesce(p_payload->>'billing_base_id',p_payload->>'branch_id'),'')::uuid;
  v_setting public.company_billing_settings%rowtype; v_base public.billing_bases%rowtype; v_legacy_branch uuid; v_date date;
  v_provider_code text:=trim(coalesce(p_payload->>'service_order_number','')); v_instance_code text; v_requires_own boolean;
  v_make_model text;
begin
  if v_role not in ('administracion','operador') then raise exception 'Sin permiso para crear servicios'; end if;
  if v_provider_code='' then raise exception 'El código de prestadora es obligatorio'; end if;
  v_scheduled:=coalesce(nullif(p_payload->>'scheduled_for','')::timestamptz,now());
  v_date:=(v_scheduled at time zone 'America/Argentina/Buenos_Aires')::date;
  select * into v_category from public.service_categories where category_id=(p_payload->>'category_id')::uuid and is_active;
  if not found or v_category.legacy_primary_concept_id is null then raise exception 'Categoría inválida'; end if;

  v_driver:=nullif(p_payload->>'assigned_driver_id','')::uuid; v_truck:=nullif(p_payload->>'assigned_truck_id','')::integer;
  if v_truck is not null then
    select dl.driver_id into v_active_driver from public.daily_logs dl
    where dl.truck_id=v_truck and dl.log_date=v_date and coalesce(dl.status,'open')='open' and dl.hora_fin is null
    order by dl.hora_inicio desc,dl.log_id desc limit 1;
    if v_active_driver is not null then v_driver:=v_active_driver; end if;
  end if;
  if v_driver is not null and v_truck is null then raise exception 'Para asignar un chofer también debe seleccionarse el móvil'; end if;
  if v_driver is not null and not exists(select 1 from public.users u join public.roles r on r.role_id=u.role_id where u.user_id=v_driver and coalesce(u.is_active,true) and r.name='chofer') then raise exception 'Chofer inválido o inactivo'; end if;
  if v_truck is not null and not exists(select 1 from public.trucks t where t.truck_id=v_truck and t.status='active') then raise exception 'Móvil inválido o inactivo'; end if;

  select s.* into v_setting from public.company_billing_settings s
  where s.company_id=(p_payload->>'company_id')::uuid and s.is_active and s.valid_from<=v_date and (s.valid_until is null or s.valid_until>=v_date)
    and (s.contract_id is null or s.contract_id=(select c.contract_id from public.company_contracts c where c.company_id=(p_payload->>'company_id')::uuid and c.status='active' and c.valid_from<=v_date and (c.valid_until is null or c.valid_until>=v_date) order by c.is_primary desc,c.valid_from desc,c.created_at desc limit 1))
  order by (s.contract_id is not null) desc,s.valid_from desc,s.created_at desc limit 1;
  if v_setting.billing_setting_id is not null then
    if v_base_id is null then raise exception 'Seleccioná una base habilitada por la prestadora'; end if;
    select b.* into v_base from public.company_billing_base_links l join public.billing_bases b on b.base_id=l.base_id
    where l.billing_setting_id=v_setting.billing_setting_id and l.base_id=v_base_id and l.is_active and b.is_active;
    if not found then raise exception 'La base no está habilitada para la prestadora'; end if;
  elsif v_base_id is not null then raise exception 'La prestadora no tiene configuración de facturación vigente'; end if;

  v_quote:=app_private.calculate_operator_service_quote_v3_full(
    (p_payload->>'company_id')::uuid,v_base_id,v_scheduled,v_category.category_id,
    coalesce(p_payload->'items','[]'::jsonb),coalesce(nullif(p_payload->>'estimated_asphalt_km','')::numeric,0),
    coalesce(nullif(p_payload->>'estimated_gravel_km','')::numeric,0),coalesce(nullif(p_payload->>'toll_estimate','')::numeric,0),
    coalesce((p_payload->>'is_holiday')::boolean,false)
  );
  v_status:=case when v_driver is not null and v_truck is not null then 'assigned' else 'pending' end;
  select branch_id into v_legacy_branch from public.company_branches where branch_id=v_base_id;
  v_make_model:=nullif(trim(coalesce(nullif(p_payload->>'vehicle_make_model',''),concat_ws(' ',nullif(p_payload->>'vehicle_make',''),nullif(p_payload->>'vehicle_model','')))), '');

  insert into public.operator_services(
    status,priority,company_id,branch_id,billing_setting_id,billing_base_id,billing_snapshot,
    contract_id,rate_card_id,service_order_number,purchase_order_number,requested_at,scheduled_for,
    estimated_arrival_at,estimated_finish_at,granted_delay_minutes,logistics_type,
    customer_name,customer_phone,customer_email,vehicle_plate,vehicle_make_model,
    origin,destination,origin_lat,origin_lng,destination_lat,destination_lng,
    origin_place_id,destination_place_id,origin_formatted_address,destination_formatted_address,
    primary_concept_id,category_id,assigned_driver_id,assigned_truck_id,assigned_at,assigned_by,
    estimated_distance_km,estimated_asphalt_km,estimated_gravel_km,toll_estimate,is_holiday,currency,base_subtotal,
    surcharge_total,toll_total,copay_total,estimated_total,company_estimated_total,
    pricing_snapshot,route_distance_meters,route_duration_seconds,route_toll_estimate,
    route_toll_currency,route_provider,route_calculated_at,route_legs,
    operator_notes,driver_instructions,created_by,updated_by
  ) values(
    v_status,coalesce(nullif(p_payload->>'priority',''),'normal'),(p_payload->>'company_id')::uuid,v_legacy_branch,
    v_setting.billing_setting_id,v_base_id,
    case when v_setting.billing_setting_id is null then '{}'::jsonb else jsonb_build_object(
      'billing_setting_id',v_setting.billing_setting_id,'route_mode',v_setting.route_mode,
      'toll_calculation_mode',v_setting.toll_calculation_mode,'requires_verified_base',v_setting.requires_verified_base,
      'route_ready',(not v_setting.requires_verified_base or v_base.address_verified),
      'base',jsonb_build_object('base_id',v_base.base_id,'name',v_base.name,'address',v_base.address,'latitude',v_base.latitude,'longitude',v_base.longitude,'google_place_id',v_base.google_place_id,'address_verified',v_base.address_verified)
    ) end,
    (v_quote->>'contract_id')::uuid,(v_quote->>'rate_card_id')::uuid,v_provider_code,nullif(p_payload->>'purchase_order_number',''),now(),v_scheduled,
    nullif(p_payload->>'estimated_arrival_at','')::timestamptz,nullif(p_payload->>'estimated_finish_at','')::timestamptz,
    greatest(coalesce(nullif(p_payload->>'granted_delay_minutes','')::integer,0),0),coalesce(nullif(p_payload->>'logistics_type',''),'own'),
    nullif(p_payload->>'customer_name',''),nullif(p_payload->>'customer_phone',''),nullif(p_payload->>'customer_email',''),upper(nullif(p_payload->>'vehicle_plate','')),v_make_model,
    trim(p_payload->>'origin'),trim(p_payload->>'destination'),nullif(p_payload->>'origin_lat','')::numeric,nullif(p_payload->>'origin_lng','')::numeric,
    nullif(p_payload->>'destination_lat','')::numeric,nullif(p_payload->>'destination_lng','')::numeric,nullif(p_payload->>'origin_place_id',''),nullif(p_payload->>'destination_place_id',''),
    nullif(p_payload->>'origin_formatted_address',''),nullif(p_payload->>'destination_formatted_address',''),v_category.legacy_primary_concept_id,v_category.category_id,
    v_driver,v_truck,case when v_driver is not null and v_truck is not null then now() end,case when v_driver is not null and v_truck is not null then auth.uid() end,
    coalesce((v_quote->>'distance_km')::numeric,0),coalesce((v_quote->>'asphalt_km')::numeric,0),coalesce((v_quote->>'gravel_km')::numeric,0),
    coalesce((v_quote->>'toll_input')::numeric,0),coalesce((v_quote->>'is_holiday')::boolean,false),v_quote->>'currency',
    (v_quote->>'base_subtotal')::numeric,(v_quote->>'surcharge_total')::numeric,(v_quote->>'toll_total')::numeric,(v_quote->>'copay_total')::numeric,
    (v_quote->>'estimated_total')::numeric,(v_quote->>'company_estimated_total')::numeric,v_quote,
    nullif(p_payload->>'route_distance_meters','')::integer,nullif(p_payload->>'route_duration_seconds','')::integer,
    nullif(p_payload->>'route_toll_estimate','')::numeric,nullif(p_payload->>'route_toll_currency',''),nullif(p_payload->>'route_provider',''),
    nullif(p_payload->>'route_calculated_at','')::timestamptz,coalesce(p_payload->'route_legs','[]'::jsonb),
    nullif(p_payload->>'operator_notes',''),nullif(p_payload->>'driver_instructions',''),auth.uid(),auth.uid()
  ) returning * into v_service;

  insert into public.operator_service_items(
    service_id,concept_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id
  ) values(
    v_service.service_id,v_category.legacy_primary_concept_id,'primary',v_category.code,v_provider_code,v_category.name,'service',1,0,0,0,'general',
    jsonb_build_object('role','primary','category_id',v_category.category_id,'category_name',v_category.name,'provider_code',v_provider_code,'pricing_model','matrix_v3'),0,v_category.category_id
  );

  for v_component in select value from jsonb_array_elements(v_quote->'components') loop
    v_requires_own:=coalesce((v_component->>'requires_own_code')::boolean,false);
    if v_requires_own then
      v_instance_code:=nullif(trim(coalesce(p_payload->'item_codes'->>(v_component->>'concept_id'),'')),'');
      if v_instance_code is null then raise exception 'El concepto % requiere código propio de prestadora',v_component->>'service_name'; end if;
    else v_instance_code:=v_provider_code; end if;
    insert into public.operator_service_items(
      service_id,concept_id,rate_item_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,
      unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id,matrix_rate_id
    ) values(
      v_service.service_id,(v_component->>'concept_id')::uuid,null,v_component->>'role',v_component->>'service_code',v_instance_code,
      v_component->>'service_name',v_component->>'pricing_unit',(v_component->>'quantity')::numeric,
      (v_component->>'unit_price')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'subtotal')::numeric,'matrix_v3',v_component,
      case v_component->>'role' when 'movement' then 10 when 'distance' then 20 else 30 end,
      v_category.category_id,(v_component->>'rate_version_id')::uuid
    );
  end loop;

  if v_role='administracion' then return to_jsonb(v_service)||jsonb_build_object('quote',v_quote); end if;
  return jsonb_build_object('service_id',v_service.service_id,'service_number',v_service.service_number,'status',v_service.status,
    'assigned_driver_id',v_service.assigned_driver_id,'assigned_truck_id',v_service.assigned_truck_id,'billing_base_id',v_service.billing_base_id,'category_id',v_service.category_id);
end $$;

create or replace function public.check_recent_provider_code_v3(p_company_id uuid,p_code text,p_exclude_service_id uuid default null)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_code text:=trim(coalesce(p_code,'')); v_matches jsonb;
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','operador','supervision') then raise exception 'Sin permiso'; end if;
  if v_code='' then return jsonb_build_object('duplicate',false,'window_days',30,'matches','[]'::jsonb); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_for desc),'[]'::jsonb) into v_matches
  from (
    select distinct on (s.service_id)
      s.service_id,s.service_number,s.service_order_number,s.scheduled_for,s.created_at,s.status,
      case when lower(trim(coalesce(s.service_order_number,'')))=lower(v_code) then 'service' else 'concept' end as matched_on
    from public.operator_services s
    left join public.operator_service_items i on i.service_id=s.service_id
    where s.company_id=p_company_id and s.scheduled_for>=(now()-interval '30 days')
      and (p_exclude_service_id is null or s.service_id<>p_exclude_service_id)
      and (lower(trim(coalesce(s.service_order_number,'')))=lower(v_code) or lower(trim(coalesce(i.instance_code,'')))=lower(v_code))
    order by s.service_id,s.scheduled_for desc
  ) x;
  return jsonb_build_object('duplicate',jsonb_array_length(v_matches)>0,'window_days',30,'matches',v_matches);
end $$;

revoke all on function public.get_operator_category_tariff_v3(uuid,uuid,uuid,date) from public,anon;
revoke all on function public.calculate_operator_service_quote_v3(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) from public,anon;
revoke all on function public.create_operator_service_v3(jsonb) from public,anon;
revoke all on function public.check_recent_provider_code_v3(uuid,text,uuid) from public,anon;
grant execute on function public.get_operator_category_tariff_v3(uuid,uuid,uuid,date) to authenticated;
grant execute on function public.calculate_operator_service_quote_v3(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function public.create_operator_service_v3(jsonb) to authenticated;
grant execute on function public.check_recent_provider_code_v3(uuid,text,uuid) to authenticated;
