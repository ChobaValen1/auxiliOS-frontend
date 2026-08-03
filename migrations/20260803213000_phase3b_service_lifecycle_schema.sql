-- AuxiliOS Phase 3B · part 1/7
create extension if not exists pgcrypto;

alter table public.users
  add column if not exists is_test boolean not null default false;

alter table public.trucks
  add column if not exists is_test boolean not null default false;

alter table public.companies
  add column if not exists is_test boolean not null default false;

alter table public.operator_services
  add column if not exists is_test boolean not null default false;

create unique index if not exists operator_services_company_order_unique_idx
  on public.operator_services (company_id, lower(btrim(service_order_number)))
  where nullif(btrim(service_order_number), '') is not null;

create table if not exists public.operator_service_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  assignment_sequence integer not null,
  driver_id uuid not null references public.users(user_id),
  truck_id integer not null references public.trucks(truck_id),
  assigned_by uuid references public.users(user_id),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  trip_id integer references public.trips(trip_id),
  released_at timestamptz,
  released_by uuid references public.users(user_id),
  release_reason_code text,
  release_notes text,
  status text not null default 'active'
    check (status in ('active','released','completed','cancelled')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, assignment_sequence)
);

create unique index if not exists operator_service_assignments_one_active_idx
  on public.operator_service_assignments(service_id)
  where status = 'active';

create index if not exists operator_service_assignments_driver_idx
  on public.operator_service_assignments(driver_id, assigned_at desc);

create index if not exists operator_service_assignments_trip_idx
  on public.operator_service_assignments(trip_id)
  where trip_id is not null;

create table if not exists public.operator_service_closures (
  closure_id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references public.operator_services(service_id) on delete cascade,
  assignment_id uuid references public.operator_service_assignments(assignment_id),
  result_code text not null
    check (result_code in (
      'cancelled_without_activation',
      'activated_movement',
      'activated_km',
      'activated_origin',
      'truck_failure'
    )),
  event_moment text not null
    check (event_moment in (
      'before_departure',
      'en_route',
      'at_origin',
      'after_load',
      'truck_failure'
    )),
  reason_code text not null,
  reason_text text not null,
  informed_by text,
  location_text text,
  latitude numeric,
  longitude numeric,
  km_recognized numeric not null default 0 check (km_recognized >= 0),
  evidence_urls text[] not null default '{}',
  evidence_count integer not null default 0 check (evidence_count >= 0),
  billing_status text not null default 'pending_review'
    check (billing_status in (
      'pending_review',
      'billable',
      'non_billable',
      'billable_km',
      'billable_origin',
      'billable_movement'
    )),
  billing_notes text,
  billing_reviewed_by uuid references public.users(user_id),
  billing_reviewed_at timestamptz,
  signature_required boolean not null default false,
  remito_required boolean not null default false,
  closed_by uuid references public.users(user_id),
  closed_at timestamptz not null default now(),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_service_closures_billing_idx
  on public.operator_service_closures(billing_status, billing_reviewed_at)
  where billing_reviewed_at is null;

alter table public.operator_service_assignments enable row level security;
alter table public.operator_service_closures enable row level security;

drop policy if exists operator_service_assignments_select_access
  on public.operator_service_assignments;
create policy operator_service_assignments_select_access
  on public.operator_service_assignments
  for select
  to authenticated
  using (
    (select app_private.current_auxilios_role()) in
      ('administracion','supervision','operador','facturacion')
    or exists (
      select 1
      from public.operator_services s
      where s.service_id = operator_service_assignments.service_id
        and s.assigned_driver_id = (select auth.uid())
    )
  );

drop policy if exists operator_service_closures_select_access
  on public.operator_service_closures;
create policy operator_service_closures_select_access
  on public.operator_service_closures
  for select
  to authenticated
  using (
    (select app_private.current_auxilios_role()) in
      ('administracion','supervision','operador','facturacion')
    or exists (
      select 1
      from public.operator_services s
      where s.service_id = operator_service_closures.service_id
        and s.assigned_driver_id = (select auth.uid())
    )
  );

revoke all on table public.operator_service_assignments from public, anon;
revoke all on table public.operator_service_closures from public, anon;
grant select on table public.operator_service_assignments to authenticated;
grant select on table public.operator_service_closures to authenticated;
