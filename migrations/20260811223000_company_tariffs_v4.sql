-- AuxiliOS · Tarifas v4
-- Fuente canónica: Tipos de Servicio habilitados + tarifario versionado.
-- Alcance general = billing_base_id NULL. Las bases son globales y solo se usan como excepción opcional.

DROP INDEX IF EXISTS public.company_rate_items_general_uq;
DROP INDEX IF EXISTS public.company_rate_items_branch_uq;

CREATE UNIQUE INDEX IF NOT EXISTS company_rate_items_general_concept_uq
  ON public.company_rate_items(rate_card_id, concept_id)
  WHERE is_active AND branch_id IS NULL AND billing_base_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_rate_items_billing_base_concept_uq
  ON public.company_rate_items(rate_card_id, billing_base_id, concept_id)
  WHERE is_active AND billing_base_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_rate_items_legacy_branch_concept_uq
  ON public.company_rate_items(rate_card_id, branch_id, concept_id)
  WHERE is_active AND branch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.validate_company_rate_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_card_status text;
  v_concept public.service_concepts%rowtype;
BEGIN
  SELECT ct.company_id, rc.status
    INTO v_company_id, v_card_status
  FROM public.company_rate_cards rc
  JOIN public.company_contracts ct ON ct.contract_id = rc.contract_id
  WHERE rc.rate_card_id = CASE WHEN tg_op = 'DELETE' THEN old.rate_card_id ELSE new.rate_card_id END;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Tarifario inexistente.'; END IF;
  IF v_card_status <> 'draft' THEN RAISE EXCEPTION 'Solo se puede modificar un tarifario en borrador.'; END IF;
  IF tg_op = 'DELETE' THEN RETURN old; END IF;

  IF new.branch_id IS NOT NULL AND new.billing_base_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede configurar una sucursal y una base operativa al mismo tiempo.';
  END IF;

  IF new.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_branches b
    WHERE b.branch_id = new.branch_id AND b.company_id = v_company_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La sucursal no pertenece a la empresa o está inactiva.';
  END IF;

  IF new.billing_base_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.billing_bases b
    WHERE b.base_id = new.billing_base_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La base operativa global no existe o está inactiva.';
  END IF;

  SELECT sc.* INTO v_concept
  FROM public.service_concepts sc
  WHERE sc.concept_id = new.concept_id;

  IF v_concept.concept_id IS NULL THEN RAISE EXCEPTION 'Tipo de Servicio inexistente.'; END IF;
  IF v_concept.billing_family = 'system' THEN RAISE EXCEPTION 'Este componente técnico no se configura como tarifa de servicio.'; END IF;
  IF NOT v_concept.is_active THEN RAISE EXCEPTION 'Tipo de Servicio inactivo.'; END IF;

  new.can_be_primary := v_concept.service_category IN ('primary', 'mixed');
  new.can_be_secondary := v_concept.service_category IN ('secondary', 'mixed');
  new.service_code := v_concept.code;
  new.service_name := v_concept.name;

  IF v_concept.distance_chargeable THEN
    new.pricing_unit := 'service';
    new.base_price := new.primary_price;
    IF v_concept.service_category = 'primary' THEN new.secondary_price := 0; END IF;
  ELSE
    new.included_km := 0;
    new.extra_km_price := 0;
    new.km_calculation_method := 'one_way';
    new.pricing_unit := COALESCE(NULLIF(new.pricing_unit, ''), v_concept.default_pricing_unit, 'service');
    IF new.can_be_primary AND NOT new.can_be_secondary THEN
      new.base_price := new.primary_price;
      new.secondary_price := 0;
    ELSIF new.can_be_secondary AND NOT new.can_be_primary THEN
      new.base_price := new.secondary_price;
      new.primary_price := 0;
    ELSE
      new.base_price := GREATEST(new.primary_price, new.secondary_price);
    END IF;
  END IF;

  new.tolls_mode := 'not_applicable';
  new.tolls_fixed_amount := 0;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_tariffs_v4(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_contract public.company_contracts%rowtype;
  v_active public.company_rate_cards%rowtype;
  v_draft public.company_rate_cards%rowtype;
  v_working uuid;
  v_enabled integer := 0;
  v_tariffed integer := 0;
BEGIN
  IF v_role NOT IN ('administracion', 'facturacion', 'supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar tarifas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Prestadora inexistente';
  END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id = p_company_id AND c.status = 'active'
  ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NOT NULL THEN
    SELECT r.* INTO v_active
    FROM public.company_rate_cards r
    WHERE r.contract_id = v_contract.contract_id AND r.status = 'active'
    ORDER BY r.version DESC
    LIMIT 1;

    SELECT r.* INTO v_draft
    FROM public.company_rate_cards r
    WHERE r.contract_id = v_contract.contract_id
      AND r.status = 'draft'
      AND (v_active.rate_card_id IS NULL OR r.version > v_active.version)
    ORDER BY r.version DESC, r.created_at DESC
    LIMIT 1;
  END IF;

  v_working := COALESCE(v_draft.rate_card_id, v_active.rate_card_id);

  SELECT count(*) INTO v_enabled
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.is_active AND sc.billing_family <> 'system';

  IF v_working IS NOT NULL THEN
    SELECT count(*) INTO v_tariffed
    FROM public.service_concepts sc
    JOIN public.company_service_settings css
      ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
    WHERE sc.is_active AND sc.billing_family <> 'system'
      AND EXISTS (
        SELECT 1 FROM public.company_rate_items i
        WHERE i.rate_card_id = v_working
          AND i.concept_id = sc.concept_id
          AND i.is_active
          AND i.branch_id IS NULL
          AND i.billing_base_id IS NULL
      );
  END IF;

  RETURN jsonb_build_object(
    'company', (SELECT jsonb_build_object('company_id', c.company_id, 'name', COALESCE(c.trade_name, c.legal_name)) FROM public.companies c WHERE c.company_id = p_company_id),
    'contract', CASE WHEN v_contract.contract_id IS NULL THEN NULL ELSE to_jsonb(v_contract) END,
    'active_card', CASE WHEN v_active.rate_card_id IS NULL THEN NULL ELSE to_jsonb(v_active) END,
    'draft_card', CASE WHEN v_draft.rate_card_id IS NULL THEN NULL ELSE to_jsonb(v_draft) END,
    'working_card_id', v_working,
    'enabled_count', v_enabled,
    'tariffed_count', v_tariffed,
    'pending_count', greatest(v_enabled - v_tariffed, 0),
    'bases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'base_id', b.base_id, 'base_code', b.base_code, 'name', b.name,
        'address', b.address, 'city', b.city, 'province', b.province
      ) ORDER BY b.name, b.base_code)
      FROM public.billing_bases b WHERE b.is_active
    ), '[]'::jsonb),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_id', sc.concept_id,
        'name', sc.name,
        'description', sc.description,
        'category', sc.service_category,
        'billing_family', sc.billing_family,
        'pricing_unit', sc.default_pricing_unit,
        'distance_chargeable', sc.distance_chargeable,
        'sort_order', sc.sort_order,
        'general_rate', (
          SELECT jsonb_build_object(
            'rate_item_id', i.rate_item_id,
            'base_price', i.base_price,
            'primary_price', i.primary_price,
            'secondary_price', i.secondary_price,
            'included_km', i.included_km,
            'extra_km_price', i.extra_km_price,
            'pricing_unit', i.pricing_unit,
            'notes', i.notes
          )
          FROM public.company_rate_items i
          WHERE i.rate_card_id = v_working
            AND i.concept_id = sc.concept_id
            AND i.is_active
            AND i.branch_id IS NULL
            AND i.billing_base_id IS NULL
          LIMIT 1
        ),
        'base_exceptions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'rate_item_id', i.rate_item_id,
            'base_id', b.base_id,
            'base_code', b.base_code,
            'base_name', b.name,
            'base_price', i.base_price,
            'primary_price', i.primary_price,
            'secondary_price', i.secondary_price,
            'included_km', i.included_km,
            'extra_km_price', i.extra_km_price,
            'pricing_unit', i.pricing_unit,
            'notes', i.notes
          ) ORDER BY b.name, b.base_code)
          FROM public.company_rate_items i
          JOIN public.billing_bases b ON b.base_id = i.billing_base_id
          WHERE i.rate_card_id = v_working
            AND i.concept_id = sc.concept_id
            AND i.is_active
            AND i.billing_base_id IS NOT NULL
        ), '[]'::jsonb)
      ) ORDER BY sc.sort_order, sc.name)
      FROM public.service_concepts sc
      JOIN public.company_service_settings css
        ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
      WHERE sc.is_active AND sc.billing_family <> 'system'
    ), '[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.ensure_company_tariff_draft_v4(p_company_id uuid, p_valid_from date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_contract public.company_contracts%rowtype;
  v_active public.company_rate_cards%rowtype;
  v_draft public.company_rate_cards%rowtype;
BEGIN
  IF v_role <> 'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar tarifas'; END IF;
  IF p_valid_from IS NULL THEN RAISE EXCEPTION 'La vigencia desde es obligatoria'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.company_id = p_company_id) THEN RAISE EXCEPTION 'Prestadora inexistente'; END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id = p_company_id AND c.status = 'active'
  ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NULL THEN
    INSERT INTO public.company_contracts(company_id, name, status, valid_from, currency, is_primary, notes)
    VALUES(p_company_id, 'Acuerdo comercial', 'active', p_valid_from, 'ARS', true, 'Creado automáticamente desde Tarifas')
    RETURNING * INTO v_contract;
  END IF;

  SELECT r.* INTO v_active
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract.contract_id AND r.status = 'active'
  ORDER BY r.version DESC
  LIMIT 1;

  SELECT r.* INTO v_draft
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract.contract_id
    AND r.status = 'draft'
    AND (v_active.rate_card_id IS NULL OR r.version > v_active.version)
  ORDER BY r.version DESC, r.created_at DESC
  LIMIT 1;

  IF v_draft.rate_card_id IS NOT NULL THEN
    IF v_draft.valid_from IS DISTINCT FROM p_valid_from THEN
      UPDATE public.company_rate_cards SET valid_from = p_valid_from
      WHERE rate_card_id = v_draft.rate_card_id
      RETURNING * INTO v_draft;
    END IF;
    RETURN to_jsonb(v_draft);
  END IF;

  INSERT INTO public.company_rate_cards(contract_id, name, status, valid_from, valid_until, currency, notes)
  VALUES(
    v_contract.contract_id,
    COALESCE(v_active.name, 'Tarifario general'),
    'draft', p_valid_from, NULL,
    COALESCE(v_active.currency, v_contract.currency, 'ARS'),
    CASE WHEN v_active.rate_card_id IS NULL THEN 'Nueva configuración tarifaria' ELSE 'Nueva vigencia basada en versión ' || v_active.version::text END
  ) RETURNING * INTO v_draft;

  IF v_active.rate_card_id IS NOT NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id, branch_id, service_code, service_name, base_price, included_km, extra_km_price,
      km_calculation_method, included_wait_minutes, wait_price_per_hour, tolls_mode, tolls_fixed_amount,
      extraction_fee, cancellation_fee, second_unit_fee, minimum_charge, night_surcharge_pct,
      weekend_surcharge_pct, holiday_surcharge_pct, is_active, notes, concept_id, can_be_primary,
      can_be_secondary, pricing_unit, primary_price, secondary_price, code_mode, code_prefix, billing_base_id
    )
    SELECT
      v_draft.rate_card_id, NULL, i.service_code, i.service_name, i.base_price, i.included_km, i.extra_km_price,
      i.km_calculation_method, i.included_wait_minutes, i.wait_price_per_hour, i.tolls_mode, i.tolls_fixed_amount,
      i.extraction_fee, i.cancellation_fee, i.second_unit_fee, i.minimum_charge, i.night_surcharge_pct,
      i.weekend_surcharge_pct, i.holiday_surcharge_pct, i.is_active, i.notes, i.concept_id, i.can_be_primary,
      i.can_be_secondary, i.pricing_unit, i.primary_price, i.secondary_price, i.code_mode, i.code_prefix, i.billing_base_id
    FROM public.company_rate_items i
    JOIN public.service_concepts sc ON sc.concept_id = i.concept_id
    WHERE i.rate_card_id = v_active.rate_card_id AND i.is_active AND sc.is_active AND sc.billing_family <> 'system';

    DELETE FROM public.company_rate_rule_exceptions WHERE rate_card_id = v_draft.rate_card_id;
    DELETE FROM public.company_rate_rules WHERE rate_card_id = v_draft.rate_card_id;
    INSERT INTO public.company_rate_rules(
      rate_card_id, rule_type, enabled, calculation_mode, amount, start_time, end_time,
      saturday_start, saturday_end, sunday_holiday_start, sunday_holiday_end, distance_threshold_km, notes
    )
    SELECT v_draft.rate_card_id, r.rule_type, r.enabled, r.calculation_mode, r.amount, r.start_time, r.end_time,
      r.saturday_start, r.saturday_end, r.sunday_holiday_start, r.sunday_holiday_end, r.distance_threshold_km, r.notes
    FROM public.company_rate_rules r WHERE r.rate_card_id = v_active.rate_card_id;

    INSERT INTO public.company_rate_rule_exceptions(rate_card_id, rule_id, concept_id)
    SELECT v_draft.rate_card_id, newr.rule_id, e.concept_id
    FROM public.company_rate_rule_exceptions e
    JOIN public.company_rate_rules oldr ON oldr.rule_id = e.rule_id
    JOIN public.company_rate_rules newr ON newr.rate_card_id = v_draft.rate_card_id AND newr.rule_type = oldr.rule_type
    WHERE e.rate_card_id = v_active.rate_card_id;

    UPDATE public.company_rate_billing_settings nb
    SET copay_enabled = ob.copay_enabled,
        copay_mode = ob.copay_mode,
        copay_value = ob.copay_value,
        toll_enabled = ob.toll_enabled,
        toll_invoice_enabled = ob.toll_invoice_enabled,
        toll_mode = ob.toll_mode,
        toll_fixed_amount = ob.toll_fixed_amount,
        require_toll_receipt = ob.require_toll_receipt
    FROM public.company_rate_billing_settings ob
    WHERE nb.rate_card_id = v_draft.rate_card_id AND ob.rate_card_id = v_active.rate_card_id;

    DELETE FROM public.company_rate_codes WHERE rate_card_id = v_draft.rate_card_id;
    INSERT INTO public.company_rate_codes(rate_card_id, code_key, enabled)
    SELECT v_draft.rate_card_id, c.code_key, c.enabled
    FROM public.company_rate_codes c WHERE c.rate_card_id = v_active.rate_card_id;

    INSERT INTO public.company_rate_service_links(rate_card_id, primary_concept_id, secondary_concept_id, price_override, is_enabled, notes)
    SELECT v_draft.rate_card_id, l.primary_concept_id, l.secondary_concept_id, l.price_override, l.is_enabled, l.notes
    FROM public.company_rate_service_links l
    WHERE l.rate_card_id = v_active.rate_card_id
      AND EXISTS (SELECT 1 FROM public.service_concepts p WHERE p.concept_id = l.primary_concept_id AND p.is_active)
      AND EXISTS (SELECT 1 FROM public.service_concepts s WHERE s.concept_id = l.secondary_concept_id AND s.is_active);
  END IF;

  RETURN to_jsonb(v_draft);
END
$function$;

CREATE OR REPLACE FUNCTION public.save_company_tariff_item_v4(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_card uuid := NULLIF(p_payload->>'rate_card_id', '')::uuid;
  v_company uuid := NULLIF(p_payload->>'company_id', '')::uuid;
  v_concept uuid := NULLIF(p_payload->>'concept_id', '')::uuid;
  v_base uuid := NULLIF(p_payload->>'billing_base_id', '')::uuid;
  v_price numeric := NULLIF(p_payload->>'unit_price', '')::numeric;
  v_base_price numeric := NULLIF(p_payload->>'base_price', '')::numeric;
  v_included numeric := COALESCE(NULLIF(p_payload->>'included_km', '')::numeric, 0);
  v_extra numeric := COALESCE(NULLIF(p_payload->>'extra_km_price', '')::numeric, 0);
  v_concept_row public.service_concepts%rowtype;
  v_item public.company_rate_items%rowtype;
  v_code_mode text := 'fixed';
  v_can_primary boolean;
  v_can_secondary boolean;
BEGIN
  IF v_role <> 'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar tarifas'; END IF;
  IF v_card IS NULL OR v_company IS NULL OR v_concept IS NULL THEN RAISE EXCEPTION 'Datos de tarifa incompletos'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_rate_cards rc
    JOIN public.company_contracts cc ON cc.contract_id = rc.contract_id
    WHERE rc.rate_card_id = v_card AND rc.status = 'draft' AND cc.company_id = v_company
  ) THEN RAISE EXCEPTION 'El tarifario no está en borrador o no pertenece a la prestadora'; END IF;

  SELECT sc.* INTO v_concept_row
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = v_company AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.concept_id = v_concept AND sc.is_active AND sc.billing_family <> 'system';
  IF v_concept_row.concept_id IS NULL THEN RAISE EXCEPTION 'El Tipo de Servicio no está habilitado para la prestadora'; END IF;

  IF v_base IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_bases b WHERE b.base_id = v_base AND b.is_active) THEN
    RAISE EXCEPTION 'La base operativa global no existe o está inactiva';
  END IF;

  SELECT COALESCE(css.code_mode, 'fixed') INTO v_code_mode
  FROM public.company_service_settings css
  WHERE css.company_id = v_company AND css.concept_id = v_concept;

  v_can_primary := v_concept_row.service_category IN ('primary', 'mixed');
  v_can_secondary := v_concept_row.service_category IN ('secondary', 'mixed');

  IF v_concept_row.distance_chargeable THEN
    IF v_base_price IS NULL OR v_base_price < 0 OR v_included < 0 OR v_extra < 0 THEN
      RAISE EXCEPTION 'Completá valores válidos para movida y kilómetros';
    END IF;
  ELSE
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'Ingresá un valor válido'; END IF;
  END IF;

  SELECT i.* INTO v_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id = v_card
    AND i.concept_id = v_concept
    AND i.is_active
    AND i.branch_id IS NULL
    AND COALESCE(i.billing_base_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_base, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id, branch_id, billing_base_id, concept_id, service_code, service_name,
      base_price, primary_price, secondary_price, included_km, extra_km_price, pricing_unit,
      can_be_primary, can_be_secondary, code_mode, is_active, notes
    ) VALUES (
      v_card, NULL, v_base, v_concept, v_concept_row.code, v_concept_row.name,
      CASE WHEN v_concept_row.distance_chargeable THEN v_base_price ELSE v_price END,
      CASE WHEN v_can_primary THEN COALESCE(v_base_price, v_price, 0) ELSE 0 END,
      CASE WHEN v_can_secondary THEN COALESCE(v_base_price, v_price, 0) ELSE 0 END,
      CASE WHEN v_concept_row.distance_chargeable THEN v_included ELSE 0 END,
      CASE WHEN v_concept_row.distance_chargeable THEN v_extra ELSE 0 END,
      CASE WHEN v_concept_row.distance_chargeable THEN 'service' ELSE COALESCE(v_concept_row.default_pricing_unit, 'service') END,
      v_can_primary, v_can_secondary, COALESCE(v_code_mode, 'fixed'), true,
      NULLIF(trim(COALESCE(p_payload->>'notes', '')), '')
    ) RETURNING * INTO v_item;
  ELSE
    UPDATE public.company_rate_items
    SET billing_base_id = v_base,
        base_price = CASE WHEN v_concept_row.distance_chargeable THEN v_base_price ELSE v_price END,
        primary_price = CASE WHEN v_can_primary THEN COALESCE(v_base_price, v_price, 0) ELSE 0 END,
        secondary_price = CASE WHEN v_can_secondary THEN COALESCE(v_base_price, v_price, 0) ELSE 0 END,
        included_km = CASE WHEN v_concept_row.distance_chargeable THEN v_included ELSE 0 END,
        extra_km_price = CASE WHEN v_concept_row.distance_chargeable THEN v_extra ELSE 0 END,
        pricing_unit = CASE WHEN v_concept_row.distance_chargeable THEN 'service' ELSE COALESCE(v_concept_row.default_pricing_unit, 'service') END,
        can_be_primary = v_can_primary,
        can_be_secondary = v_can_secondary,
        code_mode = COALESCE(v_code_mode, 'fixed'),
        notes = NULLIF(trim(COALESCE(p_payload->>'notes', '')), '')
    WHERE rate_item_id = v_item.rate_item_id
    RETURNING * INTO v_item;
  END IF;

  RETURN to_jsonb(v_item);
END
$function$;

CREATE OR REPLACE FUNCTION public.delete_company_tariff_exception_v4(
  p_rate_card_id uuid, p_company_id uuid, p_concept_id uuid, p_base_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() <> 'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar tarifas'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_rate_cards rc
    JOIN public.company_contracts cc ON cc.contract_id = rc.contract_id
    WHERE rc.rate_card_id = p_rate_card_id AND rc.status = 'draft' AND cc.company_id = p_company_id
  ) THEN RAISE EXCEPTION 'Tarifario inválido'; END IF;

  DELETE FROM public.company_rate_items i
  WHERE i.rate_card_id = p_rate_card_id
    AND i.concept_id = p_concept_id
    AND i.billing_base_id = p_base_id
    AND i.branch_id IS NULL;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.publish_company_tariff_draft_v4(p_rate_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_missing integer;
  v_card public.company_rate_cards%rowtype;
BEGIN
  IF app_private.current_auxilios_role() <> 'administracion' THEN RAISE EXCEPTION 'Solo Administración puede publicar tarifas'; END IF;

  SELECT cc.company_id INTO v_company
  FROM public.company_rate_cards rc
  JOIN public.company_contracts cc ON cc.contract_id = rc.contract_id
  WHERE rc.rate_card_id = p_rate_card_id AND rc.status = 'draft';
  IF v_company IS NULL THEN RAISE EXCEPTION 'Tarifario en borrador inexistente'; END IF;

  SELECT count(*) INTO v_missing
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = v_company AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.is_active AND sc.billing_family <> 'system'
    AND NOT EXISTS (
      SELECT 1 FROM public.company_rate_items i
      WHERE i.rate_card_id = p_rate_card_id
        AND i.concept_id = sc.concept_id
        AND i.is_active
        AND i.branch_id IS NULL
        AND i.billing_base_id IS NULL
    );
  IF v_missing > 0 THEN RAISE EXCEPTION 'Hay % servicio(s) habilitado(s) sin tarifa general', v_missing; END IF;

  UPDATE public.company_rate_cards SET status = 'active'
  WHERE rate_card_id = p_rate_card_id
  RETURNING * INTO v_card;

  RETURN public.get_company_tariffs_v4(v_company);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_tariff_history_v4(p_company_id uuid, p_concept_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() NOT IN ('administracion', 'facturacion', 'supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar historial';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'rate_card_id', rc.rate_card_id,
      'version', rc.version,
      'status', rc.status,
      'valid_from', rc.valid_from,
      'valid_until', rc.valid_until,
      'currency', rc.currency,
      'rate_item_id', i.rate_item_id,
      'billing_base_id', i.billing_base_id,
      'base_name', b.name,
      'base_price', i.base_price,
      'primary_price', i.primary_price,
      'secondary_price', i.secondary_price,
      'included_km', i.included_km,
      'extra_km_price', i.extra_km_price,
      'pricing_unit', i.pricing_unit
    ) ORDER BY rc.version DESC, b.name NULLS FIRST)
    FROM public.company_contracts cc
    JOIN public.company_rate_cards rc ON rc.contract_id = cc.contract_id
    JOIN public.company_rate_items i ON i.rate_card_id = rc.rate_card_id AND i.concept_id = p_concept_id
    LEFT JOIN public.billing_bases b ON b.base_id = i.billing_base_id
    WHERE cc.company_id = p_company_id
  ), '[]'::jsonb);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_company_tariffs_v4(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_company_tariff_draft_v4(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_company_tariff_item_v4(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_company_tariff_exception_v4(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.publish_company_tariff_draft_v4(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_tariff_history_v4(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_company_tariffs_v4(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_company_tariff_draft_v4(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_tariff_item_v4(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_tariff_exception_v4(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_company_tariff_draft_v4(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_tariff_history_v4(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_tariffs_v4(uuid) IS 'Tarifas canónicas por prestadora: solo Tipos de Servicio habilitados, tarifa general y excepciones opcionales por base global.';
COMMENT ON FUNCTION public.ensure_company_tariff_draft_v4(uuid,date) IS 'Crea/reutiliza una versión borrador preservando el tarifario publicado.';
COMMENT ON FUNCTION public.publish_company_tariff_draft_v4(uuid) IS 'Publica el borrador solo cuando todos los servicios habilitados poseen tarifa general.';
