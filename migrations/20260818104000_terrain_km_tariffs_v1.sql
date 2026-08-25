-- AuxiliOS · Tarifas por terreno v1
-- Separa el precio contractual por KM de asfalto y ripio sin crear Tipos de Servicio artificiales.
-- extra_km_price se conserva temporalmente como alias legacy de asphalt_km_price.

ALTER TABLE public.company_rate_items
  ADD COLUMN IF NOT EXISTS asphalt_km_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gravel_km_price numeric NOT NULL DEFAULT 0;

-- Preserva exactamente la tarifa vigente: hasta que Administración cargue valores distintos,
-- el antiguo valor único por KM queda como precio inicial de ambos terrenos.
UPDATE public.company_rate_items
SET asphalt_km_price = greatest(coalesce(extra_km_price,0),0),
    gravel_km_price  = greatest(coalesce(extra_km_price,0),0)
WHERE asphalt_km_price = 0
  AND gravel_km_price = 0
  AND coalesce(extra_km_price,0) <> 0;

ALTER TABLE public.company_rate_items
  DROP CONSTRAINT IF EXISTS company_rate_items_asphalt_km_price_nonnegative,
  DROP CONSTRAINT IF EXISTS company_rate_items_gravel_km_price_nonnegative;

ALTER TABLE public.company_rate_items
  ADD CONSTRAINT company_rate_items_asphalt_km_price_nonnegative CHECK (asphalt_km_price >= 0),
  ADD CONSTRAINT company_rate_items_gravel_km_price_nonnegative CHECK (gravel_km_price >= 0);

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
  SELECT ct.company_id,rc.status
    INTO v_company_id,v_card_status
  FROM public.company_rate_cards rc
  JOIN public.company_contracts ct ON ct.contract_id=rc.contract_id
  WHERE rc.rate_card_id=CASE WHEN tg_op='DELETE' THEN old.rate_card_id ELSE new.rate_card_id END;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Contenedor de precios inexistente.'; END IF;
  IF v_card_status NOT IN ('draft','active','scheduled') THEN RAISE EXCEPTION 'Los precios históricos no se pueden modificar.'; END IF;
  IF tg_op='DELETE' THEN RETURN old; END IF;

  IF new.branch_id IS NOT NULL AND new.billing_base_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede configurar una sucursal y una base al mismo tiempo.';
  END IF;
  IF new.branch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.company_branches b
    WHERE b.branch_id=new.branch_id AND b.company_id=v_company_id AND b.is_active
  ) THEN RAISE EXCEPTION 'La sucursal heredada no pertenece a la empresa o está inactiva.'; END IF;
  IF new.billing_base_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.billing_bases b
    WHERE b.base_id=new.billing_base_id AND b.is_active
  ) THEN RAISE EXCEPTION 'La base no existe o está inactiva.'; END IF;

  SELECT sc.* INTO v_concept
  FROM public.service_concepts sc
  WHERE sc.concept_id=new.concept_id;

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

    -- Compatibilidad transitoria con escritores legacy que todavía cambien sólo extra_km_price.
    IF tg_op='UPDATE'
       AND new.extra_km_price IS DISTINCT FROM old.extra_km_price
       AND new.asphalt_km_price IS NOT DISTINCT FROM old.asphalt_km_price
       AND new.gravel_km_price IS NOT DISTINCT FROM old.gravel_km_price THEN
      new.asphalt_km_price:=greatest(coalesce(new.extra_km_price,0),0);
      new.gravel_km_price:=greatest(coalesce(new.extra_km_price,0),0);
    ELSIF coalesce(new.asphalt_km_price,0)=0
       AND coalesce(new.gravel_km_price,0)=0
       AND coalesce(new.extra_km_price,0)>0 THEN
      new.asphalt_km_price:=greatest(new.extra_km_price,0);
      new.gravel_km_price:=greatest(new.extra_km_price,0);
    ELSE
      new.asphalt_km_price:=greatest(coalesce(new.asphalt_km_price,0),0);
      new.gravel_km_price:=greatest(coalesce(new.gravel_km_price,0),0);
    END IF;

    -- Alias legacy hasta retirar los consumidores antiguos.
    new.extra_km_price:=new.asphalt_km_price;
    IF v_concept.service_category='primary' THEN new.secondary_price:=0; END IF;
  ELSE
    new.extra_km_price:=0;
    new.asphalt_km_price:=0;
    new.gravel_km_price:=0;
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

CREATE OR REPLACE FUNCTION app_private.ensure_scheduled_price_card(
  p_company_id uuid,
  p_valid_from date
) RETURNS uuid
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
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC LIMIT 1;
  IF v_contract.contract_id IS NULL THEN RAISE EXCEPTION 'La prestadora no tiene un contrato vigente para esa fecha'; END IF;

  SELECT r.* INTO v_target
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='scheduled' AND r.valid_from=p_valid_from
  ORDER BY r.version DESC LIMIT 1;
  IF v_target.rate_card_id IS NOT NULL THEN RETURN v_target.rate_card_id; END IF;

  SELECT r.* INTO v_source
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status IN ('active','scheduled') AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC LIMIT 1;
  IF v_source.rate_card_id IS NULL THEN RAISE EXCEPTION 'No existe un precio base para programar la nueva vigencia'; END IF;

  SELECT min(r.valid_from) INTO v_next
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='scheduled' AND r.valid_from>p_valid_from;

  SELECT coalesce(max(r.version),0)+1 INTO v_version
  FROM public.company_rate_cards r WHERE r.contract_id=v_contract.contract_id;

  PERFORM set_config('app.suppress_audit','on',true);

  INSERT INTO public.company_rate_cards(contract_id,name,version,status,valid_from,valid_until,currency,notes)
  VALUES(v_contract.contract_id,'Precios programados',v_version,'scheduled',p_valid_from,
    CASE WHEN v_next IS NULL THEN NULL ELSE v_next-1 END,v_source.currency,'Programación automática por fecha de vigencia')
  RETURNING * INTO v_target;

  INSERT INTO public.company_rate_items(
    rate_card_id,branch_id,billing_base_id,service_code,service_name,base_price,included_km,
    extra_km_price,asphalt_km_price,gravel_km_price,km_calculation_method,included_wait_minutes,
    wait_price_per_hour,tolls_mode,tolls_fixed_amount,extraction_fee,cancellation_fee,second_unit_fee,
    minimum_charge,night_surcharge_pct,weekend_surcharge_pct,holiday_surcharge_pct,is_active,notes,
    concept_id,can_be_primary,can_be_secondary,pricing_unit,primary_price,secondary_price,code_mode,code_prefix
  )
  SELECT
    v_target.rate_card_id,i.branch_id,i.billing_base_id,i.service_code,i.service_name,i.base_price,i.included_km,
    i.extra_km_price,i.asphalt_km_price,i.gravel_km_price,i.km_calculation_method,i.included_wait_minutes,
    i.wait_price_per_hour,i.tolls_mode,i.tolls_fixed_amount,i.extraction_fee,i.cancellation_fee,i.second_unit_fee,
    i.minimum_charge,i.night_surcharge_pct,i.weekend_surcharge_pct,i.holiday_surcharge_pct,i.is_active,i.notes,
    i.concept_id,i.can_be_primary,i.can_be_secondary,i.pricing_unit,i.primary_price,i.secondary_price,i.code_mode,i.code_prefix
  FROM public.company_rate_items i
  JOIN public.service_concepts sc ON sc.concept_id=i.concept_id AND sc.is_active AND sc.billing_family<>'system'
  JOIN public.company_service_settings css ON css.company_id=p_company_id AND css.concept_id=i.concept_id AND css.is_enabled
  WHERE i.rate_card_id=v_source.rate_card_id AND i.is_active;

  INSERT INTO public.company_rate_service_links(rate_card_id,primary_concept_id,secondary_concept_id,price_override,is_enabled,notes)
  SELECT v_target.rate_card_id,l.primary_concept_id,l.secondary_concept_id,l.price_override,l.is_enabled,l.notes
  FROM public.company_rate_service_links l
  WHERE l.rate_card_id=v_source.rate_card_id AND l.is_enabled
    AND EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_target.rate_card_id AND i.concept_id=l.primary_concept_id AND i.can_be_primary AND i.is_active)
    AND EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_target.rate_card_id AND i.concept_id=l.secondary_concept_id AND i.can_be_secondary AND i.is_active);

  INSERT INTO public.company_rate_billing_settings(rate_card_id,copay_enabled,copay_mode,copay_value,toll_enabled,toll_invoice_enabled,toll_mode,toll_fixed_amount,require_toll_receipt)
  SELECT v_target.rate_card_id,b.copay_enabled,b.copay_mode,b.copay_value,b.toll_enabled,b.toll_invoice_enabled,b.toll_mode,b.toll_fixed_amount,b.require_toll_receipt
  FROM public.company_rate_billing_settings b WHERE b.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_codes(rate_card_id,code_key,enabled)
  SELECT v_target.rate_card_id,c.code_key,c.enabled
  FROM public.company_rate_codes c WHERE c.rate_card_id=v_source.rate_card_id;

  FOR v_rule IN SELECT * FROM public.company_rate_rules WHERE rate_card_id=v_source.rate_card_id LOOP
    INSERT INTO public.company_rate_rules(rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end,distance_threshold_km,notes)
    VALUES(v_target.rate_card_id,v_rule.rule_type,v_rule.enabled,v_rule.calculation_mode,v_rule.amount,v_rule.start_time,v_rule.end_time,v_rule.saturday_start,v_rule.saturday_end,v_rule.sunday_holiday_start,v_rule.sunday_holiday_end,v_rule.distance_threshold_km,v_rule.notes)
    RETURNING rule_id INTO v_new_rule;

    INSERT INTO public.company_rate_rule_exceptions(rate_card_id,rule_id,concept_id)
    SELECT v_target.rate_card_id,v_new_rule,e.concept_id
    FROM public.company_rate_rule_exceptions e
    WHERE e.rule_id=v_rule.rule_id
      AND EXISTS(SELECT 1 FROM public.company_service_settings css WHERE css.company_id=p_company_id AND css.concept_id=e.concept_id AND css.is_enabled)
      AND EXISTS(SELECT 1 FROM public.service_concepts sc WHERE sc.concept_id=e.concept_id AND sc.is_active AND sc.billing_family<>'system');
  END LOOP;

  PERFORM set_config('app.suppress_audit','off',true);
  RETURN v_target.rate_card_id;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.cascade_company_service_price_v1(
  p_company_id uuid,
  p_concept_id uuid,
  p_base_id uuid,
  p_source_valid_from date,
  p_before jsonb,
  p_after_rate_item_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contract uuid;
  v_future_card record;
  v_future public.company_rate_items%rowtype;
  v_same_as_before boolean;
BEGIN
  SELECT c.contract_id INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=p_source_valid_from AND (c.valid_until IS NULL OR c.valid_until>=p_source_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC LIMIT 1;
  IF v_contract IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.suppress_audit','on',true);

  FOR v_future_card IN
    SELECT r.rate_card_id,r.valid_from
    FROM public.company_rate_cards r
    WHERE r.contract_id=v_contract AND r.status='scheduled' AND r.valid_from>p_source_valid_from
    ORDER BY r.valid_from,r.version
  LOOP
    v_future:=NULL;
    SELECT i.* INTO v_future
    FROM public.company_rate_items i
    WHERE i.rate_card_id=v_future_card.rate_card_id AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
      AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF p_before IS NULL OR p_before='null'::jsonb THEN
      IF v_future.rate_item_id IS NOT NULL THEN EXIT; END IF;
      IF p_after_rate_item_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.company_rate_items(
        rate_card_id,branch_id,billing_base_id,service_code,service_name,base_price,included_km,
        extra_km_price,asphalt_km_price,gravel_km_price,km_calculation_method,included_wait_minutes,
        wait_price_per_hour,tolls_mode,tolls_fixed_amount,extraction_fee,cancellation_fee,second_unit_fee,
        minimum_charge,night_surcharge_pct,weekend_surcharge_pct,holiday_surcharge_pct,is_active,notes,
        concept_id,can_be_primary,can_be_secondary,pricing_unit,primary_price,secondary_price,code_mode,code_prefix
      )
      SELECT v_future_card.rate_card_id,s.branch_id,s.billing_base_id,s.service_code,s.service_name,s.base_price,s.included_km,
        s.extra_km_price,s.asphalt_km_price,s.gravel_km_price,s.km_calculation_method,s.included_wait_minutes,
        s.wait_price_per_hour,s.tolls_mode,s.tolls_fixed_amount,s.extraction_fee,s.cancellation_fee,s.second_unit_fee,
        s.minimum_charge,s.night_surcharge_pct,s.weekend_surcharge_pct,s.holiday_surcharge_pct,s.is_active,s.notes,
        s.concept_id,s.can_be_primary,s.can_be_secondary,s.pricing_unit,s.primary_price,s.secondary_price,s.code_mode,s.code_prefix
      FROM public.company_rate_items s WHERE s.rate_item_id=p_after_rate_item_id;
      CONTINUE;
    END IF;

    IF v_future.rate_item_id IS NULL THEN EXIT; END IF;

    v_same_as_before:=
      v_future.base_price IS NOT DISTINCT FROM nullif(p_before->>'base_price','')::numeric
      AND v_future.primary_price IS NOT DISTINCT FROM nullif(p_before->>'primary_price','')::numeric
      AND v_future.secondary_price IS NOT DISTINCT FROM nullif(p_before->>'secondary_price','')::numeric
      AND v_future.asphalt_km_price IS NOT DISTINCT FROM coalesce(nullif(p_before->>'asphalt_km_price','')::numeric,nullif(p_before->>'extra_km_price','')::numeric,0)
      AND v_future.gravel_km_price IS NOT DISTINCT FROM coalesce(nullif(p_before->>'gravel_km_price','')::numeric,nullif(p_before->>'extra_km_price','')::numeric,0)
      AND v_future.pricing_unit IS NOT DISTINCT FROM p_before->>'pricing_unit';
    IF NOT v_same_as_before THEN EXIT; END IF;

    IF p_after_rate_item_id IS NULL THEN
      DELETE FROM public.company_rate_items WHERE rate_item_id=v_future.rate_item_id;
    ELSE
      UPDATE public.company_rate_items t SET
        service_code=s.service_code,service_name=s.service_name,base_price=s.base_price,included_km=s.included_km,
        extra_km_price=s.asphalt_km_price,asphalt_km_price=s.asphalt_km_price,gravel_km_price=s.gravel_km_price,
        km_calculation_method=s.km_calculation_method,included_wait_minutes=s.included_wait_minutes,
        wait_price_per_hour=s.wait_price_per_hour,tolls_mode=s.tolls_mode,tolls_fixed_amount=s.tolls_fixed_amount,
        extraction_fee=s.extraction_fee,cancellation_fee=s.cancellation_fee,second_unit_fee=s.second_unit_fee,
        minimum_charge=s.minimum_charge,night_surcharge_pct=s.night_surcharge_pct,
        weekend_surcharge_pct=s.weekend_surcharge_pct,holiday_surcharge_pct=s.holiday_surcharge_pct,
        notes=s.notes,can_be_primary=s.can_be_primary,can_be_secondary=s.can_be_secondary,pricing_unit=s.pricing_unit,
        primary_price=s.primary_price,secondary_price=s.secondary_price,code_mode=s.code_mode,code_prefix=s.code_prefix,updated_by=auth.uid()
      FROM public.company_rate_items s
      WHERE t.rate_item_id=v_future.rate_item_id AND s.rate_item_id=p_after_rate_item_id;
    END IF;
  END LOOP;

  PERFORM set_config('app.suppress_audit','off',true);
END
$function$;

CREATE OR REPLACE FUNCTION public.cancel_company_service_price_schedule_v1(
  p_company_id uuid,
  p_concept_id uuid,
  p_valid_from date,
  p_base_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contract uuid; v_target uuid; v_source uuid;
  v_source_item public.company_rate_items%rowtype;
  v_target_item public.company_rate_items%rowtype;
  v_after_id uuid;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede cancelar precios programados'; END IF;
  IF p_valid_from<=current_date THEN RAISE EXCEPTION 'Solo pueden cancelarse cambios futuros'; END IF;

  SELECT c.contract_id INTO v_contract FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active' AND c.valid_from<=p_valid_from
    AND (c.valid_until IS NULL OR c.valid_until>=p_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC LIMIT 1;

  SELECT r.rate_card_id INTO v_target FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status='scheduled' AND r.valid_from=p_valid_from LIMIT 1;
  IF v_target IS NULL THEN RETURN true; END IF;

  SELECT r.rate_card_id INTO v_source FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status IN ('active','scheduled') AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC LIMIT 1;

  SELECT i.* INTO v_source_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_source AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  SELECT i.* INTO v_target_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_target AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  IF v_target_item.rate_item_id IS NULL THEN RETURN true; END IF;

  IF v_source_item.rate_item_id IS NULL THEN
    DELETE FROM public.company_rate_items WHERE rate_item_id=v_target_item.rate_item_id;
    v_after_id:=NULL;
  ELSE
    UPDATE public.company_rate_items t SET
      service_code=s.service_code,service_name=s.service_name,base_price=s.base_price,included_km=s.included_km,
      extra_km_price=s.asphalt_km_price,asphalt_km_price=s.asphalt_km_price,gravel_km_price=s.gravel_km_price,
      km_calculation_method=s.km_calculation_method,included_wait_minutes=s.included_wait_minutes,
      wait_price_per_hour=s.wait_price_per_hour,tolls_mode=s.tolls_mode,tolls_fixed_amount=s.tolls_fixed_amount,
      extraction_fee=s.extraction_fee,cancellation_fee=s.cancellation_fee,second_unit_fee=s.second_unit_fee,
      minimum_charge=s.minimum_charge,night_surcharge_pct=s.night_surcharge_pct,
      weekend_surcharge_pct=s.weekend_surcharge_pct,holiday_surcharge_pct=s.holiday_surcharge_pct,
      notes=s.notes,can_be_primary=s.can_be_primary,can_be_secondary=s.can_be_secondary,pricing_unit=s.pricing_unit,
      primary_price=s.primary_price,secondary_price=s.secondary_price,code_mode=s.code_mode,code_prefix=s.code_prefix,updated_by=auth.uid()
    FROM public.company_rate_items s
    WHERE t.rate_item_id=v_target_item.rate_item_id AND s.rate_item_id=v_source_item.rate_item_id;
    v_after_id:=v_target_item.rate_item_id;
  END IF;

  PERFORM app_private.cascade_company_service_price_v1(p_company_id,p_concept_id,p_base_id,p_valid_from,to_jsonb(v_target_item),v_after_id);
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_service_prices_v1(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text:=app_private.current_auxilios_role();
  v_card uuid;
  v_currency text:='ARS';
  v_setting uuid;
BEGIN
  IF v_role NOT IN ('administracion','facturacion','supervision') THEN RAISE EXCEPTION 'Sin permiso para consultar precios'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.company_id=p_company_id) THEN RAISE EXCEPTION 'Prestadora inexistente'; END IF;

  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NOT NULL THEN SELECT r.currency INTO v_currency FROM public.company_rate_cards r WHERE r.rate_card_id=v_card; END IF;
  SELECT s.billing_setting_id INTO v_setting FROM public.company_billing_settings s
  WHERE s.company_id=p_company_id AND s.is_active ORDER BY s.valid_from DESC,s.updated_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'company',(SELECT jsonb_build_object('company_id',c.company_id,'name',coalesce(c.trade_name,c.legal_name)) FROM public.companies c WHERE c.company_id=p_company_id),
    'currency',coalesce(v_currency,'ARS'),
    'enabled_count',(SELECT count(*) FROM public.company_service_settings css JOIN public.service_concepts sc ON sc.concept_id=css.concept_id WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'),
    'priced_count',(SELECT count(*) FROM public.company_service_settings css JOIN public.service_concepts sc ON sc.concept_id=css.concept_id WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system' AND v_card IS NOT NULL AND EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL)),
    'bases',coalesce((SELECT jsonb_agg(jsonb_build_object('base_id',b.base_id,'base_code',b.base_code,'name',b.name,'address',b.address) ORDER BY b.name) FROM public.company_billing_base_links l JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active WHERE l.billing_setting_id=v_setting AND l.is_active),'[]'::jsonb),
    'services',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'concept_id',sc.concept_id,'name',sc.name,'category',sc.service_category,'pricing_unit',sc.default_pricing_unit,'distance_chargeable',sc.distance_chargeable,'sort_order',sc.sort_order,
      'general_price',CASE WHEN v_card IS NULL THEN NULL ELSE (SELECT jsonb_build_object(
        'rate_item_id',i.rate_item_id,
        'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
        'asphalt_km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
        'gravel_km_price',CASE WHEN sc.distance_chargeable THEN i.gravel_km_price ELSE NULL END,
        'km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
        'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
        'pricing_unit',i.pricing_unit
      ) FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL LIMIT 1) END,
      'base_exceptions',CASE WHEN v_card IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object(
        'rate_item_id',i.rate_item_id,'base_id',b.base_id,'base_name',b.name,
        'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
        'asphalt_km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
        'gravel_km_price',CASE WHEN sc.distance_chargeable THEN i.gravel_km_price ELSE NULL END,
        'km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
        'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
        'pricing_unit',i.pricing_unit
      ) ORDER BY b.name) FROM public.company_rate_items i JOIN public.billing_bases b ON b.base_id=i.billing_base_id JOIN public.company_billing_base_links l ON l.base_id=b.base_id AND l.billing_setting_id=v_setting AND l.is_active WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NOT NULL),'[]'::jsonb) END
    ) ORDER BY sc.sort_order,sc.name) FROM public.company_service_settings css JOIN public.service_concepts sc ON sc.concept_id=css.concept_id WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'),'[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_service_price_schedule_v1(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() NOT IN ('administracion','facturacion','supervision') THEN RAISE EXCEPTION 'Sin permiso para consultar precios programados'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'valid_from',r.valid_from,'concept_id',i.concept_id,'billing_base_id',i.billing_base_id,'base_name',b.name,
    'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
    'asphalt_km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
    'gravel_km_price',CASE WHEN sc.distance_chargeable THEN i.gravel_km_price ELSE NULL END,
    'km_price',CASE WHEN sc.distance_chargeable THEN i.asphalt_km_price ELSE NULL END,
    'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
    'pricing_unit',i.pricing_unit
  ) ORDER BY r.valid_from,sc.sort_order,sc.name,i.billing_base_id NULLS FIRST)
  FROM public.company_contracts c
  JOIN public.company_rate_cards r ON r.contract_id=c.contract_id AND r.status='scheduled' AND r.valid_from>current_date
  JOIN public.company_rate_items i ON i.rate_card_id=r.rate_card_id AND i.is_active AND i.branch_id IS NULL
  JOIN public.service_concepts sc ON sc.concept_id=i.concept_id
  LEFT JOIN public.billing_bases b ON b.base_id=i.billing_base_id
  WHERE c.company_id=p_company_id AND c.status='active'),'[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.save_company_service_price_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_concept uuid:=nullif(p_payload->>'concept_id','')::uuid;
  v_base uuid:=nullif(p_payload->>'billing_base_id','')::uuid;
  v_movement numeric:=nullif(p_payload->>'movement_price','')::numeric;
  v_legacy_km numeric:=nullif(p_payload->>'km_price','')::numeric;
  v_asphalt numeric:=coalesce(nullif(p_payload->>'asphalt_km_price','')::numeric,v_legacy_km);
  v_gravel numeric:=coalesce(nullif(p_payload->>'gravel_km_price','')::numeric,v_legacy_km);
  v_unit numeric:=nullif(p_payload->>'unit_price','')::numeric;
  v_card uuid; v_sc public.service_concepts%rowtype; v_item public.company_rate_items%rowtype;
  v_before jsonb; v_code_mode text:='fixed'; v_can_primary boolean; v_can_secondary boolean;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar precios'; END IF;
  IF v_company IS NULL OR v_concept IS NULL THEN RAISE EXCEPTION 'Datos de precio incompletos'; END IF;
  SELECT sc.* INTO v_sc FROM public.service_concepts sc
  JOIN public.company_service_settings css ON css.company_id=v_company AND css.concept_id=sc.concept_id AND css.is_enabled
  WHERE sc.concept_id=v_concept AND sc.is_active AND sc.billing_family<>'system';
  IF v_sc.concept_id IS NULL THEN RAISE EXCEPTION 'El servicio no está habilitado para la prestadora'; END IF;
  IF v_base IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_billing_settings s JOIN public.company_billing_base_links l ON l.billing_setting_id=s.billing_setting_id AND l.is_active JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active WHERE s.company_id=v_company AND s.is_active AND b.base_id=v_base) THEN RAISE EXCEPTION 'La base no está habilitada para esta prestadora'; END IF;
  IF v_sc.distance_chargeable THEN
    IF v_movement IS NULL OR v_movement<0 OR v_asphalt IS NULL OR v_asphalt<0 OR v_gravel IS NULL OR v_gravel<0 THEN RAISE EXCEPTION 'Completá valores válidos para movida, KM asfalto y KM ripio'; END IF;
  ELSE
    IF v_unit IS NULL OR v_unit<0 THEN RAISE EXCEPTION 'Ingresá un valor válido'; END IF;
  END IF;
  v_card:=app_private.current_price_card_for_company(v_company,true);
  IF v_card IS NULL THEN RAISE EXCEPTION 'No se pudo preparar el almacenamiento de precios'; END IF;
  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode FROM public.company_service_settings css WHERE css.company_id=v_company AND css.concept_id=v_concept;
  v_can_primary:=v_sc.service_category IN ('primary','mixed'); v_can_secondary:=v_sc.service_category IN ('secondary','mixed');
  SELECT i.* INTO v_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=v_concept AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  IF v_item.rate_item_id IS NOT NULL THEN v_before:=to_jsonb(v_item); END IF;
  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(rate_card_id,branch_id,billing_base_id,concept_id,service_code,service_name,base_price,primary_price,secondary_price,included_km,extra_km_price,asphalt_km_price,gravel_km_price,pricing_unit,can_be_primary,can_be_secondary,code_mode,is_active,notes)
    VALUES(v_card,NULL,v_base,v_concept,v_sc.code,v_sc.name,
      CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      0,CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN v_gravel ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      v_can_primary,v_can_secondary,coalesce(v_code_mode,'fixed'),true,NULL) RETURNING * INTO v_item;
  ELSE
    UPDATE public.company_rate_items SET
      billing_base_id=v_base,base_price=CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      primary_price=CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      secondary_price=CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      included_km=0,extra_km_price=CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      asphalt_km_price=CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      gravel_km_price=CASE WHEN v_sc.distance_chargeable THEN v_gravel ELSE 0 END,
      pricing_unit=CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      can_be_primary=v_can_primary,can_be_secondary=v_can_secondary,code_mode=coalesce(v_code_mode,'fixed'),notes=NULL,updated_by=auth.uid()
    WHERE rate_item_id=v_item.rate_item_id RETURNING * INTO v_item;
  END IF;
  PERFORM app_private.cascade_company_service_price_v1(v_company,v_concept,v_base,current_date,v_before,v_item.rate_item_id);
  RETURN to_jsonb(v_item);
END
$function$;

CREATE OR REPLACE FUNCTION public.save_company_service_price_schedule_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_concept uuid:=nullif(p_payload->>'concept_id','')::uuid;
  v_base uuid:=nullif(p_payload->>'billing_base_id','')::uuid;
  v_valid_from date:=nullif(p_payload->>'valid_from','')::date;
  v_movement numeric:=nullif(p_payload->>'movement_price','')::numeric;
  v_legacy_km numeric:=nullif(p_payload->>'km_price','')::numeric;
  v_asphalt numeric:=coalesce(nullif(p_payload->>'asphalt_km_price','')::numeric,v_legacy_km);
  v_gravel numeric:=coalesce(nullif(p_payload->>'gravel_km_price','')::numeric,v_legacy_km);
  v_unit numeric:=nullif(p_payload->>'unit_price','')::numeric;
  v_card uuid; v_sc public.service_concepts%rowtype; v_item public.company_rate_items%rowtype;
  v_before jsonb; v_code_mode text:='fixed'; v_can_primary boolean; v_can_secondary boolean;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede programar precios'; END IF;
  IF v_company IS NULL OR v_concept IS NULL OR v_valid_from IS NULL THEN RAISE EXCEPTION 'Datos de precio incompletos'; END IF;
  IF v_valid_from<=current_date THEN RAISE EXCEPTION 'La vigencia programada debe ser futura'; END IF;
  SELECT sc.* INTO v_sc FROM public.service_concepts sc
  JOIN public.company_service_settings css ON css.company_id=v_company AND css.concept_id=sc.concept_id AND css.is_enabled
  WHERE sc.concept_id=v_concept AND sc.is_active AND sc.billing_family<>'system';
  IF v_sc.concept_id IS NULL THEN RAISE EXCEPTION 'El servicio no está habilitado para la prestadora'; END IF;
  IF v_base IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_billing_settings s JOIN public.company_billing_base_links l ON l.billing_setting_id=s.billing_setting_id AND l.is_active JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active WHERE s.company_id=v_company AND s.is_active AND b.base_id=v_base) THEN RAISE EXCEPTION 'La base no está habilitada para esta prestadora'; END IF;
  IF v_sc.distance_chargeable THEN
    IF v_movement IS NULL OR v_movement<0 OR v_asphalt IS NULL OR v_asphalt<0 OR v_gravel IS NULL OR v_gravel<0 THEN RAISE EXCEPTION 'Completá valores válidos para movida, KM asfalto y KM ripio'; END IF;
  ELSE
    IF v_unit IS NULL OR v_unit<0 THEN RAISE EXCEPTION 'Ingresá un valor válido'; END IF;
  END IF;
  v_card:=app_private.ensure_scheduled_price_card(v_company,v_valid_from);
  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode FROM public.company_service_settings css WHERE css.company_id=v_company AND css.concept_id=v_concept;
  v_can_primary:=v_sc.service_category IN ('primary','mixed'); v_can_secondary:=v_sc.service_category IN ('secondary','mixed');
  SELECT i.* INTO v_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=v_concept AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  IF v_item.rate_item_id IS NOT NULL THEN v_before:=to_jsonb(v_item); END IF;
  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(rate_card_id,branch_id,billing_base_id,concept_id,service_code,service_name,base_price,primary_price,secondary_price,included_km,extra_km_price,asphalt_km_price,gravel_km_price,pricing_unit,can_be_primary,can_be_secondary,code_mode,is_active,notes)
    VALUES(v_card,NULL,v_base,v_concept,v_sc.code,v_sc.name,
      CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      0,CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN v_gravel ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      v_can_primary,v_can_secondary,coalesce(v_code_mode,'fixed'),true,NULL) RETURNING * INTO v_item;
  ELSE
    UPDATE public.company_rate_items SET
      billing_base_id=v_base,base_price=CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      primary_price=CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      secondary_price=CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      included_km=0,extra_km_price=CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      asphalt_km_price=CASE WHEN v_sc.distance_chargeable THEN v_asphalt ELSE 0 END,
      gravel_km_price=CASE WHEN v_sc.distance_chargeable THEN v_gravel ELSE 0 END,
      pricing_unit=CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      can_be_primary=v_can_primary,can_be_secondary=v_can_secondary,code_mode=coalesce(v_code_mode,'fixed'),notes=NULL,updated_by=auth.uid()
    WHERE rate_item_id=v_item.rate_item_id RETURNING * INTO v_item;
  END IF;
  PERFORM app_private.cascade_company_service_price_v1(v_company,v_concept,v_base,v_valid_from,v_before,v_item.rate_item_id);
  RETURN to_jsonb(v_item)||jsonb_build_object('valid_from',v_valid_from,'scheduled',true);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_service_price_history_v1(p_company_id uuid,p_concept_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() NOT IN ('administracion','facturacion','supervision') THEN RAISE EXCEPTION 'Sin permiso para consultar historial de precios'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
    'event_id',ae.event_id,'occurred_at',ae.occurred_at,'operation',ae.operation,'actor_id',ae.actor_id,'actor_name',coalesce(u.full_name,'Usuario'),
    'billing_base_id',coalesce(nullif(ae.after_data->>'billing_base_id','')::uuid,nullif(ae.before_data->>'billing_base_id','')::uuid),'base_name',b.name,
    'before',jsonb_build_object(
      'movement_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.before_data->>'primary_price','')::numeric ELSE NULL END,
      'asphalt_km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.before_data->>'asphalt_km_price','')::numeric,nullif(ae.before_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'gravel_km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.before_data->>'gravel_km_price','')::numeric,nullif(ae.before_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.before_data->>'asphalt_km_price','')::numeric,nullif(ae.before_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN nullif(ae.before_data->>'secondary_price','')::numeric ELSE nullif(ae.before_data->>'primary_price','')::numeric END END),
    'after',jsonb_build_object(
      'movement_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.after_data->>'primary_price','')::numeric ELSE NULL END,
      'asphalt_km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.after_data->>'asphalt_km_price','')::numeric,nullif(ae.after_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'gravel_km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.after_data->>'gravel_km_price','')::numeric,nullif(ae.after_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'km_price',CASE WHEN sc.distance_chargeable THEN coalesce(nullif(ae.after_data->>'asphalt_km_price','')::numeric,nullif(ae.after_data->>'extra_km_price','')::numeric) ELSE NULL END,
      'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN nullif(ae.after_data->>'secondary_price','')::numeric ELSE nullif(ae.after_data->>'primary_price','')::numeric END END)
    ) ORDER BY ae.occurred_at DESC)
  FROM public.audit_events ae
  JOIN public.company_rate_cards rc ON rc.rate_card_id=coalesce(nullif(ae.after_data->>'rate_card_id','')::uuid,nullif(ae.before_data->>'rate_card_id','')::uuid)
  JOIN public.company_contracts cc ON cc.contract_id=rc.contract_id AND cc.company_id=p_company_id
  JOIN public.service_concepts sc ON sc.concept_id=p_concept_id
  LEFT JOIN public.users u ON u.user_id=ae.actor_id
  LEFT JOIN public.billing_bases b ON b.base_id=coalesce(nullif(ae.after_data->>'billing_base_id','')::uuid,nullif(ae.before_data->>'billing_base_id','')::uuid)
  WHERE ae.entity_table='company_rate_items' AND coalesce(ae.after_data->>'concept_id',ae.before_data->>'concept_id')=p_concept_id::text),'[]'::jsonb);
END
$function$;

COMMENT ON COLUMN public.company_rate_items.asphalt_km_price IS 'Precio contractual por kilómetro de asfalto para servicios con distancia.';
COMMENT ON COLUMN public.company_rate_items.gravel_km_price IS 'Precio contractual por kilómetro de ripio para servicios con distancia.';
COMMENT ON COLUMN public.company_rate_items.extra_km_price IS 'Campo legacy temporal; se mantiene sincronizado con asphalt_km_price hasta retirar consumidores antiguos.';
