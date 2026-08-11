-- AuxiliOS · Operación sobre Tarifas v4
-- Conserva los nombres públicos v3 usados por el frontend, pero elimina company_tariff_matrix_rates
-- como fuente operativa. Operador y Administración cotizan desde company_rate_items publicados.

CREATE OR REPLACE FUNCTION app_private.calculate_operator_service_quote_v4_full(
  p_company_id uuid,
  p_base_id uuid,
  p_scheduled_for timestamptz,
  p_primary_concept_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_asphalt_km numeric DEFAULT 0,
  p_gravel_km numeric DEFAULT 0,
  p_toll_amount numeric DEFAULT 0,
  p_is_holiday boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_local timestamp := COALESCE(p_scheduled_for, now()) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_dow integer := extract(dow FROM v_local)::integer;
  v_contract public.company_contracts%rowtype;
  v_card public.company_rate_cards%rowtype;
  v_primary public.service_concepts%rowtype;
  v_rate public.company_rate_items%rowtype;
  v_rule public.company_rate_rules%rowtype;
  v_billing public.company_rate_billing_settings%rowtype;
  v_manual jsonb;
  v_concept record;
  v_qty numeric;
  v_subtotal numeric;
  v_distance numeric := COALESCE(p_asphalt_km, 0) + COALESCE(p_gravel_km, 0);
  v_chargeable numeric := 0;
  v_components jsonb := '[]'::jsonb;
  v_surcharges jsonb := '[]'::jsonb;
  v_base numeric := 0;
  v_eligible numeric := 0;
  v_charge numeric := 0;
  v_surcharge_total numeric := 0;
  v_toll numeric := 0;
  v_total numeric := 0;
  v_copay numeric := 0;
  v_company_total numeric := 0;
  v_applies boolean;
  v_currency text;
  v_seen uuid[] := '{}'::uuid[];
  v_legacy_category uuid;
BEGIN
  IF COALESCE(p_asphalt_km, 0) < 0 OR COALESCE(p_gravel_km, 0) < 0 OR COALESCE(p_toll_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Kilómetros o peaje inválidos';
  END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id = p_company_id
    AND c.status = 'active'
    AND c.valid_from <= v_date
    AND (c.valid_until IS NULL OR c.valid_until >= v_date)
  ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'La prestadora no tiene un contrato vigente'; END IF;

  SELECT r.* INTO v_card
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract.contract_id
    AND r.status = 'active'
    AND r.valid_from <= v_date
    AND (r.valid_until IS NULL OR r.valid_until >= v_date)
  ORDER BY r.version DESC, r.valid_from DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'El contrato no tiene un tarifario publicado y vigente'; END IF;
  v_currency := v_card.currency;

  SELECT sc.* INTO v_primary
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.concept_id = p_primary_concept_id
    AND sc.is_active
    AND sc.billing_family <> 'system'
    AND sc.service_category IN ('primary', 'mixed');
  IF NOT FOUND THEN RAISE EXCEPTION 'El Tipo de Servicio principal no está habilitado para la prestadora'; END IF;

  SELECT i.* INTO v_rate
  FROM public.company_rate_items i
  WHERE i.rate_card_id = v_card.rate_card_id
    AND i.concept_id = v_primary.concept_id
    AND i.is_active
    AND i.branch_id IS NULL
    AND (i.billing_base_id IS NULL OR i.billing_base_id = p_base_id)
  ORDER BY (i.billing_base_id = p_base_id) DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'El servicio % no tiene tarifa vigente', v_primary.name; END IF;

  SELECT c.category_id INTO v_legacy_category
  FROM public.service_categories c
  WHERE c.legacy_primary_concept_id = v_primary.concept_id AND c.is_active
  ORDER BY c.sort_order
  LIMIT 1;

  v_subtotal := COALESCE(v_rate.primary_price, v_rate.base_price, 0);
  v_base := v_base + v_subtotal;
  v_components := v_components || jsonb_build_array(jsonb_build_object(
    'role', 'movement',
    'component_type', 'service',
    'concept_id', v_primary.concept_id,
    'rate_item_id', v_rate.rate_item_id,
    'service_code', v_primary.code,
    'service_name', v_primary.name,
    'pricing_unit', 'service',
    'quantity', 1,
    'unit_price', COALESCE(v_rate.primary_price, v_rate.base_price, 0),
    'subtotal', v_subtotal,
    'included_km', v_rate.included_km,
    'extra_km_price', v_rate.extra_km_price,
    'requires_own_code', false,
    'price_source', CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
  ));

  IF v_primary.distance_chargeable THEN
    v_chargeable := greatest(v_distance - COALESCE(v_rate.included_km, 0), 0);
    IF v_chargeable > 0 THEN
      v_subtotal := round(v_chargeable * COALESCE(v_rate.extra_km_price, 0), 2);
      v_base := v_base + v_subtotal;
      v_components := v_components || jsonb_build_array(jsonb_build_object(
        'role', 'distance',
        'component_type', 'distance',
        'concept_id', v_primary.concept_id,
        'rate_item_id', v_rate.rate_item_id,
        'service_code', v_primary.code,
        'service_name', v_primary.name || ' · KM excedente',
        'pricing_unit', 'km',
        'quantity', v_chargeable,
        'unit_price', COALESCE(v_rate.extra_km_price, 0),
        'subtotal', v_subtotal,
        'included_km', v_rate.included_km,
        'requires_own_code', false,
        'price_source', CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
      ));
    END IF;
  END IF;

  FOR v_manual IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    BEGIN
      IF NULLIF(v_manual->>'concept_id', '') IS NULL THEN RAISE EXCEPTION 'Concepto inválido'; END IF;
      IF (v_manual->>'concept_id')::uuid = ANY(v_seen) THEN RAISE EXCEPTION 'El mismo concepto no puede agregarse dos veces'; END IF;
      v_seen := array_append(v_seen, (v_manual->>'concept_id')::uuid);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Concepto inválido';
    END;

    SELECT sc.concept_id, sc.code, sc.name, sc.default_pricing_unit, COALESCE(css.code_mode, 'fixed') code_mode
      INTO v_concept
    FROM public.service_concepts sc
    JOIN public.company_service_settings css
      ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
    WHERE sc.concept_id = (v_manual->>'concept_id')::uuid
      AND sc.is_active
      AND sc.billing_family <> 'system'
      AND sc.service_category IN ('secondary', 'mixed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Un servicio adicional no está habilitado para la prestadora'; END IF;

    v_qty := COALESCE(NULLIF(v_manual->>'quantity', '')::numeric, 1);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'La cantidad de % debe ser mayor a cero', v_concept.name; END IF;

    SELECT i.* INTO v_rate
    FROM public.company_rate_items i
    WHERE i.rate_card_id = v_card.rate_card_id
      AND i.concept_id = v_concept.concept_id
      AND i.is_active
      AND i.branch_id IS NULL
      AND (i.billing_base_id IS NULL OR i.billing_base_id = p_base_id)
    ORDER BY (i.billing_base_id = p_base_id) DESC NULLS LAST
    LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'El servicio % no tiene tarifa vigente', v_concept.name; END IF;

    v_subtotal := round(v_qty * COALESCE(v_rate.secondary_price, v_rate.base_price, 0), 2);
    v_base := v_base + v_subtotal;
    v_components := v_components || jsonb_build_array(jsonb_build_object(
      'role', 'secondary',
      'component_type', 'service',
      'concept_id', v_concept.concept_id,
      'rate_item_id', v_rate.rate_item_id,
      'service_code', v_concept.code,
      'service_name', v_concept.name,
      'pricing_unit', v_rate.pricing_unit,
      'quantity', v_qty,
      'unit_price', COALESCE(v_rate.secondary_price, v_rate.base_price, 0),
      'subtotal', v_subtotal,
      'requires_own_code', v_concept.code_mode = 'manual',
      'price_source', CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END LOOP;

  FOR v_rule IN
    SELECT * FROM public.company_rate_rules
    WHERE rate_card_id = v_card.rate_card_id AND enabled
    ORDER BY rule_type
  LOOP
    v_applies := false;
    IF v_rule.rule_type = 'night' AND v_rule.start_time IS NOT NULL AND v_rule.end_time IS NOT NULL THEN
      v_applies := CASE WHEN v_rule.start_time <= v_rule.end_time
        THEN v_time BETWEEN v_rule.start_time AND v_rule.end_time
        ELSE v_time >= v_rule.start_time OR v_time <= v_rule.end_time END;
    ELSIF v_rule.rule_type = 'weekend_holiday' THEN
      IF v_dow = 6 AND v_rule.saturday_start IS NOT NULL AND v_rule.saturday_end IS NOT NULL THEN
        v_applies := CASE WHEN v_rule.saturday_start <= v_rule.saturday_end
          THEN v_time BETWEEN v_rule.saturday_start AND v_rule.saturday_end
          ELSE v_time >= v_rule.saturday_start OR v_time <= v_rule.saturday_end END;
      ELSIF (v_dow = 0 OR p_is_holiday) AND v_rule.sunday_holiday_start IS NOT NULL AND v_rule.sunday_holiday_end IS NOT NULL THEN
        v_applies := CASE WHEN v_rule.sunday_holiday_start <= v_rule.sunday_holiday_end
          THEN v_time BETWEEN v_rule.sunday_holiday_start AND v_rule.sunday_holiday_end
          ELSE v_time >= v_rule.sunday_holiday_start OR v_time <= v_rule.sunday_holiday_end END;
      END IF;
    ELSIF v_rule.rule_type = 'wide_coverage' THEN
      v_applies := v_distance >= COALESCE(v_rule.distance_threshold_km, 0) AND COALESCE(v_rule.distance_threshold_km, 0) > 0;
    END IF;

    IF v_applies THEN
      SELECT COALESCE(sum((x.value->>'subtotal')::numeric), 0) INTO v_eligible
      FROM jsonb_array_elements(v_components) x(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_rate_rule_exceptions e
        WHERE e.rule_id = v_rule.rule_id AND e.concept_id = (x.value->>'concept_id')::uuid
      );
      v_charge := CASE WHEN v_eligible <= 0 THEN 0
        WHEN v_rule.calculation_mode = 'fixed' THEN v_rule.amount
        ELSE round(v_eligible * v_rule.amount / 100, 2) END;
      IF v_charge > 0 THEN
        v_surcharge_total := v_surcharge_total + v_charge;
        v_surcharges := v_surcharges || jsonb_build_array(jsonb_build_object(
          'rule_id', v_rule.rule_id,
          'rule_type', v_rule.rule_type,
          'calculation_mode', v_rule.calculation_mode,
          'configured_value', v_rule.amount,
          'eligible_base', v_eligible,
          'amount', v_charge
        ));
      END IF;
    END IF;
  END LOOP;

  SELECT b.* INTO v_billing
  FROM public.company_rate_billing_settings b
  WHERE b.rate_card_id = v_card.rate_card_id;

  IF FOUND AND v_billing.toll_enabled AND v_billing.toll_invoice_enabled THEN
    v_toll := CASE v_billing.toll_mode
      WHEN 'fixed' THEN v_billing.toll_fixed_amount
      WHEN 'at_cost' THEN p_toll_amount
      ELSE 0 END;
  END IF;

  v_total := round(v_base + v_surcharge_total + v_toll, 2);
  IF FOUND AND v_billing.copay_enabled THEN
    v_copay := CASE WHEN v_billing.copay_mode = 'percentage'
      THEN round(v_total * v_billing.copay_value / 100, 2)
      ELSE v_billing.copay_value END;
    v_copay := least(greatest(v_copay, 0), v_total);
  END IF;
  v_company_total := v_total - v_copay;

  RETURN jsonb_build_object(
    'pricing_valid', true,
    'pricing_model', 'rate_card_v4',
    'company_id', p_company_id,
    'billing_base_id', p_base_id,
    'contract_id', v_contract.contract_id,
    'contract_name', v_contract.name,
    'rate_card_id', v_card.rate_card_id,
    'rate_card_name', v_card.name,
    'rate_card_version', v_card.version,
    'currency', v_currency,
    'scheduled_for', p_scheduled_for,
    'category_id', p_primary_concept_id,
    'legacy_category_id', v_legacy_category,
    'primary_concept_id', v_primary.concept_id,
    'primary_service_name', v_primary.name,
    'components', v_components,
    'surcharges', v_surcharges,
    'asphalt_km', COALESCE(p_asphalt_km, 0),
    'gravel_km', COALESCE(p_gravel_km, 0),
    'distance_km', v_distance,
    'toll_input', p_toll_amount,
    'is_holiday', p_is_holiday,
    'base_subtotal', round(v_base, 2),
    'surcharge_total', round(v_surcharge_total, 2),
    'toll_total', round(v_toll, 2),
    'copay_total', round(v_copay, 2),
    'estimated_total', round(v_total, 2),
    'company_estimated_total', round(v_company_total, 2),
    'calculated_at', now()
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_category_tariff_v3(
  p_company_id uuid,
  p_base_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_as_of date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_commercial boolean;
  v_contract uuid;
  v_card uuid;
  v_currency text;
BEGIN
  IF v_role NOT IN ('administracion', 'facturacion', 'operador', 'supervision') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_commercial := v_role IN ('administracion', 'facturacion');

  SELECT c.contract_id INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id = p_company_id AND c.status = 'active'
    AND c.valid_from <= p_as_of AND (c.valid_until IS NULL OR c.valid_until >= p_as_of)
  ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC
  LIMIT 1;
  IF v_contract IS NULL THEN RAISE EXCEPTION 'La prestadora no tiene un contrato vigente'; END IF;

  SELECT r.rate_card_id, r.currency INTO v_card, v_currency
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract AND r.status = 'active'
    AND r.valid_from <= p_as_of AND (r.valid_until IS NULL OR r.valid_until >= p_as_of)
  ORDER BY r.version DESC, r.valid_from DESC
  LIMIT 1;
  IF v_card IS NULL THEN RAISE EXCEPTION 'El contrato no tiene un tarifario publicado y vigente'; END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_concepts sc
    JOIN public.company_service_settings css
      ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
    WHERE sc.concept_id = p_category_id AND sc.is_active AND sc.service_category IN ('primary', 'mixed')
  ) THEN RAISE EXCEPTION 'El Tipo de Servicio no está habilitado para la prestadora'; END IF;

  RETURN jsonb_build_object(
    'contract_id', v_contract,
    'rate_card_id', v_card,
    'currency', v_currency,
    'as_of', p_as_of,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category_id', sc.concept_id,
        'code', sc.code,
        'name', sc.name,
        'sort_order', sc.sort_order
      ) ORDER BY sc.sort_order, sc.name)
      FROM public.service_concepts sc
      JOIN public.company_service_settings css
        ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
      WHERE sc.is_active AND sc.billing_family <> 'system'
        AND sc.service_category IN ('primary', 'mixed')
        AND EXISTS (
          SELECT 1 FROM public.company_rate_items i
          WHERE i.rate_card_id = v_card AND i.concept_id = sc.concept_id AND i.is_active
            AND i.branch_id IS NULL AND (i.billing_base_id IS NULL OR i.billing_base_id = p_base_id)
        )
    ), '[]'::jsonb),
    'concepts', CASE WHEN p_category_id IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_id', sc.concept_id,
        'code', sc.code,
        'name', sc.name,
        'pricing_unit', i.pricing_unit,
        'quantity_source', 'manual',
        'auto_apply', false,
        'requires_own_code', COALESCE(css.code_mode, 'fixed') = 'manual',
        'tariff_type_code', tt.code,
        'tariff_type_name', tt.name,
        'rate_version_id', CASE WHEN v_commercial THEN i.rate_item_id ELSE NULL END,
        'unit_price', CASE WHEN v_commercial THEN i.secondary_price ELSE NULL END,
        'currency', CASE WHEN v_commercial THEN v_currency ELSE NULL END
      ) ORDER BY sc.sort_order, sc.name)
      FROM public.service_concepts sc
      JOIN public.company_service_settings css
        ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
      JOIN LATERAL (
        SELECT ri.* FROM public.company_rate_items ri
        WHERE ri.rate_card_id = v_card AND ri.concept_id = sc.concept_id AND ri.is_active
          AND ri.branch_id IS NULL AND (ri.billing_base_id IS NULL OR ri.billing_base_id = p_base_id)
        ORDER BY (ri.billing_base_id = p_base_id) DESC NULLS LAST
        LIMIT 1
      ) i ON true
      LEFT JOIN LATERAL (
        SELECT t.code, t.name
        FROM public.tariff_type_service_links l
        JOIN public.tariff_types t ON t.tariff_type_id = l.tariff_type_id AND t.is_active
        WHERE l.concept_id = sc.concept_id AND l.is_active
        ORDER BY t.sort_order
        LIMIT 1
      ) tt ON true
      WHERE sc.is_active AND sc.billing_family <> 'system'
        AND sc.service_category IN ('secondary', 'mixed')
        AND sc.concept_id <> p_category_id
    ), '[]'::jsonb) END
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.calculate_operator_service_quote_v3(
  p_company_id uuid,
  p_base_id uuid,
  p_scheduled_for timestamptz,
  p_category_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_asphalt_km numeric DEFAULT 0,
  p_gravel_km numeric DEFAULT 0,
  p_toll_amount numeric DEFAULT 0,
  p_is_holiday boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_full jsonb;
  v_components jsonb;
BEGIN
  IF v_role NOT IN ('administracion', 'facturacion', 'operador', 'supervision') THEN
    RAISE EXCEPTION 'Sin permiso para cotizar servicios';
  END IF;

  v_full := app_private.calculate_operator_service_quote_v4_full(
    p_company_id, p_base_id, p_scheduled_for, p_category_id, p_items,
    p_asphalt_km, p_gravel_km, p_toll_amount, p_is_holiday
  );

  IF v_role IN ('administracion', 'facturacion') THEN RETURN v_full; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', x->>'role',
    'concept_id', x->>'concept_id',
    'service_code', x->>'service_code',
    'service_name', x->>'service_name',
    'pricing_unit', x->>'pricing_unit',
    'quantity', COALESCE((x->>'quantity')::numeric, 1),
    'requires_own_code', COALESCE((x->>'requires_own_code')::boolean, false)
  )), '[]'::jsonb) INTO v_components
  FROM jsonb_array_elements(COALESCE(v_full->'components', '[]'::jsonb)) x;

  RETURN jsonb_build_object(
    'pricing_valid', true,
    'pricing_model', 'rate_card_v4',
    'company_id', v_full->'company_id',
    'billing_base_id', v_full->'billing_base_id',
    'contract_name', v_full->'contract_name',
    'rate_card_name', v_full->'rate_card_name',
    'rate_card_version', v_full->'rate_card_version',
    'scheduled_for', v_full->'scheduled_for',
    'category_id', v_full->'category_id',
    'primary_concept_id', v_full->'primary_concept_id',
    'primary_service_name', v_full->'primary_service_name',
    'components', v_components,
    'asphalt_km', v_full->'asphalt_km',
    'gravel_km', v_full->'gravel_km',
    'distance_km', v_full->'distance_km',
    'has_surcharges', jsonb_array_length(COALESCE(v_full->'surcharges', '[]'::jsonb)) > 0,
    'tolls_included', COALESCE((v_full->>'toll_total')::numeric, 0) > 0,
    'calculated_at', v_full->'calculated_at'
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.create_operator_service_v3(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_quote jsonb;
  v_service public.operator_services%rowtype;
  v_component jsonb;
  v_primary public.service_concepts%rowtype;
  v_driver uuid;
  v_active_driver uuid;
  v_truck integer;
  v_scheduled timestamptz;
  v_status text;
  v_base_id uuid := NULLIF(COALESCE(p_payload->>'billing_base_id', p_payload->>'branch_id'), '')::uuid;
  v_setting public.company_billing_settings%rowtype;
  v_base public.billing_bases%rowtype;
  v_date date;
  v_provider_code text := trim(COALESCE(p_payload->>'service_order_number', ''));
  v_instance_code text;
  v_requires_own boolean;
  v_make_model text;
  v_legacy_category uuid;
BEGIN
  IF v_role NOT IN ('administracion', 'operador') THEN RAISE EXCEPTION 'Sin permiso para crear servicios'; END IF;
  IF v_provider_code = '' THEN RAISE EXCEPTION 'El código de prestadora es obligatorio'; END IF;

  v_scheduled := COALESCE(NULLIF(p_payload->>'scheduled_for', '')::timestamptz, now());
  v_date := (v_scheduled AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

  SELECT sc.* INTO v_primary
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = (p_payload->>'company_id')::uuid AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.concept_id = (p_payload->>'category_id')::uuid
    AND sc.is_active AND sc.billing_family <> 'system' AND sc.service_category IN ('primary', 'mixed');
  IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de Servicio principal inválido o no habilitado'; END IF;

  SELECT c.category_id INTO v_legacy_category
  FROM public.service_categories c
  WHERE c.legacy_primary_concept_id = v_primary.concept_id AND c.is_active
  ORDER BY c.sort_order LIMIT 1;

  v_driver := NULLIF(p_payload->>'assigned_driver_id', '')::uuid;
  v_truck := NULLIF(p_payload->>'assigned_truck_id', '')::integer;

  IF v_truck IS NOT NULL THEN
    SELECT dl.driver_id INTO v_active_driver
    FROM public.daily_logs dl
    WHERE dl.truck_id = v_truck AND dl.log_date = v_date
      AND COALESCE(dl.status, 'open') = 'open' AND dl.hora_fin IS NULL
    ORDER BY dl.hora_inicio DESC, dl.log_id DESC LIMIT 1;
    IF v_active_driver IS NOT NULL THEN v_driver := v_active_driver; END IF;
  END IF;

  IF v_driver IS NOT NULL AND v_truck IS NULL THEN RAISE EXCEPTION 'Para asignar un chofer también debe seleccionarse el móvil'; END IF;
  IF v_driver IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u JOIN public.roles r ON r.role_id = u.role_id
    WHERE u.user_id = v_driver AND COALESCE(u.is_active, true) AND r.name = 'chofer'
  ) THEN RAISE EXCEPTION 'Chofer inválido o inactivo'; END IF;
  IF v_truck IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trucks t WHERE t.truck_id = v_truck AND t.status = 'active') THEN
    RAISE EXCEPTION 'Móvil inválido o inactivo';
  END IF;

  SELECT s.* INTO v_setting
  FROM public.company_billing_settings s
  WHERE s.company_id = (p_payload->>'company_id')::uuid
    AND s.is_active AND s.valid_from <= v_date AND (s.valid_until IS NULL OR s.valid_until >= v_date)
    AND (s.contract_id IS NULL OR s.contract_id = (
      SELECT c.contract_id FROM public.company_contracts c
      WHERE c.company_id = (p_payload->>'company_id')::uuid AND c.status = 'active'
        AND c.valid_from <= v_date AND (c.valid_until IS NULL OR c.valid_until >= v_date)
      ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC LIMIT 1
    ))
  ORDER BY (s.contract_id IS NOT NULL) DESC, s.valid_from DESC, s.created_at DESC
  LIMIT 1;

  IF v_setting.billing_setting_id IS NOT NULL THEN
    IF v_base_id IS NULL THEN RAISE EXCEPTION 'Seleccioná una base operativa'; END IF;
    SELECT b.* INTO v_base FROM public.billing_bases b WHERE b.base_id = v_base_id AND b.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'La base operativa no existe o está inactiva'; END IF;
  ELSIF v_base_id IS NOT NULL THEN
    SELECT b.* INTO v_base FROM public.billing_bases b WHERE b.base_id = v_base_id AND b.is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'La base operativa no existe o está inactiva'; END IF;
  END IF;

  v_quote := app_private.calculate_operator_service_quote_v4_full(
    (p_payload->>'company_id')::uuid,
    v_base_id,
    v_scheduled,
    v_primary.concept_id,
    COALESCE(p_payload->'items', '[]'::jsonb),
    COALESCE(NULLIF(p_payload->>'estimated_asphalt_km', '')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'estimated_gravel_km', '')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'toll_estimate', '')::numeric, 0),
    COALESCE((p_payload->>'is_holiday')::boolean, false)
  );

  v_status := CASE WHEN v_driver IS NOT NULL AND v_truck IS NOT NULL THEN 'assigned' ELSE 'pending' END;
  v_make_model := NULLIF(trim(COALESCE(
    NULLIF(p_payload->>'vehicle_make_model', ''),
    concat_ws(' ', NULLIF(p_payload->>'vehicle_make', ''), NULLIF(p_payload->>'vehicle_model', ''))
  )), '');

  INSERT INTO public.operator_services(
    status, priority, company_id, branch_id, billing_setting_id, billing_base_id, billing_snapshot,
    contract_id, rate_card_id, service_order_number, purchase_order_number, requested_at, scheduled_for,
    estimated_arrival_at, estimated_finish_at, granted_delay_minutes, logistics_type, customer_name,
    customer_phone, customer_email, vehicle_plate, vehicle_make_model, origin, destination, origin_lat,
    origin_lng, destination_lat, destination_lng, origin_place_id, destination_place_id,
    origin_formatted_address, destination_formatted_address, primary_concept_id, category_id,
    assigned_driver_id, assigned_truck_id, assigned_at, assigned_by, estimated_distance_km,
    estimated_asphalt_km, estimated_gravel_km, toll_estimate, is_holiday, currency, base_subtotal,
    surcharge_total, toll_total, copay_total, estimated_total, company_estimated_total, pricing_snapshot,
    route_distance_meters, route_duration_seconds, route_toll_estimate, route_toll_currency,
    route_provider, route_calculated_at, route_legs, operator_notes, driver_instructions, created_by, updated_by
  ) VALUES (
    v_status, COALESCE(NULLIF(p_payload->>'priority', ''), 'normal'), (p_payload->>'company_id')::uuid,
    NULL, v_setting.billing_setting_id, v_base_id,
    CASE WHEN v_base_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'billing_setting_id', v_setting.billing_setting_id,
      'route_mode', v_setting.route_mode,
      'toll_calculation_mode', v_setting.toll_calculation_mode,
      'requires_verified_base', false,
      'route_ready', true,
      'base', jsonb_build_object(
        'base_id', v_base.base_id, 'name', v_base.name, 'address', v_base.address,
        'latitude', v_base.latitude, 'longitude', v_base.longitude,
        'google_place_id', v_base.google_place_id, 'address_verified', v_base.address_verified
      )
    ) END,
    (v_quote->>'contract_id')::uuid, (v_quote->>'rate_card_id')::uuid, v_provider_code,
    NULLIF(p_payload->>'purchase_order_number', ''), now(), v_scheduled,
    NULLIF(p_payload->>'estimated_arrival_at', '')::timestamptz,
    NULLIF(p_payload->>'estimated_finish_at', '')::timestamptz,
    greatest(COALESCE(NULLIF(p_payload->>'granted_delay_minutes', '')::integer, 0), 0),
    COALESCE(NULLIF(p_payload->>'logistics_type', ''), 'own'),
    NULLIF(p_payload->>'customer_name', ''), NULLIF(p_payload->>'customer_phone', ''),
    NULLIF(p_payload->>'customer_email', ''), upper(NULLIF(p_payload->>'vehicle_plate', '')), v_make_model,
    trim(p_payload->>'origin'), trim(p_payload->>'destination'),
    NULLIF(p_payload->>'origin_lat', '')::numeric, NULLIF(p_payload->>'origin_lng', '')::numeric,
    NULLIF(p_payload->>'destination_lat', '')::numeric, NULLIF(p_payload->>'destination_lng', '')::numeric,
    NULLIF(p_payload->>'origin_place_id', ''), NULLIF(p_payload->>'destination_place_id', ''),
    NULLIF(p_payload->>'origin_formatted_address', ''), NULLIF(p_payload->>'destination_formatted_address', ''),
    v_primary.concept_id, v_legacy_category, v_driver, v_truck,
    CASE WHEN v_driver IS NOT NULL AND v_truck IS NOT NULL THEN now() END,
    CASE WHEN v_driver IS NOT NULL AND v_truck IS NOT NULL THEN auth.uid() END,
    COALESCE((v_quote->>'distance_km')::numeric, 0), COALESCE((v_quote->>'asphalt_km')::numeric, 0),
    COALESCE((v_quote->>'gravel_km')::numeric, 0), COALESCE((v_quote->>'toll_input')::numeric, 0),
    COALESCE((v_quote->>'is_holiday')::boolean, false), v_quote->>'currency',
    (v_quote->>'base_subtotal')::numeric, (v_quote->>'surcharge_total')::numeric,
    (v_quote->>'toll_total')::numeric, (v_quote->>'copay_total')::numeric,
    (v_quote->>'estimated_total')::numeric, (v_quote->>'company_estimated_total')::numeric, v_quote,
    NULLIF(p_payload->>'route_distance_meters', '')::integer,
    NULLIF(p_payload->>'route_duration_seconds', '')::integer,
    NULLIF(p_payload->>'route_toll_estimate', '')::numeric,
    NULLIF(p_payload->>'route_toll_currency', ''), NULLIF(p_payload->>'route_provider', ''),
    NULLIF(p_payload->>'route_calculated_at', '')::timestamptz,
    COALESCE(p_payload->'route_legs', '[]'::jsonb), NULLIF(p_payload->>'operator_notes', ''),
    NULLIF(p_payload->>'driver_instructions', ''), auth.uid(), auth.uid()
  ) RETURNING * INTO v_service;

  INSERT INTO public.operator_service_items(
    service_id, concept_id, item_role, service_code, instance_code, service_name, pricing_unit,
    quantity, unit_price, list_unit_price, subtotal, price_source, snapshot, sort_order, category_id
  ) VALUES (
    v_service.service_id, v_primary.concept_id, 'primary', v_primary.code, v_provider_code,
    v_primary.name, 'service', 1, 0, 0, 0, 'general',
    jsonb_build_object('role', 'primary', 'concept_id', v_primary.concept_id, 'service_name', v_primary.name,
      'provider_code', v_provider_code, 'pricing_model', 'rate_card_v4'),
    0, v_legacy_category
  );

  FOR v_component IN SELECT value FROM jsonb_array_elements(v_quote->'components') LOOP
    v_requires_own := COALESCE((v_component->>'requires_own_code')::boolean, false);
    IF v_requires_own THEN
      v_instance_code := NULLIF(trim(COALESCE(p_payload->'item_codes'->>(v_component->>'concept_id'), '')), '');
      IF v_instance_code IS NULL THEN RAISE EXCEPTION 'El servicio % requiere código propio de prestadora', v_component->>'service_name'; END IF;
    ELSE
      v_instance_code := v_provider_code;
    END IF;

    INSERT INTO public.operator_service_items(
      service_id, concept_id, rate_item_id, item_role, service_code, instance_code, service_name,
      pricing_unit, quantity, unit_price, list_unit_price, subtotal, price_source, snapshot,
      sort_order, category_id, matrix_rate_id
    ) VALUES (
      v_service.service_id,
      (v_component->>'concept_id')::uuid,
      NULLIF(v_component->>'rate_item_id', '')::uuid,
      v_component->>'role',
      v_component->>'service_code',
      v_instance_code,
      v_component->>'service_name',
      v_component->>'pricing_unit',
      (v_component->>'quantity')::numeric,
      (v_component->>'unit_price')::numeric,
      (v_component->>'unit_price')::numeric,
      (v_component->>'subtotal')::numeric,
      COALESCE(NULLIF(v_component->>'price_source', ''), 'general'),
      v_component,
      CASE v_component->>'role' WHEN 'movement' THEN 10 WHEN 'distance' THEN 20 ELSE 30 END,
      v_legacy_category,
      NULL
    );
  END LOOP;

  IF v_role = 'administracion' THEN
    RETURN to_jsonb(v_service) || jsonb_build_object('quote', v_quote);
  END IF;

  RETURN jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'assigned_driver_id', v_service.assigned_driver_id,
    'assigned_truck_id', v_service.assigned_truck_id,
    'billing_base_id', v_service.billing_base_id,
    'category_id', v_service.category_id,
    'primary_concept_id', v_service.primary_concept_id
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.get_operator_category_tariff_v3(uuid,uuid,uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_operator_service_quote_v3(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_operator_service_v3(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operator_category_tariff_v3(uuid,uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_operator_service_quote_v3(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_operator_service_v3(jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_operator_category_tariff_v3(uuid,uuid,uuid,date) IS 'Compatibilidad de nombre v3: catálogo operativo y valores resueltos desde Tarifas v4 publicadas.';
COMMENT ON FUNCTION public.calculate_operator_service_quote_v3(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean) IS 'Compatibilidad de nombre v3: cotiza desde company_rate_items y reglas del tarifario publicado.';
