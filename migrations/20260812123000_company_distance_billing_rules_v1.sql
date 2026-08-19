-- AuxiliOS · Reglas de distancia por prestadora v1
-- Tarifas guarda únicamente precios. Radio cubierto y límite de movida pertenecen
-- a la configuración de facturación de la prestadora.

ALTER TABLE public.company_billing_settings
  ADD COLUMN IF NOT EXISTS covered_radius_km numeric,
  ADD COLUMN IF NOT EXISTS movement_charge_until_km numeric;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_billing_settings'::regclass
      AND conname = 'company_billing_settings_covered_radius_km_check'
  ) THEN
    ALTER TABLE public.company_billing_settings
      ADD CONSTRAINT company_billing_settings_covered_radius_km_check
      CHECK (covered_radius_km IS NULL OR covered_radius_km >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_billing_settings'::regclass
      AND conname = 'company_billing_settings_movement_charge_until_km_check'
  ) THEN
    ALTER TABLE public.company_billing_settings
      ADD CONSTRAINT company_billing_settings_movement_charge_until_km_check
      CHECK (movement_charge_until_km IS NULL OR movement_charge_until_km >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_billing_settings'::regclass
      AND conname = 'company_billing_settings_distance_threshold_order_check'
  ) THEN
    ALTER TABLE public.company_billing_settings
      ADD CONSTRAINT company_billing_settings_distance_threshold_order_check
      CHECK (
        covered_radius_km IS NULL
        OR movement_charge_until_km IS NULL
        OR movement_charge_until_km >= covered_radius_km
      );
  END IF;
END
$do$;

COMMENT ON COLUMN public.company_billing_settings.covered_radius_km IS
  'Radio opcional cubierto por la movida. Dentro de este radio no se cobran kilómetros.';
COMMENT ON COLUMN public.company_billing_settings.movement_charge_until_km IS
  'Límite opcional hasta el cual se cobra movida. Superado, se cobran solo kilómetros.';

CREATE OR REPLACE FUNCTION public.save_company_billing_configuration(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_id uuid := nullif(p_payload->>'billing_setting_id','')::uuid;
  v_company uuid := nullif(p_payload->>'company_id','')::uuid;
  v_contract uuid := nullif(p_payload->>'contract_id','')::uuid;
  v_from date := coalesce(nullif(p_payload->>'valid_from','')::date, current_date);
  v_until date := nullif(p_payload->>'valid_until','')::date;
  v_active boolean := coalesce((p_payload->>'is_active')::boolean, true);
  v_radius numeric := nullif(p_payload->>'covered_radius_km','')::numeric;
  v_movement_until numeric := nullif(p_payload->>'movement_charge_until_km','')::numeric;
  v_bases jsonb := coalesce(p_payload->'bases', '[]'::jsonb);
  v_entry jsonb;
  v_saved public.company_billing_settings%rowtype;
BEGIN
  IF v_role <> 'administracion' THEN
    RAISE EXCEPTION 'Solo Administración puede modificar la configuración de facturación';
  END IF;
  IF v_company IS NULL OR NOT EXISTS (SELECT 1 FROM public.companies WHERE company_id = v_company) THEN
    RAISE EXCEPTION 'Seleccioná una empresa válida';
  END IF;
  IF v_contract IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_contracts WHERE contract_id = v_contract AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'El contrato no pertenece a la empresa';
  END IF;
  IF v_until IS NOT NULL AND v_until < v_from THEN
    RAISE EXCEPTION 'La fecha hasta no puede ser anterior a la fecha desde';
  END IF;
  IF v_radius IS NOT NULL AND v_radius < 0 THEN
    RAISE EXCEPTION 'El radio cubierto no puede ser negativo';
  END IF;
  IF v_movement_until IS NOT NULL AND v_movement_until < 0 THEN
    RAISE EXCEPTION 'El límite de movida no puede ser negativo';
  END IF;
  IF v_radius IS NOT NULL AND v_movement_until IS NOT NULL AND v_movement_until < v_radius THEN
    RAISE EXCEPTION 'Cobrar movida hasta debe ser igual o mayor que el radio cubierto';
  END IF;
  IF v_active AND jsonb_array_length(v_bases) = 0 THEN
    RAISE EXCEPTION 'Una configuración activa debe tener al menos una base aplicable';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.company_billing_settings(
      company_id, contract_id, route_mode, toll_calculation_mode,
      covered_radius_km, movement_charge_until_km,
      valid_from, valid_until, requires_verified_base, is_active, notes, created_by, updated_by
    ) VALUES (
      v_company, v_contract,
      coalesce(nullif(p_payload->>'route_mode',''), 'base_origin_destination_base'),
      coalesce(nullif(p_payload->>'toll_calculation_mode',''), 'route_estimate'),
      v_radius, v_movement_until,
      v_from, v_until,
      coalesce((p_payload->>'requires_verified_base')::boolean, true),
      v_active, nullif(btrim(p_payload->>'notes'), ''), auth.uid(), auth.uid()
    ) RETURNING * INTO v_saved;
  ELSE
    SELECT * INTO v_saved
    FROM public.company_billing_settings
    WHERE billing_setting_id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Configuración inexistente'; END IF;
    IF v_saved.company_id <> v_company THEN
      RAISE EXCEPTION 'No se puede cambiar la empresa de la configuración';
    END IF;

    UPDATE public.company_billing_settings
    SET contract_id = v_contract,
        route_mode = coalesce(nullif(p_payload->>'route_mode',''), 'base_origin_destination_base'),
        toll_calculation_mode = coalesce(nullif(p_payload->>'toll_calculation_mode',''), 'route_estimate'),
        covered_radius_km = v_radius,
        movement_charge_until_km = v_movement_until,
        valid_from = v_from,
        valid_until = v_until,
        requires_verified_base = coalesce((p_payload->>'requires_verified_base')::boolean, true),
        is_active = v_active,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        updated_by = auth.uid()
    WHERE billing_setting_id = v_id
    RETURNING * INTO v_saved;
  END IF;

  DELETE FROM public.company_billing_base_links
  WHERE billing_setting_id = v_saved.billing_setting_id;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_bases)
  LOOP
    IF nullif(v_entry->>'base_id','') IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.billing_bases b
         WHERE b.base_id = (v_entry->>'base_id')::uuid
       ) THEN
      RAISE EXCEPTION 'Una de las bases seleccionadas no existe';
    END IF;

    INSERT INTO public.company_billing_base_links(
      billing_setting_id, base_id, is_primary, priority, is_active, notes, created_by, updated_by
    ) VALUES (
      v_saved.billing_setting_id,
      (v_entry->>'base_id')::uuid,
      false,
      100,
      coalesce((v_entry->>'is_active')::boolean, true),
      nullif(btrim(v_entry->>'notes'), ''),
      auth.uid(), auth.uid()
    );
  END LOOP;

  RETURN public.get_company_billing_configuration(v_company, now());
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
  SELECT ct.company_id, rc.status INTO v_company_id, v_card_status
  FROM public.company_rate_cards rc
  JOIN public.company_contracts ct ON ct.contract_id = rc.contract_id
  WHERE rc.rate_card_id = CASE WHEN tg_op='DELETE' THEN old.rate_card_id ELSE new.rate_card_id END;

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
    SELECT 1 FROM public.billing_bases b WHERE b.base_id = new.billing_base_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La base operativa global no existe o está inactiva.';
  END IF;

  SELECT sc.* INTO v_concept FROM public.service_concepts sc WHERE sc.concept_id = new.concept_id;
  IF v_concept.concept_id IS NULL THEN RAISE EXCEPTION 'Tipo de Servicio inexistente.'; END IF;
  IF v_concept.billing_family = 'system' THEN RAISE EXCEPTION 'Este componente técnico no se configura como tarifa de servicio.'; END IF;
  IF NOT v_concept.is_active THEN RAISE EXCEPTION 'Tipo de Servicio inactivo.'; END IF;

  new.can_be_primary := v_concept.service_category IN ('primary','mixed');
  new.can_be_secondary := v_concept.service_category IN ('secondary','mixed');
  new.service_code := v_concept.code;
  new.service_name := v_concept.name;
  new.included_km := 0; -- compatibilidad histórica: ya no participa del cálculo v4.

  IF v_concept.distance_chargeable THEN
    new.pricing_unit := 'service';
    new.base_price := new.primary_price;
    new.extra_km_price := greatest(coalesce(new.extra_km_price, 0), 0);
    IF v_concept.service_category = 'primary' THEN new.secondary_price := 0; END IF;
  ELSE
    new.extra_km_price := 0;
    new.km_calculation_method := 'one_way';
    new.pricing_unit := coalesce(nullif(new.pricing_unit,''), v_concept.default_pricing_unit, 'service');
    IF new.can_be_primary AND NOT new.can_be_secondary THEN
      new.base_price := new.primary_price;
      new.secondary_price := 0;
    ELSIF new.can_be_secondary AND NOT new.can_be_primary THEN
      new.base_price := new.secondary_price;
      new.primary_price := 0;
    ELSE
      new.base_price := greatest(new.primary_price, new.secondary_price);
    END IF;
  END IF;

  new.tolls_mode := 'not_applicable';
  new.tolls_fixed_amount := 0;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.save_company_tariff_item_v4(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_card uuid := nullif(p_payload->>'rate_card_id','')::uuid;
  v_company uuid := nullif(p_payload->>'company_id','')::uuid;
  v_concept uuid := nullif(p_payload->>'concept_id','')::uuid;
  v_base uuid := nullif(p_payload->>'billing_base_id','')::uuid;
  v_price numeric := nullif(p_payload->>'unit_price','')::numeric;
  v_base_price numeric := nullif(p_payload->>'base_price','')::numeric;
  v_km_price numeric := nullif(p_payload->>'km_price','')::numeric;
  v_concept_row public.service_concepts%rowtype;
  v_item public.company_rate_items%rowtype;
  v_code_mode text := 'fixed';
  v_can_primary boolean;
  v_can_secondary boolean;
BEGIN
  IF v_role <> 'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar tarifas'; END IF;
  IF v_card IS NULL OR v_company IS NULL OR v_concept IS NULL THEN RAISE EXCEPTION 'Datos de tarifa incompletos'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.company_rate_cards rc
    JOIN public.company_contracts cc ON cc.contract_id = rc.contract_id
    WHERE rc.rate_card_id = v_card AND rc.status = 'draft' AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'El tarifario no está en borrador o no pertenece a la prestadora';
  END IF;

  SELECT sc.* INTO v_concept_row
  FROM public.service_concepts sc
  JOIN public.company_service_settings css
    ON css.company_id = v_company AND css.concept_id = sc.concept_id AND css.is_enabled
  WHERE sc.concept_id = v_concept AND sc.is_active AND sc.billing_family <> 'system';
  IF v_concept_row.concept_id IS NULL THEN RAISE EXCEPTION 'El Tipo de Servicio no está habilitado para la prestadora'; END IF;

  IF v_base IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.billing_bases b WHERE b.base_id = v_base AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La base operativa global no existe o está inactiva';
  END IF;

  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode
  FROM public.company_service_settings css
  WHERE css.company_id = v_company AND css.concept_id = v_concept;

  v_can_primary := v_concept_row.service_category IN ('primary','mixed');
  v_can_secondary := v_concept_row.service_category IN ('secondary','mixed');

  IF v_concept_row.distance_chargeable THEN
    IF v_base_price IS NULL OR v_base_price < 0 OR v_km_price IS NULL OR v_km_price < 0 THEN
      RAISE EXCEPTION 'Completá valores válidos para movida y kilómetro';
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
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id, branch_id, billing_base_id, concept_id, service_code, service_name,
      base_price, primary_price, secondary_price, included_km, extra_km_price,
      pricing_unit, can_be_primary, can_be_secondary, code_mode, is_active
    ) VALUES (
      v_card, NULL, v_base, v_concept, v_concept_row.code, v_concept_row.name,
      CASE WHEN v_concept_row.distance_chargeable THEN v_base_price ELSE v_price END,
      CASE WHEN v_can_primary THEN coalesce(v_base_price, v_price, 0) ELSE 0 END,
      CASE WHEN v_can_secondary THEN coalesce(v_base_price, v_price, 0) ELSE 0 END,
      0,
      CASE WHEN v_concept_row.distance_chargeable THEN v_km_price ELSE 0 END,
      CASE WHEN v_concept_row.distance_chargeable THEN 'service' ELSE coalesce(v_concept_row.default_pricing_unit,'service') END,
      v_can_primary, v_can_secondary, coalesce(v_code_mode,'fixed'), true
    ) RETURNING * INTO v_item;
  ELSE
    UPDATE public.company_rate_items
    SET billing_base_id = v_base,
        base_price = CASE WHEN v_concept_row.distance_chargeable THEN v_base_price ELSE v_price END,
        primary_price = CASE WHEN v_can_primary THEN coalesce(v_base_price, v_price, 0) ELSE 0 END,
        secondary_price = CASE WHEN v_can_secondary THEN coalesce(v_base_price, v_price, 0) ELSE 0 END,
        included_km = 0,
        extra_km_price = CASE WHEN v_concept_row.distance_chargeable THEN v_km_price ELSE 0 END,
        pricing_unit = CASE WHEN v_concept_row.distance_chargeable THEN 'service' ELSE coalesce(v_concept_row.default_pricing_unit,'service') END,
        can_be_primary = v_can_primary,
        can_be_secondary = v_can_secondary,
        code_mode = coalesce(v_code_mode,'fixed')
    WHERE rate_item_id = v_item.rate_item_id
    RETURNING * INTO v_item;
  END IF;

  RETURN to_jsonb(v_item) - 'included_km' - 'extra_km_price' || jsonb_build_object('km_price', v_item.extra_km_price);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_tariffs_v4(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
  IF v_role NOT IN ('administracion','facturacion','supervision') THEN RAISE EXCEPTION 'Sin permiso para consultar tarifas'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.company_id = p_company_id) THEN RAISE EXCEPTION 'Prestadora inexistente'; END IF;

  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id = p_company_id AND c.status = 'active'
  ORDER BY c.is_primary DESC, c.valid_from DESC, c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NOT NULL THEN
    SELECT r.* INTO v_active
    FROM public.company_rate_cards r
    WHERE r.contract_id = v_contract.contract_id AND r.status = 'active'
    ORDER BY r.version DESC LIMIT 1;

    SELECT r.* INTO v_draft
    FROM public.company_rate_cards r
    WHERE r.contract_id = v_contract.contract_id
      AND r.status = 'draft'
      AND (v_active.rate_card_id IS NULL OR r.version > v_active.version)
    ORDER BY r.version DESC, r.created_at DESC LIMIT 1;
  END IF;

  v_working := coalesce(v_draft.rate_card_id, v_active.rate_card_id);

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
          AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
      );
  END IF;

  RETURN jsonb_build_object(
    'company', (
      SELECT jsonb_build_object('company_id',c.company_id,'name',coalesce(c.trade_name,c.legal_name))
      FROM public.companies c WHERE c.company_id = p_company_id
    ),
    'contract', CASE WHEN v_contract.contract_id IS NULL THEN NULL ELSE to_jsonb(v_contract) END,
    'active_card', CASE WHEN v_active.rate_card_id IS NULL THEN NULL ELSE to_jsonb(v_active) END,
    'draft_card', CASE WHEN v_draft.rate_card_id IS NULL THEN NULL ELSE to_jsonb(v_draft) END,
    'working_card_id', v_working,
    'enabled_count', v_enabled,
    'tariffed_count', v_tariffed,
    'pending_count', greatest(v_enabled-v_tariffed,0),
    'bases', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'base_id',b.base_id,'base_code',b.base_code,'name',b.name,
        'address',b.address,'city',b.city,'province',b.province
      ) ORDER BY b.name,b.base_code)
      FROM public.billing_bases b WHERE b.is_active
    ), '[]'::jsonb),
    'services', coalesce((
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
            'rate_item_id',i.rate_item_id,
            'base_price',i.base_price,
            'primary_price',i.primary_price,
            'secondary_price',i.secondary_price,
            'km_price',i.extra_km_price,
            'pricing_unit',i.pricing_unit
          )
          FROM public.company_rate_items i
          WHERE i.rate_card_id = v_working AND i.concept_id = sc.concept_id
            AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
          LIMIT 1
        ),
        'base_exceptions', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'rate_item_id',i.rate_item_id,
            'base_id',b.base_id,
            'base_code',b.base_code,
            'base_name',b.name,
            'base_price',i.base_price,
            'primary_price',i.primary_price,
            'secondary_price',i.secondary_price,
            'km_price',i.extra_km_price,
            'pricing_unit',i.pricing_unit
          ) ORDER BY b.name,b.base_code)
          FROM public.company_rate_items i
          JOIN public.billing_bases b ON b.base_id = i.billing_base_id
          WHERE i.rate_card_id = v_working AND i.concept_id = sc.concept_id
            AND i.is_active AND i.billing_base_id IS NOT NULL
        ), '[]'::jsonb)
      ) ORDER BY sc.sort_order,sc.name)
      FROM public.service_concepts sc
      JOIN public.company_service_settings css
        ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
      WHERE sc.is_active AND sc.billing_family <> 'system'
    ), '[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_tariff_history_v4(p_company_id uuid, p_concept_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() NOT IN ('administracion','facturacion','supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar historial';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'rate_card_id',rc.rate_card_id,
      'version',rc.version,
      'status',rc.status,
      'valid_from',rc.valid_from,
      'valid_until',rc.valid_until,
      'currency',rc.currency,
      'rate_item_id',i.rate_item_id,
      'billing_base_id',i.billing_base_id,
      'base_name',b.name,
      'base_price',i.base_price,
      'primary_price',i.primary_price,
      'secondary_price',i.secondary_price,
      'km_price',i.extra_km_price,
      'pricing_unit',i.pricing_unit
    ) ORDER BY rc.version DESC,b.name NULLS FIRST)
    FROM public.company_contracts cc
    JOIN public.company_rate_cards rc ON rc.contract_id = cc.contract_id
    JOIN public.company_rate_items i ON i.rate_card_id = rc.rate_card_id AND i.concept_id = p_concept_id
    LEFT JOIN public.billing_bases b ON b.base_id = i.billing_base_id
    WHERE cc.company_id = p_company_id
  ), '[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.ensure_company_tariff_draft_v4(p_company_id uuid, p_valid_from date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
  ORDER BY c.is_primary DESC,c.valid_from DESC,c.created_at DESC LIMIT 1;

  IF v_contract.contract_id IS NULL THEN
    INSERT INTO public.company_contracts(company_id,name,status,valid_from,currency,is_primary,notes)
    VALUES(p_company_id,'Acuerdo comercial','active',p_valid_from,'ARS',true,'Creado automáticamente desde Tarifas')
    RETURNING * INTO v_contract;
  END IF;

  SELECT r.* INTO v_active
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract.contract_id AND r.status = 'active'
  ORDER BY r.version DESC LIMIT 1;

  SELECT r.* INTO v_draft
  FROM public.company_rate_cards r
  WHERE r.contract_id = v_contract.contract_id AND r.status = 'draft'
    AND (v_active.rate_card_id IS NULL OR r.version > v_active.version)
  ORDER BY r.version DESC,r.created_at DESC LIMIT 1;

  IF v_draft.rate_card_id IS NOT NULL THEN
    IF v_draft.valid_from IS DISTINCT FROM p_valid_from THEN
      UPDATE public.company_rate_cards SET valid_from = p_valid_from
      WHERE rate_card_id = v_draft.rate_card_id RETURNING * INTO v_draft;
    END IF;
    RETURN to_jsonb(v_draft);
  END IF;

  INSERT INTO public.company_rate_cards(contract_id,name,status,valid_from,valid_until,currency,notes)
  VALUES(
    v_contract.contract_id,
    coalesce(v_active.name,'Tarifario general'),
    'draft',p_valid_from,NULL,coalesce(v_active.currency,v_contract.currency,'ARS'),
    CASE WHEN v_active.rate_card_id IS NULL THEN 'Nueva configuración tarifaria'
         ELSE 'Nueva vigencia basada en versión '||v_active.version::text END
  ) RETURNING * INTO v_draft;

  IF v_active.rate_card_id IS NOT NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id,branch_id,service_code,service_name,base_price,included_km,extra_km_price,
      km_calculation_method,included_wait_minutes,wait_price_per_hour,tolls_mode,tolls_fixed_amount,
      extraction_fee,cancellation_fee,second_unit_fee,minimum_charge,night_surcharge_pct,
      weekend_surcharge_pct,holiday_surcharge_pct,is_active,notes,concept_id,can_be_primary,
      can_be_secondary,pricing_unit,primary_price,secondary_price,code_mode,code_prefix,billing_base_id
    )
    SELECT
      v_draft.rate_card_id,NULL,i.service_code,i.service_name,i.base_price,0,i.extra_km_price,
      i.km_calculation_method,i.included_wait_minutes,i.wait_price_per_hour,i.tolls_mode,i.tolls_fixed_amount,
      i.extraction_fee,i.cancellation_fee,i.second_unit_fee,i.minimum_charge,i.night_surcharge_pct,
      i.weekend_surcharge_pct,i.holiday_surcharge_pct,i.is_active,i.notes,i.concept_id,i.can_be_primary,
      i.can_be_secondary,i.pricing_unit,i.primary_price,i.secondary_price,i.code_mode,i.code_prefix,i.billing_base_id
    FROM public.company_rate_items i
    JOIN public.service_concepts sc ON sc.concept_id = i.concept_id
    WHERE i.rate_card_id = v_active.rate_card_id AND i.is_active
      AND sc.is_active AND sc.billing_family <> 'system';

    DELETE FROM public.company_rate_rule_exceptions WHERE rate_card_id = v_draft.rate_card_id;
    DELETE FROM public.company_rate_rules WHERE rate_card_id = v_draft.rate_card_id;

    INSERT INTO public.company_rate_rules(
      rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,
      saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end,distance_threshold_km,notes
    )
    SELECT v_draft.rate_card_id,r.rule_type,r.enabled,r.calculation_mode,r.amount,r.start_time,r.end_time,
           r.saturday_start,r.saturday_end,r.sunday_holiday_start,r.sunday_holiday_end,r.distance_threshold_km,r.notes
    FROM public.company_rate_rules r WHERE r.rate_card_id = v_active.rate_card_id;

    INSERT INTO public.company_rate_rule_exceptions(rate_card_id,rule_id,concept_id)
    SELECT v_draft.rate_card_id,newr.rule_id,e.concept_id
    FROM public.company_rate_rule_exceptions e
    JOIN public.company_rate_rules oldr ON oldr.rule_id = e.rule_id
    JOIN public.company_rate_rules newr
      ON newr.rate_card_id = v_draft.rate_card_id AND newr.rule_type = oldr.rule_type
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
    INSERT INTO public.company_rate_codes(rate_card_id,code_key,enabled)
    SELECT v_draft.rate_card_id,c.code_key,c.enabled
    FROM public.company_rate_codes c WHERE c.rate_card_id = v_active.rate_card_id;

    INSERT INTO public.company_rate_service_links(
      rate_card_id,primary_concept_id,secondary_concept_id,price_override,is_enabled,notes
    )
    SELECT v_draft.rate_card_id,l.primary_concept_id,l.secondary_concept_id,l.price_override,l.is_enabled,l.notes
    FROM public.company_rate_service_links l
    WHERE l.rate_card_id = v_active.rate_card_id
      AND EXISTS(SELECT 1 FROM public.service_concepts p WHERE p.concept_id=l.primary_concept_id AND p.is_active)
      AND EXISTS(SELECT 1 FROM public.service_concepts s WHERE s.concept_id=l.secondary_concept_id AND s.is_active);
  END IF;

  RETURN to_jsonb(v_draft);
END
$function$;

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
  v_local timestamp := coalesce(p_scheduled_for, now()) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_date date := v_local::date;
  v_time time := v_local::time;
  v_dow integer := extract(dow FROM v_local)::integer;
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
  v_distance numeric := coalesce(p_asphalt_km, 0) + coalesce(p_gravel_km, 0);
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
  v_radius numeric;
  v_movement_until numeric;
  v_movement_applies boolean := true;
  v_distance_applies boolean := false;
BEGIN
  IF coalesce(p_asphalt_km, 0) < 0 OR coalesce(p_gravel_km, 0) < 0 OR coalesce(p_toll_amount, 0) < 0 THEN
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

  SELECT s.* INTO v_setting
  FROM public.company_billing_settings s
  WHERE s.company_id = p_company_id
    AND s.is_active
    AND s.valid_from <= v_date
    AND (s.valid_until IS NULL OR s.valid_until >= v_date)
    AND (s.contract_id IS NULL OR s.contract_id = v_contract.contract_id)
  ORDER BY (s.contract_id = v_contract.contract_id) DESC NULLS LAST, s.valid_from DESC, s.created_at DESC
  LIMIT 1;

  v_radius := v_setting.covered_radius_km;
  v_movement_until := v_setting.movement_charge_until_km;

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

  IF v_primary.distance_chargeable THEN
    v_movement_applies := v_movement_until IS NULL OR v_distance <= v_movement_until;
    v_distance_applies := v_distance > 0 AND (v_radius IS NULL OR v_distance > v_radius);
  ELSE
    v_movement_applies := true;
    v_distance_applies := false;
  END IF;

  IF v_movement_applies THEN
    v_subtotal := coalesce(v_rate.primary_price, v_rate.base_price, 0);
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
      'unit_price', coalesce(v_rate.primary_price, v_rate.base_price, 0),
      'subtotal', v_subtotal,
      'requires_own_code', false,
      'price_source', CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END IF;

  IF v_primary.distance_chargeable AND v_distance_applies THEN
    v_subtotal := round(v_distance * coalesce(v_rate.extra_km_price, 0), 2);
    v_base := v_base + v_subtotal;
    v_components := v_components || jsonb_build_array(jsonb_build_object(
      'role', 'distance',
      'component_type', 'distance',
      'concept_id', v_primary.concept_id,
      'rate_item_id', v_rate.rate_item_id,
      'service_code', v_primary.code,
      'service_name', v_primary.name || ' · KM',
      'pricing_unit', 'km',
      'quantity', v_distance,
      'unit_price', coalesce(v_rate.extra_km_price, 0),
      'subtotal', v_subtotal,
      'requires_own_code', false,
      'price_source', CASE WHEN v_rate.billing_base_id IS NULL THEN 'general' ELSE 'billing_base' END
    ));
  END IF;

  FOR v_manual IN SELECT value FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    BEGIN
      IF nullif(v_manual->>'concept_id', '') IS NULL THEN RAISE EXCEPTION 'Concepto inválido'; END IF;
      IF (v_manual->>'concept_id')::uuid = ANY(v_seen) THEN RAISE EXCEPTION 'El mismo concepto no puede agregarse dos veces'; END IF;
      v_seen := array_append(v_seen, (v_manual->>'concept_id')::uuid);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Concepto inválido';
    END;

    SELECT sc.concept_id, sc.code, sc.name, sc.default_pricing_unit, coalesce(css.code_mode, 'fixed') code_mode
      INTO v_concept
    FROM public.service_concepts sc
    JOIN public.company_service_settings css
      ON css.company_id = p_company_id AND css.concept_id = sc.concept_id AND css.is_enabled
    WHERE sc.concept_id = (v_manual->>'concept_id')::uuid
      AND sc.is_active
      AND sc.billing_family <> 'system'
      AND sc.service_category IN ('secondary', 'mixed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Un servicio adicional no está habilitado para la prestadora'; END IF;

    v_qty := coalesce(nullif(v_manual->>'quantity', '')::numeric, 1);
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

    v_subtotal := round(v_qty * coalesce(v_rate.secondary_price, v_rate.base_price, 0), 2);
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
      'unit_price', coalesce(v_rate.secondary_price, v_rate.base_price, 0),
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
      v_applies := v_distance >= coalesce(v_rule.distance_threshold_km, 0)
        AND coalesce(v_rule.distance_threshold_km, 0) > 0;
    END IF;

    IF v_applies THEN
      SELECT coalesce(sum((x.value->>'subtotal')::numeric), 0) INTO v_eligible
      FROM jsonb_array_elements(v_components) x(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.company_rate_rule_exceptions e
        WHERE e.rule_id = v_rule.rule_id AND e.concept_id = (x.value->>'concept_id')::uuid
      );

      v_charge := CASE
        WHEN v_eligible <= 0 THEN 0
        WHEN v_rule.calculation_mode = 'fixed' THEN v_rule.amount
        ELSE round(v_eligible * v_rule.amount / 100, 2)
      END;

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
      ELSE 0
    END;
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
    'asphalt_km', coalesce(p_asphalt_km, 0),
    'gravel_km', coalesce(p_gravel_km, 0),
    'distance_km', v_distance,
    'covered_radius_km', v_radius,
    'movement_charge_until_km', v_movement_until,
    'movement_applied', v_movement_applies,
    'distance_applied', v_distance_applies,
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
