-- Sueldos · KM facturados y comisiones sobre facturas encuentran al chofer del servicio · 20/10/2026 (pedido del dueño)
-- Al finalizar un servicio, operator_services.assigned_driver_id queda vacío, así que la fuente 'invoices'
-- de payroll_matrix_sources_core no encontraba ningún servicio facturado del chofer (0 de 26 en producción).
-- Ahora el chofer del servicio es, en orden: quien firmó el remito, el chofer asignado y, si no, el de la
-- última asignación. Sólo lectura: no cambia ningún dato. Reemplazo puntual (falla si no encuentra el texto).
do $mig$ declare d text; a text := $a$(s.assigned_driver_id=p_driver or (s.driver_activated$a$; begin
  d := replace(pg_get_functiondef('app_private.payroll_matrix_sources_core(uuid,date,date)'::regprocedure), E'\r', '');
  if position('operator_service_assignments' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'payroll_matrix_sources_core: texto no encontrado'; end if;
    d := replace(d, a, $b$(coalesce((select x.driver_id from public.remitos x where x.operator_service_id=s.service_id and x.status='firmado' and x.driver_id is not null order by x.firmado_at desc nulls last limit 1),s.assigned_driver_id,(select oa.driver_id from public.operator_service_assignments oa where oa.service_id=s.service_id and oa.driver_id is not null order by oa.assigned_at desc limit 1))=p_driver or (s.driver_activated$b$);
    execute d;
  end if;
end $mig$;
