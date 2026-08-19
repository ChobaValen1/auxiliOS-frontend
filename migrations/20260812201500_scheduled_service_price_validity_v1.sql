-- AuxiliOS · vigencias programables de precios sin workflow de borrador/publicación

ALTER TABLE public.company_rate_cards
  DROP CONSTRAINT IF EXISTS company_rate_cards_status_check;
ALTER TABLE public.company_rate_cards
  ADD CONSTRAINT company_rate_cards_status_check
  CHECK (status = ANY (ARRAY['draft'::text,'active'::text,'scheduled'::text,'expired'::text,'archived'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS company_rate_cards_scheduled_date_uq
  ON public.company_rate_cards(contract_id,valid_from)
  WHERE status='scheduled';

CREATE OR REPLACE FUNCTION app_private.price_card_for_company_date(
  p_company_id uuid,
  p_as_of date DEFAULT current_date
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_contract uuid; v_card uuid;
BEGIN
  SELECT c.contract_id INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=coalesce(p_as_of,current_date)
    AND (c.valid_until IS NULL OR c.valid_until>=coalesce(p_as_of,current_date))
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC
  LIMIT 1;
  IF v_contract IS NULL THEN RETURN NULL; END IF;

  SELECT r.rate_card_id INTO v_card
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract
    AND r.status IN ('active','scheduled')
    AND r.valid_from<=coalesce(p_as_of,current_date)
    AND (r.valid_until IS NULL OR r.valid_until>=coalesce(p_as_of,current_date))
  ORDER BY r.valid_from DESC,r.version DESC,r.updated_at DESC
  LIMIT 1;
  RETURN v_card;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.current_price_card_for_company(
  p_company_id uuid,
  p_create boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_contract public.company_contracts%rowtype; v_card uuid; v_version integer;
BEGIN
  v_card:=app_private.price_card_for_company_date(p_company_id,current_date);
  IF v_card IS NOT NULL OR NOT p_create THEN RETURN v_card; END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=current_date AND (c.valid_until IS NULL OR c.valid_until>=current_date)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NULL THEN
    INSERT INTO public.company_contracts(company_id,name,status,valid_from,currency,is_primary,notes)
    VALUES(p_company_id,'Acuerdo comercial','active',current_date,'ARS',true,'Contenedor técnico de precios')
    RETURNING * INTO v_contract;
  END IF;

  SELECT coalesce(max(r.version),0)+1 INTO v_version
  FROM public.company_rate_cards r WHERE r.contract_id=v_contract.contract_id;
  INSERT INTO public.company_rate_cards(contract_id,name,version,status,valid_from,valid_until,currency,notes)
  VALUES(v_contract.contract_id,'Precios actuales',v_version,'active',current_date,NULL,coalesce(v_contract.currency,'ARS'),'Contenedor técnico de precios actuales')
  RETURNING rate_card_id INTO v_card;
  RETURN v_card;
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
  WHERE r.contract_id=v_contract.contract_id
    AND r.status IN ('active','scheduled')
    AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC
  LIMIT 1;
  IF v_source.rate_card_id IS NULL THEN RAISE EXCEPTION 'No existe un precio base para programar la nueva vigencia'; END IF;

  SELECT min(r.valid_from) INTO v_next
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='scheduled' AND r.valid_from>p_valid_from;

  SELECT coalesce(max(r.version),0)+1 INTO v_version
  FROM public.company_rate_cards r WHERE r.contract_id=v_contract.contract_id;

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
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_service_links(rate_card_id,primary_concept_id,secondary_concept_id,price_override,is_enabled,notes)
  SELECT v_target.rate_card_id,l.primary_concept_id,l.secondary_concept_id,l.price_override,l.is_enabled,l.notes
  FROM public.company_rate_service_links l
  WHERE l.rate_card_id=v_source.rate_card_id;

  INSERT INTO public.company_rate_billing_settings(
    rate_card_id,copay_enabled,copay_mode,copay_value,toll_enabled,toll_invoice_enabled,toll_mode,toll_fixed_amount,require_toll_receipt
  )
  SELECT v_target.rate_card_id,b.copay_enabled,b.copay_mode,b.copay_value,b.toll_enabled,b.toll_invoice_enabled,b.toll_mode,b.toll_fixed_amount,b.require_toll_receipt
  FROM public.company_rate_billing_settings b
  WHERE b.rate_card_id=v_source.rate_card_id
  ON CONFLICT (rate_card_id) DO NOTHING;

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
    FROM public.company_rate_rule_exceptions e
    WHERE e.rule_id=v_rule.rule_id;
  END LOOP;

  RETURN v_target.rate_card_id;
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
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'valid_from',r.valid_from,
      'concept_id',i.concept_id,
      'billing_base_id',i.billing_base_id,
      'base_name',b.name,
      'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
      'km_price',CASE WHEN sc.distance_chargeable THEN i.extra_km_price ELSE NULL END,
      'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
      'pricing_unit',i.pricing_unit
    ) ORDER BY r.valid_from,sc.sort_order,sc.name,i.billing_base_id NULLS FIRST)
    FROM public.company_contracts c
    JOIN public.company_rate_cards r ON r.contract_id=c.contract_id AND r.status='scheduled' AND r.valid_from>current_date
    JOIN public.company_rate_items i ON i.rate_card_id=r.rate_card_id AND i.is_active AND i.branch_id IS NULL
    JOIN public.service_concepts sc ON sc.concept_id=i.concept_id
    LEFT JOIN public.billing_bases b ON b.base_id=i.billing_base_id
    WHERE c.company_id=p_company_id AND c.status='active'
  ),'[]'::jsonb);
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
  v_km numeric:=nullif(p_payload->>'km_price','')::numeric;
  v_unit numeric:=nullif(p_payload->>'unit_price','')::numeric;
  v_card uuid;
  v_sc public.service_concepts%rowtype;
  v_item public.company_rate_items%rowtype;
  v_code_mode text:='fixed';
  v_can_primary boolean;
  v_can_secondary boolean;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede programar precios'; END IF;
  IF v_company IS NULL OR v_concept IS NULL OR v_valid_from IS NULL THEN RAISE EXCEPTION 'Datos de precio incompletos'; END IF;
  IF v_valid_from<=current_date THEN RAISE EXCEPTION 'La vigencia programada debe ser futura'; END IF;

  SELECT sc.* INTO v_sc
  FROM public.service_concepts sc
  JOIN public.company_service_settings css ON css.company_id=v_company AND css.concept_id=sc.concept_id AND css.is_enabled
  WHERE sc.concept_id=v_concept AND sc.is_active AND sc.billing_family<>'system';
  IF v_sc.concept_id IS NULL THEN RAISE EXCEPTION 'El servicio no está habilitado para la prestadora'; END IF;

  IF v_base IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.company_billing_settings s
    JOIN public.company_billing_base_links l ON l.billing_setting_id=s.billing_setting_id AND l.is_active
    JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active
    WHERE s.company_id=v_company AND s.is_active AND b.base_id=v_base
  ) THEN RAISE EXCEPTION 'La base no está habilitada para esta prestadora'; END IF;

  IF v_sc.distance_chargeable THEN
    IF v_movement IS NULL OR v_movement<0 OR v_km IS NULL OR v_km<0 THEN RAISE EXCEPTION 'Completá valores válidos para movida y kilómetro'; END IF;
  ELSE
    IF v_unit IS NULL OR v_unit<0 THEN RAISE EXCEPTION 'Ingresá un valor válido'; END IF;
  END IF;

  v_card:=app_private.ensure_scheduled_price_card(v_company,v_valid_from);
  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode FROM public.company_service_settings css WHERE css.company_id=v_company AND css.concept_id=v_concept;
  v_can_primary:=v_sc.service_category IN ('primary','mixed');
  v_can_secondary:=v_sc.service_category IN ('secondary','mixed');

  SELECT i.* INTO v_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=v_concept AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id,branch_id,billing_base_id,concept_id,service_code,service_name,base_price,primary_price,secondary_price,
      included_km,extra_km_price,pricing_unit,can_be_primary,can_be_secondary,code_mode,is_active,notes
    ) VALUES(
      v_card,NULL,v_base,v_concept,v_sc.code,v_sc.name,
      CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      0,CASE WHEN v_sc.distance_chargeable THEN v_km ELSE 0 END,
      CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      v_can_primary,v_can_secondary,coalesce(v_code_mode,'fixed'),true,NULL
    ) RETURNING * INTO v_item;
  ELSE
    UPDATE public.company_rate_items SET
      billing_base_id=v_base,
      base_price=CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
      primary_price=CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      secondary_price=CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
      included_km=0,
      extra_km_price=CASE WHEN v_sc.distance_chargeable THEN v_km ELSE 0 END,
      pricing_unit=CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
      can_be_primary=v_can_primary,can_be_secondary=v_can_secondary,code_mode=coalesce(v_code_mode,'fixed'),notes=NULL,updated_by=auth.uid()
    WHERE rate_item_id=v_item.rate_item_id
    RETURNING * INTO v_item;
  END IF;

  RETURN to_jsonb(v_item)||jsonb_build_object('valid_from',v_valid_from,'scheduled',true);
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
DECLARE v_contract uuid; v_target uuid; v_source uuid; v_source_item public.company_rate_items%rowtype; v_target_item uuid;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede cancelar precios programados'; END IF;
  IF p_valid_from<=current_date THEN RAISE EXCEPTION 'Solo pueden cancelarse cambios futuros'; END IF;

  SELECT c.contract_id INTO v_contract FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active' AND c.valid_from<=p_valid_from AND (c.valid_until IS NULL OR c.valid_until>=p_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC LIMIT 1;
  SELECT r.rate_card_id INTO v_target FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status='scheduled' AND r.valid_from=p_valid_from LIMIT 1;
  IF v_target IS NULL THEN RETURN true; END IF;

  SELECT r.rate_card_id INTO v_source FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status IN ('active','scheduled') AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC LIMIT 1;

  SELECT i.* INTO v_source_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_source AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  SELECT i.rate_item_id INTO v_target_item FROM public.company_rate_items i
  WHERE i.rate_card_id=v_target AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_source_item.rate_item_id IS NULL THEN
    IF v_target_item IS NOT NULL THEN DELETE FROM public.company_rate_items WHERE rate_item_id=v_target_item; END IF;
  ELSIF v_target_item IS NOT NULL THEN
    UPDATE public.company_rate_items t SET
      service_code=s.service_code,service_name=s.service_name,base_price=s.base_price,included_km=s.included_km,extra_km_price=s.extra_km_price,
      km_calculation_method=s.km_calculation_method,included_wait_minutes=s.included_wait_minutes,wait_price_per_hour=s.wait_price_per_hour,
      tolls_mode=s.tolls_mode,tolls_fixed_amount=s.tolls_fixed_amount,extraction_fee=s.extraction_fee,cancellation_fee=s.cancellation_fee,
      second_unit_fee=s.second_unit_fee,minimum_charge=s.minimum_charge,night_surcharge_pct=s.night_surcharge_pct,
      weekend_surcharge_pct=s.weekend_surcharge_pct,holiday_surcharge_pct=s.holiday_surcharge_pct,notes=s.notes,
      can_be_primary=s.can_be_primary,can_be_secondary=s.can_be_secondary,pricing_unit=s.pricing_unit,primary_price=s.primary_price,
      secondary_price=s.secondary_price,code_mode=s.code_mode,code_prefix=s.code_prefix,updated_by=auth.uid()
    FROM public.company_rate_items s
    WHERE t.rate_item_id=v_target_item AND s.rate_item_id=v_source_item.rate_item_id;
  END IF;
  RETURN true;
END
$function$;

-- Actualiza solo las selecciones de card; no crea APIs paralelas de cálculo.
DO $patch$
DECLARE v_oid oid; v_def text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_operator_service_context_v1' AND p.prokind='f' LIMIT 1;
  IF v_oid IS NOT NULL THEN
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'v_card:=app_private.current_price_card_for_company(p_company_id,false);','v_card:=app_private.price_card_for_company_date(p_company_id,v_date);');
    EXECUTE v_def;
  END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='app_private' AND p.proname='calculate_operator_service_quote_v4_full' AND p.prokind='f' LIMIT 1;
  IF v_oid IS NOT NULL THEN
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'r.status=''active''','r.status IN (''active'',''scheduled'')');
    v_def:=regexp_replace(v_def,'ORDER BY r\.version DESC,r\.valid_from DESC LIMIT 1','ORDER BY r.valid_from DESC,r.version DESC LIMIT 1','gi');
    EXECUTE v_def;
  END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_operator_category_tariff_v3' AND p.prokind='f' LIMIT 1;
  IF v_oid IS NOT NULL THEN
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'r.status=''active''','r.status IN (''active'',''scheduled'')');
    v_def:=regexp_replace(v_def,'ORDER BY r\.version DESC,r\.valid_from DESC LIMIT 1','ORDER BY r.valid_from DESC,r.version DESC LIMIT 1','gi');
    EXECUTE v_def;
  END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_operator_service_catalog' AND p.prokind='f' LIMIT 1;
  IF v_oid IS NOT NULL THEN
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'r.status=''active''','r.status IN (''active'',''scheduled'')');
    v_def:=regexp_replace(v_def,'order by r\.version desc,r\.valid_from desc limit 1','order by r.valid_from desc,r.version desc limit 1','gi');
    EXECUTE v_def;
  END IF;
END
$patch$;

REVOKE ALL ON FUNCTION public.get_company_service_price_schedule_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_company_service_price_schedule_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_company_service_price_schedule_v1(uuid,uuid,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_service_price_schedule_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_service_price_schedule_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_company_service_price_schedule_v1(uuid,uuid,date,uuid) TO authenticated;
