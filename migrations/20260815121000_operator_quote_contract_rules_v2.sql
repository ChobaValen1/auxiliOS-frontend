-- AuxiliOS · Motor contractual de cotización v2
-- Reglas acordadas:
-- 1) Radio: los kilómetros facturables son únicamente los que exceden el radio cubierto.
-- 2) Cobrar movida hasta: superado el límite, la movida deja de cobrarse.
-- 3) Recargos: no son acumulativos; entre los aplicables se usa uno solo, el de mayor valor configurado.

create or replace function app_private.calculate_operator_service_quote_v4_full(
  p_company_id uuid,
  p_base_id uuid,
  p_scheduled_for timestamptz,
  p_primary_concept_id uuid,
  p_items jsonb default '[]'::jsonb,
  p_asphalt_km numeric default 0,
  p_gravel_km numeric default 0,
  p_toll_amount numeric default 0,
  p_is_holiday boolean default false
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_local timestamp:=coalesce(p_scheduled_for,now()) at time zone 'America/Argentina/Buenos_Aires';
  v_date date:=v_local::date;
  v_time time:=v_local::time;
  v_dow integer:=extract(dow from v_local)::integer;
  v_contract public.company_contracts%rowtype;
  v_card public.company_rate_cards%rowtype;
  v_primary public.service_concepts%rowtype;
  v_rate public.company_rate_items%rowtype;
  v_rule public.company_rate_rules%rowtype;
  v_billing public.company_rate_billing_settings%rowtype;
  v_setting public.company_billing_settings%rowtype;
  v_manual jsonb;
  v_concept record;
  v_qty numeric;
  v_subtotal numeric;
  v_distance numeric:=coalesce(p_asphalt_km,0)+coalesce(p_gravel_km,0);
  v_billable_distance numeric:=0;
  v_components jsonb:='[]'::jsonb;
  v_surcharges jsonb:='[]'::jsonb;
  v_base numeric:=0;
  v_eligible numeric:=0;
  v_charge numeric:=0;
  v_surcharge_total numeric:=0;
  v_toll numeric:=0;
  v_total numeric:=0;
  v_copay numeric:=0;
  v_company_total numeric:=0;
  v_applies boolean;
  v_currency text;
  v_seen uuid[]:='{}'::uuid[];
  v_legacy_category uuid;
  v_radius numeric;
  v_movement_until numeric;
  v_movement_applies boolean:=true;
  v_distance_applies boolean:=false;
begin
  if coalesce(p_asphalt_km,0)<0 or coalesce(p_gravel_km,0)<0 or coalesce(p_toll_amount,0)<0 then
    raise exception 'Kilómetros o peaje inválidos';
  end if;

  select c.* into v_contract
  from public.company_contracts c
  where c.company_id=p_company_id
    and c.status='active'
    and c.valid_from<=v_date
    and (c.valid_until is null or c.valid_until>=v_date)
  order by c.is_primary desc,c.valid_from desc,c.created_at desc
  limit 1;
  if not found then raise exception 'La prestadora no tiene un contrato vigente'; end if;

  select r.* into v_card
  from public.company_rate_cards r
  where r.contract_id=v_contract.contract_id
    and r.status in ('active','scheduled')
    and r.valid_from<=v_date
    and (r.valid_until is null or r.valid_until>=v_date)
  order by r.valid_from desc,r.version desc
  limit 1;
  if not found then raise exception 'El contrato no tiene un tarifario publicado y vigente'; end if;
  v_currency:=v_card.currency;

  select s.* into v_setting
  from public.company_billing_settings s
  where s.company_id=p_company_id
    and s.is_active
    and s.valid_from<=v_date
    and (s.valid_until is null or s.valid_until>=v_date)
    and (s.contract_id is null or s.contract_id=v_contract.contract_id)
  order by (s.contract_id=v_contract.contract_id) desc nulls last,s.valid_from desc,s.created_at desc
  limit 1;
  v_radius:=v_setting.covered_radius_km;
  v_movement_until:=v_setting.movement_charge_until_km;

  if v_radius is not null and v_movement_until is not null and v_movement_until<v_radius then
    raise exception 'Cobrar movida hasta (%) no puede ser menor que el radio cubierto (%)',v_movement_until,v_radius;
  end if;

  select sc.* into v_primary
  from public.service_concepts sc
  join public.company_service_settings css
    on css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled
  where sc.concept_id=p_primary_concept_id
    and sc.is_active
    and sc.billing_family<>'system'
    and sc.service_category in ('primary','mixed');
  if not found then raise exception 'El Tipo de Servicio principal no está habilitado para la prestadora'; end if;

  select i.* into v_rate
  from public.company_rate_items i
  where i.rate_card_id=v_card.rate_card_id
    and i.concept_id=v_primary.concept_id
    and i.is_active
    and i.branch_id is null
    and (i.billing_base_id is null or i.billing_base_id=p_base_id)
  order by (i.billing_base_id=p_base_id) desc nulls last
  limit 1;
  if not found then raise exception 'El servicio % no tiene tarifa vigente',v_primary.name; end if;

  select c.category_id into v_legacy_category
  from public.service_categories c
  where c.legacy_primary_concept_id=v_primary.concept_id and c.is_active
  order by c.sort_order
  limit 1;

  if v_primary.distance_chargeable then
    v_movement_applies:=v_movement_until is null or v_distance<=v_movement_until;
    v_billable_distance:=greatest(v_distance-coalesce(v_radius,0),0);
    v_distance_applies:=v_billable_distance>0;
  else
    v_movement_applies:=true;
    v_billable_distance:=0;
    v_distance_applies:=false;
  end if;

  if v_movement_applies then
    v_subtotal:=coalesce(v_rate.primary_price,v_rate.base_price,0);
    v_base:=v_base+v_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','movement','component_type','service','concept_id',v_primary.concept_id,
      'rate_item_id',v_rate.rate_item_id,'service_code',v_primary.code,'service_name',v_primary.name,
      'pricing_unit','service','quantity',1,
      'unit_price',coalesce(v_rate.primary_price,v_rate.base_price,0),'subtotal',v_subtotal,
      'requires_own_code',false,
      'price_source',case when v_rate.billing_base_id is null then 'general' else 'billing_base' end
    ));
  end if;

  if v_primary.distance_chargeable and v_distance_applies then
    v_subtotal:=round(v_billable_distance*coalesce(v_rate.extra_km_price,0),2);
    v_base:=v_base+v_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','distance','component_type','distance','concept_id',v_primary.concept_id,
      'rate_item_id',v_rate.rate_item_id,'service_code',v_primary.code,'service_name',v_primary.name||' · KM',
      'pricing_unit','km','quantity',v_billable_distance,
      'unit_price',coalesce(v_rate.extra_km_price,0),'subtotal',v_subtotal,
      'requires_own_code',false,
      'price_source',case when v_rate.billing_base_id is null then 'general' else 'billing_base' end
    ));
  end if;

  for v_manual in
    select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    begin
      if nullif(v_manual->>'concept_id','') is null then raise exception 'Concepto inválido'; end if;
      if (v_manual->>'concept_id')::uuid=any(v_seen) then raise exception 'El mismo concepto no puede agregarse dos veces'; end if;
      v_seen:=array_append(v_seen,(v_manual->>'concept_id')::uuid);
    exception when invalid_text_representation then
      raise exception 'Concepto inválido';
    end;

    select sc.concept_id,sc.code,sc.name,sc.default_pricing_unit,coalesce(css.code_mode,'fixed') code_mode
      into v_concept
    from public.service_concepts sc
    join public.company_service_settings css
      on css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled
    where sc.concept_id=(v_manual->>'concept_id')::uuid
      and sc.is_active
      and sc.billing_family<>'system'
      and sc.service_category in ('secondary','mixed');
    if not found then raise exception 'Un servicio adicional no está habilitado para la prestadora'; end if;

    v_qty:=coalesce(nullif(v_manual->>'quantity','')::numeric,1);
    if v_qty<=0 then raise exception 'La cantidad de % debe ser mayor a cero',v_concept.name; end if;

    select i.* into v_rate
    from public.company_rate_items i
    where i.rate_card_id=v_card.rate_card_id
      and i.concept_id=v_concept.concept_id
      and i.is_active
      and i.branch_id is null
      and (i.billing_base_id is null or i.billing_base_id=p_base_id)
    order by (i.billing_base_id=p_base_id) desc nulls last
    limit 1;
    if not found then raise exception 'El servicio % no tiene tarifa vigente',v_concept.name; end if;

    v_subtotal:=round(v_qty*coalesce(v_rate.secondary_price,v_rate.base_price,0),2);
    v_base:=v_base+v_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','secondary','component_type','service','concept_id',v_concept.concept_id,
      'rate_item_id',v_rate.rate_item_id,'service_code',v_concept.code,'service_name',v_concept.name,
      'pricing_unit',v_rate.pricing_unit,'quantity',v_qty,
      'unit_price',coalesce(v_rate.secondary_price,v_rate.base_price,0),'subtotal',v_subtotal,
      'requires_own_code',v_concept.code_mode='manual',
      'price_source',case when v_rate.billing_base_id is null then 'general' else 'billing_base' end
    ));
  end loop;

  -- Los recargos tienen la misma prioridad comercial y no se acumulan.
  -- Evaluamos del mayor valor configurado al menor y aplicamos el primer recargo válido.
  for v_rule in
    select *
    from public.company_rate_rules
    where rate_card_id=v_card.rate_card_id and enabled
    order by amount desc,rule_type,rule_id
  loop
    v_applies:=false;

    if v_rule.rule_type='night' and v_rule.start_time is not null and v_rule.end_time is not null then
      v_applies:=case
        when v_rule.start_time<=v_rule.end_time then v_time between v_rule.start_time and v_rule.end_time
        else v_time>=v_rule.start_time or v_time<=v_rule.end_time
      end;
    elsif v_rule.rule_type='weekend_holiday' then
      if v_dow=6 and v_rule.saturday_start is not null and v_rule.saturday_end is not null then
        v_applies:=case
          when v_rule.saturday_start<=v_rule.saturday_end then v_time between v_rule.saturday_start and v_rule.saturday_end
          else v_time>=v_rule.saturday_start or v_time<=v_rule.saturday_end
        end;
      elsif (v_dow=0 or p_is_holiday) and v_rule.sunday_holiday_start is not null and v_rule.sunday_holiday_end is not null then
        v_applies:=case
          when v_rule.sunday_holiday_start<=v_rule.sunday_holiday_end then v_time between v_rule.sunday_holiday_start and v_rule.sunday_holiday_end
          else v_time>=v_rule.sunday_holiday_start or v_time<=v_rule.sunday_holiday_end
        end;
      end if;
    elsif v_rule.rule_type='wide_coverage' then
      v_applies:=v_distance>=coalesce(v_rule.distance_threshold_km,0)
        and coalesce(v_rule.distance_threshold_km,0)>0;
    end if;

    if v_applies then
      select coalesce(sum((x.value->>'subtotal')::numeric),0)
        into v_eligible
      from jsonb_array_elements(v_components)x(value)
      where not exists(
        select 1
        from public.company_rate_rule_exceptions e
        where e.rule_id=v_rule.rule_id
          and e.concept_id=(x.value->>'concept_id')::uuid
      );

      v_charge:=case
        when v_eligible<=0 then 0
        when v_rule.calculation_mode='fixed' then v_rule.amount
        else round(v_eligible*v_rule.amount/100,2)
      end;

      if v_charge>0 then
        v_surcharge_total:=v_charge;
        v_surcharges:=jsonb_build_array(jsonb_build_object(
          'rule_id',v_rule.rule_id,
          'rule_type',v_rule.rule_type,
          'calculation_mode',v_rule.calculation_mode,
          'configured_value',v_rule.amount,
          'eligible_base',v_eligible,
          'amount',v_charge
        ));
        exit;
      end if;
    end if;
  end loop;

  select b.* into v_billing
  from public.company_rate_billing_settings b
  where b.rate_card_id=v_card.rate_card_id;

  if found and v_billing.toll_enabled and v_billing.toll_invoice_enabled then
    v_toll:=case v_billing.toll_mode
      when 'fixed' then v_billing.toll_fixed_amount
      when 'at_cost' then p_toll_amount
      else 0
    end;
  end if;

  v_total:=round(v_base+v_surcharge_total+v_toll,2);

  if found and v_billing.copay_enabled then
    v_copay:=case
      when v_billing.copay_mode='percentage' then round(v_total*v_billing.copay_value/100,2)
      else v_billing.copay_value
    end;
    v_copay:=least(greatest(v_copay,0),v_total);
  end if;
  v_company_total:=v_total-v_copay;

  return jsonb_build_object(
    'pricing_valid',true,
    'pricing_model','rate_card_v4',
    'company_id',p_company_id,
    'billing_base_id',p_base_id,
    'contract_id',v_contract.contract_id,
    'contract_name',v_contract.name,
    'rate_card_id',v_card.rate_card_id,
    'rate_card_name',v_card.name,
    'rate_card_version',v_card.version,
    'currency',v_currency,
    'scheduled_for',p_scheduled_for,
    'category_id',p_primary_concept_id,
    'legacy_category_id',v_legacy_category,
    'primary_concept_id',v_primary.concept_id,
    'primary_service_name',v_primary.name,
    'components',v_components,
    'surcharges',v_surcharges,
    'asphalt_km',coalesce(p_asphalt_km,0),
    'gravel_km',coalesce(p_gravel_km,0),
    'distance_km',v_distance,
    'covered_radius_km',v_radius,
    'billable_distance_km',v_billable_distance,
    'movement_charge_until_km',v_movement_until,
    'movement_applied',v_movement_applies,
    'distance_applied',v_distance_applies,
    'toll_input',p_toll_amount,
    'is_holiday',p_is_holiday,
    'base_subtotal',round(v_base,2),
    'surcharge_total',round(v_surcharge_total,2),
    'toll_total',round(v_toll,2),
    'copay_total',round(v_copay,2),
    'estimated_total',round(v_total,2),
    'company_estimated_total',round(v_company_total,2),
    'calculated_at',now()
  );
end;
$$;

comment on function app_private.calculate_operator_service_quote_v4_full(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean)
is 'Motor contractual: radio descuenta KM incluidos, movida se corta por límite y recargos no se acumulan.';
