-- AuxiliOS Phase 3B · part 2/7
create or replace function app_private.operator_service_mark_test()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  new.is_test :=
    coalesce((select c.is_test from public.companies c where c.company_id = new.company_id), false)
    or coalesce((select u.is_test from public.users u where u.user_id = new.assigned_driver_id), false)
    or coalesce((select t.is_test from public.trucks t where t.truck_id = new.assigned_truck_id), false);
  return new;
end;
$function$;

drop trigger if exists operator_services_mark_test on public.operator_services;
create trigger operator_services_mark_test
before insert or update of company_id, assigned_driver_id, assigned_truck_id
on public.operator_services
for each row execute function app_private.operator_service_mark_test();

create or replace function app_private.operator_service_validate_order()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if nullif(btrim(new.service_order_number), '') is not null
     and exists (
       select 1
       from public.operator_services s
       where s.company_id = new.company_id
         and lower(btrim(s.service_order_number)) =
             lower(btrim(new.service_order_number))
         and s.service_id is distinct from new.service_id
     ) then
    raise exception
      'PRESTACION_DUPLICADA: ya existe un servicio de esta prestadora con el número %',
      btrim(new.service_order_number);
  end if;
  return new;
end;
$function$;

drop trigger if exists operator_services_validate_order on public.operator_services;
create trigger operator_services_validate_order
before insert or update of company_id, service_order_number
on public.operator_services
for each row execute function app_private.operator_service_validate_order();

create or replace function app_private.sync_operator_service_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_sequence integer;
  v_reason text := nullif(current_setting('app.assignment_reason', true), '');
  v_notes text := nullif(current_setting('app.assignment_notes', true), '');
  v_test boolean;
begin
  if tg_op = 'INSERT' then
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then
      insert into public.operator_service_assignments(
        service_id, assignment_sequence, driver_id, truck_id,
        assigned_by, assigned_at, trip_id, started_at, status, is_test
      )
      values (
        new.service_id, 1, new.assigned_driver_id, new.assigned_truck_id,
        new.assigned_by, coalesce(new.assigned_at, now()), new.trip_id,
        case when new.trip_id is not null then now() end,
        case
          when new.status = 'completed' then 'completed'
          when new.status = 'cancelled' then 'cancelled'
          else 'active'
        end,
        new.is_test
      );
    end if;
    return new;
  end if;

  if new.assigned_driver_id is distinct from old.assigned_driver_id
     or new.assigned_truck_id is distinct from old.assigned_truck_id then

    update public.operator_service_assignments
    set status = case
          when old.status = 'completed' then 'completed'
          when old.status = 'cancelled' then 'cancelled'
          else 'released'
        end,
        trip_id = coalesce(trip_id, old.trip_id),
        released_at = coalesce(released_at, now()),
        released_by = coalesce(auth.uid(), new.updated_by),
        release_reason_code = coalesce(v_reason, 'assignment_changed'),
        release_notes = v_notes,
        updated_at = now()
    where service_id = new.service_id
      and status = 'active';

    if new.assigned_driver_id is not null
       and new.assigned_truck_id is not null
       and new.status not in ('completed','cancelled') then
      select coalesce(max(a.assignment_sequence), 0) + 1
      into v_sequence
      from public.operator_service_assignments a
      where a.service_id = new.service_id;

      v_test := new.is_test
        or coalesce((select u.is_test from public.users u where u.user_id = new.assigned_driver_id), false)
        or coalesce((select t.is_test from public.trucks t where t.truck_id = new.assigned_truck_id), false);

      insert into public.operator_service_assignments(
        service_id, assignment_sequence, driver_id, truck_id,
        assigned_by, assigned_at, trip_id, started_at, status, is_test
      )
      values (
        new.service_id, v_sequence, new.assigned_driver_id, new.assigned_truck_id,
        new.assigned_by, coalesce(new.assigned_at, now()), new.trip_id,
        case when new.trip_id is not null then now() end,
        'active', v_test
      );
    end if;
  elsif new.trip_id is distinct from old.trip_id and new.trip_id is not null then
    update public.operator_service_assignments
    set trip_id = new.trip_id,
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where service_id = new.service_id
      and status = 'active';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.operator_service_assignments
    set status = 'completed',
        trip_id = coalesce(trip_id, new.trip_id),
        released_at = coalesce(released_at, now()),
        released_by = coalesce(auth.uid(), new.updated_by),
        updated_at = now()
    where service_id = new.service_id
      and status = 'active';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.operator_service_assignments
    set status = 'cancelled',
        trip_id = coalesce(trip_id, new.trip_id),
        released_at = coalesce(released_at, now()),
        released_by = coalesce(auth.uid(), new.updated_by),
        release_reason_code = coalesce(v_reason, 'operational_closure'),
        release_notes = coalesce(v_notes, new.cancellation_reason),
        updated_at = now()
    where service_id = new.service_id
      and status = 'active';
  end if;

  return new;
end;
$function$;

drop trigger if exists operator_services_sync_assignment on public.operator_services;
create trigger operator_services_sync_assignment
after insert or update of assigned_driver_id, assigned_truck_id, trip_id, status
on public.operator_services
for each row execute function app_private.sync_operator_service_assignment();

-- Backfill assignment history if this migration is applied to an environment
-- that already contains assigned services.
insert into public.operator_service_assignments(
  service_id, assignment_sequence, driver_id, truck_id,
  assigned_by, assigned_at, trip_id, started_at, released_at,
  status, is_test
)
select
  s.service_id,
  1,
  s.assigned_driver_id,
  s.assigned_truck_id,
  s.assigned_by,
  coalesce(s.assigned_at, s.created_at),
  s.trip_id,
  case when s.trip_id is not null then coalesce(t.fecha_hora_inicio, s.assigned_at, s.created_at) end,
  case when s.status in ('completed','cancelled') then coalesce(s.completed_at, s.cancelled_at, s.updated_at) end,
  case
    when s.status = 'completed' then 'completed'
    when s.status = 'cancelled' then 'cancelled'
    else 'active'
  end,
  s.is_test
from public.operator_services s
left join public.trips t on t.trip_id = s.trip_id
where s.assigned_driver_id is not null
  and s.assigned_truck_id is not null
  and not exists (
    select 1
    from public.operator_service_assignments a
    where a.service_id = s.service_id
  );
