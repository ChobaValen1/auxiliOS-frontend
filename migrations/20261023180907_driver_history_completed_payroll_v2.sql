-- Preview v2. Generated with `supabase migration new`, kept in the repository's migrations/ directory.
-- No backfill, no UPDATE of receipts, payments or approved payroll.
-- Existing v1 clients keep their sources. Only payroll snapshots marked v2 opt in.

create or replace function app_private.completed_driver_services_v2()
returns table(service_id uuid, driver_id uuid, completed_at timestamptz, remito_id integer)
language sql stable security definer set search_path to '' as $f$
  select s.service_id,
    coalesce(r.driver_id,
      case when s.driver_activated then s.activation_driver_id end,
      s.assigned_driver_id, a.driver_id), s.completed_at, r.remito_id
  from public.operator_services s
  left join lateral (
    select x.driver_id,x.remito_id from public.remitos x
    where (x.operator_service_id=s.service_id or x.remito_id=s.remito_id) and x.status='firmado'
    order by x.firmado_at desc nulls last,x.remito_id desc limit 1
  ) r on true
  left join lateral (
    select x.driver_id from public.operator_service_assignments x
    where x.service_id=s.service_id and x.driver_id is not null and x.assigned_at<=s.completed_at
    order by x.assigned_at desc,x.assignment_sequence desc nulls last,x.assignment_id desc limit 1
  ) a on true
  where s.status='completed' and s.logistics_type='own' and s.completed_at is not null
    -- Preserve the existing rule: Activado Movida is not a payable service.
    and not (coalesce(s.driver_activated,false) and coalesce(s.activation_kind,'')='movement');
$f$;
revoke all on function app_private.completed_driver_services_v2() from public,anon,authenticated;

create or replace function app_private.driver_payroll_service_count_v2(p_driver uuid,p_from date,p_until date)
returns bigint language sql stable security definer set search_path to '' as $f$
  with entries as (
    select 's:'||c.service_id as key from app_private.completed_driver_services_v2() c
    where c.driver_id=p_driver
      and c.completed_at >= (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and c.completed_at < (p_until::timestamp at time zone 'America/Argentina/Buenos_Aires')
    union
    -- Keep legacy/unlinked signed remitos; a completed service is counted only above,
    -- even when its remito arrives in a later month or there is more than one remito.
    select coalesce('s:'||r.operator_service_id,'r:'||r.remito_id) from public.remitos r
    left join public.operator_services s on s.service_id=r.operator_service_id
    where r.driver_id=p_driver and r.status='firmado'
      and (s.service_id is null or (s.status not in ('completed','cancelled') and s.logistics_type='own'))
      and not exists(select 1 from public.operator_services x where x.remito_id=r.remito_id and x.status in ('completed','cancelled'))
      and r.created_at_device >= (p_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
      and r.created_at_device < (p_until::timestamp at time zone 'America/Argentina/Buenos_Aires')
  ) select count(*) from entries;
$f$;
revoke all on function app_private.driver_payroll_service_count_v2(uuid,date,date) from public,anon,authenticated;

create or replace function public.get_driver_remito_history_v3(p_remito_id integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare d jsonb; sid uuid; approved boolean; tolls jsonb; owner_id uuid;
begin
  select r.driver_id into owner_id from public.remitos r where r.remito_id=p_remito_id;
  if auth.uid() is null or (owner_id is distinct from auth.uid() and coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador','supervision','facturacion')) then raise exception 'Sin permiso'; end if;
  -- The existing endpoint validates session, owner and administrative roles.
  d:=public.get_driver_remito_addons_v2(p_remito_id);
  select s.service_id,coalesce(s.document_status='approved' and r.addons_review_status in ('approved','adjusted'),false)
    into sid,approved from public.remitos r join public.operator_services s
      on s.service_id=r.operator_service_id or s.remito_id=r.remito_id
    where r.remito_id=p_remito_id order by (s.service_id=r.operator_service_id) desc nulls last limit 1;
  if coalesce(approved,false) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'service_toll_id',t.service_toll_id,'toll_name',t.toll_name_snapshot,'quantity',t.quantity,
      'total_amount',t.total_amount,'currency',t.currency,'payer_agent',t.payer_agent,
      'customer_payment_method',t.customer_payment_method,'payment_method',t.payment_method
    ) order by t.created_at,t.service_toll_id),'[]'::jsonb) into tolls
    from public.operator_service_tolls t where t.service_id=sid and t.source='actual';
  end if;
  return d||jsonb_build_object('approved_tolls',tolls,'service_tolls_approved',coalesce(approved,false));
end $f$;
revoke all on function public.get_driver_remito_history_v3(integer) from public,anon;
grant execute on function public.get_driver_remito_history_v3(integer) to authenticated;

create or replace function app_private.monthly_cash_source_v2(p_driver uuid,p_period integer)
returns jsonb language plpgsql security definer set search_path to '' as $f$
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
    from public.service_payments p join services s using(service_id)
    where p.received_by=p_driver and p.method='cash' and p.voided_at is null
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
  ), grouped as (
    select fecha,sum(e) expected,sum(g) expenses from (
      select (d->>'fecha')::date fecha,(d->>'expected')::numeric e,(d->>'expenses')::numeric g from jsonb_array_elements(base->'days') d
      union all select fecha,expected,expenses from extra_cash where fecha>=v_from and fecha<v_until
    ) x group by fecha
  ) select coalesce(jsonb_agg(to_jsonb(grouped) order by fecha),'[]'::jsonb),coalesce(sum(grouped.expected),0),coalesce(sum(grouped.expenses),0)
    into v_days,v_expected,v_expenses from grouped;
  return base||jsonb_build_object('source_version',2,'days',v_days,'expected',v_expected,'expenses',v_expenses,'due',v_expected-v_expenses,
    'difference',presented-(v_expected-v_expenses),'discount',case when presented is null then 0 else greatest(0,v_expected-v_expenses-presented) end);
end $f$;
revoke all on function app_private.monthly_cash_source_v2(uuid,integer) from public,anon,authenticated;

create or replace function public.get_payroll_monthly_cash_v2(p_driver uuid,p_period integer)
returns jsonb language plpgsql security definer set search_path to '' as $f$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  return app_private.monthly_cash_source_v2(p_driver,p_period)||jsonb_build_object('can_edit',app_private.current_auxilios_role()='administracion');
end $f$;
revoke all on function public.get_payroll_monthly_cash_v2(uuid,integer) from public,anon;
grant execute on function public.get_payroll_monthly_cash_v2(uuid,integer) to authenticated;

create or replace function public.get_payroll_service_count_v2(p_driver uuid,p_period integer)
returns bigint language plpgsql stable security definer set search_path to '' as $f$
declare v_from date;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  if p_driver is null or p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from:=make_date(p_period/100,p_period%100,1);
  return app_private.driver_payroll_service_count_v2(p_driver,v_from,(v_from+interval '1 month')::date);
end $f$;
revoke all on function public.get_payroll_service_count_v2(uuid,integer) from public,anon;
grant execute on function public.get_payroll_service_count_v2(uuid,integer) to authenticated;

create or replace function app_private.payroll_matrix_sources_v2(p_driver uuid,p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare d jsonb; parts jsonb; extras jsonb; capture jsonb;
begin
  d:=app_private.payroll_matrix_sources_core(p_driver,p_from,p_until);
  -- A late remito must not pay a completed particular/captación again next month.
  d:=d||jsonb_build_object('invoices',coalesce((select jsonb_agg(i) from jsonb_array_elements(d->'invoices') i
    where not (i->>'id' like 'part:%' and exists(select 1 from public.operator_services s where s.service_id::text=i->>'service_id' and s.status in ('completed','cancelled')))),'[]'::jsonb),
    'captacion',coalesce((select jsonb_agg(i) from jsonb_array_elements(d->'captacion') i
    where not exists(select 1 from public.operator_services s where s.service_id::text=i->>'service_id' and s.status in ('completed','cancelled'))),'[]'::jsonb));
  -- Prestadora commissions retain their invoice-date rule. Particular services
  -- don't require an invoice, and must not require a signed remito either.
  select coalesce(jsonb_agg(jsonb_build_object('id','part:'||s.service_id,'service_id',s.service_id,
    'concept_id',s.primary_concept_id,'quantity',1,'amount',s.quoted_total,'currency','ARS','km',null,'client_kind','particular')),'[]'::jsonb)
    into parts from app_private.completed_driver_services_v2() c
    join public.operator_services s using(service_id) join public.companies co on co.company_id=s.company_id
    where c.driver_id=p_driver and co.client_kind='particular' and s.quoted_total is not null
      and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from
      and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until
      and not exists(select 1 from jsonb_array_elements(d->'invoices') i where i->>'service_id'=s.service_id::text);
  with services as (
    select s.* from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
    where c.driver_id=p_driver and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from
      and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until
      and not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status='firmado')
  ), entries as (
    select jsonb_build_object('id','op:'||e.excess_charge_id,'service_id',s.service_id,'concept_id',e.concept_id,
      'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency) line
      from services s join public.operator_service_excess_charges e using(service_id)
      where e.source='actual' and e.payer_agent='customer' and e.collector_agent='company'
        and e.customer_payment_method in ('cash','transfer','card','mercado_pago','other')
    union all
    select distinct jsonb_build_object('id','tog:'||s.service_id||':'||m.concept_id,'service_id',s.service_id,
      'concept_id',m.concept_id,'quantity',1,'amount',0,'currency','ARS')
      from services s join public.service_toggle_marks m using(service_id)
      join public.service_concepts sc on sc.concept_id=m.concept_id and sc.input_mode='toggle'
      where m.source='operator' and m.is_on
  ) select coalesce(jsonb_agg(line),'[]'::jsonb) into extras from entries;
  select coalesce(jsonb_agg(jsonb_build_object('id','capt:'||s.service_id,'service_id',s.service_id,
    'concept_id',null,'quantity',1,'amount',coalesce((select sum(p.amount) from public.service_payments p where p.service_id=s.service_id and p.voided_at is null),0),'currency','ARS')),'[]'::jsonb)
    into capture from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
    where s.referred_by_driver_id=p_driver and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from
      and (c.completed_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until
      and not exists(select 1 from jsonb_array_elements(d->'captacion') x where x->>'service_id'=s.service_id::text);
  return d||jsonb_build_object('invoices',(d->'invoices')||parts,'extras',(d->'extras')||extras,'captacion',(d->'captacion')||capture);
end $f$;
revoke all on function app_private.payroll_matrix_sources_v2(uuid,date,date) from public,anon,authenticated;

create or replace function public.get_payroll_matrix_sources_v2(p_driver uuid,p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
  if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
  return app_private.payroll_matrix_sources_v2(p_driver,p_from,p_until);
end $f$;
revoke all on function public.get_payroll_matrix_sources_v2(uuid,date,date) from public,anon;
grant execute on function public.get_payroll_matrix_sources_v2(uuid,date,date) to authenticated;

create or replace function public.get_driver_payroll_estimate_v2(p_period integer,p_driver uuid default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare d jsonb; v_driver uuid:=coalesce(p_driver,auth.uid()); v_from date; cash jsonb;
begin
  d:=public.get_driver_payroll_estimate_v1(p_period,p_driver); -- existing owner/role guard
  v_from:=make_date(p_period/100,p_period%100,1);
  cash:=app_private.monthly_cash_source_v2(v_driver,p_period);
  return d||jsonb_build_object('servicios',app_private.driver_payroll_service_count_v2(v_driver,v_from,(v_from+interval '1 month')::date),
    'descuento_rendicion',(cash->>'discount')::numeric,'sources',app_private.payroll_matrix_sources_v2(v_driver,v_from,(v_from+interval '1 month')::date));
end $f$;
revoke all on function public.get_driver_payroll_estimate_v2(integer,uuid) from public,anon;
grant execute on function public.get_driver_payroll_estimate_v2(integer,uuid) to authenticated;

create or replace function public.save_payroll_monthly_cash_v2(p_driver uuid,p_period integer,p_presented numeric,p_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path to '' as $f$
begin
  perform public.save_payroll_monthly_cash(p_driver,p_period,p_presented,p_updated_at); -- preserves guard, lock, audit and frozen receipts
  return app_private.monthly_cash_source_v2(p_driver,p_period);
end $f$;
revoke all on function public.save_payroll_monthly_cash_v2(uuid,integer,numeric,timestamptz) from public,anon;
grant execute on function public.save_payroll_monthly_cash_v2(uuid,integer,numeric,timestamptz) to authenticated;

-- Extend the guarded trigger only for new v2 snapshots. No existing row is changed.
do $mig$ declare d text; a text:='new.cash_snapshot:=app_private.monthly_cash_source(new.driver_id,new.periodo_yyyymm);'; begin
  d:=pg_get_functiondef('app_private.payroll_monthly_cash_guard()'::regprocedure);
  if position('completed_services_v2' in d)=0 then
    if (length(d)-length(replace(d,a,'')))/length(a)<>1 then raise exception 'payroll cash guard: anchor changed'; end if;
    execute replace(d,a,$b$if coalesce((new.compensation_snapshot->>'completed_services_v2')::boolean,false) then
      new.cash_snapshot:=app_private.monthly_cash_source_v2(new.driver_id,new.periodo_yyyymm);
    else new.cash_snapshot:=app_private.monthly_cash_source(new.driver_id,new.periodo_yyyymm); end if;$b$);
  end if;
end $mig$;
