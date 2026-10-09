-- Un chofer con otro viaje abierto no puede tomar un servicio (regla vigente).
-- El mensaje ahora dice cuál es el servicio que tiene sin terminar, para que el
-- chofer sepa qué completar (p. ej. un remito "sin asignación" guardado para después).
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef('public.ensure_operator_service_trip_v2(uuid)'::regprocedure) into v_def;
  if v_def like '%sin terminar%' then return; end if;
  v_new := replace(v_def,
    $old$  select trip_id into v_other from public.trips where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null order by fecha_hora_inicio desc limit 1;
  if v_other is not null then raise exception 'VIAJE_EN_CURSO: finalizá el viaje actual antes de tomar otro servicio'; end if;$old$,
    $new$  select trip_id into v_other from public.trips where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null order by fecha_hora_inicio desc limit 1;
  if v_other is not null then
    raise exception 'VIAJE_EN_CURSO: tenés el servicio % sin terminar. Completá ese remito antes de tomar otro servicio.',
      coalesce((select nullif(btrim(nro_servicio), '') from public.trips where trip_id = v_other), 'anterior');
  end if;$new$);
  if v_new = v_def then raise exception 'ensure_operator_service_trip_v2 no tiene el texto esperado'; end if;
  execute v_new;
end
$$;
