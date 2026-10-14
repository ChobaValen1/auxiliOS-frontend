-- Revisión administrativa del servicio (con remito del chofer): acepta la lista fija
-- de excedentes del operador aunque la prestadora no la tenga configurada, y "Otro"
-- guarda el nombre que se escribió. Corrige el 400 "Concepto inexistente o no
-- habilitado" de save_operator_review_workspace_v1.
do $mig$
declare d text:=pg_get_functiondef('app_private.validate_administrative_commercial_v1(uuid,uuid,jsonb)'::regprocedure); n text;
begin
  n:=replace(d,
$o$    select name into label from public.service_concepts c where concept_id=id and is_active and service_category in ('secondary','mixed') and billing_family<>'system'
     and exists(select 1 from public.company_service_settings cs where cs.company_id=p_company_id and cs.concept_id=id and cs.is_enabled);$o$,
$n$    select case when c.code='excess_other' then left(nullif(btrim(coalesce(x->>'concept_name','')),''),80) else c.name end into label
     from public.service_concepts c where concept_id=id and is_active and service_category in ('secondary','mixed') and billing_family<>'system'
     and (c.code in ('excess_km','extraction','excess_work_hour','excess_wait_hour','excess_traveler','excess_other')
          or exists(select 1 from public.company_service_settings cs where cs.company_id=p_company_id and cs.concept_id=id and cs.is_enabled));
    if label='Otro' then label:=null; end if;
    if label is null and id::text='a1e5c0de-0005-4000-8000-000000000005' then raise exception 'Escribí qué es el excedente "Otro"'; end if;$n$);
  if n=d then raise exception 'No se encontró el filtro'; end if;
  execute n;
end $mig$;
