-- Servicios enganchados (12/11/2026).
-- Un servicio B puede engancharse a un servicio A de la misma prestadora: el móvil termina A y sigue
-- con B sin volver a la base. Recorrido facturado de la cadena:
--   A: Base → Origen A → Destino A          (sale de la base, no vuelve)
--   B: Origen B → Destino B → Base          (no sale de la base, vuelve)
--   (si hay uno en el medio: Origen → Destino)
-- Cada servicio cobra su movida y sus km; el radio cubierto se evalúa con los km de cada uno.
-- Los km los calcula el navegador (maps-proxy) con el recorrido que corresponde; esta migración guarda
-- el enganche y, en el mismo paso, los km recalculados del servicio anterior.
-- Sólo para prestadoras con recorrido Base → Origen → Destino → Base.

alter table public.operator_services add column if not exists chained_to_service_id uuid
  references public.operator_services(service_id) on delete restrict;
alter table public.operator_services drop constraint if exists operator_services_chain_not_self_chk;
alter table public.operator_services add constraint operator_services_chain_not_self_chk
  check (chained_to_service_id is null or chained_to_service_id <> service_id);
-- A cada servicio se le engancha a lo sumo uno.
create unique index if not exists operator_services_chain_next_uq
  on public.operator_services(chained_to_service_id) where chained_to_service_id is not null;
comment on column public.operator_services.chained_to_service_id is
  'Servicio anterior del enganche: este servicio sale desde donde terminó aquél, sin volver a la base.';

-- Recorrido que corresponde según el lugar en la cadena.
create or replace function app_private.chain_route_mode_v1(p_base_mode text, p_has_previous boolean, p_has_next boolean)
returns text language sql immutable set search_path = '' as $f$
  select case
    when coalesce(p_base_mode, 'base_origin_destination_base') <> 'base_origin_destination_base' then p_base_mode
    when p_has_previous and p_has_next then 'origin_destination'
    when p_has_next then 'base_origin_destination'
    when p_has_previous then 'origin_destination_base'
    else 'base_origin_destination_base' end
$f$;

-- Recorrido configurado para la prestadora (la regla vigente, igual que el motor).
create or replace function app_private.company_route_mode_v1(p_company_id uuid, p_at timestamptz)
returns text language sql stable security definer set search_path = '' as $f$
  select coalesce((
    select s.route_mode from public.company_billing_settings s
    where s.company_id = p_company_id and s.is_active
      and s.valid_from <= (coalesce(p_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date
      and (s.valid_until is null or s.valid_until >= (coalesce(p_at, now()) at time zone 'America/Argentina/Buenos_Aires')::date)
    order by (s.contract_id is null) desc, s.valid_from desc, s.created_at desc limit 1), 'base_origin_destination_base')
$f$;

-- Resumen de un servicio para el enganche (lo que necesita el navegador para recalcular su recorrido).
create or replace function app_private.chain_service_json_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $f$
  select jsonb_build_object(
    'service_id', s.service_id, 'label', coalesce(nullif(s.service_order_number, ''), s.service_number),
    'service_number', s.service_number, 'service_order_number', s.service_order_number,
    'company_id', s.company_id, 'scheduled_for', s.scheduled_for, 'status', s.status, 'billing_status', s.billing_status,
    'origin', s.origin, 'destination', s.destination,
    'origin_lat', s.origin_lat, 'origin_lng', s.origin_lng, 'destination_lat', s.destination_lat, 'destination_lng', s.destination_lng,
    'billing_base_id', s.billing_base_id, 'base_name', b.name, 'base_lat', b.latitude, 'base_lng', b.longitude,
    'estimated_asphalt_km', s.estimated_asphalt_km, 'estimated_gravel_km', s.estimated_gravel_km,
    'estimated_distance_km', s.estimated_distance_km, 'customer_name', s.customer_name, 'vehicle_plate', s.vehicle_plate,
    'has_previous', s.chained_to_service_id is not null,
    'has_next', exists(select 1 from public.operator_services n where n.chained_to_service_id = s.service_id),
    'route_mode', app_private.chain_route_mode_v1(app_private.company_route_mode_v1(s.company_id, s.scheduled_for),
      s.chained_to_service_id is not null,
      exists(select 1 from public.operator_services n where n.chained_to_service_id = s.service_id)))
  from public.operator_services s left join public.billing_bases b on b.base_id = s.billing_base_id
  where s.service_id = p_service_id
$f$;

revoke all on function app_private.chain_route_mode_v1(text, boolean, boolean) from public, anon, authenticated;
revoke all on function app_private.company_route_mode_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function app_private.chain_service_json_v1(uuid) from public, anon, authenticated;

-- Enganche de un servicio: el anterior y el siguiente.
create or replace function public.get_operator_service_chain_v1(p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare s public.operator_services%rowtype; v_next uuid;
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para consultar servicios';
  end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  select n.service_id into v_next from public.operator_services n where n.chained_to_service_id = p_service_id;
  return jsonb_build_object(
    'service', app_private.chain_service_json_v1(p_service_id),
    'previous', case when s.chained_to_service_id is not null then app_private.chain_service_json_v1(s.chained_to_service_id) end,
    'next', case when v_next is not null then app_private.chain_service_json_v1(v_next) end,
    'company_route_mode', app_private.company_route_mode_v1(s.company_id, s.scheduled_for));
end
$f$;

-- Servicios a los que se puede enganchar: misma prestadora, de las 24 h anteriores, sin otro enganchado,
-- sin facturar ni anular; primero los que terminan más cerca de donde empieza éste.
create or replace function public.list_operator_service_chain_candidates_v1(
  p_company_id uuid, p_scheduled_for timestamptz, p_origin_lat numeric default null, p_origin_lng numeric default null,
  p_service_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para enganchar servicios';
  end if;
  if app_private.company_route_mode_v1(p_company_id, p_scheduled_for) <> 'base_origin_destination_base' then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(x.j || jsonb_build_object('gap_km', x.gap) order by x.gap nulls last, x.sched desc)
    from (
      select app_private.chain_service_json_v1(c.service_id) j, c.scheduled_for sched,
        case when p_origin_lat is not null and p_origin_lng is not null and c.destination_lat is not null and c.destination_lng is not null
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
        and c.scheduled_for between coalesce(p_scheduled_for, now()) - interval '24 hours' and coalesce(p_scheduled_for, now()) + interval '2 hours'
        and not exists(select 1 from public.operator_services n where n.chained_to_service_id = c.service_id
                       and n.service_id is distinct from p_service_id)
      order by gap nulls last, c.scheduled_for desc
      limit 10) x), '[]'::jsonb);
end
$f$;

-- Km recalculados de un servicio por cambio de enganche.
create or replace function app_private.apply_chain_km_v1(p_service_id uuid, p_km jsonb)
returns void language plpgsql security definer set search_path = '' as $f$
declare v_total numeric; v_gravel numeric; v_asphalt numeric;
begin
  if p_km is null or jsonb_typeof(p_km) <> 'object' or p_km->>'distance_km' is null then return; end if;
  v_total := round((p_km->>'distance_km')::numeric, 2);
  if v_total < 0 or v_total > 5000 then raise exception 'Kilómetros del recorrido inválidos'; end if;
  -- El ripio cargado a mano se conserva; el resto del recorrido es asfalto.
  select least(coalesce(s.estimated_gravel_km, 0), v_total) into v_gravel from public.operator_services s where s.service_id = p_service_id;
  v_asphalt := round(v_total - v_gravel, 2);
  update public.operator_services set
    estimated_asphalt_km = v_asphalt, estimated_gravel_km = v_gravel, estimated_distance_km = v_total,
    route_distance_meters = nullif(p_km->>'distance_meters', '')::integer,
    route_duration_seconds = nullif(p_km->>'duration_seconds', '')::integer,
    route_legs = case when jsonb_typeof(p_km->'legs') = 'array' then p_km->'legs' else route_legs end,
    route_polyline = coalesce(nullif(p_km->>'polyline', ''), route_polyline),
    route_calculated_at = now(), updated_by = auth.uid(), updated_at = now()
  where service_id = p_service_id;
end
$f$;
revoke all on function app_private.apply_chain_km_v1(uuid, jsonb) from public, anon, authenticated;

-- Enganchar (o desenganchar con p_previous_service_id = null). En el mismo paso guarda los km
-- recalculados del servicio anterior (p_previous_km) y, si se suelta uno, los del que queda libre (p_released_km).
create or replace function public.set_operator_service_chain_v1(
  p_service_id uuid, p_previous_service_id uuid, p_previous_km jsonb default null, p_released_km jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  s public.operator_services%rowtype;
  p public.operator_services%rowtype;
  v_old uuid;
  v_walk uuid;
  v_depth integer := 0;
  v_label text;
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para enganchar servicios';
  end if;
  perform 1 from public.operator_services x
  where x.service_id in (p_service_id, p_previous_service_id,
    (select chained_to_service_id from public.operator_services where service_id = p_service_id))
  order by x.service_id for update;

  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  v_label := coalesce(nullif(s.service_order_number, ''), s.service_number);
  v_old := s.chained_to_service_id;
  if v_old is not distinct from p_previous_service_id then
    perform app_private.apply_chain_km_v1(p_previous_service_id, p_previous_km);
    return jsonb_build_object('service_id', p_service_id, 'previous_service_id', p_previous_service_id, 'changed', false);
  end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio % ya está facturado: no se puede cambiar su enganche', v_label; end if;
  if s.status = 'cancelled' then raise exception 'El servicio % está anulado', v_label; end if;

  if v_old is not null then
    if exists(select 1 from public.operator_services o where o.service_id = v_old and o.billing_status = 'invoiced') then
      raise exception 'El servicio al que estaba enganchado ya está facturado: no se puede soltar';
    end if;
  end if;

  if p_previous_service_id is not null then
    select * into p from public.operator_services where service_id = p_previous_service_id;
    if not found then raise exception 'El servicio anterior no existe'; end if;
    if p.company_id <> s.company_id then raise exception 'Sólo se pueden enganchar servicios de la misma prestadora'; end if;
    if p.status = 'cancelled' or coalesce(p.is_test, false) <> coalesce(s.is_test, false) then raise exception 'El servicio anterior no está disponible'; end if;
    if p.billing_status = 'invoiced' then raise exception 'El servicio anterior ya está facturado: sus km no pueden cambiar'; end if;
    if app_private.company_route_mode_v1(s.company_id, s.scheduled_for) <> 'base_origin_destination_base' then
      raise exception 'La prestadora no factura Base → Origen → Destino → Base: no usa enganches';
    end if;
    if exists(select 1 from public.operator_services n where n.chained_to_service_id = p_previous_service_id and n.service_id <> p_service_id) then
      raise exception 'Ese servicio ya tiene otro servicio enganchado';
    end if;
    -- Sin ciclos: el anterior no puede venir (directa o indirectamente) de este servicio.
    v_walk := p_previous_service_id;
    while v_walk is not null and v_depth < 50 loop
      if v_walk = p_service_id then raise exception 'Ese enganche armaría un círculo de servicios'; end if;
      select chained_to_service_id into v_walk from public.operator_services where service_id = v_walk;
      v_depth := v_depth + 1;
    end loop;
  end if;

  update public.operator_services set chained_to_service_id = p_previous_service_id, updated_by = auth.uid(), updated_at = now()
  where service_id = p_service_id;
  if v_old is not null then perform app_private.apply_chain_km_v1(v_old, p_released_km); end if;
  if p_previous_service_id is not null then perform app_private.apply_chain_km_v1(p_previous_service_id, p_previous_km); end if;

  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by, details)
  values (p_service_id, case when p_previous_service_id is null then 'chain_unlinked' else 'chain_linked' end, s.status, s.status,
    case when p_previous_service_id is null then 'Servicio desenganchado' else 'Servicio enganchado al anterior' end, auth.uid(),
    jsonb_build_object('previous_service_id', p_previous_service_id, 'released_service_id', v_old));
  if p_previous_service_id is not null then
    insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by, details)
    values (p_previous_service_id, 'chain_next_linked', p.status, p.status, 'Se le enganchó el servicio ' || v_label || ': recorrido sin vuelta a la base', auth.uid(),
      jsonb_build_object('next_service_id', p_service_id, 'km', p_previous_km));
  end if;
  if v_old is not null then
    insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by, details)
    select v_old, 'chain_next_unlinked', o.status, o.status, 'Se le desenganchó el servicio ' || v_label || ': recorrido con vuelta a la base', auth.uid(),
      jsonb_build_object('next_service_id', p_service_id, 'km', p_released_km)
    from public.operator_services o where o.service_id = v_old;
  end if;
  return jsonb_build_object('service_id', p_service_id, 'previous_service_id', p_previous_service_id, 'released_service_id', v_old, 'changed', true);
end
$f$;

revoke all on function public.get_operator_service_chain_v1(uuid) from public, anon;
revoke all on function public.list_operator_service_chain_candidates_v1(uuid, timestamptz, numeric, numeric, uuid) from public, anon;
revoke all on function public.set_operator_service_chain_v1(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.get_operator_service_chain_v1(uuid) to authenticated;
grant execute on function public.list_operator_service_chain_candidates_v1(uuid, timestamptz, numeric, numeric, uuid) to authenticated;
grant execute on function public.set_operator_service_chain_v1(uuid, uuid, jsonb, jsonb) to authenticated;

-- Un servicio enganchado no se anula sin soltar el enganche: los km del otro quedarían sin la vuelta a la base.
create or replace function app_private.guard_chained_service_cancel_v1()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled'
     and (new.chained_to_service_id is not null
          or exists(select 1 from public.operator_services n where n.chained_to_service_id = new.service_id)) then
    raise exception 'El servicio % está enganchado a otro: desenganchalo antes de anularlo.',
      coalesce(nullif(new.service_order_number, ''), new.service_number);
  end if;
  return new;
end
$f$;
revoke all on function app_private.guard_chained_service_cancel_v1() from public, anon, authenticated;
drop trigger if exists operator_services_chain_cancel_guard_v1 on public.operator_services;
create trigger operator_services_chain_cancel_guard_v1
  before update of status on public.operator_services
  for each row when (new.status = 'cancelled') execute function app_private.guard_chained_service_cancel_v1();

-- Recorrido de los servicios enganchados (para el link de Google Maps del Excel de Facturación).
-- Devuelve sólo los que tienen enganche: {service_id: route_mode}.
create or replace function public.list_operator_service_chain_route_modes_v1(p_service_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para consultar servicios';
  end if;
  if coalesce(cardinality(p_service_ids), 0) > 2000 then raise exception 'Demasiados servicios'; end if;
  return coalesce((
    select jsonb_object_agg(s.service_id::text, app_private.chain_route_mode_v1(
      app_private.company_route_mode_v1(s.company_id, s.scheduled_for), s.chained_to_service_id is not null,
      exists(select 1 from public.operator_services n where n.chained_to_service_id = s.service_id)))
    from public.operator_services s
    where s.service_id = any(p_service_ids)
      and (s.chained_to_service_id is not null or exists(select 1 from public.operator_services n where n.chained_to_service_id = s.service_id))
  ), '{}'::jsonb);
end
$f$;
revoke all on function public.list_operator_service_chain_route_modes_v1(uuid[]) from public, anon;
grant execute on function public.list_operator_service_chain_route_modes_v1(uuid[]) to authenticated;
