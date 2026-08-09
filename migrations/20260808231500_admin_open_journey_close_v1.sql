-- AuxiliOS · Jornadas admin · ciclo de vida open/closed v1
-- Aplicado en producción el 2026-08-08.

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
  if v_log.status='voided' then raise exception 'JORNADA_ANULADA: no se puede editar una jornada anulada' using errcode='23514'; end if;
  if v_log.status='open' and (p_patch?'km_final' or p_patch?'hora_fin') then
    raise exception 'JORNADA_ABIERTA_REQUIERE_CIERRE: KM final y hora fin solo se cargan mediante Cerrar jornada' using errcode='23514';
  end if;
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

create or replace function public.close_daily_log_admin(p_log_id integer,p_payload jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_log public.daily_logs%rowtype;
  v_km_final integer;
  v_hora_fin time;
  v_km_excepcion boolean;
  v_rendicion_exists boolean:=false;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede cerrar jornadas' using errcode='42501'; end if;
  if p_log_id is null then raise exception 'JORNADA_INVALIDA: falta log_id' using errcode='22023'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'JORNADA_INVALIDA: payload inválido' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;
  select * into v_log from public.daily_logs where log_id=p_log_id for update;
  if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status='voided' then raise exception 'JORNADA_ANULADA: no se puede cerrar una jornada anulada' using errcode='23514'; end if;
  if v_log.status='closed' then raise exception 'JORNADA_YA_CERRADA: la jornada ya está cerrada; usá Editar jornada para corregirla' using errcode='23514'; end if;
  v_km_final:=nullif(p_payload->>'km_final','')::integer;
  v_hora_fin:=nullif(p_payload->>'hora_fin','')::time;
  v_km_excepcion:=coalesce((p_payload->>'km_excepcion')::boolean,false);
  if v_km_final is null or v_km_final<0 then raise exception 'JORNADA_KM_INVALIDO: ingresá un KM final válido' using errcode='23514'; end if;
  if v_hora_fin is null then raise exception 'JORNADA_CIERRE_INCOMPLETO: ingresá la hora final' using errcode='23514'; end if;
  if v_km_final<v_log.km_inicio and not v_km_excepcion then raise exception 'JORNADA_KM_INVALIDO: KM final menor al inicial; activá excepción si corresponde' using errcode='23514'; end if;
  update public.daily_logs set
    km_final=v_km_final,km_final_ia=null,km_final_origen='manual_editado',hora_fin=v_hora_fin,status='closed',closed_at=now(),
    in_workshop=case when p_payload?'in_workshop' then coalesce((p_payload->>'in_workshop')::boolean,false) else in_workshop end,
    workshop_detail=case when p_payload?'workshop_detail' then nullif(trim(p_payload->>'workshop_detail'),'') else workshop_detail end,
    notas=case when p_payload?'notas' then nullif(trim(p_payload->>'notas'),'') else notas end,
    km_excepcion=v_km_excepcion,updated_at=now(),updated_by=auth.uid(),correction_reason='Cierre administrativo: '||trim(p_reason)
  where log_id=p_log_id returning * into v_log;
  select exists(select 1 from public.rendicion_cierre where log_id=p_log_id and coalesce(estado,'')<>'rechazado') into v_rendicion_exists;
  return jsonb_build_object('ok',true,'log_id',v_log.log_id,'status',v_log.status,'km_inicio',v_log.km_inicio,'km_final',v_log.km_final,'km_recorridos',v_log.km_recorridos,'hora_inicio',v_log.hora_inicio,'hora_fin',v_log.hora_fin,'rendicion_exists',v_rendicion_exists);
end;$$;

alter table public.daily_logs drop constraint if exists daily_logs_lifecycle_consistency;
alter table public.daily_logs add constraint daily_logs_lifecycle_consistency check (
  status='voided'
  or (status='open' and km_final is null and hora_fin is null and closed_at is null)
  or (status='closed' and km_final is not null and hora_fin is not null and closed_at is not null)
);

revoke all on function public.close_daily_log_admin(integer,jsonb,text) from public;
revoke all on function public.close_daily_log_admin(integer,jsonb,text) from anon;
grant execute on function public.close_daily_log_admin(integer,jsonb,text) to authenticated;
