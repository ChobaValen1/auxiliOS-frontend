-- Conexión de remitos por servicio, filtrable por ids (p_service_ids null = todos,
-- igual que v2). Evita bajar todos los remitos en cada refresco. Solo lectura.
do $mig$
declare
  d text := pg_get_functiondef('public.list_operator_service_document_connections_v2()'::regprocedure);
begin
  d := replace(d, 'public.list_operator_service_document_connections_v2()', 'public.list_operator_service_document_connections_v3(p_service_ids uuid[] default null)');
  d := replace(d, E') e on true;', E') e on true\n  where p_service_ids is null or s.service_id = any(p_service_ids);');
  if d not like '%connections_v3(p_service_ids%' or d not like '%any(p_service_ids)%' then
    raise exception 'No se pudo derivar la función';
  end if;
  execute d;
  execute 'revoke all on function public.list_operator_service_document_connections_v3(uuid[]) from public, anon';
  execute 'grant execute on function public.list_operator_service_document_connections_v3(uuid[]) to authenticated';
end
$mig$;
