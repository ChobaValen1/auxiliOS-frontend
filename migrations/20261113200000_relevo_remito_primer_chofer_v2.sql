-- Servicio con relevo: el remito lo hace el 1º chofer (v2).
-- Cambia la regla del relevo (13/11/2026): el 1º chofer hace el remito con el cliente al retirar el vehículo y cobra
-- como siempre; después lo lleva al punto de encuentro y se lo entrega al 2º. El 2º NO hace remito: lo lleva al destino
-- y marca «Entregué el vehículo en destino».
--   · Se quita el bloqueo que le impedía el remito al 1º chofer.
--   · El chofer sólo puede marcar la entrega en el punto de encuentro si el servicio ya tiene remito (Operaciones puede
--     igual, si hace falta). Al entregar, el servicio NO vuelve a «asignado»: sigue en curso con el remito del 1º.
--   · Nuevo: entrega en destino (delivered_*), la marca el 2º chofer u Operaciones.
--   · Sueldos: el servicio cuenta para los dos choferes, sea quien sea el que hizo el remito.
--   · Liquidación e historial: el chofer que no hizo el remito ve el servicio «sin remito propio» y no rinde efectivo.
-- Es aditivo para los servicios sin relevo.

drop trigger if exists operator_services_relay_remito_guard_v1 on public.operator_services;
drop function if exists app_private.relay_block_first_driver_remito_v1();

alter table public.operator_service_relays add column if not exists delivered_at timestamptz;
alter table public.operator_service_relays add column if not exists delivered_by uuid references public.users(user_id);
alter table public.operator_service_relays add column if not exists delivery_source text check (delivery_source in ('driver', 'operator'));
alter table public.operator_service_relays drop constraint if exists operator_service_relays_delivered_after_handover_v2;
alter table public.operator_service_relays add constraint operator_service_relays_delivered_after_handover_v2
  check (delivered_at is null or handed_over_at is not null);

-- Datos del relevo para pantallas: suma si el servicio ya tiene remito y la entrega en destino.
create or replace function app_private.relay_json_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $f$
  select jsonb_build_object(
    'service_id', r.service_id,
    'exchange_address', r.exchange_address, 'exchange_lat', r.exchange_lat, 'exchange_lng', r.exchange_lng,
    'exchange_place_id', r.exchange_place_id,
    'to_driver_id', r.to_driver_id, 'to_driver_name', tu.full_name,
    'to_truck_id', tt.truck_id, 'to_truck_label', coalesce(tt.numero_interno::text, tt.plate), 'to_truck_plate', tt.plate,
    'to_has_active_jornada', aj.truck_id is not null,
    -- Antes de entregar, el 1º chofer es el que tiene el servicio asignado.
    'from_driver_id', coalesce(r.from_driver_id, s.assigned_driver_id), 'from_driver_name', fu.full_name,
    'from_truck_id', coalesce(r.from_truck_id, s.assigned_truck_id), 'from_truck_label', coalesce(ft.numero_interno::text, ft.plate), 'from_truck_plate', ft.plate,
    'handed_over', r.handed_over_at is not null, 'handed_over_at', r.handed_over_at, 'handover_source', r.handover_source,
    'has_remito', s.remito_id is not null,
    'delivered', r.delivered_at is not null, 'delivered_at', r.delivered_at, 'delivery_source', r.delivery_source)
  from public.operator_service_relays r
  join public.operator_services s on s.service_id = r.service_id
  left join public.users tu on tu.user_id = r.to_driver_id
  left join lateral (select app_private.relay_receiver_truck_v1(r.to_driver_id) as truck_id) aj on true
  left join public.trucks tt on tt.truck_id = coalesce(r.to_truck_id, aj.truck_id)
  left join public.users fu on fu.user_id = coalesce(r.from_driver_id, s.assigned_driver_id)
  left join public.trucks ft on ft.truck_id = coalesce(r.from_truck_id, s.assigned_truck_id)
  where r.service_id = p_service_id
$f$;
revoke all on function app_private.relay_json_v1(uuid) from public, anon, authenticated;

-- Entrega en el punto de encuentro: el 1º chofer (con el remito ya hecho) u Operaciones. El servicio pasa al 2º.
create or replace function public.mark_operator_service_relay_handover_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), ''); v_uid uuid := auth.uid();
  s public.operator_services%rowtype; r public.operator_service_relays%rowtype; v_from_driver uuid; v_from_truck integer; v_to_truck integer; v_to_name text;
begin
  if v_uid is null or v_role not in ('chofer', 'operador', 'administracion') then raise exception 'Sin permiso para entregar el vehículo'; end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  select * into r from public.operator_service_relays where service_id = p_service_id for update;
  if not found then raise exception 'Este servicio no tiene relevo'; end if;
  if v_role = 'chofer' and s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este chofer'; end if;
  if r.handed_over_at is not null then raise exception 'El vehículo ya se entregó'; end if;
  if s.status not in ('assigned', 'at_origin') then raise exception 'El servicio no está en curso'; end if;
  if s.assigned_driver_id is null or s.assigned_truck_id is null then raise exception 'El servicio no tiene chofer y móvil asignados'; end if;
  -- El remito se hace al retirar el vehículo, con el cliente: el chofer no entrega sin remito.
  if v_role = 'chofer' and s.remito_id is null then
    raise exception 'RELEVO_SIN_REMITO: primero hacé el remito con el cliente; después entregás el vehículo';
  end if;
  perform app_private.relay_check_receiver_v1(r.to_driver_id);
  -- El vehículo pasa al móvil de la jornada activa del 2º chofer.
  v_to_truck := app_private.relay_receiver_truck_v1(r.to_driver_id);
  if v_to_truck is null then
    select u.full_name into v_to_name from public.users u where u.user_id = r.to_driver_id;
    raise exception 'RELEVO_SIN_JORNADA: % todavía no inició su jornada con un móvil; tiene que iniciarla para recibir el vehículo', coalesce(v_to_name, 'El chofer que recibe');
  end if;
  if v_to_truck = s.assigned_truck_id then raise exception 'El móvil de la jornada del chofer que recibe es el mismo que el del primer tramo'; end if;
  if not exists (select 1 from public.trucks t where t.truck_id = v_to_truck and t.status = 'active') then raise exception 'Móvil inválido o inactivo'; end if;

  v_from_driver := s.assigned_driver_id; v_from_truck := s.assigned_truck_id;
  update public.operator_service_relays
  set from_driver_id = v_from_driver, from_truck_id = v_from_truck, to_truck_id = v_to_truck, handed_over_at = now(), handed_over_by = v_uid,
      handover_source = case when v_role = 'chofer' then 'driver' else 'operator' end, updated_at = now()
  where service_id = p_service_id;

  -- Igual que reassign_operator_service: el trigger de asignaciones guarda al 1º chofer en el historial.
  -- El estado no cambia: con el remito hecho, el servicio sigue en curso.
  perform set_config('app.phase3_bridge', '1', true);
  perform set_config('app.assignment_reason', 'relay_handover', true);
  perform set_config('app.assignment_notes', 'Entrega del vehículo en ' || r.exchange_address, true);
  update public.operator_services
  set assigned_driver_id = r.to_driver_id, assigned_truck_id = v_to_truck, assigned_at = now(), assigned_by = v_uid, updated_by = v_uid
  where service_id = p_service_id;

  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by)
  values (p_service_id, 'relay_handover', s.status, s.status, 'Entrega del vehículo en ' || r.exchange_address, v_uid);
  return app_private.relay_json_v1(p_service_id);
end $f$;

-- Entrega en el destino: la marca el 2º chofer (o Operaciones). No cierra el servicio: lo finaliza Operaciones como siempre.
create or replace function public.mark_operator_service_relay_delivered_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $f$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), ''); v_uid uuid := auth.uid();
  s public.operator_services%rowtype; r public.operator_service_relays%rowtype;
begin
  if v_uid is null or v_role not in ('chofer', 'operador', 'administracion') then raise exception 'Sin permiso para marcar la entrega'; end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  select * into r from public.operator_service_relays where service_id = p_service_id for update;
  if not found then raise exception 'Este servicio no tiene relevo'; end if;
  if r.handed_over_at is null then raise exception 'RELEVO_SIN_RECIBIR: el vehículo todavía no se entregó en el punto de encuentro'; end if;
  if v_role = 'chofer' and (r.to_driver_id is distinct from v_uid or s.assigned_driver_id is distinct from v_uid) then
    raise exception 'El servicio no está asignado a este chofer';
  end if;
  if r.delivered_at is not null then raise exception 'La entrega en destino ya está marcada'; end if;
  if s.status not in ('assigned', 'at_origin') then raise exception 'El servicio no está en curso'; end if;

  update public.operator_service_relays
  set delivered_at = now(), delivered_by = v_uid, delivery_source = case when v_role = 'chofer' then 'driver' else 'operator' end, updated_at = now()
  where service_id = p_service_id;
  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by)
  values (p_service_id, 'relay_delivered', s.status, s.status,
    'Entrega del vehículo en destino' || coalesce(' (' || nullif(coalesce(s.destination_formatted_address, s.destination), '') || ')', ''), v_uid);
  return app_private.relay_json_v1(p_service_id);
end $f$;

-- Sueldos: el servicio completado cuenta para los dos choferes del relevo, sea quien sea el que hizo el remito.
create or replace function app_private.completed_driver_services_v2()
returns table(service_id uuid, driver_id uuid, completed_at timestamptz, remito_id integer)
language sql stable security definer set search_path to '' as $f$
  with own as (
    select s.service_id,
      coalesce(r.driver_id,
        case when s.driver_activated then s.activation_driver_id end,
        s.assigned_driver_id, a.driver_id) as driver_id, s.completed_at, r.remito_id
    from public.operator_services s
    left join lateral (
      select x.driver_id,x.remito_id from public.remitos x
      where (x.operator_service_id=s.service_id or x.remito_id=s.remito_id) and x.status='firmado'
      order by x.firmado_at desc nulls last,x.remito_id desc limit 1
    ) r on true
    left join lateral (
      select x.driver_id from public.operator_service_assignments x
      where x.service_id=s.service_id and x.driver_id is not null and x.assigned_at<=s.completed_at
      order by x.assigned_at desc,x.assignment_sequence desc nulls last,x.assignment_id desc limit 1
    ) a on true
    where s.status='completed' and s.logistics_type='own' and s.completed_at is not null
      -- Preserve the existing rule: Activado Movida is not a payable service.
      and not (coalesce(s.driver_activated,false) and coalesce(s.activation_kind,'')='movement')
  )
  select o.service_id, o.driver_id, o.completed_at, o.remito_id from own o
  union all
  select distinct o.service_id, p.driver_id, o.completed_at, o.remito_id
  from own o join public.operator_service_relays rl on rl.service_id = o.service_id
  cross join lateral (values (rl.from_driver_id), (rl.to_driver_id)) p(driver_id)
  where rl.handed_over_at is not null and p.driver_id is not null and p.driver_id is distinct from o.driver_id;
$f$;
revoke all on function app_private.completed_driver_services_v2() from public,anon,authenticated;

revoke all on function public.mark_operator_service_relay_handover_v1(uuid) from public, anon;
revoke all on function public.mark_operator_service_relay_delivered_v1(uuid) from public, anon;
grant execute on function public.mark_operator_service_relay_handover_v1(uuid) to authenticated;
grant execute on function public.mark_operator_service_relay_delivered_v1(uuid) to authenticated;

-- ── Liquidación: el chofer del relevo que no hizo el remito se lista sin remito propio ──
-- (parte de 20261113170000_liquidacion_relevo_primer_chofer_v1.sql; ahora vale para el 1º o el 2º).
create or replace function app_private.completed_journey_services_v1(p_log_ids integer[] DEFAULT '{}'::integer[], p_driver uuid DEFAULT NULL::uuid, p_period integer DEFAULT NULL::integer)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_from date; result jsonb;
begin
 if coalesce(cardinality(p_log_ids),0)>500 then raise exception 'Hasta 500 jornadas por consulta'; end if;
 if p_driver is not null then
  if p_period is null or p_period/100 not between 2000 and 2199 or p_period%100 not between 1 and 12 then raise exception 'Período inválido'; end if;
  v_from:=make_date(p_period/100,p_period%100,1);
 end if;
 with candidates as (
  select c.*,s.service_order_number,s.service_number,s.vehicle_plate,s.origin,s.destination,
    s.estimated_distance_km,s.document_status,s.arrived_at,s.customer_payment_primary,s.customer_payment_secondary,
    s.customer_payment_secondary_amount,coalesce(t.log_id,f.log_id) log_id,
    case when t.log_id is not null then 'trip' when f.log_id is not null then 'date' else 'none' end journey_match,
    rl.role relay_role,
    -- Relevo: el chofer que NO hizo el remito (normalmente el 2º) se lista sin remito propio y no rinde efectivo ni peajes.
    (rl.role is not null and not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id)
       and r.status<>'anulado' and r.driver_id=c.driver_id)) relay_first
  from app_private.completed_driver_services_v2() c join public.operator_services s using(service_id)
  left join lateral (
   select case when x.from_driver_id=c.driver_id then 'primero' when x.to_driver_id=c.driver_id then 'segundo' end role
   from public.operator_service_relays x where x.service_id=s.service_id and x.handed_over_at is not null
  ) rl on true
  left join lateral (
   select x.log_id from public.trips x join public.daily_logs j on j.log_id=x.log_id and j.driver_id=c.driver_id
   where x.driver_id=c.driver_id and (x.trip_id=s.trip_id or exists(
    select 1 from public.operator_service_assignments a where a.service_id=s.service_id and a.trip_id=x.trip_id and a.driver_id=c.driver_id))
   order by (x.trip_id=s.trip_id) desc nulls last,x.fecha_hora_inicio desc nulls last,x.trip_id desc limit 1
  ) t on true
  left join lateral (
   select min(d.log_id) log_id from public.daily_logs d
   where t.log_id is null and d.driver_id=c.driver_id and d.voided_at is null
     and d.log_date=(coalesce(s.arrived_at,c.completed_at) at time zone 'America/Argentina/Buenos_Aires')::date
   having count(*)=1
  ) f on true
  where (not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id) and r.status<>'anulado')
     -- Relevo: el chofer que no hizo el remito también ve el servicio (sin remito propio).
     or (rl.role is not null and not exists(select 1 from public.remitos r where (r.operator_service_id=s.service_id or r.remito_id=s.remito_id)
       and r.status<>'anulado' and r.driver_id=c.driver_id)))
 ), selected as (
  select * from candidates c where (p_driver is null and c.log_id=any(p_log_ids)) or
   (p_driver is not null and c.driver_id=p_driver and (
     c.log_id=any(p_log_ids) or (c.completed_at>=(v_from::timestamp at time zone 'America/Argentina/Buenos_Aires')
     and c.completed_at<((v_from+interval '1 month')::timestamp at time zone 'America/Argentina/Buenos_Aires'))))
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'operator_service_id',s.service_id,'no_remito',true,'log_id',s.log_id,'journey_match',s.journey_match,'driver_id',s.driver_id,
  'nro_servicio',coalesce(nullif(s.service_order_number,''),s.service_number),'patente',s.vehicle_plate,
  'origen',s.origin,'destino',s.destination,'km_reales',s.estimated_distance_km,
  'status','completed','document_status',s.document_status,'created_at_device',coalesce(s.arrived_at,s.completed_at),
  'completed_at',s.completed_at,'cash_expected',coalesce(p.amount,0)+case when s.relay_first then 0 when s.customer_payment_primary is null then a.customer_cash else
    case when s.customer_payment_primary='cash' then greatest(a.customer_total-coalesce(s.customer_payment_secondary_amount,0),0) else 0 end+
    case when s.customer_payment_secondary='cash' then coalesce(s.customer_payment_secondary_amount,0) else 0 end end,
  'toll_cash_expense',case when s.relay_first then 0 else a.toll_cash end,
  'relay_role',case when s.relay_first then s.relay_role end
 ) order by s.completed_at,s.service_id),'[]'::jsonb) into result from selected s
 left join lateral (select coalesce(sum(p.amount),0) amount from public.service_payments p
  where p.service_id=s.service_id and p.received_by=s.driver_id and p.method='cash' and p.voided_at is null) p on true
 cross join lateral (
  select coalesce(sum(x.customer_total),0) customer_total,coalesce(sum(x.customer_cash),0) customer_cash,coalesce(sum(x.toll_cash),0) toll_cash from (
   select case when t.payer_agent='customer' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_total,
    case when t.payer_agent='customer' and t.customer_payment_method='cash' then coalesce(t.customer_unit_amount,t.unit_amount)*t.quantity else 0 end customer_cash,
    case when t.payment_method='cash' then t.total_amount else 0 end toll_cash
   from public.operator_service_tolls t where t.service_id=s.service_id and t.source='actual'
   union all select case when e.payer_agent='customer' and e.collector_agent='company' then e.total_amount else 0 end,
    case when e.payer_agent='customer' and e.collector_agent='company' and e.customer_payment_method='cash' then e.total_amount else 0 end,0
   from public.operator_service_excess_charges e where e.service_id=s.service_id and e.source='actual'
  ) x
 ) a;
 return result;
end $function$;

-- ── Historial del chofer: también lo ve el 2º chofer, con su móvil ──
-- (parte de 20261113150000_historial_chofer_relevo_v1.sql).
create or replace function public.list_driver_service_history_v1(
  p_page integer default 1, p_page_size integer default 50, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare
  uid uuid := auth.uid(); result jsonb; item jsonb; enriched jsonb := '[]'; tolls jsonb;
  page_size integer := least(100,greatest(1,coalesce(p_page_size,50)));
  filters jsonb := coalesce(p_filters,'{}'); from_day date; until_day date;
begin
  if uid is null or coalesce(app_private.current_auxilios_role(),'') <> 'chofer' then
    raise exception 'Sin permiso para consultar el historial del chofer';
  end if;
  -- Identity comes exclusively from the session. No caller-supplied driver ID.
  if filters->>'periodo'='mes' then
    from_day := date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
    until_day := (from_day+interval '1 month')::date;
  elsif filters->>'periodo'='dia' and nullif(filters->>'diaEspecifico','') is not null then
    from_day := (filters->>'diaEspecifico')::date; until_day := from_day+1;
  elsif filters->>'periodo'='rango' and nullif(filters->>'desde','') is not null and nullif(filters->>'hasta','') is not null then
    from_day := (filters->>'desde')::date; until_day := (filters->>'hasta')::date+1;
  end if;
  with closed as materialized (
    select s.*, coalesce(case when s.status='cancelled' then s.cancelled_at end,
      s.completed_at,s.activated_at,s.updated_at,s.created_at) history_at
    from public.operator_services s
    where s.logistics_type='own' and (s.status in ('completed','cancelled') or s.driver_activated)
  ), owned as materialized (
    select s.*, case when r.driver_id=uid then to_jsonb(r) end receipt,
      -- Relevo: cada chofer ve el servicio con SU móvil (el remito lo hace el 1º; el 2º también lo ve).
      coalesce(case when rl.from_driver_id=uid then rl.from_truck_id when rl.to_driver_id=uid then rl.to_truck_id end,s.activation_truck_id,s.assigned_truck_id,a.truck_id) history_truck_id,
      case when rl.service_id is null then null when rl.from_driver_id=uid then 'primero' else 'segundo' end relay_role,
      (select u.full_name from public.users u where u.user_id=case when rl.from_driver_id=uid then rl.to_driver_id else rl.from_driver_id end) relay_other_driver,
      rl.exchange_address relay_exchange_address, rl.handed_over_at relay_handed_over_at
    from closed s
    left join public.operator_service_relays rl on rl.service_id=s.service_id and rl.handed_over_at is not null
    left join lateral (
      select x.* from public.remitos x where x.operator_service_id=s.service_id or x.remito_id=s.remito_id
      order by (x.status='firmado') desc, x.firmado_at desc nulls last,x.remito_id desc limit 1
    ) r on true
    left join lateral (
      select x.driver_id,x.truck_id from public.operator_service_assignments x
      where x.service_id=s.service_id and x.driver_id is not null and x.assigned_at<=s.history_at
      order by x.assigned_at desc,x.assignment_sequence desc nulls last,x.assignment_id desc limit 1
    ) a on true
    where coalesce(case when s.driver_activated then s.activation_driver_id end,
      r.driver_id,s.assigned_driver_id,a.driver_id)=uid
      or rl.from_driver_id=uid or rl.to_driver_id=uid
  ), legacy as (
    select distinct on (coalesce('s:'||r.operator_service_id::text,'r:'||r.remito_id::text)) r.*,
      coalesce(i.driver_activated,false) intake_activated,i.activation_reason_code intake_reason,
      i.activation_reason_detail intake_detail
    from public.remitos r
    left join public.driver_service_intakes i on i.intake_id=r.driver_intake_id and i.driver_id=uid
    where r.driver_id=uid
      and not (r.status='pendiente' and (r.driver_intake_id is not null or r.document_source='driver_ad_hoc') and r.operator_service_id is null)
      and not exists(select 1 from owned s where s.service_id=r.operator_service_id or s.remito_id=r.remito_id or (s.receipt->>'remito_id')::integer=r.remito_id)
    order by coalesce('s:'||r.operator_service_id::text,'r:'||r.remito_id::text),
      (r.status='firmado') desc,r.firmado_at desc nulls last,r.remito_id desc
  ), entries as (
    select 's:'||s.service_id::text key, s.history_at occurred_at,
      case when s.status='cancelled' then 'anulado' when s.driver_activated then 'activado' else 'finalizado' end history_state,
      s.receipt remito,
      jsonb_build_object('service_id',s.service_id,'service_order_number',s.service_order_number,
        'service_number',s.service_number,'status',s.status,'driver_activated',s.driver_activated,
        'activation_kind',s.activation_kind,'activation_reason_code',s.cancellation_reason_code,
        'activation_reason_detail',s.cancellation_reason_detail,'cancellation_reason_code',s.cancellation_reason_code,
        'cancellation_reason_detail',s.cancellation_reason_detail,'customer_name',s.customer_name,
        'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,'scheduled_for',s.scheduled_for,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,'activated_at',s.activated_at,
        'concept_id',s.primary_concept_id,'concept_name',c.name,'truck_label',t.numero_interno,
        'document_status',s.document_status,
        'relay_role',s.relay_role,'relay_other_driver',s.relay_other_driver,
        'relay_exchange_address',s.relay_exchange_address,'relay_handed_over_at',s.relay_handed_over_at) service,
      null::jsonb intake
    from owned s left join public.service_concepts c on c.concept_id=s.primary_concept_id
    left join public.trucks t on t.truck_id=s.history_truck_id
    union all
    select 'r:'||r.remito_id::text,coalesce(r.firmado_at,r.created_at_device,r.created_at),
      case when r.intake_activated then 'activado' when r.status='anulado' then 'anulado'
        when r.status='cerrado_admin' then 'finalizado' else r.status end,
      to_jsonb(r)-'intake_activated'-'intake_reason'-'intake_detail',null,
      jsonb_build_object('driver_activated',r.intake_activated,'activation_reason_code',r.intake_reason,'activation_reason_detail',r.intake_detail)
    from legacy r
  ), filtered as materialized (
    select * from entries e
    where (coalesce(filters->>'estado','') in ('','todos') or e.history_state=filters->>'estado')
      and (from_day is null or e.occurred_at >= (from_day::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (until_day is null or e.occurred_at < (until_day::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (nullif(filters->>'patente','') is null or coalesce(e.service->>'vehicle_plate',e.remito->>'patente','') ilike '%'||(filters->>'patente')||'%')
      and (nullif(filters->>'tipoServicio','') is null
        or (filters->>'tipoServicio'='__sin__' and e.service is null and e.remito->>'operator_service_id' is null)
        or e.service->>'concept_id'=filters->>'tipoServicio' or e.remito->>'tipo_servicio'=filters->>'tipoServicio')
      and (nullif(filters->>'pagoMetodo','') is null or lower(filters->>'pagoMetodo') in (e.remito->>'pago_1_metodo',e.remito->>'pago_2_metodo'))
      and (nullif(btrim(filters->>'buscar'),'') is null or strpos(lower(concat_ws(' ',
        e.service->>'service_order_number',e.service->>'service_number',e.service->>'customer_name',
        e.service->>'vehicle_plate',e.service->>'origin',e.service->>'destination',
        e.remito->>'nro_remito',e.remito->>'nro_servicio',e.remito->>'razon_social',e.remito->>'patente',
        e.remito->>'origen',e.remito->>'destino')),lower(btrim(filters->>'buscar')))>0)
  ), totals as (select count(*) total from filtered), paging as (
    select total,least(greatest(1,coalesce(p_page,1)),greatest(1,ceil(total::numeric/page_size)::integer)) page from totals
  ), page_rows as (
    select * from filtered order by occurred_at desc nulls last,key desc
    limit page_size offset ((select page from paging)-1)*page_size
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc nulls last,key desc) from page_rows p),'[]'::jsonb),
    'total',paging.total,'page',paging.page,'page_size',page_size,
    'drafts',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at_device desc,r.remito_id desc)
      from public.remitos r where r.driver_id=uid and r.status='pendiente' and r.operator_service_id is null
        and (r.driver_intake_id is not null or r.document_source='driver_ad_hoc')),'[]'::jsonb))
  into result from paging;
  -- Enrich only the authorized, paginated rows. Existing receipt guard remains intact.
  for item in select value from jsonb_array_elements(result->'items') loop
    begin
    if item->'remito'->>'remito_id' is not null then
      tolls := public.get_driver_remito_history_v3((item->'remito'->>'remito_id')::integer);
    elsif item->'service'->>'service_id' is not null then
      tolls := jsonb_build_object('history_tolls',app_private.merge_history_tolls_v1(
        app_private.service_history_tolls_v1((item->'service'->>'service_id')::uuid),'[]'::jsonb,
        item->'service'->>'document_status' in ('approved','exception_approved')));
    else tolls := jsonb_build_object('history_tolls','[]'::jsonb); end if;
    exception when others then tolls := jsonb_build_object('load_error',true); end;
    enriched := enriched||jsonb_build_array(item||jsonb_build_object('tolls',jsonb_build_object(
      'history_tolls',tolls->'history_tolls','accepted_toll_total',tolls->'accepted_toll_total','load_error',coalesce((tolls->>'load_error')::boolean,false))));
  end loop;
  return result||jsonb_build_object('items',enriched);
end $f$;
revoke all on function public.list_driver_service_history_v1(integer,integer,jsonb) from public,anon;
grant execute on function public.list_driver_service_history_v1(integer,integer,jsonb) to authenticated;
