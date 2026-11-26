-- Servicio enganchado: candidatos de todo el día (25/11/2026).
-- Antes: misma prestadora, de las 24 h anteriores a las 2 h posteriores, a lo sumo 10 y sin los que ya
-- tenían otro servicio enganchado. Ahora: TODOS los servicios de la misma prestadora del mismo día
-- (calendario de Argentina) que el servicio que se está cargando, sin tope de 10.
-- Los que ya tienen otro servicio enganchado también vienen (con has_next = true) para que el formulario
-- los muestre deshabilitados: a cada servicio se le engancha a lo sumo uno (índice operator_services_chain_next_uq).
-- No se ofrece el servicio que ya viene enganchado a éste (armaría un círculo).
-- Mismo nombre y firma: el frontend no cambia de RPC. Sólo lectura.

create or replace function public.list_operator_service_chain_candidates_v1(
  p_company_id uuid, p_scheduled_for timestamptz, p_origin_lat numeric default null, p_origin_lng numeric default null,
  p_service_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare
  v_day date := (coalesce(p_scheduled_for, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para enganchar servicios';
  end if;
  if app_private.company_route_mode_v1(p_company_id, p_scheduled_for) <> 'base_origin_destination_base' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x.j || jsonb_build_object('gap_km', x.gap, 'taken',
             exists(select 1 from public.operator_services n where n.chained_to_service_id = x.service_id
                    and n.service_id is distinct from p_service_id))
           order by x.gap nulls last, x.sched)
    from (
      select c.service_id, app_private.chain_service_json_v1(c.service_id) j, c.scheduled_for sched,
        case when p_origin_lat is not null and p_origin_lng is not null
          then round((6371 * 2 * asin(sqrt(
            power(sin(radians((p_origin_lat - c.destination_lat) / 2)), 2) +
            cos(radians(c.destination_lat)) * cos(radians(p_origin_lat)) *
            power(sin(radians((p_origin_lng - c.destination_lng) / 2)), 2))))::numeric, 1) end gap
      from public.operator_services c
      where c.company_id = p_company_id
        and c.service_id is distinct from p_service_id
        and c.status <> 'cancelled' and not coalesce(c.is_test, false)
        and coalesce(c.billing_status, '') <> 'invoiced'
        and c.destination_lat is not null and c.destination_lng is not null
        and c.scheduled_for >= (v_day::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and c.scheduled_for < ((v_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and (p_service_id is null or c.chained_to_service_id is distinct from p_service_id)
      order by gap nulls last, c.scheduled_for
      limit 200) x), '[]'::jsonb);
end
$f$;

revoke all on function public.list_operator_service_chain_candidates_v1(uuid, timestamptz, numeric, numeric, uuid) from public, anon;
grant execute on function public.list_operator_service_chain_candidates_v1(uuid, timestamptz, numeric, numeric, uuid) to authenticated;
