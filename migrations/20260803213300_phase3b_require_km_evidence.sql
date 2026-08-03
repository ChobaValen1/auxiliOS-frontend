-- AuxiliOS Phase 3B · Evidencia obligatoria para activaciones con kilómetros

create or replace function public.close_operator_service_exception(
  p_service_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_assignment_id uuid;
  v_moment text := lower(coalesce(nullif(btrim(p_payload->>'event_moment'), ''), ''));
  v_reason_code text := lower(coalesce(nullif(btrim(p_payload->>'reason_code'), ''), 'other'));
  v_reason_text text := coalesce(nullif(btrim(p_payload->>'reason_text'), ''), '');
  v_informed_by text := nullif(btrim(p_payload->>'informed_by'), '');
  v_location text := nullif(btrim(p_payload->>'location_text'), '');
  v_km numeric := greatest(coalesce(nullif(p_payload->>'km_recognized', '')::numeric, 0), 0);
  v_evidence text[] := coalesce(
    array(select jsonb_array_elements_text(coalesce(p_payload->'evidence_urls', '[]'::jsonb))),
    '{}'::text[]
  );
  v_incident_evidence integer := 0;
  v_evidence_count integer := 0;
  v_result text;
  v_billing text;
  v_closure public.operator_service_closures%rowtype;
begin
  if v_uid is null
     or v_role not in ('chofer','administracion','operador','supervision') then
    raise exception 'Sin permiso para cerrar el servicio';
  end if;

  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;
  if v_service.status in ('completed','cancelled') then
    raise exception 'El servicio ya está cerrado';
  end if;
  if v_role = 'chofer'
     and v_service.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;
  if v_moment not in (
    'before_departure','en_route','at_origin','after_load','truck_failure'
  ) then
    raise exception 'Indicá en qué momento no se pudo completar el servicio';
  end if;
  if v_reason_text = '' then
    raise exception 'Explicá brevemente qué ocurrió';
  end if;

  v_result := case
    when v_moment = 'truck_failure' then 'truck_failure'
    when v_moment = 'before_departure' then 'cancelled_without_activation'
    when v_moment = 'at_origin' then 'activated_origin'
    when v_moment = 'after_load' and v_km > 0 then 'activated_km'
    when v_moment = 'after_load' then 'activated_origin'
    when v_moment = 'en_route' and v_km > 0 then 'activated_km'
    when v_moment = 'en_route' then 'activated_movement'
    else case
      when v_service.status = 'at_origin' then 'activated_origin'
      when v_service.status in ('loaded','at_destination') and v_km > 0 then 'activated_km'
      when v_service.status in ('en_route','loaded','at_destination') then 'activated_movement'
      else 'cancelled_without_activation'
    end
  end;

  if v_service.trip_id is not null then
    select coalesce(sum(cardinality(i.photo_urls)), 0)::integer
    into v_incident_evidence
    from public.incidents i
    where i.trip_id = v_service.trip_id;
  end if;
  v_evidence_count := coalesce(cardinality(v_evidence), 0) + coalesce(v_incident_evidence, 0);

  if v_role = 'chofer'
     and v_result in ('activated_origin','truck_failure','activated_km')
     and v_evidence_count = 0 then
    raise exception
      'EVIDENCIA_REQUERIDA: reportá un incidente y adjuntá al menos una foto antes de cerrar este caso';
  end if;

  v_billing := case v_result
    when 'truck_failure' then 'non_billable'
    when 'activated_km' then 'billable_km'
    when 'activated_origin' then 'billable_origin'
    when 'activated_movement' then 'billable_movement'
    else 'pending_review'
  end;

  select a.assignment_id
  into v_assignment_id
  from public.operator_service_assignments a
  where a.service_id = p_service_id
    and a.status = 'active'
  order by a.assignment_sequence desc
  limit 1;

  insert into public.operator_service_closures(
    service_id, assignment_id, result_code, event_moment,
    reason_code, reason_text, informed_by, location_text,
    latitude, longitude, km_recognized, evidence_urls,
    evidence_count, billing_status, signature_required,
    remito_required, closed_by, is_test
  )
  values (
    p_service_id, v_assignment_id, v_result, v_moment,
    v_reason_code, v_reason_text, v_informed_by, v_location,
    nullif(p_payload->>'latitude', '')::numeric,
    nullif(p_payload->>'longitude', '')::numeric,
    v_km, v_evidence, v_evidence_count, v_billing,
    false, false, v_uid, v_service.is_test
  )
  returning * into v_closure;

  if v_service.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin, now()),
        km_traveled = case
          when v_km > 0 then round(v_km)::integer
          else km_traveled
        end,
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Cierre operativo: ' || v_result,
          v_reason_text
        ),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = v_service.trip_id;
  end if;

  perform set_config('app.phase3_bridge', '1', true);
  perform set_config('app.assignment_reason', v_result, true);
  perform set_config('app.assignment_notes', v_reason_text, true);

  update public.operator_services
  set status = 'cancelled',
      cancellation_reason = concat(v_result, ': ', v_reason_text),
      cancelled_at = now(),
      driver_notes = case when v_role = 'chofer' then v_reason_text else driver_notes end,
      updated_by = v_uid
  where service_id = p_service_id;

  insert into public.operator_service_events(
    service_id, event_type, from_status, to_status, notes, created_by
  )
  values (
    p_service_id,
    'operational_closure',
    v_service.status,
    'cancelled',
    concat_ws(
      ' · ',
      'Resultado: ' || v_result,
      'Momento: ' || v_moment,
      'Motivo: ' || v_reason_code,
      v_reason_text,
      case when v_km > 0 then 'KM: ' || v_km::text end
    ),
    v_uid
  );

  return jsonb_build_object(
    'service_id', p_service_id,
    'status', 'cancelled',
    'closure_id', v_closure.closure_id,
    'result_code', v_result,
    'billing_status', v_billing,
    'evidence_count', v_evidence_count
  );
end;
$function$;

revoke all on function public.close_operator_service_exception(uuid,jsonb) from public, anon;
grant execute on function public.close_operator_service_exception(uuid,jsonb) to authenticated;
