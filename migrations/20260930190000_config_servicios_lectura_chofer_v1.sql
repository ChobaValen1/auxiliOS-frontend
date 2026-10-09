-- El remito del chofer usa las reglas de campos de Configuración › Servicios (DNI/CUIT y
-- teléfono), pero get_service_module_configuration rechazaba al chofer ("Sin permiso") y la
-- app mostraba un 400 apenas entraba. El chofer puede leerla: es sólo preferencias de pantalla
-- (orden de columnas, campos obligatorios, flujo). Guardarla sigue siendo sólo de administración.
do $mig$
declare
  v_def text := pg_get_functiondef('public.get_service_module_configuration()'::regprocedure);
  v_new text;
begin
  if position('chofer' in v_def) > 0 then return; end if;
  v_new := replace(v_def, '''administracion'',''operador'',''supervision'',''facturacion''', '''administracion'',''operador'',''supervision'',''facturacion'',''chofer''');
  if v_new = v_def then raise exception 'get_service_module_configuration: no se encontró la lista de roles'; end if;
  execute v_new;
end
$mig$;
