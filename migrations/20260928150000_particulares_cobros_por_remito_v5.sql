-- Particulares v5: Sueldos lee los cobros de servicios particulares de los
-- remitos del chofer para mostrar el efectivo esperado por servicio.
create or replace function public.get_private_collections_by_remitos_v1(p_remito_ids integer[])
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'supervision', 'operador') then
    raise exception 'No autorizado';
  end if;
  if coalesce(array_length(p_remito_ids, 1), 0) > 500 then raise exception 'Demasiados remitos'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('remito_id', c.remito_id, 'service_id', c.service_id, 'lines', c.lines,
                     'collected_total', c.collected_total, 'not_collected', c.not_collected, 'status', c.status))
                     from public.service_collection_reports c where c.remito_id = any(p_remito_ids)), '[]'::jsonb);
end $function$;
revoke all on function public.get_private_collections_by_remitos_v1(integer[]) from public, anon;
grant execute on function public.get_private_collections_by_remitos_v1(integer[]) to authenticated;
