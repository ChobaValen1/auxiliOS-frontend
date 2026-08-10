-- AuxiliOS · Tarifario V3 · esquema base
create table public.service_categories (
  category_id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  legacy_primary_concept_id uuid unique references public.service_concepts(concept_id),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_code_check check (code ~ '^[a-z0-9_]{2,60}$')
);
alter table public.service_categories enable row level security;

alter table public.service_concepts
  add column quantity_source text not null default 'manual',
  add column auto_apply boolean not null default false,
  add column matrix_visible boolean not null default true,
  add constraint service_concepts_quantity_source_check
    check (quantity_source in ('manual','one','asphalt_km','gravel_km'));

alter table public.company_service_settings
  add column requires_own_code boolean not null default false;

create table public.company_service_category_settings (
  company_category_setting_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  category_id uuid not null references public.service_categories(category_id),
  is_enabled boolean not null default true,
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,category_id)
);
alter table public.company_service_category_settings enable row level security;

create table public.company_tariff_matrix_rates (
  rate_version_id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  billing_base_id uuid references public.billing_bases(base_id),
  category_id uuid not null references public.service_categories(category_id),
  concept_id uuid not null references public.service_concepts(concept_id),
  valid_from date not null,
  valid_until date,
  revision integer not null default 1,
  is_current boolean not null default true,
  currency text not null default 'ARS',
  pricing_unit text not null,
  unit_price numeric(14,2) not null,
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  superseded_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint company_tariff_matrix_rates_dates_check check (valid_until is null or valid_until >= valid_from),
  constraint company_tariff_matrix_rates_price_check check (unit_price >= 0),
  constraint company_tariff_matrix_rates_unit_check check (pricing_unit in ('service','hour','km','unit','day','fixed'))
);
alter table public.company_tariff_matrix_rates enable row level security;
create unique index company_tariff_matrix_rates_revision_uq
  on public.company_tariff_matrix_rates(
    company_id,
    coalesce(billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid),
    category_id,concept_id,valid_from,revision
  );
create index company_tariff_matrix_rates_lookup_idx
  on public.company_tariff_matrix_rates(company_id,category_id,concept_id,billing_base_id,valid_from desc,revision desc)
  where is_current;

alter table public.operator_services
  add column category_id uuid references public.service_categories(category_id);
alter table public.operator_service_items
  add column category_id uuid references public.service_categories(category_id),
  add column matrix_rate_id uuid references public.company_tariff_matrix_rates(rate_version_id),
  add column list_unit_price numeric(14,2);

create table public.operator_service_item_adjustments (
  adjustment_id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.operator_service_items(item_id) on delete restrict,
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  previous_unit_price numeric(14,2) not null,
  new_unit_price numeric(14,2) not null,
  previous_subtotal numeric(14,2) not null,
  new_subtotal numeric(14,2) not null,
  reason text not null,
  adjusted_by uuid not null default auth.uid(),
  adjusted_at timestamptz not null default now(),
  constraint operator_service_item_adjustments_price_check check (previous_unit_price >= 0 and new_unit_price >= 0),
  constraint operator_service_item_adjustments_reason_check check (length(trim(reason)) >= 5)
);
alter table public.operator_service_item_adjustments enable row level security;
create index operator_service_item_adjustments_item_idx
  on public.operator_service_item_adjustments(item_id,adjusted_at desc);

create policy service_categories_read on public.service_categories
  for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','facturacion','supervision'));
create policy service_categories_admin on public.service_categories
  for all to authenticated
  using (app_private.current_auxilios_role()='administracion')
  with check (app_private.current_auxilios_role()='administracion');
create policy company_service_category_settings_read on public.company_service_category_settings
  for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','facturacion','supervision'));
create policy company_service_category_settings_admin on public.company_service_category_settings
  for all to authenticated
  using (app_private.current_auxilios_role()='administracion')
  with check (app_private.current_auxilios_role()='administracion');
create policy company_tariff_matrix_rates_read on public.company_tariff_matrix_rates
  for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','facturacion','supervision'));
create policy company_tariff_matrix_rates_admin on public.company_tariff_matrix_rates
  for all to authenticated
  using (app_private.current_auxilios_role()='administracion')
  with check (app_private.current_auxilios_role()='administracion');
create policy operator_service_item_adjustments_read on public.operator_service_item_adjustments
  for select to authenticated
  using (app_private.current_auxilios_role() in ('administracion','facturacion','supervision'));
create policy operator_service_item_adjustments_admin on public.operator_service_item_adjustments
  for all to authenticated
  using (app_private.current_auxilios_role()='administracion')
  with check (app_private.current_auxilios_role()='administracion');

revoke all on public.service_categories,public.company_service_category_settings,public.company_tariff_matrix_rates,public.operator_service_item_adjustments from anon;
