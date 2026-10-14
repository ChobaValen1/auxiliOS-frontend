-- Editar un camión desde Administración: se acepta y se guarda el interruptor
-- "registra horas de motor" (trucks.registra_horas). Sin esto, guardar la
-- edición de cualquier camión devolvía 400 "La carga util contiene campos no
-- permitidos", porque el formulario ya manda el interruptor.
-- Igual que antes en todo lo demás: si el campo no viene, no se toca.

create or replace function public.admin_update_truck_v2(p_truck_id integer, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_before public.trucks%rowtype;
  v_after public.trucks%rowtype;
  v_km integer;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administracion puede editar la flota' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'La carga util debe ser un objeto JSON';
  end if;
  if p_payload - array['plate','brand','model','year','numero_interno','current_km','current_hours','tipo_equipo','registra_horas'] <> '{}'::jsonb then
    raise exception 'La carga util contiene campos no permitidos';
  end if;
  if p_payload ? 'registra_horas' and jsonb_typeof(p_payload->'registra_horas') not in ('boolean', 'null') then
    raise exception 'registra_horas debe ser verdadero o falso';
  end if;

  select * into v_before from public.trucks where truck_id = p_truck_id for update;
  if not found then raise exception 'Vehiculo inexistente'; end if;

  v_km := case when p_payload ? 'current_km'
    then (p_payload->>'current_km')::integer else v_before.current_km end;
  if v_km is null or v_km < 0 then raise exception 'El kilometraje debe ser mayor o igual a cero'; end if;

  update public.trucks
  set plate = case when p_payload ? 'plate' then nullif(btrim(p_payload->>'plate'), '') else plate end,
      brand = case when p_payload ? 'brand' then p_payload->>'brand' else brand end,
      model = case when p_payload ? 'model' then p_payload->>'model' else model end,
      year = case when p_payload ? 'year' then nullif(p_payload->>'year', '')::smallint else year end,
      numero_interno = case when p_payload ? 'numero_interno' then p_payload->>'numero_interno' else numero_interno end,
      current_hours = case when p_payload ? 'current_hours' then coalesce((p_payload->>'current_hours')::integer, 0) else current_hours end,
      tipo_equipo = case when p_payload ? 'tipo_equipo' then p_payload->>'tipo_equipo' else tipo_equipo end,
      registra_horas = case when p_payload ? 'registra_horas' then coalesce((p_payload->>'registra_horas')::boolean, false) else registra_horas end,
      current_km = v_km,
      odometer_epoch_started_at = case when v_km is distinct from v_before.current_km then clock_timestamp() else odometer_epoch_started_at end,
      odometer_epoch_base_km = case when v_km is distinct from v_before.current_km then v_km else odometer_epoch_base_km end
  where truck_id = p_truck_id
  returning * into v_after;

  return jsonb_build_object(
    'truck_id', v_after.truck_id,
    'current_km', v_after.current_km,
    'odometer_epoch_started_at', v_after.odometer_epoch_started_at
  );
end;
$function$;
