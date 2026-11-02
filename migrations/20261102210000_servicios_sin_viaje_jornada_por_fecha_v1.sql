-- Servicios finalizados sin remito y sin viaje (excepción aprobada / Activado) quedaban «sin jornada».
-- 1) Si no hay viaje, se pegan a la jornada del chofer de ese día (fecha argentina de llegada o finalización),
--    solo cuando ese día hay exactamente una jornada no anulada.
-- 2) Si no hay jornada ese día, se informa el motivo (journey_match='none').
-- 3) service_journey_match_v1: lo usa la app al aprobar la excepción o cerrar un Activado para avisar en el momento.
-- Solo lectura: no cambia importes ni el conteo del sueldo (que es mensual).

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
    case when t.log_id is not null then 'trip' when f.log_id is not null then 'date' else 'none' end journey_match
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
  where not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
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
end $function$;

-- Aviso en el momento: ¿a qué jornada queda pegado este servicio?
create or replace function public.service_journey_match_v1(p_service_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $f$
declare s public.operator_services%rowtype; v_driver uuid; v_day date; v_n int; v_log integer; v_trip integer;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio no encontrado'; end if;
  v_driver:=coalesce(s.activation_driver_id,s.assigned_driver_id);
  v_day:=(coalesce(s.arrived_at,s.completed_at,now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  select x.log_id into v_trip from public.trips x where x.trip_id=s.trip_id and x.log_id is not null;
  if v_trip is not null then return jsonb_build_object('match','trip','log_id',v_trip,'fecha',v_day); end if;
  select count(*),min(log_id) into v_n,v_log from public.daily_logs d where d.driver_id=v_driver and d.voided_at is null and d.log_date=v_day;
  return jsonb_build_object('match',case when v_n=1 then 'date' when v_n>1 then 'ambiguous' else 'none' end,'log_id',case when v_n=1 then v_log end,'fecha',v_day,'jornadas',v_n,'driver_id',v_driver);
end $f$;
revoke all on function public.service_journey_match_v1(uuid) from public,anon;
grant execute on function public.service_journey_match_v1(uuid) to authenticated;
