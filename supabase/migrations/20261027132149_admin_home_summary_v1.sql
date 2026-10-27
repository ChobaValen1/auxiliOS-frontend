-- Read-only home snapshot. Counters are aggregated in SQL (no paginated-list limits).
create or replace function app_private.admin_home_invoice_km_v1(p_quote jsonb)
returns numeric language sql immutable set search_path='' as $$
 select case when coalesce(p_quote->>'billable_distance_km','') ~ '^[0-9]+([.][0-9]+)?$'
 then (p_quote->>'billable_distance_km')::numeric else null end
$$;
revoke all on function app_private.admin_home_invoice_km_v1(jsonb) from public,anon,authenticated;

create or replace function app_private.admin_home_summary_v1(p_month date,p_rank text,p_now timestamptz)
returns jsonb language plpgsql stable set search_path='' as $f$
declare
 v_day date:=(p_now at time zone 'America/Argentina/Buenos_Aires')::date;
 v_start timestamptz; v_prev_start timestamptz; v_prev_now timestamptz;
 v_month date; v_month_end date; result jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'Sin permiso para ver el Inicio de Administración' using errcode='42501';end if;
 if p_rank not in ('services','km') or p_rank is null then raise exception 'Orden del ranking inválido';end if;
 v_start:=v_day::timestamp at time zone 'America/Argentina/Buenos_Aires';
 v_prev_start:=(v_day-1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
 v_prev_now:=v_prev_start+(p_now-v_start);
 v_month:=date_trunc('month',coalesce(p_month,v_day))::date;
 if extract(year from v_month) not between 2000 and 2100 then raise exception 'Mes inválido';end if;
 v_month_end:=(v_month+interval '1 month')::date;
 with
 services as materialized(select s.* from public.operator_services s where not coalesce(s.is_test,false) and s.created_at<=p_now),
 cutoffs as(select * from(values('current',v_start,p_now),('previous',v_prev_start,v_prev_now)) x(period,starts,ends)),
 states as materialized(
  select c.*,s.service_id,s.created_at,s.completed_at,s.driver_activated,
   case when c.period='current' then s.status else coalesce(past.to_status,future.from_status,
    case when coalesce(s.updated_at,s.created_at)<=c.ends then s.status end) end state
  from cutoffs c join services s on s.created_at<=c.ends
  left join lateral(select e.to_status from public.operator_service_events e where c.period='previous' and e.service_id=s.service_id and e.created_at<=c.ends and e.to_status is not null order by e.created_at desc,e.event_id desc limit 1) past on true
  left join lateral(select e.from_status from public.operator_service_events e where c.period='previous' and past.to_status is null and e.service_id=s.service_id and e.created_at>c.ends and e.from_status is not null order by e.created_at,e.event_id limit 1) future on true
 ),
 invoice_state as materialized(
  select c.period,c.starts,c.ends,i.invoice_id,i.currency,i.created_at,
   greatest(i.total_amount-coalesce((select sum(n.amount) from public.operator_invoice_credit_notes n where n.invoice_id=i.invoice_id and n.created_at<=c.ends),0),0) amount
  from cutoffs c join public.operator_invoices i on i.created_at<=c.ends
  where (i.status='created' or(i.status='cancelled' and i.cancelled_at>c.ends) or(i.status='credited' and i.credited_at>c.ends)) and not exists(select 1 from public.operator_invoice_services z join public.operator_services zs on zs.service_id=z.service_id where z.invoice_id=i.invoice_id and coalesce(zs.is_test,false))
 ),
 invoice_lines as materialized(
  select i.period,i.starts,i.ends,i.created_at,l.service_id,app_private.admin_home_invoice_km_v1(l.quote_snapshot) km
  from invoice_state i join public.operator_invoice_services l using(invoice_id)
  join services s on s.service_id=l.service_id
  where l.released_at is null or l.released_at>i.ends
 ),
 daily as(
  select c.period,jsonb_build_object(
   'services',(select count(*) from states x where x.period=c.period and x.created_at>=c.starts),
   'unassigned',(select count(*) from states x where x.period=c.period and x.state='pending'),
   'in_progress',(select count(*) from states x where x.period=c.period and x.state in ('assigned','at_origin','en_route','loaded','at_destination') and not coalesce(x.driver_activated,false)),
   'completed',(select count(*) from states x where x.period=c.period and x.state='completed' and not coalesce(x.driver_activated,false) and x.completed_at>=c.starts and x.completed_at<=c.ends),
   'state_comparison_available',not exists(select 1 from states x where x.period=c.period and x.state is null),
   'billed_km',(select coalesce(sum(l.km),0) from invoice_lines l where l.period=c.period and l.created_at>=c.starts),
   'billed_km_missing',(select count(*) from invoice_lines l where l.period=c.period and l.created_at>=c.starts and l.km is null),
   'billed_km_lines',(select count(*) from invoice_lines l where l.period=c.period and l.created_at>=c.starts)
  ) data from cutoffs c
 ),
 completed_today as materialized(
  select s.service_id,coalesce(r.driver_id,s.assigned_driver_id) driver_id,coalesce(t.truck_id,s.assigned_truck_id) truck_id,
   coalesce(l.km,0) km,l.km_missing,l.billed
  from services s left join public.remitos r on r.remito_id=s.remito_id and r.status<>'anulado'
  left join public.trips t on t.trip_id=s.trip_id
  left join lateral(select sum(x.km) km,count(*) filter(where x.km is null) km_missing,count(*)>0 billed from invoice_lines x where x.period='current' and x.service_id=s.service_id) l on true
  where s.status='completed' and not coalesce(s.driver_activated,false) and coalesce(s.logistics_type,'own')='own' and s.completed_at>=v_start and s.completed_at<=p_now
 ),
 driver_top as(select x.driver_id id,coalesce(nullif(u.full_name,''),'Chofer sin nombre') name,count(*) services,round(sum(x.km),2) billed_km,sum(x.km_missing) km_missing,count(*) filter(where not x.billed) unbilled
  from completed_today x left join public.users u on u.user_id=x.driver_id where x.driver_id is not null group by x.driver_id,u.full_name),
 truck_top as(select x.truck_id id,coalesce(nullif(t.numero_interno,''),t.plate,'Móvil sin nombre') name,t.plate,count(*) services,round(sum(x.km),2) billed_km,sum(x.km_missing) km_missing,count(*) filter(where not x.billed) unbilled
  from completed_today x left join public.trucks t on t.truck_id=x.truck_id where x.truck_id is not null group by x.truck_id,t.numero_interno,t.plate),
 month_invoices as materialized(
  select i.currency,i.created_at,
   greatest(i.total_amount-coalesce((select sum(n.amount) from public.operator_invoice_credit_notes n where n.invoice_id=i.invoice_id and n.created_at<=p_now),0),0) amount
  from public.operator_invoices i where i.status='created' and i.created_at<=p_now and not exists(select 1 from public.operator_invoice_services z join public.operator_services zs on zs.service_id=z.service_id where z.invoice_id=i.invoice_id and coalesce(zs.is_test,false))
   and i.created_at>=v_month::timestamp at time zone 'America/Argentina/Buenos_Aires'
   and i.created_at<v_month_end::timestamp at time zone 'America/Argentina/Buenos_Aires'
 ),
 ready as materialized(select s.* from services s where s.status='completed' and s.quoted_total is null and s.document_status in ('approved','exception_approved') and s.billing_status in ('pending','reviewed')
  and not exists(select 1 from public.operator_invoice_services l join public.operator_invoices i using(invoice_id) where l.service_id=s.service_id and l.released_at is null and i.status='created')),
 month_totals as(select currency,sum(amount) amount from month_invoices group by currency)
 select jsonb_build_object(
  'generated_at',p_now,'timezone','America/Argentina/Buenos_Aires','day',v_day,'previous_cutoff',v_prev_now,'month',v_month,'rank_by',p_rank,
  'current',(select data from daily where period='current'),'previous',(select data from daily where period='previous'),
  'fleet',jsonb_build_object('active',(select count(*) from public.trucks where not coalesce(is_test,false) and status='active'),'total',(select count(*) from public.trucks where not coalesce(is_test,false)),'truck_ids',(select coalesce(jsonb_agg(truck_id),'[]'::jsonb) from public.trucks where not coalesce(is_test,false))),
  'pending',jsonb_build_object(
   'unassigned',(select count(*) from services where status='pending'),
   'documents',(select count(*) from services where status in ('assigned','at_origin') and document_status='submitted' and administrative_review_status='pending'),
   'intakes',(select count(*) from public.driver_service_intakes d join public.remitos r on r.remito_id=d.remito_id join public.users u on u.user_id=d.driver_id where d.status='pending_admin' and d.linked_service_id is null and r.status='firmado' and not coalesce(u.is_test,false)),
   'billing',(select count(*) from ready),
   'journeys',(select count(*) from public.daily_logs d join public.users u on u.user_id=d.driver_id where d.status='open' and not coalesce(u.is_test,false) and coalesce((d.log_date+d.hora_inicio) at time zone 'America/Argentina/Buenos_Aires',d.created_at_device,d.created_at)<p_now-interval '12 hours'),
   'journeys_first_log_id',(select d.log_id from public.daily_logs d join public.users u on u.user_id=d.driver_id where d.status='open' and not coalesce(u.is_test,false) and coalesce((d.log_date+d.hora_inicio) at time zone 'America/Argentina/Buenos_Aires',d.created_at_device,d.created_at)<p_now-interval '12 hours' order by d.log_date,d.hora_inicio,d.log_id limit 1)
  ),
  'monthly',jsonb_build_object('billed',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'amount',round(amount,2)) order by currency) from month_totals),'[]'::jsonb),
   'pending_estimate',coalesce((select jsonb_agg(to_jsonb(x) order by x.currency) from(select currency,round(sum(coalesce(company_estimated_total,0)),2) amount from ready group by currency)x),'[]'::jsonb),
   'series',coalesce((select jsonb_agg(jsonb_build_object('currency',m.currency,'points',(
    select jsonb_agg(jsonb_build_object('day',d::date,'amount',case when d::date>v_day then null else coalesce((select sum(i.amount) from month_invoices i where i.currency=m.currency and(i.created_at at time zone 'America/Argentina/Buenos_Aires')::date=d::date),0) end) order by d)
    from generate_series(v_month::timestamp,(v_month_end-1)::timestamp,interval '1 day') d
   )) order by m.currency) from month_totals m),'[]'::jsonb)),
  'top_drivers',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from driver_top order by case when p_rank='km' then billed_km else services end desc,services desc,billed_km desc,name,id limit 5)x),'[]'::jsonb),
  'top_trucks',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from truck_top order by case when p_rank='km' then billed_km else services end desc,services desc,billed_km desc,name,id limit 5)x),'[]'::jsonb)
 ) into result;
 return result;
end $f$;
revoke all on function app_private.admin_home_summary_v1(date,text,timestamptz) from public,anon,authenticated;
create or replace function public.dashboard_admin_home_v1(p_month date default null,p_rank text default 'services')
returns jsonb language sql stable security definer set search_path='' as $$select app_private.admin_home_summary_v1(p_month,p_rank,now())$$;
revoke all on function public.dashboard_admin_home_v1(date,text) from public,anon;
grant execute on function public.dashboard_admin_home_v1(date,text) to authenticated;
