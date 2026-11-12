-- Fixture aislado para servicios enganchados: sin datos de clientes.
create role anon; create role authenticated; create schema auth; create schema app_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.current_auxilios_role() returns text language sql as $$select nullif(current_setting('test.role',true),'')$$;
create table public.billing_bases(base_id uuid primary key, name text, latitude numeric, longitude numeric);
create table public.company_billing_settings(billing_setting_id uuid primary key default gen_random_uuid(), company_id uuid, contract_id uuid,
  is_active boolean default true, valid_from date default '2026-01-01', valid_until date, created_at timestamptz default now(),
  route_mode text default 'base_origin_destination_base');
create table public.operator_services(service_id uuid primary key, company_id uuid not null, service_number text, service_order_number text,
  scheduled_for timestamptz not null, status text not null default 'pending', billing_status text default 'not_ready', is_test boolean default false,
  origin text, destination text, origin_lat numeric, origin_lng numeric, destination_lat numeric, destination_lng numeric,
  billing_base_id uuid, customer_name text, vehicle_plate text,
  estimated_asphalt_km numeric(12,2), estimated_gravel_km numeric(12,2), estimated_distance_km numeric(12,2),
  route_distance_meters integer, route_duration_seconds integer, route_legs jsonb, route_polyline text, route_calculated_at timestamptz,
  updated_by uuid, updated_at timestamptz);
create table public.operator_service_events(event_id bigserial primary key, service_id uuid, event_type text, from_status text, to_status text,
  notes text, created_by uuid, created_at timestamptz default now(), details jsonb);
