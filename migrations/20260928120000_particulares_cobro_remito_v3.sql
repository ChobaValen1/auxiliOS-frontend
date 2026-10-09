-- Particulares v3: el cobro del servicio en el remito del chofer.
--
-- En un servicio particular el cliente paga todo el servicio. El remito del
-- chofer suma un paso de cobro: el saldo (presupuesto − seña), con uno o dos
-- medios de pago, o "No cobré" con motivo (el servicio igual se cierra y el
-- saldo queda pendiente). Los adicionales fuera del presupuesto siguen siendo
-- líneas de excedente del remito, con su revisión de siempre.
--
-- · El cobro viaja en el remito (payload.customer_collections, kind
--   'private_service'): funciona con la misma cola offline del remito.
-- · save_driver_operator_service_remito_v5 envuelve a v4 y guarda el reporte
--   en service_collection_reports (uno por remito).
-- · Administración lo revisa: al aprobarlo se registran los cobros en
--   service_payments y el saldo baja.
-- · Los medios de pago pasan a ser los mismos del remito:
--   cash, transfer, card, mercado_pago, other.

-- ── Medios de pago unificados ───────────────────────────────────────────────
update public.service_payments set method = case method
  when 'efectivo' then 'cash' when 'transferencia' then 'transfer' when 'tarjeta' then 'card'
  when 'mercadopago' then 'mercado_pago' when 'otro' then 'other' else method end;
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.service_payments'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%method%';
  if c is not null then execute format('alter table public.service_payments drop constraint %I', c); end if;
end $$;
alter table public.service_payments add constraint service_payments_method_check
  check (method in ('cash', 'transfer', 'card', 'mercado_pago', 'other'));

do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.create_private_service_v1(jsonb,numeric,jsonb)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$coalesce(nullif(p_deposit->>'method', ''), 'efectivo')$a$, $a$coalesce(nullif(p_deposit->>'method', ''), 'cash')$a$);
  if v_sql = v_before then raise exception 'create_private_service_v1: no se encontró el medio por defecto'; end if;
  execute v_sql;

  select pg_get_functiondef('public.register_service_payment_v1(uuid,text,numeric,text,text)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $a$coalesce(nullif(p_method, ''), 'efectivo')$a$, $a$coalesce(nullif(p_method, ''), 'cash')$a$);
  if v_sql = v_before then raise exception 'register_service_payment_v1: no se encontró el medio por defecto'; end if;
  execute v_sql;
end
$migration$;

-- ── Reporte de cobro del chofer ─────────────────────────────────────────────
create table if not exists public.service_collection_reports (
  report_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  driver_id uuid references public.users(user_id),
  lines jsonb not null default '[]'::jsonb,
  collected_total numeric(14,2) not null default 0,
  not_collected boolean not null default false,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.users(user_id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (remito_id),
  check (not not_collected or nullif(btrim(reason), '') is not null)
);
create index if not exists service_collection_reports_service_idx on public.service_collection_reports (service_id);
alter table public.service_collection_reports enable row level security;
revoke all on public.service_collection_reports from anon, authenticated;
comment on table public.service_collection_reports is 'Lo que el chofer informó que cobró del servicio particular en el remito. Se aprueba en Administración.';

/* Para el remito del chofer: si el servicio es particular y cuánto cobrar. */
create or replace function public.get_driver_private_collection_v1(p_service_id uuid)
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
  if not (v_role in ('operador', 'administracion', 'supervision')
          or (v_role = 'chofer' and v_s.assigned_driver_id = auth.uid())) then
    raise exception 'Sin permiso para este servicio';
  end if;
  if v_s.quoted_total is null then return jsonb_build_object('particular', false); end if;
  return jsonb_build_object('particular', true, 'customer_name', v_s.customer_name)
         || app_private.service_balance_v1(p_service_id);
end
$function$;

create or replace function app_private.normalize_private_collection_v1(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_amount numeric;
  v_method text;
begin
  for v_line in select * from jsonb_array_elements(coalesce(p_value->'lines', '[]'::jsonb)) loop
    v_amount := round(coalesce(nullif(v_line->>'amount', '')::numeric, 0), 2);
    v_method := v_line->>'method';
    if v_amount <= 0 then continue; end if;
    if v_method not in ('cash', 'transfer', 'card', 'mercado_pago', 'other') then
      raise exception 'Medio de pago inválido en el cobro del servicio';
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('amount', v_amount, 'method', v_method));
  end loop;
  if jsonb_array_length(v_lines) > 2 then raise exception 'El cobro admite hasta dos medios de pago'; end if;
  return jsonb_build_object(
    'lines', v_lines,
    'not_collected', coalesce((p_value->>'not_collected')::boolean, false),
    'reason', nullif(btrim(p_value->>'reason'), ''));
end
$function$;

/* Guardar el remito del chofer y, si es particular, su cobro. */
create or replace function public.save_driver_operator_service_remito_v5(
  p_service_id uuid,
  p_payload jsonb,
  p_client_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_s public.operator_services%rowtype;
  v_remito integer;
  v_c jsonb;
  v_total numeric;
  v_saldo numeric;
  v_report public.service_collection_reports%rowtype;
begin
  v_result := public.save_driver_operator_service_remito_v4(p_service_id, p_payload - 'customer_collections', p_client_operation_id);
  if coalesce(p_payload->'customer_collections'->>'kind', '') <> 'private_service' then return v_result; end if;

  select * into v_s from public.operator_services where service_id = p_service_id;
  if v_s.quoted_total is null then return v_result; end if;
  v_remito := coalesce(nullif(v_result->>'remito_id', '')::integer,
    (select r.remito_id from public.remitos r where r.operator_service_id = p_service_id and r.driver_id = auth.uid()
      order by r.remito_id desc limit 1));
  if v_remito is null then raise exception 'No se encontró el remito del servicio'; end if;

  select * into v_report from public.service_collection_reports where remito_id = v_remito;
  if found and v_report.status <> 'pending' then
    return v_result || jsonb_build_object('private_collection', to_jsonb(v_report));
  end if;

  v_c := app_private.normalize_private_collection_v1(p_payload->'customer_collections');
  select coalesce(sum((l->>'amount')::numeric), 0) into v_total from jsonb_array_elements(v_c->'lines') l;
  v_saldo := (app_private.service_balance_v1(p_service_id)->>'balance')::numeric;
  if (v_c->>'not_collected')::boolean then
    if v_c->>'reason' is null then raise exception 'Indicá por qué no se cobró el saldo'; end if;
  elsif v_total <= 0 then
    raise exception 'Informá cómo pagó el cliente el saldo o marcá No cobré';
  end if;
  if v_total > v_saldo + 0.009 then
    raise exception 'El cobro informado supera el saldo pendiente ($%)', v_saldo;
  end if;

  insert into public.service_collection_reports (service_id, remito_id, driver_id, lines, collected_total, not_collected, reason)
  values (p_service_id, v_remito, auth.uid(), v_c->'lines', v_total, (v_c->>'not_collected')::boolean, v_c->>'reason')
  on conflict (remito_id) do update
     set lines = excluded.lines, collected_total = excluded.collected_total,
         not_collected = excluded.not_collected, reason = excluded.reason, updated_at = now()
  returning * into v_report;

  return v_result || jsonb_build_object('private_collection', to_jsonb(v_report));
end
$function$;

/* Administración revisa el cobro informado. Al aprobar se registran los cobros. */
create or replace function public.review_service_collection_v1(
  p_report_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_r public.service_collection_reports%rowtype;
  v_line jsonb;
  v_saldo numeric;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then
    raise exception 'Sin permiso para revisar cobros';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decisión inválida'; end if;
  if p_decision = 'rejected' and nullif(btrim(p_note), '') is null then raise exception 'Indicá el motivo del rechazo'; end if;
  select * into v_r from public.service_collection_reports where report_id = p_report_id for update;
  if not found then raise exception 'Cobro inexistente'; end if;
  if v_r.status <> 'pending' then raise exception 'Este cobro ya fue revisado'; end if;

  if p_decision = 'approved' and v_r.collected_total > 0 then
    v_saldo := (app_private.service_balance_v1(v_r.service_id)->>'balance')::numeric;
    if v_r.collected_total > v_saldo + 0.009 then
      raise exception 'El cobro supera el saldo pendiente ($%). Revisá los pagos del servicio.', v_saldo;
    end if;
    for v_line in select * from jsonb_array_elements(v_r.lines) loop
      insert into public.service_payments (service_id, kind, amount, method, received_by, paid_at, note)
      values (v_r.service_id, 'saldo', (v_line->>'amount')::numeric, v_line->>'method', v_r.driver_id, v_r.created_at,
              'Cobrado por el chofer en el remito');
    end loop;
  end if;

  update public.service_collection_reports
     set status = p_decision, review_note = nullif(btrim(p_note), ''),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where report_id = p_report_id
  returning * into v_r;
  return to_jsonb(v_r) || app_private.service_balance_v1(v_r.service_id);
end
$function$;

/* El cobro informado de un remito o de un servicio, para el panel de Administración. */
create or replace function public.get_service_collection_v1(p_service_id uuid default null, p_remito_id integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_r public.service_collection_reports%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'supervision', 'facturacion') then
    raise exception 'Sin permiso para ver cobros';
  end if;
  select * into v_r from public.service_collection_reports
   where (p_remito_id is not null and remito_id = p_remito_id)
      or (p_remito_id is null and service_id = p_service_id)
   order by created_at desc limit 1;
  if not found then return null; end if;
  return to_jsonb(v_r) || jsonb_build_object('driver_name',
    (select coalesce(u.full_name, u.email) from public.users u where u.user_id = v_r.driver_id))
    || app_private.service_balance_v1(v_r.service_id);
end
$function$;

revoke all on function app_private.normalize_private_collection_v1(jsonb) from public, anon;
grant execute on function app_private.normalize_private_collection_v1(jsonb) to authenticated;
revoke all on function public.get_driver_private_collection_v1(uuid) from public, anon;
revoke all on function public.save_driver_operator_service_remito_v5(uuid, jsonb, uuid) from public, anon;
revoke all on function public.review_service_collection_v1(uuid, text, text) from public, anon;
revoke all on function public.get_service_collection_v1(uuid, integer) from public, anon;
grant execute on function public.get_driver_private_collection_v1(uuid) to authenticated;
grant execute on function public.save_driver_operator_service_remito_v5(uuid, jsonb, uuid) to authenticated;
grant execute on function public.review_service_collection_v1(uuid, text, text) to authenticated;
grant execute on function public.get_service_collection_v1(uuid, integer) to authenticated;
