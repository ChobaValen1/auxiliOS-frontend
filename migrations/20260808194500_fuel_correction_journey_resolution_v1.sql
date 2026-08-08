create or replace function app_private.resolve_fuel_journey(p_log_id integer,p_truck_id integer,p_fuel_date date)
returns integer language sql stable security definer set search_path=public,app_private,pg_temp as $$
  select coalesce(p_log_id,(select case when count(*)=1 then min(dl.log_id) else null end from public.daily_logs dl where dl.truck_id=p_truck_id and dl.log_date=p_fuel_date and dl.status<>'voided'));
$$;

create or replace function public.tg_fuel_sync_rendicion()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_economic_change boolean:=false; v_reason text; v_old_log integer; v_new_log integer; v_driver uuid; v_period integer;
begin
  if tg_op='INSERT' then
    v_new_log:=app_private.resolve_fuel_journey(new.log_id,new.truck_id,new.fuel_date);
    if v_new_log is not null then
      perform app_private.sync_rendicion_jornada(v_new_log,true,'Revisión automática: se agregó una carga de combustible a la jornada.');
      select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=v_new_log;
      perform app_private.recalculate_payroll_impact(v_driver,v_period,'Revisión automática: se agregó combustible a la jornada.');
    end if; return null;
  end if;
  if tg_op='DELETE' then
    v_old_log:=app_private.resolve_fuel_journey(old.log_id,old.truck_id,old.fuel_date);
    if v_old_log is not null then
      perform app_private.sync_rendicion_jornada(v_old_log,true,'Revisión automática: se eliminó una carga de combustible vinculada a la jornada.');
      select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=v_old_log;
      perform app_private.recalculate_payroll_impact(v_driver,v_period,'Revisión automática: se eliminó combustible de la jornada.');
    end if; return null;
  end if;
  v_economic_change:=new.log_id is distinct from old.log_id or new.truck_id is distinct from old.truck_id or new.fuel_date is distinct from old.fuel_date or new.liters is distinct from old.liters or new.price_per_liter is distinct from old.price_per_liter or new.payment_method is distinct from old.payment_method or new.status is distinct from old.status;
  if not v_economic_change then return null; end if;
  v_reason:='Revisión automática: se corrigió una carga de combustible vinculada a la jornada.';
  v_old_log:=app_private.resolve_fuel_journey(old.log_id,old.truck_id,old.fuel_date);
  v_new_log:=app_private.resolve_fuel_journey(new.log_id,new.truck_id,new.fuel_date);
  if v_old_log is not null then
    perform app_private.sync_rendicion_jornada(v_old_log,true,v_reason);
    select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=v_old_log;
    perform app_private.recalculate_payroll_impact(v_driver,v_period,v_reason);
  end if;
  if v_new_log is not null and v_new_log is distinct from v_old_log then
    perform app_private.sync_rendicion_jornada(v_new_log,true,v_reason);
    select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=v_new_log;
    perform app_private.recalculate_payroll_impact(v_driver,v_period,v_reason);
  end if;
  return null;
end;$$;