CREATE OR REPLACE FUNCTION app_private.operator_services_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_bridge boolean:=coalesce(current_setting('app.phase3_bridge',true),'')='1';
  v_transition text:=coalesce(current_setting('app.lifecycle_transition',true),'');
  v_billing_admin boolean:=coalesce(current_setting('app.billing_admin_transition',true),'')='annul_completed';
  v_revert boolean:=coalesce(current_setting('app.activation_revert',true),'')='1' and coalesce(app_private.current_auxilios_role(),'') in ('operador','administracion');
begin
  if old.driver_activated and not v_revert and (new.assigned_driver_id is not null or new.assigned_truck_id is not null) then raise exception 'La salida activada conserva su responsable histórico y no admite reasignación'; end if;
  if new.driver_activated and new.status='completed' and new.activation_billing is null then raise exception 'Elegí si el activado es facturable o no facturable'; end if;
  if old.status in ('completed','cancelled') and new.status is distinct from old.status and not (v_revert and old.status='completed' and old.driver_activated) then
    if not (old.status='completed' and new.status='cancelled' and v_billing_admin and v_role='administracion') then raise exception 'El servicio está cerrado y su estado operativo no puede reabrirse'; end if;
  end if;
  if new.status is distinct from old.status and not v_bridge then
    if old.status='pending' and new.status='assigned' and v_transition='outsourced_assign' and coalesce(new.logistics_type,'own')='third_party' then null;
    elsif old.status='pending' and new.status='assigned' then if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='pending' then if new.assigned_driver_id is not null or new.assigned_truck_id is not null then raise exception 'Para volver a Sin asignar deben liberarse Chofer y Móvil'; end if;
    elsif old.status='at_origin' and new.status='assigned' and v_transition='unarrive' then null;
    elsif old.status='assigned' and new.status='at_origin' and v_transition in ('manual_arrival','signature_arrival') then null;
    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then null;
    elsif old.status='pending' and new.status='completed' and v_transition='finalize' and coalesce(new.logistics_type,'own')='third_party' then null;
    elsif old.status in ('pending','assigned','at_origin') and new.status='cancelled' and v_transition='annul' then null;
    elsif old.status='completed' and new.status='cancelled' and v_billing_admin and v_role='administracion' then null;
    else raise exception 'Transición de estado no permitida'; end if;
  end if;
  if not v_bridge and v_role='chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then raise exception 'Servicio no asignado al chofer actual'; end if;
    if new.status is distinct from old.status then raise exception 'El estado del servicio se actualiza mediante la firma del remito'; end if;
    if (to_jsonb(new)-array['driver_notes','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['driver_notes','updated_at','updated_by']) then raise exception 'El chofer solo puede completar el remito y registrar sus datos operativos habilitados'; end if;
  end if;
  if new.status='cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,now());new.billing_status:='not_ready'; elsif new.status<>'cancelled' then new.cancelled_at:=null; end if;
  if new.status='completed' and old.status is distinct from 'completed' then new.completed_at:=coalesce(new.completed_at,now());new.billing_status:='pending'; end if;
  if new.status='at_origin' and old.status is distinct from 'at_origin' then new.arrived_at:=coalesce(new.arrived_at,now());new.arrived_by:=coalesce(new.arrived_by,auth.uid()); end if;
  if new.assigned_driver_id is not null and (old.assigned_driver_id is distinct from new.assigned_driver_id or old.assigned_truck_id is distinct from new.assigned_truck_id) then new.assigned_at:=now();if v_role in ('administracion','operador','supervision') then new.assigned_by:=auth.uid();end if;end if;
  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' and coalesce(new.logistics_type,'own')<>'third_party' then new.status:='pending';end if;
  if new.driver_activated and new.status='completed' and new.activation_billing='non_billable' then new.billing_status:='excluded'; end if;
  new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by,old.updated_by);return new;
end;
$function$;
CREATE OR REPLACE FUNCTION app_private.phase3_link_remito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_trip_id integer;
begin
  if new.trip_id is null and new.driver_id is not null and new.log_id is not null then
    select t.trip_id into v_trip_id
    from public.trips t
    join public.operator_services s on s.trip_id=t.trip_id
    where t.driver_id=new.driver_id
      and t.log_id=new.log_id
      and t.fecha_hora_fin is null
      and s.assigned_driver_id=new.driver_id
      and s.status in ('assigned','at_origin')
    order by
      case when nullif(trim(new.nro_servicio),'') is not null
        and nullif(trim(new.nro_servicio),'') in (
          nullif(trim(s.service_order_number),''),s.service_number
        ) then 0 else 1 end,
      t.fecha_hora_inicio desc,t.trip_id desc
    limit 1;
    if v_trip_id is not null then
      update public.remitos set trip_id=v_trip_id
      where remito_id=new.remito_id and trip_id is null;
      return new;
    end if;
  end if;

  if new.trip_id is not null then
    perform set_config('app.phase3_bridge','1',true);
    update public.operator_services
    set remito_id=new.remito_id,updated_by=coalesce(new.driver_id,updated_by)
    where trip_id=new.trip_id
      and (assigned_driver_id is null or assigned_driver_id is not distinct from new.driver_id)
      and remito_id is distinct from new.remito_id;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION app_private.sync_operator_service_remito_v3()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  s public.operator_services%rowtype;
  v_document_status text;
  v_linked boolean;
  v_submitted boolean;
begin
  if new.operator_service_id is null then return new; end if;

  select * into s
  from public.operator_services
  where service_id=new.operator_service_id
  for update;
  if not found then raise exception 'Servicio inexistente para sincronizar el remito'; end if;

  v_linked:=s.remito_id is distinct from new.remito_id;
  if tg_op='INSERT' then
    v_submitted:=new.status='firmado';
  else
    v_submitted:=new.status='firmado'
      and coalesce(old.status,'pendiente')<>'firmado';
  end if;
  v_document_status:=case
    when new.status='firmado' then 'submitted'
    when new.status='pendiente' then 'draft'
    else s.document_status
  end;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services
  set remito_id=new.remito_id,
      document_status=v_document_status,
      updated_by=coalesce(new.driver_id,updated_by)
  where service_id=new.operator_service_id;

  if v_linked then
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      new.operator_service_id,'remito_linked',s.status,s.status,
      'Remito vinculado al servicio',new.driver_id,
      jsonb_build_object(
        'remito_id',new.remito_id,
        'trip_id',new.trip_id,
        'client_operation_id',new.client_operation_id,
        'document_source',new.document_source
      )
    );
  end if;

  if v_submitted then
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      new.operator_service_id,'remito_submitted',s.status,s.status,
      'Remito firmado enviado a revisión',new.driver_id,
      jsonb_build_object(
        'remito_id',new.remito_id,
        'client_operation_id',new.client_operation_id
      )
    );
  end if;

  if new.status='firmado'
     and new.firma_imagen_url is not null
     and new.firmado_at is not null
     and s.status='assigned' then
    perform app_private.mark_operator_service_arrived_signature_v2(
      new.operator_service_id,new.remito_id
    );
  end if;
  return new;
end;
$function$
