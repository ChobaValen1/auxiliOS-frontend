CREATE OR REPLACE FUNCTION app_private.calculate_operator_service_quote_v4_full(p_company_id uuid, p_base_id uuid, p_scheduled_for timestamp with time zone, p_primary_concept_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_asphalt_km numeric DEFAULT 0, p_gravel_km numeric DEFAULT 0, p_toll_amount numeric DEFAULT 0, p_is_holiday boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
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
  v_billable_asphalt numeric:=0;
  v_billable_gravel numeric:=0;
  v_asphalt_unit_price numeric:=0;
  v_gravel_unit_price numeric:=0;
  v_asphalt_subtotal numeric:=0;
  v_gravel_subtotal numeric:=0;
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
  v_primary_rate_id uuid;
  v_primary_movement_price numeric:=0;
  v_unit numeric;
  v_unit_rate_id uuid;
  v_unit_pricing text;
  v_unit_source text;
BEGIN
  IF coalesce(p_asphalt_km,0)<0 OR coalesce(p_gravel_km,0)<0 OR coalesce(p_toll_amount,0)<0 THEN
    RAISE EXCEPTION 'Kilómetros o peaje inválidos';
  END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active' AND c.valid_from<=v_date
    AND (c.valid_until IS NULL OR c.valid_until>=v_date)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'La prestadora no tiene un contrato vigente'; END IF;

  SELECT r.* INTO v_card
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status IN ('active','scheduled')
    AND r.valid_from<=v_date AND (r.valid_until IS NULL OR r.valid_until>=v_date)
  ORDER BY r.valid_from DESC,r.version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'El contrato no tiene un tarifario publicado y vigente'; END IF;
  v_currency:=v_card.currency;

  SELECT s.* INTO v_setting
  FROM public.company_billing_settings s
  WHERE s.company_id=p_company_id AND s.is_active AND s.valid_from<=v_date
    AND (s.valid_until IS NULL OR s.valid_until>=v_date)
    AND (s.contract_id IS NULL OR s.contract_id=v_contract.contract_id)
  ORDER BY (s.contract_id=v_contract.contract_id) DESC NULLS LAST,s.valid_from DESC,s.created_at DESC
  LIMIT 1;
  v_radius:=v_setting.covered_radius_km;
  v_movement_until:=v_setting.movement_charge_until_km;

  IF v_radius IS NOT NULL AND v_movement_until IS NOT NULL AND v_movement_until<v_radius THEN
    RAISE EXCEPTION 'Cobrar movida hasta (%) no puede ser menor que el radio cubierto (%)',v_movement_until,v_radius;
  END IF;

  SELECT sc.* INTO v_primary
  FROM public.service_concepts sc
  JOIN public.company_service_settings css ON css.company_id=p_company_id AND css.concept_id=sc.concept_id AND css.is_enabled
  WHERE sc.concept_id=p_primary_concept_id AND sc.is_active AND sc.billing_family<>'system'
    AND sc.service_category IN ('primary','mixed');
  IF NOT FOUND THEN RAISE EXCEPTION 'El Tipo de Servicio principal no está habilitado para la prestadora'; END IF;

  SELECT i.* INTO v_rate
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card.rate_card_id AND i.concept_id=v_primary.concept_id AND i.is_active
    AND i.branch_id IS NULL AND (i.billing_base_id IS NULL OR i.billing_base_id=p_base_id)
  ORDER BY (i.billing_base_id=p_base_id) DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'El servicio % no tiene tarifa vigente',v_primary.name; END IF;

  v_asphalt_unit_price:=coalesce(v_rate.asphalt_km_price,v_rate.extra_km_price,0);
  v_gravel_unit_price:=coalesce(v_rate.gravel_km_price,v_rate.extra_km_price,0);
  v_primary_rate_id:=v_rate.rate_item_id;
  v_primary_movement_price:=coalesce(v_rate.primary_price,v_rate.base_price,0);

  SELECT c.category_id INTO v_legacy_category
  FROM public.service_categories c
  WHERE c.legacy_primary_concept_id=v_primary.concept_id AND c.is_active
  ORDER BY c.sort_order LIMIT 1;

  IF v_primary.distance_chargeable THEN
    v_movement_applies:=v_movement_until IS NULL OR v_distance<=v_movement_until;
    v_billable_distance:=greatest(v_distance-coalesce(v_radius,0),0);
    v_distance_applies:=v_billable_distance>0;
    v_billable_asphalt:=greatest(coalesce(p_asphalt_km,0)-coalesce(v_radius,0),0);
    v_billable_gravel:=greatest(
      coalesce(p_gravel_km,0)-greatest(coalesce(v_radius,0)-coalesce(p_asphalt_km,0),0),
      0
    );
  ELSE
    v_movement_applies:=true;
    v_billable_distance:=0;
    v_billable_asphalt:=0;
    v_billable_gravel:=0;
    v_distance_applies:=false;
  END IF;

  IF v_movement_applies THEN
    v_subtotal:=coalesce(v_rate.primary_price,v_rate.base_price,0);
    v_base:=v_base+v_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','movement','component_type','service','concept_id',v_primary.concept_id,
      'rate_item_id',v_rate.rate_item_id,'service_code',v_primary.code,'service_name',v_primary.name,
      'pricing_unit','service','quantity',1,'unit_price',coalesce(v_rate.primary_price,v_rate.base_price,0),
      'subtotal',v_subtotal,'requires_own_code',false,
      'price_source',CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END IF;

  IF v_primary.distance_chargeable AND v_billable_asphalt>0 THEN
    v_asphalt_subtotal:=round(v_billable_asphalt*v_asphalt_unit_price,2);
    v_base:=v_base+v_asphalt_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','distance_asphalt','component_type','distance','terrain','asphalt',
      'concept_id',v_primary.concept_id,'rate_item_id',v_rate.rate_item_id,
      'service_code',v_primary.code,'service_name',v_primary.name||' · KM Asfalto',
      'pricing_unit','km','quantity',v_billable_asphalt,'unit_price',v_asphalt_unit_price,
      'subtotal',v_asphalt_subtotal,'requires_own_code',false,
      'price_source',CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END IF;

  IF v_primary.distance_chargeable AND v_billable_gravel>0 THEN
    v_gravel_subtotal:=round(v_billable_gravel*v_gravel_unit_price,2);
    v_base:=v_base+v_gravel_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','distance_gravel','component_type','distance','terrain','gravel',
      'concept_id',v_primary.concept_id,'rate_item_id',v_rate.rate_item_id,
      'service_code',v_primary.code,'service_name',v_primary.name||' · KM Ripio',
      'pricing_unit','km','quantity',v_billable_gravel,'unit_price',v_gravel_unit_price,
      'subtotal',v_gravel_subtotal,'requires_own_code',false,
      'price_source',CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END IF;

  FOR v_manual IN SELECT value FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
    BEGIN
      IF nullif(v_manual->>'concept_id','') IS NULL THEN RAISE EXCEPTION 'Concepto inválido'; END IF;
      IF (v_manual->>'concept_id')::uuid=ANY(v_seen) THEN RAISE EXCEPTION 'El mismo concepto no puede agregarse dos veces'; END IF;
      v_seen:=array_append(v_seen,(v_manual->>'concept_id')::uuid);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Concepto inválido';
    END;

    SELECT sc.concept_id,sc.code,sc.name,sc.default_pricing_unit,coalesce(css.code_mode,'fixed') code_mode,css.price_link INTO v_concept
    FROM public.service_concepts sc
    JOIN public.company_service_settings css ON css.company_id=p_company_id AND css.concept_id=sc.concept_id AND css.is_enabled
    WHERE sc.concept_id=(v_manual->>'concept_id')::uuid AND sc.is_active AND sc.billing_family<>'system'
      AND sc.service_category IN ('secondary','mixed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Un servicio adicional no está habilitado para la prestadora'; END IF;

    v_qty:=coalesce(nullif(v_manual->>'quantity','')::numeric,1);
    IF v_qty<=0 THEN RAISE EXCEPTION 'La cantidad de % debe ser mayor a cero',v_concept.name; END IF;

    IF v_concept.price_link IS NOT NULL THEN
      v_unit:=CASE v_concept.price_link WHEN 'primary_movement' THEN v_primary_movement_price ELSE v_asphalt_unit_price END;
      v_unit_rate_id:=v_primary_rate_id;
      v_unit_pricing:=coalesce(v_concept.default_pricing_unit,'unit');
      v_unit_source:='linked_primary';
    ELSE
    SELECT i.* INTO v_rate
    FROM public.company_rate_items i
    WHERE i.rate_card_id=v_card.rate_card_id AND i.concept_id=v_concept.concept_id AND i.is_active
      AND i.branch_id IS NULL AND (i.billing_base_id IS NULL OR i.billing_base_id=p_base_id)
    ORDER BY (i.billing_base_id=p_base_id) DESC NULLS LAST LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'El servicio % no tiene tarifa vigente',v_concept.name; END IF;
      v_unit:=coalesce(v_rate.secondary_price,v_rate.base_price,0);
      v_unit_rate_id:=v_rate.rate_item_id;
      v_unit_pricing:=v_rate.pricing_unit;
      v_unit_source:=CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END;
    END IF;

    v_subtotal:=round(v_qty*v_unit,2);
    v_base:=v_base+v_subtotal;
    v_components:=v_components||jsonb_build_array(jsonb_build_object(
      'role','secondary','component_type','service','concept_id',v_concept.concept_id,
      'rate_item_id',v_unit_rate_id,'service_code',v_concept.code,'service_name',v_concept.name,
      'pricing_unit',v_unit_pricing,'quantity',v_qty,
      'unit_price',v_unit,'subtotal',v_subtotal,
      'requires_own_code',v_concept.code_mode='manual',
      'price_link',v_concept.price_link,
      'price_source',v_unit_source
    ));
  END LOOP;

  FOR v_rule IN
    SELECT * FROM public.company_rate_rules
    WHERE rate_card_id=v_card.rate_card_id AND enabled
    ORDER BY amount DESC,rule_type,rule_id
  LOOP
    v_applies:=false;
    IF v_rule.rule_type='night' AND v_rule.start_time IS NOT NULL AND v_rule.end_time IS NOT NULL THEN
      v_applies:=CASE WHEN v_rule.start_time<=v_rule.end_time THEN v_time BETWEEN v_rule.start_time AND v_rule.end_time ELSE v_time>=v_rule.start_time OR v_time<=v_rule.end_time END;
    ELSIF v_rule.rule_type='weekend_holiday' THEN
      IF v_dow=6 AND v_rule.saturday_start IS NOT NULL AND v_rule.saturday_end IS NOT NULL THEN
        v_applies:=CASE WHEN v_rule.saturday_start<=v_rule.saturday_end THEN v_time BETWEEN v_rule.saturday_start AND v_rule.saturday_end ELSE v_time>=v_rule.saturday_start OR v_time<=v_rule.saturday_end END;
      ELSIF (v_dow=0 OR p_is_holiday) AND v_rule.sunday_holiday_start IS NOT NULL AND v_rule.sunday_holiday_end IS NOT NULL THEN
        v_applies:=CASE WHEN v_rule.sunday_holiday_start<=v_rule.sunday_holiday_end THEN v_time BETWEEN v_rule.sunday_holiday_start AND v_rule.sunday_holiday_end ELSE v_time>=v_rule.sunday_holiday_start OR v_time<=v_rule.sunday_holiday_end END;
      END IF;
    ELSIF v_rule.rule_type='wide_coverage' THEN
      v_applies:=v_distance>=coalesce(v_rule.distance_threshold_km,0) AND coalesce(v_rule.distance_threshold_km,0)>0;
    END IF;

    IF v_applies THEN
      SELECT coalesce(sum((x.value->>'subtotal')::numeric),0) INTO v_eligible
      FROM jsonb_array_elements(v_components)x(value)
      WHERE NOT EXISTS(SELECT 1 FROM public.company_rate_rule_exceptions e WHERE e.rule_id=v_rule.rule_id AND e.concept_id=(x.value->>'concept_id')::uuid);
      v_charge:=CASE WHEN v_eligible<=0 THEN 0 WHEN v_rule.calculation_mode='fixed' THEN v_rule.amount ELSE round(v_eligible*v_rule.amount/100,2) END;
      IF v_charge>0 THEN
        v_surcharge_total:=v_charge;
        v_surcharges:=jsonb_build_array(jsonb_build_object(
          'rule_id',v_rule.rule_id,'rule_type',v_rule.rule_type,'calculation_mode',v_rule.calculation_mode,
          'configured_value',v_rule.amount,'eligible_base',v_eligible,'amount',v_charge
        ));
        EXIT;
      END IF;
    END IF;
  END LOOP;

  SELECT b.* INTO v_billing FROM public.company_rate_billing_settings b WHERE b.rate_card_id=v_card.rate_card_id;
  IF FOUND AND v_billing.toll_enabled AND v_billing.toll_invoice_enabled THEN
    v_toll:=CASE v_billing.toll_mode WHEN 'fixed' THEN v_billing.toll_fixed_amount WHEN 'at_cost' THEN p_toll_amount ELSE 0 END;
  END IF;

  v_total:=round(v_base+v_surcharge_total+v_toll,2);
  IF FOUND AND v_billing.copay_enabled THEN
    v_copay:=CASE WHEN v_billing.copay_mode='percentage' THEN round(v_total*v_billing.copay_value/100,2) ELSE v_billing.copay_value END;
    v_copay:=least(greatest(v_copay,0),v_total);
  END IF;
  v_company_total:=v_total-v_copay;

  RETURN jsonb_build_object(
    'pricing_valid',true,'pricing_model','rate_card_v4','terrain_pricing',true,
    'company_id',p_company_id,'billing_base_id',p_base_id,'contract_id',v_contract.contract_id,
    'contract_name',v_contract.name,'rate_card_id',v_card.rate_card_id,'rate_card_name',v_card.name,
    'rate_card_version',v_card.version,'currency',v_currency,'scheduled_for',p_scheduled_for,
    'category_id',p_primary_concept_id,'legacy_category_id',v_legacy_category,
    'primary_concept_id',v_primary.concept_id,'primary_service_name',v_primary.name,
    'components',v_components,'surcharges',v_surcharges,
    'asphalt_km',coalesce(p_asphalt_km,0),'gravel_km',coalesce(p_gravel_km,0),'distance_km',v_distance,
    'covered_radius_km',v_radius,'covered_radius_consumption_order','asphalt_then_gravel','billable_distance_km',v_billable_distance,
    'billable_asphalt_km',v_billable_asphalt,'billable_gravel_km',v_billable_gravel,
    'asphalt_km_unit_price',v_asphalt_unit_price,'gravel_km_unit_price',v_gravel_unit_price,
    'asphalt_km_subtotal',round(v_asphalt_subtotal,2),'gravel_km_subtotal',round(v_gravel_subtotal,2),
    'movement_charge_until_km',v_movement_until,'movement_applied',v_movement_applies,'distance_applied',v_distance_applies,
    'toll_input',p_toll_amount,'is_holiday',p_is_holiday,'base_subtotal',round(v_base,2),
    'surcharge_total',round(v_surcharge_total,2),'toll_total',round(v_toll,2),'copay_total',round(v_copay,2),
    'estimated_total',round(v_total,2),'company_estimated_total',round(v_company_total,2),'calculated_at',now()
  );
END
$function$
