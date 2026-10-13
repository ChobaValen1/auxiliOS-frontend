-- Reabrir jornada desde Administración.
-- Caso: el chofer cerró la jornada creyendo que no volvía a usar el móvil ese día.
-- La rendición pendiente que quedó del cierre por error se marca rechazada
-- (se conserva) para que el chofer pueda rendir de nuevo al cerrar.
create or replace function public.reopen_daily_log_admin(p_log_id integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_log public.daily_logs%rowtype;
  v_rechazadas integer:=0;
begin
  if v_role<>'administracion' then raise exception 'JORNADA_NO_AUTORIZADA: solo Administración puede reabrir jornadas' using errcode='42501'; end if;
  if p_log_id is null then raise exception 'JORNADA_INVALIDA: falta log_id' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'JORNADA_MOTIVO_REQUERIDO: indicá un motivo de al menos 5 caracteres' using errcode='22023'; end if;

  select * into v_log from public.daily_logs where log_id=p_log_id for update;
  if not found then raise exception 'JORNADA_NO_ENCONTRADA' using errcode='P0002'; end if;
  if v_log.status='voided' then raise exception 'JORNADA_ANULADA: restaurala antes de reabrirla' using errcode='23514'; end if;
  if v_log.status<>'closed' then raise exception 'JORNADA_YA_ABIERTA: la jornada ya está abierta' using errcode='23514'; end if;
  if exists(select 1 from public.daily_logs where driver_id=v_log.driver_id and status='open' and log_id<>p_log_id) then
    raise exception 'JORNADA_CHOFER_OCUPADO: el chofer ya tiene otra jornada abierta; cerrala antes de reabrir esta' using errcode='23514';
  end if;
  if exists(select 1 from public.daily_logs where truck_id=v_log.truck_id and status='open' and log_id<>p_log_id) then
    raise exception 'JORNADA_MOVIL_OCUPADO: el móvil ya tiene otra jornada abierta; cerrala antes de reabrir esta' using errcode='23514';
  end if;
  if exists(select 1 from public.rendicion_cierre where log_id=p_log_id and coalesce(estado,'')<>'rechazado'
            and (estado='aprobado' or revisado_por is not null or coalesce(admin_status,'pendiente')<>'pendiente')) then
    raise exception 'JORNADA_RENDICION_REVISADA: la rendición de esta jornada ya fue revisada; no se puede reabrir' using errcode='23514';
  end if;

  update public.daily_logs set
    status='open',
    km_final=null, km_final_ia=null, km_final_origen=null, foto_km_final=null,
    hora_fin=null,
    horas_final=null, horas_final_ia=null, horas_final_origen=null,
    in_workshop=false, workshop_detail=null,
    km_excepcion=false,
    closed_at=null,
    updated_at=now(), updated_by=auth.uid(), correction_reason='Reapertura administrativa: '||trim(p_reason)
  where log_id=p_log_id returning * into v_log;

  update public.rendicion_cierre set estado='rechazado', revisado_por=auth.uid(), revisado_at=now(),
    nota_revision='Jornada reabierta: '||trim(p_reason)
  where log_id=p_log_id and estado='pendiente';
  get diagnostics v_rechazadas = row_count;

  return jsonb_build_object('ok',true,'log_id',v_log.log_id,'status',v_log.status,'rendiciones_rechazadas',v_rechazadas);
end;$function$;

revoke all on function public.reopen_daily_log_admin(integer, text) from public, anon;
grant execute on function public.reopen_daily_log_admin(integer, text) to authenticated;
