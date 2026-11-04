-- Fixture aislado: lo mínimo de Facturación para probar los excedentes de la Prestadora.
-- Sin datos de clientes. La factura de servicios/peajes (v4) es una versión mínima:
-- acá se prueba lo que agrega la migración, no el motor de tarifas.
create role anon; create role authenticated; create schema auth; create schema app_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.current_auxilios_role() returns text language sql as $$select nullif(current_setting('test.role',true),'')$$;

create table public.users(user_id uuid primary key, full_name text);
create table public.companies(company_id uuid primary key, trade_name text, legal_name text, client_kind text);
create table public.billing_bases(base_id uuid primary key, name text);
create table public.service_concepts(concept_id uuid primary key, name text);
create table public.operator_services(
  service_id uuid primary key, company_id uuid not null references public.companies(company_id),
  service_number text, service_order_number text, scheduled_for timestamptz default '2026-11-03T15:00Z', completed_at timestamptz,
  status text not null default 'completed', billing_status text not null default 'pending', is_test boolean not null default false,
  billing_base_id uuid, customer_name text, vehicle_plate text, vehicle_make_model text, origin text, destination text,
  administrative_commercial jsonb, customer_payment_primary text, currency text default 'ARS',
  company_estimated_total numeric default 0, updated_by uuid, updated_at timestamptz);
create table public.operator_service_excess_charges(
  excess_charge_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  concept_id uuid not null references public.service_concepts(concept_id), concept_name_snapshot text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0), unit_amount numeric(14,2) not null check (unit_amount > 0),
  total_amount numeric(14,2) generated always as (round(quantity * unit_amount, 2)) stored,
  currency text not null default 'ARS', payer_agent text not null default 'customer', customer_payment_method text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), is_test boolean not null default false,
  collector_agent text not null default 'company', source text not null default 'planned', remito_excess_report_id uuid,
  constraint operator_service_excess_collector_chk check ((collector_agent = 'provider' and customer_payment_method is null)
    or (collector_agent = 'company' and customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected','to_define'))));
create table public.operator_service_tolls(service_toll_id uuid primary key default gen_random_uuid(), service_id uuid references public.operator_services(service_id));
create table public.operator_service_events(event_id bigserial primary key, service_id uuid, event_type text, from_status text, to_status text,
  notes text, created_by uuid, created_at timestamptz default now(), details jsonb);
create table public.operator_service_billing_revisions(revision_id uuid primary key default gen_random_uuid(), service_id uuid, billing_status text,
  previous_company_amount numeric(14,2), company_amount numeric(14,2), currency text, quote_snapshot jsonb, rate_card_id uuid,
  rate_card_version integer, reason text, created_by uuid, created_at timestamptz default now());

create table public.operator_invoices(
  invoice_id uuid primary key default gen_random_uuid(), invoice_sequence bigint generated always as identity unique,
  company_id uuid not null references public.companies(company_id), status text not null default 'created', currency text not null default 'ARS',
  service_count integer not null default 0, total_amount numeric(14,2) not null check (total_amount >= 0),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  document_type text, point_of_sale text, document_number text, issued_on date, notes text,
  cancelled_at timestamptz, cancelled_by uuid, cancellation_reason text, pdf_path text, pdf_name text, pdf_uploaded_at timestamptz,
  pdf_uploaded_by uuid, credited_at timestamptz, credited_by uuid, toll_count integer not null default 0,
  constraint operator_invoices_item_count_check check (service_count >= 0 and toll_count >= 0 and service_count + toll_count > 0));
create unique index operator_invoices_external_number_uq on public.operator_invoices(document_type, (point_of_sale::numeric), (document_number::numeric))
  where document_type is not null and point_of_sale is not null and document_number is not null;
create table public.operator_invoice_services(invoice_service_id uuid primary key default gen_random_uuid(), invoice_id uuid references public.operator_invoices(invoice_id),
  service_id uuid references public.operator_services(service_id), line_number integer, company_amount numeric(14,2), currency text,
  service_snapshot jsonb, quote_snapshot jsonb, created_at timestamptz default now(), released_at timestamptz, released_by uuid, release_reason text);
create table public.operator_invoice_tolls(invoice_toll_id uuid primary key default gen_random_uuid(), invoice_id uuid references public.operator_invoices(invoice_id),
  service_toll_id uuid, line_number integer, amount numeric(14,2), currency text, toll_snapshot jsonb, service_snapshot jsonb,
  released_at timestamptz, released_by uuid, release_reason text, created_at timestamptz default now());
create table public.operator_invoice_credit_notes(credit_note_id uuid primary key default gen_random_uuid(), invoice_id uuid, document_type text,
  point_of_sale text, document_number text, issued_on date, amount numeric(14,2), currency text, notes text, created_by uuid, created_at timestamptz default now());

-- Igual que producción.
create function app_private.operator_invoice_display_number(p_document_type text, p_point_of_sale text, p_document_number text, p_invoice_sequence bigint)
returns text language sql immutable set search_path to '' as $$
  select case when p_document_type is not null and p_point_of_sale is not null and p_document_number is not null
    then (case upper(p_document_type) when 'FA' then 'Factura A' when 'FB' then 'Factura B' when 'FC' then 'Factura C' else upper(p_document_type) end)
      || ' ' || p_point_of_sale || '-' || p_document_number
    else 'FAC-' || lpad(coalesce(p_invoice_sequence,0)::text,8,'0') end;
$$;

-- Versión mínima de la factura de servicios (sin peajes ni tarifas).
create function public.create_operator_invoice_v4_km_v1(p_service_ids uuid[], p_service_toll_ids uuid[], p_document_type text,
  p_point_of_sale text, p_document_number text, p_issued_on date, p_notes text default null)
returns jsonb language plpgsql set search_path to '' as $$
declare v_invoice public.operator_invoices%rowtype; v_company uuid; v_total numeric; v_n integer := coalesce(cardinality(p_service_ids),0);
begin
  if v_n = 0 then raise exception 'Seleccioná al menos un servicio o peaje'; end if;
  if exists(select 1 from public.operator_services where service_id = any(p_service_ids) and billing_status not in ('pending','reviewed')) then
    raise exception 'La selección contiene servicios que ya no están disponibles para facturar'; end if;
  select min(company_id::text)::uuid, sum(company_estimated_total) into v_company, v_total from public.operator_services where service_id = any(p_service_ids);
  if (select count(distinct company_id) from public.operator_services where service_id = any(p_service_ids)) > 1 then
    raise exception 'No se pueden facturar juntas diferentes prestadoras'; end if;
  insert into public.operator_invoices(company_id, currency, service_count, toll_count, total_amount, document_type, point_of_sale, document_number, issued_on, notes)
  values (v_company, 'ARS', v_n, 0, round(v_total,2), p_document_type, p_point_of_sale, p_document_number, p_issued_on, p_notes) returning * into v_invoice;
  insert into public.operator_invoice_services(invoice_id, service_id, line_number, company_amount, currency, service_snapshot, quote_snapshot)
  select v_invoice.invoice_id, s.service_id, row_number() over (), s.company_estimated_total, 'ARS', '{}'::jsonb, '{}'::jsonb
  from public.operator_services s where s.service_id = any(p_service_ids);
  update public.operator_services set billing_status = 'invoiced' where service_id = any(p_service_ids);
  return jsonb_build_object('invoice_id', v_invoice.invoice_id, 'invoice_sequence', v_invoice.invoice_sequence,
    'invoice_number', app_private.operator_invoice_display_number(p_document_type, p_point_of_sale, p_document_number, v_invoice.invoice_sequence),
    'company_id', v_company, 'service_count', v_n, 'toll_count', 0, 'service_total', round(v_total,2), 'toll_total', 0,
    'total_amount', v_invoice.total_amount, 'currency', 'ARS', 'status', 'created');
end $$;
