create table public.payroll_cash_months (
 driver_id uuid not null references public.users(user_id),
 periodo_yyyymm integer not null check (periodo_yyyymm between 200001 and 219912 and periodo_yyyymm % 100 between 1 and 12),
 presented numeric(14,2) check(presented>=0),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 primary key(driver_id,periodo_yyyymm)
);
alter table public.payroll_cash_months enable row level security;
revoke all on public.payroll_cash_months from anon,authenticated;
create table public.journey_cash_expenses (
 log_id integer primary key references public.daily_logs(log_id), amount numeric(14,2) not null check(amount>=0),
 reason text, notes text, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.journey_cash_expenses enable row level security;
revoke all on public.journey_cash_expenses from anon,authenticated;
-- Private source of truth: no driver declarations enter the monthly calculation.
create function app_private.monthly_cash_source(p_driver uuid,p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_from date; v_days jsonb; v_expected numeric; v_expenses numeric; v_presented numeric; v_updated timestamptz;
begin
 if p_driver is null or p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
 v_from:=make_date(p_period/100,p_period%100,1);
 with days as (
 select j.log_date fecha,
 coalesce((select sum(case when r.addons_version>=2 or exists(select 1 from public.remito_toll_reports t where t.remito_id=r.remito_id) or exists(select 1 from public.remito_excess_reports e where e.remito_id=r.remito_id)
 then coalesce((select sum(t.total_amount) from public.remito_toll_reports t where t.remito_id=r.remito_id and t.customer_payment_method='cash'),0)+coalesce((select sum(e.total_amount) from public.remito_excess_reports e where e.remito_id=r.remito_id and e.customer_payment_method='cash'),0)
 else case when r.pago_1_metodo in ('efectivo','cash') then coalesce(r.pago_1_monto,0) else 0 end+case when r.pago_2_metodo in ('efectivo','cash') then coalesce(r.pago_2_monto,0) else 0 end end)
 from public.remitos r where r.log_id=j.log_id and r.status<>'anulado'),0) expected,
 public.calcular_gastos_jornada(j.log_id)
 +coalesce((select sum(t.total_amount) from public.remito_toll_reports t join public.remitos r using(remito_id) where r.log_id=j.log_id and r.status<>'anulado' and t.payment_method='cash'),0)
 +coalesce((select e.amount from public.journey_cash_expenses e where e.log_id=j.log_id),(select sum(coalesce(c.gastos_extra,0)) from public.rendicion_cierre c where c.log_id=j.log_id and c.estado<>'rechazado'),0) expenses
 from public.daily_logs j where j.driver_id=p_driver and j.log_date>=v_from and j.log_date<(v_from+interval '1 month')
 ), grouped as(select fecha,sum(expected) expected,sum(expenses) expenses from days group by fecha)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by fecha),'[]'::jsonb),coalesce(sum(expected),0),coalesce(sum(expenses),0) into v_days,v_expected,v_expenses from grouped;
 select presented,updated_at into v_presented,v_updated from public.payroll_cash_months where driver_id=p_driver and periodo_yyyymm=p_period;
 return jsonb_build_object('days',v_days,'expected',v_expected,'expenses',v_expenses,'due',v_expected-v_expenses,'presented',v_presented,'difference',v_presented-(v_expected-v_expenses),'discount',case when v_presented is null then 0 else greatest(0,v_expected-v_expenses-v_presented) end,'updated_at',v_updated);
end $$;
revoke all on function app_private.monthly_cash_source(uuid,integer) from public,anon,authenticated;
create function public.get_payroll_monthly_cash(p_driver uuid,p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 return app_private.monthly_cash_source(p_driver,p_period);
end $$;
revoke all on function public.get_payroll_monthly_cash(uuid,integer) from public,anon;
grant execute on function public.get_payroll_monthly_cash(uuid,integer) to authenticated;
create function public.save_payroll_monthly_cash(p_driver uuid,p_period integer,p_presented numeric,p_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.save_payroll_monthly_cash(uuid,integer,numeric,timestamptz) from public,anon;
grant execute on function public.save_payroll_monthly_cash(uuid,integer,numeric,timestamptz) to authenticated;
-- Enforce the same calculation for all pending payroll writes, including older clients.
alter table public.payroll_liquidaciones add column cash_snapshot jsonb;
create function app_private.payroll_monthly_cash_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.estado='pendiente' then
  new.cash_snapshot:=app_private.monthly_cash_source(new.driver_id,new.periodo_yyyymm);
  new.ajuste_rendiciones:=(new.cash_snapshot->>'discount')::numeric;
  new.total:=greatest(0,coalesce(new.sueldo_basico,0)+coalesce(new.adic_km,0)+coalesce(new.adic_serv,0)+case when new.presentismo_paga then coalesce(new.bono_presentismo,0) else 0 end+coalesce(new.bonos_objetivos,0)+coalesce(new.bonus_monthly,0)+coalesce(new.commission_total,0)-new.ajuste_rendiciones);
 end if;
 return new;
end $$;
revoke all on function app_private.payroll_monthly_cash_guard() from public,anon,authenticated;
create trigger payroll_monthly_cash_guard before insert or update on public.payroll_liquidaciones for each row execute function app_private.payroll_monthly_cash_guard();
create function public.save_journey_cash_expenses(p_log integer,p_amount numeric,p_reason text default null,p_notes text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.daily_logs where log_id=p_log and driver_id=auth.uid()) then raise exception 'Jornada no autorizada'; end if;
 if p_amount is null or p_amount<0 or p_amount::text in ('NaN','Infinity','-Infinity') or (p_amount>0 and nullif(trim(p_reason),'') is null) then raise exception 'Indicá un gasto válido y su motivo'; end if;
 insert into public.journey_cash_expenses(log_id,amount,reason,notes,updated_by) values(p_log,p_amount,p_reason,p_notes,auth.uid()) on conflict(log_id) do update set amount=excluded.amount,reason=excluded.reason,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.save_journey_cash_expenses(integer,numeric,text,text) from public,anon;
grant execute on function public.save_journey_cash_expenses(integer,numeric,text,text) to authenticated;
