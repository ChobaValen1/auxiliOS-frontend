-- Flota v2: cada contador dice sobre cuántos registros miró.
--
-- Hoy la tarjeta "Licencias por vencer" marca 0 y se pinta verde con el texto
-- "Sin pendientes". Es mentira: en `v_driver_docs_status` hay CERO filas. No es
-- que no venza ninguna licencia, es que no hay ninguna licencia cargada. El
-- tablero está diciendo "todo bien" cuando lo que corresponde decir es "no sé".
--
-- Lo mismo, más suave, con los documentos de camión: 2 documentos cargados para
-- 8 camiones activos. El cero es real sobre lo que hay, pero lo que hay no
-- alcanza para concluir nada.
--
-- Un cero sin denominador no se puede leer. Esta migración agrega `universo`:
-- cuántos registros mira cada contador, de la MISMA fuente que usa el contador,
-- para que la tarjeta pueda distinguir "sin pendientes" de "sin datos".
--
-- No toca `dashboard_flota_v1`: la envuelve. El payload viejo sale igual y se
-- le suma la clave nueva, así que nada de lo que ya andaba cambia de forma.

begin;

create or replace function public.dashboard_flota_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select public.dashboard_flota_v1() || jsonb_build_object(
    'universo', jsonb_build_object(
      -- Mismas fuentes que los contadores de dashboard_flota_v1: si el día de
      -- mañana un contador cambia de tabla, el denominador tiene que seguirlo.
      'camiones_activos', (select count(*) from public.trucks where status = 'active'),
      'planes_service',   (select count(*) from public.truck_subscriptions),
      'docs_camion',      (select count(*) from public.v_truck_docs_status),
      'licencias',        (select count(*) from public.v_driver_docs_status),
      -- Sin ventana de fechas a propósito: separa "ninguno en los últimos 30
      -- días" de "nunca se cargó un incidente".
      'incidentes',       (select count(*) from public.incidents)
    )
  );
$function$;

comment on function public.dashboard_flota_v2() is
  'Salud de la Flota. Devuelve el payload de dashboard_flota_v1 más `universo`: cuántos registros mira cada contador, tomados de la misma fuente que el contador. Sin ese denominador, un contador en cero no se puede leer — "0 licencias por vencer" es indistinguible de "no hay ninguna licencia cargada", y el tablero termina afirmando que está todo bien donde en realidad no sabe nada.';

revoke all on function public.dashboard_flota_v2() from public, anon;
grant execute on function public.dashboard_flota_v2() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
