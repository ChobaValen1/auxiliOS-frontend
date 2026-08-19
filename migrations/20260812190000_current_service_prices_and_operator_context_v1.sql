-- AuxiliOS · Precios actuales por prestadora + contexto operativo v1
-- Modelo de negocio:
--   * Tarifas = precio actual del servicio para una prestadora.
--   * No hay borrador/publicación/vigencias visibles en el flujo nuevo.
--   * Excepción opcional por billing_base_id.
--   * El historial se obtiene de audit_events (company_rate_items ya está auditada).
--   * Sucursal/company_branches no participa de estas APIs nuevas.
--
-- company_rate_cards permanece temporalmente como contenedor técnico porque el
-- frontend productivo comparte esta base. Las APIs nuevas no exponen ese concepto.

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
  SELECT ct.company_id, rc.status
    INTO v_company_id, v_card_status
  FROM public.company_rate_cards rc
  JOIN public.company_contracts ct ON ct.contract_id = rc.contract_id
  WHERE rc.rate_card_id = CASE WHEN tg_op='DELETE' THEN old.rate_card_id ELSE new.rate_card_id END;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Contenedor de precios inexistente.'; END IF;
  -- Compatibilidad: producción todavía edita borradores; el modelo nuevo edita
  -- directamente el contenedor activo. Estados históricos siguen siendo inmutables.
  IF v_card_status NOT IN ('draft','active') THEN
    RAISE EXCEPTION 'Los precios históricos no se pueden modificar.';
  END IF;
  IF tg_op='DELETE' THEN RETURN old; END IF;

  -- branch_id es legado. Las APIs canónicas nuevas siempre lo guardan NULL.
  IF new.branch_id IS NOT NULL AND new.billing_base_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede configurar una sucursal y una base al mismo tiempo.';
  END IF;
  IF new.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_branches b
    WHERE b.branch_id=new.branch_id AND b.company_id=v_company_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La sucursal heredada no pertenece a la empresa o está inactiva.';
  END IF;
  IF new.billing_base_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.billing_bases b
    WHERE b.base_id=new.billing_base_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'La base no existe o está inactiva.';
  END IF;

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

CREATE OR REPLACE FUNCTION app_private.current_price_card_for_company(p_company_id uuid, p_create boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contract public.company_contracts%rowtype;
  v_card public.company_rate_cards%rowtype;
  v_version integer;
BEGIN
  SELECT c.* INTO v_contract
  FROM public.company_contracts c
  WHERE c.company_id=p_company_id AND c.status='active'
  ORDER BY c.is_primary DESC,c.created_at DESC
  LIMIT 1;

  IF v_contract.contract_id IS NULL AND p_create THEN
    INSERT INTO public.company_contracts(company_id,name,status,valid_from,currency,is_primary,notes)
    VALUES(p_company_id,'Acuerdo comercial','active',current_date,'ARS',true,'Contenedor técnico de precios actuales')
    RETURNING * INTO v_contract;
  END IF;
  IF v_contract.contract_id IS NULL THEN RETURN NULL; END IF;

  SELECT r.* INTO v_card
  FROM public.company_rate_cards r
  WHERE r.contract_id=v_contract.contract_id AND r.status='active'
  ORDER BY r.version DESC,r.updated_at DESC
  LIMIT 1;

  IF v_card.rate_card_id IS NULL AND p_create THEN
    -- Si quedó un borrador del flujo anterior y no existe un activo, se reutiliza.
    SELECT r.* INTO v_card
    FROM public.company_rate_cards r
    WHERE r.contract_id=v_contract.contract_id AND r.status='draft'
    ORDER BY r.version DESC,r.updated_at DESC
    LIMIT 1;

    IF v_card.rate_card_id IS NOT NULL THEN
      UPDATE public.company_rate_cards
      SET status='active',valid_until=NULL,updated_by=auth.uid()
      WHERE rate_card_id=v_card.rate_card_id
      RETURNING * INTO v_card;
    ELSE
      SELECT coalesce(max(r.version),0)+1 INTO v_version
      FROM public.company_rate_cards r
      WHERE r.contract_id=v_contract.contract_id;
      INSERT INTO public.company_rate_cards(contract_id,name,version,status,valid_from,valid_until,currency,notes)
      VALUES(v_contract.contract_id,'Precios actuales',v_version,'active',current_date,NULL,coalesce(v_contract.currency,'ARS'),'Contenedor técnico; no representa un tarifario versionado')
      RETURNING * INTO v_card;
    END IF;
  END IF;

  RETURN v_card.rate_card_id;
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
  IF v_role NOT IN ('administracion','facturacion','supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar precios';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.company_id=p_company_id) THEN
    RAISE EXCEPTION 'Prestadora inexistente';
  END IF;

  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NOT NULL THEN
    SELECT r.currency INTO v_currency FROM public.company_rate_cards r WHERE r.rate_card_id=v_card;
  END IF;

  SELECT s.billing_setting_id INTO v_setting
  FROM public.company_billing_settings s
  WHERE s.company_id=p_company_id AND s.is_active
  ORDER BY s.valid_from DESC,s.updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'company',(SELECT jsonb_build_object('company_id',c.company_id,'name',coalesce(c.trade_name,c.legal_name)) FROM public.companies c WHERE c.company_id=p_company_id),
    'currency',coalesce(v_currency,'ARS'),
    'enabled_count',(SELECT count(*) FROM public.company_service_settings css JOIN public.service_concepts sc ON sc.concept_id=css.concept_id WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'),
    'priced_count',(SELECT count(*) FROM public.company_service_settings css JOIN public.service_concepts sc ON sc.concept_id=css.concept_id WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system' AND v_card IS NOT NULL AND EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL)),
    'bases',coalesce((
      SELECT jsonb_agg(jsonb_build_object('base_id',b.base_id,'base_code',b.base_code,'name',b.name,'address',b.address) ORDER BY b.name)
      FROM public.company_billing_base_links l
      JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active
      WHERE l.billing_setting_id=v_setting AND l.is_active
    ),'[]'::jsonb),
    'services',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_id',sc.concept_id,
        'name',sc.name,
        'category',sc.service_category,
        'pricing_unit',sc.default_pricing_unit,
        'distance_chargeable',sc.distance_chargeable,
        'sort_order',sc.sort_order,
        'general_price',CASE WHEN v_card IS NULL THEN NULL ELSE (
          SELECT jsonb_build_object(
            'rate_item_id',i.rate_item_id,
            'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
            'km_price',CASE WHEN sc.distance_chargeable THEN i.extra_km_price ELSE NULL END,
            'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
            'pricing_unit',i.pricing_unit
          )
          FROM public.company_rate_items i
          WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
          LIMIT 1
        ) END,
        'base_exceptions',CASE WHEN v_card IS NULL THEN '[]'::jsonb ELSE coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'rate_item_id',i.rate_item_id,
            'base_id',b.base_id,
            'base_name',b.name,
            'movement_price',CASE WHEN sc.distance_chargeable THEN i.primary_price ELSE NULL END,
            'km_price',CASE WHEN sc.distance_chargeable THEN i.extra_km_price ELSE NULL END,
            'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN i.secondary_price ELSE i.primary_price END END,
            'pricing_unit',i.pricing_unit
          ) ORDER BY b.name)
          FROM public.company_rate_items i
          JOIN public.billing_bases b ON b.base_id=i.billing_base_id
          JOIN public.company_billing_base_links l ON l.base_id=b.base_id AND l.billing_setting_id=v_setting AND l.is_active
          WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NOT NULL
        ),'[]'::jsonb) END
      ) ORDER BY sc.sort_order,sc.name)
      FROM public.company_service_settings css
      JOIN public.service_concepts sc ON sc.concept_id=css.concept_id
      WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'
    ),'[]'::jsonb)
  );
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
  v_code_mode text:='fixed';
  v_can_primary boolean;
  v_can_secondary boolean;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN
    RAISE EXCEPTION 'Solo Administración puede editar precios';
  END IF;
  IF v_company IS NULL OR v_concept IS NULL THEN RAISE EXCEPTION 'Datos de precio incompletos'; END IF;

  SELECT sc.* INTO v_sc
  FROM public.service_concepts sc
  JOIN public.company_service_settings css ON css.company_id=v_company AND css.concept_id=sc.concept_id AND css.is_enabled
  WHERE sc.concept_id=v_concept AND sc.is_active AND sc.billing_family<>'system';
  IF v_sc.concept_id IS NULL THEN RAISE EXCEPTION 'El servicio no está habilitado para la prestadora'; END IF;

  IF v_base IS NOT NULL AND NOT EXISTS(
    SELECT 1
    FROM public.company_billing_settings s
    JOIN public.company_billing_base_links l ON l.billing_setting_id=s.billing_setting_id AND l.is_active
    JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active
    WHERE s.company_id=v_company AND s.is_active AND b.base_id=v_base
  ) THEN
    RAISE EXCEPTION 'La base no está habilitada para esta prestadora';
  END IF;

  IF v_sc.distance_chargeable THEN
    IF v_movement IS NULL OR v_movement<0 OR v_km IS NULL OR v_km<0 THEN
      RAISE EXCEPTION 'Completá valores válidos para movida y kilómetro';
    END IF;
  ELSE
    IF v_unit IS NULL OR v_unit<0 THEN RAISE EXCEPTION 'Ingresá un valor válido'; END IF;
  END IF;

  v_card:=app_private.current_price_card_for_company(v_company,true);
  IF v_card IS NULL THEN RAISE EXCEPTION 'No se pudo preparar el almacenamiento de precios'; END IF;

  SELECT coalesce(css.code_mode,'fixed') INTO v_code_mode
  FROM public.company_service_settings css
  WHERE css.company_id=v_company AND css.concept_id=v_concept;
  v_can_primary:=v_sc.service_category IN ('primary','mixed');
  v_can_secondary:=v_sc.service_category IN ('secondary','mixed');

  SELECT i.* INTO v_item
  FROM public.company_rate_items i
  WHERE i.rate_card_id=v_card AND i.concept_id=v_concept AND i.is_active AND i.branch_id IS NULL
    AND coalesce(i.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_item.rate_item_id IS NULL THEN
    INSERT INTO public.company_rate_items(
      rate_card_id,branch_id,billing_base_id,concept_id,service_code,service_name,
      base_price,primary_price,secondary_price,included_km,extra_km_price,pricing_unit,
      can_be_primary,can_be_secondary,code_mode,is_active,notes
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
    UPDATE public.company_rate_items
    SET billing_base_id=v_base,
        base_price=CASE WHEN v_sc.distance_chargeable THEN v_movement ELSE v_unit END,
        primary_price=CASE WHEN v_can_primary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
        secondary_price=CASE WHEN v_can_secondary THEN coalesce(v_movement,v_unit,0) ELSE 0 END,
        included_km=0,
        extra_km_price=CASE WHEN v_sc.distance_chargeable THEN v_km ELSE 0 END,
        pricing_unit=CASE WHEN v_sc.distance_chargeable THEN 'service' ELSE coalesce(v_sc.default_pricing_unit,'service') END,
        can_be_primary=v_can_primary,
        can_be_secondary=v_can_secondary,
        code_mode=coalesce(v_code_mode,'fixed'),
        notes=NULL,
        updated_by=auth.uid()
    WHERE rate_item_id=v_item.rate_item_id
    RETURNING * INTO v_item;
  END IF;

  RETURN to_jsonb(v_item);
END
$function$;

CREATE OR REPLACE FUNCTION public.delete_company_service_price_exception_v1(p_company_id uuid,p_concept_id uuid,p_base_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_card uuid;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar precios'; END IF;
  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NULL THEN RETURN true; END IF;
  DELETE FROM public.company_rate_items
  WHERE rate_card_id=v_card AND concept_id=p_concept_id AND billing_base_id=p_base_id AND branch_id IS NULL;
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_service_price_history_v1(p_company_id uuid,p_concept_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF app_private.current_auxilios_role() NOT IN ('administracion','facturacion','supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar historial de precios';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'event_id',ae.event_id,
      'occurred_at',ae.occurred_at,
      'operation',ae.operation,
      'actor_id',ae.actor_id,
      'actor_name',coalesce(u.full_name,'Usuario'),
      'billing_base_id',coalesce(nullif(ae.after_data->>'billing_base_id','')::uuid,nullif(ae.before_data->>'billing_base_id','')::uuid),
      'base_name',b.name,
      'before',jsonb_build_object(
        'movement_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.before_data->>'primary_price','')::numeric ELSE NULL END,
        'km_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.before_data->>'extra_km_price','')::numeric ELSE NULL END,
        'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN nullif(ae.before_data->>'secondary_price','')::numeric ELSE nullif(ae.before_data->>'primary_price','')::numeric END END
      ),
      'after',jsonb_build_object(
        'movement_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.after_data->>'primary_price','')::numeric ELSE NULL END,
        'km_price',CASE WHEN sc.distance_chargeable THEN nullif(ae.after_data->>'extra_km_price','')::numeric ELSE NULL END,
        'unit_price',CASE WHEN sc.distance_chargeable THEN NULL ELSE CASE WHEN sc.service_category='secondary' THEN nullif(ae.after_data->>'secondary_price','')::numeric ELSE nullif(ae.after_data->>'primary_price','')::numeric END END
      )
    ) ORDER BY ae.occurred_at DESC)
    FROM public.audit_events ae
    JOIN public.company_rate_cards rc ON rc.rate_card_id=coalesce(nullif(ae.after_data->>'rate_card_id','')::uuid,nullif(ae.before_data->>'rate_card_id','')::uuid)
    JOIN public.company_contracts cc ON cc.contract_id=rc.contract_id AND cc.company_id=p_company_id
    JOIN public.service_concepts sc ON sc.concept_id=p_concept_id
    LEFT JOIN public.users u ON u.user_id=ae.actor_id
    LEFT JOIN public.billing_bases b ON b.base_id=coalesce(nullif(ae.after_data->>'billing_base_id','')::uuid,nullif(ae.before_data->>'billing_base_id','')::uuid)
    WHERE ae.entity_table='company_rate_items'
      AND coalesce(ae.after_data->>'concept_id',ae.before_data->>'concept_id')=p_concept_id::text
  ),'[]'::jsonb);
END
$function$;

CREATE OR REPLACE FUNCTION public.get_operator_service_context_v1(p_company_id uuid,p_scheduled_for timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text:=app_private.current_auxilios_role();
  v_date date:=(coalesce(p_scheduled_for,now()) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_setting public.company_billing_settings%rowtype;
  v_card uuid;
  v_base_count integer:=0;
  v_service_count integer:=0;
  v_missing_price_count integer:=0;
  v_blocking jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
BEGIN
  IF v_role NOT IN ('administracion','facturacion','operador','supervision') THEN
    RAISE EXCEPTION 'Sin permiso para preparar servicios';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.company_id=p_company_id AND c.status='active') THEN
    RAISE EXCEPTION 'Prestadora inexistente o inactiva';
  END IF;

  SELECT s.* INTO v_setting
  FROM public.company_billing_settings s
  WHERE s.company_id=p_company_id AND s.is_active
    AND s.valid_from<=v_date AND (s.valid_until IS NULL OR s.valid_until>=v_date)
  ORDER BY s.valid_from DESC,s.updated_at DESC
  LIMIT 1;

  IF v_setting.billing_setting_id IS NULL THEN
    v_blocking:=v_blocking||jsonb_build_array(jsonb_build_object('code','missing_billing_settings','message','La prestadora no tiene parámetros de facturación configurados.'));
  ELSE
    SELECT count(*) INTO v_base_count
    FROM public.company_billing_base_links l
    JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active
    WHERE l.billing_setting_id=v_setting.billing_setting_id AND l.is_active;
    IF v_base_count=0 THEN
      v_blocking:=v_blocking||jsonb_build_array(jsonb_build_object('code','missing_bases','message','La prestadora no tiene bases habilitadas.'));
    END IF;
  END IF;

  SELECT count(*) INTO v_service_count
  FROM public.company_service_settings css
  JOIN public.service_concepts sc ON sc.concept_id=css.concept_id
  WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system';
  IF v_service_count=0 THEN
    v_blocking:=v_blocking||jsonb_build_array(jsonb_build_object('code','missing_services','message','La prestadora no tiene servicios habilitados.'));
  END IF;

  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  SELECT count(*) INTO v_missing_price_count
  FROM public.company_service_settings css
  JOIN public.service_concepts sc ON sc.concept_id=css.concept_id
  WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'
    AND (v_card IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.company_rate_items i
      WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
    ));
  IF v_missing_price_count>0 THEN
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','services_without_price','message',format('%s servicio(s) habilitado(s) no tienen precio configurado.',v_missing_price_count),'count',v_missing_price_count));
  END IF;

  RETURN jsonb_build_object(
    'company',(SELECT jsonb_build_object('company_id',c.company_id,'name',coalesce(c.trade_name,c.legal_name)) FROM public.companies c WHERE c.company_id=p_company_id),
    'ready',jsonb_array_length(v_blocking)=0,
    'blocking_issues',v_blocking,
    'warnings',v_warnings,
    'billing',CASE WHEN v_setting.billing_setting_id IS NULL THEN NULL ELSE jsonb_build_object(
      'billing_setting_id',v_setting.billing_setting_id,
      'route_mode',v_setting.route_mode,
      'toll_calculation_mode',v_setting.toll_calculation_mode,
      'covered_radius_km',v_setting.covered_radius_km,
      'movement_charge_until_km',v_setting.movement_charge_until_km,
      'requires_verified_base',v_setting.requires_verified_base
    ) END,
    'bases',CASE WHEN v_setting.billing_setting_id IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'base_id',b.base_id,'name',b.name,'address',b.address,
        'latitude',b.latitude,'longitude',b.longitude,'google_place_id',b.google_place_id,
        'address_verified',b.address_verified,
        'route_ready',NOT v_setting.requires_verified_base OR (b.address_verified AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL)
      ) ORDER BY b.name)
      FROM public.company_billing_base_links l
      JOIN public.billing_bases b ON b.base_id=l.base_id AND b.is_active
      WHERE l.billing_setting_id=v_setting.billing_setting_id AND l.is_active
    ),'[]'::jsonb) END,
    'services',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'concept_id',sc.concept_id,
        'name',sc.name,
        'category',sc.service_category,
        'pricing_unit',sc.default_pricing_unit,
        'distance_chargeable',sc.distance_chargeable,
        'code_mode',coalesce(css.code_mode,'fixed'),
        'requires_own_code',coalesce(css.requires_own_code,false) OR coalesce(css.code_mode,'fixed')='manual',
        'has_price',v_card IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.company_rate_items i
          WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
        ),
        'available',v_card IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.company_rate_items i
          WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL
        )
      ) ORDER BY sc.sort_order,sc.name)
      FROM public.company_service_settings css
      JOIN public.service_concepts sc ON sc.concept_id=css.concept_id
      WHERE css.company_id=p_company_id AND css.is_enabled AND sc.is_active AND sc.billing_family<>'system'
    ),'[]'::jsonb)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_company_service_prices_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_company_service_price_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_company_service_price_exception_v1(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_company_service_price_history_v1(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_operator_service_context_v1(uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_service_prices_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_service_price_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_service_price_exception_v1(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_service_price_history_v1(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_operator_service_context_v1(uuid,timestamptz) TO authenticated;
