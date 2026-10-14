create or replace function public.mark_driver_ad_hoc_draft_activated_v1(
  p_remito_id integer,
  p_reason_code text,
  p_reason_detail text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  v_reason text := lower(btrim(coalesce(p_reason_code,'')));
  v_detail text := nullif(btrim(coalesce(p_reason_detail,'')),'');
  r public.remitos%rowtype;
  i public.driver_service_intakes%rowtype;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Sólo el Chofer puede marcar este ingreso como ACTIVADO';
  end if;
  if v_reason not in ('absent_or_not_towable','provider','us','other') then
    raise exception 'Seleccioná un motivo de cancelación';
  end if;
  if v_reason = 'other' and v_detail is null then
    raise exception 'Especificá el motivo';
  end if;

  select * into r from public.remitos
  where remito_id=p_remito_id and driver_id=v_uid
    and status='pendiente' and document_source='driver_ad_hoc'
    and operator_service_id is null
  for update;
  if not found then raise exception 'El borrador ya no está disponible'; end if;

  select * into i from public.driver_service_intakes
  where intake_id=r.driver_intake_id and driver_id=v_uid
  for update;
  if not found or i.status <> 'pending_admin' then
    raise exception 'El ingreso ya fue resuelto por Operaciones';
  end if;

  update public.remitos
  set status='anulado', sync_status='synced',
      observaciones=concat_ws(E'\n',nullif(observaciones,''),'ACTIVADO: '||coalesce(v_detail,v_reason))
  where remito_id=r.remito_id;

  update public.driver_service_intakes
  set status='rejected', document_status='rejected',
      driver_notes=concat_ws(E'\n',nullif(driver_notes,''),'ACTIVADO: '||coalesce(v_detail,v_reason)),
      updated_at=now()
  where intake_id=i.intake_id;

  update public.trips
  set fecha_hora_fin=coalesce(fecha_hora_fin,greatest(now(),fecha_hora_inicio)),
      received_at=now(),sync_status='synced'
  where trip_id=i.trip_id;

  insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
  values(i.intake_id,'rejected','Chofer marcó el ingreso como ACTIVADO',v_uid,
    jsonb_build_object('reason_code',v_reason,'reason_detail',v_detail,'remito_id',r.remito_id));

  return jsonb_build_object('remito_id',r.remito_id,'intake_id',i.intake_id,'status','anulado','business_status','activated');
end;
$$;

revoke all on function public.mark_driver_ad_hoc_draft_activated_v1(integer,text,text) from public,anon;
grant execute on function public.mark_driver_ad_hoc_draft_activated_v1(integer,text,text) to authenticated;
