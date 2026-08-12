-- AuxiliOS · Recargos actuales por prestadora v1
-- Mantiene company_rate_rules como almacenamiento técnico por compatibilidad,
-- pero las APIs nuevas no exponen ni crean borradores/versiones de tarifario.

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
  current_role text;
  p uuid; s uuid; r uuid; c uuid;
BEGIN
  d:=CASE WHEN tg_op='DELETE' THEN to_jsonb(old) ELSE to_jsonb(new) END;
  card_id:=(d->>'rate_card_id')::uuid;
  SELECT rc.status,cc.company_id INTO card_status,card_company
  FROM public.company_rate_cards rc
  JOIN public.company_contracts cc ON cc.contract_id=rc.contract_id
  WHERE rc.rate_card_id=card_id;
  current_role:=app_private.current_auxilios_role();

  IF card_id IS NULL OR card_status IS NULL THEN RAISE EXCEPTION 'Configuración comercial inexistente.'; END IF;
  IF card_status<>'draft' THEN
    IF NOT (card_status='active' AND current_role='administracion' AND tg_table_name IN ('company_rate_rules','company_rate_rule_exceptions')) THEN
      RAISE EXCEPTION 'La configuración histórica no se puede modificar.';
    END IF;
  END IF;

  IF tg_table_name='company_rate_service_links' AND tg_op<>'DELETE' THEN
    p:=(d->>'primary_concept_id')::uuid;s:=(d->>'secondary_concept_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=p AND can_be_primary AND is_active)
      OR NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=s AND can_be_secondary AND is_active)
    THEN RAISE EXCEPTION 'La relación requiere conceptos principal y secundario habilitados.';END IF;
  END IF;

  IF tg_table_name='company_rate_rule_exceptions' AND tg_op<>'DELETE' THEN
    r:=(d->>'rule_id')::uuid;c:=(d->>'concept_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.company_rate_rules WHERE rule_id=r AND rate_card_id=card_id) THEN
      RAISE EXCEPTION 'La excepción no pertenece a la regla.';
    END IF;
    IF card_status='active' THEN
      IF NOT EXISTS(SELECT 1 FROM public.company_service_settings css WHERE css.company_id=card_company AND css.concept_id=c AND css.is_enabled) THEN
        RAISE EXCEPTION 'El servicio no está habilitado para la prestadora.';
      END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM public.company_rate_items WHERE rate_card_id=card_id AND concept_id=c AND is_active) THEN
      RAISE EXCEPTION 'El concepto no está habilitado en la configuración heredada.';
    END IF;
  END IF;

  IF tg_op='DELETE' THEN RETURN old;END IF;
  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.get_company_billing_surcharges_v1(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text:=app_private.current_auxilios_role();
  v_card uuid;
BEGIN
  IF v_role NOT IN ('administracion','facturacion','supervision') THEN RAISE EXCEPTION 'Sin permiso para consultar recargos'; END IF;
  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NULL THEN RETURN jsonb_build_object('rules','[]'::jsonb,'exceptions','[]'::jsonb); END IF;
  RETURN jsonb_build_object(
    'rules',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'rule_id',r.rule_id,'rule_type',r.rule_type,'enabled',r.enabled,'calculation_mode',r.calculation_mode,'amount',r.amount,
      'start_time',r.start_time,'end_time',r.end_time,'saturday_start',r.saturday_start,'saturday_end',r.saturday_end,
      'sunday_holiday_start',r.sunday_holiday_start,'sunday_holiday_end',r.sunday_holiday_end
    ) ORDER BY r.rule_type) FROM public.company_rate_rules r WHERE r.rate_card_id=v_card AND r.rule_type IN ('night','weekend_holiday')),'[]'::jsonb),
    'exceptions',coalesce((SELECT jsonb_agg(jsonb_build_object('exception_id',e.exception_id,'rule_id',e.rule_id,'concept_id',e.concept_id)) FROM public.company_rate_rule_exceptions e WHERE e.rate_card_id=v_card AND EXISTS(SELECT 1 FROM public.company_rate_rules r WHERE r.rule_id=e.rule_id AND r.rule_type IN ('night','weekend_holiday'))),'[]'::jsonb)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.save_company_billing_surcharges_v1(p_company_id uuid,p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_card uuid;
  model jsonb;
  v_type text;
  v_rule public.company_rate_rules%rowtype;
  concept_text text;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar recargos'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.company_id=p_company_id) THEN RAISE EXCEPTION 'Prestadora inexistente'; END IF;
  v_card:=app_private.current_price_card_for_company(p_company_id,true);
  IF v_card IS NULL THEN RAISE EXCEPTION 'No se pudo preparar la configuración de recargos'; END IF;

  FOR model IN SELECT value FROM jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) LOOP
    v_type:=model->>'type';
    IF v_type NOT IN ('night','weekend_holiday') THEN CONTINUE; END IF;
    SELECT * INTO v_rule FROM public.company_rate_rules WHERE rate_card_id=v_card AND rule_type=v_type LIMIT 1;
    IF v_rule.rule_id IS NULL THEN
      INSERT INTO public.company_rate_rules(rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end)
      VALUES(v_card,v_type,coalesce((model->>'enabled')::boolean,false),coalesce(nullif(model->>'calculation_mode',''),'percentage'),coalesce(nullif(model->>'amount','')::numeric,0),nullif(model->>'start_time','')::time,nullif(model->>'end_time','')::time,nullif(model->>'saturday_start','')::time,nullif(model->>'saturday_end','')::time,nullif(model->>'sunday_holiday_start','')::time,nullif(model->>'sunday_holiday_end','')::time)
      RETURNING * INTO v_rule;
    ELSE
      UPDATE public.company_rate_rules SET
        enabled=coalesce((model->>'enabled')::boolean,false),calculation_mode=coalesce(nullif(model->>'calculation_mode',''),'percentage'),amount=coalesce(nullif(model->>'amount','')::numeric,0),
        start_time=nullif(model->>'start_time','')::time,end_time=nullif(model->>'end_time','')::time,
        saturday_start=nullif(model->>'saturday_start','')::time,saturday_end=nullif(model->>'saturday_end','')::time,
        sunday_holiday_start=nullif(model->>'sunday_holiday_start','')::time,sunday_holiday_end=nullif(model->>'sunday_holiday_end','')::time
      WHERE rule_id=v_rule.rule_id RETURNING * INTO v_rule;
    END IF;
    DELETE FROM public.company_rate_rule_exceptions WHERE rule_id=v_rule.rule_id;
    FOR concept_text IN SELECT jsonb_array_elements_text(coalesce(model->'exceptions','[]'::jsonb)) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.company_service_settings css WHERE css.company_id=p_company_id AND css.concept_id=concept_text::uuid AND css.is_enabled) THEN
        RAISE EXCEPTION 'El servicio % no está habilitado para la prestadora',concept_text;
      END IF;
      INSERT INTO public.company_rate_rule_exceptions(rate_card_id,rule_id,concept_id) VALUES(v_card,v_rule.rule_id,concept_text::uuid);
    END LOOP;
  END LOOP;
  RETURN public.get_company_billing_surcharges_v1(p_company_id);
END
$function$;

REVOKE ALL ON FUNCTION public.get_company_billing_surcharges_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_company_billing_surcharges_v1(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_billing_surcharges_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_billing_surcharges_v1(uuid,jsonb) TO authenticated;
