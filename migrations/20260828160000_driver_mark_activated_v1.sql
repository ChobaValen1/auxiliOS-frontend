-- AuxiliOS · Chofer marca ACTIVADO (cancelado / no realizado) sin completar remito.
-- La etiqueta visible es de negocio; el estado canónico continúa siendo cancelled.

create or replace function public.mark_driver_operator_service_activated_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Solo el Chofer asignado puede marcar un servicio como ACTIVADO';
  end if;

  select * into s
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este Chofer';
  end if;
  if s.status <> 'assigned' then
    raise exception 'Solo un servicio ASIGNADO puede marcarse como ACTIVADO';
  end if;
  if s.remito_id is not null then
    raise exception 'El servicio ya tiene un remito y no puede marcarse como ACTIVADO';
  end if;

  if s.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin,now()),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = s.trip_id;
  end if;

  perform set_config('app.phase3_bridge','1',true);
  perform set_config('app.lifecycle_transition','annul',true);
  perform set_config('app.assignment_reason','other',true);
  perform set_config('app.assignment_notes','Marcado ACTIVADO por el Chofer',true);

  update public.operator_services
  set status = 'cancelled',
      cancelled_at = now(),
      billing_status = 'not_ready',
      cancellation_reason_code = 'other',
      cancellation_reason_detail = 'Marcado ACTIVADO por el Chofer',
      cancellation_reason = 'ACTIVADO · Servicio cancelado o no realizado',
      assigned_driver_id = null,
      assigned_truck_id = null,
      updated_by = v_uid
  where service_id = p_service_id
  returning * into s;

  return jsonb_build_object(
    'service_id',s.service_id,
    'service_order_number',s.service_order_number,
    'status',s.status,
    'business_status','activated',
    'billing_status',s.billing_status,
    'cancelled_at',s.cancelled_at
  );
end;
$function$;

revoke all on function public.mark_driver_operator_service_activated_v1(uuid) from public,anon,authenticated;
grant execute on function public.mark_driver_operator_service_activated_v1(uuid) to authenticated;
