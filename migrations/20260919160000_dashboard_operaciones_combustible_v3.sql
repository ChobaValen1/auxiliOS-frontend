-- Operaciones v3: el bloque COMBUSTIBLE.
--
-- Hasta acá el combustible existía como dos números sueltos (litros y gasto) y
-- una razón (km/litro). Faltaba lo que hace falta para gestionarlo:
--
--   * cómo se paga  — `payment_method` es 'app' | 'transferencia' | 'efectivo',
--     y cuando es 'app' el nombre real está en `payment_app` (Shell Flota, YPF
--     Ruta, Axion…). Mostrar "app" como medio de pago no dice nada, así que el
--     medio se arma con el app cuando existe y con el método cuando no.
--   * cuánto sale cada carga — ticket promedio y precio por litro. El precio por
--     litro se calcula sobre el total, no promediando `price_per_liter`: un
--     promedio de precios le da el mismo peso a una carga de 20 litros que a una
--     de 400.
--   * cuánto consume la flota — litros cada 100 km, que es la medida que se
--     compara contra la ficha del camión. Es la inversa de km/litro y va junto a
--     ella a propósito: una sube cuando la otra baja y juntas se leen como una
--     sola idea.
--
-- El costo por km sigue siendo el mismo número que ya devolvía `eficiencia`.
-- Se repite dentro de `combustible` para que el bloque se entienda solo, sin
-- que el front tenga que ir a buscar una pieza a otro lado del payload.

begin;

create index if not exists remitos_dashboard_fecha_idx
  on public.remitos (created_at_device)
  where status <> 'anulado';

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
  v_camiones int[]  := case when coalesce(array_length(p_camiones, 1), 0) = 0 then null else p_camiones end;
  v_choferes uuid[] := case when coalesce(array_length(p_choferes, 1), 0) = 0 then null else p_choferes end;
  v_dias     int;
  v_grano    text;
  v_paso     interval;
  v_result   jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de operaciones'
      using errcode = '42501';
  end if;

  if v_desde > v_hasta then
    raise exception 'El rango de fechas está invertido' using errcode = '22007';
  end if;

  v_dias := (v_hasta - v_desde) + 1;
  if    v_dias <=  31 then v_grano := 'dia';    v_paso := interval '1 day';
  elsif v_dias <= 120 then v_grano := 'semana'; v_paso := interval '1 week';
  else                     v_grano := 'mes';    v_paso := interval '1 month';
  end if;

  with jornada as (
    select
      d.log_id,
      d.driver_id,
      d.truck_id,
      d.log_date,
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
  -- Un remito no anulado es un servicio hecho. Se llega al camión por la jornada
  -- en la que se cargó; los remitos sin jornada asociada cuentan en el total
  -- pero no se pueden colgar de ningún móvil.
  servicio as (
    select
      r.remito_id,
      r.driver_id,
      dl.truck_id,
      (r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date as fecha
    from public.remitos r
    left join public.daily_logs dl on dl.log_id = r.log_id
    left join public.trucks t on t.truck_id = dl.truck_id
    left join public.users  u on u.user_id  = r.driver_id
    where r.status <> 'anulado'
      and (r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date
            between v_desde and v_hasta
      and coalesce(t.is_test, false) = false
      and coalesce(u.is_test, false) = false
      and (v_camiones is null or dl.truck_id  = any (v_camiones))
      and (v_choferes is null or r.driver_id  = any (v_choferes))
  ),
  carga as (
    select
      fr.truck_id,
      fr.liters                                              as litros,
      coalesce(fr.total_cost, fr.liters * fr.price_per_liter) as costo,
      -- 'app' no es un medio de pago: el medio es la app. Con el método sólo se
      -- responde cuando no hay app cargada.
      case
        when lower(coalesce(fr.payment_method, '')) = 'app'
          then coalesce(nullif(btrim(fr.payment_app), ''), 'App sin identificar')
        when lower(coalesce(fr.payment_method, '')) = 'efectivo'      then 'Efectivo'
        when lower(coalesce(fr.payment_method, '')) = 'transferencia' then 'Transferencia'
        when nullif(btrim(fr.payment_method), '') is null             then 'Sin especificar'
        else initcap(btrim(fr.payment_method))
      end                                                     as medio
    from public.fuel_records fr
    join public.trucks t on t.truck_id = fr.truck_id
    where fr.status = 'active'
      and fr.voided_at is null
      and fr.liters > 0
      and fr.fuel_date between v_desde and v_hasta
      and t.is_test = false
      and (v_camiones is null or fr.truck_id = any (v_camiones))
      and (
        v_choferes is null
        or exists (
          select 1 from public.daily_logs dl
          where dl.log_id = fr.log_id and dl.driver_id = any (v_choferes)
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
  med as (
    select
      c.medio,
      count(*)::int                       as cargas,
      coalesce(sum(c.litros), 0)::numeric as litros,
      coalesce(sum(c.costo), 0)::numeric  as costo
    from carga c
    group by c.medio
  ),
  tots as (
    select count(*)::int as servicios from servicio
  ),
  cam_j as (
    select j.truck_id,
           coalesce(sum(j.km), 0)::bigint as km,
           count(*)::int                  as jornadas
    from jornada j group by j.truck_id
  ),
  cam_f as (
    select c.truck_id,
           coalesce(sum(c.litros), 0)::numeric as litros,
           coalesce(sum(c.costo), 0)::numeric  as costo
    from carga c group by c.truck_id
  ),
  cam_s as (
    select s.truck_id, count(*)::int as servicios
    from servicio s where s.truck_id is not null group by s.truck_id
  ),
  cam as (
    select
      t.truck_id,
      coalesce(nullif(btrim(t.numero_interno), ''), t.plate) as etiqueta,
      coalesce(cam_j.km, 0)::bigint        as km,
      coalesce(cam_j.jornadas, 0)::int     as jornadas,
      coalesce(cam_f.litros, 0)::numeric   as litros,
      coalesce(cam_f.costo, 0)::numeric    as costo,
      coalesce(cam_s.servicios, 0)::int    as servicios
    from public.trucks t
    left join cam_j on cam_j.truck_id = t.truck_id
    left join cam_f on cam_f.truck_id = t.truck_id
    left join cam_s on cam_s.truck_id = t.truck_id
    where cam_j.truck_id is not null or cam_f.truck_id is not null or cam_s.truck_id is not null
  ),
  cho_s as (
    select s.driver_id, count(*)::int as servicios
    from servicio s where s.driver_id is not null group by s.driver_id
  ),
  cho as (
    select
      u.user_id,
      u.full_name,
      coalesce(sum(j.km), 0)::bigint     as km,
      coalesce(sum(j.horas), 0)::numeric as horas,
      count(*)::int                      as jornadas,
      count(j.horas)::int                as jornadas_con_horas,
      coalesce(max(cho_s.servicios), 0)::int as servicios
    from jornada j
    join public.users u on u.user_id = j.driver_id
    left join cho_s on cho_s.driver_id = j.driver_id
    group by u.user_id, u.full_name
  ),
  -- Los huecos se rellenan con cero: si no, la serie "saltea" los períodos sin
  -- actividad y sugiere una continuidad que no existe.
  cubo as (
    select generate_series(
      case v_grano
        when 'mes'    then date_trunc('month', v_desde::timestamp)::date
        when 'semana' then date_trunc('week',  v_desde::timestamp)::date
        else v_desde
      end,
      v_hasta,
      v_paso
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
     and j.log_date <  (cubo.inicio + v_paso)::date
    group by cubo.inicio
  ),
  serie_s as (
    select cubo.inicio, count(s.remito_id)::int as servicios
    from cubo
    left join servicio s
      on s.fecha >= cubo.inicio
     and s.fecha <  (cubo.inicio + v_paso)::date
    group by cubo.inicio
  ),
  cat_cam as (
    select t.truck_id,
           coalesce(nullif(btrim(t.numero_interno), ''), t.plate) as etiqueta
    from public.trucks t
    where t.is_test = false
      and (t.status = 'active'
        or exists (select 1 from public.daily_logs d2
                   where d2.truck_id = t.truck_id and d2.status = 'closed'
                     and d2.voided_at is null
                     and d2.log_date between v_desde and v_hasta))
  ),
  cat_cho as (
    select u.user_id, u.full_name
    from public.users u
    left join public.roles r on r.role_id = u.role_id
    where u.is_test = false
      and ((r.name = 'chofer' and coalesce(u.is_active, false))
        or exists (select 1 from public.daily_logs d2
                   where d2.driver_id = u.user_id and d2.status = 'closed'
                     and d2.voided_at is null
                     and d2.log_date between v_desde and v_hasta))
  )
  select jsonb_build_object(
    'desde',        v_desde,
    'hasta',        v_hasta,
    'granularidad', v_grano,

    'totales', jsonb_build_object(
      'km',        tot.km,
      'litros',    round(totf.litros, 2),
      'costo',     round(totf.costo, 2),
      'jornadas',  tot.jornadas,
      'horas',     round(tot.horas, 1),
      'cargas',    totf.cargas,
      'servicios', tots.servicios
    ),

    'eficiencia', jsonb_build_object(
      'km_por_litro',
        case when totf.litros > 0 then round(tot.km / totf.litros, 2) end,
      'costo_por_km',
        case when tot.km > 0 then round(totf.costo / tot.km, 2) end,
      'horas_por_jornada',
        case when tot.jornadas_con_horas > 0 then round(tot.horas / tot.jornadas_con_horas, 2) end,
      'servicios_por_jornada',
        case when tot.jornadas > 0 then round(tots.servicios::numeric / tot.jornadas, 2) end,
      'km_por_servicio',
        case when tots.servicios > 0 then round(tot.km::numeric / tots.servicios, 1) end
    ),

    -- El bloque se entiende solo: trae sus propias razones aunque dos de ellas
    -- también vivan en 'eficiencia'.
    'combustible', jsonb_build_object(
      'litros',  round(totf.litros, 2),
      'gasto',   round(totf.costo, 2),
      'cargas',  totf.cargas,
      'ticket_promedio',
        case when totf.cargas > 0 then round(totf.costo / totf.cargas, 2) end,
      'litros_por_carga',
        case when totf.cargas > 0 then round(totf.litros / totf.cargas, 1) end,
      -- Sobre el total, no promediando price_per_liter: un promedio de precios
      -- le daría el mismo peso a una carga de 20 litros que a una de 400.
      'precio_litro',
        case when totf.litros > 0 then round(totf.costo / totf.litros, 2) end,
      'km_por_litro',
        case when totf.litros > 0 then round(tot.km / totf.litros, 2) end,
      'litros_por_100km',
        case when tot.km > 0 then round(totf.litros * 100 / tot.km, 2) end,
      'costo_por_km',
        case when tot.km > 0 then round(totf.costo / tot.km, 2) end,
      'por_medio', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'medio',  m.medio,
          'cargas', m.cargas,
          'litros', round(m.litros, 2),
          'gasto',  round(m.costo, 2)
        ) order by m.costo desc, m.medio), '[]'::jsonb)
        from med m
      )
    ),

    'descartes', jsonb_build_object(
      'jornadas_sin_km',    tot.jornadas - tot.jornadas_con_km,
      'jornadas_sin_horas', tot.jornadas - tot.jornadas_con_horas,
      -- Remitos que no se pudieron colgar de ningún camión por no tener jornada.
      'servicios_sin_camion', (select count(*)::int from servicio where truck_id is null)
    ),

    'por_camion', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'truck_id',     x.truck_id,
        'etiqueta',     x.etiqueta,
        'km',           x.km,
        'litros',       round(x.litros, 2),
        'costo',        round(x.costo, 2),
        'jornadas',     x.jornadas,
        'servicios',    x.servicios,
        'km_por_litro', case when x.litros > 0 then round(x.km / x.litros, 2) end
      ) order by x.km desc, x.etiqueta), '[]'::jsonb)
      from cam x
    ),

    'por_chofer', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'driver_id',         x.user_id,
        'nombre',            x.full_name,
        'km',                x.km,
        'horas',             round(x.horas, 1),
        'jornadas',          x.jornadas,
        'servicios',         x.servicios,
        'horas_por_jornada',
          case when x.jornadas_con_horas > 0 then round(x.horas / x.jornadas_con_horas, 2) end
      ) order by x.km desc, x.full_name), '[]'::jsonb)
      from cho x
    ),

    'serie_temporal', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'fecha',     x.inicio,
        'km',        x.km,
        'jornadas',  x.jornadas,
        'servicios', coalesce(ss.servicios, 0)
      ) order by x.inicio), '[]'::jsonb)
      from serie x
      left join serie_s ss on ss.inicio = x.inicio
    ),

    'catalogo', jsonb_build_object(
      'camiones', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.truck_id, 'etiqueta', k.etiqueta) order by k.etiqueta), '[]'::jsonb) from cat_cam k),
      'choferes', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', k.user_id, 'nombre', k.full_name) order by k.full_name), '[]'::jsonb) from cat_cho k)
    ),

    'filtros', jsonb_build_object(
      'camiones', coalesce(to_jsonb(v_camiones), '[]'::jsonb),
      'choferes', coalesce(to_jsonb(v_choferes), '[]'::jsonb)
    )
  )
  into v_result
  from tot, totf, tots;

  return v_result;
end;
$function$;

comment on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) is
  'Métricas agregadas de Operaciones: servicios, kilómetros, jornadas y combustible. El bloque combustible desglosa el gasto por medio de pago (la app cuando el método es app), con ticket promedio, precio por litro, km/litro, litros cada 100 km y costo por km. Granularidad diaria hasta 31 días, semanal hasta 120, mensual más allá. Sólo administración y supervisión.';

revoke all on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) from public, anon;
grant execute on function public.dashboard_operaciones_v1(date, date, int[], uuid[]) to authenticated, service_role;

commit;
