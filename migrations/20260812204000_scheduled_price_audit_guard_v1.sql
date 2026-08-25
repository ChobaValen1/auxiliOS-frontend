-- AuxiliOS · vigencias programadas: validación + auditoría semántica

CREATE OR REPLACE FUNCTION public.capture_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_id text;
BEGIN
  IF current_setting('app.suppress_audit', true) = 'on' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' THEN
    v_after:=to_jsonb(NEW);
  ELSIF TG_OP='UPDATE' THEN
    v_before:=to_jsonb(OLD);
    v_after:=to_jsonb(NEW);
  ELSE
    v_before:=to_jsonb(OLD);
  END IF;

  v_id:=coalesce(v_after->>TG_ARGV[0],v_before->>TG_ARGV[0]);
  INSERT INTO public.audit_events(actor_id,operation,entity_schema,entity_table,entity_id,before_data,after_data)
  VALUES(auth.uid(),TG_OP,TG_TABLE_SCHEMA,TG_TABLE_NAME,v_id,v_before,v_after);

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.validate_company_rate_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_company_id uuid;
  v_card_status text;
  v_concept public.service_concepts%rowtype;
BEGIN
  SELECT ct.company_id,rc.status INTO v_company_id,v_card_status
  FROM public.company_rate_cards rc
  JOIN public.company_contracts ct ON ct.contract_id=rc.contract_id
  WHERE rc.rate_card_id=CASE WHEN tg_op='DELETE' THEN old.rate_card_id ELSE new.rate_card_id END;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Contenedor de precios inexistente.'; END IF;
  IF v_card_status NOT IN ('draft','active','scheduled') THEN
    RAISE EXCEPTION 'Los precios históricos no se pueden modificar.';
  END IF;
  IF tg_op='DELETE' THEN RETURN old; END IF;

  IF new.branch_id IS NOT NULL AND new.billing_base_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede configurar una sucursal y una base al mismo tiempo.';
  END IF;
  IF new.branch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.company_branches b
    WHERE b.branch_id=new.branch_id AND b.company_id=v_company_id AND b.is_active
  ) THEN RAISE EXCEPTION 'La sucursal heredada no pertenece a la empresa o está inactiva.'; END IF;
  IF new.billing_base_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.billing_bases b WHERE b.base_id=new.billing_base_id AND b.is_active
  ) THEN RAISE EXCEPTION 'La base no existe o está inactiva.'; END IF;

  SELECT sc.* INTO v_concept FROM public.service_concepts sc WHERE sc.concept_id=new.concept_id;
  IF v_concept.concept_id IS NULL THEN RAISE EXCEPTION 'Tipo de Servicio inexistente.'; END IF;
  IF v_concept.billing_family='system' THEN RAISE EXCEPTION 'Este componente técnico no tiene precio de servicio.'; END IF;
  IF NOT v_concept.is_active THEN RAISE EXCEPTION 'Tipo de Servicio inactivo.'; END IF;

  new.can_be_primary:=v_concept.service_category IN ('primary','mixed');
  new.can_be_secondary:=v_concept.service_category IN ('secondary','mixed');
  new.service_code:=v_concept.code;
  new.service_name:=v_concept.name;
  new.included_km:=0;
  new.notes:=NULL;

  IF v_concept.distance_chargeable THEN
    new.pricing_unit:='service';
    new.base_price:=new.primary_price;
    new.extra_km_price:=greatest(coalesce(new.extra_km_price,0),0);
    IF v_concept.service_category='primary' THEN new.secondary_price:=0; END IF;
  ELSE
    new.extra_km_price:=0;
    new.km_calculation_method:='one_way';
    new.pricing_unit:=coalesce(nullif(new.pricing_unit,''),v_concept.default_pricing_unit,'service');
    IF new.can_be_primary AND NOT new.can_be_secondary THEN
      new.base_price:=new.primary_price; new.secondary_price:=0;
    ELSIF new.can_be_secondary AND NOT new.can_be_primary THEN
      new.base_price:=new.secondary_price; new.primary_price:=0;
    ELSE
      new.base_price:=greatest(new.primary_price,new.secondary_price);
    END IF;
  END IF;

  new.tolls_mode:='not_applicable';
  new.tolls_fixed_amount:=0;
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

  INSERT INTO public.company_rate_billing_settings(rate_card_id,copay_enabled,copay_mode,copay_value,toll_enabled,toll_invoice_enabled,toll_mode,toll_fixed_amount,require_toll_receipt)
  SELECT v_target.rate_card_id,b.copay_enabled,b.copay_mode,b.copay_value,b.toll_enabled,b.toll_invoice_enabled,b.toll_mode,b.toll_fixed_amount,b.require_toll_receipt
  FROM public.company_rate_billing_settings b WHERE b.rate_card_id=v_source.rate_card_id
  ON CONFLICT(rate_card_id) DO NOTHING;

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

REVOKE ALL ON FUNCTION app_private.ensure_scheduled_price_card(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.price_card_for_company_date(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.current_price_card_for_company(uuid,boolean) FROM PUBLIC;
