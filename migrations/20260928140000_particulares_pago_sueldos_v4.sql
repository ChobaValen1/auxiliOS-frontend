-- Particulares v4: pago total al crear, cobros en la rendición y en Sueldos.
--
-- 1) create_private_service_v1: si el cliente pagó todo antes del servicio el
--    pago queda como 'saldo' (A cobrar = $0). Una seña sigue siendo 'sena'.
-- 2) Rendición de efectivo: lo que el chofer cobró en efectivo de un servicio
--    particular (service_collection_reports no rechazado) se suma al efectivo
--    esperado de la jornada del remito.
-- 3) Sueldos: los servicios particulares con remito firmado entran como fuente
--    de servicios principales (comisiones por concepto y km), con el
--    presupuesto como importe. Ya contaban como servicio por remito.

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

  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  if nullif(btrim(v_payload->>'service_order_number'), '') is null then
    v_payload := v_payload || jsonb_build_object('service_order_number',
      'PART-' || lpad(nextval('public.private_service_number_seq')::text, 5, '0'));
  end if;
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
    insert into public.service_payments (service_id, kind, amount, method, received_by, note)
    values (v_service,
            case when round(v_deposit, 2) >= round(p_quoted_total, 2) then 'saldo' else 'sena' end,
            round(v_deposit, 2), coalesce(nullif(p_deposit->>'method', ''), 'cash'), auth.uid(),
            nullif(btrim(p_deposit->>'note'), ''));
  end if;

  return v_result || jsonb_build_object('client_kind', 'particular')
                  || app_private.service_balance_v1(v_service);
end
$function$;

-- Efectivo cobrado por el chofer en un servicio particular, por remito.
create or replace function app_private.private_collection_cash_v1(p_remito_id integer)
 returns numeric
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(sum((l->>'amount')::numeric), 0)
    from public.service_collection_reports c
    cross join lateral jsonb_array_elements(c.lines) l
   where c.remito_id = p_remito_id and c.status <> 'rejected' and l->>'method' = 'cash';
$function$;
revoke all on function app_private.private_collection_cash_v1(integer) from public, anon, authenticated;

create or replace function app_private.monthly_cash_source(p_driver uuid, p_period integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_from date; v_days jsonb; v_expected numeric; v_expenses numeric; v_presented numeric; v_updated timestamptz;
begin
 if p_driver is null or p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
 v_from:=make_date(p_period/100,p_period%100,1);
 with days as (
 select j.log_date fecha,
 coalesce((select sum(case when r.addons_version>=2 or exists(select 1 from public.remito_toll_reports t where t.remito_id=r.remito_id) or exists(select 1 from public.remito_excess_reports e where e.remito_id=r.remito_id)
 then coalesce((select sum(t.total_amount) from public.remito_toll_reports t where t.remito_id=r.remito_id and t.customer_payment_method='cash'),0)+coalesce((select sum(e.total_amount) from public.remito_excess_reports e where e.remito_id=r.remito_id and e.customer_payment_method='cash'),0)
 else case when r.pago_1_metodo in ('efectivo','cash') then coalesce(r.pago_1_monto,0) else 0 end+case when r.pago_2_metodo in ('efectivo','cash') then coalesce(r.pago_2_monto,0) else 0 end end
 +app_private.private_collection_cash_v1(r.remito_id))
 from public.remitos r where r.log_id=j.log_id and r.status<>'anulado'),0) expected,
 public.calcular_gastos_jornada(j.log_id)
 +coalesce((select sum(t.total_amount) from public.remito_toll_reports t join public.remitos r using(remito_id) where r.log_id=j.log_id and r.status<>'anulado' and t.payment_method='cash'),0)
 +coalesce((select e.amount from public.journey_cash_expenses e where e.log_id=j.log_id),(select sum(coalesce(c.gastos_extra,0)) from public.rendicion_cierre c where c.log_id=j.log_id and c.estado<>'rechazado'),0) expenses
 from public.daily_logs j where j.driver_id=p_driver and j.log_date>=v_from and j.log_date<(v_from+interval '1 month')
 ), grouped as(select fecha,sum(expected) expected,sum(expenses) expenses from days group by fecha)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by fecha),'[]'::jsonb),coalesce(sum(expected),0),coalesce(sum(expenses),0) into v_days,v_expected,v_expenses from grouped;
 select presented,updated_at into v_presented,v_updated from public.payroll_cash_months where driver_id=p_driver and periodo_yyyymm=p_period;
 return jsonb_build_object('days',v_days,'expected',v_expected,'expenses',v_expenses,'due',v_expected-v_expenses,'presented',v_presented,'difference',v_presented-(v_expected-v_expenses),'discount',case when v_presented is null then 0 else greatest(0,v_expected-v_expenses-v_presented) end,'updated_at',v_updated);
end $function$;

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
 'extras',coalesce((select jsonb_agg(jsonb_build_object('id',e.excess_report_id,'remito_id',r.remito_id,'concept_id',e.concept_id,'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency)) from public.remito_excess_reports e join public.remitos r using(remito_id) where r.driver_id=p_driver and r.status='firmado' and e.customer_payment_method<>'not_collected' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb));
end $function$;
