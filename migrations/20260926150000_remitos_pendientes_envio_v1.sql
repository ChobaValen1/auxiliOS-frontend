-- Envío del remito al cliente: tarea de Operaciones / Administración.
--
-- El chofer ya no ve el aviso al firmar. Administración ve en Remitos cuáles
-- remitos firmados todavía no se enviaron al cliente (sin link ni canal),
-- dentro de los últimos 60 días: después la encuesta ya no admite respuesta.

create or replace function public.get_remitos_pendientes_envio_v1()
returns integer[]
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision'])) then
    raise exception 'Sin permiso';
  end if;
  return coalesce((
    select array_agg(r.remito_id order by r.firmado_at desc)
    from public.remitos r
    left join public.remito_public_links l on l.remito_id = r.remito_id
    where r.status = 'firmado' and r.firmado_at > now() - interval '60 days' and l.remito_id is null
  ), '{}');
end
$function$;

revoke all on function public.get_remitos_pendientes_envio_v1() from public, anon;
grant execute on function public.get_remitos_pendientes_envio_v1() to authenticated;
