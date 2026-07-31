-- AuxiliOS · Fase 2A: contratos y tarifarios por empresa

create table if not exists public.company_contracts (
  contract_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete restrict,
  contract_number text,
  name text not null default 'Convenio principal',
  status text not null default 'draft' check (status in ('draft','active','suspended','expired','closed')),
  valid_from date not null default current_date,
  valid_until date,
  billing_frequency text not null default 'monthly' check (billing_frequency in ('per_service','weekly','biweekly','monthly')),
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  requires_service_order boolean not null default true,
  requires_purchase_order boolean not null default false,
  is_primary boolean not null default false,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index if not exists company_contracts_number_uq on public.company_contracts(company_id, lower(btrim(contract_number))) where contract_number is not null and btrim(contract_number) <> '';
create unique index if not exists company_contracts_primary_active_uq on public.company_contracts(company_id) where is_primary and status = 'active';
create index if not exists company_contracts_company_idx on public.company_contracts(company_id, status, valid_from desc);
create index if not exists company_contracts_expiry_idx on public.company_contracts(valid_until) where status in ('active','suspended') and valid_until is not null;

create table if not exists public.company_rate_cards (
  rate_card_id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.company_contracts(contract_id) on delete cascade,
  name text not null default 'Tarifario general',
  version integer not null,
  status text not null default 'draft' check (status in ('draft','active','expired','archived')),
  valid_from date not null default current_date,
  valid_until date,
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (version > 0),
  check (valid_until is null or valid_until >= valid_from),
  unique (contract_id, version)
);

create unique index if not exists company_rate_cards_active_uq on public.company_rate_cards(contract_id) where status = 'active';
create index if not exists company_rate_cards_contract_idx on public.company_rate_cards(contract_id, status, version desc);

create table if not exists public.company_rate_items (
  rate_item_id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.company_rate_cards(rate_card_id) on delete cascade,
  branch_id uuid references public.company_branches(branch_id) on delete restrict,
  service_code text not null check (service_code ~ '^[a-z0-9_]{2,50}$'),
  service_name text not null,
  base_price numeric(14,2) not null default 0 check (base_price >= 0),
  included_km numeric(10,2) not null default 0 check (included_km >= 0),
  extra_km_price numeric(14,2) not null default 0 check (extra_km_price >= 0),
  km_calculation_method text not null default 'one_way' check (km_calculation_method in ('one_way','round_trip','from_base','from_unit','manual')),
  included_wait_minutes integer not null default 0 check (included_wait_minutes >= 0),
  wait_price_per_hour numeric(14,2) not null default 0 check (wait_price_per_hour >= 0),
  tolls_mode text not null default 'at_cost' check (tolls_mode in ('at_cost','included','fixed','not_applicable')),
  tolls_fixed_amount numeric(14,2) not null default 0 check (tolls_fixed_amount >= 0),
  extraction_fee numeric(14,2) not null default 0 check (extraction_fee >= 0),
  cancellation_fee numeric(14,2) not null default 0 check (cancellation_fee >= 0),
  second_unit_fee numeric(14,2) not null default 0 check (second_unit_fee >= 0),
  minimum_charge numeric(14,2) not null default 0 check (minimum_charge >= 0),
  night_surcharge_pct numeric(6,2) not null default 0 check (night_surcharge_pct between 0 and 500),
  weekend_surcharge_pct numeric(6,2) not null default 0 check (weekend_surcharge_pct between 0 and 500),
  holiday_surcharge_pct numeric(6,2) not null default 0 check (holiday_surcharge_pct between 0 and 500),
  is_active boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_rate_items_general_uq on public.company_rate_items(rate_card_id, service_code) where branch_id is null and is_active;
create unique index if not exists company_rate_items_branch_uq on public.company_rate_items(rate_card_id, branch_id, service_code) where branch_id is not null and is_active;
create index if not exists company_rate_items_card_idx on public.company_rate_items(rate_card_id, service_name);

create or replace function app_private.assign_rate_card_version() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.version is null or new.version <= 0 then
    select coalesce(max(rc.version), 0) + 1 into new.version from public.company_rate_cards rc where rc.contract_id = new.contract_id;
  end if;
  return new;
end;
$$;

create or replace function app_private.prepare_company_contract() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.is_primary and new.status = 'active' then
    update public.company_contracts set is_primary = false, updated_at = now(), updated_by = auth.uid()
    where company_id = new.company_id and is_primary and status = 'active' and contract_id <> new.contract_id;
  end if;
  return new;
end;
$$;

create or replace function app_private.prepare_rate_card_activation() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.company_rate_cards
       set status = 'expired', valid_until = coalesce(valid_until, greatest(valid_from, new.valid_from - 1)), updated_at = now(), updated_by = auth.uid()
     where contract_id = new.contract_id and status = 'active' and rate_card_id <> new.rate_card_id;
  end if;
  return new;
end;
$$;

create or replace function app_private.protect_rate_card_history() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if old.status in ('active','expired','archived') then
    if old.status = 'active' and new.status not in ('active','expired','archived') then raise exception 'Un tarifario vigente solo puede finalizarse o archivarse.'; end if;
    if new.contract_id is distinct from old.contract_id or new.name is distinct from old.name or new.version is distinct from old.version or new.valid_from is distinct from old.valid_from or new.currency is distinct from old.currency or new.notes is distinct from old.notes then
      raise exception 'Los tarifarios publicados son históricos y no pueden editarse. Duplique el tarifario para crear una nueva versión.';
    end if;
    if old.status in ('expired','archived') and new.status is distinct from old.status then raise exception 'Un tarifario vencido o archivado no puede reactivarse. Duplique el tarifario.'; end if;
  end if;
  return new;
end;
$$;

create or replace function app_private.validate_company_rate_item() returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_company_id uuid; v_status text;
begin
  select c.company_id, rc.status into v_company_id, v_status from public.company_rate_cards rc join public.company_contracts c on c.contract_id = rc.contract_id
   where rc.rate_card_id = case when tg_op = 'DELETE' then old.rate_card_id else new.rate_card_id end;
  if v_company_id is null then raise exception 'Tarifario inexistente.'; end if;
  if v_status <> 'draft' then raise exception 'Solo se pueden modificar tarifas dentro de un tarifario en borrador.'; end if;
  if tg_op <> 'DELETE' and new.branch_id is not null and not exists (select 1 from public.company_branches b where b.branch_id = new.branch_id and b.company_id = v_company_id and b.is_active) then
    raise exception 'La sucursal no pertenece a la empresa del contrato o está inactiva.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger company_contracts_touch_updated_at before update on public.company_contracts for each row execute function app_private.touch_company_record();
create trigger company_contracts_prepare before insert or update on public.company_contracts for each row execute function app_private.prepare_company_contract();
create trigger company_rate_cards_assign_version before insert on public.company_rate_cards for each row execute function app_private.assign_rate_card_version();
create trigger company_rate_cards_protect_history before update on public.company_rate_cards for each row execute function app_private.protect_rate_card_history();
create trigger company_rate_cards_prepare_activation before insert or update on public.company_rate_cards for each row execute function app_private.prepare_rate_card_activation();
create trigger company_rate_cards_touch_updated_at before update on public.company_rate_cards for each row execute function app_private.touch_company_record();
create trigger company_rate_items_validate before insert or update or delete on public.company_rate_items for each row execute function app_private.validate_company_rate_item();
create trigger company_rate_items_touch_updated_at before update on public.company_rate_items for each row execute function app_private.touch_company_record();
create trigger company_contracts_audit after insert or update or delete on public.company_contracts for each row execute function public.capture_audit_event('contract_id');
create trigger company_rate_cards_audit after insert or update or delete on public.company_rate_cards for each row execute function public.capture_audit_event('rate_card_id');
create trigger company_rate_items_audit after insert or update or delete on public.company_rate_items for each row execute function public.capture_audit_event('rate_item_id');

alter table public.company_contracts enable row level security;
alter table public.company_rate_cards enable row level security;
alter table public.company_rate_items enable row level security;
revoke all on public.company_contracts from anon;
revoke all on public.company_rate_cards from anon;
revoke all on public.company_rate_items from anon;
grant select, insert, update, delete on public.company_contracts to authenticated;
grant select, insert, update, delete on public.company_rate_cards to authenticated;
grant select, insert, update, delete on public.company_rate_items to authenticated;

create policy company_contracts_select_management on public.company_contracts for select to authenticated using (app_private.current_auxilios_role() = any (array['administracion','supervision']));
create policy company_contracts_insert_admin on public.company_contracts for insert to authenticated with check (app_private.current_auxilios_role() = 'administracion');
create policy company_contracts_update_admin on public.company_contracts for update to authenticated using (app_private.current_auxilios_role() = 'administracion') with check (app_private.current_auxilios_role() = 'administracion');
create policy company_contracts_delete_admin_draft on public.company_contracts for delete to authenticated using (app_private.current_auxilios_role() = 'administracion' and status = 'draft');
create policy company_rate_cards_select_management on public.company_rate_cards for select to authenticated using (app_private.current_auxilios_role() = any (array['administracion','supervision']));
create policy company_rate_cards_insert_admin on public.company_rate_cards for insert to authenticated with check (app_private.current_auxilios_role() = 'administracion');
create policy company_rate_cards_update_admin on public.company_rate_cards for update to authenticated using (app_private.current_auxilios_role() = 'administracion') with check (app_private.current_auxilios_role() = 'administracion');
create policy company_rate_cards_delete_admin_draft on public.company_rate_cards for delete to authenticated using (app_private.current_auxilios_role() = 'administracion' and status = 'draft');
create policy company_rate_items_select_management on public.company_rate_items for select to authenticated using (app_private.current_auxilios_role() = any (array['administracion','supervision']));
create policy company_rate_items_insert_admin on public.company_rate_items for insert to authenticated with check (app_private.current_auxilios_role() = 'administracion' and exists (select 1 from public.company_rate_cards rc where rc.rate_card_id = company_rate_items.rate_card_id and rc.status = 'draft'));
create policy company_rate_items_update_admin_draft on public.company_rate_items for update to authenticated using (app_private.current_auxilios_role() = 'administracion' and exists (select 1 from public.company_rate_cards rc where rc.rate_card_id = company_rate_items.rate_card_id and rc.status = 'draft')) with check (app_private.current_auxilios_role() = 'administracion' and exists (select 1 from public.company_rate_cards rc where rc.rate_card_id = company_rate_items.rate_card_id and rc.status = 'draft'));
create policy company_rate_items_delete_admin_draft on public.company_rate_items for delete to authenticated using (app_private.current_auxilios_role() = 'administracion' and exists (select 1 from public.company_rate_cards rc where rc.rate_card_id = company_rate_items.rate_card_id and rc.status = 'draft'));

comment on table public.company_contracts is 'Fase 2A: contratos comerciales vigentes e históricos por empresa.';
comment on table public.company_rate_cards is 'Versiones de tarifarios asociadas a cada contrato. Los publicados son inmutables.';
comment on table public.company_rate_items is 'Precios y reglas por tipo de servicio y, opcionalmente, por sucursal.';
