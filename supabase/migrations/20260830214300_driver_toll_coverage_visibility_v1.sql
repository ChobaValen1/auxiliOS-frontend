-- AuxiliOS · Formato contractual de cobro de peajes visible en todo el remito.
-- El valor se conserva como código canónico; las etiquetas se resuelven en la UI.

do $migration$
declare
  v_definition text;
  v_needle text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_driver_operator_queue_v2'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_definition is null then
    raise exception 'Falta public.get_driver_operator_queue_v2()';
  end if;

  v_needle := '''toll_payment_summary'',coalesce(toll_summary.payment_summary,''Sin peajes previstos''),';
  if position(v_needle in v_definition) = 0 then
    raise exception 'No se encontró el punto de extensión de get_driver_operator_queue_v2';
  end if;

  v_definition := replace(
    v_definition,
    v_needle,
    '''toll_coverage_mode'',s.toll_coverage_mode,' || chr(10) ||
    '      ''toll_payment_summary'',coalesce(toll_summary.payment_summary,''Sin peajes previstos''),'
  );
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_needle text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_driver_remito_reference_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_service_id uuid';

  if v_definition is null then
    raise exception 'Falta public.get_driver_remito_reference_v2(uuid)';
  end if;

  v_needle := '''toll_amount_mode'',case v_toll_setting';
  if position(v_needle in v_definition) = 0 then
    raise exception 'No se encontró el punto de extensión de get_driver_remito_reference_v2';
  end if;

  v_definition := replace(
    v_definition,
    v_needle,
    '''toll_coverage_mode'',case when p_service_id is null then null else (' ||
      'select s.toll_coverage_mode from public.operator_services s where s.service_id=p_service_id' ||
    ') end,' || chr(10) ||
    '    ''toll_amount_mode'',case v_toll_setting'
  );
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_needle text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_driver_remito_addons_v2'
    and pg_get_function_identity_arguments(p.oid) = 'p_remito_id integer';

  if v_definition is null then
    raise exception 'Falta public.get_driver_remito_addons_v2(integer)';
  end if;

  v_needle := '''service_id'',r.operator_service_id,';
  if position(v_needle in v_definition) = 0 then
    raise exception 'No se encontró el punto de extensión de get_driver_remito_addons_v2';
  end if;

  v_definition := replace(
    v_definition,
    v_needle,
    '''service_id'',r.operator_service_id,' || chr(10) ||
    '    ''toll_coverage_mode'',case when r.operator_service_id is null then null else (' ||
      'select s.toll_coverage_mode from public.operator_services s where s.service_id=r.operator_service_id' ||
    ') end,'
  );
  execute v_definition;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_needle text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'list_operator_service_document_connections_v1'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_definition is null then
    raise exception 'Falta public.list_operator_service_document_connections_v1()';
  end if;

  v_needle := '''service_origin'', s.service_origin,';
  if position(v_needle in v_definition) = 0 then
    raise exception 'No se encontró el punto de extensión de list_operator_service_document_connections_v1';
  end if;

  v_definition := replace(
    v_definition,
    v_needle,
    '''service_origin'', s.service_origin,' || chr(10) ||
    '    ''toll_coverage_mode'', s.toll_coverage_mode,'
  );
  execute v_definition;
end;
$migration$;

comment on function public.get_driver_operator_queue_v2() is
  'Cola privada del Chofer con formato contractual, KM, excedentes y peajes por responsable.';
comment on function public.get_driver_remito_reference_v2(uuid) is
  'Catálogos y preferencias del remito, incluido el formato contractual de peajes del servicio.';
comment on function public.get_driver_remito_addons_v2(integer) is
  'Detalle histórico del remito con formato contractual de peajes y adicionales informados.';

revoke all on function public.get_driver_operator_queue_v2() from public,anon,authenticated;
grant execute on function public.get_driver_operator_queue_v2() to authenticated;
revoke all on function public.get_driver_remito_reference_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_driver_remito_reference_v2(uuid) to authenticated;
revoke all on function public.get_driver_remito_addons_v2(integer) from public,anon,authenticated;
grant execute on function public.get_driver_remito_addons_v2(integer) to authenticated;
revoke all on function public.list_operator_service_document_connections_v1() from public,anon,authenticated;
grant execute on function public.list_operator_service_document_connections_v1() to authenticated;
