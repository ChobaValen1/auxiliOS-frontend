-- El operador puede cambiar el Chofer de un servicio ARRIBADO.
--
-- Regla de la casa: Chofer < Operadores < Administración. Todo lo que hace el
-- chofer con un servicio, el operador lo puede corregir. Pero la reasignación
-- sólo aceptaba 'pending' y 'assigned', así que en cuanto el servicio quedaba
-- arribado el chofer se volvía intocable.
--
-- Importa especialmente desde que un ACTIVADO queda arribado: si el chofer que
-- figura no es el que salió, los kilómetros se le imputan al equivocado y eso
-- termina en la liquidación.
--
-- Al reasignar se forzaba status='assigned'. Sobre un arribado eso lo mandaba
-- para atrás y le borraba el arribo, así que ahora el estado se preserva
-- cuando ya está arribado.

begin;

do $migration$
declare
  v_oid oid; v_sql text; v_before text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_operator_service_assignment_v2'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'No existe public.set_operator_service_assignment_v2'; end if;
  select pg_get_functiondef(v_oid) into v_sql;

  v_before := v_sql;
  v_sql := replace(v_sql,
    'if s.status not in (''pending'',''assigned'') then raise exception ''Solo un servicio SIN ASIGNAR o ASIGNADO puede cambiar su asignación''; end if;',
    'if s.status not in (''pending'',''assigned'',''at_origin'') then raise exception ''Solo un servicio SIN ASIGNAR, ASIGNADO o ARRIBADO puede cambiar su asignación''; end if;');
  if v_sql = v_before then
    raise exception 'No se encontró la guarda de estado en set_operator_service_assignment_v2';
  end if;

  v_before := v_sql;
  v_sql := replace(v_sql,
    'update public.operator_services set status=''assigned'',assigned_driver_id=p_driver_id',
    'update public.operator_services set status=case when s.status=''at_origin'' then ''at_origin'' else ''assigned'' end,assigned_driver_id=p_driver_id');
  if v_sql = v_before then
    raise exception 'No se encontró el update de asignación en set_operator_service_assignment_v2';
  end if;

  execute v_sql;
end;
$migration$;

notify pgrst, 'reload schema';

commit;
