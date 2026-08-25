-- AuxiliOS · Chofer completa sólo datos operativos del servicio asignado antes de firmar.
create or replace function public.complete_driver_operator_service_fields_v2(
  p_service_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_service public.operator_services%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_missing text[];
  v_changed jsonb:='{}'::jsonb;
  v_value text;
begin
  if v_role<>'chofer' or v_uid is null then
    raise exception 'Solo el chofer asignado puede completar estos datos';
  end if;

  select * into v_service
  from public.operator_services
  where service_id=p_service_id
  for update;

  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;
  if v_service.status<>'assigned' then
    raise exception 'Los datos del servicio sólo pueden completarse antes del ARRIBADO';
  end if;

  v_before:=jsonb_build_object(
    'customer_name',v_service.customer_name,
    'customer_phone',v_service.customer_phone,
    'customer_email',v_service.customer_email,
    'vehicle_plate',v_service.vehicle_plate,
    'vehicle_make_model',v_service.vehicle_make_model,
    'origin',v_service.origin,
    'destination',v_service.destination,
    'operator_notes',v_service.operator_notes,
    'driver_instructions',v_service.driver_instructions,
    'purchase_order_number',v_service.purchase_order_number
  );

  perform set_config('app.phase3_bridge','1',true);

  update public.operator_services
  set customer_name=case when p_payload ? 'customer_name' and nullif(btrim(p_payload->>'customer_name'),'') is not null then btrim(p_payload->>'customer_name') else customer_name end,
      customer_phone=case when p_payload ? 'customer_phone' and nullif(btrim(p_payload->>'customer_phone'),'') is not null then btrim(p_payload->>'customer_phone') else customer_phone end,
      customer_email=case when p_payload ? 'customer_email' and nullif(btrim(p_payload->>'customer_email'),'') is not null then lower(btrim(p_payload->>'customer_email')) else customer_email end,
      vehicle_plate=case when p_payload ? 'vehicle_plate' and nullif(btrim(p_payload->>'vehicle_plate'),'') is not null then upper(btrim(p_payload->>'vehicle_plate')) else vehicle_plate end,
      vehicle_make_model=case when p_payload ? 'vehicle_make_model' and nullif(btrim(p_payload->>'vehicle_make_model'),'') is not null then btrim(p_payload->>'vehicle_make_model') else vehicle_make_model end,
      origin=case when p_payload ? 'origin' and nullif(btrim(p_payload->>'origin'),'') is not null then btrim(p_payload->>'origin') else origin end,
      destination=case when p_payload ? 'destination' and nullif(btrim(p_payload->>'destination'),'') is not null then btrim(p_payload->>'destination') else destination end,
      operator_notes=case when p_payload ? 'operator_notes' and nullif(btrim(p_payload->>'operator_notes'),'') is not null then btrim(p_payload->>'operator_notes') else operator_notes end,
      driver_instructions=case when p_payload ? 'driver_instructions' and nullif(btrim(p_payload->>'driver_instructions'),'') is not null then btrim(p_payload->>'driver_instructions') else driver_instructions end,
      purchase_order_number=case when p_payload ? 'purchase_order_number' and nullif(btrim(p_payload->>'purchase_order_number'),'') is not null then btrim(p_payload->>'purchase_order_number') else purchase_order_number end,
      updated_by=v_uid
  where service_id=p_service_id
  returning * into v_service;

  v_after:=jsonb_build_object(
    'customer_name',v_service.customer_name,
    'customer_phone',v_service.customer_phone,
    'customer_email',v_service.customer_email,
    'vehicle_plate',v_service.vehicle_plate,
    'vehicle_make_model',v_service.vehicle_make_model,
    'origin',v_service.origin,
    'destination',v_service.destination,
    'operator_notes',v_service.operator_notes,
    'driver_instructions',v_service.driver_instructions,
    'purchase_order_number',v_service.purchase_order_number
  );

  if v_before is distinct from v_after then
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
    values(
      p_service_id,'driver_completion',v_service.status,v_service.status,
      'Chofer completó datos obligatorios antes de la firma',v_uid,
      jsonb_build_object('before',v_before,'after',v_after)
    );
  end if;

  v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
  return jsonb_build_object(
    'service_id',v_service.service_id,
    'valid',cardinality(v_missing)=0,
    'missing',to_jsonb(v_missing)
  );
end;
$function$;

revoke all on function public.complete_driver_operator_service_fields_v2(uuid,jsonb) from public, anon;
grant execute on function public.complete_driver_operator_service_fields_v2(uuid,jsonb) to authenticated;
