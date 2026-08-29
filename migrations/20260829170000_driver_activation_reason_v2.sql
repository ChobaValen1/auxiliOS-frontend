-- AuxiliOS · ACTIVADO del Chofer con motivo de cancelación obligatorio.
-- Conserva v1 para clientes cacheados y expone v2 al flujo actualizado.

create or replace function public.mark_driver_operator_service_activated_v2(
  p_service_id uuid,
  p_reason_code text,
  p_reason_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_reason_code text := btrim(coalesce(p_reason_code,''));
  v_reason_detail text := nullif(btrim(coalesce(p_reason_detail,'')),'');
  v_reason_label text;
  v_reason_text text;
  v_draft_voided boolean := false;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Solo el Chofer asignado puede marcar un servicio como ACTIVADO';
  end if;

  if v_reason_code not in ('delay','client_or_provider','cancelled_by_us','other') then
    raise exception 'Seleccioná un motivo de cancelación válido';
  end if;
  if v_reason_code = 'other' and v_reason_detail is null then
    raise exception 'Especificá el otro motivo de cancelación';
  end if;
  if length(coalesce(v_reason_detail,'')) > 500 then
    raise exception 'El detalle del motivo no puede superar 500 caracteres';
  end if;

  v_reason_label := case v_reason_code
    when 'delay' then 'Cancelado por demora'
    when 'client_or_provider' then 'Cancelado por cliente / prestadora'
    when 'cancelled_by_us' then 'Cancelado por nosotros'
    else 'Otro motivo'
  end;
  v_reason_text := concat_ws(' · ',v_reason_label,v_reason_detail);

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

  perform set_config('app.phase3_bridge','1',true);

  if s.remito_id is not null then
    select * into r
    from public.remitos
    where remito_id = s.remito_id
      and operator_service_id = s.service_id
    for update;

    if not found then
      raise exception 'El remito vinculado al servicio no es válido';
    end if;
    if r.status <> 'pendiente' or r.firma_imagen_url is not null or r.firmado_at is not null then
      raise exception 'El servicio tiene un remito finalizado y no puede marcarse como ACTIVADO';
    end if;

    update public.remitos
    set status = 'anulado',
        sync_status = 'synced',
        received_at = now(),
        observaciones = concat_ws(E'\n',nullif(observaciones,''),'Borrador anulado al marcar el servicio como ACTIVADO.')
    where remito_id = r.remito_id;
    v_draft_voided := true;
  end if;

  if s.trip_id is not null then
    update public.trips
    set fecha_hora_fin = coalesce(fecha_hora_fin,now()),
        received_at = now(),
        sync_status = 'synced'
    where trip_id = s.trip_id;
  end if;

  perform set_config('app.lifecycle_transition','annul',true);
  perform set_config('app.assignment_reason','other',true);
  perform set_config('app.assignment_notes','ACTIVADO · ' || v_reason_text,true);

  update public.operator_services
  set status = 'cancelled',
      cancelled_at = now(),
      document_status = case when v_draft_voided then 'not_started' else document_status end,
      billing_status = 'not_ready',
      cancellation_reason_code = v_reason_code,
      cancellation_reason_detail = v_reason_detail,
      cancellation_reason = 'ACTIVADO · ' || v_reason_text,
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
    'cancelled_at',s.cancelled_at,
    'cancellation_reason_code',s.cancellation_reason_code,
    'cancellation_reason_detail',s.cancellation_reason_detail,
    'cancellation_reason',s.cancellation_reason,
    'draft_remito_voided',v_draft_voided
  );
end;
$function$;

revoke all on function public.mark_driver_operator_service_activated_v2(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mark_driver_operator_service_activated_v2(uuid,text,text) to authenticated;
