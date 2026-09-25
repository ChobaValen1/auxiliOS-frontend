CREATE OR REPLACE FUNCTION public.transition_operator_service_v2(p_service_id uuid, p_action text, p_reason_code text DEFAULT NULL::text, p_reason_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_role text:=app_private.current_auxilios_role(); v_uid uuid:=auth.uid(); s public.operator_services%rowtype; v_action text:=lower(btrim(coalesce(p_action,''))); v_reason text:=lower(btrim(coalesce(p_reason_code,''))); v_detail text:=nullif(btrim(coalesce(p_reason_detail,'')),''); v_missing text[]; v_label text;
begin
  if v_role not in ('operador','administracion') or v_uid is null then raise exception 'Solo Operador o Administración puede cambiar el estado del servicio'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update; if not found then raise exception 'Servicio inexistente'; end if;
  if v_action in ('unarrive','unassign') then
    if s.driver_activated then raise exception 'Un activado debe finalizarse con su decisión de facturación'; end if;
    if exists(select 1 from public.remitos where remito_id=s.remito_id and (status in ('firmado','cerrado_admin') or firmado_at is not null or firma_imagen_url is not null)) then raise exception 'No se puede revertir la asignación o el arribo de un remito firmado'; end if;
    if v_action='unarrive' then
      if s.status<>'at_origin' then raise exception 'Solo un servicio ARRIBADO puede desarribarse'; end if;
      perform set_config('app.lifecycle_transition','unarrive',true);
      update public.operator_services set status='assigned',arrived_at=null,arrived_by=null,arrival_source=null,arrival_reason_code=null where service_id=p_service_id returning * into s;
    else
      if s.status<>'assigned' then raise exception 'Solo un servicio ASIGNADO puede quedar sin asignar'; end if;
      if s.trip_id is not null then update public.trips set fecha_hora_fin=coalesce(fecha_hora_fin,now()) where trip_id=s.trip_id; end if;
      if s.remito_id is not null then update public.remitos set status='anulado' where remito_id=s.remito_id and status='pendiente'; end if;
      perform set_config('app.assignment_reason','unassigned',true);
      update public.operator_services set status='pending',assigned_driver_id=null,assigned_truck_id=null,trip_id=null,remito_id=null,document_status='not_started' where service_id=p_service_id returning * into s;
    end if;
    insert into public.operator_service_events(service_id,event_type,notes,created_by,details) values(p_service_id,v_action,case when v_action='unarrive' then 'Arribo revertido por Operaciones' else 'Asignación retirada por Operaciones' end,v_uid,jsonb_build_object('status',s.status));
  elsif v_action='arrive_manual' then
    if s.status<>'assigned' then raise exception 'Solo un servicio ASIGNADO puede marcarse ARRIBADO manualmente'; end if;
    if v_reason not in ('client_cannot_or_will_not_sign','signature_technical_issue','operator_provider_confirmed') then raise exception 'Seleccioná el motivo del arribo sin firma'; end if;
    v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb); if cardinality(v_missing)>0 then raise exception 'No se puede marcar ARRIBADO. Faltan completar: %',array_to_string(v_missing,', '); end if;
    perform set_config('app.lifecycle_transition','manual_arrival',true); update public.operator_services set status='at_origin',arrived_at=now(),arrived_by=v_uid,arrival_source='manual_operator',arrival_reason_code=v_reason,updated_by=v_uid where service_id=p_service_id returning * into s;
  elsif v_action='finalize' then
    if s.driver_activated then raise exception 'Elegí si el activado se factura desde su pantalla de cierre'; end if;
    if s.document_status in ('submitted','approved') or exists(select 1 from public.remitos r where r.operator_service_id=p_service_id and (r.status in ('firmado','cerrado_admin') or r.firmado_at is not null or r.firma_imagen_url is not null)) then raise exception 'Revisá y finalizá el remito firmado desde Revisión y cierre'; end if;
    if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede finalizarse'; end if;
    if s.status='assigned' and nullif(btrim(coalesce(s.operator_notes,'')),'') is null then raise exception 'Para finalizar sin ARRIBADO completá Observaciones'; end if;
    v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb); if cardinality(v_missing)>0 then raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', '); end if;
    if s.trip_id is not null then update public.trips t set fecha_hora_fin=coalesce(t.fecha_hora_fin,now()),received_at=now(),sync_status='synced',km_traveled=coalesce((select r.km_reales from public.remitos r where r.remito_id=s.remito_id),t.km_traveled) where t.trip_id=s.trip_id; end if;
    perform set_config('app.lifecycle_transition','finalize',true); perform set_config('app.assignment_reason','finalized',true); update public.operator_services set status='completed',completed_at=now(),document_status='exception_approved',billing_status='pending',assigned_driver_id=null,assigned_truck_id=null,updated_by=v_uid where service_id=p_service_id returning * into s;
    insert into public.operator_service_events(service_id,event_type,notes,created_by,details) values(p_service_id,'manual_document_exception','Cierre manual sin remito firmado',v_uid,jsonb_build_object('document_status',s.document_status,'operator_notes',s.operator_notes,'arrival_reason_code',s.arrival_reason_code));
  elsif v_action='annul' then
    if s.status not in ('pending','assigned','at_origin') then raise exception 'El servicio ya no puede anularse desde Operaciones'; end if;
    if v_reason not in ('delay','within_authorized_window','cancelled_by_us','client_or_provider','other') then raise exception 'Seleccioná un motivo de anulación'; end if;
    if v_reason='other' and v_detail is null then raise exception 'Especificá el otro motivo de anulación'; end if;
    v_label:=case v_reason when 'delay' then 'Cancelado por demora' when 'within_authorized_window' then 'Cancelado dentro del tiempo autorizado' when 'cancelled_by_us' then 'Cancelado por nosotros' when 'client_or_provider' then 'Cancelado por el cliente / prestadora' else v_detail end;
    if s.trip_id is not null then update public.trips set fecha_hora_fin=coalesce(fecha_hora_fin,now()),received_at=now(),sync_status='synced' where trip_id=s.trip_id; end if;
    perform set_config('app.lifecycle_transition','annul',true); perform set_config('app.assignment_reason',v_reason,true); perform set_config('app.assignment_notes',v_detail,true); update public.operator_services set status='cancelled',cancelled_at=now(),billing_status='not_ready',cancellation_reason_code=v_reason,cancellation_reason_detail=case when v_reason='other' then v_detail else null end,cancellation_reason=v_label,assigned_driver_id=null,assigned_truck_id=null,updated_by=v_uid where service_id=p_service_id returning * into s;
  else raise exception 'Acción de estado inválida'; end if;
  return jsonb_build_object('service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,'vehicle_plate',s.vehicle_plate,'status',s.status,'billing_status',s.billing_status,'arrived_at',s.arrived_at,'completed_at',s.completed_at,'cancelled_at',s.cancelled_at);
end;
$function$
;
