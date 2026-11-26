-- Inicio del Operador (v1). Solo lectura y SIN importes: ni precios, ni facturación, ni montos.
-- Lo usan operador, administración y supervisión. El Inicio de Administración (dashboard_admin_home_v1) no cambia.
--
-- Devuelve:
--   kpis:    servicios cargados hoy, activos ahora, finalizados, anulados y km de los servicios finalizados,
--            cada uno con el valor a la misma hora de hace 7 días y de ayer.
--   tasks:   lo que hay que resolver (sin chofer, demorados, relevos por entregar, remitos sin servicio,
--            remitos para revisar o en borrador, finalizados sin remito).
--   drivers: choferes activos con su jornada abierta (móvil y patente) y si están libres o con servicio.
--   series:  evolución diaria de métricas de gestión de los últimos p_days días y de los p_days anteriores.
--
-- Demoras: no hay hora estimada de llegada cargada, así que se usa un umbral por tiempo transcurrido
-- (cerca del percentil 80 de los últimos 30 días): más de 120 min asignado sin arribar al origen.
-- El tiempo en origen no se mide: el estado «arribado» dura hasta finalizar e incluye el traslado.

create or replace function app_private.operator_home_v1(p_now timestamptz, p_days integer)
returns jsonb language plpgsql stable set search_path = '' as $f$
declare
  tz constant text := 'America/Argentina/Buenos_Aires';
  v_day date := (p_now at time zone tz)::date;
  v_start timestamptz := v_day::timestamp at time zone tz;
  v_days integer := least(greatest(coalesce(p_days, 14), 7), 60);
  late_assigned constant interval := interval '120 minutes';
  result jsonb;
begin
  with
  svc as materialized (
    select s.* from public.operator_services s
    where not coalesce(s.is_test, false) and s.created_at >= v_start - make_interval(days => 2 * v_days + 8)
  ),
  -- Ventanas para los KPIs: hoy hasta ahora, hace 7 días hasta la misma hora, ayer hasta la misma hora.
  win as (
    select * from (values
      ('now',  v_start,                       p_now),
      ('week', v_start - interval '7 days',   p_now - interval '7 days'),
      ('day',  v_start - interval '1 day',    p_now - interval '1 day')
    ) w(k, starts, ends)
  ),
  kpi as (
    select w.k, jsonb_build_object(
      'services', (select count(*) from svc s where s.created_at >= w.starts and s.created_at <= w.ends),
      -- Activos: cargados y todavía sin finalizar ni anular a esa hora (incluye los sin chofer).
      'active', (select count(*) from svc s where s.created_at <= w.ends and s.created_at > w.ends - interval '3 days'
                   and coalesce(s.completed_at, 'infinity') > w.ends and coalesce(s.cancelled_at, 'infinity') > w.ends
                   and (s.status not in ('completed', 'cancelled') or s.completed_at is not null or s.cancelled_at is not null)
                   and (w.k <> 'now' or s.status in ('pending', 'assigned', 'en_route', 'at_origin', 'loaded', 'at_destination'))),
      'completed', (select count(*) from svc s where s.status = 'completed' and s.completed_at >= w.starts and s.completed_at <= w.ends),
      'cancelled', (select count(*) from svc s where s.status = 'cancelled' and s.cancelled_at >= w.starts and s.cancelled_at <= w.ends),
      'km', (select coalesce(round(sum(coalesce(r.km_reales, s.estimated_distance_km, s.route_distance_meters / 1000.0))), 0)
               from svc s left join public.remitos r on r.remito_id = s.remito_id and r.status <> 'anulado'
              where s.status = 'completed' and s.completed_at >= w.starts and s.completed_at <= w.ends)
    ) data from win w
  ),
  open_svc as materialized (
    select s.*, u.full_name driver_name, u.phone driver_phone, t.numero_interno truck_name, t.plate truck_plate
    from svc s
    left join public.users u on u.user_id = s.assigned_driver_id
    left join public.trucks t on t.truck_id = s.assigned_truck_id
    where s.status in ('pending', 'assigned', 'en_route', 'at_origin', 'loaded', 'at_destination')
  ),
  relay as (
    select r.*, u2.full_name to_driver_name from public.operator_service_relays r
    left join public.users u2 on u2.user_id = r.to_driver_id
    where r.handed_over_at is null
  ),
  tasks as (
    -- Sin chofer
    select 'unassigned' kind, 1 prio, s.service_id, coalesce(nullif(s.service_order_number, ''), s.service_number) label,
      greatest(s.created_at, coalesce(s.scheduled_for, s.created_at)) since, s.customer_name, s.vehicle_plate, s.vehicle_make_model,
      s.origin, s.destination, null::text driver_name, null::text driver_phone, null::text extra, null::uuid intake_id
    from open_svc s where s.status = 'pending' and coalesce(s.scheduled_for, s.created_at) <= p_now + interval '30 minutes'
    union all
    -- Demorado en llegar
    select 'late_arrival', 0, s.service_id, coalesce(nullif(s.service_order_number, ''), s.service_number),
      greatest(s.assigned_at, coalesce(s.scheduled_for, s.assigned_at)), s.customer_name, s.vehicle_plate, s.vehicle_make_model,
      s.origin, s.destination, s.driver_name, s.driver_phone, null, null
    from open_svc s where s.status in ('assigned', 'en_route') and not coalesce(s.driver_activated, false)
      and greatest(s.assigned_at, coalesce(s.scheduled_for, s.assigned_at)) < p_now - late_assigned
    union all
    -- Relevo por entregar: el 1º chofer ya arribó al origen y todavía no entregó el vehículo.
    select 'relay', 2, s.service_id, coalesce(nullif(s.service_order_number, ''), s.service_number),
      coalesce(s.driver_arrived_at, s.arrived_at, s.assigned_at), s.customer_name, s.vehicle_plate, s.vehicle_make_model,
      r.exchange_address, s.destination, s.driver_name, s.driver_phone, r.to_driver_name, null
    from open_svc s join relay r on r.service_id = s.service_id where s.status = 'at_origin'
    union all
    -- Remito sin servicio asignado (ingresos del chofer)
    select 'intake', 3, i.linked_service_id, coalesce(nullif(i.service_reference, ''), i.intake_number),
      coalesce(i.created_at_device, i.created_at), i.customer_name, i.vehicle_plate, i.vehicle_make_model,
      i.origin, i.destination, u.full_name, u.phone, null, i.intake_id
    from public.driver_service_intakes i
    join public.remitos rm on rm.remito_id = i.remito_id and rm.status = 'firmado'
    join public.users u on u.user_id = i.driver_id and not coalesce(u.is_test, false)
    where i.status = 'pending_admin' and i.linked_service_id is null
    union all
    -- Remito para revisar / en borrador
    select case when s.document_status = 'submitted' then 'remito_review' else 'remito_draft' end, 4, s.service_id,
      coalesce(nullif(s.service_order_number, ''), s.service_number), coalesce(s.completed_at, s.updated_at), s.customer_name,
      s.vehicle_plate, s.vehicle_make_model, s.origin, s.destination, u.full_name, u.phone, null, null
    from svc s left join public.users u on u.user_id = s.assigned_driver_id
    where s.status in ('completed', 'at_origin', 'assigned')
      and ((s.document_status = 'submitted' and coalesce(s.administrative_review_status, 'pending') = 'pending')
        or s.document_status = 'draft')
    union all
    -- Finalizado sin remito (últimos 7 días)
    select 'no_remito', 5, s.service_id, coalesce(nullif(s.service_order_number, ''), s.service_number), s.completed_at,
      s.customer_name, s.vehicle_plate, s.vehicle_make_model, s.origin, s.destination, u.full_name, u.phone, null, null
    from svc s left join public.users u on u.user_id = s.assigned_driver_id
    where s.status = 'completed' and coalesce(s.document_status, 'not_started') = 'not_started' and s.remito_id is null
      and not coalesce(s.driver_activated, false) and s.completed_at >= p_now - interval '7 days'
  ),
  drivers as (
    select u.user_id, u.full_name, u.phone, jl.truck_id, t.numero_interno truck_name, t.plate truck_plate, coalesce(jl.in_workshop, false) in_workshop,
      (jl.log_id is not null) on_shift,
      exists (select 1 from open_svc s where s.assigned_driver_id = u.user_id and s.status <> 'pending') busy
    from public.users u join public.roles ro on ro.role_id = u.role_id and ro.name = 'chofer'
    left join lateral (
      select dl.log_id, dl.truck_id, dl.in_workshop from public.daily_logs dl
      where dl.driver_id = u.user_id and coalesce(dl.status, 'open') = 'open' and dl.hora_fin is null and dl.voided_at is null
        and dl.log_date >= v_day - 1
      order by dl.log_date desc, dl.log_id desc limit 1
    ) jl on true
    left join public.trucks t on t.truck_id = jl.truck_id
    where coalesce(u.is_active, true) and not coalesce(u.is_test, false)
  ),
  days as (
    select d::date as dd, (d::date < v_day - v_days + 1) as is_prev
    from generate_series(v_day - 2 * v_days + 1, v_day, interval '1 day') d
  ),
  series as (
    select d.dd, d.is_prev,
      -- Mediana de minutos desde que se cargó hasta que tuvo chofer (solo los que se cargaron sin chofer).
      (select round((percentile_cont(0.5) within group (order by extract(epoch from s.assigned_at - greatest(s.created_at, coalesce(s.scheduled_for, s.created_at))) / 60))::numeric, 0)
         from svc s where (s.created_at at time zone tz)::date = d.dd and not coalesce(s.driver_activated, false)
           and s.assigned_at > greatest(s.created_at, coalesce(s.scheduled_for, s.created_at)) + interval '1 minute') assign_minutes,
      (select count(*) from svc s where s.status = 'completed' and (s.completed_at at time zone tz)::date = d.dd and not coalesce(s.driver_activated, false)
           and (s.arrived_at - greatest(s.assigned_at, coalesce(s.scheduled_for, s.assigned_at))) > late_assigned) late,
      (select round(100.0 * count(*) filter (where r.firmado_at is not null and (r.firmado_at at time zone tz)::date = d.dd) / nullif(count(*), 0))
         from svc s left join public.remitos r on r.remito_id = s.remito_id and r.status <> 'anulado'
        where s.status = 'completed' and (s.completed_at at time zone tz)::date = d.dd and not coalesce(s.driver_activated, false)) remito_same_day,
      (select count(*) from svc s where s.status = 'completed' and (s.completed_at at time zone tz)::date = d.dd) completed
    from days d
  )
  select jsonb_build_object(
    'generated_at', p_now,
    'day', v_day,
    'thresholds', jsonb_build_object('late_assigned_minutes', 120),
    'kpis', (select jsonb_object_agg(k, data) from kpi),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', t.kind, 'service_id', t.service_id, 'intake_id', t.intake_id, 'label', t.label, 'since', t.since,
        'customer', t.customer_name, 'vehicle_plate', t.vehicle_plate, 'vehicle', t.vehicle_make_model,
        'origin', t.origin, 'destination', t.destination, 'driver', t.driver_name, 'driver_phone', t.driver_phone, 'extra', t.extra)
        order by t.prio, t.since) from tasks t), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.user_id, 'name', d.full_name, 'phone', d.phone, 'truck', d.truck_name, 'plate', d.truck_plate,
        'state', case when not d.on_shift or d.in_workshop then 'inactive' when d.busy then 'busy' else 'free' end)
        order by (not d.on_shift or d.in_workshop), d.busy, d.full_name) from drivers d), '[]'::jsonb),
    'series', (select jsonb_agg(jsonb_build_object('day', s.dd, 'previous', s.is_prev, 'assign_minutes', s.assign_minutes,
        'late', s.late, 'remito_same_day', s.remito_same_day, 'completed', s.completed) order by s.dd) from series s)
  ) into result;
  return result;
end $f$;
revoke all on function app_private.operator_home_v1(timestamptz, integer) from public, anon, authenticated;

create or replace function public.dashboard_operator_home_v1(p_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path = '' as $f$
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador', 'supervision') then
    raise exception 'Sin permiso para ver el Inicio' using errcode = '42501';
  end if;
  return app_private.operator_home_v1(now(), p_days);
end $f$;
revoke all on function public.dashboard_operator_home_v1(integer) from public, anon;
grant execute on function public.dashboard_operator_home_v1(integer) to authenticated;
