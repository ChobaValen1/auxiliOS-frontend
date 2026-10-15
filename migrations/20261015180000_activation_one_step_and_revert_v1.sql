-- Activado en un paso y Revertir activado · 15/10/2026
-- 1) activation_prev_km / activation_prev_status: guardan cómo estaba el servicio antes del activado, para poder revertirlo.
-- 2) activate_and_finalize_service_v1: motivo + tipo (Origen/Movida) + km + hora de fin en una sola transacción.
-- 3) revert_operator_service_activation_v1: vuelve el servicio a como estaba (Asignado o Arribado, con su chofer y móvil y sus km).
alter table public.operator_services add column if not exists activation_prev_km jsonb;
alter table public.operator_services add column if not exists activation_prev_status text;

-- El trigger deja reabrir un activado finalizado solo dentro de la reversión.
do $$
declare d text:=pg_get_functiondef('app_private.operator_services_before_update'::regproc); n text;
begin
  n:=replace(d,$a$v_billing_admin boolean:=coalesce(current_setting('app.billing_admin_transition',true),'')='annul_completed';$a$,
    $a$v_billing_admin boolean:=coalesce(current_setting('app.billing_admin_transition',true),'')='annul_completed';
  v_revert boolean:=coalesce(current_setting('app.activation_revert',true),'')='1' and coalesce(app_private.current_auxilios_role(),'') in ('operador','administracion');$a$);
  n:=replace(n,$a$if old.driver_activated and (new.assigned_driver_id is not null or new.assigned_truck_id is not null) then$a$,
    $a$if old.driver_activated and not v_revert and (new.assigned_driver_id is not null or new.assigned_truck_id is not null) then$a$);
  n:=replace(n,$a$if old.status in ('completed','cancelled') and new.status is distinct from old.status then$a$,
    $a$if old.status in ('completed','cancelled') and new.status is distinct from old.status and not (v_revert and old.status='completed' and old.driver_activated) then$a$);
  if n=d or (length(n)-length(d))<200 then raise exception 'No se pudo parchear operator_services_before_update'; end if;
  execute n;
end $$;

-- Al finalizar con km del activado se guardan antes los km originales.
do $$
declare d text:=pg_get_functiondef('public.finalize_operator_service_at_v1'::regproc); n text;
begin
  n:=replace(d,$a$   PERFORM app_private.update_operator_service_administrative_core_v1(p_service_id,$a$,
    $a$   UPDATE public.operator_services SET activation_prev_km=coalesce(activation_prev_km,jsonb_build_object('asphalt',estimated_asphalt_km,'gravel',estimated_gravel_km)) WHERE service_id=p_service_id;
   PERFORM app_private.update_operator_service_administrative_core_v1(p_service_id,$a$);
  if n=d then raise exception 'No se pudo parchear finalize_operator_service_at_v1'; end if;
  execute n;
end $$;

create or replace function public.activate_and_finalize_service_v1(
  p_service_id uuid, p_reason_code text, p_reason_detail text, p_kind text, p_km numeric, p_finished_at timestamptz)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.operator_services%rowtype; prior_arrival timestamptz; result jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para activar servicios'; end if;
  if p_kind not in ('origin','movement') then raise exception 'Elegí Activado Origen o Activado Movida'; end if;
  if p_km is null or p_km<0 then raise exception 'Indicá los kilómetros del activado'; end if;
  if p_finished_at is null or not isfinite(p_finished_at) then raise exception 'Indicá la hora de fin'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.driver_activated then raise exception 'El servicio ya está activado'; end if;
  prior_arrival:=s.arrived_at;
  perform public.mark_operator_service_activated_v4(p_service_id,p_reason_code,p_reason_detail);
  update public.operator_services set activation_prev_status=s.status,
    arrived_at=case when prior_arrival is null then least(arrived_at,p_finished_at) else arrived_at end
  where service_id=p_service_id;
  result:=public.finalize_operator_service_at_v1(p_service_id,p_finished_at,'activated',
    jsonb_build_object('billable',true,'activation_kind',p_kind,'activation_km',round(p_km,1)));
  return result||jsonb_build_object('business_status','activated','activation_kind',p_kind,'activation_km',round(p_km,1));
end $function$;
revoke all on function public.activate_and_finalize_service_v1(uuid,text,text,text,numeric,timestamptz) from public, anon;
grant execute on function public.activate_and_finalize_service_v1(uuid,text,text,text,numeric,timestamptz) to authenticated;

create or replace function public.revert_operator_service_activation_v1(p_service_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.operator_services%rowtype; uid uuid:=auth.uid(); prior text; orig text; restored boolean:=true; note text; km_restored boolean:=false;
begin
  if uid is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para revertir activados'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if not s.driver_activated then raise exception 'El servicio no está activado'; end if;
  orig:=s.status;
  if s.status='cancelled' then raise exception 'El servicio está anulado'; end if;
  if s.status='completed' and s.billing_status not in ('pending','not_ready','excluded') then raise exception 'El activado ya pasó por Facturación y no se puede revertir'; end if;
  if exists(select 1 from public.operator_invoice_services x where x.service_id=p_service_id) then raise exception 'El activado ya está en una factura y no se puede revertir'; end if;
  if exists(select 1 from public.service_payments x where x.service_id=p_service_id) then raise exception 'El activado tiene cobros registrados y no se puede revertir'; end if;
  prior:=coalesce(s.activation_prev_status,
    (select e.from_status from public.operator_service_events e where e.service_id=p_service_id and e.event_type='service_activated' order by e.created_at desc limit 1));
  if prior is null then raise exception 'Este activado lo cargó el chofer como servicio nuevo: no hay un estado anterior al que volver. Anulalo si no corresponde.'; end if;
  if prior not in ('assigned','at_origin') then prior:='assigned'; end if;
  perform set_config('app.phase3_bridge','1',true);
  perform set_config('app.activation_revert','1',true);
  perform set_config('app.assignment_reason','activation_reverted',true);
  update public.operator_services set driver_activated=false,status=prior,
    activation_driver_id=null,activation_truck_id=null,activated_at=null,activated_by=null,
    activation_billing=null,activation_billing_reason=null,activation_reviewed_by=null,activation_reviewed_at=null,
    activation_kind=null,activation_km=null,activation_prev_status=null,
    cancellation_reason_code=null,cancellation_reason_detail=null,cancellation_reason=null,
    completed_at=null,billing_status='not_ready',document_status='not_started',remito_id=null,trip_id=null,
    arrived_at=case when prior='at_origin' then arrived_at else null end,updated_by=uid
  where service_id=p_service_id;
  begin
    update public.operator_services set assigned_driver_id=s.activation_driver_id,assigned_truck_id=s.activation_truck_id
    where service_id=p_service_id and s.activation_driver_id is not null and s.activation_truck_id is not null;
    if s.activation_driver_id is null or s.activation_truck_id is null then raise exception 'Sin chofer y móvil registrados'; end if;
  exception when others then
    restored:=false; note:=sqlerrm;
    update public.operator_services set status='pending',arrived_at=null where service_id=p_service_id;
  end;
  if s.activation_prev_km is not null then
    perform app_private.update_operator_service_administrative_core_v1(p_service_id,
      jsonb_build_object('estimated_asphalt_km',coalesce((s.activation_prev_km->>'asphalt')::numeric,0),'estimated_gravel_km',coalesce((s.activation_prev_km->>'gravel')::numeric,0)),
      'Activado revertido: vuelven los km originales');
    km_restored:=true;
  end if;
  update public.operator_services set activation_prev_km=null where service_id=p_service_id returning * into s;
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'activation_reverted',orig,s.status,concat_ws(' · ','Activado revertido',nullif(btrim(p_reason),''),case when not restored then 'Sin chofer ni móvil: '||note end),uid,
    jsonb_build_object('resources_restored',restored,'km_restored',km_restored,'reason',p_reason));
  return jsonb_build_object('service_id',s.service_id,'status',s.status,'resources_restored',restored,'resources_note',note,'km_restored',km_restored);
end $function$;
revoke all on function public.revert_operator_service_activation_v1(uuid,text) from public, anon;
grant execute on function public.revert_operator_service_activation_v1(uuid,text) to authenticated;
