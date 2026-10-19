-- Servicios · la tabla muestra lo editado en el servicio · 19/10/2026 (pedido del dueño)
-- list_operator_services (rama operador/supervisión) devuelve también teléfono y DNI/CUIT del servicio,
-- para que la tabla muestre lo editado y use lo del remito sólo si el servicio no lo tiene.
-- Administración ya recibía la fila completa. Sólo lectura. Reemplazo puntual (falla si no encuentra el texto).
do $mig$ declare d text; a text := $x$        'vehicle_plate',s.vehicle_plate,$x$||chr(13)||chr(10); begin
  d := pg_get_functiondef('public.list_operator_services(integer)'::regprocedure);
  if position('''customer_phone'',s.customer_phone' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'list_operator_services: texto no encontrado'; end if;
    d := replace(d, a, $x$        'vehicle_plate',s.vehicle_plate,'customer_phone',s.customer_phone,'customer_document',s.customer_document,$x$||chr(13)||chr(10));
    execute d;
  end if;
end $mig$;
