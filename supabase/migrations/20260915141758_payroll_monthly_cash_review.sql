create or replace function public.get_payroll_monthly_cash(p_driver uuid,p_period integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 return app_private.monthly_cash_source(p_driver,p_period)||jsonb_build_object('can_edit',app_private.current_auxilios_role()='administracion');
end $$;
-- Preserve who changed each administration entry, including clearing an amount.
create table public.payroll_cash_history (
 id bigint generated always as identity primary key, driver_id uuid not null, periodo_yyyymm integer not null,
 previous_presented numeric(14,2), presented numeric(14,2), changed_by uuid not null, changed_at timestamptz not null default now()
);
alter table public.payroll_cash_history enable row level security;
revoke all on public.payroll_cash_history from anon,authenticated;
create function app_private.log_monthly_cash_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.payroll_cash_history(driver_id,periodo_yyyymm,previous_presented,presented,changed_by) values(new.driver_id,new.periodo_yyyymm,case when tg_op='UPDATE' then old.presented else null end,new.presented,new.updated_by);
 return new;
end $$;
revoke all on function app_private.log_monthly_cash_change() from public,anon,authenticated;
create trigger log_monthly_cash_change after insert or update on public.payroll_cash_months for each row execute function app_private.log_monthly_cash_change();
-- Freeze the current monthly source when moving a pending receipt to approved.
do $$ declare d text; begin
 select pg_get_functiondef('app_private.payroll_monthly_cash_guard()'::regprocedure) into d;
 d:=replace(d,'if new.estado=''pendiente'' then','if new.estado=''pendiente'' or (tg_op=''UPDATE'' and old.estado=''pendiente'' and new.estado=''aprobada'') then');
 execute d;
end $$;
create function app_private.journey_cash_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.payroll_liquidaciones p set review_required=p.estado<>'pendiente',review_reason=case when p.estado<>'pendiente' then 'Cambió un gasto en efectivo. Revisá la rendición mensual.' else null end from public.daily_logs j where j.log_id=new.log_id and p.driver_id=j.driver_id and p.periodo_yyyymm=extract(year from j.log_date)::integer*100+extract(month from j.log_date)::integer;
 return new;
end $$;
revoke all on function app_private.journey_cash_changed() from public,anon,authenticated;
create trigger journey_cash_changed after insert or update on public.journey_cash_expenses for each row execute function app_private.journey_cash_changed();
