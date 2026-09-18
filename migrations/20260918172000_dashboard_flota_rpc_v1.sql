-- Salud de la flota del dashboard rediseñado (sección 3).
--
-- Es una foto del estado ACTUAL de la flota, no un rango: la función no recibe
-- fechas. Los filtros de período del dashboard no aplican acá (un documento
-- vencido lo está hoy, no "en agosto"), y el front la llama sin parámetros.
--
-- Devuelve un único jsonb con tres cosas:
--   · alertas       — los contadores de las tarjetas
--   · estado_flota  — el desglose activos / mantenimiento / inactivos del donut
--   · camiones[]    — una fila por camión para la tabla de detalle
--
-- Reutiliza las vistas que ya existen:
--   · v_truck_docs_status  — deduplica por (truck_id, internal_code) y ya
--     clasifica vencido / proximo / falta_archivo / sin_vencimiento respetando
--     el alert_days de cada documento.
--   · v_driver_docs_status — lo mismo por (driver_id, doc_type), con la ventana
--     de aviso fija en 30 días.
-- No se recalcula el vencimiento acá: duplicar esa lógica es garantía de que el
-- dashboard y la pantalla de Documentos terminen diciendo cosas distintas.
--
-- El estado de mantenimiento sí se calcula acá, replicando lo que hace
-- cargarPlanesDetalleOptimizados() en supabase.js: último maintenance_log de
-- cada plan suscripto, next_due_km contra el odómetro del camión.

begin;

create or replace function public.dashboard_flota_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  -- ── Umbrales del tablero ───────────────────────────────────────────────
  -- Ventana de "por vencer" para documentación, en días. Es el mismo valor que
  -- aplican las dos vistas (default de v_truck_docs_status cuando el documento
  -- no trae alert_days propio, y ventana fija de v_driver_docs_status). Viaja
  -- en el payload para que la UI rotule "por vencer (30 d)" sin repetir el
  -- número del lado del front.
  c_dias_doc_aviso constant integer := 30;

  -- incidents no tiene campo de cierre: nadie marca un incidente como resuelto.
  -- "Abierto" es entonces "reportado dentro de esta ventana". El día que exista
  -- un resolved_at, este umbral se reemplaza por el filtro real.
  c_dias_incidente_abierto constant integer := 30;

  -- Fallback de master_service_plans.alert_before_km para los planes que no lo
  -- definen. Mismo valor que usa cargarPlanesDetalleOptimizados() en
  -- supabase.js, para que la flota no se vea distinta según la pantalla.
  c_km_service_aviso constant integer := 500;

  v_role   text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  -- Datos de toda la flota: administración y supervisión. El chofer tiene su
  -- propia vista de camión y no ve el tablero.
  if v_role not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver la salud de la flota';
  end if;

  with taller as (
    -- Un camión con jornada abierta declarada en taller está en mantenimiento
    -- aunque nadie le haya cambiado el status en la ficha.
    select distinct l.truck_id
    from public.daily_logs l
    where l.status = 'open'
      and coalesce(l.in_workshop, false)
  ),
  camion as (
    select t.truck_id,
           t.plate,
           t.numero_interno,
           t.brand,
           t.model,
           t.current_km,
           case
             when lower(coalesce(t.status, '')) = 'maintenance' or w.truck_id is not null then 'mantenimiento'
             when lower(coalesce(t.status, '')) = 'inactive' then 'inactivo'
             else 'activo'
           end as estado
    from public.trucks t
    left join taller w on w.truck_id = t.truck_id
  ),
  docs as (
    select d.truck_id,
           count(*) filter (where d.status = 'vencido')       as vencidos,
           count(*) filter (where d.status = 'proximo')       as por_vencer,
           count(*) filter (where d.status = 'falta_archivo') as sin_archivo,
           count(*)                                           as total,
           min(d.expiry_date) filter (where d.expiry_date >= current_date) as proximo_vencimiento
    from public.v_truck_docs_status d
    group by d.truck_id
  ),
  planes as (
    select s.truck_id,
           m.id   as master_plan_id,
           m.name,
           coalesce(m.alert_before_km, c_km_service_aviso) as alert_before_km
    from public.truck_subscriptions s
    join public.master_service_plans m on m.id = s.master_plan_id
    where coalesce(s.is_active, true)
      and coalesce(m.activo, true)
  ),
  planes_estado as (
    select p.truck_id,
           p.name,
           l.next_due_km,
           (l.next_due_km - c.current_km) as km_restantes,
           case
             when c.current_km is null              then 'sin_odometro'
             when l.next_due_km is null             then 'sin_registro'
             when c.current_km >= l.next_due_km     then 'vencido'
             when l.next_due_km - c.current_km <= p.alert_before_km then 'proximo'
             else 'al_dia'
           end as estado
    from planes p
    join camion c on c.truck_id = p.truck_id
    left join lateral (
      select ml.next_due_km
      from public.maintenance_logs ml
      where ml.truck_id = p.truck_id
        and ml.master_plan_id = p.master_plan_id
      order by ml.performed_at desc, ml.maintenance_id desc
      limit 1
    ) l on true
  ),
  proximo as (
    -- El plan más urgente de cada camión: primero lo vencido, después lo que
    -- menos km le quedan. Es el que va a la columna "próximo mantenimiento".
    select distinct on (truck_id)
           truck_id, name, next_due_km, km_restantes, estado
    from planes_estado
    order by truck_id,
             case estado
               when 'vencido'  then 0
               when 'proximo'  then 1
               when 'al_dia'   then 2
               else 3
             end,
             km_restantes asc nulls last
  ),
  ultimo as (
    select distinct on (ml.truck_id)
           ml.truck_id, ml.performed_at, ml.km_at_service, m.name
    from public.maintenance_logs ml
    left join public.master_service_plans m on m.id = ml.master_plan_id
    order by ml.truck_id, ml.performed_at desc, ml.maintenance_id desc
  ),
  inc_camion as (
    -- incidents no apunta al camión: se llega por la jornada en la que se cargó.
    select l.truck_id, count(*) as abiertos
    from public.incidents i
    join public.daily_logs l on l.log_id = i.log_id
    where i.created_at_device >= now() - make_interval(days => c_dias_incidente_abierto)
    group by l.truck_id
  ),
  fila as (
    select c.truck_id,
           c.plate                      as patente,
           coalesce(nullif(btrim(c.numero_interno), ''), c.plate) as movil,
           btrim(coalesce(c.brand, '') || ' ' || coalesce(c.model, '')) as marca_modelo,
           c.estado,
           c.current_km                 as km_actual,
           u.performed_at               as ultimo_service_fecha,
           u.km_at_service              as ultimo_service_km,
           u.name                       as ultimo_service_plan,
           p.name                       as proximo_service_plan,
           p.next_due_km                as proximo_service_km,
           p.km_restantes               as km_restantes,
           coalesce(p.estado, 'sin_registro') as service_estado,
           coalesce(d.vencidos, 0)      as docs_vencidos,
           coalesce(d.por_vencer, 0)    as docs_por_vencer,
           coalesce(d.sin_archivo, 0)   as docs_sin_archivo,
           coalesce(d.total, 0)         as docs_total,
           d.proximo_vencimiento        as docs_proximo_vencimiento,
           coalesce(i.abiertos, 0)      as incidentes_abiertos,
           -- Severidad de la fila. Un camión inactivo no es una alerta: está
           -- guardado a propósito.
           case
             when c.estado = 'mantenimiento'
               or coalesce(p.estado, '') = 'vencido'
               or coalesce(d.vencidos, 0) > 0                      then 'critico'
             when coalesce(p.estado, '') = 'proximo'
               or coalesce(d.por_vencer, 0) > 0
               or coalesce(d.sin_archivo, 0) > 0
               or coalesce(i.abiertos, 0) > 0                      then 'aviso'
             else 'ok'
           end as severidad
    from camion c
    left join docs d       on d.truck_id = c.truck_id
    left join proximo p    on p.truck_id = c.truck_id
    left join ultimo u     on u.truck_id = c.truck_id
    left join inc_camion i on i.truck_id = c.truck_id
  ),
  totales as (
    select count(*)                                                 as total,
           count(*) filter (where estado = 'activo')                as activos,
           count(*) filter (where estado = 'mantenimiento')         as mantenimiento,
           count(*) filter (where estado = 'inactivo')              as inactivos,
           count(*) filter (where service_estado = 'vencido')       as services_vencidos,
           count(*) filter (where service_estado = 'proximo')       as services_proximos,
           coalesce(sum(docs_vencidos), 0)                          as docs_vencidos,
           coalesce(sum(docs_por_vencer), 0)                        as docs_por_vencer,
           coalesce(sum(docs_sin_archivo), 0)                       as docs_sin_archivo
    from fila
  ),
  incidentes as (
    -- El total no se saca de inc_camion: los incidentes sin jornada asociada
    -- también cuentan, aunque no se puedan colgar de un camión.
    select count(*)                                    as abiertos,
           count(*) filter (where i.severity = 'grave') as graves
    from public.incidents i
    where i.created_at_device >= now() - make_interval(days => c_dias_incidente_abierto)
  ),
  licencias as (
    select count(*) filter (where v.status = 'proximo') as por_vencer,
           count(*) filter (where v.status = 'vencido') as vencidas
    from public.v_driver_docs_status v
    join public.users u on u.user_id = v.driver_id
    where coalesce(u.is_active, true)
      and v.doc_type in ('licencia_particular', 'licencia_linti')
  )
  select jsonb_build_object(
    'generado_en', now(),
    'umbrales', jsonb_build_object(
      'dias_doc_aviso',         c_dias_doc_aviso,
      'dias_incidente_abierto', c_dias_incidente_abierto,
      'km_service_aviso',       c_km_service_aviso
    ),
    'alertas', jsonb_build_object(
      'camiones_mantenimiento', t.mantenimiento,
      'services_vencidos',      t.services_vencidos,
      'services_proximos',      t.services_proximos,
      'docs_vencidos',          t.docs_vencidos,
      'docs_por_vencer',        t.docs_por_vencer,
      'docs_sin_archivo',       t.docs_sin_archivo,
      'incidentes_abiertos',    inc.abiertos,
      'incidentes_graves',      inc.graves,
      'licencias_por_vencer',   lic.por_vencer,
      'licencias_vencidas',     lic.vencidas
    ),
    'estado_flota', jsonb_build_object(
      'activos',       t.activos,
      'mantenimiento', t.mantenimiento,
      'inactivos',     t.inactivos,
      'total',         t.total
    ),
    'camiones', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'truck_id',                 f.truck_id,
                 'patente',                  f.patente,
                 'movil',                    f.movil,
                 'marca_modelo',             nullif(f.marca_modelo, ''),
                 'estado',                   f.estado,
                 'km_actual',                f.km_actual,
                 'ultimo_service_fecha',     f.ultimo_service_fecha,
                 'ultimo_service_km',        f.ultimo_service_km,
                 'ultimo_service_plan',      f.ultimo_service_plan,
                 'proximo_service_plan',     f.proximo_service_plan,
                 'proximo_service_km',       f.proximo_service_km,
                 'km_restantes',             f.km_restantes,
                 'service_estado',           f.service_estado,
                 'docs_vencidos',            f.docs_vencidos,
                 'docs_por_vencer',          f.docs_por_vencer,
                 'docs_sin_archivo',         f.docs_sin_archivo,
                 'docs_total',               f.docs_total,
                 'docs_proximo_vencimiento', f.docs_proximo_vencimiento,
                 'incidentes_abiertos',      f.incidentes_abiertos,
                 'severidad',                f.severidad
               )
               -- Lo que hay que mirar primero, primero.
               order by case f.severidad
                          when 'critico' then 0
                          when 'aviso'   then 1
                          else 2
                        end,
                        f.movil
             ), '[]'::jsonb)
      from fila f
    )
  )
  into v_result
  from totales t, incidentes inc, licencias lic;

  return v_result;
end;
$function$;

comment on function public.dashboard_flota_v1() is
  'Foto del estado actual de la flota para el dashboard: alertas, desglose de estado y detalle por camión. Sin parámetros de fecha a propósito.';

revoke all on function public.dashboard_flota_v1() from public, anon;
grant execute on function public.dashboard_flota_v1() to authenticated, service_role;

commit;
