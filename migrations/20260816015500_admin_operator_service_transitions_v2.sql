-- AuxiliOS · Administración y Operador pueden ejecutar transiciones operativas.
-- Mantiene las mismas reglas de lifecycle, validaciones, bloqueos y auditoría.

do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='transition_operator_service_v2'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'No existe public.transition_operator_service_v2';
  end if;

  select pg_get_functiondef(v_oid) into v_sql;
  v_before:=v_sql;
  v_sql:=replace(
    v_sql,
    'if v_role <> ''operador'' or v_uid is null then raise exception ''Solo el Operador puede cambiar el estado del servicio''; end if;',
    'if v_role not in (''operador'',''administracion'') or v_uid is null then raise exception ''Solo Operador o Administración puede cambiar el estado del servicio''; end if;'
  );

  if v_sql=v_before then
    raise exception 'No se encontró la regla de rol esperada en transition_operator_service_v2';
  end if;

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
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='set_operator_service_assignment_v2'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'No existe public.set_operator_service_assignment_v2';
  end if;

  select pg_get_functiondef(v_oid) into v_sql;
  v_before:=v_sql;
  v_sql:=replace(
    v_sql,
    'if v_uid is null or v_role <> ''operador'' then\n    raise exception ''Solo el Operador puede asignar o reasignar servicios'';\n  end if;',
    'if v_uid is null or v_role not in (''operador'',''administracion'') then\n    raise exception ''Solo Operador o Administración puede asignar o reasignar servicios'';\n  end if;'
  );

  if v_sql=v_before then
    raise exception 'No se encontró la regla de rol esperada en set_operator_service_assignment_v2';
  end if;

  execute v_sql;
end;
$migration$;
