-- Dashboard rediseñado · sección OPERACIONES.
--
-- Una sola RPC que devuelve TODO agregado del lado del servidor: el front no
-- trae filas crudas ni suma en JS. Un rango de 12 meses son ~1.300 jornadas y
-- ~900 cargas; mandarlas al navegador para sumarlas ahí es tráfico y batería
-- de más en los celulares de los choferes.
--
-- Aritmética sucia (son datos reales, con ruido real):
--
--   * km de la jornada = km_final - km_inicio. El odómetro se carga a mano y a
--     veces con foto mal leída por la IA: el delta puede salir negativo (se
--     tipeó el final antes que el inicio) o disparatado. Esas jornadas NO se
--     suman: un km negativo restaría kilómetros reales de otras jornadas y un
--     delta de 900.000 haría estallar la escala de todos los gráficos. Se
--     descartan y se informan en `descartes`, para que administración vea que
--     hay algo que corregir en vez de creerle a un total silenciosamente malo.
--     Tope: 2.000 km por jornada (el máximo real observado es ~1.125).
--
--   * horas de la jornada = hora_fin - hora_inicio, PERO son `time` sin fecha:
--     una jornada nocturna cierra con hora_fin < hora_inicio y la resta directa
--     da negativo. Se le suma un día cuando cruza medianoche (60 de 233
--     jornadas reales lo hacen). El efecto colateral es que un cierre tipeado
--     apenas antes del inicio (07:31 → 07:12, mismo día) se lee como 23,7 h;
--     por eso además se descarta todo lo que pase de 20 h.
--
--   * km/litro y costo/km: la división se hace sólo si el denominador es > 0.
--     Sin esa guarda, un período sin cargas devuelve división por cero y la
--     sección entera cae al overlay de error.
--
-- Datos de QA: trucks.is_test / users.is_test quedan afuera. El dashboard es
-- una superficie de reporte; el móvil QA-01 y el "Chofer de Prueba" moverían
-- los promedios sin representar nada de la operación.

begin;

-- El dashboard barre por rango de fecha sobre TODOS los choferes; los índices
-- que había arrancan por driver_id / truck_id y no sirven para ese acceso.
create index if not exists daily_logs_dashboard_fecha_idx
  on public.daily_logs (log_date)
  where status = 'closed' and voided_at is null;

create index if not exists fuel_records_dashboard_fecha_idx
  on public.fuel_records (fuel_date)
  where status = 'active' and voided_at is null;

create or replace function public.dashboard_operaciones_v1(
  p_desde    date   default null,
  p_hasta    date   default null,
  p_camiones int[]  default null,
  p_choferes uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_role     text   := app_private.current_auxilios_role();
  v_hasta    date   := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_desde    date   := coalesce(p_desde, v_hasta - 30);
  -- Un array vacío desde el front significa "sin filtro", igual que null.
  v_camiones int[]  := case when coalesce(array_length(p_camiones, 1), 0) = 0 then null else p_camiones end;
  v_choferes uuid[] := case when coalesce(array_length(p_choferes, 1), 0) = 0 then null else p_choferes end;
  -- Más de dos meses en puntos diarios es un gráfico ilegible: se agrupa por semana.
  v_semanal  boolean;
  v_paso     int;
  v_result   jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de operaciones'
      using errcode = '42501';
  end if;

  if v_desde > v_hasta then
    raise exception 'El rango de fechas está invertido' using errcode = '22007';
  end if;

  v_semanal := (v_hasta - v_desde) > 62;
  v_paso    := case when v_semanal then 7 else 1 end;

  with jornada as (
    select
      d.log_id,
      d.driver_id,
      d.truck_id,
      d.log_date,
      -- Null = jornada que no aporta km confiables. count(km) cuenta las que sí.
      case
        when d.km_final is null                     then null
        when coalesce(d.km_excepcion, false)        then null
        when d.km_final - d.km_inicio < 0           then null
        when d.km_final - d.km_inicio > 2000        then null
        else d.km_final - d.km_inicio
      end as km,
      case
        when d.hora_fin is null  then null
        when hj.horas is null    then null
        when hj.horas <= 0       then null
        when hj.horas > 20       then null
        else hj.horas
      end as horas
    from public.daily_logs d
    join public.trucks t on t.truck_id = d.truck_id
    join public.users  u on u.user_id  = d.driver_id
    cross join lateral (
      select extract(epoch from (d.hora_fin - d.hora_inicio)) / 3600.0
             + case when d.hora_fin < d.hora_inicio then 24 else 0 end as horas
    ) hj
    where d.status = 'closed'
      and d.voided_at is null
      and d.log_date between v_desde and v_hasta
      and t.is_test = false
      and u.is_test = false
      and (v_camiones is null or d.truck_id  = any (v_camiones))
      and (v_choferes is null or d.driver_id = any (v_choferes))
  ),
  carga as (
    select
      fr.truck_id,
      fr.liters                                              as litros,
      coalesce(fr.total_cost, fr.liters * fr.price_per_liter) as costo
    from public.fuel_records fr
    join public.trucks t on t.truck_id = fr.truck_id
    where fr.status = 'active'
      and fr.voided_at is null
      and fr.liters > 0
      and fr.fuel_date between v_desde and v_hasta
      and t.is_test = false
      and (v_camiones is null or fr.truck_id = any (v_camiones))
      -- fuel_records no tiene chofer: la carga se imputa por la jornada que la
      -- originó (log_id). Una carga sin jornada no se puede atribuir a nadie,
      -- así que queda fuera cuando hay filtro de choferes activo.
      and (
        v_choferes is null
        or exists (
          select 1
          from public.daily_logs dl
          where dl.log_id = fr.log_id
            and dl.driver_id = any (v_choferes)
        )
      )
  ),
  tot as (
    select
      coalesce(sum(j.km), 0)::bigint      as km,
      coalesce(sum(j.horas), 0)::numeric  as horas,
      count(*)::int                       as jornadas,
      count(j.km)::int                    as jornadas_con_km,
      count(j.horas)::int                 as jornadas_con_horas
    from jornada j
  ),
  totf as (
    select
      coalesce(sum(c.litros), 0)::numeric as litros,
      coalesce(sum(c.costo), 0)::numeric  as costo,
      count(*)::int                       as cargas
    from carga c
  ),
  cam_j as (
    select j.truck_id,
           coalesce(sum(j.km), 0)::bigint as km,
           count(*)::int                  as jornadas
    from jornada j
    group by j.truck_id
  ),
  cam_f as (
    select c.truck_id,
           coalesce(sum(c.litros), 0)::numeric as litros,
           coalesce(sum(c.costo), 0)::numeric  as costo
    from carga c
    group by c.truck_id
  ),
  cam as (
    select
      t.truck_id,
      coalesce(nullif(btrim(t.numero_interno), ''), t.plate) as etiqueta,
      coalesce(cam_j.km, 0)::bigint        as km,
      coalesce(cam_j.jornadas, 0)::int     as jornadas,
      coalesce(cam_f.litros, 0)::numeric   as litros,
      coalesce(cam_f.costo, 0)::numeric    as costo
    from public.trucks t
    left join cam_j on cam_j.truck_id = t.truck_id
    left join cam_f on cam_f.truck_id = t.truck_id
    where cam_j.truck_id is not null or cam_f.truck_id is not null
  ),
  cho as (
    select
      u.user_id,
      u.full_name,
      coalesce(sum(j.km), 0)::bigint     as km,
      coalesce(sum(j.horas), 0)::numeric as horas,
      count(*)::int                      as jornadas,
      count(j.horas)::int                as jornadas_con_horas
    from jornada j
    join public.users u on u.user_id = j.driver_id
    group by u.user_id, u.full_name
  ),
  -- Los huecos se rellenan con cero: si no, la línea "salta" los días sin
  -- jornadas y sugiere una continuidad que no existe.
  cubo as (
    select generate_series(
      case when v_semanal then date_trunc('week', v_desde::timestamp)::date else v_desde end,
      v_hasta,
      make_interval(days => v_paso)
    )::date as inicio
  ),
  serie as (
    select
      cubo.inicio,
      coalesce(sum(j.km), 0)::bigint as km,
      count(j.log_id)::int           as jornadas
    from cubo
    left join jornada j
      on j.log_date >= cubo.inicio
     and j.log_date <  cubo.inicio + v_paso
    group by cubo.inicio
  ),
  -- El catálogo de los selectores NO se filtra por los filtros activos: si se
  -- filtrara, elegir un camión borraría del combo a todos los demás.
  cat_cam as (
    select
      t.truck_id,
      coalesce(nullif(btrim(t.numero_interno), ''), t.plate) as etiqueta
    from public.trucks t
    where t.is_test = false
      and (
        t.status = 'active'
        or exists (
          select 1 from public.daily_logs d2
          where d2.truck_id = t.truck_id
            and d2.status = 'closed'
            and d2.voided_at is null
            and d2.log_date between v_desde and v_hasta
        )
      )
  ),
  -- Además de los choferes activos entran los que tengan jornadas en el rango
  -- aunque hoy no tengan el rol: hay jornadas cargadas por administración con
  -- su propio usuario, y si no estuvieran acá aparecerían en el gráfico de km
  -- por chofer sin poder seleccionarse en el filtro.
  cat_cho as (
    select u.user_id, u.full_name
    from public.users u
    left join public.roles r on r.role_id = u.role_id
    where u.is_test = false
      and (
        (r.name = 'chofer' and coalesce(u.is_active, false))
        or exists (
          select 1 from public.daily_logs d2
          where d2.driver_id = u.user_id
            and d2.status = 'closed'
            and d2.voided_at is null
            and d2.log_date between v_desde and v_hasta
        )
      )
  )
  select jsonb_build_object(
    'desde',        v_desde,
    'hasta',        v_hasta,
    'granularidad', case when v_semanal then 'semana' else 'dia' end,

    'totales', jsonb_build_object(
      'km',       tot.km,
      'litros',   round(totf.litros, 2),
      'costo',    round(totf.costo, 2),
      'jornadas', tot.jornadas,
      'horas',    round(tot.horas, 1),
      'cargas',   totf.cargas
    ),

    -- Toda división con guarda de denominador: sin cargas o sin km el valor es
    -- null y el front muestra un guión, no un NaN ni un 500.
    'eficiencia', jsonb_build_object(
      'km_por_litro',
        case when totf.litros > 0 then round(tot.km / totf.litros, 2) end,
      'costo_por_km',
        case when tot.km > 0 then round(totf.costo / tot.km, 2) end,
      'horas_por_jornada',
        case when tot.jornadas_con_horas > 0 then round(tot.horas / tot.jornadas_con_horas, 2) end
    ),

    -- Cuántas jornadas quedaron fuera de cada métrica por datos inconsistentes.
    'descartes', jsonb_build_object(
      'jornadas_sin_km',    tot.jornadas - tot.jornadas_con_km,
      'jornadas_sin_horas', tot.jornadas - tot.jornadas_con_horas
    ),

    'por_camion', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'truck_id',     x.truck_id,
        'etiqueta',     x.etiqueta,
        'km',           x.km,
        'litros',       round(x.litros, 2),
        'costo',        round(x.costo, 2),
        'jornadas',     x.jornadas,
        'km_por_litro', case when x.litros > 0 then round(x.km / x.litros, 2) end
      ) order by x.costo desc, x.km desc, x.etiqueta), '[]'::jsonb)
      from cam x
    ),

    'por_chofer', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'driver_id',         x.user_id,
        'nombre',            x.full_name,
        'km',                x.km,
        'horas',             round(x.horas, 1),
        'jornadas',          x.jornadas,
        'horas_por_jornada',
          case when x.jornadas_con_horas > 0 then round(x.horas / x.jornadas_con_horas, 2) end
      ) order by x.km desc, x.full_name), '[]'::jsonb)
      from cho x
    ),

    'serie_temporal', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fecha',    x.inicio,
        'km',       x.km,
        'jornadas', x.jornadas
      ) order by x.inicio), '[]'::jsonb)
      from serie x
    ),

    'catalogo', jsonb_build_object(
      'camiones', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.truck_id, 'etiqueta', k.etiqueta
        ) order by k.etiqueta), '[]'::jsonb)
        from cat_cam k
      ),
      'choferes', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.user_id, 'nombre', k.full_name
        ) order by k.full_name), '[]'::jsonb)
        from cat_cho k
      )
    ),

    'filtros', jsonb_build_object(
      'camiones', coalesce(to_jsonb(v_camiones), '[]'::jsonb),
      'choferes', coalesce(to_jsonb(v_choferes), '[]'::jsonb)
    )
  )
  into v_result
  from tot, totf;

  return v_result;
end;
$function$;

comment on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) is
  'Métricas agregadas de la sección Operaciones del dashboard. Descarta jornadas con km negativo o > 2000, corrige las que cruzan medianoche y descarta las de más de 20 h. Sólo administración y supervisión.';

revoke all on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) from public, anon;
grant execute on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) to authenticated, service_role;

commit;
