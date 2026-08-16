-- AuxiliOS · expone el ARRIBADO real en la mesa operativa.
do $migration$
declare
  v_oid oid;
  v_sql text;
  v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='list_operator_services'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.list_operator_services'; end if;
  select pg_get_functiondef(v_oid) into v_sql;
  v_before:=v_sql;
  v_sql:=replace(v_sql,
    '''estimated_arrival_at'',s.estimated_arrival_at,',
    '''estimated_arrival_at'',s.estimated_arrival_at,''arrived_at'',s.arrived_at,');
  if v_sql=v_before then raise exception 'No se encontró estimated_arrival_at en list_operator_services'; end if;
  execute v_sql;
end;
$migration$;
