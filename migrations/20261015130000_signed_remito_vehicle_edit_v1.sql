-- Servicio arribado (remito firmado): permitir corregir patente y marca/modelo.
-- Antes el guardado fallaba con "Campo protegido o no permitido: vehicle_plate".
-- El cambio queda registrado como corrección administrativa (operator_service_events
-- y operator_service_changes). El remito firmado conserva los datos originales.
-- Los datos del cliente siguen bloqueados después de la firma.
do $p$ declare d text; n text; begin
  d := pg_get_functiondef('public.update_operator_service_v4(uuid,jsonb,text)'::regprocedure);
  n := replace(d, '''operator_notes'',''driver_instructions'',', '''operator_notes'',''driver_instructions'',''vehicle_plate'',''vehicle_make_model'',');
  if n = d then raise exception 'parche: no encontré la lista de campos'; end if;
  execute n;
end $p$;
