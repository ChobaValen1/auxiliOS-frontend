-- Hora de fin del servicio: al finalizar se marca la hora actual (completed_at = now()) y Operaciones /
-- Administración pueden corregirla en el momento de finalizar. Esta función sólo corrige la hora de un
-- servicio que se acaba de finalizar (hasta 15 minutos antes); no reescribe servicios viejos.
create or replace function public.set_service_finish_time_v1(p_service_id uuid, p_finished_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  s public.operator_services%rowtype;
begin
  if v_uid is null or v_role not in ('operador', 'administracion') then
    raise exception 'Solo Operaciones o Administración puede cambiar la hora de fin';
  end if;
  if p_finished_at is null then raise exception 'Indicá la hora de fin'; end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status <> 'completed' or s.completed_at is null then
    raise exception 'La hora de fin se carga al finalizar el servicio';
  end if;
  if s.completed_at < now() - interval '15 minutes' then
    raise exception 'La hora de fin sólo se puede cambiar al finalizar el servicio';
  end if;
  if p_finished_at > now() + interval '2 minutes' then
    raise exception 'La hora de fin no puede ser futura';
  end if;
  if s.arrived_at is not null and p_finished_at < s.arrived_at then
    raise exception 'La hora de fin no puede ser anterior al arribo';
  end if;
  update public.operator_services set completed_at = p_finished_at, updated_by = v_uid where service_id = p_service_id returning * into s;
  insert into public.operator_service_events(service_id, event_type, notes, created_by, details)
  values (p_service_id, 'finish_time_set', 'Hora de fin indicada al finalizar', v_uid, jsonb_build_object('completed_at', s.completed_at));
  return jsonb_build_object('service_id', s.service_id, 'completed_at', s.completed_at);
end;
$function$;

revoke all on function public.set_service_finish_time_v1(uuid, timestamptz) from public, anon;
grant execute on function public.set_service_finish_time_v1(uuid, timestamptz) to authenticated;
