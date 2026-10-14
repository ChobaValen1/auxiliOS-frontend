-- Varios servicios a la vez y cola del chofer (etapa 1, base).
--
-- Todo queda detrás de un interruptor por chofer: user_feature_flags con
-- feature_key='multi_service_v1'. Mientras el chofer no lo tenga encendido,
-- las trabas de hoy siguen exactamente igual ("Chofer ocupado", "Viaje en
-- curso", "Servicio asignado").
--
-- Lo que cambia para un chofer con el interruptor encendido:
--   * Se le pueden asignar servicios aunque tenga otro activo: quedan en su cola.
--   * El Móvil puede tener varios servicios del mismo chofer.
--   * Puede empezar el siguiente servicio con otro en curso, pero en orden.
--   * Puede cargar un servicio "en el camino" (sin asignación) con otro en curso.
--   * "Mis servicios" sale ordenado por su lugar en la cola.
--
-- El orden se guarda en operator_services.driver_queue_position. Se completa
-- solo al asignar un chofer, para todos (no cambia nada visible si el
-- interruptor está apagado).

-- 1) Interruptor por chofer
create or replace function app_private.multi_service_enabled_v1(p_driver uuid)
returns boolean language sql stable security definer set search_path to '' as $f$
  select p_driver is not null and exists(
    select 1 from public.user_feature_flags f
    where f.user_id = p_driver and f.feature_key = 'multi_service_v1' and f.enabled
  );
$f$;
revoke all on function app_private.multi_service_enabled_v1(uuid) from public, anon;

-- 2) Lugar en la cola del chofer
alter table public.operator_services add column if not exists driver_queue_position integer;

create or replace function app_private.set_driver_queue_position_v1() returns trigger
language plpgsql set search_path to '' as $f$
begin
  if new.assigned_driver_id is null then
    new.driver_queue_position := null;
  elsif tg_op = 'INSERT' or new.assigned_driver_id is distinct from old.assigned_driver_id then
    new.driver_queue_position := coalesce((
      select max(s.driver_queue_position) from public.operator_services s
      where s.assigned_driver_id = new.assigned_driver_id
        and s.service_id is distinct from new.service_id
        and s.status in ('pending','assigned','en_route','at_origin','loaded','at_destination')
    ), 0) + 1;
  end if;
  return new;
end $f$;
create trigger operator_services_driver_queue_position_v1
  before insert or update of assigned_driver_id on public.operator_services
  for each row execute function app_private.set_driver_queue_position_v1();

-- Servicios abiertos de hoy: se ordenan por horario programado.
update public.operator_services s set driver_queue_position = q.pos
from (
  select service_id, row_number() over (partition by assigned_driver_id order by scheduled_for nulls last, created_at) pos
  from public.operator_services
  where assigned_driver_id is not null
    and status in ('pending','assigned','en_route','at_origin','loaded','at_destination')
) q
where q.service_id = s.service_id and s.driver_queue_position is null;

-- 3) Parches mínimos a las trabas actuales (cada uno falla si no encuentra el texto)
do $p$
declare d text; n text;
  procedure_patch constant text := 'parche multi_service_v1';
begin
  -- 3a) Control de Chofer/Móvil al asignar (trigger)
  d := pg_get_functiondef('app_private.validate_operator_service_resource_pair_v1'::regproc);
  n := replace(d,
    E'      and s.assigned_driver_id = new.assigned_driver_id\n  ) then\n    raise exception ''El Chofer ya está ocupado en otro servicio activo'';',
    E'      and s.assigned_driver_id = new.assigned_driver_id\n      and not app_private.multi_service_enabled_v1(new.assigned_driver_id)\n  ) then\n    raise exception ''El Chofer ya está ocupado en otro servicio activo'';');
  n := replace(n,
    E'      and s.assigned_truck_id = new.assigned_truck_id\n  ) then\n    raise exception ''El Móvil ya está ocupado en otro servicio activo'';',
    E'      and s.assigned_truck_id = new.assigned_truck_id\n      and not (app_private.multi_service_enabled_v1(new.assigned_driver_id) and s.assigned_driver_id is not distinct from new.assigned_driver_id)\n  ) then\n    raise exception ''El Móvil ya está ocupado en otro servicio activo'';');
  if (length(n) - length(d)) < 150 then raise exception '%: validate_operator_service_resource_pair_v1', procedure_patch; end if;
  execute n;

  -- 3b) Asignación rápida desde Estado
  d := pg_get_functiondef('public.set_operator_service_assignment_v2(uuid,uuid,integer)'::regprocedure);
  n := replace(d,
    'o.assigned_driver_id=p_driver_id) then raise exception ''El Chofer ya está ocupado en otro servicio activo'';',
    'o.assigned_driver_id=p_driver_id and not app_private.multi_service_enabled_v1(p_driver_id)) then raise exception ''El Chofer ya está ocupado en otro servicio activo'';');
  n := replace(n,
    'o.assigned_truck_id=p_truck_id) then raise exception ''El Móvil ya está ocupado en otro servicio activo'';',
    'o.assigned_truck_id=p_truck_id and not (app_private.multi_service_enabled_v1(p_driver_id) and o.assigned_driver_id is not distinct from p_driver_id)) then raise exception ''El Móvil ya está ocupado en otro servicio activo'';');
  if (length(n) - length(d)) < 150 then raise exception '%: set_operator_service_assignment_v2', procedure_patch; end if;
  execute n;

  -- 3c) Empezar el remito de un servicio asignado: sin "viaje en curso", pero en orden
  d := pg_get_functiondef('public.ensure_operator_service_trip_v2(uuid)'::regprocedure);
  n := replace(d,
    E'  if v_other is not null then\n    raise exception ''VIAJE_EN_CURSO:',
    E'  if v_other is not null and not app_private.multi_service_enabled_v1(v_uid) then\n    raise exception ''VIAJE_EN_CURSO:');
  n := replace(n,
    E'  select name into v_type from public.service_concepts where concept_id=s.primary_concept_id;',
    E'  if app_private.multi_service_enabled_v1(v_uid) then\n    select coalesce(nullif(btrim(o.service_order_number),''''),o.service_number) into v_type\n    from public.operator_services o\n    where o.assigned_driver_id=v_uid and o.service_id<>s.service_id\n      and o.status in (''assigned'',''at_origin'') and o.trip_id is null\n      and not app_private.service_driver_done_v1(o.service_id)\n      and coalesce(o.driver_queue_position,2147483647) < coalesce(s.driver_queue_position,2147483647)\n    order by o.driver_queue_position limit 1;\n    if v_type is not null then\n      raise exception ''COLA_EN_ORDEN: primero empezá el servicio %'', v_type;\n    end if;\n  end if;\n  select name into v_type from public.service_concepts where concept_id=s.primary_concept_id;');
  if (length(n) - length(d)) < 300 then raise exception '%: ensure_operator_service_trip_v2', procedure_patch; end if;
  execute n;

  -- 3d) Chofer avanza el estado del servicio
  d := pg_get_functiondef('public.advance_operator_service'::regproc);
  n := replace(d,
    E'    if v_other_trip is not null then\n      raise exception ''VIAJE_EN_CURSO: finalizá el viaje actual antes de iniciar otro servicio'';',
    E'    if v_other_trip is not null and not app_private.multi_service_enabled_v1(v_uid) then\n      raise exception ''VIAJE_EN_CURSO: finalizá el viaje actual antes de iniciar otro servicio'';');
  if n = d then raise exception '%: advance_operator_service', procedure_patch; end if;
  execute n;

  -- 3e) Operador cambia el estado desde la mesa
  d := pg_get_functiondef('public.transition_operator_service_from_desk'::regproc);
  n := replace(d,
    E'    if v_other_trip is not null then\n      raise exception ''VIAJE_EN_CURSO: el chofer ya tiene otro viaje en curso'';',
    E'    if v_other_trip is not null and not app_private.multi_service_enabled_v1(v_service.assigned_driver_id) then\n      raise exception ''VIAJE_EN_CURSO: el chofer ya tiene otro viaje en curso'';');
  if n = d then raise exception '%: transition_operator_service_from_desk', procedure_patch; end if;
  execute n;

  -- 3f) Servicio "en el camino" (sin asignación) con otro en curso
  d := pg_get_functiondef('public.save_driver_ad_hoc_remito_v1(jsonb,uuid)'::regprocedure);
  n := replace(d,
    'where s.assigned_driver_id=v_uid and s.status in (''assigned'',''at_origin'') and not app_private.service_driver_done_v1(s.service_id)',
    'where not app_private.multi_service_enabled_v1(v_uid) and s.assigned_driver_id=v_uid and s.status in (''assigned'',''at_origin'') and not app_private.service_driver_done_v1(s.service_id)');
  n := replace(n,
    'where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null',
    'where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null and (not app_private.multi_service_enabled_v1(v_uid) or (log_id=l.log_id and not exists(select 1 from public.operator_services os where os.trip_id=trips.trip_id) and not exists(select 1 from public.driver_service_intakes dx where dx.trip_id=trips.trip_id)))');
  if (length(n) - length(d)) < 250 then raise exception '%: save_driver_ad_hoc_remito_v1', procedure_patch; end if;
  execute n;

  -- 3g) "Mis servicios" en el orden de la cola
  d := pg_get_functiondef('public.get_driver_operator_queue_v2()'::regprocedure);
  n := replace(d,
    'jsonb_agg(row_data order by scheduled_for,created_at)',
    'jsonb_agg(row_data order by qpos nulls last,scheduled_for,created_at)');
  n := replace(n,
    'select s.scheduled_for,s.created_at,jsonb_build_object(',
    'select s.scheduled_for,s.created_at,case when app_private.multi_service_enabled_v1(v_uid) then s.driver_queue_position end qpos,jsonb_build_object(');
  n := replace(n,
    E'      ''service_id'',s.service_id,\n',
    E'      ''service_id'',s.service_id,\n      ''driver_queue_position'',s.driver_queue_position,\n      ''trip_started'',s.trip_id is not null,\n      ''multi_service'',app_private.multi_service_enabled_v1(v_uid),\n');
  n := replace(n,
    E'    order by s.scheduled_for,s.created_at\n    limit 20',
    E'    order by case when app_private.multi_service_enabled_v1(v_uid) then s.driver_queue_position end nulls last,s.scheduled_for,s.created_at\n    limit 20');
  if position('qpos nulls last' in n)=0 or position('trip_started' in n)=0 or position('qpos,jsonb_build_object' in n)=0
     or position('driver_queue_position end nulls last,s.scheduled_for' in n)=0 then
    raise exception '%: get_driver_operator_queue_v2', procedure_patch;
  end if;
  execute n;
end $p$;

-- 4) Operador sube o baja un servicio en la cola del chofer
create or replace function public.move_operator_service_queue_v1(p_service_id uuid, p_direction integer)
returns jsonb language plpgsql security definer set search_path to '' as $f$
declare
  s public.operator_services%rowtype;
  o public.operator_services%rowtype;
  v_pos integer;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then
    raise exception 'Solo Operador o Administración puede ordenar la cola';
  end if;
  if p_direction not in (-1, 1) then raise exception 'Dirección inválida'; end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is null then raise exception 'El servicio no tiene chofer asignado'; end if;
  if s.status not in ('assigned','at_origin') or s.trip_id is not null then
    raise exception 'Solo se puede mover un servicio que el chofer todavía no empezó';
  end if;
  select * into o from public.operator_services x
  where x.assigned_driver_id = s.assigned_driver_id and x.service_id <> s.service_id
    and x.status in ('assigned','at_origin') and x.trip_id is null
    and not app_private.service_driver_done_v1(x.service_id)
    and case when p_direction < 0 then x.driver_queue_position < s.driver_queue_position
             else x.driver_queue_position > s.driver_queue_position end
  order by case when p_direction < 0 then -x.driver_queue_position else x.driver_queue_position end
  limit 1 for update;
  if not found then
    return jsonb_build_object('service_id', s.service_id, 'driver_queue_position', s.driver_queue_position, 'moved', false);
  end if;
  v_pos := s.driver_queue_position;
  update public.operator_services set driver_queue_position = o.driver_queue_position, updated_by = auth.uid(), updated_at = now() where service_id = s.service_id;
  update public.operator_services set driver_queue_position = v_pos, updated_by = auth.uid(), updated_at = now() where service_id = o.service_id;
  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, details, created_by)
  values (s.service_id, 'queue_order', s.status, s.status,
    case when p_direction < 0 then 'Subido en la cola del chofer' else 'Bajado en la cola del chofer' end,
    jsonb_build_object('from_position', s.driver_queue_position, 'to_position', o.driver_queue_position, 'swapped_with', o.service_id),
    auth.uid());
  return jsonb_build_object('service_id', s.service_id, 'driver_queue_position', o.driver_queue_position, 'moved', true);
end $f$;
revoke all on function public.move_operator_service_queue_v1(uuid, integer) from public, anon;
grant execute on function public.move_operator_service_queue_v1(uuid, integer) to authenticated;
