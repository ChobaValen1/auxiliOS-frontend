-- AuxiliOS · propagación de correcciones administrativas v1
-- Mantener sincronizado con la migración aplicada en Supabase el 2026-08-08.

alter table public.daily_logs
  add column if not exists void_previous_status varchar(10);

alter table public.payroll_liquidaciones
  add column if not exists review_required boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists review_detected_at timestamptz,
  add column if not exists proposed_jornadas integer,
  add column if not exists proposed_km_total integer,
  add column if not exists proposed_servicios integer,
  add column if not exists proposed_ajuste_rendiciones numeric,
  add column if not exists proposed_total numeric,
  add column if not exists adjustment_pending numeric;

create or replace function app_private.recalculate_payroll_impact(p_driver_id uuid,p_yyyymm integer,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare
  v_liq public.payroll_liquidaciones%rowtype; v_year integer; v_month integer; v_from date; v_to date;
  v_from_ts timestamptz; v_to_ts timestamptz; v_jornadas integer:=0; v_km integer:=0; v_servicios integer:=0;
  v_incidentes integer:=0; v_bonos numeric:=0; v_diff numeric:=0; v_ajuste numeric:=0; v_presentismo boolean:=false;
  v_adic_km numeric:=0; v_adic_serv numeric:=0; v_bono_presentismo numeric:=0; v_total numeric:=0; v_delta numeric:=0;
begin
  if p_driver_id is null or p_yyyymm is null then return jsonb_build_object('ok',false,'reason','missing_scope'); end if;
  select * into v_liq from public.payroll_liquidaciones where driver_id=p_driver_id and periodo_yyyymm=p_yyyymm for update;
  if not found then return jsonb_build_object('ok',true,'liquidation_found',false); end if;
  v_year:=p_yyyymm/100; v_month:=p_yyyymm%100;
  if v_month<1 or v_month>12 then raise exception 'PERIODO_INVALIDO: %',p_yyyymm; end if;
  v_from:=make_date(v_year,v_month,1); v_to:=(v_from+interval '1 month')::date;
  v_from_ts:=make_timestamptz(v_year,v_month,1,0,0,0,'America/Argentina/Buenos_Aires'); v_to_ts:=v_from_ts+interval '1 month';
  select count(*)::integer,coalesce(sum(greatest(0,coalesce(km_final,0)-coalesce(km_inicio,0))),0)::integer into v_jornadas,v_km
    from public.daily_logs where driver_id=p_driver_id and status='closed' and log_date>=v_from and log_date<v_to;
  select count(*)::integer into v_servicios from public.remitos where driver_id=p_driver_id and status='firmado' and created_at_device>=v_from_ts and created_at_device<v_to_ts;
  select coalesce(sum(bonus_calculado),0) into v_bonos from public.payroll_objetivo_cumplimientos where driver_id=p_driver_id and periodo_yyyymm=p_yyyymm;
  select count(*)::integer into v_incidentes from public.incidents where driver_id=p_driver_id and created_at_device>=v_from_ts and created_at_device<v_to_ts;
  select coalesce(sum(coalesce(efectivo_declarado,0)+coalesce(gastos_extra,0)-coalesce(efectivo_esperado,0)),0) into v_diff
    from public.rendicion_cierre where driver_id=p_driver_id and coalesce(estado,'')<>'rechazado' and fecha>=v_from and fecha<v_to;
  v_ajuste:=case when greatest(0,-v_diff)>=500 then greatest(0,-v_diff) else 0 end;
  v_presentismo:=(v_incidentes=0 and v_jornadas>0);
  v_adic_km:=v_km*coalesce(v_liq.valor_km_snapshot,0); v_adic_serv:=v_servicios*coalesce(v_liq.valor_servicio_snapshot,0);
  v_bono_presentismo:=case when v_presentismo then coalesce(v_liq.bono_presentismo_snapshot,0) else 0 end;
  v_total:=greatest(0,coalesce(v_liq.sueldo_basico,0)+v_adic_km+v_adic_serv+v_bono_presentismo+v_bonos-v_ajuste); v_delta:=v_total-coalesce(v_liq.total,0);
  if v_liq.estado='pendiente' then
    update public.payroll_liquidaciones set jornadas=v_jornadas,km_total=v_km,servicios=v_servicios,adic_km=v_adic_km,adic_serv=v_adic_serv,
      presentismo_paga=v_presentismo,bono_presentismo=v_bono_presentismo,bonos_objetivos=v_bonos,ajuste_rendiciones=v_ajuste,total=v_total,
      review_required=false,review_reason=null,review_detected_at=null,proposed_jornadas=null,proposed_km_total=null,proposed_servicios=null,
      proposed_ajuste_rendiciones=null,proposed_total=null,adjustment_pending=null where liquidacion_id=v_liq.liquidacion_id;
  else
    update public.payroll_liquidaciones set review_required=true,
      review_reason=concat_ws(E'\n',nullif(review_reason,''),coalesce(nullif(trim(p_reason),''),'Corrección administrativa posterior a la liquidación.')),
      review_detected_at=now(),proposed_jornadas=v_jornadas,proposed_km_total=v_km,proposed_servicios=v_servicios,
      proposed_ajuste_rendiciones=v_ajuste,proposed_total=v_total,adjustment_pending=v_delta where liquidacion_id=v_liq.liquidacion_id;
  end if;
  return jsonb_build_object('ok',true,'liquidation_found',true,'estado',v_liq.estado,'current_total',v_liq.total,'proposed_total',v_total,'delta',v_delta,'km_total',v_km,'servicios',v_servicios,'jornadas',v_jornadas);
end;$$;

create or replace function app_private.recompute_truck_odometer_after_correction(p_truck_id integer,p_previous_candidate integer default null)
returns integer language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_current integer; v_candidate integer;
begin
  if p_truck_id is null then return null; end if;
  select current_km into v_current from public.trucks where truck_id=p_truck_id for update; if not found then return null; end if;
  if p_previous_candidate is not null and coalesce(v_current,0)>p_previous_candidate then return v_current; end if;
  select greatest(
    coalesce((select max(greatest(coalesce(km_inicio,0),coalesce(km_final,0))) from public.daily_logs where truck_id=p_truck_id and status<>'voided'),0),
    coalesce((select max(km_at_load) from public.fuel_records where truck_id=p_truck_id and coalesce(status,'active')='active'),0),
    coalesce((select max(km_at_service) from public.maintenance_logs where truck_id=p_truck_id),0)
  )::integer into v_candidate;
  update public.trucks set current_km=v_candidate where truck_id=p_truck_id; return v_candidate;
end;$$;

create or replace function public.fn_actualizar_km_camion() returns trigger language plpgsql set search_path=public,app_private,pg_temp as $$
begin
  if old.truck_id is distinct from new.truck_id then
    perform app_private.recompute_truck_odometer_after_correction(old.truck_id,old.km_final);
    perform app_private.recompute_truck_odometer_after_correction(new.truck_id,null);
  elsif old.km_inicio is distinct from new.km_inicio or old.km_final is distinct from new.km_final or old.status is distinct from new.status then
    perform app_private.recompute_truck_odometer_after_correction(new.truck_id,old.km_final);
  end if;
  return new;
end;$$;

create or replace function app_private.daily_log_impact_sync() returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_old_period integer; v_new_period integer; v_reason text;
begin
  v_reason:=coalesce(nullif(new.correction_reason,''),nullif(new.void_reason,''),'Corrección de jornada');
  v_old_period:=extract(year from old.log_date)::integer*100+extract(month from old.log_date)::integer;
  v_new_period:=extract(year from new.log_date)::integer*100+extract(month from new.log_date)::integer;
  perform app_private.recalculate_payroll_impact(old.driver_id,v_old_period,v_reason);
  if new.driver_id is distinct from old.driver_id or v_new_period<>v_old_period then perform app_private.recalculate_payroll_impact(new.driver_id,v_new_period,v_reason); end if;
  return null;
end;$$;

drop trigger if exists trg_daily_logs_impact_sync on public.daily_logs;
create trigger trg_daily_logs_impact_sync after update of km_inicio,km_final,status,driver_id,log_date,truck_id on public.daily_logs for each row execute function app_private.daily_log_impact_sync();

create or replace function public.tg_remitos_sync_rendicion() returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_economic_change boolean:=false; v_reason text; v_old_period integer; v_new_period integer;
begin
  if tg_op='INSERT' then
    perform app_private.sync_rendicion_jornada(new.log_id,true,format('Revisión automática: se agregó el remito %s a la jornada después del cierre de rendición.',coalesce(new.nro_remito,new.remito_id::text)));
    v_new_period:=extract(year from new.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer*100+extract(month from new.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer;
    perform app_private.recalculate_payroll_impact(new.driver_id,v_new_period,'Revisión automática: se agregó un remito que impacta la liquidación.'); return null;
  end if;
  if tg_op='DELETE' then
    perform app_private.sync_rendicion_jornada(old.log_id,true,format('Revisión automática: se eliminó el remito %s vinculado a la jornada.',coalesce(old.nro_remito,old.remito_id::text)));
    v_old_period:=extract(year from old.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer*100+extract(month from old.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer;
    perform app_private.recalculate_payroll_impact(old.driver_id,v_old_period,'Revisión automática: se eliminó un remito que impacta la liquidación.'); return null;
  end if;
  v_economic_change:=new.log_id is distinct from old.log_id or new.driver_id is distinct from old.driver_id or new.created_at_device is distinct from old.created_at_device
    or new.status is distinct from old.status or new.imp_peaje is distinct from old.imp_peaje or new.imp_excedente is distinct from old.imp_excedente or new.imp_otros is distinct from old.imp_otros
    or new.pago_1_metodo is distinct from old.pago_1_metodo or new.pago_1_monto is distinct from old.pago_1_monto or new.pago_2_metodo is distinct from old.pago_2_metodo or new.pago_2_monto is distinct from old.pago_2_monto;
  if not v_economic_change then return null; end if;
  v_reason:=format('Revisión automática: se corrigió el remito %s. Consultar historial para valores anteriores y posteriores.',coalesce(new.nro_remito,old.nro_remito,new.remito_id::text,old.remito_id::text));
  if old.log_id is not null then perform app_private.sync_rendicion_jornada(old.log_id,true,v_reason); end if;
  if new.log_id is not null and new.log_id is distinct from old.log_id then perform app_private.sync_rendicion_jornada(new.log_id,true,v_reason); end if;
  v_old_period:=extract(year from old.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer*100+extract(month from old.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer;
  v_new_period:=extract(year from new.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer*100+extract(month from new.created_at_device at time zone 'America/Argentina/Buenos_Aires')::integer;
  perform app_private.recalculate_payroll_impact(old.driver_id,v_old_period,v_reason);
  if new.driver_id is distinct from old.driver_id or v_new_period<>v_old_period then perform app_private.recalculate_payroll_impact(new.driver_id,v_new_period,v_reason); end if;
  return null;
end;$$;

drop trigger if exists trg_remitos_sync_rendicion on public.remitos;
create trigger trg_remitos_sync_rendicion after insert or delete or update of log_id,driver_id,created_at_device,status,imp_peaje,imp_excedente,imp_otros,pago_1_metodo,pago_1_monto,pago_2_metodo,pago_2_monto on public.remitos for each row execute function public.tg_remitos_sync_rendicion();

create or replace function public.tg_fuel_sync_rendicion() returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_economic_change boolean:=false; v_reason text; v_driver uuid; v_period integer;
begin
  if tg_op='INSERT' then
    if new.log_id is not null then perform app_private.sync_rendicion_jornada(new.log_id,true,'Revisión automática: se agregó una carga de combustible a la jornada.'); select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=new.log_id; perform app_private.recalculate_payroll_impact(v_driver,v_period,'Revisión automática: se agregó combustible a la jornada.'); end if; return null;
  end if;
  if tg_op='DELETE' then
    if old.log_id is not null then perform app_private.sync_rendicion_jornada(old.log_id,true,'Revisión automática: se eliminó una carga de combustible vinculada a la jornada.'); select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=old.log_id; perform app_private.recalculate_payroll_impact(v_driver,v_period,'Revisión automática: se eliminó combustible de la jornada.'); end if; return null;
  end if;
  v_economic_change:=new.log_id is distinct from old.log_id or new.liters is distinct from old.liters or new.price_per_liter is distinct from old.price_per_liter or new.payment_method is distinct from old.payment_method or new.status is distinct from old.status;
  if not v_economic_change then return null; end if;
  v_reason:='Revisión automática: se corrigió una carga de combustible vinculada a la jornada.';
  if old.log_id is not null then perform app_private.sync_rendicion_jornada(old.log_id,true,v_reason); select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=old.log_id; perform app_private.recalculate_payroll_impact(v_driver,v_period,v_reason); end if;
  if new.log_id is not null and new.log_id is distinct from old.log_id then perform app_private.sync_rendicion_jornada(new.log_id,true,v_reason); select driver_id,extract(year from log_date)::integer*100+extract(month from log_date)::integer into v_driver,v_period from public.daily_logs where log_id=new.log_id; perform app_private.recalculate_payroll_impact(v_driver,v_period,v_reason); end if;
  return null;
end;$$;

create or replace function public.get_daily_log_admin_impact(p_log_id integer) returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role(); v_log public.daily_logs%rowtype; v_liq public.payroll_liquidaciones%rowtype; v_rend public.rendicion_cierre%rowtype; v_period integer;
begin
  if v_role<>all(array['administracion','supervision']) then raise exception 'JORNADA_NO_AUTORIZADA' using errcode='42501'; end if;
  select * into v_log from public.daily_logs where log_id=p_log_id; if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  v_period:=extract(year from v_log.log_date)::integer*100+extract(month from v_log.log_date)::integer;
  select * into v_liq from public.payroll_liquidaciones where driver_id=v_log.driver_id and periodo_yyyymm=v_period;
  select * into v_rend from public.rendicion_cierre where log_id=p_log_id order by created_at desc limit 1;
  return jsonb_build_object('log_id',p_log_id,'periodo',v_period,
    'rendicion',case when v_rend.rendicion_id is null then null else jsonb_build_object('id',v_rend.rendicion_id,'admin_status',v_rend.admin_status,'estado',v_rend.estado) end,
    'liquidacion',case when v_liq.liquidacion_id is null then null else jsonb_build_object('id',v_liq.liquidacion_id,'estado',v_liq.estado,'total',v_liq.total,'review_required',v_liq.review_required) end);
end;$$;

create or replace function public.get_daily_log_admin_history(p_log_id integer)
returns table(event_id uuid,occurred_at timestamptz,actor_name text,operation text,before_data jsonb,after_data jsonb)
language sql security definer set search_path=public,app_private,pg_temp as $$
  select ae.event_id,ae.occurred_at,coalesce(u.full_name,'Sistema'),ae.operation,ae.before_data,ae.after_data from public.audit_events ae
  left join public.users u on u.user_id=ae.actor_id
  where app_private.current_auxilios_role()=any(array['administracion'::text,'supervision'::text]) and ae.entity_table='daily_logs' and ae.entity_id=p_log_id::text order by ae.occurred_at desc;
$$;

create or replace function public.list_voided_daily_logs_admin(p_limit integer default 100)
returns table(log_id integer,driver_id uuid,driver_name text,truck_id integer,truck_plate text,log_date date,km_inicio integer,km_final integer,voided_at timestamptz,void_reason text)
language sql security definer set search_path=public,app_private,pg_temp as $$
  select dl.log_id,dl.driver_id,u.full_name,dl.truck_id,t.plate,dl.log_date,dl.km_inicio,dl.km_final,dl.voided_at,dl.void_reason from public.daily_logs dl
  left join public.users u on u.user_id=dl.driver_id left join public.trucks t on t.truck_id=dl.truck_id
  where app_private.current_auxilios_role()='administracion' and dl.status='voided' order by dl.voided_at desc nulls last limit greatest(1,least(coalesce(p_limit,100),500));
$$;

create or replace function public.restore_daily_log_admin(p_log_id integer,p_reason text) returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role(); v_log public.daily_logs%rowtype; v_status text;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede restaurar jornadas' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;
  select * into v_log from public.daily_logs where log_id=p_log_id for update; if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status<>'voided' then return jsonb_build_object('ok',true,'log_id',p_log_id,'already_active',true); end if;
  v_status:=coalesce(v_log.void_previous_status,(select ae.before_data->>'status' from public.audit_events ae where ae.entity_table='daily_logs' and ae.entity_id=p_log_id::text and ae.after_data->>'status'='voided' order by ae.occurred_at desc limit 1),'closed');
  if v_status not in ('open','closed') then v_status:='closed'; end if;
  if v_status='closed' and (v_log.km_final is null or v_log.hora_fin is null) then raise exception 'JORNADA_CIERRE_INCOMPLETO: no se puede restaurar como cerrada sin KM/hora final' using errcode='23514'; end if;
  update public.daily_logs set status=v_status,voided_at=null,voided_by=null,void_reason=null,void_previous_status=null,updated_at=now(),updated_by=auth.uid(),correction_reason='Restauración: '||trim(p_reason) where log_id=p_log_id;
  return jsonb_build_object('ok',true,'log_id',p_log_id,'status',v_status);
end;$$;

create or replace function public.void_daily_log_admin(p_log_id integer,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text:=app_private.current_auxilios_role(); v_log public.daily_logs%rowtype; v_remitos integer; v_fuel integer; v_rend integer; v_checks integer; v_incidents integer;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede anular jornadas' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;
  select * into v_log from public.daily_logs where log_id=p_log_id for update; if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status='voided' then return jsonb_build_object('ok',true,'log_id',p_log_id,'already_voided',true); end if;
  select count(*) into v_remitos from public.remitos where log_id=p_log_id and coalesce(status,'')<>'anulado'; select count(*) into v_fuel from public.fuel_records where log_id=p_log_id and coalesce(status,'active')<>'voided';
  select count(*) into v_rend from public.rendicion_cierre where log_id=p_log_id and coalesce(estado,'')<>'rechazado'; select count(*) into v_checks from public.tire_checks where log_id=p_log_id; select count(*) into v_incidents from public.incidents where log_id=p_log_id;
  update public.daily_logs set status='voided',void_previous_status=v_log.status,voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),updated_at=now(),updated_by=auth.uid(),correction_reason='Anulación: '||trim(p_reason) where log_id=p_log_id;
  return jsonb_build_object('ok',true,'log_id',p_log_id,'linked',jsonb_build_object('remitos',v_remitos,'fuel',v_fuel,'rendiciones',v_rend,'checklists',v_checks,'incidentes',v_incidents));
end;$$;

revoke all on function public.get_daily_log_admin_impact(integer) from public;
revoke all on function public.get_daily_log_admin_history(integer) from public;
revoke all on function public.list_voided_daily_logs_admin(integer) from public;
revoke all on function public.restore_daily_log_admin(integer,text) from public;
grant execute on function public.get_daily_log_admin_impact(integer) to authenticated;
grant execute on function public.get_daily_log_admin_history(integer) to authenticated;
grant execute on function public.list_voided_daily_logs_admin(integer) to authenticated;
grant execute on function public.restore_daily_log_admin(integer,text) to authenticated;