-- Lista liviana para la pestaña Activos: mismas filas/columnas/permisos que
-- list_operator_services, pero solo servicios abiertos o con remito firmado
-- pendiente de revisión. Se deriva de la función vigente al aplicar la migración
-- para no duplicar 150 líneas. Solo lectura.
do $mig$
declare
  d text := pg_get_functiondef('public.list_operator_services(integer)'::regprocedure);
  cond text := $c$
      where (
        s.status in ('pending','assigned','en_route','at_origin','loaded','at_destination')
        or (s.status='completed' and s.remito_id is not null and coalesce(s.document_status,'')<>'approved'
            and exists(select 1 from public.remitos rr where rr.remito_id=s.remito_id and rr.status='firmado'))
      )
      order by$c$;
begin
  d := replace(d, 'public.list_operator_services(', 'public.list_operator_active_services_v1(');
  d := replace(d, E') excess on true\n      order by', E') excess on true' || cond);
  if d not like '%list_operator_active_services_v1%' or d not like '%rr.remito_id=s.remito_id%' then
    raise exception 'No se pudo derivar la función';
  end if;
  execute d;
  execute 'revoke all on function public.list_operator_active_services_v1(integer) from public, anon';
  execute 'grant execute on function public.list_operator_active_services_v1(integer) to authenticated';
end
$mig$;
