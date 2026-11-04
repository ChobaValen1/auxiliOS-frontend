-- Facturación · Excedentes que cobra la Prestadora.
--
-- Antes: un excedente con «Quién cobra = Prestadora» sólo se veía en la pestaña
-- Adicionales (lectura) y ninguna factura lo incluía. Además la lista mostraba a la
-- vez la versión planificada y la real del mismo excedente.
--
-- Ahora:
-- 1) app_private.service_billing_excess_lines_v1: los excedentes vigentes de un
--    servicio, con la misma precedencia que Sueldos: corrección administrativa >
--    lo real del remito > lo planificado. Nunca dos versiones del mismo cargo.
-- 2) operator_invoice_excesses: una línea de factura por servicio con el total de
--    sus excedentes que cobra la Prestadora (importe y conceptos congelados).
-- 3) create_operator_invoice_v5_km_v1: igual que la v4 y además recibe los
--    servicios cuyos excedentes de la Prestadora se facturan. Puede crear una
--    factura sólo de excedentes.
-- 4) Anular la factura libera los excedentes; el detalle y la lista los muestran.
-- 5) Mientras están facturados, no se pueden cambiar sin anular la factura.
-- 6) list_operator_billing_extras_v2: Adicionales sin duplicados, con quién cobra,
--    de dónde sale el dato y el estado de facturación de cada excedente.
-- Los excedentes que cobra la Empresa siguen igual: se cobran al cliente y no se
-- facturan a la Prestadora.

-- ── 1) Excedentes vigentes de un servicio ─────────────────────────────────────
create or replace function app_private.service_billing_excess_lines_v1(p_service_id uuid)
returns table(
  line_key text, origin text, excess_charge_id uuid, concept_id uuid, concept_name text,
  quantity numeric, unit_amount numeric, total_amount numeric, currency text,
  payer_agent text, collector_agent text, customer_payment_method text)
language sql stable security definer set search_path = '' as $f$
  with s as (
    select os.service_id, os.administrative_commercial adm
    from public.operator_services os where os.service_id = p_service_id
  ), has_actual as (
    select exists(select 1 from public.operator_service_excess_charges e
                  where e.service_id = p_service_id and e.source = 'actual' and not coalesce(e.is_test, false)) v
  ), adm_lines as (
    select x.ord, x.e,
      case when coalesce(x.e->>'concept_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (x.e->>'concept_id')::uuid end concept_id,
      coalesce(nullif(x.e->>'quantity', '')::numeric, 1) qty,
      coalesce(nullif(x.e->>'unit_amount', '')::numeric, 0) unit
    from s cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.adm->'excess_charges') = 'array' then s.adm->'excess_charges' else '[]'::jsonb end
    ) with ordinality x(e, ord)
    where s.adm is not null
  )
  -- Corrección administrativa: manda sobre todo lo demás (igual que Sueldos).
  select 'adm:' || a.ord, 'administrative', null::uuid, a.concept_id,
    coalesce(nullif(btrim(a.e->>'concept_name'), ''), sc.name, 'Adicional'),
    round(a.qty, 2), round(a.unit, 2),
    round(coalesce(nullif(a.e->>'total_amount', '')::numeric, a.qty * a.unit), 2),
    coalesce(nullif(a.e->>'currency', ''), 'ARS'),
    coalesce(nullif(a.e->>'payer_agent', ''), 'customer'),
    -- La corrección administrativa no guarda «quién cobra»: si paga la Prestadora, cobra la Prestadora.
    coalesce(nullif(a.e->>'collector_agent', ''), case when a.e->>'payer_agent' = 'provider' then 'provider' else 'company' end),
    nullif(a.e->>'customer_payment_method', '')
  from adm_lines a left join public.service_concepts sc on sc.concept_id = a.concept_id
  union all
  -- Sin corrección: lo real del remito si existe; si no, lo planificado.
  select 'row:' || e.excess_charge_id, case when e.source = 'actual' then 'actual' else 'planned' end,
    e.excess_charge_id, e.concept_id, coalesce(e.concept_name_snapshot, sc.name, 'Adicional'),
    round(e.quantity, 2), round(e.unit_amount, 2), round(coalesce(e.total_amount, e.quantity * e.unit_amount), 2),
    coalesce(e.currency, 'ARS'), e.payer_agent, e.collector_agent, e.customer_payment_method
  from s
  join public.operator_service_excess_charges e on e.service_id = s.service_id and not coalesce(e.is_test, false)
  left join public.service_concepts sc on sc.concept_id = e.concept_id
  cross join has_actual h
  where s.adm is null
    and ((h.v and e.source = 'actual') or (not h.v and e.source in ('planned', 'manual')))
$f$;

-- Los excedentes que cobra la Prestadora, con total y una huella para detectar cambios.
create or replace function app_private.service_provider_excess_summary_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $f$
  with l as (
    select * from app_private.service_billing_excess_lines_v1(p_service_id)
    where collector_agent = 'provider' and total_amount > 0
  )
  select jsonb_build_object(
    'line_count', count(*),
    'total', coalesce(round(sum(total_amount), 2), 0),
    'currency', case when count(distinct currency) = 1 then min(currency) end,
    'currencies', count(distinct currency),
    'fingerprint', md5(coalesce(string_agg(
      concat_ws('|', coalesce(concept_id::text, concept_name), quantity::text, unit_amount::text, total_amount::text, currency),
      ';' order by coalesce(concept_id::text, concept_name), quantity, unit_amount, total_amount, currency), '')),
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'line_key', line_key, 'origin', origin, 'excess_charge_id', excess_charge_id,
      'concept_id', concept_id, 'concept_name', concept_name, 'quantity', quantity,
      'unit_amount', unit_amount, 'total_amount', total_amount, 'currency', currency,
      'payer_agent', payer_agent, 'collector_agent', collector_agent)
      order by concept_name, total_amount), '[]'::jsonb))
  from l
$f$;

revoke all on function app_private.service_billing_excess_lines_v1(uuid) from public, anon, authenticated;
revoke all on function app_private.service_provider_excess_summary_v1(uuid) from public, anon, authenticated;

-- ── 2) Líneas de factura de excedentes ────────────────────────────────────────
create table if not exists public.operator_invoice_excesses (
  invoice_excess_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.operator_invoices(invoice_id) on delete restrict,
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  line_number integer not null check (line_number > 0),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  line_count integer not null check (line_count > 0),
  excess_fingerprint text not null,
  excess_snapshot jsonb not null,
  service_snapshot jsonb not null,
  released_at timestamptz,
  released_by uuid references public.users(user_id) on delete restrict,
  release_reason text,
  created_at timestamptz not null default now()
);
create unique index if not exists operator_invoice_excesses_active_service_uq
  on public.operator_invoice_excesses(service_id) where released_at is null;
create index if not exists operator_invoice_excesses_invoice_idx on public.operator_invoice_excesses(invoice_id, line_number);
create index if not exists operator_invoice_excesses_history_idx on public.operator_invoice_excesses(service_id, created_at desc);
create index if not exists operator_invoice_excesses_released_by_idx on public.operator_invoice_excesses(released_by) where released_by is not null;
alter table public.operator_invoice_excesses enable row level security;
revoke all on public.operator_invoice_excesses from public, anon, authenticated;

alter table public.operator_invoices add column if not exists excess_count integer not null default 0;
alter table public.operator_invoices drop constraint if exists operator_invoices_item_count_check;
alter table public.operator_invoices add constraint operator_invoices_item_count_check
  check (service_count >= 0 and toll_count >= 0 and excess_count >= 0 and service_count + toll_count + excess_count > 0);

-- ── 5) Lo facturado no cambia por debajo de la factura ────────────────────────
-- Se revisa al confirmar la transacción: las correcciones borran y vuelven a
-- insertar los cargos, y sólo importa cómo quedan al final.
create or replace function app_private.guard_invoiced_provider_excess_v1()
returns trigger language plpgsql security definer set search_path = '' as $f$
declare
  v_service_id uuid;
  v_line record;
  v_label text;
begin
  v_service_id := case when tg_op = 'DELETE' then old.service_id else new.service_id end;
  select l.invoice_excess_id, l.excess_fingerprint, i.document_type, i.point_of_sale, i.document_number, i.invoice_sequence
  into v_line
  from public.operator_invoice_excesses l join public.operator_invoices i on i.invoice_id = l.invoice_id
  where l.service_id = v_service_id and l.released_at is null;
  if not found then return null; end if;

  select coalesce(nullif(os.service_order_number, ''), os.service_number) into v_label
  from public.operator_services os where os.service_id = v_service_id;
  -- new.status sólo existe cuando el disparo viene de operator_services.
  if tg_table_name = 'operator_services' then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      raise exception 'El servicio % tiene excedentes de la Prestadora facturados en %. Anulá esa factura antes de anular el servicio.',
        coalesce(v_label, 'seleccionado'),
        app_private.operator_invoice_display_number(v_line.document_type, v_line.point_of_sale, v_line.document_number, v_line.invoice_sequence);
    end if;
  end if;
  if (app_private.service_provider_excess_summary_v1(v_service_id)->>'fingerprint') is distinct from v_line.excess_fingerprint then
    raise exception 'Los excedentes que cobra la Prestadora en el servicio % ya están facturados en %. Anulá esa factura antes de cambiarlos.',
      coalesce(v_label, 'seleccionado'),
      app_private.operator_invoice_display_number(v_line.document_type, v_line.point_of_sale, v_line.document_number, v_line.invoice_sequence);
  end if;
  return null;
end
$f$;
revoke all on function app_private.guard_invoiced_provider_excess_v1() from public, anon, authenticated;

drop trigger if exists operator_service_excess_invoiced_guard_v1 on public.operator_service_excess_charges;
create constraint trigger operator_service_excess_invoiced_guard_v1
  after insert or update or delete on public.operator_service_excess_charges
  deferrable initially deferred for each row
  execute function app_private.guard_invoiced_provider_excess_v1();

drop trigger if exists operator_services_invoiced_excess_guard_v1 on public.operator_services;
create constraint trigger operator_services_invoiced_excess_guard_v1
  after update of administrative_commercial, status on public.operator_services
  deferrable initially deferred for each row
  when (old.administrative_commercial is distinct from new.administrative_commercial or old.status is distinct from new.status)
  execute function app_private.guard_invoiced_provider_excess_v1();

-- ── 3) Crear factura con excedentes de la Prestadora ──────────────────────────
create or replace function public.create_operator_invoice_v5_km_v1(
  p_service_ids uuid[], p_service_toll_ids uuid[], p_excess_service_ids uuid[],
  p_document_type text, p_point_of_sale text, p_document_number text, p_issued_on date, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_excess uuid[] := coalesce(p_excess_service_ids, '{}'::uuid[]);
  v_excess_count integer := coalesce(cardinality(p_excess_service_ids), 0);
  v_item_count integer := coalesce(cardinality(p_service_ids), 0) + coalesce(cardinality(p_service_toll_ids), 0);
  v_type text := upper(btrim(coalesce(p_document_type, '')));
  v_pos text := btrim(coalesce(p_point_of_sale, ''));
  v_number text := btrim(coalesce(p_document_number, ''));
  v_display text;
  v_result jsonb;
  v_invoice public.operator_invoices%rowtype;
  v_company uuid;
  v_company_name text;
  v_currency text;
  v_total numeric := 0;
  v_summaries jsonb := '{}'::jsonb;
  v_summary jsonb;
  v_label text;
  v_line integer := 0;
  v_id uuid;
  s public.operator_services%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'facturacion') then
    raise exception 'Sin permiso para facturar';
  end if;
  if v_excess_count = 0 then
    return public.create_operator_invoice_v4_km_v1(p_service_ids, p_service_toll_ids, p_document_type, p_point_of_sale, p_document_number, p_issued_on, p_notes);
  end if;
  if v_excess_count > 500 or v_item_count + v_excess_count > 1000 then raise exception 'La factura contiene demasiados conceptos'; end if;
  if (select count(distinct x) from unnest(v_excess) x) <> v_excess_count then raise exception 'La selección contiene excedentes duplicados'; end if;

  -- Un solo bloqueo ordenado para todo lo que toca la factura: evita bloqueos cruzados.
  perform 1 from public.operator_services x
  where x.service_id in (
    select unnest(v_excess) union select unnest(coalesce(p_service_ids, '{}'::uuid[]))
    union select t.service_id from public.operator_service_tolls t where t.service_toll_id = any(coalesce(p_service_toll_ids, '{}'::uuid[])))
  order by x.service_id for update;

  foreach v_id in array v_excess loop
    select * into s from public.operator_services where service_id = v_id;
    if not found then raise exception 'La selección contiene un servicio inexistente'; end if;
    v_label := coalesce(nullif(s.service_order_number, ''), s.service_number, 'seleccionado');
    if s.status <> 'completed' or coalesce(s.is_test, false) or coalesce(s.billing_status, '') not in ('pending', 'reviewed', 'invoiced') then
      raise exception 'Los excedentes del servicio % ya no están disponibles para facturar', v_label;
    end if;
    if exists(select 1 from public.operator_invoice_excesses l where l.service_id = v_id and l.released_at is null) then
      raise exception 'Los excedentes del servicio % ya fueron facturados', v_label;
    end if;
    v_summary := app_private.service_provider_excess_summary_v1(v_id);
    if (v_summary->>'line_count')::integer = 0 or (v_summary->>'total')::numeric <= 0 then
      raise exception 'El servicio % no tiene excedentes que cobre la Prestadora', v_label;
    end if;
    if v_summary->>'currency' is null then raise exception 'Los excedentes del servicio % mezclan monedas', v_label; end if;
    if v_company is null then v_company := s.company_id;
    elsif v_company <> s.company_id then raise exception 'No se pueden facturar juntas diferentes prestadoras';
    end if;
    if v_currency is null then v_currency := v_summary->>'currency';
    elsif v_currency <> v_summary->>'currency' then raise exception 'No se pueden mezclar monedas en una misma factura';
    end if;
    v_summaries := v_summaries || jsonb_build_object(v_id::text, v_summary);
    v_total := v_total + (v_summary->>'total')::numeric;
  end loop;

  if v_item_count > 0 then
    -- Servicios y peajes: la factura de siempre, con todas sus validaciones.
    v_result := public.create_operator_invoice_v4_km_v1(p_service_ids, p_service_toll_ids, p_document_type, p_point_of_sale, p_document_number, p_issued_on, p_notes);
    if (v_result->>'company_id')::uuid <> v_company then raise exception 'No se pueden facturar juntas diferentes prestadoras'; end if;
    if coalesce(v_result->>'currency', 'ARS') <> v_currency then raise exception 'No se pueden mezclar monedas en una misma factura'; end if;
    select * into v_invoice from public.operator_invoices where invoice_id = (v_result->>'invoice_id')::uuid for update;
  else
    -- Sólo excedentes: mismas reglas de comprobante que create_operator_invoice_v3.
    if v_type not in ('FA', 'FB', 'FC') then raise exception 'Seleccioná un tipo de comprobante válido'; end if;
    if v_pos !~ '^[0-9]{1,10}$' then raise exception 'El punto de venta debe contener sólo números'; end if;
    if v_number !~ '^[0-9]{1,20}$' then raise exception 'El número de factura debe contener sólo números'; end if;
    if p_issued_on is null then raise exception 'Ingresá la fecha de emisión'; end if;
    if length(coalesce(p_notes, '')) > 300 then raise exception 'Las observaciones no pueden superar 300 caracteres'; end if;
    v_display := app_private.operator_invoice_display_number(v_type, v_pos, v_number, 0);
    if exists(
      select 1 from public.operator_invoices i
      where i.document_type = v_type and i.point_of_sale is not null and i.document_number is not null
        and (i.point_of_sale)::numeric = (v_pos)::numeric and (i.document_number)::numeric = (v_number)::numeric
    ) then raise exception 'Ya existe la %', v_display; end if;
    begin
      insert into public.operator_invoices(
        company_id, currency, service_count, toll_count, excess_count, total_amount,
        document_type, point_of_sale, document_number, issued_on, notes
      ) values (
        v_company, v_currency, 0, 0, v_excess_count, 0,
        v_type, v_pos, v_number, p_issued_on, nullif(btrim(coalesce(p_notes, '')), '')
      ) returning * into v_invoice;
    exception when unique_violation then
      raise exception 'Ya existe la %', v_display;
    end;
  end if;

  v_display := app_private.operator_invoice_display_number(v_invoice.document_type, v_invoice.point_of_sale, v_invoice.document_number, v_invoice.invoice_sequence);
  select coalesce(c.trade_name, c.legal_name, 'Prestadora') into v_company_name from public.companies c where c.company_id = v_company;

  foreach v_id in array v_excess loop
    v_line := v_line + 1;
    select * into s from public.operator_services where service_id = v_id;
    v_summary := v_summaries->v_id::text;
    begin
      insert into public.operator_invoice_excesses(
        invoice_id, service_id, line_number, amount, currency, line_count, excess_fingerprint, excess_snapshot, service_snapshot
      ) values (
        v_invoice.invoice_id, v_id, v_line, (v_summary->>'total')::numeric, v_currency,
        (v_summary->>'line_count')::integer, v_summary->>'fingerprint', v_summary->'lines',
        jsonb_build_object(
          'service_id', s.service_id, 'service_number', s.service_number, 'service_order_number', s.service_order_number,
          'scheduled_for', s.scheduled_for, 'completed_at', s.completed_at, 'billing_base_id', s.billing_base_id,
          'customer_name', s.customer_name, 'vehicle_plate', s.vehicle_plate, 'vehicle_make_model', s.vehicle_make_model,
          'origin', s.origin, 'destination', s.destination)
      );
    exception when unique_violation then
      raise exception 'Los excedentes del servicio % ya fueron facturados', coalesce(nullif(s.service_order_number, ''), s.service_number);
    end;
    insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by, details)
    values (v_id, 'billing_excess_invoiced', 'completed', 'completed', 'Excedentes de la Prestadora incorporados a Factura', auth.uid(),
      jsonb_build_object('invoice_id', v_invoice.invoice_id, 'invoice_number', v_display,
        'amount', (v_summary->>'total')::numeric, 'currency', v_currency, 'line_count', (v_summary->>'line_count')::integer));
  end loop;

  update public.operator_invoices
  set excess_count = v_excess_count, total_amount = round(total_amount + v_total, 2), updated_at = now()
  where invoice_id = v_invoice.invoice_id
  returning * into v_invoice;

  return coalesce(v_result, jsonb_build_object(
      'invoice_id', v_invoice.invoice_id, 'invoice_sequence', v_invoice.invoice_sequence,
      'document_type', v_invoice.document_type, 'point_of_sale', v_invoice.point_of_sale,
      'document_number', v_invoice.document_number, 'issued_on', v_invoice.issued_on, 'notes', v_invoice.notes,
      'status', v_invoice.status, 'company_id', v_company, 'company_name', v_company_name,
      'service_count', 0, 'toll_count', 0, 'service_total', 0, 'toll_total', 0, 'created_at', v_invoice.created_at))
    || jsonb_build_object(
      'invoice_number', v_display, 'excess_count', v_excess_count, 'excess_total', round(v_total, 2),
      'total_amount', v_invoice.total_amount, 'currency', v_invoice.currency);
end
$f$;
revoke all on function public.create_operator_invoice_v5_km_v1(uuid[], uuid[], uuid[], text, text, text, date, text) from public, anon;
grant execute on function public.create_operator_invoice_v5_km_v1(uuid[], uuid[], uuid[], text, text, text, date, text) to authenticated;

-- ── 4) Anular libera también los excedentes ───────────────────────────────────
create or replace function public.annul_operator_invoice_v2(p_invoice_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_invoice public.operator_invoices%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_service_count integer:=0;
  v_toll_count integer:=0;
  v_excess_count integer:=0;
  r record;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para anular facturas'; end if;
  if length(v_reason)<3 then raise exception 'Ingresá un motivo de anulación'; end if;
  if length(v_reason)>300 then raise exception 'El motivo no puede superar 300 caracteres'; end if;

  select * into v_invoice from public.operator_invoices where invoice_id=p_invoice_id for update;
  if not found then raise exception 'Factura inexistente'; end if;
  if v_invoice.status='cancelled' then raise exception 'La factura ya está anulada'; end if;
  if v_invoice.status='credited' then raise exception 'La factura tiene una Nota de Crédito y no puede anularse administrativamente'; end if;

  perform 1
  from public.operator_services s
  where s.service_id in (
    select l.service_id from public.operator_invoice_services l
    where l.invoice_id=p_invoice_id and l.released_at is null
    union
    select t.service_id
    from public.operator_invoice_tolls it
    join public.operator_service_tolls t on t.service_toll_id=it.service_toll_id
    where it.invoice_id=p_invoice_id and it.released_at is null
    union
    select x.service_id from public.operator_invoice_excesses x
    where x.invoice_id=p_invoice_id and x.released_at is null
  )
  order by s.service_id
  for update;

  for r in
    select l.service_id,l.company_amount,l.currency,l.quote_snapshot
    from public.operator_invoice_services l
    where l.invoice_id=p_invoice_id and l.released_at is null
    order by l.line_number
  loop
    update public.operator_services
    set billing_status='pending',updated_by=auth.uid(),updated_at=now()
    where service_id=r.service_id and billing_status='invoiced';

    insert into public.operator_service_billing_revisions(
      service_id,billing_status,previous_company_amount,company_amount,currency,
      quote_snapshot,rate_card_id,rate_card_version,reason
    ) values(
      r.service_id,'pending',r.company_amount,r.company_amount,r.currency,r.quote_snapshot,
      nullif(r.quote_snapshot->>'rate_card_id','')::uuid,
      nullif(r.quote_snapshot->>'rate_card_version','')::integer,'Factura anulada · '||v_reason
    );

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_invoice_cancelled','completed','completed',
      'Factura anulada; servicio devuelto a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'reason',v_reason,'billing_status','pending')
    );
    v_service_count:=v_service_count+1;
  end loop;

  for r in
    select it.service_toll_id,t.service_id,it.amount,it.currency
    from public.operator_invoice_tolls it
    join public.operator_service_tolls t on t.service_toll_id=it.service_toll_id
    where it.invoice_id=p_invoice_id and it.released_at is null
    order by it.line_number
  loop
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_toll_invoice_cancelled','completed','completed',
      'Factura anulada; peaje devuelto a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'service_toll_id',r.service_toll_id,
        'reason',v_reason,'amount',r.amount,'currency',r.currency)
    );
    v_toll_count:=v_toll_count+1;
  end loop;

  for r in
    select x.service_id,x.amount,x.currency
    from public.operator_invoice_excesses x
    where x.invoice_id=p_invoice_id and x.released_at is null
    order by x.line_number
  loop
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_excess_invoice_cancelled','completed','completed',
      'Factura anulada; excedentes de la Prestadora devueltos a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'reason',v_reason,'amount',r.amount,'currency',r.currency)
    );
    v_excess_count:=v_excess_count+1;
  end loop;

  update public.operator_invoice_services
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoice_tolls
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoice_excesses
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoices
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_reason=v_reason,updated_at=now()
  where invoice_id=p_invoice_id;

  return jsonb_build_object(
    'invoice_id',p_invoice_id,'status','cancelled',
    'released_service_count',v_service_count,'released_toll_count',v_toll_count,
    'released_excess_count',v_excess_count,'reason',v_reason
  );
end;
$function$;

-- Detalle de factura: suma las líneas de excedentes.
create or replace function public.get_operator_invoice_detail_v2(p_invoice_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_invoice jsonb;
  v_lines jsonb;
  v_toll_lines jsonb;
  v_excess_lines jsonb;
  v_credit_note jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturas'; end if;

  select jsonb_build_object(
    'invoice_id',i.invoice_id,
    'invoice_number',app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence),
    'document_type',i.document_type,'point_of_sale',i.point_of_sale,'document_number',i.document_number,
    'issued_on',i.issued_on,'notes',i.notes,'company_id',i.company_id,
    'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
    'status',i.status,'currency',i.currency,'service_count',i.service_count,'toll_count',i.toll_count,
    'excess_count',i.excess_count,
    'total_amount',i.total_amount,'created_by_name',coalesce(u.full_name,'Usuario'),
    'created_at',i.created_at,'updated_at',i.updated_at,'pdf_path',i.pdf_path,'pdf_name',i.pdf_name,
    'pdf_uploaded_at',i.pdf_uploaded_at,'cancelled_at',i.cancelled_at,
    'cancellation_reason',i.cancellation_reason,'credited_at',i.credited_at
  ) into v_invoice
  from public.operator_invoices i
  join public.companies c on c.company_id=i.company_id
  left join public.users u on u.user_id=i.created_by
  where i.invoice_id=p_invoice_id;

  if v_invoice is null then raise exception 'Factura inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_service_id',l.invoice_service_id,'service_id',l.service_id,'line_number',l.line_number,
    'company_amount',l.company_amount,'currency',l.currency,'service_snapshot',l.service_snapshot,
    'quote_snapshot',l.quote_snapshot,'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_lines
  from public.operator_invoice_services l where l.invoice_id=p_invoice_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_toll_id',l.invoice_toll_id,'service_toll_id',l.service_toll_id,'line_number',l.line_number,
    'amount',l.amount,'currency',l.currency,'toll_snapshot',l.toll_snapshot,'service_snapshot',l.service_snapshot,
    'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_toll_lines
  from public.operator_invoice_tolls l where l.invoice_id=p_invoice_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_excess_id',l.invoice_excess_id,'service_id',l.service_id,'line_number',l.line_number,
    'amount',l.amount,'currency',l.currency,'line_count',l.line_count,'excess_snapshot',l.excess_snapshot,
    'service_snapshot',l.service_snapshot,'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_excess_lines
  from public.operator_invoice_excesses l where l.invoice_id=p_invoice_id;

  select jsonb_build_object(
    'credit_note_id',cn.credit_note_id,'document_type',cn.document_type,'point_of_sale',cn.point_of_sale,
    'document_number',cn.document_number,'issued_on',cn.issued_on,'amount',cn.amount,'currency',cn.currency,
    'notes',cn.notes,'created_at',cn.created_at
  ) into v_credit_note
  from public.operator_invoice_credit_notes cn where cn.invoice_id=p_invoice_id;

  return jsonb_build_object('invoice',v_invoice,'lines',v_lines,'toll_lines',v_toll_lines,
    'excess_lines',v_excess_lines,'credit_note',v_credit_note);
end;
$function$;

-- Lista de facturas: cuenta los excedentes y los encuentra en la búsqueda.
create or replace function public.list_operator_invoices_v2(p_search text default null::text, p_company_id uuid default null::uuid, p_period_start date default null::date, p_period_end date default null::date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_search text:=lower(btrim(coalesce(p_search,'')));
  v_rows jsonb;
  v_companies jsonb;
  v_periods jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturas'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('company_id',x.company_id,'company_name',x.company_name) order by x.company_name),'[]'::jsonb)
  into v_companies
  from (
    select distinct i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_invoices i join public.companies c on c.company_id=i.company_id
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
  into v_periods
  from (
    select distinct to_char(coalesce(i.issued_on,i.created_at::date),'YYYY-MM') period
    from public.operator_invoices i
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select i.invoice_id,
      app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence) invoice_number,
      i.document_type,i.point_of_sale,i.document_number,i.issued_on,i.notes,
      i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
      i.status,i.currency,i.service_count,i.toll_count,i.excess_count,i.total_amount,i.created_at,i.updated_at,
      coalesce(u.full_name,'Usuario') created_by_name,
      i.pdf_path,i.pdf_name,i.pdf_uploaded_at,i.cancelled_at,i.cancellation_reason,i.credited_at,
      cn.credit_note_id,cn.document_type credit_note_type,cn.point_of_sale credit_note_point_of_sale,
      cn.document_number credit_note_number,cn.issued_on credit_note_issued_on,cn.amount credit_note_amount
    from public.operator_invoices i
    join public.companies c on c.company_id=i.company_id
    left join public.users u on u.user_id=i.created_by
    left join public.operator_invoice_credit_notes cn on cn.invoice_id=i.invoice_id
    where (p_company_id is null or i.company_id=p_company_id)
      and (p_period_start is null or coalesce(i.issued_on,i.created_at::date)>=p_period_start)
      and (p_period_end is null or coalesce(i.issued_on,i.created_at::date)<=p_period_end)
      and (
        v_search=''
        or lower(app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence)) like '%'||v_search||'%'
        or lower(coalesce(c.trade_name,c.legal_name,'')) like '%'||v_search||'%'
        or lower(coalesce(cn.document_type||' '||cn.point_of_sale||'-'||cn.document_number,'')) like '%'||v_search||'%'
        or exists(select 1 from public.operator_invoice_services l where l.invoice_id=i.invoice_id and lower(l.service_snapshot::text) like '%'||v_search||'%')
        or exists(select 1 from public.operator_invoice_tolls t where t.invoice_id=i.invoice_id and lower(t.toll_snapshot::text||' '||t.service_snapshot::text) like '%'||v_search||'%')
        or exists(select 1 from public.operator_invoice_excesses e where e.invoice_id=i.invoice_id and lower(e.excess_snapshot::text||' '||e.service_snapshot::text) like '%'||v_search||'%')
      )
  ) x;

  return jsonb_build_object('rows',v_rows,'filters',jsonb_build_object('companies',v_companies,'periods',v_periods));
end;
$function$;

-- ── 6) Adicionales: sin duplicados, con quién cobra y su facturación ──────────
create or replace function public.list_operator_billing_extras_v2(
  p_search text default null, p_company_id uuid default null, p_period_start date default null, p_period_end date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
declare v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'line_key', s.service_id::text || ':' || l.line_key, 'excess_charge_id', l.excess_charge_id,
      'service_id', s.service_id, 'service_number', s.service_number, 'service_order_number', s.service_order_number,
      'scheduled_for', s.scheduled_for, 'company_id', s.company_id,
      'company_name', coalesce(c.trade_name, c.legal_name, 'Prestadora'), 'client_kind', c.client_kind,
      'billing_base_name', b.name, 'concept_name', l.concept_name, 'origin', l.origin,
      'quantity', l.quantity, 'unit_amount', l.unit_amount, 'total_amount', l.total_amount, 'currency', l.currency,
      'payer_agent', l.payer_agent, 'collector_agent', l.collector_agent,
      'customer_payment_method', case when l.collector_agent = 'company' then coalesce(l.customer_payment_method,
        nullif(s.administrative_commercial#>>'{customer_payment,primary}', ''), s.customer_payment_primary) end,
      'service_billing_status', s.billing_status, 'billing_status', s.billing_status,
      'customer_name', s.customer_name, 'vehicle_plate', s.vehicle_plate,
      'invoice_id', inv.invoice_id, 'invoice_number', inv.invoice_number, 'invoiced_at', inv.created_at,
      'invoiceable', l.collector_agent = 'provider' and l.total_amount > 0 and inv.invoice_id is null)
      order by s.scheduled_for desc, s.service_id, l.line_key)
    from public.operator_services s
    join public.companies c on c.company_id = s.company_id
    left join public.billing_bases b on b.base_id = s.billing_base_id
    cross join lateral app_private.service_billing_excess_lines_v1(s.service_id) l
    left join lateral (
      select x.invoice_id, x.created_at,
        app_private.operator_invoice_display_number(i.document_type, i.point_of_sale, i.document_number, i.invoice_sequence) invoice_number
      from public.operator_invoice_excesses x join public.operator_invoices i on i.invoice_id = x.invoice_id
      where l.collector_agent = 'provider' and x.service_id = s.service_id and x.released_at is null
    ) inv on true
    where s.status = 'completed' and s.billing_status in ('pending', 'reviewed', 'invoiced')
      and not coalesce(s.is_test, false)
      and (p_company_id is null or s.company_id = p_company_id)
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_period_end)
      and (v_search = '' or lower(concat_ws(' ', s.service_number, s.service_order_number, s.customer_name, s.vehicle_plate,
            c.trade_name, c.legal_name, l.concept_name)) like '%' || v_search || '%')
  ), '[]'::jsonb);
end
$f$;
revoke all on function public.list_operator_billing_extras_v2(text, uuid, date, date) from public, anon;
grant execute on function public.list_operator_billing_extras_v2(text, uuid, date, date) to authenticated;
