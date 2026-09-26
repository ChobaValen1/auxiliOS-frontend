-- Remitos: datos del Servicio vinculado sin leer operator_services directo.
--
-- authenticated no tiene SELECT sobre operator_services (se accede por RPC),
-- así que Remitos no podía leer el tipo real ni el N° de servicio: caía al
-- texto guardado en el remito ("A definir por Operaciones") y el panel
-- mostraba "Sin clasificar". Estas funciones devuelven solo lo necesario.

create or replace function public.get_remitos_service_info_v1(p_remito_ids integer[])
returns table (remito_id integer, service_id uuid, service_order_number text, service_number text, concept_id uuid, concept_name text)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision','facturacion'])) then
    raise exception 'Sin permiso';
  end if;
  return query
    select r.remito_id, s.service_id, s.service_order_number::text, s.service_number::text, s.primary_concept_id, sc.name::text
    from public.remitos r
    join public.operator_services s on s.service_id = r.operator_service_id
    left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
    where r.remito_id = any (coalesce(p_remito_ids, '{}'));
end
$function$;

-- Filtro "Tipo de servicio" de Remitos: remitos cuyo Servicio es de ese tipo.
create or replace function public.get_remito_ids_by_concept_v1(p_concept_id uuid)
returns integer[]
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (app_private.current_auxilios_role() = any (array['administracion','supervision','facturacion'])) then
    raise exception 'Sin permiso';
  end if;
  return coalesce((
    select array_agg(r.remito_id)
    from public.remitos r
    join public.operator_services s on s.service_id = r.operator_service_id
    where s.primary_concept_id = p_concept_id
  ), '{}');
end
$function$;

revoke all on function public.get_remitos_service_info_v1(integer[]) from public, anon;
grant execute on function public.get_remitos_service_info_v1(integer[]) to authenticated;
revoke all on function public.get_remito_ids_by_concept_v1(uuid) from public, anon;
grant execute on function public.get_remito_ids_by_concept_v1(uuid) to authenticated;
