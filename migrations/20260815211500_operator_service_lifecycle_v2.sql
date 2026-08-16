-- AuxiliOS · Lifecycle operativo canónico v2
-- Claves internas compatibles durante el rollout:
-- pending=Sin asignar · assigned=Asignado · at_origin=Arribado · completed=Finalizado · cancelled=Anulado

alter table public.operator_services
  add column if not exists arrived_at timestamptz,
  add column if not exists arrived_by uuid references public.users(user_id),
  add column if not exists arrival_source text,
  add column if not exists arrival_reason_code text,
  add column if not exists cancellation_reason_code text,
  add column if not exists cancellation_reason_detail text;

alter table public.operator_services
  drop constraint if exists operator_services_arrival_source_check,
  add constraint operator_services_arrival_source_check
    check (arrival_source is null or arrival_source in ('signature','manual_operator')),
  drop constraint if exists operator_services_arrival_reason_check,
  add constraint operator_services_arrival_reason_check
    check (arrival_reason_code is null or arrival_reason_code in (
      'client_cannot_or_will_not_sign',
      'signature_technical_issue',
      'operator_provider_confirmed'
    )),
  drop constraint if exists operator_services_cancellation_reason_code_check,
  add constraint operator_services_cancellation_reason_code_check
    check (cancellation_reason_code is null or cancellation_reason_code in (
      'delay',
      'within_authorized_window',
      'cancelled_by_us',
      'client_or_provider',
      'other'
    ));

alter table public.operator_service_events
  add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function app_private.operator_service_missing_required_v2(
  p_service_id uuid,
  p_overrides jsonb default '{}'::jsonb
)
returns text[]
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  s public.operator_services%rowtype;
  v_modes jsonb := '{}'::jsonb;
  v_missing text[] := '{}';
  v text;
  req boolean;
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;

  select coalesce(field_modes,'{}'::jsonb)
    into v_modes
  from public.service_module_settings
  where settings_key='default';

  if s.company_id is null then v_missing:=array_append(v_missing,'Prestadora'); end if;
  if s.billing_base_id is null then v_missing:=array_append(v_missing,'Base'); end if;
  if s.primary_concept_id is null then v_missing:=array_append(v_missing,'Tipo de servicio'); end if;
  if nullif(btrim(s.service_order_number),'') is null then v_missing:=array_append(v_missing,'Código de prestadora'); end if;
  if s.scheduled_for is null then v_missing:=array_append(v_missing,'Fecha y hora'); end if;
  if nullif(btrim(coalesce(p_overrides->>'origin',s.origin)),'') is null then v_missing:=array_append(v_missing,'Origen'); end if;
  if nullif(btrim(coalesce(p_overrides->>'destination',s.destination)),'') is null then v_missing:=array_append(v_missing,'Destino'); end if;

  req:=coalesce(v_modes->>'customer_name','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'customer_name'),''),s.customer_name);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Cliente / Socio'); end if;

  req:=coalesce(v_modes->>'customer_phone','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'customer_phone'),''),s.customer_phone);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Teléfono del cliente'); end if;

  req:=coalesce(v_modes->>'customer_email','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'customer_email'),''),s.customer_email);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Email del cliente'); end if;

  req:=coalesce(v_modes->>'vehicle_plate','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'vehicle_plate'),''),s.vehicle_plate);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Patente'); end if;

  req:=coalesce(v_modes->>'vehicle_make_model','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'vehicle_make_model'),''),s.vehicle_make_model);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Marca y modelo'); end if;

  req:=coalesce(v_modes->>'assigned_resources','optional')='required';
  if req and (s.assigned_driver_id is null or s.assigned_truck_id is null) then
    v_missing:=array_append(v_missing,'Chofer y móvil');
  end if;

  req:=coalesce(v_modes->>'operator_notes','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'operator_notes'),''),s.operator_notes);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Observaciones'); end if;

  req:=coalesce(v_modes->>'driver_instructions','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'driver_instructions'),''),s.driver_instructions);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Indicaciones para el chofer'); end if;

  req:=coalesce(v_modes->>'purchase_order_number','optional')='required';
  v:=coalesce(nullif(btrim(p_overrides->>'purchase_order_number'),''),s.purchase_order_number);
  if req and nullif(btrim(coalesce(v,'')),'') is null then v_missing:=array_append(v_missing,'Orden de compra'); end if;

  return v_missing;
end;
$function$;

revoke all on function app_private.operator_service_missing_required_v2(uuid,jsonb) from public, anon, authenticated;

create or replace function public.validate_operator_service_required_fields_v2(
  p_service_id uuid,
  p_overrides jsonb default '{}'::jsonb
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
  v_missing text[];
begin
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_role='chofer' and v_service.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  elsif v_role not in ('chofer','operador','administracion','supervision') then
    raise exception 'Sin permiso para validar el servicio';
  end if;
  v_missing:=app_private.operator_service_missing_required_v2(p_service_id,coalesce(p_overrides,'{}'::jsonb));
  return jsonb_build_object('valid',cardinality(v_missing)=0,'missing',to_jsonb(v_missing));
end;
$function$;

revoke all on function public.validate_operator_service_required_fields_v2(uuid,jsonb) from public, anon;
grant execute on function public.validate_operator_service_required_fields_v2(uuid,jsonb) to authenticated;

-- Un servicio asignado puede generar su viaje sin agregar un estado/botón intermedio.
create or replace function public.ensure_operator_service_trip_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  l public.daily_logs%rowtype;
  t public.trips%rowtype;
  v_other integer;
  v_type text;
begin
  if v_role<>'chofer' or v_uid is null then raise exception 'Solo el chofer asignado puede preparar el remito'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('assigned','at_origin') then raise exception 'El servicio no está disponible para el chofer'; end if;
  if s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este chofer'; end if;
  if s.assigned_truck_id is null then raise exception 'El servicio no tiene un móvil asignado'; end if;

  if s.trip_id is not null then
    return jsonb_build_object('service_id',s.service_id,'trip_id',s.trip_id,'status',s.status,'existing',true);
  end if;

  select * into l
  from public.daily_logs
  where driver_id=v_uid and truck_id=s.assigned_truck_id
    and coalesce(status,'open')='open' and hora_fin is null
  order by log_date desc,hora_inicio desc,log_id desc limit 1;
  if not found then raise exception 'JORNADA_REQUERIDA: iniciá la jornada con el móvil asignado antes de completar el remito'; end if;

  select trip_id into v_other from public.trips
  where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null
  order by fecha_hora_inicio desc limit 1;
  if v_other is not null then raise exception 'VIAJE_EN_CURSO: finalizá el viaje actual antes de tomar otro servicio'; end if;

  select name into v_type from public.service_concepts where concept_id=s.primary_concept_id;
  insert into public.trips(log_id,driver_id,nro_servicio,patente,tipo_servicio,origin,destination,fecha_hora_inicio,notes,created_at_device,received_at,sync_status)
  values(l.log_id,v_uid,coalesce(nullif(btrim(s.service_order_number),''),s.service_number),s.vehicle_plate,coalesce(v_type,'Servicio'),s.origin,s.destination,now(),'Creado automáticamente desde '||s.service_number,now(),now(),'synced')
  returning * into t;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services set trip_id=t.trip_id,updated_by=v_uid where service_id=s.service_id;
  return jsonb_build_object('service_id',s.service_id,'trip_id',t.trip_id,'status',s.status,'existing',false);
end;
$function$;

revoke all on function public.ensure_operator_service_trip_v2(uuid) from public, anon;
grant execute on function public.ensure_operator_service_trip_v2(uuid) to authenticated;

create or replace function app_private.mark_operator_service_arrived_signature_v2(p_service_id uuid,p_remito_id integer)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_missing text[];
begin
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found or s.status<>'assigned' then return; end if;
  select * into r from public.remitos where remito_id=p_remito_id;
  if not found or r.firma_imagen_url is null or r.firmado_at is null then return; end if;
  if s.remito_id is distinct from p_remito_id then return; end if;

  v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
  if cardinality(v_missing)>0 then
    raise exception 'No se puede confirmar la firma. Faltan completar: %',array_to_string(v_missing,', ');
  end if;

  perform set_config('app.lifecycle_transition','signature_arrival',true);
  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services
  set status='at_origin',arrived_at=coalesce(r.firmado_at,now()),arrived_by=r.driver_id,
      arrival_source='signature',arrival_reason_code=null,updated_by=coalesce(r.driver_id,updated_by)
  where service_id=p_service_id;
end;
$function$;

revoke all on function app_private.mark_operator_service_arrived_signature_v2(uuid,integer) from public, anon, authenticated;

-- Firma ya registrada: Operador/Chofer no pueden reemplazarla. Administración conserva la capacidad de corrección.
create or replace function app_private.lock_signed_remito_signature_v2()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_role text:=app_private.current_auxilios_role();
begin
  if (old.firma_imagen_url is not null or old.firmado_at is not null)
     and v_role<>'administracion'
     and (new.firma_imagen_url is distinct from old.firma_imagen_url
          or new.firmado_at is distinct from old.firmado_at) then
    raise exception 'La firma ya fue registrada y no puede reemplazarse';
  end if;
  return new;
end;
$function$;

drop trigger if exists remitos_lock_signed_signature_v2 on public.remitos;
create trigger remitos_lock_signed_signature_v2
before update of firma_imagen_url,firmado_at on public.remitos
for each row execute function app_private.lock_signed_remito_signature_v2();

create or replace function app_private.sync_signed_remito_arrival_v2()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_service_id uuid;
begin
  if new.firma_imagen_url is null or new.firmado_at is null then return new; end if;
  select service_id into v_service_id
  from public.operator_services
  where remito_id=new.remito_id and status='assigned'
  limit 1;
  if v_service_id is not null then
    perform app_private.mark_operator_service_arrived_signature_v2(v_service_id,new.remito_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists remitos_sync_service_arrival_v2 on public.remitos;
create trigger remitos_sync_service_arrival_v2
after insert or update of firma_imagen_url,firmado_at on public.remitos
for each row execute function app_private.sync_signed_remito_arrival_v2();

-- Control central de cambios de estado. Mantiene temporalmente el bridge viejo sólo para no romper Producción antes del rollout.
create or replace function app_private.operator_services_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_bridge boolean:=coalesce(current_setting('app.phase3_bridge',true),'')='1';
  v_transition text:=coalesce(current_setting('app.lifecycle_transition',true),'');
begin
  if old.status in ('completed','cancelled') and new.status is distinct from old.status then
    raise exception 'El servicio está cerrado y su estado operativo no puede reabrirse';
  end if;

  if new.status is distinct from old.status and not v_bridge then
    if old.status='pending' and new.status='assigned' then
      if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='pending' then
      if new.assigned_driver_id is not null or new.assigned_truck_id is not null then raise exception 'Para volver a Sin asignar deben liberarse Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='at_origin' and v_transition in ('manual_arrival','signature_arrival') then
      null;
    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then
      null;
    elsif old.status in ('pending','assigned','at_origin') and new.status='cancelled' and v_transition='annul' then
      null;
    else
      raise exception 'Transición de estado no permitida';
    end if;
  end if;

  if not v_bridge and v_role='chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then raise exception 'Servicio no asignado al chofer actual'; end if;
    if new.status is distinct from old.status then raise exception 'El estado del servicio se actualiza mediante la firma del remito'; end if;
    if (to_jsonb(new)-array['driver_notes','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['driver_notes','updated_at','updated_by']) then
      raise exception 'El chofer solo puede completar el remito y registrar sus datos operativos habilitados';
    end if;
  end if;

  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at:=coalesce(new.cancelled_at,now());
    new.billing_status:='not_ready';
  elsif new.status<>'cancelled' then
    new.cancelled_at:=null;
  end if;
  if new.status='completed' and old.status is distinct from 'completed' then
    new.completed_at:=coalesce(new.completed_at,now());
    new.billing_status:='pending';
  end if;
  if new.status='at_origin' and old.status is distinct from 'at_origin' then
    new.arrived_at:=coalesce(new.arrived_at,now());
    new.arrived_by:=coalesce(new.arrived_by,auth.uid());
  end if;
  if new.assigned_driver_id is not null and (old.assigned_driver_id is distinct from new.assigned_driver_id or old.assigned_truck_id is distinct from new.assigned_truck_id) then
    new.assigned_at:=now();
    if v_role in ('administracion','operador','supervision') then new.assigned_by:=auth.uid(); end if;
  end if;
  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' then
    new.status:='pending';
  end if;
  new.updated_at:=now();
  new.updated_by:=coalesce(auth.uid(),new.updated_by,old.updated_by);
  return new;
end;
$function$;

-- La asignación histórica se cierra correctamente incluso cuando FINALIZADO/ANULADO libera recursos en el mismo UPDATE.
create or replace function app_private.sync_operator_service_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_sequence integer;
  v_reason text:=nullif(current_setting('app.assignment_reason',true),'');
  v_notes text:=nullif(current_setting('app.assignment_notes',true),'');
  v_test boolean;
begin
  if tg_op='INSERT' then
    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then
      insert into public.operator_service_assignments(service_id,assignment_sequence,driver_id,truck_id,assigned_by,assigned_at,trip_id,started_at,status,is_test)
      values(new.service_id,1,new.assigned_driver_id,new.assigned_truck_id,new.assigned_by,coalesce(new.assigned_at,now()),new.trip_id,case when new.trip_id is not null then now() end,case when new.status='completed' then 'completed' when new.status='cancelled' then 'cancelled' else 'active' end,new.is_test);
    end if;
    return new;
  end if;

  if new.status in ('completed','cancelled') and old.status is distinct from new.status then
    update public.operator_service_assignments
    set status=case when new.status='completed' then 'completed' else 'cancelled' end,
        trip_id=coalesce(trip_id,new.trip_id,old.trip_id),released_at=coalesce(released_at,now()),
        released_by=coalesce(auth.uid(),new.updated_by),
        release_reason_code=case when new.status='cancelled' then coalesce(v_reason,new.cancellation_reason_code,'annulled') else coalesce(v_reason,'finalized') end,
        release_notes=coalesce(v_notes,new.cancellation_reason_detail,new.cancellation_reason),updated_at=now()
    where service_id=new.service_id and status='active';
    return new;
  end if;

  if new.assigned_driver_id is distinct from old.assigned_driver_id or new.assigned_truck_id is distinct from old.assigned_truck_id then
    update public.operator_service_assignments
    set status='released',trip_id=coalesce(trip_id,old.trip_id),released_at=coalesce(released_at,now()),
        released_by=coalesce(auth.uid(),new.updated_by),release_reason_code=coalesce(v_reason,'assignment_changed'),release_notes=v_notes,updated_at=now()
    where service_id=new.service_id and status='active';

    if new.assigned_driver_id is not null and new.assigned_truck_id is not null then
      select coalesce(max(assignment_sequence),0)+1 into v_sequence from public.operator_service_assignments where service_id=new.service_id;
      v_test:=new.is_test or coalesce((select is_test from public.users where user_id=new.assigned_driver_id),false) or coalesce((select is_test from public.trucks where truck_id=new.assigned_truck_id),false);
      insert into public.operator_service_assignments(service_id,assignment_sequence,driver_id,truck_id,assigned_by,assigned_at,trip_id,started_at,status,is_test)
      values(new.service_id,v_sequence,new.assigned_driver_id,new.assigned_truck_id,new.assigned_by,coalesce(new.assigned_at,now()),new.trip_id,case when new.trip_id is not null then now() end,'active',v_test);
    end if;
  elsif new.trip_id is distinct from old.trip_id and new.trip_id is not null then
    update public.operator_service_assignments set trip_id=new.trip_id,started_at=coalesce(started_at,now()),updated_at=now()
    where service_id=new.service_id and status='active';
  end if;
  return new;
end;
$function$;

create or replace function app_private.operator_services_log_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_type text; v_note text;
begin
  if tg_op='INSERT' then
    insert into public.operator_service_events(service_id,event_type,to_status,notes,created_by,details)
    values(new.service_id,'created',new.status,'Servicio creado',new.created_by,jsonb_build_object('status',new.status));
  elsif new.status is distinct from old.status then
    v_type:=case new.status when 'at_origin' then 'arrived' when 'completed' then 'finalized' when 'cancelled' then 'annulled' else 'status_change' end;
    v_note:=case new.status when 'at_origin' then 'Servicio arribado' when 'completed' then 'Servicio finalizado' when 'cancelled' then coalesce(new.cancellation_reason,'Servicio anulado') else 'Estado actualizado' end;
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
    values(new.service_id,v_type,old.status,new.status,v_note,coalesce(auth.uid(),new.updated_by),jsonb_build_object(
      'old_driver_id',old.assigned_driver_id,'new_driver_id',new.assigned_driver_id,
      'old_truck_id',old.assigned_truck_id,'new_truck_id',new.assigned_truck_id,
      'arrival_source',new.arrival_source,'arrival_reason_code',new.arrival_reason_code,
      'cancellation_reason_code',new.cancellation_reason_code,'cancellation_reason_detail',new.cancellation_reason_detail
    ));
  elsif new.assigned_driver_id is distinct from old.assigned_driver_id or new.assigned_truck_id is distinct from old.assigned_truck_id then
    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
    values(new.service_id,'assignment',old.status,new.status,'Asignación actualizada',coalesce(auth.uid(),new.updated_by),jsonb_build_object(
      'old_driver_id',old.assigned_driver_id,'new_driver_id',new.assigned_driver_id,
      'old_truck_id',old.assigned_truck_id,'new_truck_id',new.assigned_truck_id
    ));
  end if;
  return new;
end;
$function$;

create or replace function public.transition_operator_service_v2(
  p_service_id uuid,
  p_action text,
  p_reason_code text default null,
  p_reason_detail text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_reason text:=lower(btrim(coalesce(p_reason_code,'')));
  v_detail text:=nullif(btrim(coalesce(p_reason_detail,'')),'');
  v_missing text[];
  v_label text;
begin
  if v_role not in ('operador','administracion') or v_uid is null then raise exception 'Solo Operaciones puede cambiar el estado del servicio'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;

  if v_action='arrive_manual' then
    if s.status<>'assigned' then raise exception 'Solo un servicio ASIGNADO puede marcarse ARRIBADO manualmente'; end if;
    if v_reason not in ('client_cannot_or_will_not_sign','signature_technical_issue','operator_provider_confirmed') then raise exception 'Seleccioná el motivo del arribo sin firma'; end if;
    v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
    if cardinality(v_missing)>0 then raise exception 'No se puede marcar ARRIBADO. Faltan completar: %',array_to_string(v_missing,', '); end if;
    perform set_config('app.lifecycle_transition','manual_arrival',true);
    update public.operator_services
    set status='at_origin',arrived_at=now(),arrived_by=v_uid,arrival_source='manual_operator',arrival_reason_code=v_reason,updated_by=v_uid
    where service_id=p_service_id returning * into s;

  elsif v_action='finalize' then
    if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede finalizarse'; end if;
    if s.status='assigned' and nullif(btrim(coalesce(s.operator_notes,'')),'') is null then raise exception 'Para finalizar sin ARRIBADO completá Observaciones'; end if;
    v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
    if cardinality(v_missing)>0 then raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', '); end if;
    if s.trip_id is not null then
      update public.trips t set fecha_hora_fin=coalesce(t.fecha_hora_fin,now()),received_at=now(),sync_status='synced',
        km_traveled=coalesce((select r.km_reales from public.remitos r where r.remito_id=s.remito_id),t.km_traveled)
      where t.trip_id=s.trip_id;
    end if;
    perform set_config('app.lifecycle_transition','finalize',true);
    perform set_config('app.assignment_reason','finalized',true);
    update public.operator_services
    set status='completed',completed_at=now(),billing_status='pending',assigned_driver_id=null,assigned_truck_id=null,updated_by=v_uid
    where service_id=p_service_id returning * into s;

  elsif v_action='annul' then
    if s.status not in ('pending','assigned','at_origin') then raise exception 'El servicio ya no puede anularse desde Operaciones'; end if;
    if v_reason not in ('delay','within_authorized_window','cancelled_by_us','client_or_provider','other') then raise exception 'Seleccioná un motivo de anulación'; end if;
    if v_reason='other' and v_detail is null then raise exception 'Especificá el otro motivo de anulación'; end if;
    v_label:=case v_reason
      when 'delay' then 'Cancelado por demora'
      when 'within_authorized_window' then 'Cancelado dentro del tiempo autorizado'
      when 'cancelled_by_us' then 'Cancelado por nosotros'
      when 'client_or_provider' then 'Cancelado por el cliente / prestadora'
      else v_detail end;
    if s.trip_id is not null then
      update public.trips set fecha_hora_fin=coalesce(fecha_hora_fin,now()),received_at=now(),sync_status='synced' where trip_id=s.trip_id;
    end if;
    perform set_config('app.lifecycle_transition','annul',true);
    perform set_config('app.assignment_reason',v_reason,true);
    perform set_config('app.assignment_notes',v_detail,true);
    update public.operator_services
    set status='cancelled',cancelled_at=now(),billing_status='not_ready',cancellation_reason_code=v_reason,
        cancellation_reason_detail=case when v_reason='other' then v_detail else null end,
        cancellation_reason=v_label,assigned_driver_id=null,assigned_truck_id=null,updated_by=v_uid
    where service_id=p_service_id returning * into s;
  else
    raise exception 'Acción de estado inválida';
  end if;

  return jsonb_build_object('service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,'vehicle_plate',s.vehicle_plate,'status',s.status,'billing_status',s.billing_status,'arrived_at',s.arrived_at,'completed_at',s.completed_at,'cancelled_at',s.cancelled_at);
end;
$function$;

revoke all on function public.transition_operator_service_v2(uuid,text,text,text) from public, anon;
grant execute on function public.transition_operator_service_v2(uuid,text,text,text) to authenticated;

-- Vínculo de remito: sincroniza lo completado por el chofer y, si ya está firmado, ARRIBADO es automático.
create or replace function public.link_operator_service_remito(p_service_id uuid,p_remito_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
begin
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado'; end if;
  if v_role='chofer' then
    if s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este chofer'; end if;
  elsif v_role not in ('administracion','operador','supervision') then raise exception 'Sin permiso para vincular el remito'; end if;
  if s.trip_id is null then raise exception 'El servicio todavía no tiene un viaje preparado'; end if;

  select * into r from public.remitos where remito_id=p_remito_id for update;
  if not found then raise exception 'Remito inexistente'; end if;
  if v_role='chofer' and r.driver_id is distinct from v_uid then raise exception 'El remito no pertenece al chofer'; end if;
  if r.log_id is null then raise exception 'El remito no está asociado a una jornada'; end if;
  if not exists(select 1 from public.trips t where t.trip_id=s.trip_id and t.log_id=r.log_id and t.driver_id=r.driver_id) then raise exception 'El remito no corresponde al viaje del servicio'; end if;
  if r.trip_id is null then update public.remitos set trip_id=s.trip_id where remito_id=p_remito_id returning * into r;
  elsif r.trip_id is distinct from s.trip_id then raise exception 'El remito ya está vinculado a otro viaje'; end if;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services
  set remito_id=p_remito_id,
      customer_name=coalesce(customer_name,nullif(btrim(r.razon_social),'')),
      customer_phone=coalesce(customer_phone,nullif(btrim(r.telefono),'')),
      customer_email=coalesce(customer_email,nullif(btrim(r.email_cliente),'')),
      vehicle_plate=coalesce(vehicle_plate,upper(nullif(btrim(r.patente),''))),
      vehicle_make_model=coalesce(vehicle_make_model,nullif(btrim(r.marca_modelo),'')),
      origin=coalesce(nullif(btrim(origin),''),nullif(btrim(r.origen),'')),
      destination=coalesce(nullif(btrim(destination),''),nullif(btrim(r.destino),'')),
      updated_by=coalesce(v_uid,updated_by)
  where service_id=p_service_id returning * into s;

  if r.firma_imagen_url is not null and r.firmado_at is not null and s.status='assigned' then
    perform app_private.mark_operator_service_arrived_signature_v2(p_service_id,p_remito_id);
    select * into s from public.operator_services where service_id=p_service_id;
  end if;

  return jsonb_build_object('service_id',s.service_id,'trip_id',s.trip_id,'remito_id',s.remito_id,'remito_status',r.status,'status',s.status);
end;
$function$;

-- Cola nueva: sin pasos artificiales de En camino/Cargado/En destino.
create or replace function public.get_driver_operator_queue_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_role text:=app_private.current_auxilios_role(); v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_role<>'chofer' or v_uid is null then raise exception 'Solo los choferes pueden consultar esta cola'; end if;
  select coalesce(jsonb_agg(row_data order by scheduled_for,created_at),'[]'::jsonb) into v_result
  from (
    select s.scheduled_for,s.created_at,jsonb_build_object(
      'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,'status',s.status,'priority',s.priority,
      'scheduled_for',s.scheduled_for,'company_name',coalesce(c.trade_name,c.legal_name),'concept_name',sc.name,'concept_icon',sc.icon,
      'customer_name',s.customer_name,'customer_phone',s.customer_phone,'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
      'origin',s.origin,'destination',s.destination,'driver_instructions',s.driver_instructions,'assigned_truck_id',s.assigned_truck_id,
      'truck_label',coalesce(t.numero_interno,t.plate),'trip_id',s.trip_id,'remito_id',s.remito_id,'remito_number',r.nro_remito,'remito_status',r.status,
      'arrived_at',s.arrived_at,'can_complete_remito',s.status='assigned'
    ) row_data
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.trucks t on t.truck_id=s.assigned_truck_id
    left join public.remitos r on r.remito_id=s.remito_id
    where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin')
    order by s.scheduled_for,s.created_at limit 20
  ) q;
  return v_result;
end;
$function$;

revoke all on function public.get_driver_operator_queue_v2() from public, anon;
grant execute on function public.get_driver_operator_queue_v2() to authenticated;

create or replace function public.get_driver_operator_history_v2(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_role text:=app_private.current_auxilios_role(); v_uid uuid:=auth.uid(); v_result jsonb; v_limit integer:=least(greatest(coalesce(p_limit,100),1),500);
begin
  if v_role<>'chofer' or v_uid is null then raise exception 'Solo los choferes pueden consultar su historial'; end if;
  select coalesce(jsonb_agg(row_data order by closed_at desc),'[]'::jsonb) into v_result
  from (
    select coalesce(s.completed_at,s.cancelled_at,a.released_at,s.updated_at) closed_at,
      jsonb_build_object('service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
        'status',s.status,'company_name',coalesce(c.trade_name,c.legal_name),'concept_name',sc.name,'vehicle_plate',s.vehicle_plate,
        'origin',s.origin,'destination',s.destination,'scheduled_for',s.scheduled_for,'arrived_at',s.arrived_at,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,'cancellation_reason',s.cancellation_reason,
        'truck_id',a.truck_id,'truck_label',coalesce(t.numero_interno,t.plate)) row_data
    from public.operator_service_assignments a
    join public.operator_services s on s.service_id=a.service_id
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.trucks t on t.truck_id=a.truck_id
    where a.driver_id=v_uid and a.status in ('completed','cancelled') and s.status in ('completed','cancelled')
    order by closed_at desc limit v_limit
  ) q;
  return v_result;
end;
$function$;

revoke all on function public.get_driver_operator_history_v2(integer) from public, anon;
grant execute on function public.get_driver_operator_history_v2(integer) to authenticated;
