-- Salud de la flota: el próximo service también por horas de motor.
-- Igual que en la ficha del camión (estadoServicePlan en supabase.js):
-- · trigger_type 'km': sólo km; 'hours': sólo horas; 'both': lo que venza primero.
-- · Sin horas actuales del camión (0 o null) la parte de horas no se cuenta.
-- · Aviso por horas: 10% del intervalo, mínimo 10 h.
-- Devuelve lo mismo que antes y además horas_actual, proximo_service_horas,
-- horas_restantes y service_manda ('km' | 'horas'). Solo lectura.

create or replace function public.dashboard_flota_v1()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  c_dias_doc_aviso constant integer := 30;
  c_dias_incidente_abierto constant integer := 30;
  c_km_service_aviso constant integer := 500;

  v_role   text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver la salud de la flota';
  end if;

  with taller as (
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
           case when coalesce(t.current_hours, 0) > 0 then t.current_hours end as current_hours,
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
           coalesce(m.alert_before_km, c_km_service_aviso) as alert_before_km,
           coalesce(m.trigger_type, 'km') <> 'hours' and coalesce(m.interval_km, 0) > 0 as usa_km,
           coalesce(m.trigger_type, 'km') <> 'km' and coalesce(m.interval_hours, 0) > 0 as usa_horas,
           nullif(coalesce(m.interval_km, 0), 0)    as interval_km,
           nullif(coalesce(m.interval_hours, 0), 0) as interval_hours,
           greatest(10, round(coalesce(m.interval_hours, 0) * 0.1))::int as alert_before_hours
    from public.truck_subscriptions s
    join public.master_service_plans m on m.id = s.master_plan_id
    where coalesce(s.is_active, true)
      and coalesce(m.activo, true)
  ),
  planes_base as (
    select p.truck_id,
           p.name,
           p.usa_km,
           p.usa_horas,
           c.current_km,
           c.current_hours,
           l.next_due_km,
           l.next_due_hours,
           case when p.usa_km and c.current_km is not null and l.next_due_km is not null
                then l.next_due_km - c.current_km end as km_restantes,
           case when p.usa_horas and c.current_hours is not null and l.next_due_hours is not null
                then l.next_due_hours - c.current_hours end as horas_restantes,
           p.alert_before_km,
           p.alert_before_hours,
           p.interval_km,
           p.interval_hours
    from planes p
    join camion c on c.truck_id = p.truck_id
    left join lateral (
      select ml.next_due_km, ml.next_due_hours
      from public.maintenance_logs ml
      where ml.truck_id = p.truck_id
        and ml.master_plan_id = p.master_plan_id
      order by ml.performed_at desc, ml.maintenance_id desc
      limit 1
    ) l on true
  ),
  planes_medidas as (
    select b.*,
           case when b.km_restantes is null then null
                when b.km_restantes <= 0 then 'vencido'
                when b.km_restantes <= b.alert_before_km then 'proximo'
                else 'al_dia' end as estado_km,
           case when b.horas_restantes is null then null
                when b.horas_restantes <= 0 then 'vencido'
                when b.horas_restantes <= b.alert_before_hours then 'proximo'
                else 'al_dia' end as estado_horas,
           b.km_restantes::numeric / b.interval_km       as ratio_km,
           b.horas_restantes::numeric / b.interval_hours as ratio_horas
    from planes_base b
  ),
  planes_estado as (
    select m.truck_id,
           m.name,
           m.next_due_km,
           m.next_due_hours,
           m.km_restantes,
           m.horas_restantes,
           least(m.ratio_km, m.ratio_horas) as urgencia,
           case
             when m.estado_km is not null or m.estado_horas is not null then
               case least(case m.estado_km when 'vencido' then 0 when 'proximo' then 1 when 'al_dia' then 2 end,
                          case m.estado_horas when 'vencido' then 0 when 'proximo' then 1 when 'al_dia' then 2 end)
                 when 0 then 'vencido' when 1 then 'proximo' else 'al_dia' end
             when m.usa_km and m.current_km is null then 'sin_odometro'
             when m.next_due_km is null and m.next_due_hours is null then 'sin_registro'
             when m.usa_horas and not m.usa_km and m.current_hours is null then 'sin_horas'
             else 'sin_registro'
           end as estado,
           case
             when m.estado_horas is null then case when m.estado_km is not null then 'km' end
             when m.estado_km is null then 'horas'
             when (case m.estado_horas when 'vencido' then 0 when 'proximo' then 1 else 2 end)
                < (case m.estado_km when 'vencido' then 0 when 'proximo' then 1 else 2 end) then 'horas'
             when (case m.estado_horas when 'vencido' then 0 when 'proximo' then 1 else 2 end)
                > (case m.estado_km when 'vencido' then 0 when 'proximo' then 1 else 2 end) then 'km'
             when m.ratio_horas < m.ratio_km then 'horas'
             else 'km'
           end as manda
    from planes_medidas m
  ),
  proximo as (
    select distinct on (truck_id)
           truck_id, name, next_due_km, next_due_hours, km_restantes, horas_restantes, estado, manda
    from planes_estado
    order by truck_id,
             case estado
               when 'vencido'  then 0
               when 'proximo'  then 1
               when 'al_dia'   then 2
               else 3
             end,
             urgencia asc nulls last
  ),
  ultimo as (
    select distinct on (ml.truck_id)
           ml.truck_id, ml.performed_at, ml.km_at_service, ml.hours_at_service, m.name
    from public.maintenance_logs ml
    left join public.master_service_plans m on m.id = ml.master_plan_id
    order by ml.truck_id, ml.performed_at desc, ml.maintenance_id desc
  ),
  inc_camion as (
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
           c.current_hours              as horas_actual,
           u.performed_at               as ultimo_service_fecha,
           u.km_at_service              as ultimo_service_km,
           u.hours_at_service           as ultimo_service_horas,
           u.name                       as ultimo_service_plan,
           p.name                       as proximo_service_plan,
           p.next_due_km                as proximo_service_km,
           p.next_due_hours             as proximo_service_horas,
           p.km_restantes               as km_restantes,
           p.horas_restantes            as horas_restantes,
           p.manda                      as service_manda,
           coalesce(p.estado, 'sin_registro') as service_estado,
           coalesce(d.vencidos, 0)      as docs_vencidos,
           coalesce(d.por_vencer, 0)    as docs_por_vencer,
           coalesce(d.sin_archivo, 0)   as docs_sin_archivo,
           coalesce(d.total, 0)         as docs_total,
           d.proximo_vencimiento        as docs_proximo_vencimiento,
           coalesce(i.abiertos, 0)      as incidentes_abiertos,
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
                 'horas_actual',             f.horas_actual,
                 'ultimo_service_fecha',     f.ultimo_service_fecha,
                 'ultimo_service_km',        f.ultimo_service_km,
                 'ultimo_service_horas',     f.ultimo_service_horas,
                 'ultimo_service_plan',      f.ultimo_service_plan,
                 'proximo_service_plan',     f.proximo_service_plan,
                 'proximo_service_km',       f.proximo_service_km,
                 'proximo_service_horas',    f.proximo_service_horas,
                 'km_restantes',             f.km_restantes,
                 'horas_restantes',          f.horas_restantes,
                 'service_manda',            f.service_manda,
                 'service_estado',           f.service_estado,
                 'docs_vencidos',            f.docs_vencidos,
                 'docs_por_vencer',          f.docs_por_vencer,
                 'docs_sin_archivo',         f.docs_sin_archivo,
                 'docs_total',               f.docs_total,
                 'docs_proximo_vencimiento', f.docs_proximo_vencimiento,
                 'incidentes_abiertos',      f.incidentes_abiertos,
                 'severidad',                f.severidad
               )
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
