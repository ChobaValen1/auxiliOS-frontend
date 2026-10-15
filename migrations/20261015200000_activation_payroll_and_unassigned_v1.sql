-- Activados: Sueldos y activar sin chofer asignado · 15/10/2026
-- 1) Sueldos: un Activado Origen facturado le cuenta al chofer de la salida (activation_driver_id). Activado Movida no cuenta.
-- 2) activate_and_finalize_service_v2: también activa un servicio Sin asignar; chofer y móvil de la salida son opcionales.
-- 3) Revertir un activado que estaba Sin asignar lo devuelve a Sin asignar.
do $$
declare d text:=pg_get_functiondef('app_private.payroll_matrix_sources_core'::regproc); n text;
begin
  n:=replace(d,$a$and s.assigned_driver_id=p_driver and l.released_at is null$a$,
    $a$and (s.assigned_driver_id=p_driver or (s.driver_activated and s.activation_kind='origin' and s.activation_driver_id=p_driver)) and l.released_at is null$a$);
  if n=d then raise exception 'No se pudo parchear payroll_matrix_sources_core'; end if;
  execute n;
end $$;

create or replace function public.activate_and_finalize_service_v2(
  p_service_id uuid, p_reason_code text, p_reason_detail text, p_kind text, p_km numeric, p_finished_at timestamptz,
  p_driver_id uuid default null, p_truck_id integer default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare s public.operator_services%rowtype; uid uuid:=auth.uid(); prior_arrival timestamptz; result jsonb;
  reason text:=btrim(coalesce(p_reason_code,'')); label text;
begin
  if uid is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para activar servicios'; end if;
  if p_kind not in ('origin','movement') then raise exception 'Elegí Activado Origen o Activado Movida'; end if;
  if p_km is null or p_km<0 then raise exception 'Indicá los kilómetros del activado'; end if;
  if p_finished_at is null or not isfinite(p_finished_at) then raise exception 'Indicá la hora de fin'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.driver_activated then raise exception 'El servicio ya está activado'; end if;
  prior_arrival:=s.arrived_at;
  if s.status='pending' then
    if (p_driver_id is null)<>(p_truck_id is null) then raise exception 'Elegí chofer y móvil juntos, o dejá los dos vacíos'; end if;
    if p_driver_id is not null and not exists(select 1 from public.users u join public.roles r on r.role_id=u.role_id where u.user_id=p_driver_id and coalesce(u.is_active,true) and r.name='chofer') then raise exception 'Chofer inválido o inactivo'; end if;
    if p_truck_id is not null and not exists(select 1 from public.trucks t where t.truck_id=p_truck_id and t.status='active') then raise exception 'Móvil inválido o inactivo'; end if;
    if reason not in ('absent_or_not_towable','provider','us','other') then raise exception 'Seleccioná el motivo de la activación'; end if;
    label:=case reason when 'absent_or_not_towable' then 'Socio ausente / vehículo no apto' when 'provider' then 'La Prestadora lo dio de baja' when 'us' then 'Lo dimos de baja nosotros' else 'Otro' end;
    perform set_config('app.phase3_bridge','1',true);
    perform set_config('app.lifecycle_transition','manual_arrival',true);
    update public.operator_services set status='at_origin',driver_activated=true,
      activation_driver_id=p_driver_id,activation_truck_id=p_truck_id,activated_at=now(),activated_by=uid,activation_billing=null,
      billing_status='not_ready',document_status='not_started',
      cancellation_reason_code=reason,cancellation_reason_detail=nullif(btrim(p_reason_detail),''),cancellation_reason='ACTIVADO · '||label,updated_by=uid
    where service_id=p_service_id;
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
    values(p_service_id,'service_activated','pending','at_origin','ACTIVADO · '||label,uid,
      jsonb_build_object('driver_id',p_driver_id,'truck_id',p_truck_id,'actor_role',app_private.current_auxilios_role(),'unassigned',true));
  elsif s.status in ('assigned','at_origin') then
    perform public.mark_operator_service_activated_v4(p_service_id,p_reason_code,p_reason_detail);
  else
    raise exception 'Solo un servicio Sin asignar, Asignado o Arribado puede activarse';
  end if;
  update public.operator_services set activation_prev_status=s.status,
    arrived_at=case when prior_arrival is null then least(arrived_at,p_finished_at) else arrived_at end
  where service_id=p_service_id;
  result:=public.finalize_operator_service_at_v1(p_service_id,p_finished_at,'activated',
    jsonb_build_object('billable',true,'activation_kind',p_kind,'activation_km',round(p_km,1)));
  return result||jsonb_build_object('business_status','activated','activation_kind',p_kind,'activation_km',round(p_km,1));
end $function$;
revoke all on function public.activate_and_finalize_service_v2(uuid,text,text,text,numeric,timestamptz,uuid,integer) from public, anon;
grant execute on function public.activate_and_finalize_service_v2(uuid,text,text,text,numeric,timestamptz,uuid,integer) to authenticated;

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
  if prior not in ('pending','assigned','at_origin') then prior:='assigned'; end if;
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
  if prior<>'pending' then begin
    update public.operator_services set assigned_driver_id=s.activation_driver_id,assigned_truck_id=s.activation_truck_id
    where service_id=p_service_id and s.activation_driver_id is not null and s.activation_truck_id is not null;
    if s.activation_driver_id is null or s.activation_truck_id is null then raise exception 'Sin chofer y móvil registrados'; end if;
  exception when others then
    restored:=false; note:=sqlerrm;
    update public.operator_services set status='pending',arrived_at=null where service_id=p_service_id;
  end; end if;
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
