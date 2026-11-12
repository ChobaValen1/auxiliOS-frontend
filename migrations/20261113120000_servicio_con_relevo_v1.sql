-- Servicio con relevo (v1)
-- Un mismo servicio lo hacen dos choferes: el 1º lleva el vehículo del cliente del origen (A) al punto de
-- intercambio (B) y el 2º, con otro móvil, lo lleva de B al destino (C). Es UN servicio y UN remito.
--   · El 2º chofer ve el servicio desde que se carga (get_driver_relay_state_v1) y va hacia B.
--   · El móvil del 2º chofer NO se elige: es el de su jornada activa (se toma al entregar el vehículo).
--   · Cuando el 1º marca «Entregué el vehículo», el servicio pasa al 2º (misma reasignación de siempre:
--     el historial de asignaciones queda guardado por el trigger existente).
--   · El 1º chofer no crea remito (un trigger lo impide hasta la entrega).
--   · Sueldos: el servicio completado cuenta para los dos choferes (completed_driver_services_v2).
-- Es aditivo: los servicios sin relevo no cambian.

create table if not exists public.operator_service_relays (
  service_id uuid primary key references public.operator_services(service_id) on delete cascade,
  exchange_address text not null check (btrim(exchange_address) <> ''),
  exchange_lat numeric not null check (exchange_lat between -85 and 85),
  exchange_lng numeric not null check (exchange_lng between -180 and 180),
  exchange_place_id text,
  to_driver_id uuid not null references public.users(user_id),
  -- Móvil de la jornada activa del 2º chofer: se completa al entregar (antes se muestra el de su jornada de hoy).
  to_truck_id integer references public.trucks(truck_id),
  -- Se completan al entregar: quién llevó el primer tramo.
  from_driver_id uuid references public.users(user_id),
  from_truck_id integer references public.trucks(truck_id),
  handed_over_at timestamptz,
  handed_over_by uuid references public.users(user_id),
  handover_source text check (handover_source in ('driver', 'operator')),
  created_by uuid references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_driver_id is null or from_driver_id <> to_driver_id),
  check ((handed_over_at is null) = (from_driver_id is null))
);
create index if not exists operator_service_relays_to_driver_idx on public.operator_service_relays(to_driver_id) where handed_over_at is null;
create index if not exists operator_service_relays_from_driver_idx on public.operator_service_relays(from_driver_id) where from_driver_id is not null;
alter table public.operator_service_relays enable row level security;
revoke all on public.operator_service_relays from public, anon, authenticated;

-- El 1º chofer no crea viaje ni remito mientras el relevo no se entregó (lo hace el 2º).
create or replace function app_private.relay_block_first_driver_remito_v1()
returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  if (new.trip_id is distinct from old.trip_id and new.trip_id is not null)
     or (new.remito_id is distinct from old.remito_id and new.remito_id is not null) then
    if exists (select 1 from public.operator_service_relays r where r.service_id = new.service_id and r.handed_over_at is null) then
      raise exception 'RELEVO_PENDIENTE: este servicio tiene relevo; el remito lo crea el segundo chofer después de la entrega del vehículo';
    end if;
  end if;
  return new;
end $f$;
revoke all on function app_private.relay_block_first_driver_remito_v1() from public, anon, authenticated;
drop trigger if exists operator_services_relay_remito_guard_v1 on public.operator_services;
create trigger operator_services_relay_remito_guard_v1
before update of trip_id, remito_id on public.operator_services
for each row execute function app_private.relay_block_first_driver_remito_v1();

-- Móvil de la jornada activa de un chofer (la última abierta); null si no inició jornada.
create or replace function app_private.relay_receiver_truck_v1(p_driver uuid)
returns integer language sql stable security definer set search_path = '' as $f$
  select dl.truck_id from public.daily_logs dl
  where dl.driver_id = p_driver and coalesce(dl.status, 'open') = 'open' and dl.hora_fin is null and dl.truck_id is not null
  order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc limit 1
$f$;
revoke all on function app_private.relay_receiver_truck_v1(uuid) from public, anon, authenticated;

-- Datos del relevo para pantallas (nombres de choferes y móviles incluidos).
create or replace function app_private.relay_json_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $f$
  select jsonb_build_object(
    'service_id', r.service_id,
    'exchange_address', r.exchange_address, 'exchange_lat', r.exchange_lat, 'exchange_lng', r.exchange_lng,
    'exchange_place_id', r.exchange_place_id,
    'to_driver_id', r.to_driver_id, 'to_driver_name', tu.full_name,
    'to_truck_id', tt.truck_id, 'to_truck_label', coalesce(tt.numero_interno::text, tt.plate), 'to_truck_plate', tt.plate,
    'to_has_active_jornada', aj.truck_id is not null,
    -- Antes de entregar, el 1º chofer es el que tiene el servicio asignado.
    'from_driver_id', coalesce(r.from_driver_id, s.assigned_driver_id), 'from_driver_name', fu.full_name,
    'from_truck_id', coalesce(r.from_truck_id, s.assigned_truck_id), 'from_truck_label', coalesce(ft.numero_interno::text, ft.plate), 'from_truck_plate', ft.plate,
    'handed_over', r.handed_over_at is not null, 'handed_over_at', r.handed_over_at, 'handover_source', r.handover_source)
  from public.operator_service_relays r
  join public.operator_services s on s.service_id = r.service_id
  left join public.users tu on tu.user_id = r.to_driver_id
  left join lateral (select app_private.relay_receiver_truck_v1(r.to_driver_id) as truck_id) aj on true
  left join public.trucks tt on tt.truck_id = coalesce(r.to_truck_id, aj.truck_id)
  left join public.users fu on fu.user_id = coalesce(r.from_driver_id, s.assigned_driver_id)
  left join public.trucks ft on ft.truck_id = coalesce(r.from_truck_id, s.assigned_truck_id)
  where r.service_id = p_service_id
$f$;
revoke all on function app_private.relay_json_v1(uuid) from public, anon, authenticated;

-- Chofer válido para recibir el servicio (mismas reglas que la reasignación).
create or replace function app_private.relay_check_receiver_v1(p_driver uuid)
returns void language plpgsql stable security definer set search_path = '' as $f$
begin
  if p_driver is null then raise exception 'Seleccioná el chofer que recibe el vehículo'; end if;
  if not exists (select 1 from public.users u join public.roles r on r.role_id = u.role_id
                 where u.user_id = p_driver and coalesce(u.is_active, true) and r.name = 'chofer') then
    raise exception 'Chofer inválido o inactivo';
  end if;
end $f$;
revoke all on function app_private.relay_check_receiver_v1(uuid) from public, anon, authenticated;

-- Operaciones: móvil de la jornada activa del chofer que recibe (para mostrarlo en el formulario).
create or replace function public.get_relay_receiver_truck_v1(p_driver_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_truck integer; t public.trucks%rowtype; v_since timestamptz;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'supervision') then
    raise exception 'Sin permiso para consultar jornadas';
  end if;
  v_truck := app_private.relay_receiver_truck_v1(p_driver_id);
  if v_truck is null then return jsonb_build_object('driver_id', p_driver_id, 'has_active_jornada', false); end if;
  select * into t from public.trucks where truck_id = v_truck;
  select dl.hora_inicio into v_since from public.daily_logs dl
   where dl.driver_id = p_driver_id and dl.truck_id = v_truck and coalesce(dl.status, 'open') = 'open' and dl.hora_fin is null
   order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc limit 1;
  return jsonb_build_object('driver_id', p_driver_id, 'has_active_jornada', true, 'truck_id', t.truck_id,
    'truck_label', coalesce(t.numero_interno::text, t.plate), 'truck_plate', t.plate, 'since', v_since);
end $f$;

-- Operador / Administración: cargar o cambiar el relevo de un servicio.
create or replace function public.set_operator_service_relay_v1(
  p_service_id uuid, p_exchange_address text, p_exchange_lat numeric, p_exchange_lng numeric, p_exchange_place_id text,
  p_to_driver_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare s public.operator_services%rowtype; v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para cargar el relevo del servicio';
  end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('pending', 'assigned', 'at_origin') then raise exception 'El servicio ya está cerrado: no se puede cargar un relevo'; end if;
  if coalesce(s.logistics_type, 'own') <> 'own' then raise exception 'El relevo es sólo para servicios con móvil propio'; end if;
  if coalesce(s.driver_activated, false) then raise exception 'Un servicio activado por el chofer no admite relevo'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya está facturado'; end if;
  if exists (select 1 from public.operator_service_relays r where r.service_id = p_service_id and r.handed_over_at is not null) then
    raise exception 'El vehículo ya se entregó: el relevo no se puede modificar';
  end if;
  if nullif(btrim(coalesce(p_exchange_address, '')), '') is null then raise exception 'Cargá la dirección del punto de intercambio'; end if;
  if p_exchange_lat is null or p_exchange_lng is null or abs(p_exchange_lat) > 85 or abs(p_exchange_lng) > 180 then
    raise exception 'Elegí el punto de intercambio con el buscador para ubicarlo en el mapa';
  end if;
  perform app_private.relay_check_receiver_v1(p_to_driver_id);
  if s.assigned_driver_id is not null and s.assigned_driver_id = p_to_driver_id then raise exception 'El chofer que recibe tiene que ser distinto del que lo retira'; end if;
  -- El móvil es el de la jornada activa del 2º chofer: no puede ser el mismo que usa el 1º.
  if s.assigned_truck_id is not null and s.assigned_truck_id = app_private.relay_receiver_truck_v1(p_to_driver_id) then
    raise exception 'El móvil de la jornada del chofer que recibe es el mismo que el del primer tramo';
  end if;

  insert into public.operator_service_relays(service_id, exchange_address, exchange_lat, exchange_lng, exchange_place_id, to_driver_id, created_by)
  values (p_service_id, btrim(p_exchange_address), p_exchange_lat, p_exchange_lng, nullif(btrim(coalesce(p_exchange_place_id, '')), ''), p_to_driver_id, v_uid)
  on conflict (service_id) do update set exchange_address = excluded.exchange_address, exchange_lat = excluded.exchange_lat,
    exchange_lng = excluded.exchange_lng, exchange_place_id = excluded.exchange_place_id, to_driver_id = excluded.to_driver_id,
    updated_at = now();
  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by)
  values (p_service_id, 'relay_set', s.status, s.status, 'Relevo en ' || btrim(p_exchange_address), v_uid);
  return app_private.relay_json_v1(p_service_id);
end $f$;

-- Quitar el relevo (sólo si todavía no se entregó el vehículo).
create or replace function public.remove_operator_service_relay_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare v_uid uuid := auth.uid(); r public.operator_service_relays%rowtype;
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para quitar el relevo del servicio';
  end if;
  select * into r from public.operator_service_relays where service_id = p_service_id for update;
  if not found then return jsonb_build_object('service_id', p_service_id, 'removed', false); end if;
  if r.handed_over_at is not null then raise exception 'El vehículo ya se entregó: el relevo no se puede quitar'; end if;
  delete from public.operator_service_relays where service_id = p_service_id;
  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (p_service_id, 'relay_removed', 'Relevo quitado', v_uid);
  return jsonb_build_object('service_id', p_service_id, 'removed', true);
end $f$;

-- Relevo de un servicio: Operaciones lo ve siempre; un chofer, sólo si participa.
create or replace function public.get_operator_service_relay_v1(p_service_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_role text := coalesce(app_private.current_auxilios_role(), ''); v_uid uuid := auth.uid(); r public.operator_service_relays%rowtype; s public.operator_services%rowtype;
begin
  if v_uid is null then raise exception 'Sin permiso'; end if;
  select * into r from public.operator_service_relays where service_id = p_service_id;
  if not found then return null; end if;
  if v_role in ('administracion', 'operador', 'supervision', 'facturacion') then
    return app_private.relay_json_v1(p_service_id);
  end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if v_role = 'chofer' and (r.to_driver_id = v_uid or r.from_driver_id = v_uid or s.assigned_driver_id = v_uid) then
    return app_private.relay_json_v1(p_service_id);
  end if;
  raise exception 'Sin permiso';
end $f$;

-- Relevos de varios servicios (tablas, mapa y facturación): { service_id: {...} }.
create or replace function public.list_operator_service_relays_v1(p_service_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'supervision', 'facturacion') then
    raise exception 'Sin permiso para consultar servicios';
  end if;
  if coalesce(cardinality(p_service_ids), 0) > 2000 then raise exception 'Demasiados servicios'; end if;
  return coalesce((select jsonb_object_agg(r.service_id::text, app_private.relay_json_v1(r.service_id))
                   from public.operator_service_relays r where r.service_id = any(p_service_ids)), '{}'::jsonb);
end $f$;

-- Tarjeta de un servicio con relevo para la app del chofer: relevo + lo que hace falta mostrar sin abrir el servicio.
create or replace function app_private.relay_card_json_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $f$
  select app_private.relay_json_v1(s.service_id) || jsonb_build_object(
    'label', coalesce(nullif(s.service_order_number, ''), s.service_number), 'status', s.status, 'scheduled_for', s.scheduled_for,
    'vehicle_plate', s.vehicle_plate, 'vehicle_make_model', s.vehicle_make_model,
    'destination', coalesce(s.destination_formatted_address, s.destination), 'destination_lat', s.destination_lat, 'destination_lng', s.destination_lng)
  from public.operator_services s where s.service_id = p_service_id
$f$;
revoke all on function app_private.relay_card_json_v1(uuid) from public, anon, authenticated;

-- App del chofer: sus relevos en tres grupos.
--   incoming: es el 2º chofer y todavía no le entregaron el vehículo (ve el servicio desde antes y va hacia B).
--   outgoing: es el 1º chofer y todavía tiene que entregar el vehículo en B.
--   received: es el 2º chofer y ya recibió el vehículo (el servicio es suyo y sigue hacia C).
create or replace function public.get_driver_relay_state_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(), '') <> 'chofer' then
    raise exception 'Sólo choferes pueden consultar sus relevos';
  end if;
  return jsonb_build_object(
    'incoming', coalesce((select jsonb_agg(app_private.relay_card_json_v1(s.service_id) order by s.scheduled_for)
      from public.operator_service_relays r join public.operator_services s on s.service_id = r.service_id
      where r.to_driver_id = v_uid and r.handed_over_at is null and s.status in ('assigned', 'at_origin') and s.assigned_driver_id is not null), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(app_private.relay_card_json_v1(s.service_id) order by s.scheduled_for)
      from public.operator_service_relays r join public.operator_services s on s.service_id = r.service_id
      where s.assigned_driver_id = v_uid and r.handed_over_at is null and s.status in ('assigned', 'at_origin')), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(app_private.relay_card_json_v1(s.service_id) order by s.scheduled_for)
      from public.operator_service_relays r join public.operator_services s on s.service_id = r.service_id
      where r.to_driver_id = v_uid and r.handed_over_at is not null and s.assigned_driver_id = v_uid and s.status in ('assigned', 'at_origin')), '[]'::jsonb));
end $f$;

-- Entrega del vehículo en el punto B: la marca el 1º chofer (o Operaciones si no puede) y el servicio pasa al 2º.
create or replace function public.mark_operator_service_relay_handover_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), ''); v_uid uuid := auth.uid();
  s public.operator_services%rowtype; r public.operator_service_relays%rowtype; v_from_driver uuid; v_from_truck integer; v_to_truck integer; v_to_name text;
begin
  if v_uid is null or v_role not in ('chofer', 'operador', 'administracion') then raise exception 'Sin permiso para entregar el vehículo'; end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  select * into r from public.operator_service_relays where service_id = p_service_id for update;
  if not found then raise exception 'Este servicio no tiene relevo'; end if;
  if v_role = 'chofer' and s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este chofer'; end if;
  if r.handed_over_at is not null then raise exception 'El vehículo ya se entregó'; end if;
  if s.status not in ('assigned', 'at_origin') then raise exception 'El servicio no está en curso'; end if;
  if s.assigned_driver_id is null or s.assigned_truck_id is null then raise exception 'El servicio no tiene chofer y móvil asignados'; end if;
  if s.trip_id is not null or s.remito_id is not null then raise exception 'El servicio ya tiene un remito: no se puede entregar el vehículo'; end if;
  perform app_private.relay_check_receiver_v1(r.to_driver_id);
  -- El vehículo pasa al móvil de la jornada activa del 2º chofer.
  v_to_truck := app_private.relay_receiver_truck_v1(r.to_driver_id);
  if v_to_truck is null then
    select u.full_name into v_to_name from public.users u where u.user_id = r.to_driver_id;
    raise exception 'RELEVO_SIN_JORNADA: % todavía no inició su jornada con un móvil; tiene que iniciarla para recibir el vehículo', coalesce(v_to_name, 'El chofer que recibe');
  end if;
  if v_to_truck = s.assigned_truck_id then raise exception 'El móvil de la jornada del chofer que recibe es el mismo que el del primer tramo'; end if;
  if not exists (select 1 from public.trucks t where t.truck_id = v_to_truck and t.status = 'active') then raise exception 'Móvil inválido o inactivo'; end if;

  v_from_driver := s.assigned_driver_id; v_from_truck := s.assigned_truck_id;
  update public.operator_service_relays
  set from_driver_id = v_from_driver, from_truck_id = v_from_truck, to_truck_id = v_to_truck, handed_over_at = now(), handed_over_by = v_uid,
      handover_source = case when v_role = 'chofer' then 'driver' else 'operator' end, updated_at = now()
  where service_id = p_service_id;

  -- Igual que reassign_operator_service: el trigger de asignaciones guarda al 1º chofer en el historial.
  perform set_config('app.phase3_bridge', '1', true);
  perform set_config('app.assignment_reason', 'relay_handover', true);
  perform set_config('app.assignment_notes', 'Entrega del vehículo en ' || r.exchange_address, true);
  update public.operator_services
  set assigned_driver_id = r.to_driver_id, assigned_truck_id = v_to_truck, assigned_at = now(), assigned_by = v_uid,
      status = 'assigned', updated_by = v_uid
  where service_id = p_service_id;

  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by)
  values (p_service_id, 'relay_handover', s.status, 'assigned', 'Entrega del vehículo en ' || r.exchange_address, v_uid);
  return app_private.relay_json_v1(p_service_id);
end $f$;

-- Sueldos: el servicio completado cuenta para el chofer del 2º tramo (como siempre) y también para el del 1º.
create or replace function app_private.completed_driver_services_v2()
returns table(service_id uuid, driver_id uuid, completed_at timestamptz, remito_id integer)
language sql stable security definer set search_path to '' as $f$
  with own as (
    select s.service_id,
      coalesce(r.driver_id,
        case when s.driver_activated then s.activation_driver_id end,
        s.assigned_driver_id, a.driver_id) as driver_id, s.completed_at, r.remito_id
    from public.operator_services s
    left join lateral (
      select x.driver_id,x.remito_id from public.remitos x
      where (x.operator_service_id=s.service_id or x.remito_id=s.remito_id) and x.status='firmado'
      order by x.firmado_at desc nulls last,x.remito_id desc limit 1
    ) r on true
    left join lateral (
      select x.driver_id from public.operator_service_assignments x
      where x.service_id=s.service_id and x.driver_id is not null and x.assigned_at<=s.completed_at
      order by x.assigned_at desc,x.assignment_sequence desc nulls last,x.assignment_id desc limit 1
    ) a on true
    where s.status='completed' and s.logistics_type='own' and s.completed_at is not null
      -- Preserve the existing rule: Activado Movida is not a payable service.
      and not (coalesce(s.driver_activated,false) and coalesce(s.activation_kind,'')='movement')
  )
  select o.service_id, o.driver_id, o.completed_at, o.remito_id from own o
  union all
  select o.service_id, rl.from_driver_id, o.completed_at, o.remito_id
  from own o join public.operator_service_relays rl on rl.service_id = o.service_id
  where rl.handed_over_at is not null and rl.from_driver_id is not null and rl.from_driver_id is distinct from o.driver_id;
$f$;
revoke all on function app_private.completed_driver_services_v2() from public,anon,authenticated;

revoke all on function public.set_operator_service_relay_v1(uuid, text, numeric, numeric, text, uuid) from public, anon;
revoke all on function public.get_relay_receiver_truck_v1(uuid) from public, anon;
revoke all on function public.remove_operator_service_relay_v1(uuid) from public, anon;
revoke all on function public.get_operator_service_relay_v1(uuid) from public, anon;
revoke all on function public.list_operator_service_relays_v1(uuid[]) from public, anon;
revoke all on function public.get_driver_relay_state_v1() from public, anon;
revoke all on function public.mark_operator_service_relay_handover_v1(uuid) from public, anon;
grant execute on function public.set_operator_service_relay_v1(uuid, text, numeric, numeric, text, uuid) to authenticated;
grant execute on function public.get_relay_receiver_truck_v1(uuid) to authenticated;
grant execute on function public.remove_operator_service_relay_v1(uuid) to authenticated;
grant execute on function public.get_operator_service_relay_v1(uuid) to authenticated;
grant execute on function public.list_operator_service_relays_v1(uuid[]) to authenticated;
grant execute on function public.get_driver_relay_state_v1() to authenticated;
grant execute on function public.mark_operator_service_relay_handover_v1(uuid) to authenticated;
