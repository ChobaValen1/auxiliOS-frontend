-- AuxiliOS · una vigencia futura hereda el motor comercial anterior sin defaults

CREATE OR REPLACE FUNCTION app_private.validate_rate_card_engine_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  d jsonb;
  card_id uuid;
  card_status text;
  card_company uuid;
  v_current_role text;
  v_technical_clone boolean:=current_setting('app.suppress_audit',true)='on';
  p uuid;
  s uuid;
  r uuid;
  c uuid;
BEGIN
  d:=CASE WHEN tg_op='DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END;
  card_id:=(d->>'rate_card_id')::uuid;
  SELECT rc.status,cc.company_id INTO card_status,card_company
  FROM public.company_rate_cards rc
  JOIN public.company_contracts cc ON cc.contract_id=rc.contract_id
  WHERE rc.rate_card_id=card_id;
  v_current_role:=app_private.current_auxilios_role();

  IF card_id IS NULL OR card_status IS NULL THEN RAISE EXCEPTION 'Configuración comercial inexistente.'; END IF;
  IF card_status='draft' THEN
    NULL;
  ELSIF card_status='active' AND v_current_role='administracion' AND tg_table_name IN('company_rate_rules','company_rate_rule_exceptions') THEN
    NULL;
  ELSIF card_status='scheduled' AND (v_current_role='administracion' OR v_technical_clone) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'La configuración histórica no se puede modificar.';
  END IF;

  IF tg_table_name='company_rate_service_links' AND tg_op<>'DELETE' THEN
    p:=(d->>'primary_concept_id')::uuid;
    s:=(d->>'secondary_concept_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=p AND can_be_primary AND is_active)
       OR NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=s AND can_be_secondary AND is_active)
    THEN RAISE EXCEPTION 'La relación requiere conceptos principal y secundario habilitados.'; END IF;
  END IF;

  IF tg_table_name='company_rate_rule_exceptions' AND tg_op<>'DELETE' THEN
    r:=(d->>'rule_id')::uuid;
    c:=(d->>'concept_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.company_rate_rules WHERE rule_id=r AND rate_card_id=card_id) THEN RAISE EXCEPTION 'La excepción no pertenece a la regla.'; END IF;
    IF card_status IN ('active','scheduled') THEN
      IF NOT EXISTS(SELECT 1 FROM public.company_service_settings css WHERE css.company_id=card_company AND css.concept_id=c AND css.is_enabled) THEN RAISE EXCEPTION 'El servicio no está habilitado para la prestadora.'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=c AND is_active) THEN
      RAISE EXCEPTION 'El concepto no está habilitado en la configuración heredada.';
    END IF;
  END IF;

  IF tg_op='DELETE' THEN RETURN old; END IF;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.initialize_rate_card_engine()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  -- Las vigencias futuras se clonan desde el período anterior en
  -- ensure_scheduled_price_card; nunca deben recibir defaults nuevos.
  IF new.status='scheduled' THEN RETURN new; END IF;

  INSERT INTO public.company_rate_rules(rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end)
  VALUES
    (new.rate_card_id,'night',false,'percentage',20,'21:59','05:59',null,null,null,null),
    (new.rate_card_id,'weekend_holiday',false,'percentage',20,null,null,'21:59','05:59','21:59','05:59'),
    (new.rate_card_id,'wide_coverage',false,'percentage',0,null,null,null,null,null,null)
  ON CONFLICT(rate_card_id,rule_type) DO NOTHING;

  INSERT INTO public.company_rate_billing_settings(rate_card_id)
  VALUES(new.rate_card_id) ON CONFLICT(rate_card_id) DO NOTHING;

  INSERT INTO public.company_rate_codes(rate_card_id,code_key,enabled)
  VALUES
    (new.rate_card_id,'traveler',true),(new.rate_card_id,'work',false),(new.rate_card_id,'toll',false),
    (new.rate_card_id,'wait',true),(new.rate_card_id,'osa',false),(new.rate_card_id,'extraction',true),
    (new.rate_card_id,'storage',true),(new.rate_card_id,'excess',true),(new.rate_card_id,'special',true)
  ON CONFLICT(rate_card_id,code_key) DO NOTHING;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.ensure_scheduled_price_card(p_company_id uuid,p_valid_from date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contract public.company_contracts%rowtype;
  v_source public.company_rate_cards%rowtype;
  v_target public.company_rate_cards%rowtype;
  v_version integer;
  v_rule public.company_rate_rules%rowtype;
  v_new_rule uuid;
  v_next date;
BEGIN
  IF p_valid_from IS NULL OR p_valid_from<=current_date THEN RAISE EXCEPTION 'La vigencia programada debe ser futura'; END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=p_valid_from AND (c.valid_until IS NULL OR c.valid_until>=p_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC
  LIMIT 1;
  IF v_contract.contract_id IS NULL THEN RAISE EXCEPTION 'La prestadora no tiene un contrato vigente para esa fecha'; END IF;

  SELECT r.* INTO v_target
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='scheduled' AND r.valid_from=p_valid_from
  ORDER BY r.version DESC LIMIT 1;
  IF v_target.rate_card_id IS NOT NULL THEN RETURN v_target.rate_card_id; END IF;

  SELECT r.* INTO v_source
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status IN ('active','scheduled') AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC
  LIMIT 1;
  IF v_source.rate_card_id IS NULL THEN RAISE EXCEPTION 'No existe un precio base para programar la nueva vigencia'; END IF;

  SELECT min(r.valid_from) INTO v_next
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='scheduled' AND r.valid_from>p_valid_from;
  SELECT coalesce(max(r.version),0)+1 INTO v_version
  FROM public.company_rate_cards r WHERE r.contract_id=v_contract.contract_id;

  PERFORM set_config('app.suppress_audit','on',true);

  INSERT INTO public.company_rate_cards(contract_id,name,version,status,valid_from,valid_until,currency,notes)
  VALUES(v_contract.contract_id,'Precios programados',v_version,'scheduled',p_valid_from,CASE WHEN v_next IS NULL THEN NULL ELSE v_next-1 END,v_source.currency,'Programación automática por fecha de vigencia')
  RETURNING * INTO v_target;

  INSERT INTO public.company_rate_items(
    rate_card_id,branch_id,billing_base_id,service_code,service_name,base_price,included_km,extra_km_price,
    km_calculation_method,included_wait_minutes,wait_price_per_hour,tolls_mode,tolls_fixed_amount,extraction_fee,
    cancellation_fee,second_unit_fee,minimum_charge,night_surcharge_pct,weekend_surcharge_pct,holiday_surcharge_pct,
    is_active,notes,concept_id,can_be_primary,can_be_secondary,pricing_unit,primary_price,secondary_price,code_mode,code_prefix
  )
  SELECT
    v_target.rate_card_id,i.branch_id,i.billing_base_id,i.service_code,i.service_name,i.base_price,i.included_km,i.extra_km_price,
    i.km_calculation_method,i.included_wait_minutes,i.wait_price_per_hour,i.tolls_mode,i.tolls_fixed_amount,i.extraction_fee,
    i.cancellation_fee,i.second_unit_fee,i.minimum_charge,i.night_surcharge_pct,i.weekend_surcharge_pct,i.holiday_surcharge_pct,
    i.is_active,i.notes,i.concept_id,i.can_be_primary,i.can_be_secondary,i.pricing_unit,i.primary_price,i.secondary_price,i.code_mode,i.code_prefix
  FROM public.company_rate_items i WHERE i.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_service_links(rate_card_id,primary_concept_id,secondary_concept_id,price_override,is_enabled,notes)
  SELECT v_target.rate_card_id,l.primary_concept_id,l.secondary_concept_id,l.price_override,l.is_enabled,l.notes
  FROM public.company_rate_service_links l WHERE l.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_billing_settings(
    rate_card_id,copay_enabled,copay_mode,copay_value,toll_enabled,toll_invoice_enabled,toll_mode,toll_fixed_amount,require_toll_receipt
  )
  SELECT v_target.rate_card_id,b.copay_enabled,b.copay_mode,b.copay_value,b.toll_enabled,b.toll_invoice_enabled,b.toll_mode,b.toll_fixed_amount,b.require_toll_receipt
  FROM public.company_rate_billing_settings b WHERE b.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_codes(rate_card_id,code_key,enabled)
  SELECT v_target.rate_card_id,c.code_key,c.enabled
  FROM public.company_rate_codes c WHERE c.rate_card_id=v_source.rate_card_id;

  FOR v_rule IN SELECT * FROM public.company_rate_rules WHERE rate_card_id=v_source.rate_card_id LOOP
    INSERT INTO public.company_rate_rules(
      rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,
      sunday_holiday_start,sunday_holiday_end,distance_threshold_km,notes
    ) VALUES(
      v_target.rate_card_id,v_rule.rule_type,v_rule.enabled,v_rule.calculation_mode,v_rule.amount,v_rule.start_time,v_rule.end_time,
      v_rule.saturday_start,v_rule.saturday_end,v_rule.sunday_holiday_start,v_rule.sunday_holiday_end,v_rule.distance_threshold_km,v_rule.notes
    ) RETURNING rule_id INTO v_new_rule;

    INSERT INTO public.company_rate_rule_exceptions(rate_card_id,rule_id,concept_id)
    SELECT v_target.rate_card_id,v_new_rule,e.concept_id
    FROM public.company_rate_rule_exceptions e WHERE e.rule_id=v_rule.rule_id;
  END LOOP;

  PERFORM set_config('app.suppress_audit','off',true);
  RETURN v_target.rate_card_id;
END
$function$;
