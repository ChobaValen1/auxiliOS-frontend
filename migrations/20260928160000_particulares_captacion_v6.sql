-- Particulares v6: comisión por captación.
--
-- Si un chofer consiguió el servicio particular, el operador lo marca al
-- crearlo (operator_services.referred_by_driver_id). En Sueldos → Comisiones
-- hay un origen nuevo, 'captacion': fijo por servicio o % de lo cobrado al
-- cliente (pagos no anulados). Cuenta el mes en que se firma el remito.

alter table public.operator_services
  add column if not exists referred_by_driver_id uuid references public.users(user_id) on delete set null;
create index if not exists operator_services_referred_by_driver_idx
  on public.operator_services (referred_by_driver_id) where referred_by_driver_id is not null;
comment on column public.operator_services.referred_by_driver_id is 'Chofer que consiguió el servicio particular (comisión por captación).';

alter table public.payroll_commission_rules alter column concept_id drop not null;
alter table public.payroll_commission_rules drop constraint if exists payroll_commission_rules_source_check;
alter table public.payroll_commission_rules add constraint payroll_commission_rules_source_check
  check (source in ('extras', 'invoices', 'captacion'));
alter table public.payroll_commission_rules drop constraint if exists payroll_commission_rules_concept_required;
alter table public.payroll_commission_rules add constraint payroll_commission_rules_concept_required
  check (source = 'captacion' or concept_id is not null);

create or replace function public.create_private_service_v1(p_payload jsonb, p_quoted_total numeric, p_deposit jsonb default null::jsonb)
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
  v_referrer uuid := nullif(p_payload->>'referred_by_driver_id', '')::uuid;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para crear servicios';
  end if;
  if v_company is null then raise exception 'Falta configurar la cuenta Particulares'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  perform app_private.validate_private_customer_v1(v_payload);
  if v_deposit is not null and (v_deposit < 0 or v_deposit > p_quoted_total) then
    raise exception 'El pago no puede superar el presupuesto';
  end if;
  if v_referrer is not null and not exists (
    select 1 from public.users u join public.roles r on r.role_id = u.role_id
     where u.user_id = v_referrer and r.name = 'chofer') then
    raise exception 'El chofer que consiguió el servicio no es válido';
  end if;

  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  if nullif(btrim(v_payload->>'service_order_number'), '') is null then
    v_payload := v_payload || jsonb_build_object('service_order_number',
      'PART-' || lpad(nextval('public.private_service_number_seq')::text, 5, '0'));
  end if;
  v_result := public.create_operator_service_v4(
    v_payload - 'invoice_requested' - 'customer_tax_condition' - 'quoted_total' - 'referred_by_driver_id');
  v_service := (v_result->>'service_id')::uuid;

  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((v_payload->>'invoice_requested')::boolean, false),
         customer_tax_condition = nullif(v_payload->>'customer_tax_condition', ''),
         referred_by_driver_id = v_referrer,
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2))
   where service_id = v_service;

  if coalesce(v_deposit, 0) > 0 then
    insert into public.service_payments (service_id, kind, amount, method, received_by, note)
    values (v_service,
            case when round(v_deposit, 2) >= round(p_quoted_total, 2) then 'saldo' else 'sena' end,
            round(v_deposit, 2), coalesce(nullif(p_deposit->>'method', ''), 'cash'), auth.uid(),
            nullif(btrim(p_deposit->>'note'), ''));
  end if;

  return v_result || jsonb_build_object('client_kind', 'particular', 'referred_by_driver_id', v_referrer)
                  || app_private.service_balance_v1(v_service);
end
$function$;

create or replace function public.get_payroll_matrix_sources(p_driver uuid, p_from date, p_until date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
 if coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
 return jsonb_build_object(
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',l.invoice_service_id,'service_id',s.service_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',coalesce(nullif(l.quote_snapshot->>'service_company_amount','')::numeric,l.company_amount),'currency',l.currency,'km',case when l.quote_snapshot ? 'billable_asphalt_km' and l.quote_snapshot ? 'billable_gravel_km' then coalesce((l.quote_snapshot->>'billable_asphalt_km')::numeric,0)+coalesce((l.quote_snapshot->>'billable_gravel_km')::numeric,0) else null end)) from public.operator_invoice_services l join public.operator_invoices i using(invoice_id) join public.operator_services s using(service_id) join public.companies c on c.company_id=s.company_id where c.client_kind<>'particular' and s.assigned_driver_id=p_driver and l.released_at is null and i.status='created' and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb)
 -- Particulares: no se facturan a una prestadora; cuentan al firmarse el remito.
 ||coalesce((select jsonb_agg(jsonb_build_object('id','part:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',s.quoted_total,'currency','ARS','km',r.km_reales,'client_kind','particular')) from public.operator_services s join public.companies c on c.company_id=s.company_id join lateral (select x.remito_id,x.km_reales,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.driver_id=p_driver and x.status='firmado' order by x.firmado_at desc limit 1) r on true where c.client_kind='particular' and s.quoted_total is not null and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb),
 'extras',coalesce((select jsonb_agg(jsonb_build_object('id',e.excess_report_id,'remito_id',r.remito_id,'concept_id',e.concept_id,'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency)) from public.remito_excess_reports e join public.remitos r using(remito_id) where r.driver_id=p_driver and r.status='firmado' and e.customer_payment_method<>'not_collected' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb),
 -- Captación: servicios particulares que consiguió el chofer, sobre lo cobrado.
 'captacion',coalesce((select jsonb_agg(jsonb_build_object('id','capt:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',null,'quantity',1,'amount',coalesce((select sum(p.amount) from public.service_payments p where p.service_id=s.service_id and p.voided_at is null),0),'currency','ARS')) from public.operator_services s join lateral (select x.remito_id,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.status='firmado' order by x.firmado_at desc limit 1) r on true where s.referred_by_driver_id=p_driver and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb));
end $function$;
