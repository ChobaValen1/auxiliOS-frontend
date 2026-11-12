-- Fixture aislado para servicios con relevo: sin datos de clientes ni de choferes reales.
create role anon; create role authenticated; create schema auth; create schema app_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.current_auxilios_role() returns text language sql as $$select nullif(current_setting('test.role',true),'')$$;
create table public.roles(role_id integer primary key, name text not null);
create table public.users(user_id uuid primary key, full_name text, is_active boolean default true, role_id integer references public.roles(role_id));
create table public.trucks(truck_id integer primary key, plate text, numero_interno text, status text default 'active');
create table public.daily_logs(log_id serial primary key, driver_id uuid, truck_id integer, status text default 'open', hora_fin timestamptz,
  log_date date default current_date, hora_inicio timestamptz default now());
create table public.operator_services(service_id uuid primary key, service_number text, service_order_number text, status text not null default 'pending',
  logistics_type text default 'own', driver_activated boolean default false, activation_kind text, activation_driver_id uuid, billing_status text default 'not_ready',
  scheduled_for timestamptz default now(), completed_at timestamptz, assigned_driver_id uuid, assigned_truck_id integer, assigned_at timestamptz, assigned_by uuid,
  trip_id integer, remito_id integer, vehicle_plate text, vehicle_make_model text, origin text, destination text,
  destination_formatted_address text, destination_lat numeric, destination_lng numeric, updated_by uuid);
create table public.operator_service_events(event_id bigserial primary key, service_id uuid, event_type text, from_status text, to_status text,
  notes text, created_by uuid, created_at timestamptz default now());
create table public.remitos(remito_id integer primary key, operator_service_id uuid, driver_id uuid, status text, firmado_at timestamptz);
create table public.operator_service_assignments(assignment_id uuid primary key default gen_random_uuid(), service_id uuid not null,
  assignment_sequence integer not null, driver_id uuid not null, truck_id integer not null, assigned_at timestamptz not null default now(),
  released_at timestamptz, release_reason_code text, status text not null default 'active', unique(service_id, assignment_sequence));
-- Igual que producción (phase3b_assignment_sync), simplificado: al cambiar chofer o móvil se libera la asignación y se abre otra.
create function app_private.sync_operator_service_assignment() returns trigger language plpgsql as $$
declare v_seq integer; v_reason text := nullif(current_setting('app.assignment_reason', true), '');
begin
  if tg_op = 'INSERT' then
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then
      insert into public.operator_service_assignments(service_id, assignment_sequence, driver_id, truck_id) values (new.service_id, 1, new.assigned_driver_id, new.assigned_truck_id);
    end if;
    return new;
  end if;
  if new.assigned_driver_id is distinct from old.assigned_driver_id or new.assigned_truck_id is distinct from old.assigned_truck_id then
    update public.operator_service_assignments set status = 'released', released_at = now(), release_reason_code = coalesce(v_reason, 'assignment_changed')
    where service_id = new.service_id and status = 'active';
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null and new.status not in ('completed', 'cancelled') then
      select coalesce(max(assignment_sequence), 0) + 1 into v_seq from public.operator_service_assignments where service_id = new.service_id;
      insert into public.operator_service_assignments(service_id, assignment_sequence, driver_id, truck_id) values (new.service_id, v_seq, new.assigned_driver_id, new.assigned_truck_id);
    end if;
  end if;
  return new;
end $$;
create trigger sync_assignment after insert or update on public.operator_services for each row execute function app_private.sync_operator_service_assignment();
