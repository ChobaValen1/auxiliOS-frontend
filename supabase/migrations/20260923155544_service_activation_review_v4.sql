-- Release operational resources at activation while preserving the crew that made the trip.
begin;
alter table public.operator_services
 add column if not exists activation_driver_id uuid references public.users(user_id),
 add column if not exists activation_truck_id integer references public.trucks(truck_id),
 add column if not exists activated_at timestamptz,
 add column if not exists activated_by uuid references public.users(user_id),
 add column if not exists activation_billing text check (activation_billing in ('billable','non_billable')),
 add column if not exists activation_billing_reason text,
 add column if not exists activation_reviewed_by uuid references public.users(user_id),
 add column if not exists activation_reviewed_at timestamptz;
create index if not exists operator_services_activation_driver_idx on public.operator_services(activation_driver_id);
create index if not exists operator_services_activation_truck_idx on public.operator_services(activation_truck_id);
create index if not exists operator_services_activated_by_idx on public.operator_services(activated_by);
create index if not exists operator_services_activation_reviewer_idx on public.operator_services(activation_reviewed_by);

-- Existing activations receive their historical crew before their resources are released.
update public.operator_services s set
 activation_driver_id=coalesce(s.activation_driver_id,s.assigned_driver_id,(select a.driver_id from public.operator_service_assignments a where a.service_id=s.service_id order by a.assignment_sequence desc limit 1)),
 activation_truck_id=coalesce(s.activation_truck_id,s.assigned_truck_id,(select a.truck_id from public.operator_service_assignments a where a.service_id=s.service_id order by a.assignment_sequence desc limit 1)),
 activated_at=coalesce(s.activated_at,s.arrived_at,s.cancelled_at,s.updated_at),
 activation_billing=case when s.status='completed' then case when s.billing_status='excluded' then 'non_billable' else 'billable' end else s.activation_billing end,
 assigned_driver_id=null,assigned_truck_id=null
where s.driver_activated and s.activation_driver_id is null;
update public.trips t set fecha_hora_fin=coalesce(t.fecha_hora_fin,s.activated_at,now())
from public.operator_services s where s.driver_activated and s.trip_id=t.trip_id and t.fecha_hora_fin is null;
update public.operator_service_assignments a set status='released',released_at=coalesce(a.released_at,s.activated_at,now()),release_reason_code='activated',updated_at=now()
from public.operator_services s where s.driver_activated and a.service_id=s.service_id and a.status='active';

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
begin
  if old.driver_activated and (new.assigned_driver_id is not null or new.assigned_truck_id is not null) then raise exception 'La salida activada conserva su responsable histórico y no admite reasignación'; end if;
  if new.driver_activated and new.status='completed' and new.activation_billing is null then raise exception 'Elegí si el activado es facturable o no facturable'; end if;
  if old.status in ('completed','cancelled') and new.status is distinct from old.status then
    if not (old.status='completed' and new.status='cancelled' and v_billing_admin and v_role='administracion') then raise exception 'El servicio está cerrado y su estado operativo no puede reabrirse'; end if;
  end if;
  if new.status is distinct from old.status and not v_bridge then
    if old.status='pending' and new.status='assigned' then if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='pending' then if new.assigned_driver_id is not null or new.assigned_truck_id is not null then raise exception 'Para volver a Sin asignar deben liberarse Chofer y Móvil'; end if;
    elsif old.status='at_origin' and new.status='assigned' and v_transition='unarrive' then null;
    elsif old.status='assigned' and new.status='at_origin' and v_transition in ('manual_arrival','signature_arrival') then null;
    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then null;
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
  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' then new.status:='pending';end if;
  if new.driver_activated and new.status='completed' and new.activation_billing='non_billable' then new.billing_status:='excluded'; end if;
  new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by,old.updated_by);return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION app_private.operator_service_missing_required_v2(p_service_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
  if req and (coalesce(s.assigned_driver_id,s.activation_driver_id) is null or coalesce(s.assigned_truck_id,s.activation_truck_id) is null) then
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
$function$
;
CREATE OR REPLACE FUNCTION public.list_driver_activated_services_v1(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text:=app_private.current_auxilios_role(); result jsonb;
begin
 if auth.uid() is null or coalesce(v_role,'') not in ('administracion','operador','supervision') then raise exception 'Sin permiso para consultar servicios activados'; end if;
 select coalesce(jsonb_agg(row_data order by cancelled_at desc),'[]'::jsonb) into result from (
  select s.cancelled_at,to_jsonb(s)||jsonb_build_object('company_name',coalesce(c.trade_name,c.legal_name),'billing_base_name',bb.name,'concept_name',sc.name,'driver_name',du.full_name,'truck_label',coalesce(t.numero_interno,t.plate),'driver_activated',true) as row_data
  from public.operator_services s
  join public.companies c on c.company_id=s.company_id
  left join public.billing_bases bb on bb.base_id=s.billing_base_id
  left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
  left join public.users du on du.user_id=coalesce(s.activation_driver_id,s.assigned_driver_id)
  left join public.trucks t on t.truck_id=coalesce(s.activation_truck_id,s.assigned_truck_id)
  where s.driver_activated
  order by s.cancelled_at desc limit least(greatest(coalesce(p_limit,200),1),500)
 ) q;
 return result;
end; $function$
;
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
    if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede finalizarse'; end if;
    if s.status='assigned' and nullif(btrim(coalesce(s.operator_notes,'')),'') is null then raise exception 'Para finalizar sin ARRIBADO completá Observaciones'; end if;
    v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb); if cardinality(v_missing)>0 then raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', '); end if;
    if s.trip_id is not null then update public.trips t set fecha_hora_fin=coalesce(t.fecha_hora_fin,now()),received_at=now(),sync_status='synced',km_traveled=coalesce((select r.km_reales from public.remitos r where r.remito_id=s.remito_id),t.km_traveled) where t.trip_id=s.trip_id; end if;
    perform set_config('app.lifecycle_transition','finalize',true); perform set_config('app.assignment_reason','finalized',true); update public.operator_services set status='completed',completed_at=now(),billing_status='pending',assigned_driver_id=null,assigned_truck_id=null,updated_by=v_uid where service_id=p_service_id returning * into s;
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
CREATE OR REPLACE FUNCTION public.resolve_operator_service_document_v6(p_service_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_service public.operator_services%rowtype;
  v_remito public.remitos%rowtype;
  v_preserved_tolls integer := 0;
  v_preserved_excesses integer := 0;
  v_toll_total numeric := 0;
  v_excess_total numeric := 0;
begin
  -- v5 mantiene la validación de rol, el bloqueo, la revisión y el cierre atómico.
  v_result := public.resolve_operator_service_document_v5(p_service_id,p_action,p_payload);

  select * into v_service
  from public.operator_services
  where service_id=p_service_id
  for update;
  select * into v_remito
  from public.remitos
  where remito_id=v_service.remito_id
  for update;

  -- Una línea informada reemplaza solamente a la planificada del mismo concepto
  -- y responsable. Las demás pasan al conjunto actual sin borrar el original.
  insert into public.operator_service_tolls(
    service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,
    road_snapshot,direction_snapshot,vehicle_category,payment_method,quantity,
    unit_amount,currency,source,crossed_at,notes,created_by,updated_by,is_test,
    payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,
    remito_toll_report_id
  )
  select
    planned.service_id,planned.toll_id,planned.toll_rate_id,planned.toll_code_snapshot,
    planned.toll_name_snapshot,planned.road_snapshot,planned.direction_snapshot,
    planned.vehicle_category,planned.payment_method,planned.quantity,planned.unit_amount,
    planned.currency,'actual',planned.crossed_at,
    concat_ws(E'\n',nullif(planned.notes,''),'Conservado desde la planificación al conciliar el remito'),
    v_uid,v_uid,planned.is_test,planned.payer_agent,planned.customer_payment_method,
    planned.provider_unit_amount,planned.customer_unit_amount,null
  from public.operator_service_tolls planned
  where planned.service_id=p_service_id
    and planned.source in ('planned','manual')
    and v_service.administrative_commercial is null
    and not exists (
      select 1
      from public.operator_service_tolls actual
      where actual.service_id=planned.service_id
        and actual.source='actual'
        and coalesce(actual.payer_agent,'provider')=coalesce(planned.payer_agent,'provider')
        and (
          (actual.toll_id is not null and actual.toll_id=planned.toll_id)
          or (
            actual.toll_id is null and planned.toll_id is null
            and lower(btrim(actual.toll_name_snapshot))=lower(btrim(planned.toll_name_snapshot))
          )
        )
    );
  get diagnostics v_preserved_tolls = row_count;

  insert into public.operator_service_excess_charges(
    service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,
    payer_agent,collector_agent,customer_payment_method,created_by,updated_by,
    is_test,source,remito_excess_report_id
  )
  select
    planned.service_id,planned.concept_id,planned.concept_name_snapshot,planned.quantity,
    planned.unit_amount,planned.currency,planned.payer_agent,planned.collector_agent,
    planned.customer_payment_method,v_uid,v_uid,planned.is_test,'actual',null
  from public.operator_service_excess_charges planned
  where planned.service_id=p_service_id
    and planned.source in ('planned','manual')
    and v_service.administrative_commercial is null
    and not exists (
      select 1
      from public.operator_service_excess_charges actual
      where actual.service_id=planned.service_id
        and actual.source='actual'
        and actual.concept_id=planned.concept_id
        and coalesce(actual.payer_agent,'customer')=coalesce(planned.payer_agent,'customer')
        and coalesce(actual.collector_agent,'company')=coalesce(planned.collector_agent,'company')
    );
  get diagnostics v_preserved_excesses = row_count;

  select coalesce(sum(total_amount),0) into v_toll_total
  from public.operator_service_tolls
  where service_id=p_service_id and source='actual';
  select coalesce(sum(total_amount),0) into v_excess_total
  from public.operator_service_excess_charges
  where service_id=p_service_id and source='actual';

  update public.remitos set
    accepted_imp_peaje=round(v_toll_total,2),
    accepted_imp_excedente=round(v_excess_total,2),
    accepted_imp_total_extras=round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2)
  where remito_id=v_remito.remito_id;

  if v_preserved_tolls>0 or v_preserved_excesses>0 then
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      p_service_id,'remito_addons_reconciled',v_service.status,v_service.status,
      'Adicionales planificados no reemplazados conservados para Facturación',v_uid,
      jsonb_build_object(
        'remito_id',v_remito.remito_id,
        'preserved_planned_tolls',v_preserved_tolls,
        'preserved_planned_excesses',v_preserved_excesses,
        'accepted_toll_total',round(v_toll_total,2),
        'accepted_excess_total',round(v_excess_total,2)
      )
    );
  end if;

  return v_result||jsonb_build_object(
    'reconciled',true,
    'preserved_planned_tolls',v_preserved_tolls,
    'preserved_planned_excesses',v_preserved_excesses,
    'accepted_toll_total',round(v_toll_total,2),
    'accepted_excess_total',round(v_excess_total,2)
  );
end;
$function$
;

create or replace function public.mark_operator_service_activated_v4(p_service_id uuid,p_reason_code text,p_reason_detail text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.operator_services%rowtype; r public.remitos%rowtype;
 uid uuid:=auth.uid(); actor text:=app_private.current_auxilios_role();
 reason text:=btrim(coalesce(p_reason_code,'')); label text; prior text;
begin
 if uid is null or coalesce(actor,'') not in ('chofer','operador','administracion') then raise exception 'Sin permiso para activar servicios'; end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found then raise exception 'Servicio inexistente'; end if;
 if actor='chofer' and uid is distinct from coalesce(s.activation_driver_id,s.assigned_driver_id) then raise exception 'El servicio no está asignado a este Chofer'; end if;
 if s.driver_activated then return jsonb_build_object('service_id',s.service_id,'status',s.status,'business_status','activated','idempotent',true); end if;
 if s.status not in ('assigned','at_origin') then raise exception 'Solo un servicio ASIGNADO o ARRIBADO puede activarse'; end if;
 if s.assigned_driver_id is null or s.assigned_truck_id is null then raise exception 'El servicio necesita chofer y móvil'; end if;
 if reason not in ('absent_or_not_towable','provider','us','other') then raise exception 'Seleccioná el motivo de la activación'; end if;
 label:=case reason when 'absent_or_not_towable' then 'Socio ausente / vehículo no apto' when 'provider' then 'La Prestadora lo dio de baja' when 'us' then 'Lo dimos de baja nosotros' else 'Otro' end;
 if s.remito_id is not null then
   select * into r from public.remitos where remito_id=s.remito_id for update;
   if not found or r.operator_service_id is distinct from s.service_id then raise exception 'El remito vinculado no es válido'; end if;
   if r.status<>'pendiente' or r.firmado_at is not null or r.firma_imagen_url is not null then raise exception 'No se puede activar un servicio con remito firmado'; end if;
 end if;
 prior:=s.status;
 perform set_config('app.phase3_bridge','1',true);
 perform set_config('app.lifecycle_transition','manual_arrival',true);
 perform set_config('app.assignment_reason','activated',true);
 if s.remito_id is not null then
   update public.remitos set status='anulado',sync_status='synced',received_at=now(),
   observaciones=concat_ws(E'\n',nullif(observaciones,''),'Borrador anulado al marcar ACTIVADO.') where remito_id=s.remito_id;
 end if;
 if s.trip_id is not null then update public.trips set fecha_hora_fin=coalesce(fecha_hora_fin,now()),received_at=now(),sync_status='synced' where trip_id=s.trip_id; end if;
 update public.operator_services set status='at_origin',driver_activated=true,
 activation_driver_id=s.assigned_driver_id,activation_truck_id=s.assigned_truck_id,
 activated_at=now(),activated_by=uid,activation_billing=null,
 assigned_driver_id=null,assigned_truck_id=null,billing_status='not_ready',document_status='not_started',
 cancellation_reason_code=reason,cancellation_reason_detail=nullif(btrim(p_reason_detail),''),
 cancellation_reason='ACTIVADO · '||label,updated_by=uid
 where service_id=p_service_id;
 insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
 values(p_service_id,'service_activated',prior,'at_origin','ACTIVADO · '||label,uid,
 jsonb_build_object('driver_id',s.assigned_driver_id,'truck_id',s.assigned_truck_id,'actor_role',actor,'resources_released',true));
 return jsonb_build_object('service_id',s.service_id,'status','at_origin','business_status','activated','billing_status','not_ready','resources_released',true);
end; $$;
revoke all on function public.mark_operator_service_activated_v4(uuid,text,text) from public,anon;
grant execute on function public.mark_operator_service_activated_v4(uuid,text,text) to authenticated;

-- Older driver clients follow the same transactional activation flow.
create or replace function public.mark_driver_operator_service_activated_v3(p_service_id uuid,p_reason_code text,p_reason_detail text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then raise exception 'Solo el Chofer asignado puede activar desde este flujo'; end if;
 return public.mark_operator_service_activated_v4(p_service_id,p_reason_code,p_reason_detail);
end; $$;
revoke all on function public.mark_driver_operator_service_activated_v3(uuid,text,text) from public,anon;
grant execute on function public.mark_driver_operator_service_activated_v3(uuid,text,text) to authenticated;

create or replace function public.finalize_activated_service_v1(p_service_id uuid,p_billable boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operator_services%rowtype; missing text[]; uid uuid:=auth.uid();
begin
 if uid is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Solo Operador o Administración puede decidir la facturación'; end if;
 select * into s from public.operator_services where service_id=p_service_id for update;
 if not found or not s.driver_activated then raise exception 'El servicio no está activado'; end if;
 if p_billable is null then raise exception 'Elegí Facturable o No facturable'; end if;
 if not p_billable and nullif(btrim(p_reason),'') is null then raise exception 'Indicá el motivo por el que no se factura'; end if;
 if s.status='completed' and s.activation_billing=(case when p_billable then 'billable' else 'non_billable' end) then return jsonb_build_object('service_id',s.service_id,'status',s.status,'billing_status',s.billing_status,'idempotent',true); end if;
 if s.status<>'at_origin' then raise exception 'El activado ya está cerrado'; end if;
 missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}');
 if cardinality(missing)>0 then raise exception 'Completá los datos del servicio: %',array_to_string(missing,', '); end if;
 perform set_config('app.lifecycle_transition','finalize',true);
 update public.operator_services set status='completed',completed_at=now(),
 activation_billing=case when p_billable then 'billable' else 'non_billable' end,
 activation_billing_reason=nullif(btrim(p_reason),''),activation_reviewed_by=uid,activation_reviewed_at=now(),
 document_status='exception_approved',billing_status=case when p_billable then 'pending' else 'excluded' end,updated_by=uid
 where service_id=p_service_id returning * into s;
 insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
 values(p_service_id,'activation_finalized','at_origin','completed',case when p_billable then 'Activado finalizado · Facturable' else 'Activado finalizado · No facturable: '||btrim(p_reason) end,uid,jsonb_build_object('billable',p_billable,'reason',p_reason));
 return jsonb_build_object('service_id',s.service_id,'status',s.status,'billing_status',s.billing_status,'activation_billing',s.activation_billing);
end; $$;
revoke all on function public.finalize_activated_service_v1(uuid,boolean,text) from public,anon;
grant execute on function public.finalize_activated_service_v1(uuid,boolean,text) to authenticated;
-- Save the editable service and review choices together.
create or replace function public.save_operator_review_workspace_v1(p_service_id uuid,p_payload jsonb,p_reason text,p_decisions jsonb,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para guardar la revisión'; end if;
 result:=public.update_operator_service_v4(p_service_id,p_payload,p_reason);
 perform public.save_operator_service_review_draft_v1(p_service_id,coalesce(nullif(btrim(p_note),''),'Revisión guardada'),p_decisions);
 return result;
end; $$;
revoke all on function public.save_operator_review_workspace_v1(uuid,jsonb,text,jsonb,text) from public,anon;
grant execute on function public.save_operator_review_workspace_v1(uuid,jsonb,text,jsonb,text) to authenticated;
CREATE OR REPLACE FUNCTION public.get_operator_service_handoff_context_v2(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb; s public.operator_services%rowtype; changes jsonb; signed boolean;
begin
 ctx:=public.get_operator_service_handoff_context_v1(p_service_id);
 select * into s from public.operator_services where service_id=p_service_id;
 signed:=ctx#>>'{service,remito_status}'='firmado';
 select coalesce(jsonb_agg(jsonb_build_object('at',c.changed_at,'by',u.full_name,'fields',c.changed_fields,'before',(select jsonb_object_agg(key,value) from jsonb_each(c.before_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode'])),'after',(select jsonb_object_agg(key,value) from jsonb_each(c.after_values) where key=any(array['service_order_number','company_id','billing_base_id','primary_concept_id','origin','destination','estimated_asphalt_km','estimated_gravel_km','operator_notes','driver_instructions','administrative_commercial','toll_coverage_mode']))) order by c.changed_at desc),'[]')
 into changes from (select * from public.operator_service_changes where service_id=p_service_id order by changed_at desc limit 30) c left join public.users u on u.user_id=c.changed_by
 where c.service_id=p_service_id and c.remito_id=s.remito_id;
 ctx:=jsonb_set(ctx,'{service}',(ctx->'service')||jsonb_build_object('driver_activated',s.driver_activated,'activation_driver_id',s.activation_driver_id,'activation_truck_id',s.activation_truck_id,'activation_billing',s.activation_billing));
 return ctx||jsonb_build_object('administrative_edit',coalesce(signed,false),
 'administrative_revision',s.administrative_revision,'administrative_changes',changes,
 'administrative_commercial',case when signed then app_private.service_administrative_commercial_v1(p_service_id) end,
 'has_administrative_corrections',s.administrative_revision>0,
 'locks',(ctx->'locks')||case when signed then jsonb_build_object('requires_reason',false,'can_edit',s.status not in ('completed','cancelled') and s.billing_status<>'invoiced','customer_locked',true) else '{}'::jsonb end);
end; $function$
;
-- Ad-hoc activations remain available to Operations for administrative classification.
alter table public.driver_service_intakes
 add column if not exists driver_activated boolean not null default false,
 add column if not exists activation_reason_code text,
 add column if not exists activation_reason_detail text;
update public.driver_service_intakes i set driver_activated=true,status='pending_admin',document_status='observed',
 activation_reason_code=e.details->>'reason_code',activation_reason_detail=e.details->>'reason_detail'
from public.driver_service_intake_events e
where e.intake_id=i.intake_id and e.event_type='rejected' and e.notes='Chofer marcó el ingreso como ACTIVADO'
 and i.status='rejected' and i.linked_service_id is null and not i.driver_activated;
CREATE OR REPLACE FUNCTION public.mark_driver_ad_hoc_draft_activated_v1(p_remito_id integer, p_reason_code text, p_reason_detail text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
    raise exception 'Seleccioná el motivo de la activación';
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
  set status='pending_admin', document_status='observed', driver_activated=true, activation_reason_code=v_reason, activation_reason_detail=v_detail,
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
$function$
;
CREATE OR REPLACE FUNCTION public.list_driver_service_intakes_v2(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(v_role,'') not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para consultar ingresos de Chofer';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select i.created_at,jsonb_build_object(
      'intake_id',i.intake_id,'driver_activated',i.driver_activated,
      'intake_number',i.intake_number,
      'service_code',coalesce(nullif(btrim(i.service_reference),''),nullif(btrim(r.nro_servicio),''),i.intake_number),
      'service_reference',i.service_reference,
      'status',i.status,
      'document_status',i.document_status,
      'driver_id',i.driver_id,
      'driver_name',u.full_name,
      'truck_id',i.truck_id,
      'truck_label',coalesce(t.numero_interno,t.plate),
      'trip_id',i.trip_id,
      'remito_id',i.remito_id,
      'remito_number',r.nro_remito,
      'vehicle_plate',coalesce(nullif(btrim(r.patente),''),i.vehicle_plate),
      'vehicle_make_model',coalesce(nullif(btrim(r.marca_modelo),''),i.vehicle_make_model),
      'service_type',coalesce(nullif(btrim(r.tipo_servicio),''),i.service_type),
      'origin',coalesce(nullif(btrim(r.origen),''),i.origin),
      'destination',coalesce(nullif(btrim(r.destino),''),i.destination),
      'origin_formatted_address',coalesce(nullif(btrim(r.origin_formatted_address),''),nullif(btrim(i.origin_formatted_address),''),i.origin),
      'destination_formatted_address',coalesce(nullif(btrim(r.destination_formatted_address),''),nullif(btrim(i.destination_formatted_address),''),i.destination),
      'km_traveled',coalesce(r.km_reales,tr.km_traveled,0),
      'customer_name',coalesce(nullif(btrim(r.razon_social),''),i.customer_name),
      'customer_document',r.cuit,
      'customer_phone',coalesce(nullif(btrim(r.telefono),''),i.customer_phone),
      'toll_count',coalesce(addons.toll_count,0),
      'toll_total',coalesce(addons.toll_total,0),
      'excess_count',coalesce(addons.excess_count,0),
      'excess_total',coalesce(addons.excess_total,0),
      'received_at',i.received_at,
      'created_at',i.created_at
    ) row_data
    from public.driver_service_intakes i
    left join public.users u on u.user_id=i.driver_id
    left join public.trucks t on t.truck_id=i.truck_id
    left join public.remitos r on r.remito_id=i.remito_id
    left join public.trips tr on tr.trip_id=i.trip_id
    left join lateral (
      select
        (select count(*) from public.remito_toll_reports rt where rt.remito_id=i.remito_id) toll_count,
        (select coalesce(sum(rt.total_amount),0) from public.remito_toll_reports rt where rt.remito_id=i.remito_id) toll_total,
        (select count(*) from public.remito_excess_reports re where re.remito_id=i.remito_id) excess_count,
        (select coalesce(sum(re.total_amount),0) from public.remito_excess_reports re where re.remito_id=i.remito_id) excess_total
    ) addons on true
    where i.status='pending_admin'
    order by i.created_at desc
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) q;

  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_driver_service_intake_context_v1(p_intake_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.driver_service_intakes%rowtype; r public.remitos%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion','supervision') then
    raise exception 'Sin permiso para consultar ingresos';
  end if;
  select * into i from public.driver_service_intakes where intake_id=p_intake_id;
  if not found then raise exception 'Ingreso inexistente'; end if;
  select * into r from public.remitos where remito_id=i.remito_id;
  if not found then raise exception 'El ingreso todavía no tiene remito'; end if;
  return jsonb_build_object(
    'version',1,'driver_activated',i.driver_activated,'activation_reason_code',i.activation_reason_code,'intake_id',i.intake_id,'intake_number',i.intake_number,'status',i.status,
    'document_status',i.document_status,'linked_service_id',i.linked_service_id,
    'service',app_private.driver_intake_service_seed_v1(to_jsonb(i),to_jsonb(r)),
    'remito',jsonb_build_object('remito_id',r.remito_id,'nro_remito',r.nro_remito,'status',r.status,
      'firmado_at',r.firmado_at,'created_at',r.created_at,'created_at_device',r.created_at_device,
      'km_reales',r.km_reales,'service_type',r.tipo_servicio),
    'addons',case when i.driver_activated then '{"tolls":[],"excesses":[],"evidence":[]}'::jsonb else public.get_driver_remito_addons_v2(r.remito_id) end
  );
end;
$function$
;
create or replace function public.create_finalize_activated_intake_v1(p_intake_id uuid,p_payload jsonb,p_billable boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.driver_service_intakes%rowtype; r public.remitos%rowtype; s public.operator_services%rowtype; created jsonb; seed jsonb; result jsonb; sid uuid;
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then raise exception 'Sin permiso para cerrar el ingreso'; end if;
 if p_billable is null then raise exception 'Elegí Facturable o No facturable'; end if;
 if not p_billable and nullif(btrim(p_reason),'') is null then raise exception 'Indicá el motivo por el que no se factura'; end if;
 select * into i from public.driver_service_intakes where intake_id=p_intake_id for update;
 if not found or not i.driver_activated then raise exception 'El ingreso no es un activado'; end if;
 if i.linked_service_id is not null then
   select * into s from public.operator_services where service_id=i.linked_service_id;
   if s.status='completed' then return jsonb_build_object('service_id',s.service_id,'status',s.status,'idempotent',true); end if;
   raise exception 'El ingreso ya está vinculado';
 end if;
 if i.status<>'pending_admin' then raise exception 'El ingreso ya está cerrado'; end if;
 select * into r from public.remitos where remito_id=i.remito_id for update;
 if not found or r.status<>'anulado' then raise exception 'El documento del activado no es válido'; end if;
 seed:=app_private.driver_intake_service_seed_v1(to_jsonb(i),to_jsonb(r));
 created:=public.create_operator_service_v4((seed||p_payload||jsonb_build_object('assigned_driver_id',null,'assigned_truck_id',null))-'administrative_commercial'-'administrative_revision');
 sid:=(created->>'service_id')::uuid;
 if sid is null then raise exception 'No se creó el servicio'; end if;
 perform set_config('app.phase3_bridge','1',true);
 perform set_config('app.lifecycle_transition','manual_arrival',true);
 update public.operator_services set status='at_origin',driver_activated=true,
 activation_driver_id=i.driver_id,activation_truck_id=i.truck_id,activated_at=i.updated_at,activated_by=i.driver_id,
 cancellation_reason_code=i.activation_reason_code,cancellation_reason_detail=i.activation_reason_detail,cancellation_reason='ACTIVADO · Ingreso del chofer',
 trip_id=i.trip_id,remito_id=i.remito_id,document_status='not_started',service_origin='driver_ad_hoc'
 where service_id=sid;
 update public.driver_service_intakes set status='linked',linked_service_id=sid,linked_at=now(),linked_by=auth.uid(),document_status='approved' where intake_id=p_intake_id;
 update public.remitos set operator_service_id=sid where remito_id=i.remito_id;
 result:=public.finalize_activated_service_v1(sid,p_billable,p_reason);
 insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
 values(p_intake_id,'linked','Activado creado y finalizado por Operaciones',auth.uid(),jsonb_build_object('service_id',sid,'billable',p_billable));
 return result||jsonb_build_object('intake_id',p_intake_id,'finalized',true);
end; $$;
revoke all on function public.create_finalize_activated_intake_v1(uuid,jsonb,boolean,text) from public,anon;
grant execute on function public.create_finalize_activated_intake_v1(uuid,jsonb,boolean,text) to authenticated;
commit;
