-- Guardar la revisión de un servicio ya hecho daba 400 "El Chofer ya está ocupado en otro
-- servicio activo" cuando el chofer ya tenía asignado su siguiente servicio: el control de
-- Chofer/Móvil corría aunque no cambiara la asignación. Ahora solo controla cuando cambian.
do $p$ declare d text; n text; begin
  d:=pg_get_functiondef('app_private.validate_operator_service_resource_pair_v1'::regproc);
  n:=replace(d, E'  if new.assigned_driver_id is null then\n    return new;\n  end if;\n',
    E'  if new.assigned_driver_id is null then\n    return new;\n  end if;\n\n  -- Solo se controla cuando cambia el Chofer o el Móvil: guardar la revisión de un\n  -- servicio ya hecho no debe chocar con el siguiente servicio del mismo chofer.\n  if tg_op = ''UPDATE'' and new.assigned_driver_id is not distinct from old.assigned_driver_id\n     and new.assigned_truck_id is not distinct from old.assigned_truck_id then\n    return new;\n  end if;\n');
  if n=d then raise exception 'validate_operator_service_resource_pair_v1: no se encontró el bloque a reemplazar'; end if;
  execute n;
end $p$;
