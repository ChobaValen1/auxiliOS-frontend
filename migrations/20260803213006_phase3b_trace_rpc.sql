-- AuxiliOS Phase 3B · part 7/7
create or replace function public.get_operator_service_trace(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_assignments jsonb;
  v_closure jsonb;
  v_result jsonb;
begin
  select *
  into v_service
  from public.operator_services
  where service_id = p_service_id;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  if v_role = 'chofer' then
    if v_service.assigned_driver_id is distinct from v_uid then
      raise exception 'Sin permiso para consultar la trazabilidad';
    end if;
  elsif v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la trazabilidad';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'assignment_id', a.assignment_id,
        'sequence', a.assignment_sequence,
        'status', a.status,
        'driver_id', a.driver_id,
        'driver_name', u.full_name,
        'truck_id', a.truck_id,
        'truck_label', coalesce(t.numero_interno, t.plate),
        'assigned_at', a.assigned_at,
        'started_at', a.started_at,
        'released_at', a.released_at,
        'release_reason_code', a.release_reason_code,
        'release_notes', a.release_notes,
        'trip', case when tr.trip_id is null then null else jsonb_build_object(
          'trip_id', tr.trip_id,
          'log_id', tr.log_id,
          'started_at', tr.fecha_hora_inicio,
          'finished_at', tr.fecha_hora_fin,
          'km_traveled', tr.km_traveled,
          'sync_status', tr.sync_status,
          'incidents', coalesce((
            select jsonb_agg(jsonb_build_object(
              'incident_id', i.incident_id,
              'type', i.type,
              'severity', i.severity,
              'description', i.description,
              'location', i.location,
              'photo_count', coalesce(cardinality(i.photo_urls), 0),
              'created_at', i.created_at
            ) order by i.created_at)
            from public.incidents i
            where i.trip_id = tr.trip_id
          ), '[]'::jsonb),
          'remitos', coalesce((
            select jsonb_agg(jsonb_build_object(
              'remito_id', rr.remito_id,
              'nro_remito', rr.nro_remito,
              'status', rr.status,
              'signed_at', rr.firmado_at,
              'km_reales', rr.km_reales,
              'photo_count', coalesce(cardinality(rr.foto_urls), 0),
              'has_signature', rr.firma_imagen_url is not null
            ) order by rr.created_at)
            from public.remitos rr
            where rr.trip_id = tr.trip_id
          ), '[]'::jsonb)
        ) end,
        'is_test', a.is_test
      )
      order by a.assignment_sequence
    ),
    '[]'::jsonb
  )
  into v_assignments
  from public.operator_service_assignments a
  join public.users u on u.user_id = a.driver_id
  join public.trucks t on t.truck_id = a.truck_id
  left join public.trips tr on tr.trip_id = a.trip_id
  where a.service_id = p_service_id;

  select case when c.closure_id is null then null else jsonb_build_object(
    'closure_id', c.closure_id,
    'assignment_id', c.assignment_id,
    'result_code', c.result_code,
    'event_moment', c.event_moment,
    'reason_code', c.reason_code,
    'reason_text', c.reason_text,
    'informed_by', c.informed_by,
    'location_text', c.location_text,
    'latitude', c.latitude,
    'longitude', c.longitude,
    'km_recognized', c.km_recognized,
    'evidence_urls', c.evidence_urls,
    'evidence_count', c.evidence_count,
    'billing_status', c.billing_status,
    'billing_notes', c.billing_notes,
    'billing_reviewed_at', c.billing_reviewed_at,
    'closed_at', c.closed_at,
    'is_test', c.is_test
  ) end
  into v_closure
  from public.operator_service_closures c
  where c.service_id = p_service_id;

  select jsonb_build_object(
    'service_id', v_service.service_id,
    'service_number', v_service.service_number,
    'status', v_service.status,
    'is_test', v_service.is_test,
    'trip', case when tr.trip_id is null then null else jsonb_build_object(
      'trip_id', tr.trip_id,
      'log_id', tr.log_id,
      'started_at', tr.fecha_hora_inicio,
      'finished_at', tr.fecha_hora_fin,
      'km_traveled', tr.km_traveled,
      'sync_status', tr.sync_status
    ) end,
    'journey', case when dl.log_id is null then null else jsonb_build_object(
      'log_id', dl.log_id,
      'log_date', dl.log_date,
      'status', dl.status,
      'km_inicio', dl.km_inicio,
      'km_final', dl.km_final,
      'truck_id', dl.truck_id
    ) end,
    'remito', case when r.remito_id is null then null else jsonb_build_object(
      'remito_id', r.remito_id,
      'nro_remito', r.nro_remito,
      'status', r.status,
      'signed_at', r.firmado_at,
      'km_reales', r.km_reales,
      'photo_count', coalesce(cardinality(r.foto_urls), 0),
      'has_signature', r.firma_imagen_url is not null
    ) end,
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'incident_id', i.incident_id,
        'type', i.type,
        'severity', i.severity,
        'description', i.description,
        'location', i.location,
        'photo_count', coalesce(cardinality(i.photo_urls), 0),
        'created_at', i.created_at
      ) order by i.created_at desc)
      from public.incidents i
      where i.trip_id = tr.trip_id
    ), '[]'::jsonb),
    'assignments', v_assignments,
    'closure', v_closure
  )
  into v_result
  from public.operator_services s
  left join public.trips tr on tr.trip_id = s.trip_id
  left join public.daily_logs dl on dl.log_id = tr.log_id
  left join public.remitos r on r.remito_id = s.remito_id
  where s.service_id = p_service_id;

  return v_result;
end;
$function$;

revoke all on function public.reassign_operator_service(uuid,uuid,integer,text,text) from public, anon;
grant execute on function public.reassign_operator_service(uuid,uuid,integer,text,text) to authenticated;

revoke all on function public.close_operator_service_exception(uuid,jsonb) from public, anon;
grant execute on function public.close_operator_service_exception(uuid,jsonb) to authenticated;

revoke all on function public.review_operator_service_closure(uuid,text,text) from public, anon;
grant execute on function public.review_operator_service_closure(uuid,text,text) to authenticated;

revoke all on function public.get_driver_operator_queue() from public, anon;
grant execute on function public.get_driver_operator_queue() to authenticated;

revoke all on function public.get_operator_service_trace(uuid) from public, anon;
grant execute on function public.get_operator_service_trace(uuid) to authenticated;

revoke all on function app_private.operator_service_mark_test() from public;
revoke all on function app_private.operator_service_validate_order() from public;
revoke all on function app_private.sync_operator_service_assignment() from public;
