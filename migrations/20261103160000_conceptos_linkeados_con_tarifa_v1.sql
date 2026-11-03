-- Agregar servicio: un concepto linkeado (price_link = precio de la movida o del km de asfalto) toma su precio
-- del movimiento principal al cotizar, así que no necesita una línea propia en la tarifa. Antes el formulario
-- lo marcaba «Sin tarifa vigente» y no dejaba elegirlo (caso Cardinal: Hora de Trabajo / Espera).
-- Ahora cuenta como tarifado si la prestadora tiene tarifa vigente para la fecha.
-- Además: Cardinal ya no usa «Hora Espera» (queda solo Hora de Trabajo / Espera).
do $m$
declare src text; n int;
begin
  src:=pg_get_functiondef('public.get_operator_service_context_v1(uuid,timestamptz)'::regprocedure);
  n:=(length(src)-length(replace(src,'EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL)','')))
     /length('EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL)');
  if n<>3 then raise exception 'Ancla inesperada (%).',n; end if;
  src:=replace(src,'EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL)',
    '(css.price_link IS NOT NULL OR EXISTS(SELECT 1 FROM public.company_rate_items i WHERE i.rate_card_id=v_card AND i.concept_id=sc.concept_id AND i.is_active AND i.branch_id IS NULL AND i.billing_base_id IS NULL))');
  src:=replace(src,'''requires_own_code'',coalesce(css.requires_own_code,false)','''price_link'',css.price_link,''requires_own_code'',coalesce(css.requires_own_code,false)');
  execute src;
end $m$;

update public.company_service_settings css set is_enabled=false
 from public.service_concepts sc
 where sc.concept_id=css.concept_id and sc.code='excess_wait_hour'
   and css.company_id='431c5f7d-8bca-4afc-b634-8c871239e2d5' and css.is_enabled;
