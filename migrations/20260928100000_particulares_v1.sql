-- Servicios particulares v1.
-- ESTADO: pendiente de aplicar. Espera la decisión sobre cómo activar la cuenta
-- "Particulares" en la base compartida con producción.
--
-- Hay dos tipos de cliente: los derivados de una prestadora y los particulares
-- (clientes de una sola vez que pagan en el momento o dejan una seña, a veces
-- con el servicio programado).
--
-- Diseño: "Particulares" es una prestadora más, marcada con client_kind =
-- 'particular'. Así el alta, la asignación, el remito, el cierre y los
-- tableros funcionan igual que para cualquier prestadora. Lo que cambia:
--
-- · El precio no sale de la tarifa: se presupuesta. quoted_total guarda el
--   presupuesto y un trigger lo sostiene como total del servicio aunque otra
--   ruta de edición recalcule la cotización.
-- · Pagos: service_payments registra señas y saldos (monto, medio, quién
--   cobró). Saldo = presupuesto − pagos vigentes. La seña se retiene al
--   cancelar; sólo Administración puede anular un pago (devolución) y con motivo.
-- · Factura: algunos la piden. invoice_requested + condición frente al IVA +
--   DNI/CUIT, obligatorios cuando se pide factura.
--
-- La prestadora "Particulares" se crea con la misma configuración operativa que
-- la primera prestadora activa (bases, modo de ruta, peajes) y con todos los
-- servicios principales habilitados a precio 0: el precio real es el presupuesto.

-- ── Tipo de cliente ─────────────────────────────────────────────────────────
alter table public.companies
  add column if not exists client_kind text not null default 'prestadora';
do $$ begin
  alter table public.companies add constraint companies_client_kind_check
    check (client_kind in ('prestadora', 'particular'));
exception when duplicate_object then null; end $$;
create unique index if not exists companies_single_particular
  on public.companies (client_kind) where client_kind = 'particular' and not coalesce(is_test, false);
comment on column public.companies.client_kind is 'prestadora: deriva servicios y se le factura por lote. particular: la cuenta de clientes de una sola vez, con precio presupuestado.';

-- ── Datos del servicio particular ───────────────────────────────────────────
alter table public.operator_services
  add column if not exists quoted_total numeric(14,2),
  add column if not exists invoice_requested boolean not null default false,
  add column if not exists customer_tax_condition text;
do $$ begin
  alter table public.operator_services add constraint operator_services_quoted_total_check
    check (quoted_total is null or quoted_total >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.operator_services add constraint operator_services_tax_condition_check
    check (customer_tax_condition is null or customer_tax_condition in
      ('consumidor_final', 'monotributo', 'responsable_inscripto', 'exento'));
exception when duplicate_object then null; end $$;
comment on column public.operator_services.quoted_total is 'Presupuesto acordado con un cliente particular. Si está cargado, es el total del servicio.';

create or replace function app_private.keep_private_quote_v1()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.quoted_total is not null then
    new.base_subtotal := new.quoted_total;
    new.surcharge_total := 0;
    new.estimated_total := new.quoted_total;
    new.company_estimated_total := new.quoted_total;
  end if;
  return new;
end
$function$;

drop trigger if exists operator_services_keep_private_quote_v1 on public.operator_services;
create trigger operator_services_keep_private_quote_v1
  before insert or update on public.operator_services
  for each row execute function app_private.keep_private_quote_v1();

-- ── Pagos ───────────────────────────────────────────────────────────────────
create table if not exists public.service_payments (
  payment_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  kind text not null check (kind in ('sena', 'saldo')),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'transferencia', 'mercadopago', 'tarjeta', 'otro')),
  paid_at timestamptz not null default now(),
  received_by uuid references public.users(user_id) default auth.uid(),
  note text,
  voided_at timestamptz,
  voided_by uuid references public.users(user_id),
  void_reason text,
  created_at timestamptz not null default now(),
  check (voided_at is null or nullif(btrim(void_reason), '') is not null)
);
create index if not exists service_payments_service_idx on public.service_payments (service_id) where voided_at is null;
alter table public.service_payments enable row level security;
revoke all on public.service_payments from anon, authenticated;
comment on table public.service_payments is 'Señas y saldos cobrados a clientes particulares. Se accede por RPC.';

-- ── Prestadora "Particulares" ───────────────────────────────────────────────
do $migration$
declare
  v_company uuid;
  v_contract uuid;
  v_card uuid;
  v_setting uuid;
  v_ref public.company_billing_settings%rowtype;
begin
  select company_id into v_company from public.companies
   where client_kind = 'particular' and not coalesce(is_test, false) limit 1;
  if v_company is not null then return; end if;

  insert into public.companies (company_code, legal_name, trade_name, status, client_kind, notes, is_test)
  values ('PART', 'Particulares', 'Particulares', 'active', 'particular',
          'Clientes de una sola vez. El precio de cada servicio es el presupuesto acordado.', false)
  returning company_id into v_company;

  insert into public.company_contracts (company_id, contract_number, name, status, valid_from, currency,
                                        requires_service_order, requires_purchase_order, is_primary)
  values (v_company, 'PART-1', 'Particulares', 'active', date '2026-01-01', 'ARS', false, false, true)
  returning contract_id into v_contract;

  insert into public.company_rate_cards (contract_id, name, version, status, valid_from, currency, notes)
  -- En borrador: el tarifario no se puede activar sin conceptos; se activa al final.
  values (v_contract, 'Presupuesto', 1, 'draft', date '2026-01-01', 'ARS',
          'Precio 0: el total de cada servicio particular es su presupuesto.')
  returning rate_card_id into v_card;

  -- Misma configuración operativa que la primera prestadora real activa.
  select s.* into v_ref from public.company_billing_settings s
    join public.companies c on c.company_id = s.company_id
   where s.is_active and not coalesce(c.is_test, false) and c.client_kind = 'prestadora'
   order by s.created_at limit 1;

  insert into public.company_billing_settings (company_id, contract_id, route_mode, toll_calculation_mode,
      valid_from, requires_verified_base, is_active, covered_radius_km, movement_charge_until_km, toll_billing_mode, notes)
  values (v_company, v_contract, coalesce(v_ref.route_mode, 'base_origin_destination_base'),
      coalesce(v_ref.toll_calculation_mode, 'route_estimate'), date '2026-01-01',
      coalesce(v_ref.requires_verified_base, true), true, v_ref.covered_radius_km,
      v_ref.movement_charge_until_km, coalesce(v_ref.toll_billing_mode, 'separate'),
      'Particulares: los peajes se incluyen en el presupuesto.')
  returning billing_setting_id into v_setting;

  insert into public.company_billing_base_links (billing_setting_id, base_id, is_primary, priority, is_active)
  select v_setting, b.base_id, row_number() over (order by b.name) = 1, row_number() over (order by b.name), true
    from public.billing_bases b where coalesce(b.is_active, true);

  insert into public.company_service_settings (company_id, concept_id, is_enabled, code_mode)
  select v_company, sc.concept_id, true, 'fixed'
    from public.service_concepts sc
   where sc.is_active and sc.billing_family <> 'system'
     and (sc.default_can_be_primary or sc.default_can_be_secondary)
     and sc.code ~ '^[a-z0-9_]{2,50}$';

  insert into public.company_rate_items (rate_card_id, service_code, service_name, concept_id, base_price,
      primary_price, secondary_price, can_be_primary, can_be_secondary, pricing_unit, code_mode, is_active)
  select v_card, sc.code, sc.name, sc.concept_id, 0, 0, 0,
         coalesce(sc.default_can_be_primary, false), coalesce(sc.default_can_be_secondary, false),
         coalesce(sc.default_pricing_unit, 'service'), 'fixed', true
    from public.service_concepts sc
   where sc.is_active and sc.billing_family <> 'system'
     and (sc.default_can_be_primary or sc.default_can_be_secondary)
     and sc.code ~ '^[a-z0-9_]{2,50}$';

  update public.company_rate_cards set status = 'active' where rate_card_id = v_card;
end
$migration$;

-- ── RPC ─────────────────────────────────────────────────────────────────────

create or replace function app_private.private_company_id_v1()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select company_id from public.companies
   where client_kind = 'particular' and not coalesce(is_test, false)
   order by created_at limit 1
$function$;

create or replace function app_private.service_balance_v1(p_service_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'quoted_total', s.quoted_total,
    'paid', coalesce(p.pagado, 0),
    'deposit', coalesce(p.sena, 0),
    'balance', greatest(coalesce(s.quoted_total, 0) - coalesce(p.pagado, 0), 0))
  from public.operator_services s
  left join lateral (
    select sum(amount) as pagado, sum(amount) filter (where kind = 'sena') as sena
      from public.service_payments sp
     where sp.service_id = s.service_id and sp.voided_at is null
  ) p on true
  where s.service_id = p_service_id
$function$;

create or replace function app_private.validate_private_customer_v1(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_payload->>'customer_phone', ''), '\D', '', 'g');
  v_doc text := regexp_replace(coalesce(p_payload->>'customer_document', ''), '\D', '', 'g');
begin
  if nullif(btrim(p_payload->>'customer_name'), '') is null then
    raise exception 'Completá el nombre del cliente';
  end if;
  if length(v_phone) < 8 then
    raise exception 'Completá el teléfono del cliente';
  end if;
  if coalesce((p_payload->>'invoice_requested')::boolean, false) then
    if length(v_doc) not between 7 and 11 then
      raise exception 'Para facturar completá el DNI o CUIT del cliente';
    end if;
    if coalesce(p_payload->>'customer_tax_condition', '') not in
       ('consumidor_final', 'monotributo', 'responsable_inscripto', 'exento') then
      raise exception 'Para facturar indicá la condición frente al IVA';
    end if;
  end if;
end
$function$;

/* Alta de un servicio particular. Pasa por el alta normal (create_operator_service_v4)
   con la prestadora Particulares, y después fija el presupuesto y la seña. */
create or replace function public.create_private_service_v1(
  p_payload jsonb,
  p_quoted_total numeric,
  p_deposit jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid := app_private.private_company_id_v1();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_result jsonb;
  v_service uuid;
  v_deposit numeric := nullif(p_deposit->>'amount', '')::numeric;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para crear servicios';
  end if;
  if v_company is null then raise exception 'Falta configurar la cuenta Particulares'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  perform app_private.validate_private_customer_v1(v_payload);
  if v_deposit is not null and (v_deposit < 0 or v_deposit > p_quoted_total) then
    raise exception 'La seña no puede superar el presupuesto';
  end if;

  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  v_result := public.create_operator_service_v4(
    v_payload - 'invoice_requested' - 'customer_tax_condition' - 'quoted_total');
  v_service := (v_result->>'service_id')::uuid;

  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((v_payload->>'invoice_requested')::boolean, false),
         customer_tax_condition = nullif(v_payload->>'customer_tax_condition', ''),
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2))
   where service_id = v_service;

  if coalesce(v_deposit, 0) > 0 then
    insert into public.service_payments (service_id, kind, amount, method, note)
    values (v_service, 'sena', round(v_deposit, 2), coalesce(nullif(p_deposit->>'method', ''), 'efectivo'),
            nullif(btrim(p_deposit->>'note'), ''));
  end if;

  return v_result || jsonb_build_object('client_kind', 'particular')
                  || app_private.service_balance_v1(v_service);
end
$function$;

/* Cambiar el presupuesto o los datos de factura de un servicio particular. */
create or replace function public.update_private_service_quote_v1(
  p_service_id uuid,
  p_quoted_total numeric,
  p_invoice jsonb default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_s public.operator_services%rowtype;
  v_pagado numeric;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  select * into v_s from public.operator_services where service_id = p_service_id for update;
  if not found or v_s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  if v_s.billing_status = 'invoiced' then raise exception 'El servicio ya está facturado'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  select coalesce(sum(amount), 0) into v_pagado from public.service_payments
   where service_id = p_service_id and voided_at is null;
  if p_quoted_total < v_pagado then
    raise exception 'El presupuesto no puede ser menor a lo ya cobrado ($%)', v_pagado;
  end if;
  if p_invoice is not null then
    perform app_private.validate_private_customer_v1(jsonb_build_object(
      'customer_name', v_s.customer_name, 'customer_phone', v_s.customer_phone,
      'customer_document', coalesce(p_invoice->>'customer_document', v_s.customer_document),
      'invoice_requested', p_invoice->'invoice_requested',
      'customer_tax_condition', p_invoice->>'customer_tax_condition'));
  end if;
  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((p_invoice->>'invoice_requested')::boolean, invoice_requested),
         customer_tax_condition = case when p_invoice ? 'customer_tax_condition'
                                       then nullif(p_invoice->>'customer_tax_condition', '') else customer_tax_condition end,
         customer_document = coalesce(nullif(regexp_replace(coalesce(p_invoice->>'customer_document', ''), '\D', '', 'g'), ''), customer_document),
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2),
                                 'quote_changed_reason', nullif(btrim(p_reason), ''))
   where service_id = p_service_id;
  return app_private.service_balance_v1(p_service_id);
end
$function$;

/* Registrar un cobro (seña o saldo). Operador, Administración o el chofer asignado. */
create or replace function public.register_service_payment_v1(
  p_service_id uuid,
  p_kind text,
  p_amount numeric,
  p_method text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_s public.operator_services%rowtype;
  v_saldo numeric;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select * into v_s from public.operator_services where service_id = p_service_id for update;
  if not found or v_s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  if not (v_role in ('operador', 'administracion')
          or (v_role = 'chofer' and v_s.assigned_driver_id = auth.uid())) then
    raise exception 'Sin permiso para registrar cobros de este servicio';
  end if;
  if p_kind not in ('sena', 'saldo') then raise exception 'Tipo de cobro inválido'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Completá el monto'; end if;
  v_saldo := (app_private.service_balance_v1(p_service_id)->>'balance')::numeric;
  if p_amount > v_saldo + 0.009 then
    raise exception 'El monto supera el saldo pendiente ($%)', v_saldo;
  end if;
  insert into public.service_payments (service_id, kind, amount, method, note)
  values (p_service_id, p_kind, round(p_amount, 2), coalesce(nullif(p_method, ''), 'efectivo'), nullif(btrim(p_note), ''));
  return app_private.service_balance_v1(p_service_id);
end
$function$;

/* Anular un cobro (devolución de seña). Sólo Administración, con motivo. */
create or replace function public.void_service_payment_v1(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_service uuid;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then
    raise exception 'Sólo Administración puede anular un cobro';
  end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Indicá el motivo'; end if;
  update public.service_payments
     set voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where payment_id = p_payment_id and voided_at is null
  returning service_id into v_service;
  if v_service is null then raise exception 'Cobro inexistente o ya anulado'; end if;
  return app_private.service_balance_v1(v_service);
end
$function$;

/* Cobros de un servicio particular, con el saldo. */
create or replace function public.get_service_payments_v1(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_s public.operator_services%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  select * into v_s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if not (v_role in ('operador', 'administracion', 'supervision', 'facturacion')
          or (v_role = 'chofer' and v_s.assigned_driver_id = auth.uid())) then
    raise exception 'Sin permiso para ver los cobros de este servicio';
  end if;
  return jsonb_build_object(
    'particular', v_s.quoted_total is not null,
    'invoice_requested', v_s.invoice_requested,
    'customer_tax_condition', v_s.customer_tax_condition,
    'customer_document', v_s.customer_document,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'payment_id', p.payment_id, 'kind', p.kind, 'amount', p.amount, 'method', p.method,
               'paid_at', p.paid_at, 'note', p.note,
               'received_by', coalesce(u.full_name, u.email),
               'voided_at', p.voided_at, 'void_reason', p.void_reason)
             order by p.paid_at)
        from public.service_payments p
        left join public.users u on u.user_id = p.received_by
       where p.service_id = p_service_id), '[]'::jsonb)
  ) || app_private.service_balance_v1(p_service_id);
end
$function$;

/* Para el alta: qué prestadora es la de Particulares. */
create or replace function public.get_private_account_v1()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object('company_id', c.company_id, 'name', coalesce(c.trade_name, c.legal_name))
    from public.companies c where c.company_id = app_private.private_company_id_v1()
$function$;

revoke all on function app_private.keep_private_quote_v1() from public, anon, authenticated;
revoke all on function app_private.private_company_id_v1() from public, anon;
revoke all on function app_private.service_balance_v1(uuid) from public, anon;
revoke all on function app_private.validate_private_customer_v1(jsonb) from public, anon;
grant execute on function app_private.private_company_id_v1() to authenticated;
grant execute on function app_private.service_balance_v1(uuid) to authenticated;
grant execute on function app_private.validate_private_customer_v1(jsonb) to authenticated;

revoke all on function public.create_private_service_v1(jsonb, numeric, jsonb) from public, anon;
revoke all on function public.update_private_service_quote_v1(uuid, numeric, jsonb, text) from public, anon;
revoke all on function public.register_service_payment_v1(uuid, text, numeric, text, text) from public, anon;
revoke all on function public.void_service_payment_v1(uuid, text) from public, anon;
revoke all on function public.get_service_payments_v1(uuid) from public, anon;
revoke all on function public.get_private_account_v1() from public, anon;
grant execute on function public.create_private_service_v1(jsonb, numeric, jsonb) to authenticated;
grant execute on function public.update_private_service_quote_v1(uuid, numeric, jsonb, text) to authenticated;
grant execute on function public.register_service_payment_v1(uuid, text, numeric, text, text) to authenticated;
grant execute on function public.void_service_payment_v1(uuid, text) to authenticated;
grant execute on function public.get_service_payments_v1(uuid) to authenticated;
grant execute on function public.get_private_account_v1() to authenticated;
