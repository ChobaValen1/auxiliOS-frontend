create table if not exists public.payroll_commission_rules (
  commission_id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  concept_id uuid not null,
  source text not null check (source in ('extras', 'invoices')),
  mode text not null check (mode in ('fixed', 'percent')),
  value numeric(14,2) not null check (value >= 0),
  active boolean not null default true,
  created_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_commission_percent_range check (mode <> 'percent' or value <= 100),
  constraint payroll_commission_rule_unique_concept unique (source, concept_id)
);

create table if not exists public.payroll_commission_assignments (
  commission_id uuid not null references public.payroll_commission_rules(commission_id) on delete cascade,
  driver_id uuid not null references public.users(user_id) on delete cascade,
  assigned_by uuid references public.users(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (commission_id, driver_id)
);

create index if not exists payroll_commission_assignments_driver_idx
  on public.payroll_commission_assignments(driver_id);
create index if not exists payroll_commission_assignments_assigned_by_idx
  on public.payroll_commission_assignments(assigned_by);
create index if not exists payroll_commission_rules_created_by_idx
  on public.payroll_commission_rules(created_by);

alter table public.payroll_commission_rules enable row level security;
alter table public.payroll_commission_assignments enable row level security;

drop policy if exists payroll_commission_rules_admin_all on public.payroll_commission_rules;
drop policy if exists payroll_commission_rules_admin_insert on public.payroll_commission_rules;
create policy payroll_commission_rules_admin_insert
  on public.payroll_commission_rules for insert to authenticated
  with check (app_private.current_auxilios_role() = 'administracion');
drop policy if exists payroll_commission_rules_admin_update on public.payroll_commission_rules;
create policy payroll_commission_rules_admin_update
  on public.payroll_commission_rules for update to authenticated
  using (app_private.current_auxilios_role() = 'administracion')
  with check (app_private.current_auxilios_role() = 'administracion');
drop policy if exists payroll_commission_rules_admin_delete on public.payroll_commission_rules;
create policy payroll_commission_rules_admin_delete
  on public.payroll_commission_rules for delete to authenticated
  using (app_private.current_auxilios_role() = 'administracion');

drop policy if exists payroll_commission_rules_read_management on public.payroll_commission_rules;
create policy payroll_commission_rules_read_management
  on public.payroll_commission_rules for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion', 'supervision'));

drop policy if exists payroll_commission_assignments_admin_all on public.payroll_commission_assignments;
drop policy if exists payroll_commission_assignments_admin_insert on public.payroll_commission_assignments;
create policy payroll_commission_assignments_admin_insert
  on public.payroll_commission_assignments for insert to authenticated
  with check (app_private.current_auxilios_role() = 'administracion');
drop policy if exists payroll_commission_assignments_admin_update on public.payroll_commission_assignments;
create policy payroll_commission_assignments_admin_update
  on public.payroll_commission_assignments for update to authenticated
  using (app_private.current_auxilios_role() = 'administracion')
  with check (app_private.current_auxilios_role() = 'administracion');
drop policy if exists payroll_commission_assignments_admin_delete on public.payroll_commission_assignments;
create policy payroll_commission_assignments_admin_delete
  on public.payroll_commission_assignments for delete to authenticated
  using (app_private.current_auxilios_role() = 'administracion');

drop policy if exists payroll_commission_assignments_read_management on public.payroll_commission_assignments;
create policy payroll_commission_assignments_read_management
  on public.payroll_commission_assignments for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion', 'supervision'));

grant select, insert, update, delete on public.payroll_commission_rules to authenticated;
grant select, insert, update, delete on public.payroll_commission_assignments to authenticated;

create or replace function public.set_payroll_commission_assignments(
  p_drivers uuid[],
  p_commission_ids uuid[]
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_driver_count integer;
begin
  if app_private.current_auxilios_role() <> 'administracion' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_drivers), 0) = 0 then
    raise exception 'Seleccioná al menos un chofer' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_drivers) as d(driver_id)
    left join public.users u on u.user_id = d.driver_id
    left join public.roles r on r.role_id = u.role_id
    where u.user_id is null or u.is_active is false or r.name <> 'chofer'
  ) then
    raise exception 'La selección contiene usuarios no habilitados como chofer' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_commission_ids, array[]::uuid[])) as c(commission_id)
    left join public.payroll_commission_rules r on r.commission_id = c.commission_id
    where r.commission_id is null or r.active is false
  ) then
    raise exception 'La selección contiene una comisión inexistente o inactiva' using errcode = '22023';
  end if;

  delete from public.payroll_commission_assignments
  where driver_id = any(p_drivers);

  insert into public.payroll_commission_assignments (commission_id, driver_id, assigned_by)
  select c.commission_id, d.driver_id, auth.uid()
  from unnest(coalesce(p_commission_ids, array[]::uuid[])) as c(commission_id)
  cross join unnest(p_drivers) as d(driver_id)
  on conflict do nothing;

  select count(*) into v_driver_count from unnest(p_drivers) as d(driver_id);
  return v_driver_count;
end;
$$;

revoke all on function public.set_payroll_commission_assignments(uuid[], uuid[]) from public, anon;
grant execute on function public.set_payroll_commission_assignments(uuid[], uuid[]) to authenticated;

with legacy as (
  select
    ps.user_id,
    item,
    (item->>'concept_id')::uuid as concept_id,
    item->>'source' as source
  from public.payroll_settings ps
  cross join lateral jsonb_array_elements(coalesce(ps.compensation_matrix->'commissions', '[]'::jsonb)) item
  where item->>'concept_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and item->>'source' in ('extras', 'invoices')
    and item->>'mode' in ('fixed', 'percent')
)
insert into public.payroll_commission_rules (name, concept_id, source, mode, value)
select distinct on (source, concept_id)
  coalesce(nullif(btrim(item->>'name'), ''), 'Comisión por concepto'),
  concept_id,
  source,
  item->>'mode',
  greatest(0, (item->>'value')::numeric)
from legacy
order by source, concept_id
on conflict (source, concept_id) do update
set name = excluded.name, mode = excluded.mode, value = excluded.value, updated_at = now();

with legacy as (
  select
    ps.user_id,
    (item->>'concept_id')::uuid as concept_id,
    item->>'source' as source
  from public.payroll_settings ps
  cross join lateral jsonb_array_elements(coalesce(ps.compensation_matrix->'commissions', '[]'::jsonb)) item
  where item->>'concept_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
insert into public.payroll_commission_assignments (commission_id, driver_id)
select r.commission_id, l.user_id
from legacy l
join public.payroll_commission_rules r
  on r.concept_id = l.concept_id and r.source = l.source
on conflict do nothing;

update public.payroll_settings
set compensation_matrix = jsonb_set(compensation_matrix, '{commissions}', '[]'::jsonb, true)
where jsonb_array_length(coalesce(compensation_matrix->'commissions', '[]'::jsonb)) > 0;
