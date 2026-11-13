-- Liquidaciones: el servicio con relevo también se lista para el 1º chofer (v1).
-- El 1º chofer cobra el servicio (completed_driver_services_v2) pero su listado de servicios sólo mostraba los que no tienen remito:
-- como el remito es del 2º chofer, el servicio no le aparecía. Ahora se lista como «sin remito propio» con relay_role='primero'.
-- Lo cobrado en efectivo al cliente y los peajes en efectivo se atribuyen sólo al 2º chofer (el que cierra el remito).
-- Solo lectura: no cambia el conteo ni los importes del sueldo.
create or replace function app_private.completed_journey_services_v1(p_log_ids integer[] DEFAULT '{}'::integer[], p_driver uuid DEFAULT NULL::uuid, p_period integer DEFAULT NULL::integer)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
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
    s.customer_payment_secondary_amount,coalesce(t.log_id,f.log_id) log_id,
    case when t.log_id is not null then 'trip' when f.log_id is not null then 'date' else 'none' end journey_match,
    exists(select 1 from public.operator_service_relays rl where rl.service_id=s.service_id and rl.handed_over_at is not null and rl.from_driver_id=c.driver_id) relay_first
  from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
  left join lateral (
   select x.log_id from public.trips x join public.daily_logs j on j.log_id=x.log_id and j.driver_id=c.driver_id
   where x.driver_id=c.driver_id and (x.trip_id=s.trip_id or exists(
    select 1 from public.operator_service_assignments a where a.service_id=s.service_id and a.trip_id=x.trip_id and a.driver_id=c.driver_id))
   order by (x.trip_id=s.trip_id) desc nulls last,x.fecha_hora_inicio desc nulls last,x.trip_id desc limit 1
  ) t on true
  left join lateral (
   select min(d.log_id) log_id from public.daily_logs d
   where t.log_id is null and d.driver_id=c.driver_id and d.voided_at is null
     and d.log_date=(coalesce(s.arrived_at,c.completed_at) at time zone 'America/Argentina/Buenos_Aires')::date
   having count(*)=1
  ) f on true
  where (not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
     -- Relevo: el remito es del 2º chofer; el servicio del 1º también se lista (sin remito propio).
     or exists(select 1 from public.operator_service_relays rl where rl.service_id=s.service_id and rl.handed_over_at is not null and rl.from_driver_id=c.driver_id))
 ), selected as (
  select * from candidates c where (p_driver is null and c.log_id=any(p_log_ids)) or
   (p_driver is not null and c.driver_id=p_driver and (
     c.log_id=any(p_log_ids) or (c.completed_at>=(v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and c.completed_at<((v_from+interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires'))))
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'operator_service_id',s.service_id,'no_remito',true,'log_id',s.log_id,'journey_match',s.journey_match,'driver_id',s.driver_id,
  'nro_servicio',coalesce(nullif(s.service_order_number,''),s.service_number),'patente',s.vehicle_plate,
  'origen',s.origin,'destino',s.destination,'km_reales',s.estimated_distance_km,
  'status','completed','document_status',s.document_status,'created_at_device',coalesce(s.arrived_at,s.completed_at),
  'completed_at',s.completed_at,'cash_expected',coalesce(p.amount,0)+case when s.relay_first then 0 when s.customer_payment_primary is null then a.customer_cash else
    case when s.customer_payment_primary='cash' then greatest(a.customer_total-coalesce(s.customer_payment_secondary_amount,0),0) else 0 end+
    case when s.customer_payment_secondary='cash' then coalesce(s.customer_payment_secondary_amount,0) else 0 end end,
  'toll_cash_expense',case when s.relay_first then 0 else a.toll_cash end,
  'relay_role',case when s.relay_first then 'primero' end
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
end $function$;
