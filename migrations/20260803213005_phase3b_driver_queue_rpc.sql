-- AuxiliOS Phase 3B · part 6/7
create or replace function public.get_driver_operator_queue()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_role <> 'chofer' or v_uid is null then
    raise exception 'Solo los choferes pueden consultar esta cola';
  end if;

  select coalesce(jsonb_agg(row_data order by scheduled_for, created_at), '[]'::jsonb)
  into v_result
  from (
    select
      s.scheduled_for,
      s.created_at,
      jsonb_build_object(
        'service_id', s.service_id,
        'service_number', s.service_number,
        'service_order_number', s.service_order_number,
        'status', s.status,
        'priority', s.priority,
        'scheduled_for', s.scheduled_for,
        'estimated_arrival_at', s.estimated_arrival_at,
        'estimated_finish_at', s.estimated_finish_at,
        'company_name', coalesce(c.trade_name, c.legal_name),
        'concept_name', sc.name,
        'concept_icon', sc.icon,
        'customer_name', s.customer_name,
        'customer_phone', s.customer_phone,
        'vehicle_plate', s.vehicle_plate,
        'vehicle_make_model', s.vehicle_make_model,
        'origin', s.origin,
        'destination', s.destination,
        'driver_instructions', s.driver_instructions,
        'assigned_truck_id', s.assigned_truck_id,
        'truck_label', coalesce(t.numero_interno, t.plate),
        'trip_id', s.trip_id,
        'remito_id', s.remito_id,
        'journey_log_id', tr.log_id,
        'trip_started_at', tr.fecha_hora_inicio,
        'trip_finished_at', tr.fecha_hora_fin,
        'remito_number', r.nro_remito,
        'remito_status', r.status,
        'current_assignment_id', (
          select a.assignment_id
          from public.operator_service_assignments a
          where a.service_id = s.service_id
            and a.status = 'active'
          order by a.assignment_sequence desc
          limit 1
        ),
        'is_test', s.is_test,
        'can_close_exception', true,
        'incident_count', (
          select count(*)::integer
          from public.incidents i
          where i.trip_id = s.trip_id
        ),
        'evidence_count', (
          select coalesce(sum(cardinality(i.photo_urls)), 0)::integer
          from public.incidents i
          where i.trip_id = s.trip_id
        )
      ) as row_data
    from public.operator_services s
    join public.companies c on c.company_id = s.company_id
    left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
    left join public.trucks t on t.truck_id = s.assigned_truck_id
    left join public.trips tr on tr.trip_id = s.trip_id
    left join public.remitos r on r.remito_id = s.remito_id
    where s.assigned_driver_id = v_uid
      and s.status not in ('completed','cancelled')
    order by s.scheduled_for, s.created_at
    limit 20
  ) q;

  return v_result;
end;
$function$;
