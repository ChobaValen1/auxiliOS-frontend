-- Efectivo esperado: una venta/extra cobrada en efectivo que se cargó en el SERVICIO (no en el remito)
-- quedaba afuera cuando el servicio tenía remito. Ahora entra, salvo que el remito ya tenga una línea
-- del mismo concepto (así no se cuenta dos veces). Afecta solo «a presentar» y, si hay rendición
-- presentada, el descuento de recibos pendientes cuando se recalculan. Aprobados y pagados no cambian.
create or replace function app_private.monthly_cash_source_v2(p_driver uuid, p_period integer)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare base jsonb; v_days jsonb; v_expected numeric; v_expenses numeric; presented numeric; v_from date; v_until date;
begin
  base:=app_private.monthly_cash_source(p_driver,p_period); -- validates period; retains all legacy sources
  v_from:=make_date(p_period/100,p_period%100,1); v_until:=(v_from+interval '1 month')::date;
  presented:=(base->>'presented')::numeric;
  with services as (
    select c.*,s.customer_payment_primary,s.customer_payment_secondary,s.customer_payment_secondary_amount
    from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
    where c.driver_id=p_driver
  ), extra_cash as (
    -- Actual money received by this driver, not payments received by Administration.
    -- Approved private collection reports already feed v1; their generated payments
    -- match the report's timestamp/amount/method and must not be counted a second time.
    select (p.paid_at at time zone 'America/Argentina/Buenos_Aires')::date fecha,p.amount expected,0::numeric expenses
    from public.service_payments p join public.operator_services s using(service_id)
    -- Cash receiver scope v2: identity comes from the payment, not the assignment.
    where s.status='completed' and s.logistics_type='own' and p.received_by=p_driver and p.method='cash' and p.voided_at is null
      and not exists (
        select 1 from public.service_collection_reports cr join public.remitos r on r.remito_id=cr.remito_id
        join public.daily_logs j on j.log_id=r.log_id
        cross join lateral jsonb_array_elements(cr.lines) line
        where cr.service_id=p.service_id and cr.driver_id=p_driver and cr.status='approved'
          and r.status<>'anulado' and j.driver_id=p_driver and j.log_date>=v_from and j.log_date<v_until
          and cr.created_at=p.paid_at and line->>'method'=p.method and (line->>'amount')::numeric=p.amount and p.kind='saldo'
      )
    union all
    -- No-remito confirmed extras. Planned/manual estimates are NOT proof of cash.
    select (s.completed_at at time zone 'America/Argentina/Buenos_Aires')::date,
      case when s.customer_payment_primary is not null then
        case when s.customer_payment_primary='cash' then greatest(a.customer_total-coalesce(s.customer_payment_secondary_amount,0),0) else 0 end
        +case when s.customer_payment_secondary='cash' then coalesce(s.customer_payment_secondary_amount,0) else 0 end
      else a.customer_cash end, a.toll_cash
    from services s
    cross join lateral (
      select coalesce(sum(x.customer_total),0) customer_total,coalesce(sum(x.customer_cash),0) customer_cash,coalesce(sum(x.toll_cash),0) toll_cash from (
        select case when t.payer_agent='customer' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_total,
          case when t.payer_agent='customer' and t.customer_payment_method='cash' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_cash,
          case when t.payment_method='cash' then t.total_amount else 0 end toll_cash
        from public.operator_service_tolls t where t.service_id=s.service_id and t.source='actual'
        union all
        select case when e.payer_agent='customer' and e.collector_agent='company' then e.total_amount else 0 end,
          case when e.payer_agent='customer' and e.collector_agent='company' and e.customer_payment_method='cash' then e.total_amount else 0 end,0
        from public.operator_service_excess_charges e where e.service_id=s.service_id and e.source='actual'
      ) x
    ) a
    where not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
    union all
    -- Servicio CON remito: ventas/extras cobradas en efectivo que se cargaron en el servicio y no figuran en el remito.
    select (s.completed_at at time zone 'America/Argentina/Buenos_Aires')::date, e.total_amount, 0
    from services s
    join public.operator_service_excess_charges e on e.service_id=s.service_id and e.source='actual'
      and e.payer_agent='customer' and e.collector_agent='company' and e.customer_payment_method='cash'
    where exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
      and not exists(select 1 from public.remitos r join public.remito_excess_reports rr on rr.remito_id=r.remito_id
                     where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado'
                       and rr.concept_id is not distinct from e.concept_id)
  ), grouped as (
    select fecha,sum(e) expected,sum(g) expenses from (
      select (d->>'fecha')::date fecha,(d->>'expected')::numeric e,(d->>'expenses')::numeric g from jsonb_array_elements(base->'days') d
      union all select fecha,expected,expenses from extra_cash where fecha>=v_from and fecha<v_until
    ) x group by fecha
  ) select coalesce(jsonb_agg(to_jsonb(grouped) order by fecha),'[]'::jsonb),coalesce(sum(grouped.expected),0),coalesce(sum(grouped.expenses),0)
    into v_days,v_expected,v_expenses from grouped;
  return base||jsonb_build_object('source_version',2,'days',v_days,'expected',v_expected,'expenses',v_expenses,'due',v_expected-v_expenses,
    'difference',presented-(v_expected-v_expenses),'discount',case when presented is null then 0 else greatest(0,v_expected-v_expenses-presented) end);
end $function$;
