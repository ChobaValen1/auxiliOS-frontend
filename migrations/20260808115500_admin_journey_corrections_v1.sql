-- AuxiliOS · Jornadas admin · correcciones y anulación lógica v1
-- Aplicado en producción el 2026-08-08.

alter table public.daily_logs
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references public.users(user_id),
  add column if not exists correction_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.users(user_id),
  add column if not exists void_reason text;

alter table public.daily_logs drop constraint if exists daily_logs_status_check;
alter table public.daily_logs add constraint daily_logs_status_check
  check (status::text = any (array['open'::varchar,'closed'::varchar,'voided'::varchar]::text[]));

alter table public.daily_logs drop constraint if exists daily_logs_driver_truck_date_key;
create unique index if not exists daily_logs_driver_truck_date_active_uidx
  on public.daily_logs(driver_id, log_date, truck_id)
  where status <> 'voided';

create or replace function public.update_daily_log_admin(p_log_id integer,p_patch jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_role text:=app_private.current_auxilios_role(); v_log public.daily_logs%rowtype; v_key text;
  v_km_inicio integer; v_km_final integer; v_hora_inicio time; v_hora_fin time; v_km_excepcion boolean;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede corregir jornadas' using errcode='42501'; end if;
  if p_log_id is null then raise exception 'JORNADA_INVALIDA: falta log_id' using errcode='22023'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then raise exception 'JORNADA_INVALIDA: no hay cambios para guardar' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key<>all(array['km_inicio','km_final','hora_inicio','hora_fin','in_workshop','workshop_detail','notas','km_excepcion']) then
      raise exception 'JORNADA_CAMPO_NO_EDITABLE: %',v_key using errcode='22023';
    end if;
  end loop;
  select * into v_log from public.daily_logs where log_id=p_log_id for update;
  if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status='voided' then raise exception 'JORNADA_ANULADA: no se puede editar una jornada eliminada' using errcode='23514'; end if;
  v_km_inicio:=case when p_patch?'km_inicio' then nullif(p_patch->>'km_inicio','')::integer else v_log.km_inicio end;
  v_km_final:=case when p_patch?'km_final' then nullif(p_patch->>'km_final','')::integer else v_log.km_final end;
  v_hora_inicio:=case when p_patch?'hora_inicio' then nullif(p_patch->>'hora_inicio','')::time else v_log.hora_inicio end;
  v_hora_fin:=case when p_patch?'hora_fin' then nullif(p_patch->>'hora_fin','')::time else v_log.hora_fin end;
  v_km_excepcion:=case when p_patch?'km_excepcion' then coalesce((p_patch->>'km_excepcion')::boolean,false) else coalesce(v_log.km_excepcion,false) end;
  if v_km_inicio is null or v_km_inicio<0 then raise exception 'JORNADA_KM_INVALIDO: KM inicial inválido' using errcode='23514'; end if;
  if v_km_final is not null and v_km_final<0 then raise exception 'JORNADA_KM_INVALIDO: KM final inválido' using errcode='23514'; end if;
  if v_km_final is not null and v_km_final<v_km_inicio and not v_km_excepcion then raise exception 'JORNADA_KM_INVALIDO: KM final menor al inicial; activá excepción si corresponde' using errcode='23514'; end if;
  if v_log.status='closed' and (v_km_final is null or v_hora_fin is null) then raise exception 'JORNADA_CIERRE_INCOMPLETO: una jornada cerrada requiere KM y hora final' using errcode='23514'; end if;
  update public.daily_logs set
    km_inicio=v_km_inicio,km_final=v_km_final,hora_inicio=v_hora_inicio,hora_fin=v_hora_fin,
    in_workshop=case when p_patch?'in_workshop' then coalesce((p_patch->>'in_workshop')::boolean,false) else in_workshop end,
    workshop_detail=case when p_patch?'workshop_detail' then nullif(trim(p_patch->>'workshop_detail'),'') else workshop_detail end,
    notas=case when p_patch?'notas' then nullif(trim(p_patch->>'notas'),'') else notas end,
    km_excepcion=v_km_excepcion,
    km_inicio_origen=case when p_patch?'km_inicio' then 'manual_editado' else km_inicio_origen end,
    km_final_origen=case when p_patch?'km_final' then 'manual_editado' else km_final_origen end,
    updated_at=now(),updated_by=auth.uid(),correction_reason=trim(p_reason)
  where log_id=p_log_id returning * into v_log;
  return jsonb_build_object('ok',true,'log_id',v_log.log_id,'status',v_log.status,'km_inicio',v_log.km_inicio,'km_final',v_log.km_final,'km_recorridos',v_log.km_recorridos,'hora_inicio',v_log.hora_inicio,'hora_fin',v_log.hora_fin,'updated_at',v_log.updated_at);
end;$$;

create or replace function public.void_daily_log_admin(p_log_id integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_role text:=app_private.current_auxilios_role(); v_log public.daily_logs%rowtype;
  v_remitos integer; v_fuel integer; v_rend integer; v_checks integer; v_incidents integer;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede eliminar jornadas' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;
  select * into v_log from public.daily_logs where log_id=p_log_id for update;
  if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status='voided' then return jsonb_build_object('ok',true,'log_id',p_log_id,'already_voided',true); end if;
  select count(*) into v_remitos from public.remitos where log_id=p_log_id and coalesce(status,'')<>'anulado';
  select count(*) into v_fuel from public.fuel_records where log_id=p_log_id and coalesce(status,'active')<>'voided';
  select count(*) into v_rend from public.rendicion_cierre where log_id=p_log_id and coalesce(estado,'')<>'rechazado';
  select count(*) into v_checks from public.tire_checks where log_id=p_log_id;
  select count(*) into v_incidents from public.incidents where log_id=p_log_id;
  update public.daily_logs set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),updated_at=now(),updated_by=auth.uid() where log_id=p_log_id;
  return jsonb_build_object('ok',true,'log_id',p_log_id,'linked',jsonb_build_object('remitos',v_remitos,'fuel',v_fuel,'rendiciones',v_rend,'checklists',v_checks,'incidentes',v_incidents));
end;$$;

revoke all on function public.update_daily_log_admin(integer,jsonb,text) from public;
revoke all on function public.void_daily_log_admin(integer,text) from public;
grant execute on function public.update_daily_log_admin(integer,jsonb,text) to authenticated;
grant execute on function public.void_daily_log_admin(integer,text) to authenticated;

drop policy if exists daily_logs_select_management on public.daily_logs;
create policy daily_logs_select_management on public.daily_logs for select to authenticated
using (app_private.current_auxilios_role()=any(array['administracion'::text,'supervision'::text]) and status<>'voided');

drop policy if exists daily_logs_select_driver_operational on public.daily_logs;
create policy daily_logs_select_driver_operational on public.daily_logs for select to authenticated
using (app_private.current_auxilios_role()='chofer' and status<>'voided' and (driver_id=auth.uid() or status='open'));
