-- AuxiliOS · línea temporal canónica de precios

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
    AND c.valid_from<=p_source_valid_from
    AND (c.valid_until IS NULL OR c.valid_until>=p_source_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC
  LIMIT 1;
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
    WHERE i.rate_card_id=v_future_card.rate_card_id
      AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
      AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF p_before IS NULL OR p_before='null'::jsonb THEN
      -- Si antes no existía precio y una vigencia futura ya lo tiene,
      -- ese valor es un cambio explícito: la cascada termina ahí.
      IF v_future.rate_item_id IS NOT NULL THEN EXIT; END IF;
      IF p_after_rate_item_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.company_rate_items(
        rate_card_id,branch_id,billing_base_id,service_code,service_name,base_price,included_km,extra_km_price,
        km_calculation_method,included_wait_minutes,wait_price_per_hour,tolls_mode,tolls_fixed_amount,extraction_fee,
        cancellation_fee,second_unit_fee,minimum_charge,night_surcharge_pct,weekend_surcharge_pct,holiday_surcharge_pct,
        is_active,notes,concept_id,can_be_primary,can_be_secondary,pricing_unit,primary_price,secondary_price,code_mode,code_prefix
      )
      SELECT
        v_future_card.rate_card_id,s.branch_id,s.billing_base_id,s.service_code,s.service_name,s.base_price,s.included_km,s.extra_km_price,
        s.km_calculation_method,s.included_wait_minutes,s.wait_price_per_hour,s.tolls_mode,s.tolls_fixed_amount,s.extraction_fee,
        s.cancellation_fee,s.second_unit_fee,s.minimum_charge,s.night_surcharge_pct,s.weekend_surcharge_pct,s.holiday_surcharge_pct,
        s.is_active,s.notes,s.concept_id,s.can_be_primary,s.can_be_secondary,s.pricing_unit,s.primary_price,s.secondary_price,s.code_mode,s.code_prefix
      FROM public.company_rate_items s WHERE s.rate_item_id=p_after_rate_item_id;
      CONTINUE;
    END IF;

    IF v_future.rate_item_id IS NULL THEN EXIT; END IF;
    v_same_as_before :=
      v_future.base_price IS NOT DISTINCT FROM nullif(p_before->>'base_price','')::numeric AND
      v_future.primary_price IS NOT DISTINCT FROM nullif(p_before->>'primary_price','')::numeric AND
      v_future.secondary_price IS NOT DISTINCT FROM nullif(p_before->>'secondary_price','')::numeric AND
      v_future.extra_km_price IS NOT DISTINCT FROM nullif(p_before->>'extra_km_price','')::numeric AND
      v_future.pricing_unit IS NOT DISTINCT FROM p_before->>'pricing_unit';
    IF NOT v_same_as_before THEN EXIT; END IF;

    IF p_after_rate_item_id IS NULL THEN
      DELETE FROM public.company_rate_items WHERE rate_item_id=v_future.rate_item_id;
    ELSE
      UPDATE public.company_rate_items t SET
        service_code=s.service_code,service_name=s.service_name,base_price=s.base_price,included_km=s.included_km,
        extra_km_price=s.extra_km_price,km_calculation_method=s.km_calculation_method,
        included_wait_minutes=s.included_wait_minutes,wait_price_per_hour=s.wait_price_per_hour,
        tolls_mode=s.tolls_mode,tolls_fixed_amount=s.tolls_fixed_amount,extraction_fee=s.extraction_fee,
        cancellation_fee=s.cancellation_fee,second_unit_fee=s.second_unit_fee,minimum_charge=s.minimum_charge,
        night_surcharge_pct=s.night_surcharge_pct,weekend_surcharge_pct=s.weekend_surcharge_pct,
        holiday_surcharge_pct=s.holiday_surcharge_pct,notes=s.notes,can_be_primary=s.can_be_primary,
        can_be_secondary=s.can_be_secondary,pricing_unit=s.pricing_unit,primary_price=s.primary_price,
        secondary_price=s.secondary_price,code_mode=s.code_mode,code_prefix=s.code_prefix,updated_by=auth.uid()
      FROM public.company_rate_items s
      WHERE t.rate_item_id=v_future.rate_item_id AND s.rate_item_id=p_after_rate_item_id;
    END IF;
  END LOOP;

  PERFORM set_config('app.suppress_audit','off',true);
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
  v_km numeric:=nullif(p_payload->>'km_price','')::numeric;
  v_unit numeric:=nullif(p_payload->>'unit_price','')::numeric;
  v_card uuid;
  v_sc public.service_concepts%rowtype;
  v_item public.company_rate_items%rowtype;
  v_before jsonb;
  v_code_mode text:='fixed';
  v_can_primary boolean;
  v_can_secondary boolean;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar precios'; END IF;
  IF v_company IS NULL OR v_concept IS NULL THEN RAISE EXCEPTION 'Datos de precio incompletos'; END IF;

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

  v_card:=app_private.current_price_card_for_company(v_company,true);
  IF v_card IS NULL THEN RAISE EXCEPTION 'No se pudo preparar el almacenamiento de precios'; END IF;
  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode FROM public.company_service_settings css WHERE css.company_id=v_company AND css.concept_id=v_concept;
  v_can_primary:=v_sc.service_category IN ('primary','mixed');
  v_can_secondary:=v_sc.service_category IN ('secondary','mixed');

  SELECT i.* INTO v_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=v_concept AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  IF v_item.rate_item_id IS NOT NULL THEN v_before:=to_jsonb(v_item); END IF;

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

  PERFORM app_private.cascade_company_service_price_v1(v_company,v_concept,v_base,current_date,v_before,v_item.rate_item_id);
  RETURN to_jsonb(v_item);
END
$function$;

CREATE OR REPLACE FUNCTION public.delete_company_service_price_exception_v1(p_company_id uuid,p_concept_id uuid,p_base_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_card uuid;
  v_item public.company_rate_items%rowtype;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar precios'; END IF;
  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NULL THEN RETURN true; END IF;

  SELECT i.* INTO v_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=p_concept_id AND i.billing_base_id=p_base_id AND i.branch_id IS NULL AND i.is_active
  LIMIT 1;
  IF v_item.rate_item_id IS NULL THEN RETURN true; END IF;

  DELETE FROM public.company_rate_items WHERE rate_item_id=v_item.rate_item_id;
  PERFORM app_private.cascade_company_service_price_v1(p_company_id,p_concept_id,p_base_id,current_date,to_jsonb(v_item),NULL);
  RETURN true;
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
  v_before jsonb;
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
  IF v_item.rate_item_id IS NOT NULL THEN v_before:=to_jsonb(v_item); END IF;

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

  PERFORM app_private.cascade_company_service_price_v1(v_company,v_concept,v_base,v_valid_from,v_before,v_item.rate_item_id);
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
DECLARE
  v_contract uuid;
  v_target uuid;
  v_source uuid;
  v_source_item public.company_rate_items%rowtype;
  v_target_item public.company_rate_items%rowtype;
  v_after_id uuid;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede cancelar precios programados'; END IF;
  IF p_valid_from<=current_date THEN RAISE EXCEPTION 'Solo pueden cancelarse cambios futuros'; END IF;

  SELECT c.contract_id INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
    AND c.valid_from<=p_valid_from AND (c.valid_until IS NULL OR c.valid_until>=p_valid_from)
  ORDER BY c.is_primary DESC,c.valid_from DESC LIMIT 1;
  SELECT r.rate_card_id INTO v_target
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status='scheduled' AND r.valid_from=p_valid_from LIMIT 1;
  IF v_target IS NULL THEN RETURN true; END IF;

  SELECT r.rate_card_id INTO v_source
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract AND r.status IN ('active','scheduled') AND r.valid_from<p_valid_from
  ORDER BY r.valid_from DESC,r.version DESC LIMIT 1;

  SELECT i.* INTO v_source_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_source AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  SELECT i.* INTO v_target_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_target AND i.concept_id=p_concept_id AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;
  IF v_target_item.rate_item_id IS NULL THEN RETURN true; END IF;

  IF v_source_item.rate_item_id IS NULL THEN
    DELETE FROM public.company_rate_items WHERE rate_item_id=v_target_item.rate_item_id;
    v_after_id:=NULL;
  ELSE
    UPDATE public.company_rate_items t SET
      service_code=s.service_code,service_name=s.service_name,base_price=s.base_price,included_km=s.included_km,
      extra_km_price=s.extra_km_price,km_calculation_method=s.km_calculation_method,
      included_wait_minutes=s.included_wait_minutes,wait_price_per_hour=s.wait_price_per_hour,
      tolls_mode=s.tolls_mode,tolls_fixed_amount=s.tolls_fixed_amount,extraction_fee=s.extraction_fee,
      cancellation_fee=s.cancellation_fee,second_unit_fee=s.second_unit_fee,minimum_charge=s.minimum_charge,
      night_surcharge_pct=s.night_surcharge_pct,weekend_surcharge_pct=s.weekend_surcharge_pct,
      holiday_surcharge_pct=s.holiday_surcharge_pct,notes=s.notes,can_be_primary=s.can_be_primary,
      can_be_secondary=s.can_be_secondary,pricing_unit=s.pricing_unit,primary_price=s.primary_price,
      secondary_price=s.secondary_price,code_mode=s.code_mode,code_prefix=s.code_prefix,updated_by=auth.uid()
    FROM public.company_rate_items s
    WHERE t.rate_item_id=v_target_item.rate_item_id AND s.rate_item_id=v_source_item.rate_item_id;
    v_after_id:=v_target_item.rate_item_id;
  END IF;

  PERFORM app_private.cascade_company_service_price_v1(p_company_id,p_concept_id,p_base_id,p_valid_from,to_jsonb(v_target_item),v_after_id);
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION app_private.cascade_company_service_price_v1(uuid,uuid,uuid,date,jsonb,uuid) FROM PUBLIC;
