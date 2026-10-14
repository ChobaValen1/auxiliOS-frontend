-- Remito del chofer: los excedentes de la lista fija del operador (Kms excedentes,
-- Extracción, Hora Trabajo, Hora Espera, Viajero y Otro) se aceptan siempre, con
-- importe que escribe el chofer, sin quitar los que ya tenía cada prestadora.
-- "Otro" guarda el nombre que escribe el chofer.
do $mig$
declare d text:=pg_get_functiondef('app_private.persist_driver_remito_addons_v3(integer,jsonb,uuid)'::regprocedure); n text;
begin
  n:=replace(d,
$o$and c.billing_family<>'system' and coalesce(c.matrix_visible,true) and c.service_category in ('secondary','mixed')
      and (v_company_id is null or exists(select 1 from public.company_service_settings css where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled));$o$,
$n$and c.billing_family<>'system' and c.service_category in ('secondary','mixed')
      and (c.code in ('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other')
           or (coalesce(c.matrix_visible,true) and (v_company_id is null or exists(select 1 from public.company_service_settings css where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled))));$n$);
  if n=d then raise exception 'No se encontró el filtro de conceptos'; end if; d:=n;
  n:=replace(d,
$o$v_amount_mode:=coalesce(v_amount_mode,case when v_company_id is null then 'manual' else 'fixed' end);$o$,
$n$v_amount_mode:=coalesce(v_amount_mode,case when v_company_id is null or v_concept.code like 'excess\_%' then 'manual' else 'fixed' end);$n$);
  if n=d then raise exception 'No se encontró el modo de importe'; end if; d:=n;
  n:=replace(d,
$o$    if coalesce(v_amount,0)<=0 then raise exception 'El excedente no tiene un importe válido'; end if;$o$,
$n$    if v_concept.code='excess_other' then
      v_concept.name:=left(nullif(btrim(coalesce(v_row->>'concept_name','')),''),80);
      if v_concept.name is null or v_concept.name='Otro' then raise exception 'Escribí qué es el excedente "Otro"'; end if;
    end if;
    if coalesce(v_amount,0)<=0 then raise exception 'El excedente no tiene un importe válido'; end if;$n$);
  if n=d then raise exception 'No se encontró la validación de importe'; end if;
  execute n;
end $mig$;
