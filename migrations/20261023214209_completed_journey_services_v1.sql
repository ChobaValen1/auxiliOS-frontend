-- Read-only completion source for journey/payroll lists. No invented remitos or journeys.
create or replace function app_private.completed_journey_services_v1(
 p_log_ids integer[] default '{}',p_driver uuid default null,p_period integer default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare v_from date; result jsonb;
begin
 if coalesce(cardinality(p_log_ids),0)>500 then raise exception 'Hasta 500 jornadas por consulta'; end if;
 if p_driver is not null then
  if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from:=make_date(p_period/100,p_period%100,1);
 end if;
 with candidates as (
  select c.*,s.service_order_number,s.service_number,s.vehicle_plate,s.origin,s.destination,
    s.estimated_distance_km,s.document_status,s.arrived_at,s.customer_payment_primary,s.customer_payment_secondary,
    s.customer_payment_secondary_amount,t.log_id
  from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
  left join lateral (
   select x.log_id from public.trips x
   where x.driver_id=c.driver_id and (x.trip_id=s.trip_id or exists(
    select 1 from public.operator_service_assignments a where a.service_id=s.service_id and a.trip_id=x.trip_id and a.driver_id=c.driver_id))
   order by (x.trip_id=s.trip_id) desc nulls last,x.fecha_hora_inicio desc nulls last,x.trip_id desc limit 1
  ) t on true
  where not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
 ), selected as (
  select * from candidates c where (p_driver is null and c.log_id=any(p_log_ids)) or
   (p_driver is not null and c.driver_id=p_driver and (
     c.log_id=any(p_log_ids) or (c.completed_at>=(v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and c.completed_at<((v_from+interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires'))))
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'operator_service_id',s.service_id,'no_remito',true,'log_id',s.log_id,'driver_id',s.driver_id,
  'nro_servicio',coalesce(nullif(s.service_order_number,''),s.service_number),'patente',s.vehicle_plate,
  'origen',s.origin,'destino',s.destination,'km_reales',s.estimated_distance_km,
  'status','completed','document_status',s.document_status,'created_at_device',coalesce(s.arrived_at,s.completed_at),
  'completed_at',s.completed_at,'cash_expected',coalesce(p.amount,0)+case when s.customer_payment_primary is null then a.customer_cash else
    case when s.customer_payment_primary='cash' then greatest(a.customer_total-coalesce(s.customer_payment_secondary_amount,0),0) else 0 end+
    case when s.customer_payment_secondary='cash' then coalesce(s.customer_payment_secondary_amount,0) else 0 end end,
  'toll_cash_expense',a.toll_cash
 ) order by s.completed_at,s.service_id),'[]'::jsonb) into result from selected s
 left join lateral (select coalesce(sum(p.amount),0) amount from public.service_payments p
  where p.service_id=s.service_id and p.received_by=s.driver_id and p.method='cash' and p.voided_at is null) p on true
 cross join lateral (
  select coalesce(sum(x.customer_total),0) customer_total,coalesce(sum(x.customer_cash),0) customer_cash,coalesce(sum(x.toll_cash),0) toll_cash from (
   select case when t.payer_agent='customer' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_total,
    case when t.payer_agent='customer' and t.customer_payment_method='cash' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_cash,
    case when t.payment_method='cash' then t.total_amount else 0 end toll_cash
   from public.operator_service_tolls t where t.service_id=s.service_id and t.source='actual'
   union all select case when e.payer_agent='customer' and e.collector_agent='company' then e.total_amount else 0 end,
    case when e.payer_agent='customer' and e.collector_agent='company' and e.customer_payment_method='cash' then e.total_amount else 0 end,0
   from public.operator_service_excess_charges e where e.service_id=s.service_id and e.source='actual'
  ) x
 ) a;
 return result;
end $f$;
revoke all on function app_private.completed_journey_services_v1(integer[],uuid,integer) from public,anon,authenticated;

create or replace function public.get_completed_journey_services_v1(
 p_log_ids integer[] default '{}',p_driver uuid default null,p_period integer default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'Sin permiso'; end if;
 return app_private.completed_journey_services_v1(p_log_ids,p_driver,p_period);
end $f$;
revoke all on function public.get_completed_journey_services_v1(integer[],uuid,integer) from public,anon;
grant execute on function public.get_completed_journey_services_v1(integer[],uuid,integer) to authenticated;

-- Server-only, auditable repair of pending service counts/cash. Does not change rates,
-- bonuses, commissions, km, receipt state, or any approved/paid receipt.
create or replace function app_private.repair_pending_completed_payroll_v1()
returns jsonb language plpgsql security definer set search_path to '' as $f$
declare r public.payroll_liquidaciones; n bigint; rate numeric; d jsonb; fixed jsonb:='[]';
begin
 for r in select * from public.payroll_liquidaciones where estado='pendiente' order by driver_id,periodo_yyyymm for update loop
  n:=app_private.driver_payroll_service_count_v2(r.driver_id,make_date(r.periodo_yyyymm/100,r.periodo_yyyymm%100,1),
   (make_date(r.periodo_yyyymm/100,r.periodo_yyyymm%100,1)+interval '1 month')::date);
  rate:=r.valor_servicio_snapshot;
  if coalesce((r.compensation_snapshot->>'pay_services')::boolean,true) and rate is null then
   raise exception 'Falta tarifa guardada: no se recalculó ninguna liquidación';
  end if;
  d:=app_private.monthly_cash_source_v2(r.driver_id,r.periodo_yyyymm);
  if coalesce((r.compensation_snapshot->>'completed_services_v2')::boolean,false) and r.servicios=n
    and r.ajuste_rendiciones is not distinct from (d->>'discount')::numeric then continue; end if;
  update public.payroll_liquidaciones set servicios=n,
   adic_serv=case when coalesce((r.compensation_snapshot->>'pay_services')::boolean,true) then n*rate else 0 end,
   compensation_snapshot=coalesce(r.compensation_snapshot,'{}'::jsonb)||jsonb_build_object('completed_services_v2',true,
    'completed_services_repair_v1',coalesce(r.compensation_snapshot->'completed_services_repair_v1',jsonb_build_object(
     'at',clock_timestamp(),'previous_services',r.servicios,'previous_adic_serv',r.adic_serv,
     'previous_discount',r.ajuste_rendiciones,'previous_total',r.total,'previous_cash_snapshot',r.cash_snapshot)))
   where driver_id=r.driver_id and periodo_yyyymm=r.periodo_yyyymm and estado='pendiente';
  fixed:=fixed||jsonb_build_array(jsonb_build_object('period',r.periodo_yyyymm,'driver',r.driver_id,'before',r.servicios,'after',n));
 end loop;
 return fixed;
end $f$;
revoke all on function app_private.repair_pending_completed_payroll_v1() from public,anon,authenticated;
