-- AuxiliOS · Edición auditada de servicios abiertos + módulo de peajes

create table if not exists public.operator_service_changes (
  change_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  service_status text not null,
  trip_id integer references public.trips(trip_id) on delete set null,
  remito_id integer references public.remitos(remito_id) on delete set null,
  changed_fields text[] not null default '{}'::text[],
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  change_reason text,
  changed_by uuid not null references public.users(user_id) on delete restrict,
  changed_at timestamptz not null default now(),
  is_test boolean not null default false
);

create index if not exists operator_service_changes_service_idx
  on public.operator_service_changes(service_id, changed_at desc);
create index if not exists operator_service_changes_changed_by_idx
  on public.operator_service_changes(changed_by, changed_at desc);
create index if not exists operator_service_changes_trip_idx
  on public.operator_service_changes(trip_id)
  where trip_id is not null;
create index if not exists operator_service_changes_remito_idx
  on public.operator_service_changes(remito_id)
  where remito_id is not null;

create table if not exists public.toll_locations (
  toll_id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  road text,
  km_marker text,
  direction text not null default 'both',
  concessionaire text,
  province text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.users(user_id) on delete restrict,
  updated_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint toll_locations_code_not_blank check (btrim(code) <> ''),
  constraint toll_locations_name_not_blank check (btrim(name) <> ''),
  constraint toll_locations_direction_check check (
    direction in ('both','inbound','outbound','north','south','east','west','clockwise','counterclockwise','other')
  ),
  constraint toll_locations_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint toll_locations_longitude_check check (longitude is null or longitude between -180 and 180)
);

create unique index if not exists toll_locations_code_uidx
  on public.toll_locations(lower(code));
create index if not exists toll_locations_active_name_idx
  on public.toll_locations(is_active, name);
create index if not exists toll_locations_created_by_idx
  on public.toll_locations(created_by);
create index if not exists toll_locations_updated_by_idx
  on public.toll_locations(updated_by);

create table if not exists public.toll_rates (
  toll_rate_id uuid primary key default gen_random_uuid(),
  toll_id uuid not null references public.toll_locations(toll_id) on delete cascade,
  vehicle_category text not null default 'light_2_axles',
  payment_method text not null default 'any',
  amount numeric(14,2) not null,
  currency text not null default 'ARS',
  valid_from date not null,
  valid_until date,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint toll_rates_category_not_blank check (btrim(vehicle_category) <> ''),
  constraint toll_rates_payment_method_check check (
    payment_method in ('any','cash','electronic','telepass','manual')
  ),
  constraint toll_rates_amount_check check (amount >= 0),
  constraint toll_rates_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint toll_rates_dates_check check (valid_until is null or valid_until >= valid_from),
  unique (toll_id, vehicle_category, payment_method, valid_from)
);

create index if not exists toll_rates_lookup_idx
  on public.toll_rates(toll_id, vehicle_category, payment_method, valid_from desc);
create index if not exists toll_rates_active_validity_idx
  on public.toll_rates(is_active, valid_from, valid_until);
create index if not exists toll_rates_created_by_idx
  on public.toll_rates(created_by);

create table if not exists public.operator_service_tolls (
  service_toll_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  toll_id uuid references public.toll_locations(toll_id) on delete set null,
  toll_rate_id uuid references public.toll_rates(toll_rate_id) on delete set null,
  toll_code_snapshot text,
  toll_name_snapshot text not null,
  road_snapshot text,
  direction_snapshot text,
  vehicle_category text not null default 'light_2_axles',
  payment_method text not null default 'any',
  quantity integer not null default 1,
  unit_amount numeric(14,2) not null,
  total_amount numeric(14,2) generated always as (round(unit_amount * quantity, 2)) stored,
  currency text not null default 'ARS',
  source text not null default 'planned',
  crossed_at timestamptz,
  notes text,
  created_by uuid not null references public.users(user_id) on delete restrict,
  updated_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_test boolean not null default false,
  constraint operator_service_tolls_name_not_blank check (btrim(toll_name_snapshot) <> ''),
  constraint operator_service_tolls_category_not_blank check (btrim(vehicle_category) <> ''),
  constraint operator_service_tolls_payment_method_check check (
    payment_method in ('any','cash','electronic','telepass','manual')
  ),
  constraint operator_service_tolls_quantity_check check (quantity > 0),
  constraint operator_service_tolls_amount_check check (unit_amount >= 0),
  constraint operator_service_tolls_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint operator_service_tolls_source_check check (source in ('planned','actual','manual'))
);

create index if not exists operator_service_tolls_service_idx
  on public.operator_service_tolls(service_id, source, created_at);
create index if not exists operator_service_tolls_toll_idx
  on public.operator_service_tolls(toll_id)
  where toll_id is not null;
create index if not exists operator_service_tolls_rate_idx
  on public.operator_service_tolls(toll_rate_id)
  where toll_rate_id is not null;
create index if not exists operator_service_tolls_created_by_idx
  on public.operator_service_tolls(created_by);
create index if not exists operator_service_tolls_updated_by_idx
  on public.operator_service_tolls(updated_by);

alter table public.operator_service_changes enable row level security;
alter table public.toll_locations enable row level security;
alter table public.toll_rates enable row level security;
alter table public.operator_service_tolls enable row level security;

drop policy if exists operator_service_changes_management_read on public.operator_service_changes;
create policy operator_service_changes_management_read
  on public.operator_service_changes
  for select
  to authenticated
  using (app_private.current_auxilios_role() in ('administracion','operador','supervision','facturacion'));

drop policy if exists toll_locations_management_read on public.toll_locations;
create policy toll_locations_management_read
  on public.toll_locations
  for select
  to authenticated
  using (app_private.current_auxilios_role() in ('administracion','operador','supervision','facturacion'));

drop policy if exists toll_rates_management_read on public.toll_rates;
create policy toll_rates_management_read
  on public.toll_rates
  for select
  to authenticated
  using (app_private.current_auxilios_role() in ('administracion','operador','supervision','facturacion'));

drop policy if exists operator_service_tolls_management_read on public.operator_service_tolls;
create policy operator_service_tolls_management_read
  on public.operator_service_tolls
  for select
  to authenticated
  using (app_private.current_auxilios_role() in ('administracion','operador','supervision','facturacion'));

revoke all on table public.operator_service_changes from public, anon, authenticated;
revoke all on table public.toll_locations from public, anon, authenticated;
revoke all on table public.toll_rates from public, anon, authenticated;
revoke all on table public.operator_service_tolls from public, anon, authenticated;

grant select on table public.operator_service_changes to authenticated;
grant select on table public.toll_locations to authenticated;
grant select on table public.toll_rates to authenticated;
grant select on table public.operator_service_tolls to authenticated;

alter table public.operator_service_items
  drop constraint if exists operator_service_items_price_source_check;
alter table public.operator_service_items
  add constraint operator_service_items_price_source_check
  check (price_source in ('general','branch','billing_base','link_override','price_version'));

create or replace function app_private.sync_operator_service_items_from_quote(
  p_service_id uuid,
  p_quote jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_component jsonb;
  v_codes jsonb := '{}'::jsonb;
  v_role text;
  v_key text;
  v_source text;
  v_sort integer := 0;
begin
  select coalesce(
    jsonb_object_agg(concept_id::text || ':' || item_role, instance_code),
    '{}'::jsonb
  )
  into v_codes
  from public.operator_service_items
  where service_id = p_service_id;

  delete from public.operator_service_items
  where service_id = p_service_id
    and item_role in ('primary','distance','secondary');

  for v_component in
    select value
    from jsonb_array_elements(coalesce(p_quote->'components', '[]'::jsonb))
  loop
    v_role := case
      when v_component->>'role' = 'distance' then 'distance'
      when v_component->>'role' = 'secondary' then 'secondary'
      else 'primary'
    end;
    v_key := (v_component->>'concept_id') || ':' || v_role;
    v_source := coalesce(nullif(v_component->>'price_source', ''), 'general');
    if v_source not in ('general','branch','billing_base','link_override','price_version') then
      v_source := 'general';
    end if;

    insert into public.operator_service_items(
      service_id,
      concept_id,
      rate_item_id,
      item_role,
      service_code,
      instance_code,
      service_name,
      pricing_unit,
      quantity,
      unit_price,
      subtotal,
      price_source,
      snapshot,
      sort_order
    )
    values (
      p_service_id,
      (v_component->>'concept_id')::uuid,
      nullif(v_component->>'rate_item_id', '')::uuid,
      v_role,
      coalesce(nullif(v_component->>'service_code', ''), 'SERVICIO'),
      nullif(v_codes->>v_key, ''),
      coalesce(nullif(v_component->>'service_name', ''), 'Servicio'),
      coalesce(nullif(v_component->>'pricing_unit', ''), 'service'),
      greatest(coalesce(nullif(v_component->>'quantity', '')::numeric, 1), 0.01),
      greatest(coalesce(nullif(v_component->>'unit_price', '')::numeric, 0), 0),
      greatest(coalesce(nullif(v_component->>'subtotal', '')::numeric, 0), 0),
      v_source,
      v_component,
      v_sort
    );

    v_sort := v_sort + 10;
  end loop;
end;
$function$;

revoke all on function app_private.sync_operator_service_items_from_quote(uuid, jsonb)
  from public, anon, authenticated;

create or replace function public.list_toll_catalog(
  p_as_of date default current_date,
  p_include_inactive boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar peajes';
  end if;

  select coalesce(jsonb_agg(row_data order by name), '[]'::jsonb)
  into v_result
  from (
    select
      l.name,
      jsonb_build_object(
        'toll_id', l.toll_id,
        'code', l.code,
        'name', l.name,
        'road', l.road,
        'km_marker', l.km_marker,
        'direction', l.direction,
        'concessionaire', l.concessionaire,
        'province', l.province,
        'latitude', l.latitude,
        'longitude', l.longitude,
        'notes', l.notes,
        'is_active', l.is_active,
        'rates', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'toll_rate_id', r.toll_rate_id,
              'vehicle_category', r.vehicle_category,
              'payment_method', r.payment_method,
              'amount', r.amount,
              'currency', r.currency,
              'valid_from', r.valid_from,
              'valid_until', r.valid_until,
              'notes', r.notes,
              'is_active', r.is_active,
              'is_current', r.is_active
                and r.valid_from <= coalesce(p_as_of, current_date)
                and (r.valid_until is null or r.valid_until >= coalesce(p_as_of, current_date))
            )
            order by r.vehicle_category, r.payment_method, r.valid_from desc
          )
          from public.toll_rates r
          where r.toll_id = l.toll_id
            and (p_include_inactive or r.is_active)
        ), '[]'::jsonb)
      ) as row_data
    from public.toll_locations l
    where p_include_inactive or l.is_active
  ) q;

  return v_result;
end;
$function$;

revoke all on function public.list_toll_catalog(date, boolean) from public, anon;
grant execute on function public.list_toll_catalog(date, boolean) to authenticated;

create or replace function public.save_toll_location(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'toll_id', '')::uuid;
  v_code text := upper(coalesce(nullif(btrim(p_payload->>'code'), ''), ''));
  v_name text := coalesce(nullif(btrim(p_payload->>'name'), ''), '');
  v_direction text := lower(coalesce(nullif(btrim(p_payload->>'direction'), ''), 'both'));
  v_row public.toll_locations%rowtype;
begin
  if v_uid is null or v_role <> 'administracion' then
    raise exception 'Solo administración puede gestionar el catálogo de peajes';
  end if;
  if v_code = '' or v_name = '' then
    raise exception 'Código y nombre son obligatorios';
  end if;
  if v_direction not in ('both','inbound','outbound','north','south','east','west','clockwise','counterclockwise','other') then
    raise exception 'Sentido de peaje inválido';
  end if;

  if v_id is null then
    insert into public.toll_locations(
      code, name, road, km_marker, direction, concessionaire, province,
      latitude, longitude, notes, is_active, created_by, updated_by
    )
    values (
      v_code,
      v_name,
      nullif(btrim(p_payload->>'road'), ''),
      nullif(btrim(p_payload->>'km_marker'), ''),
      v_direction,
      nullif(btrim(p_payload->>'concessionaire'), ''),
      nullif(btrim(p_payload->>'province'), ''),
      nullif(p_payload->>'latitude', '')::numeric,
      nullif(p_payload->>'longitude', '')::numeric,
      nullif(btrim(p_payload->>'notes'), ''),
      coalesce((p_payload->>'is_active')::boolean, true),
      v_uid,
      v_uid
    )
    returning * into v_row;
  else
    update public.toll_locations
    set code = v_code,
        name = v_name,
        road = nullif(btrim(p_payload->>'road'), ''),
        km_marker = nullif(btrim(p_payload->>'km_marker'), ''),
        direction = v_direction,
        concessionaire = nullif(btrim(p_payload->>'concessionaire'), ''),
        province = nullif(btrim(p_payload->>'province'), ''),
        latitude = nullif(p_payload->>'latitude', '')::numeric,
        longitude = nullif(p_payload->>'longitude', '')::numeric,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        is_active = case
          when p_payload ? 'is_active' then (p_payload->>'is_active')::boolean
          else is_active
        end,
        updated_by = v_uid,
        updated_at = now()
    where toll_id = v_id
    returning * into v_row;

    if not found then
      raise exception 'Peaje inexistente';
    end if;
  end if;

  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.save_toll_location(jsonb) from public, anon;
grant execute on function public.save_toll_location(jsonb) to authenticated;

create or replace function public.save_toll_rate(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_toll_id uuid := nullif(p_payload->>'toll_id', '')::uuid;
  v_category text := lower(coalesce(nullif(btrim(p_payload->>'vehicle_category'), ''), 'light_2_axles'));
  v_payment text := lower(coalesce(nullif(btrim(p_payload->>'payment_method'), ''), 'any'));
  v_amount numeric := coalesce(nullif(p_payload->>'amount', '')::numeric, -1);
  v_currency text := upper(coalesce(nullif(btrim(p_payload->>'currency'), ''), 'ARS'));
  v_from date := coalesce(nullif(p_payload->>'valid_from', '')::date, current_date);
  v_until date := nullif(p_payload->>'valid_until', '')::date;
  v_row public.toll_rates%rowtype;
begin
  if v_uid is null or v_role <> 'administracion' then
    raise exception 'Solo administración puede gestionar los importes de peajes';
  end if;
  if v_toll_id is null or not exists (
    select 1 from public.toll_locations where toll_id = v_toll_id
  ) then
    raise exception 'Seleccioná un peaje válido';
  end if;
  if v_amount < 0 then
    raise exception 'El importe no puede ser negativo';
  end if;
  if v_payment not in ('any','cash','electronic','telepass','manual') then
    raise exception 'Modalidad de pago inválida';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Moneda inválida';
  end if;
  if v_until is not null and v_until < v_from then
    raise exception 'La vigencia hasta no puede ser anterior a la vigencia desde';
  end if;

  update public.toll_rates
  set valid_until = v_from - 1,
      is_active = case when v_from <= current_date then false else is_active end
  where toll_id = v_toll_id
    and vehicle_category = v_category
    and payment_method = v_payment
    and valid_from < v_from
    and (valid_until is null or valid_until >= v_from);

  insert into public.toll_rates(
    toll_id, vehicle_category, payment_method, amount, currency,
    valid_from, valid_until, notes, is_active, created_by
  )
  values (
    v_toll_id,
    v_category,
    v_payment,
    round(v_amount, 2),
    v_currency,
    v_from,
    v_until,
    nullif(btrim(p_payload->>'notes'), ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    v_uid
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.save_toll_rate(jsonb) from public, anon;
grant execute on function public.save_toll_rate(jsonb) to authenticated;

create or replace function public.get_operator_service_edit_context(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_remito_status text;
  v_remito_signed_at timestamptz;
  v_tolls jsonb;
  v_changes jsonb;
  v_company_name text;
  v_concept_name text;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la edición del servicio';
  end if;

  select * into v_service
  from public.operator_services
  where service_id = p_service_id;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_service.remito_id is not null then
    select status, firmado_at
    into v_remito_status, v_remito_signed_at
    from public.remitos
    where remito_id = v_service.remito_id;
  end if;

  select coalesce(c.trade_name, c.legal_name)
  into v_company_name
  from public.companies c
  where c.company_id = v_service.company_id;

  select sc.name
  into v_concept_name
  from public.service_concepts sc
  where sc.concept_id = v_service.primary_concept_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
  into v_tolls
  from public.operator_service_tolls t
  where t.service_id = p_service_id;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.changed_at desc), '[]'::jsonb)
  into v_changes
  from (
    select *
    from public.operator_service_changes
    where service_id = p_service_id
    order by changed_at desc
    limit 20
  ) c;

  return jsonb_build_object(
    'service', to_jsonb(v_service) || jsonb_build_object(
      'company_name', v_company_name,
      'concept_name', v_concept_name
    ),
    'locks', jsonb_build_object(
      'closed', v_service.status in ('completed','cancelled'),
      'trip_started', v_service.trip_id is not null or v_service.status not in ('pending','assigned'),
      'remito_locked', coalesce(v_remito_status in ('firmado','cerrado_admin'), false)
        or v_remito_signed_at is not null,
      'remito_status', v_remito_status,
      'can_edit', v_role in ('administracion','operador')
        and v_service.status not in ('completed','cancelled'),
      'requires_reason', v_service.trip_id is not null
        or v_service.status not in ('pending','assigned')
    ),
    'tolls', v_tolls,
    'changes', v_changes
  );
end;
$function$;

revoke all on function public.get_operator_service_edit_context(uuid) from public, anon;
grant execute on function public.get_operator_service_edit_context(uuid) to authenticated;

create or replace function public.update_operator_service(
  p_service_id uuid,
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_before_tolls jsonb;
  v_after_tolls jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_reason text := nullif(btrim(p_reason), '');
  v_trip_started boolean;
  v_remito_status text;
  v_remito_signed_at timestamptz;
  v_remito_locked boolean := false;
  v_has_tolls boolean := coalesce(p_payload ? 'tolls', false);
  v_toll jsonb;
  v_toll_id uuid;
  v_rate_id uuid;
  v_rate public.toll_rates%rowtype;
  v_location public.toll_locations%rowtype;
  v_toll_name text;
  v_toll_code text;
  v_toll_road text;
  v_toll_direction text;
  v_category text;
  v_payment text;
  v_quantity integer;
  v_unit_amount numeric;
  v_currency text;
  v_source text;
  v_toll_input numeric := 0;
  v_secondary jsonb := '[]'::jsonb;
  v_quote jsonb;
  v_concept_name text;
  v_protected_after_remito text[] := array[
    'service_order_number','purchase_order_number','customer_name','customer_phone',
    'customer_email','vehicle_plate','vehicle_make_model','origin','destination',
    'estimated_distance_km','tolls'
  ];
  v_reason_fields text[] := array[
    'service_order_number','customer_name','customer_phone','customer_email',
    'vehicle_plate','vehicle_make_model','origin','destination'
  ];
begin
  if v_uid is null or v_role not in ('administracion','operador') then
    raise exception 'Sin permiso para editar servicios';
  end if;

  select * into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;
  if v_service.status in ('completed','cancelled') then
    raise exception 'El servicio ya está cerrado y no puede editarse';
  end if;

  v_trip_started := v_service.trip_id is not null
    or v_service.status not in ('pending','assigned');

  if v_service.remito_id is not null then
    select status, firmado_at
    into v_remito_status, v_remito_signed_at
    from public.remitos
    where remito_id = v_service.remito_id;
    v_remito_locked := coalesce(v_remito_status in ('firmado','cerrado_admin'), false)
      or v_remito_signed_at is not null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
  into v_before_tolls
  from public.operator_service_tolls t
  where t.service_id = p_service_id;

  v_before := jsonb_build_object(
    'service_order_number', v_service.service_order_number,
    'purchase_order_number', v_service.purchase_order_number,
    'scheduled_for', v_service.scheduled_for,
    'estimated_arrival_at', v_service.estimated_arrival_at,
    'estimated_finish_at', v_service.estimated_finish_at,
    'granted_delay_minutes', v_service.granted_delay_minutes,
    'priority', v_service.priority,
    'logistics_type', v_service.logistics_type,
    'customer_name', v_service.customer_name,
    'customer_phone', v_service.customer_phone,
    'customer_email', v_service.customer_email,
    'vehicle_plate', v_service.vehicle_plate,
    'vehicle_make_model', v_service.vehicle_make_model,
    'origin', v_service.origin,
    'destination', v_service.destination,
    'origin_lat', v_service.origin_lat,
    'origin_lng', v_service.origin_lng,
    'destination_lat', v_service.destination_lat,
    'destination_lng', v_service.destination_lng,
    'origin_place_id', v_service.origin_place_id,
    'destination_place_id', v_service.destination_place_id,
    'origin_formatted_address', v_service.origin_formatted_address,
    'destination_formatted_address', v_service.destination_formatted_address,
    'estimated_distance_km', v_service.estimated_distance_km,
    'operator_notes', v_service.operator_notes,
    'driver_instructions', v_service.driver_instructions,
    'toll_estimate', v_service.toll_estimate,
    'toll_total', v_service.toll_total,
    'company_estimated_total', v_service.company_estimated_total,
    'tolls', v_before_tolls
  );

  if p_payload ? 'origin' and coalesce(nullif(btrim(p_payload->>'origin'), ''), '') = '' then
    raise exception 'El origen no puede quedar vacío';
  end if;
  if p_payload ? 'destination' and coalesce(nullif(btrim(p_payload->>'destination'), ''), '') = '' then
    raise exception 'El destino no puede quedar vacío';
  end if;
  if p_payload ? 'estimated_distance_km'
     and coalesce(nullif(p_payload->>'estimated_distance_km', '')::numeric, 0) < 0 then
    raise exception 'La distancia no puede ser negativa';
  end if;

  update public.operator_services
  set service_order_number = case when p_payload ? 'service_order_number'
        then nullif(btrim(p_payload->>'service_order_number'), '') else service_order_number end,
      purchase_order_number = case when p_payload ? 'purchase_order_number'
        then nullif(btrim(p_payload->>'purchase_order_number'), '') else purchase_order_number end,
      scheduled_for = case when p_payload ? 'scheduled_for'
        then coalesce(nullif(p_payload->>'scheduled_for', '')::timestamptz, scheduled_for) else scheduled_for end,
      estimated_arrival_at = case when p_payload ? 'estimated_arrival_at'
        then nullif(p_payload->>'estimated_arrival_at', '')::timestamptz else estimated_arrival_at end,
      estimated_finish_at = case when p_payload ? 'estimated_finish_at'
        then nullif(p_payload->>'estimated_finish_at', '')::timestamptz else estimated_finish_at end,
      granted_delay_minutes = case when p_payload ? 'granted_delay_minutes'
        then greatest(coalesce(nullif(p_payload->>'granted_delay_minutes', '')::integer, 0), 0)
        else granted_delay_minutes end,
      priority = case when p_payload ? 'priority'
        then lower(coalesce(nullif(btrim(p_payload->>'priority'), ''), priority)) else priority end,
      logistics_type = case when p_payload ? 'logistics_type'
        then lower(coalesce(nullif(btrim(p_payload->>'logistics_type'), ''), logistics_type)) else logistics_type end,
      customer_name = case when p_payload ? 'customer_name'
        then nullif(btrim(p_payload->>'customer_name'), '') else customer_name end,
      customer_phone = case when p_payload ? 'customer_phone'
        then nullif(btrim(p_payload->>'customer_phone'), '') else customer_phone end,
      customer_email = case when p_payload ? 'customer_email'
        then nullif(btrim(p_payload->>'customer_email'), '') else customer_email end,
      vehicle_plate = case when p_payload ? 'vehicle_plate'
        then upper(nullif(btrim(p_payload->>'vehicle_plate'), '')) else vehicle_plate end,
      vehicle_make_model = case when p_payload ? 'vehicle_make_model'
        then nullif(btrim(p_payload->>'vehicle_make_model'), '') else vehicle_make_model end,
      origin = case when p_payload ? 'origin'
        then btrim(p_payload->>'origin') else origin end,
      destination = case when p_payload ? 'destination'
        then btrim(p_payload->>'destination') else destination end,
      origin_lat = case when p_payload ? 'origin_lat'
        then nullif(p_payload->>'origin_lat', '')::numeric else origin_lat end,
      origin_lng = case when p_payload ? 'origin_lng'
        then nullif(p_payload->>'origin_lng', '')::numeric else origin_lng end,
      destination_lat = case when p_payload ? 'destination_lat'
        then nullif(p_payload->>'destination_lat', '')::numeric else destination_lat end,
      destination_lng = case when p_payload ? 'destination_lng'
        then nullif(p_payload->>'destination_lng', '')::numeric else destination_lng end,
      origin_place_id = case when p_payload ? 'origin_place_id'
        then nullif(btrim(p_payload->>'origin_place_id'), '') else origin_place_id end,
      destination_place_id = case when p_payload ? 'destination_place_id'
        then nullif(btrim(p_payload->>'destination_place_id'), '') else destination_place_id end,
      origin_formatted_address = case when p_payload ? 'origin_formatted_address'
        then nullif(btrim(p_payload->>'origin_formatted_address'), '') else origin_formatted_address end,
      destination_formatted_address = case when p_payload ? 'destination_formatted_address'
        then nullif(btrim(p_payload->>'destination_formatted_address'), '') else destination_formatted_address end,
      estimated_distance_km = case when p_payload ? 'estimated_distance_km'
        then greatest(coalesce(nullif(p_payload->>'estimated_distance_km', '')::numeric, 0), 0)
        else estimated_distance_km end,
      operator_notes = case when p_payload ? 'operator_notes'
        then nullif(btrim(p_payload->>'operator_notes'), '') else operator_notes end,
      driver_instructions = case when p_payload ? 'driver_instructions'
        then nullif(btrim(p_payload->>'driver_instructions'), '') else driver_instructions end,
      updated_by = v_uid,
      updated_at = now()
  where service_id = p_service_id
  returning * into v_service;

  if v_has_tolls then
    delete from public.operator_service_tolls
    where service_id = p_service_id
      and source in ('planned','manual');

    for v_toll in
      select value
      from jsonb_array_elements(coalesce(p_payload->'tolls', '[]'::jsonb))
    loop
      v_toll_id := nullif(v_toll->>'toll_id', '')::uuid;
      v_rate_id := nullif(v_toll->>'toll_rate_id', '')::uuid;
      v_category := lower(coalesce(nullif(btrim(v_toll->>'vehicle_category'), ''), 'light_2_axles'));
      v_payment := lower(coalesce(nullif(btrim(v_toll->>'payment_method'), ''), 'any'));
      v_quantity := greatest(coalesce(nullif(v_toll->>'quantity', '')::integer, 1), 1);
      v_source := lower(coalesce(nullif(btrim(v_toll->>'source'), ''), case when v_toll_id is null then 'manual' else 'planned' end));
      if v_source not in ('planned','manual') then
        raise exception 'La edición administrativa solo admite peajes planificados o manuales';
      end if;

      v_rate := null;
      v_location := null;

      if v_rate_id is not null then
        select * into v_rate
        from public.toll_rates
        where toll_rate_id = v_rate_id;
        if not found then
          raise exception 'Tarifa de peaje inexistente';
        end if;
        v_toll_id := v_rate.toll_id;
        v_category := v_rate.vehicle_category;
        v_payment := v_rate.payment_method;
      end if;

      if v_toll_id is not null then
        select * into v_location
        from public.toll_locations
        where toll_id = v_toll_id;
        if not found then
          raise exception 'Peaje inexistente';
        end if;
      end if;

      if v_rate_id is null and v_toll_id is not null and not (v_toll ? 'unit_amount') then
        select * into v_rate
        from public.toll_rates
        where toll_id = v_toll_id
          and vehicle_category = v_category
          and payment_method in (v_payment, 'any')
          and is_active
          and valid_from <= (v_service.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (valid_until is null or valid_until >= (v_service.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
        order by (payment_method = v_payment) desc, valid_from desc
        limit 1;
        if found then
          v_rate_id := v_rate.toll_rate_id;
          v_payment := v_rate.payment_method;
        end if;
      end if;

      v_toll_name := coalesce(
        nullif(btrim(v_toll->>'toll_name'), ''),
        v_location.name
      );
      if v_toll_name is null then
        raise exception 'Indicá el nombre del peaje manual';
      end if;

      v_toll_code := coalesce(nullif(btrim(v_toll->>'toll_code'), ''), v_location.code);
      v_toll_road := coalesce(nullif(btrim(v_toll->>'road'), ''), v_location.road);
      v_toll_direction := coalesce(nullif(btrim(v_toll->>'direction'), ''), v_location.direction);
      v_unit_amount := case
        when v_toll ? 'unit_amount' then coalesce(nullif(v_toll->>'unit_amount', '')::numeric, 0)
        when v_rate.toll_rate_id is not null then v_rate.amount
        else 0
      end;
      if v_unit_amount < 0 then
        raise exception 'El importe del peaje no puede ser negativo';
      end if;
      v_currency := upper(coalesce(
        nullif(btrim(v_toll->>'currency'), ''),
        v_rate.currency,
        v_service.currency,
        'ARS'
      ));

      insert into public.operator_service_tolls(
        service_id, toll_id, toll_rate_id, toll_code_snapshot, toll_name_snapshot,
        road_snapshot, direction_snapshot, vehicle_category, payment_method,
        quantity, unit_amount, currency, source, notes,
        created_by, updated_by, is_test
      )
      values (
        p_service_id, v_toll_id, v_rate_id, v_toll_code, v_toll_name,
        v_toll_road, v_toll_direction, v_category, v_payment,
        v_quantity, round(v_unit_amount, 2), v_currency, v_source,
        nullif(btrim(v_toll->>'notes'), ''),
        v_uid, v_uid, v_service.is_test
      );
    end loop;
  end if;

  select coalesce(
    case
      when count(*) filter (where source = 'actual') > 0
        then sum(total_amount) filter (where source = 'actual')
      else sum(total_amount) filter (where source in ('planned','manual'))
    end,
    0
  )
  into v_toll_input
  from public.operator_service_tolls
  where service_id = p_service_id;

  if v_has_tolls
     or p_payload ? 'scheduled_for'
     or p_payload ? 'estimated_distance_km' then
    select coalesce(jsonb_agg(
      jsonb_build_object('concept_id', concept_id, 'quantity', quantity)
      order by sort_order
    ), '[]'::jsonb)
    into v_secondary
    from public.operator_service_items
    where service_id = p_service_id
      and item_role = 'secondary';

    v_quote := app_private.calculate_operator_service_quote_full(
      v_service.company_id,
      coalesce(v_service.billing_base_id, v_service.branch_id),
      v_service.scheduled_for,
      v_service.primary_concept_id,
      v_secondary,
      v_service.estimated_distance_km,
      v_toll_input,
      v_service.is_holiday
    );

    update public.operator_services
    set contract_id = (v_quote->>'contract_id')::uuid,
        rate_card_id = (v_quote->>'rate_card_id')::uuid,
        toll_estimate = coalesce((v_quote->>'toll_input')::numeric, 0),
        currency = coalesce(v_quote->>'currency', currency),
        base_subtotal = coalesce((v_quote->>'base_subtotal')::numeric, 0),
        surcharge_total = coalesce((v_quote->>'surcharge_total')::numeric, 0),
        toll_total = coalesce((v_quote->>'toll_total')::numeric, 0),
        copay_total = coalesce((v_quote->>'copay_total')::numeric, 0),
        estimated_total = coalesce((v_quote->>'estimated_total')::numeric, 0),
        company_estimated_total = coalesce((v_quote->>'company_estimated_total')::numeric, 0),
        pricing_snapshot = v_quote,
        updated_by = v_uid,
        updated_at = now()
    where service_id = p_service_id
    returning * into v_service;

    perform app_private.sync_operator_service_items_from_quote(p_service_id, v_quote);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
  into v_after_tolls
  from public.operator_service_tolls t
  where t.service_id = p_service_id;

  v_after := jsonb_build_object(
    'service_order_number', v_service.service_order_number,
    'purchase_order_number', v_service.purchase_order_number,
    'scheduled_for', v_service.scheduled_for,
    'estimated_arrival_at', v_service.estimated_arrival_at,
    'estimated_finish_at', v_service.estimated_finish_at,
    'granted_delay_minutes', v_service.granted_delay_minutes,
    'priority', v_service.priority,
    'logistics_type', v_service.logistics_type,
    'customer_name', v_service.customer_name,
    'customer_phone', v_service.customer_phone,
    'customer_email', v_service.customer_email,
    'vehicle_plate', v_service.vehicle_plate,
    'vehicle_make_model', v_service.vehicle_make_model,
    'origin', v_service.origin,
    'destination', v_service.destination,
    'origin_lat', v_service.origin_lat,
    'origin_lng', v_service.origin_lng,
    'destination_lat', v_service.destination_lat,
    'destination_lng', v_service.destination_lng,
    'origin_place_id', v_service.origin_place_id,
    'destination_place_id', v_service.destination_place_id,
    'origin_formatted_address', v_service.origin_formatted_address,
    'destination_formatted_address', v_service.destination_formatted_address,
    'estimated_distance_km', v_service.estimated_distance_km,
    'operator_notes', v_service.operator_notes,
    'driver_instructions', v_service.driver_instructions,
    'toll_estimate', v_service.toll_estimate,
    'toll_total', v_service.toll_total,
    'company_estimated_total', v_service.company_estimated_total,
    'tolls', v_after_tolls
  );

  select coalesce(array_agg(a.key order by a.key), '{}'::text[])
  into v_changed_fields
  from jsonb_each(v_after) a
  left join jsonb_each(v_before) b on b.key = a.key
  where a.value is distinct from b.value;

  if cardinality(v_changed_fields) = 0 then
    return jsonb_build_object(
      'service', to_jsonb(v_service),
      'tolls', v_after_tolls,
      'changed_fields', '[]'::jsonb,
      'no_changes', true
    );
  end if;

  if v_remito_locked and v_changed_fields && v_protected_after_remito then
    raise exception 'El remito ya está firmado o cerrado. Solo pueden corregirse prioridad, horarios y notas internas';
  end if;

  if v_trip_started and v_changed_fields && v_reason_fields and v_reason is null then
    raise exception 'Indicá el motivo de la corrección porque el viaje ya fue iniciado';
  end if;

  select sc.name into v_concept_name
  from public.service_concepts sc
  where sc.concept_id = v_service.primary_concept_id;

  if v_service.trip_id is not null then
    update public.trips
    set nro_servicio = coalesce(nullif(v_service.service_order_number, ''), v_service.service_number),
        patente = v_service.vehicle_plate,
        tipo_servicio = coalesce(nullif(v_concept_name, ''), tipo_servicio),
        origin = v_service.origin,
        destination = v_service.destination,
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          case when v_reason is not null then 'Corrección administrativa: ' || v_reason end
        ),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_service.trip_id;
  end if;

  if v_service.remito_id is not null and not v_remito_locked then
    update public.remitos
    set nro_servicio = coalesce(nullif(v_service.service_order_number, ''), nro_servicio),
        patente = coalesce(nullif(v_service.vehicle_plate, ''), patente),
        marca_modelo = v_service.vehicle_make_model,
        razon_social = v_service.customer_name,
        telefono = v_service.customer_phone,
        email_cliente = v_service.customer_email,
        tipo_servicio = coalesce(nullif(v_concept_name, ''), tipo_servicio),
        origen = v_service.origin,
        destino = v_service.destination,
        imp_peaje = case when v_has_tolls then v_toll_input else imp_peaje end,
        imp_total_extras = case when v_has_tolls then
          coalesce(v_toll_input, 0) + coalesce(imp_excedente, 0) + coalesce(imp_otros, 0)
          else imp_total_extras end,
        historial_ediciones = coalesce(historial_ediciones, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'edited_at', now(),
            'edited_by', v_uid,
            'reason', v_reason,
            'fields', to_jsonb(v_changed_fields)
          )),
        received_at = now(),
        sync_status = 'synced'
    where remito_id = v_service.remito_id;
  end if;

  insert into public.operator_service_changes(
    service_id, service_status, trip_id, remito_id, changed_fields,
    before_values, after_values, change_reason, changed_by, is_test
  )
  values (
    p_service_id, v_service.status, v_service.trip_id, v_service.remito_id,
    v_changed_fields, v_before, v_after, v_reason, v_uid, v_service.is_test
  );

  insert into public.operator_service_events(
    service_id, event_type, from_status, to_status, notes, created_by
  )
  values (
    p_service_id,
    'service_edit',
    v_service.status,
    v_service.status,
    concat_ws(
      ' · ',
      'Campos: ' || array_to_string(v_changed_fields, ', '),
      case when v_reason is not null then 'Motivo: ' || v_reason end
    ),
    v_uid
  );

  return jsonb_build_object(
    'service', to_jsonb(v_service),
    'tolls', v_after_tolls,
    'changed_fields', to_jsonb(v_changed_fields),
    'no_changes', false
  );
end;
$function$;

revoke all on function public.update_operator_service(uuid, jsonb, text) from public, anon;
grant execute on function public.update_operator_service(uuid, jsonb, text) to authenticated;
