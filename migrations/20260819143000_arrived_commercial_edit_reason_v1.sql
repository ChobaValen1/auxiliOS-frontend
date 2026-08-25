-- AuxiliOS · ARRIBADO mantiene edición operativa/comercial sin exigir motivo.
-- Alinea el wrapper de commercial_addons con arrived_service_editability_v2.
-- En cualquier otro estado iniciado se conserva el gate de motivo existente.

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='update_operator_service_base_v2'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'No existe public.update_operator_service_base_v2';
  end if;

  select pg_get_functiondef(v_oid) into v_sql;
  v_before:=v_sql;

  v_sql:=replace(
    v_sql,
    'if (v_service.trip_id is not null or v_service.status not in (''pending'',''assigned'')) and v_reason is null then',
    'if v_service.status <> ''at_origin'' and (v_service.trip_id is not null or v_service.status not in (''pending'',''assigned'')) and v_reason is null then'
  );

  if v_sql=v_before then
    raise exception 'No se encontró el gate de motivo esperado en update_operator_service_base_v2';
  end if;

  execute v_sql;
end;
$migration$;
