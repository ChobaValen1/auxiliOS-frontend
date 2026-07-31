create sequence if not exists public.company_code_seq start with 1;

create table if not exists public.companies (
  company_id uuid primary key default gen_random_uuid(),
  company_code text not null default ('EMP-' || lpad(nextval('public.company_code_seq')::text, 5, '0')),
  legal_name text not null,
  trade_name text,
  cuit text,
  status text not null default 'active',
  phone text,
  whatsapp text,
  operational_email text,
  billing_email text,
  payment_terms_days integer not null default 30,
  notes text,
  created_by uuid references public.users(user_id) on delete set null default auth.uid(),
  updated_by uuid references public.users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_code_unique unique (company_code),
  constraint companies_legal_name_not_blank check (length(btrim(legal_name)) >= 2),
  constraint companies_cuit_format check (cuit is null or cuit ~ '^[0-9]{11}$'),
  constraint companies_status_check check (status in ('active', 'suspended', 'inactive')),
  constraint companies_payment_terms_check check (payment_terms_days between 0 and 365)
);

create unique index if not exists companies_cuit_unique on public.companies (cuit) where cuit is not null;
create index if not exists companies_status_idx on public.companies (status);
create index if not exists companies_name_search_idx on public.companies (lower(legal_name), lower(coalesce(trade_name, '')));

create table if not exists public.company_contacts (
  contact_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  full_name text not null,
  job_title text,
  contact_type text not null default 'operativo',
  phone text,
  whatsapp text,
  email text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.users(user_id) on delete set null default auth.uid(),
  updated_by uuid references public.users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_contacts_name_not_blank check (length(btrim(full_name)) >= 2),
  constraint company_contacts_type_check check (contact_type in ('operativo', 'facturacion', 'comercial', 'otro')),
  constraint company_contacts_has_channel check (
    nullif(btrim(coalesce(phone, '')), '') is not null
    or nullif(btrim(coalesce(whatsapp, '')), '') is not null
    or nullif(btrim(coalesce(email, '')), '') is not null
  )
);

create index if not exists company_contacts_company_idx on public.company_contacts (company_id, is_active);
create unique index if not exists company_contacts_primary_type_unique on public.company_contacts (company_id, contact_type) where is_primary and is_active;

create table if not exists public.company_branches (
  branch_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  branch_code text,
  name text not null,
  address text not null,
  city text,
  province text not null default 'Buenos Aires',
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  phone text,
  operational_email text,
  schedule_notes text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.users(user_id) on delete set null default auth.uid(),
  updated_by uuid references public.users(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_branches_name_not_blank check (length(btrim(name)) >= 2),
  constraint company_branches_address_not_blank check (length(btrim(address)) >= 3),
  constraint company_branches_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint company_branches_longitude_check check (longitude is null or longitude between -180 and 180)
);

create index if not exists company_branches_company_idx on public.company_branches (company_id, is_active);
create unique index if not exists company_branches_code_unique on public.company_branches (company_id, lower(branch_code)) where branch_code is not null;
create unique index if not exists company_branches_primary_unique on public.company_branches (company_id) where is_primary and is_active;

create or replace function app_private.touch_company_record()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function app_private.touch_company_record() from public, anon, authenticated;

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at before update on public.companies for each row execute function app_private.touch_company_record();
drop trigger if exists company_contacts_touch_updated_at on public.company_contacts;
create trigger company_contacts_touch_updated_at before update on public.company_contacts for each row execute function app_private.touch_company_record();
drop trigger if exists company_branches_touch_updated_at on public.company_branches;
create trigger company_branches_touch_updated_at before update on public.company_branches for each row execute function app_private.touch_company_record();

alter table public.companies enable row level security;
alter table public.company_contacts enable row level security;
alter table public.company_branches enable row level security;

revoke all on public.companies, public.company_contacts, public.company_branches from anon;
revoke all on public.companies, public.company_contacts, public.company_branches from authenticated;
grant select, insert, update, delete on public.companies, public.company_contacts, public.company_branches to authenticated;
grant usage, select on sequence public.company_code_seq to authenticated;
revoke all on sequence public.company_code_seq from anon;

create policy companies_select_management on public.companies for select to authenticated using ((select app_private.current_auxilios_role()) = any (array['administracion'::text, 'supervision'::text]));
create policy companies_insert_admin on public.companies for insert to authenticated with check ((select app_private.current_auxilios_role()) = 'administracion');
create policy companies_update_admin on public.companies for update to authenticated using ((select app_private.current_auxilios_role()) = 'administracion') with check ((select app_private.current_auxilios_role()) = 'administracion');
create policy companies_delete_admin on public.companies for delete to authenticated using ((select app_private.current_auxilios_role()) = 'administracion');

create policy company_contacts_select_management on public.company_contacts for select to authenticated using ((select app_private.current_auxilios_role()) = any (array['administracion'::text, 'supervision'::text]));
create policy company_contacts_insert_admin on public.company_contacts for insert to authenticated with check ((select app_private.current_auxilios_role()) = 'administracion' and exists (select 1 from public.companies c where c.company_id = company_contacts.company_id));
create policy company_contacts_update_admin on public.company_contacts for update to authenticated using ((select app_private.current_auxilios_role()) = 'administracion') with check ((select app_private.current_auxilios_role()) = 'administracion' and exists (select 1 from public.companies c where c.company_id = company_contacts.company_id));
create policy company_contacts_delete_admin on public.company_contacts for delete to authenticated using ((select app_private.current_auxilios_role()) = 'administracion');

create policy company_branches_select_management on public.company_branches for select to authenticated using ((select app_private.current_auxilios_role()) = any (array['administracion'::text, 'supervision'::text]));
create policy company_branches_insert_admin on public.company_branches for insert to authenticated with check ((select app_private.current_auxilios_role()) = 'administracion' and exists (select 1 from public.companies c where c.company_id = company_branches.company_id));
create policy company_branches_update_admin on public.company_branches for update to authenticated using ((select app_private.current_auxilios_role()) = 'administracion') with check ((select app_private.current_auxilios_role()) = 'administracion' and exists (select 1 from public.companies c where c.company_id = company_branches.company_id));
create policy company_branches_delete_admin on public.company_branches for delete to authenticated using ((select app_private.current_auxilios_role()) = 'administracion');

comment on table public.companies is 'Empresas contratantes y clientes corporativos de AuxiliOS.';
comment on table public.company_contacts is 'Contactos operativos, comerciales y de facturación por empresa.';
comment on table public.company_branches is 'Sucursales, bases y sedes operativas de cada empresa.';
