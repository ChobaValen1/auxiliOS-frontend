-- AuxiliOS · Fase 2B: flujo del operador

create sequence if not exists public.operator_service_number_seq start with 1 increment by 1;
grant usage, select on sequence public.operator_service_number_seq to authenticated;
revoke all on sequence public.operator_service_number_seq from anon;

create table if not exists public.operator_services (
  service_id uuid primary key default gen_random_uuid(),
  service_number text not null unique default (
    'SRV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.operator_service_number_seq')::text, 5, '0')
  ),
  status text not null default 'pending' check (status in ('pending','assigned','en_route','at_origin','loaded','at_destination','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('normal','urgent','critical')),
  company_id uuid not null references public.companies(company_id),
  branch_id uuid references public.company_branches(branch_id),
  contract_id uuid not null references public.company_contracts(contract_id),
  rate_card_id uuid not null references public.company_rate_cards(rate_card_id),
  service_order_number text,
  purchase_order_number text,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default now(),
  estimated_arrival_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_plate text,
  vehicle_make_model text,
  origin text not null,
  destination text not null,
  origin_lat numeric(10,7),
  origin_lng numeric(10,7),
  destination_lat numeric(10,7),
  destination_lng numeric(10,7),
  primary_concept_id uuid not null references public.service_concepts(concept_id),
  assigned_driver_id uuid references public.users(user_id),
  assigned_truck_id integer references public.trucks(truck_id),
  assigned_at timestamptz,
  assigned_by uuid references public.users(user_id),
  estimated_distance_km numeric(12,2) not null default 0 check (estimated_distance_km >= 0),
  toll_estimate numeric(12,2) not null default 0 check (toll_estimate >= 0),
  is_holiday boolean not null default false,
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  base_subtotal numeric(14,2) not null default 0,
  surcharge_total numeric(14,2) not null default 0,
  toll_total numeric(14,2) not null default 0,
  copay_total numeric(14,2) not null default 0,
  estimated_total numeric(14,2) not null default 0,
  company_estimated_total numeric(14,2) not null default 0,
  pricing_snapshot jsonb not null default '{}'::jsonb,
  operator_notes text,
  driver_instructions text,
  driver_notes text,
  cancellation_reason text,
  trip_id integer references public.trips(trip_id),
  remito_id integer references public.remitos(remito_id),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null default auth.uid() references public.users(user_id),
  updated_by uuid not null default auth.uid() references public.users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((assigned_driver_id is null and assigned_truck_id is null) or (assigned_driver_id is not null and assigned_truck_id is not null))
);

create index if not exists operator_services_status_idx on public.operator_services(status, scheduled_for desc);
create index if not exists operator_services_company_idx on public.operator_services(company_id, scheduled_for desc);
create index if not exists operator_services_driver_idx on public.operator_services(assigned_driver_id, status, scheduled_for desc);
create index if not exists operator_services_truck_idx on public.operator_services(assigned_truck_id, status, scheduled_for desc);

create table if not exists public.operator_service_items (
  item_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  concept_id uuid not null references public.service_concepts(concept_id),
  rate_item_id uuid references public.company_rate_items(rate_item_id),
  item_role text not null check (item_role in ('primary','secondary')),
  service_code text not null,
  service_name text not null,
  pricing_unit text not null check (pricing_unit in ('service','hour','km','unit','day','fixed')),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  price_source text not null default 'general' check (price_source in ('general','branch','link_override')),
  snapshot jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(service_id, concept_id, item_role)
);

create unique index if not exists operator_service_one_primary_idx
  on public.operator_service_items(service_id)
  where item_role = 'primary';

create table if not exists public.operator_service_events (
  event_id bigint generated always as identity primary key,
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  event_type text not null default 'status_change',
  from_status text,
  to_status text,
  notes text,
  created_by uuid references public.users(user_id),
  created_at timestamptz not null default now()
);

create index if not exists operator_service_events_service_idx on public.operator_service_events(service_id, created_at desc);

alter table public.operator_services enable row level security;
alter table public.operator_service_items enable row level security;
alter table public.operator_service_events enable row level security;

revoke all on public.operator_services, public.operator_service_items, public.operator_service_events from anon;
grant select, insert, update, delete on public.operator_services to authenticated;
grant select, insert, update, delete on public.operator_service_items to authenticated;
grant select on public.operator_service_events to authenticated;
grant usage, select on sequence public.operator_service_events_event_id_seq to authenticated;

drop policy if exists operator_services_select_access on public.operator_services;
create policy operator_services_select_access on public.operator_services
for select to authenticated
using (
  app_private.current_auxilios_role() in ('administracion','supervision')
  or assigned_driver_id = auth.uid()
);

drop policy if exists operator_services_insert_management on public.operator_services;
create policy operator_services_insert_management on public.operator_services
for insert to authenticated
with check (
  app_private.current_auxilios_role() in ('administracion','supervision')
  and created_by = auth.uid()
);

drop policy if exists operator_services_update_management on public.operator_services;
create policy operator_services_update_management on public.operator_services
for update to authenticated
using (app_private.current_auxilios_role() in ('administracion','supervision'))
with check (app_private.current_auxilios_role() in ('administracion','supervision'));

drop policy if exists operator_services_update_driver_assigned on public.operator_services;
create policy operator_services_update_driver_assigned on public.operator_services
for update to authenticated
using (
  app_private.current_auxilios_role() = 'chofer'
  and assigned_driver_id = auth.uid()
)
with check (
  app_private.current_auxilios_role() = 'chofer'
  and assigned_driver_id = auth.uid()
);

drop policy if exists operator_services_delete_admin on public.operator_services;
create policy operator_services_delete_admin on public.operator_services
for delete to authenticated
using (
  app_private.current_auxilios_role() = 'administracion'
  and status in ('pending','cancelled')
);

drop policy if exists operator_service_items_select_access on public.operator_service_items;
create policy operator_service_items_select_access on public.operator_service_items
for select to authenticated
using (
  exists (
    select 1 from public.operator_services s
    where s.service_id = operator_service_items.service_id
      and (
        app_private.current_auxilios_role() in ('administracion','supervision')
        or s.assigned_driver_id = auth.uid()
      )
  )
);

drop policy if exists operator_service_items_write_management on public.operator_service_items;
create policy operator_service_items_write_management on public.operator_service_items
for all to authenticated
using (app_private.current_auxilios_role() in ('administracion','supervision'))
with check (app_private.current_auxilios_role() in ('administracion','supervision'));

drop policy if exists operator_service_events_select_access on public.operator_service_events;
create policy operator_service_events_select_access on public.operator_service_events
for select to authenticated
using (
  exists (
    select 1 from public.operator_services s
    where s.service_id = operator_service_events.service_id
      and (
        app_private.current_auxilios_role() in ('administracion','supervision')
        or s.assigned_driver_id = auth.uid()
      )
  )
);

create or replace function app_private.operator_services_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
begin
  if v_role = 'chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then
      raise exception 'Servicio no asignado al chofer actual';
    end if;
    if (to_jsonb(new) - array['status','driver_notes','updated_at','updated_by'])
       is distinct from
       (to_jsonb(old) - array['status','driver_notes','updated_at','updated_by']) then
      raise exception 'El chofer solo puede avanzar el estado y registrar una nota';
    end if;
    if not (
      (old.status = 'assigned' and new.status = 'en_route')
      or (old.status = 'en_route' and new.status = 'at_origin')
      or (old.status = 'at_origin' and new.status = 'loaded')
      or (old.status = 'loaded' and new.status = 'at_destination')
      or (old.status = 'at_destination' and new.status = 'completed')
      or (old.status = new.status)
    ) then
      raise exception 'Transición de estado no permitida';
    end if;
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  elsif new.status <> 'cancelled' then
    new.cancelled_at := null;
  end if;
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  if new.assigned_driver_id is not null and (
    old.assigned_driver_id is distinct from new.assigned_driver_id
    or old.assigned_truck_id is distinct from new.assigned_truck_id
  ) then
    new.assigned_at := now();
    if v_role in ('administracion','supervision') then
      new.assigned_by := auth.uid();
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function app_private.operator_services_before_update() from public, anon, authenticated;

drop trigger if exists operator_services_before_update on public.operator_services;
create trigger operator_services_before_update
before update on public.operator_services
for each row execute function app_private.operator_services_before_update();

create or replace function app_private.operator_services_log_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.operator_service_events(service_id,event_type,to_status,notes,created_by)
    values (new.service_id,'created',new.status,'Servicio creado',new.created_by);
  elsif new.status is distinct from old.status then
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by)
    values (
      new.service_id,
      case when new.status='cancelled' then 'cancelled' else 'status_change' end,
      old.status,
      new.status,
      case when new.status='cancelled' then new.cancellation_reason else new.driver_notes end,
      auth.uid()
    );
  elsif new.assigned_driver_id is distinct from old.assigned_driver_id
     or new.assigned_truck_id is distinct from old.assigned_truck_id then
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by)
    values (new.service_id,'assignment',old.status,new.status,'Asignación actualizada',auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function app_private.operator_services_log_event() from public, anon, authenticated;

drop trigger if exists operator_services_log_event on public.operator_services;
create trigger operator_services_log_event
after insert or update on public.operator_services
for each row execute function app_private.operator_services_log_event();
