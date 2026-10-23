-- Isolated PostgreSQL fixture. No live customer or driver data.
create role anon; create role authenticated;
create schema auth; create schema app_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function app_private.current_auxilios_role() returns text language sql as $$select nullif(current_setting('test.role',true),'')$$;
create table public.operator_services(service_id uuid primary key,status text,logistics_type text default 'own',completed_at timestamptz,remito_id integer,assigned_driver_id uuid,driver_activated boolean default false,activation_kind text,activation_driver_id uuid,document_status text,company_id uuid,quoted_total numeric,primary_concept_id uuid,referred_by_driver_id uuid,customer_payment_primary text,customer_payment_secondary text,customer_payment_secondary_amount numeric);
create table public.operator_service_assignments(assignment_id uuid default gen_random_uuid(),service_id uuid,driver_id uuid,assigned_at timestamptz,assignment_sequence integer);
create table public.remitos(remito_id integer primary key,operator_service_id uuid,driver_id uuid,status text,firmado_at timestamptz,created_at_device timestamptz,log_id integer,addons_version integer default 2,addons_review_status text,accepted_imp_peaje numeric,pago_1_metodo text,pago_1_monto numeric,pago_2_metodo text,pago_2_monto numeric);
create table public.operator_service_tolls(service_toll_id uuid default gen_random_uuid(),service_id uuid,source text,toll_name_snapshot text,quantity integer default 1,total_amount numeric,unit_amount numeric,customer_unit_amount numeric,currency text default 'ARS',payer_agent text,payment_method text,customer_payment_method text,created_at timestamptz default now());
create table public.operator_service_excess_charges(excess_charge_id uuid default gen_random_uuid(),service_id uuid,source text,concept_id uuid,quantity numeric,total_amount numeric,currency text,payer_agent text,collector_agent text,customer_payment_method text);
create table public.service_payments(service_id uuid,kind text,amount numeric,method text,paid_at timestamptz,received_by uuid,voided_at timestamptz);
create table public.service_collection_reports(service_id uuid,remito_id integer,driver_id uuid,lines jsonb,status text,created_at timestamptz);
create table public.daily_logs(log_id integer primary key,driver_id uuid,log_date date);
create table public.remito_toll_reports(remito_id integer,total_amount numeric,payment_method text,customer_payment_method text);
create table public.remito_excess_reports(remito_id integer,total_amount numeric,customer_payment_method text);
create table public.journey_cash_expenses(log_id integer,amount numeric);
create table public.rendicion_cierre(log_id integer,estado text,gastos_extra numeric);
create table public.payroll_cash_months(driver_id uuid,periodo_yyyymm integer,presented numeric,updated_at timestamptz default now(),updated_by uuid,primary key(driver_id,periodo_yyyymm));
create table public.payroll_liquidaciones(driver_id uuid,periodo_yyyymm integer,estado text,compensation_snapshot jsonb,cash_snapshot jsonb,ajuste_rendiciones numeric,total numeric,sueldo_basico numeric,adic_km numeric,adic_serv numeric,presentismo_paga boolean,bono_presentismo numeric,bonos_objetivos numeric,bonus_monthly numeric,commission_total numeric,review_required boolean,review_reason text);
create table public.companies(company_id uuid,client_kind text);
create table public.service_concepts(concept_id uuid,input_mode text);
create table public.service_toggle_marks(service_id uuid,concept_id uuid,source text,is_on boolean);
create function public.calcular_gastos_jornada(integer) returns numeric language sql as $$select 0::numeric$$;
create function app_private.remito_customer_payment_lines_v1(integer) returns table(method text,amount numeric) language sql as $$
select customer_payment_method,total_amount from public.remito_toll_reports where remito_id=$1
union all select customer_payment_method,total_amount from public.remito_excess_reports where remito_id=$1$$;
create function app_private.payroll_matrix_sources_core(uuid,date,date) returns jsonb language sql as $$
select jsonb_build_object('invoices',coalesce((select jsonb_agg(jsonb_build_object('id','part:'||s.service_id,'service_id',s.service_id,'amount',s.quoted_total)) from public.operator_services s where s.quoted_total is not null and exists(select 1 from public.remitos r where r.operator_service_id=s.service_id and r.status='firmado' and r.driver_id=$1 and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=$2 and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<$3)),'[]'::jsonb),'extras','[]'::jsonb,'captacion','[]'::jsonb)$$;
create function public.get_driver_payroll_estimate_v1(p_period integer,p_driver uuid default null) returns jsonb language plpgsql as $$
begin
if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')='' or (coalesce(p_driver,auth.uid())<>auth.uid() and app_private.current_auxilios_role() not in ('administracion','supervision')) then raise exception 'Sin permiso'; end if;
if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
return jsonb_build_object('servicios',0,'sources','{}'::jsonb,'descuento_rendicion',0);end$$;
create function public.get_driver_remito_addons_v2(p_remito_id integer) returns jsonb language sql as $$
select jsonb_build_object('remito_id',r.remito_id,'service_id',r.operator_service_id,'review_status',r.addons_review_status,'accepted_toll_total',r.accepted_imp_peaje,'tolls','[]'::jsonb,'excesses','[]'::jsonb)
from public.remitos r where remito_id=p_remito_id$$;
CREATE OR REPLACE FUNCTION app_private.monthly_cash_source(p_driver uuid, p_period integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_from date; v_days jsonb; v_expected numeric; v_expenses numeric; v_presented numeric; v_updated timestamptz;
begin
 if p_driver is null or p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
 v_from:=make_date(p_period/100,p_period%100,1);
 with days as (
 select j.log_date fecha,
 coalesce((select sum(case when r.addons_version>=2 or exists(select 1 from public.remito_toll_reports t where t.remito_id=r.remito_id) or exists(select 1 from public.remito_excess_reports e where e.remito_id=r.remito_id)
 then coalesce((select sum(x.amount) from app_private.remito_customer_payment_lines_v1(r.remito_id) x where x.method='cash'),0)
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
end $function$
;
CREATE OR REPLACE FUNCTION app_private.private_collection_cash_v1(p_remito_id integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(sum((l->>'amount')::numeric), 0)
    from public.service_collection_reports c
    cross join lateral jsonb_array_elements(c.lines) l
   where c.remito_id = p_remito_id and c.status <> 'rejected' and l->>'method' = 'cash';
$function$
;
CREATE OR REPLACE FUNCTION public.save_payroll_monthly_cash(p_driver uuid, p_period integer, p_presented numeric, p_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old public.payroll_cash_months; v_liq public.payroll_liquidaciones;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'administracion' then raise exception 'Solo Administración puede registrar el importe presentado'; end if;
 if p_presented is not null and (p_presented<0 or p_presented::text in ('NaN','Infinity','-Infinity')) then raise exception 'Importe inválido'; end if;
 perform app_private.monthly_cash_source(p_driver,p_period);
 perform pg_advisory_xact_lock(hashtextextended(p_driver::text||p_period::text,0));
 select * into v_old from public.payroll_cash_months where driver_id=p_driver and periodo_yyyymm=p_period for update;
 if v_old.updated_at is distinct from p_updated_at then raise exception 'La rendición cambió. Volvé a abrirla antes de guardar'; end if;
 insert into public.payroll_cash_months(driver_id,periodo_yyyymm,presented,updated_by) values(p_driver,p_period,p_presented,auth.uid())
 on conflict(driver_id,periodo_yyyymm) do update set presented=excluded.presented,updated_by=auth.uid(),updated_at=clock_timestamp();
 update public.payroll_liquidaciones set review_required=estado<>'pendiente',review_reason=case when estado<>'pendiente' then 'Cambió el total presentado mensual. Revisá el recibo guardado.' else null end where driver_id=p_driver and periodo_yyyymm=p_period;
 return app_private.monthly_cash_source(p_driver,p_period);
end $function$
;
CREATE OR REPLACE FUNCTION app_private.payroll_monthly_cash_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.estado='pendiente' or (tg_op='UPDATE' and old.estado='pendiente' and new.estado='aprobada') then
  new.cash_snapshot:=app_private.monthly_cash_source(new.driver_id,new.periodo_yyyymm);
  new.ajuste_rendiciones:=(new.cash_snapshot->>'discount')::numeric;
  new.total:=greatest(0,coalesce(new.sueldo_basico,0)+coalesce(new.adic_km,0)+coalesce(new.adic_serv,0)+case when new.presentismo_paga then coalesce(new.bono_presentismo,0) else 0 end+coalesce(new.bonos_objetivos,0)+coalesce(new.bonus_monthly,0)+coalesce(new.commission_total,0)-new.ajuste_rendiciones);
 end if;
 return new;
end $function$
;
create trigger payroll_monthly_cash_guard before insert or update on public.payroll_liquidaciones for each row execute function app_private.payroll_monthly_cash_guard();
