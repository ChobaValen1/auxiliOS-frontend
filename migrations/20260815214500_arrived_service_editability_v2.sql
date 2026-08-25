-- AuxiliOS · ARRIBADO sigue editable para Operaciones hasta FINALIZADO.
-- La firma queda inmutable por su trigger específico; el servicio/remito puede corregir
-- sus datos operativos con auditoría. Chofer/Móvil siguen bloqueados después del ARRIBADO.

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_private' and p.proname='update_operator_service_full'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe app_private.update_operator_service_full'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'v_remito_locked:=coalesce(v_remito_status in (''firmado'',''cerrado_admin''),false) or v_remito_signed_at is not null;',
    'v_remito_locked:=false;');
  if v_sql=v_before then raise exception 'No se encontró la regla remito_locked esperada'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    'if v_trip_started and v_structural_changed and v_reason is null then raise exception ''Indicá el motivo de la corrección porque el viaje ya fue iniciado''; end if;',
    'if v_trip_started and v_service.status <> ''at_origin'' and v_structural_changed and v_reason is null then raise exception ''Indicá el motivo de la corrección porque el viaje ya fue iniciado''; end if;');
  if v_sql=v_before then raise exception 'No se encontró la regla de motivo estructural esperada'; end if;

  execute v_sql;
end;
$migration$;

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_operator_service_edit_context'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.get_operator_service_edit_context'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '''remito_locked'',coalesce(v_remito_status in (''firmado'',''cerrado_admin''),false) or v_remito_signed_at is not null',
    '''remito_locked'',false');
  if v_sql=v_before then raise exception 'No se encontró lock de remito esperado en edit context'; end if;

  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '''requires_reason'',v_service.trip_id is not null or v_service.status not in (''pending'',''assigned'')',
    '''requires_reason'',v_service.status not in (''pending'',''assigned'',''at_origin'')');
  if v_sql=v_before then raise exception 'No se encontró requires_reason esperado en edit context'; end if;

  execute v_sql;
end;
$migration$;
