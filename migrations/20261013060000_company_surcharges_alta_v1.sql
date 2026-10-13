-- Alta de prestadora: los recargos se guardan sobre el tarifario vigente.
-- · get_company_billing_surcharges_v1 informa si hay tarifario y cuántos
--   servicios principales tienen precio, para que la pantalla muestre los pasos.
-- · save_company_billing_surcharges_v1 ya no intenta crear un tarifario vacío
--   (fallaba con "El tarifario debe tener al menos un concepto principal"):
--   sin tarifario y con los recargos apagados no hace nada; con recargos
--   prendidos avisa que primero hay que cargar las tarifas.
create or replace function public.get_company_billing_surcharges_v1(p_company_id uuid)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_role text:=app_private.current_auxilios_role(); v_card uuid; v_priced integer:=0; v_out jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar recargos'; end if;
  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  if v_card is not null then
    select count(distinct i.concept_id) into v_priced from public.company_rate_items i
     where i.rate_card_id=v_card and i.is_active and i.can_be_primary;
  end if;
  if v_card is null then
    v_out:=jsonb_build_object('rules','[]'::jsonb,'exceptions','[]'::jsonb);
  else
    v_out:=jsonb_build_object(
      'rules',coalesce((select jsonb_agg(jsonb_build_object('rule_id',r.rule_id,'rule_type',r.rule_type,'enabled',r.enabled,'calculation_mode',r.calculation_mode,'amount',r.amount,'start_time',r.start_time,'end_time',r.end_time,'saturday_start',r.saturday_start,'saturday_end',r.saturday_end,'sunday_holiday_start',r.sunday_holiday_start,'sunday_holiday_end',r.sunday_holiday_end) order by r.rule_type)
                        from public.company_rate_rules r where r.rate_card_id=v_card and r.rule_type in ('night','weekend_holiday')),'[]'::jsonb),
      'exceptions',coalesce((select jsonb_agg(jsonb_build_object('exception_id',e.exception_id,'rule_id',e.rule_id,'concept_id',e.concept_id))
                        from public.company_rate_rule_exceptions e where e.rate_card_id=v_card
                         and exists(select 1 from public.company_rate_rules r where r.rule_id=e.rule_id and r.rule_type in ('night','weekend_holiday'))),'[]'::jsonb));
  end if;
  return v_out||jsonb_build_object('tarifario',jsonb_build_object('existe',v_card is not null,'servicios_con_precio',v_priced));
end;
$function$;

create or replace function public.save_company_billing_surcharges_v1(p_company_id uuid, p_rules jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
DECLARE v_card uuid;model jsonb;v_type text;v_rule public.company_rate_rules%rowtype;concept_text text;
BEGIN
  IF app_private.current_auxilios_role()<>'administracion' THEN RAISE EXCEPTION 'Solo Administración puede editar recargos';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.company_id=p_company_id) THEN RAISE EXCEPTION 'Prestadora inexistente';END IF;
  v_card:=app_private.current_price_card_for_company(p_company_id,false);
  IF v_card IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) m WHERE coalesce((m->>'enabled')::boolean,false)) THEN
      RETURN public.get_company_billing_surcharges_v1(p_company_id);
    END IF;
    RAISE EXCEPTION 'Primero cargá las tarifas de esta prestadora (al menos un servicio principal con precio). Los recargos se aplican sobre esos precios.';
  END IF;
  FOR model IN SELECT value FROM jsonb_array_elements(coalesce(p_rules,'[]'::jsonb)) LOOP
    v_type:=model->>'type';IF v_type NOT IN('night','weekend_holiday') THEN CONTINUE;END IF;
    v_rule:=NULL;
    SELECT * INTO v_rule FROM public.company_rate_rules WHERE rate_card_id=v_card AND rule_type=v_type LIMIT 1;
    IF v_rule.rule_id IS NULL THEN
      INSERT INTO public.company_rate_rules(rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end)
      VALUES(v_card,v_type,coalesce((model->>'enabled')::boolean,false),coalesce(nullif(model->>'calculation_mode',''),'percentage'),coalesce(nullif(model->>'amount','')::numeric,0),nullif(model->>'start_time','')::time,nullif(model->>'end_time','')::time,nullif(model->>'saturday_start','')::time,nullif(model->>'saturday_end','')::time,nullif(model->>'sunday_holiday_start','')::time,nullif(model->>'sunday_holiday_end','')::time) RETURNING * INTO v_rule;
    ELSE
      UPDATE public.company_rate_rules SET enabled=coalesce((model->>'enabled')::boolean,false),calculation_mode=coalesce(nullif(model->>'calculation_mode',''),'percentage'),amount=coalesce(nullif(model->>'amount','')::numeric,0),start_time=nullif(model->>'start_time','')::time,end_time=nullif(model->>'end_time','')::time,saturday_start=nullif(model->>'saturday_start','')::time,saturday_end=nullif(model->>'saturday_end','')::time,sunday_holiday_start=nullif(model->>'sunday_holiday_start','')::time,sunday_holiday_end=nullif(model->>'sunday_holiday_end','')::time WHERE rule_id=v_rule.rule_id RETURNING * INTO v_rule;
    END IF;
    DELETE FROM public.company_rate_rule_exceptions WHERE rule_id=v_rule.rule_id;
    FOR concept_text IN SELECT jsonb_array_elements_text(coalesce(model->'exceptions','[]'::jsonb)) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.company_service_settings css WHERE css.company_id=p_company_id AND css.concept_id=concept_text::uuid AND css.is_enabled) THEN RAISE EXCEPTION 'El servicio % no está habilitado para la prestadora',concept_text;END IF;
      INSERT INTO public.company_rate_rule_exceptions(rate_card_id,rule_id,concept_id) VALUES(v_card,v_rule.rule_id,concept_text::uuid);
    END LOOP;
  END LOOP;
  RETURN public.get_company_billing_surcharges_v1(p_company_id);
END
$function$;
