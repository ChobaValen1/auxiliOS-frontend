-- AuxiliOS · conexión integral Servicio → Viaje → Remito v1
-- Entrega compatible: prepara origen/revisión documental y evita que los
-- remitos de servicios asignados pierdan su vínculo online u offline.

alter table public.operator_services
  add column if not exists service_origin text not null default 'administrative',
  add column if not exists administrative_review_status text not null default 'approved',
  add column if not exists document_status text not null default 'not_started';

alter table public.operator_services
  drop constraint if exists operator_services_service_origin_check,
  add constraint operator_services_service_origin_check
    check (service_origin in ('administrative','driver_ad_hoc','external_provider')),
  drop constraint if exists operator_services_administrative_review_status_check,
  add constraint operator_services_administrative_review_status_check
    check (administrative_review_status in ('pending','approved','correction_required','rejected')),
  drop constraint if exists operator_services_document_status_check,
  add constraint operator_services_document_status_check
    check (document_status in (
      'not_started','draft','submitted','observed','approved',
      'exception_requested','exception_approved','exception_rejected'
    ));

alter table public.remitos
  add column if not exists operator_service_id uuid references public.operator_services(service_id),
  add column if not exists client_operation_id uuid,
  add column if not exists document_source text not null default 'legacy_driver';

alter table public.remitos
  drop constraint if exists remitos_document_source_check,
  add constraint remitos_document_source_check
    check (document_source in ('legacy_driver','auxilios_driver','external_provider','administrative_exception'));

-- El histórico continúa siendo legado. Sólo se completa el vínculo ya
-- demostrado por operator_services.remito_id; no se infieren relaciones nuevas.
update public.remitos r
set operator_service_id=s.service_id,
    document_source='auxilios_driver'
from public.operator_services s
where s.remito_id=r.remito_id
  and r.operator_service_id is null;

update public.operator_services s
set document_status=case
  -- Los documentos ya aceptados antes de este gate conservan su condición
  -- operativa y no vuelven artificialmente a una cola de revisión.
  when r.status='firmado' then 'approved'
  when r.status='pendiente' then 'draft'
  else s.document_status
end
from public.remitos r
where r.remito_id=s.remito_id
  and s.document_status='not_started';

-- Los servicios históricos ya FINALIZADOS sin remito explícito continúan
-- facturables como excepción heredada. Sólo los casos nuevos requieren decisión.
update public.operator_services
set document_status='exception_approved'
where status='completed'
  and remito_id is null
  and document_status='not_started';

create unique index if not exists remitos_one_active_operator_service_idx
  on public.remitos(operator_service_id)
  where operator_service_id is not null and coalesce(status,'pendiente')<>'anulado';

create unique index if not exists remitos_driver_client_operation_idx
  on public.remitos(driver_id,client_operation_id)
  where client_operation_id is not null;

create index if not exists remitos_operator_service_id_idx
  on public.remitos(operator_service_id);

-- Normaliza y valida la relación antes de persistir el remito. Una actualización
-- documental posterior al cierre conserva el vínculo, pero un vínculo nuevo sólo
-- puede nacer sobre el servicio activo del chofer y su viaje real.
create or replace function app_private.normalize_operator_service_remito_v3()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  s public.operator_services%rowtype;
  t public.trips%rowtype;
  v_new_link boolean;
  v_service_id uuid;
begin
  if new.operator_service_id is null and new.trip_id is not null then
    select service_id into v_service_id
    from public.operator_services
    where trip_id=new.trip_id
      and (assigned_driver_id is null or assigned_driver_id is not distinct from new.driver_id)
    order by created_at desc
    limit 1;
    new.operator_service_id:=v_service_id;
  end if;

  if new.operator_service_id is null then return new; end if;

  select * into s
  from public.operator_services
  where service_id=new.operator_service_id
  for update;
  if not found then raise exception 'Servicio inexistente para el remito'; end if;

  if tg_op='INSERT' then
    v_new_link:=true;
  else
    v_new_link:=old.operator_service_id is distinct from new.operator_service_id;
  end if;

  if v_new_link then
    if s.status not in ('assigned','at_origin') then
      raise exception 'El servicio no está disponible para recibir un remito';
    end if;
    if s.assigned_driver_id is null or s.assigned_driver_id is distinct from new.driver_id then
      raise exception 'El remito no pertenece al chofer asignado';
    end if;
    if s.trip_id is null then raise exception 'El servicio todavía no tiene un viaje preparado'; end if;
  end if;

  if s.trip_id is not null then
    if new.trip_id is null then new.trip_id:=s.trip_id;
    elsif new.trip_id is distinct from s.trip_id then
      raise exception 'El remito no corresponde al viaje del servicio';
    end if;

    select * into t from public.trips where trip_id=s.trip_id;
    if not found then raise exception 'Viaje inexistente para el servicio'; end if;
    if new.log_id is null then new.log_id:=t.log_id;
    elsif new.log_id is distinct from t.log_id then
      raise exception 'El remito no corresponde a la jornada del servicio';
    end if;
    if v_new_link and t.driver_id is distinct from new.driver_id then
      raise exception 'El viaje no pertenece al chofer del remito';
    end if;
  end if;

  if v_new_link then
    new.document_source:='auxilios_driver';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.normalize_operator_service_remito_v3() from public, anon, authenticated;

drop trigger if exists remitos_normalize_operator_service_v3 on public.remitos;
create trigger remitos_normalize_operator_service_v3
before insert or update of operator_service_id,trip_id,log_id,driver_id on public.remitos
for each row execute function app_private.normalize_operator_service_remito_v3();

-- Mantiene la compatibilidad operator_services.remito_id y registra un único
-- cambio documental. Si el remito llega firmado, ARRIBADO se confirma recién
-- dentro de la misma transacción del servidor.
create or replace function app_private.sync_operator_service_remito_v3()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
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
$function$;

revoke all on function app_private.sync_operator_service_remito_v3() from public, anon, authenticated;

drop trigger if exists remitos_sync_operator_service_v3 on public.remitos;
create trigger remitos_sync_operator_service_v3
after insert or update of operator_service_id,trip_id,status,firma_imagen_url,firmado_at on public.remitos
for each row execute function app_private.sync_operator_service_remito_v3();

-- Escritura canónica e idempotente del Chofer. El servidor determina identidad,
-- jornada y viaje; nunca confía en esos campos enviados por el navegador.
create or replace function public.save_driver_operator_service_remito_v3(
  p_service_id uuid,
  p_payload jsonb,
  p_client_operation_id uuid
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
  t public.trips%rowtype;
  r public.remitos%rowtype;
  v_nro text:=nullif(btrim(coalesce(p_payload->>'nro_remito','')),'');
  v_status text:=lower(btrim(coalesce(p_payload->>'status','pendiente')));
  v_plate text;
  v_type text;
  v_origin text;
  v_destination text;
  v_photo_urls text[];
  v_existing boolean:=false;
  v_previous_status text;
begin
  if v_role<>'chofer' or v_uid is null then
    raise exception 'Solo el chofer asignado puede guardar el remito del servicio';
  end if;
  if p_client_operation_id is null then
    raise exception 'La operación del remito no tiene identificador';
  end if;
  if v_nro is null then raise exception 'El número de remito es obligatorio'; end if;
  if v_status not in ('pendiente','firmado') then
    raise exception 'Estado de remito inválido para el chofer';
  end if;

  select * into s
  from public.operator_services
  where service_id=p_service_id
  for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('assigned','at_origin') then
    raise exception 'El servicio no está disponible para el chofer';
  end if;
  if s.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;

  -- El replay offline no pasa por el formulario puente. Completamos los
  -- campos operativos desde el mismo payload antes de evaluar la firma para
  -- que guardado, validación y ARRIBADO sigan siendo una sola transacción.
  if s.status='assigned' then
    perform public.complete_driver_operator_service_fields_v2(
      p_service_id,
      jsonb_strip_nulls(jsonb_build_object(
        'customer_name',coalesce(p_payload->>'customer_name',p_payload->>'razon_social',p_payload->>'cliente'),
        'customer_phone',coalesce(p_payload->>'customer_phone',p_payload->>'telefono'),
        'customer_email',coalesce(p_payload->>'customer_email',p_payload->>'email_cliente'),
        'vehicle_plate',coalesce(p_payload->>'vehicle_plate',p_payload->>'patente'),
        'vehicle_make_model',coalesce(p_payload->>'vehicle_make_model',p_payload->>'marca_modelo'),
        'origin',coalesce(p_payload->>'origin',p_payload->>'origen'),
        'destination',coalesce(p_payload->>'destination',p_payload->>'destino'),
        'operator_notes',coalesce(p_payload->>'operator_notes',p_payload->>'observaciones'),
        'driver_instructions',p_payload->>'driver_instructions',
        'purchase_order_number',p_payload->>'purchase_order_number'
      ))
    );
    select * into s from public.operator_services where service_id=p_service_id for update;
  end if;

  if s.trip_id is null then
    perform public.ensure_operator_service_trip_v2(p_service_id);
    select * into s from public.operator_services where service_id=p_service_id for update;
  end if;
  select * into t from public.trips where trip_id=s.trip_id;
  if not found then raise exception 'Viaje inexistente para el servicio'; end if;
  if t.driver_id is distinct from v_uid then raise exception 'El viaje no pertenece al chofer'; end if;

  v_plate:=upper(coalesce(nullif(btrim(p_payload->>'patente'),''),nullif(btrim(s.vehicle_plate),'')));
  v_origin:=coalesce(nullif(btrim(p_payload->>'origen'),''),nullif(btrim(s.origin),''));
  v_destination:=coalesce(nullif(btrim(p_payload->>'destino'),''),nullif(btrim(s.destination),''));
  select name into v_type from public.service_concepts where concept_id=s.primary_concept_id;
  v_type:=coalesce(nullif(btrim(p_payload->>'tipo_servicio'),''),v_type,'Servicio');
  if v_plate is null or v_origin is null or v_destination is null then
    raise exception 'El remito requiere patente, origen y destino';
  end if;
  if v_status='firmado' and (
    nullif(btrim(p_payload->>'firma_imagen_url'),'') is null
    or nullif(btrim(p_payload->>'firmado_at'),'') is null
  ) then
    raise exception 'La firma todavía no fue almacenada';
  end if;

  if jsonb_typeof(p_payload->'foto_urls')='array' then
    select coalesce(array_agg(value),'{}'::text[])
      into v_photo_urls
    from jsonb_array_elements_text(p_payload->'foto_urls');
  end if;

  select * into r
  from public.remitos
  where driver_id=v_uid and client_operation_id=p_client_operation_id
  limit 1
  for update;
  if found then v_existing:=true; end if;

  if not v_existing then
    select * into r
    from public.remitos
    where operator_service_id=p_service_id
      and coalesce(status,'pendiente')<>'anulado'
    order by remito_id desc
    limit 1
    for update;
    if found then v_existing:=true; end if;
  end if;

  if not v_existing then
    select * into r
    from public.remitos
    where nro_remito=v_nro
      and driver_id=v_uid
      and (trip_id=s.trip_id or (trip_id is null and log_id=t.log_id))
      and coalesce(status,'pendiente')<>'anulado'
    limit 1
    for update;
    if found then v_existing:=true; end if;
  end if;

  if v_existing and r.operator_service_id is not null
     and r.operator_service_id is distinct from p_service_id then
    raise exception 'El remito ya pertenece a otro servicio';
  end if;
  if v_existing and r.status='firmado' then
    return jsonb_build_object(
      'service_id',p_service_id,
      'trip_id',r.trip_id,
      'remito_id',r.remito_id,
      'remito_status',r.status,
      'status',s.status,
      'idempotent',true
    );
  end if;

  v_previous_status:=case when v_existing then r.status else null end;
  if v_existing then
    update public.remitos
    set operator_service_id=p_service_id,
        client_operation_id=coalesce(client_operation_id,p_client_operation_id),
        trip_id=s.trip_id,
        log_id=t.log_id,
        driver_id=v_uid,
        nro_servicio=coalesce(nullif(btrim(p_payload->>'nro_servicio'),''),nullif(btrim(s.service_order_number),''),s.service_number),
        patente=v_plate,
        marca_modelo=nullif(btrim(p_payload->>'marca_modelo'),''),
        razon_social=nullif(btrim(p_payload->>'razon_social'),''),
        cuit=nullif(btrim(p_payload->>'cuit'),''),
        telefono=nullif(btrim(p_payload->>'telefono'),''),
        email_cliente=nullif(btrim(p_payload->>'email_cliente'),''),
        tipo_servicio=v_type,
        origen=v_origin,
        destino=v_destination,
        km_reales=nullif(p_payload->>'km_reales','')::integer,
        imp_peaje=coalesce(nullif(p_payload->>'imp_peaje','')::numeric,0),
        imp_excedente=coalesce(nullif(p_payload->>'imp_excedente','')::numeric,0),
        imp_otros=coalesce(nullif(p_payload->>'imp_otros','')::numeric,0),
        pago_1_metodo=nullif(p_payload->>'pago_1_metodo',''),
        pago_1_monto=nullif(p_payload->>'pago_1_monto','')::numeric,
        pago_2_metodo=nullif(p_payload->>'pago_2_metodo',''),
        pago_2_monto=nullif(p_payload->>'pago_2_monto','')::numeric,
        observaciones=nullif(btrim(p_payload->>'observaciones'),''),
        foto_urls=coalesce(v_photo_urls,foto_urls),
        firma_imagen_url=case when v_status='firmado' then nullif(p_payload->>'firma_imagen_url','') else firma_imagen_url end,
        firmado_at=case when v_status='firmado' then (p_payload->>'firmado_at')::timestamptz else firmado_at end,
        conformidad_servicio=coalesce((p_payload->>'conformidad_servicio')::boolean,conformidad_servicio),
        conformidad_cargos=coalesce((p_payload->>'conformidad_cargos')::boolean,conformidad_cargos),
        sin_danos=coalesce((p_payload->>'sin_danos')::boolean,sin_danos),
        conformidad_arrastre=coalesce((p_payload->>'conformidad_arrastre')::boolean,conformidad_arrastre),
        cliente_presente=coalesce((p_payload->>'cliente_presente')::boolean,cliente_presente),
        status=v_status,
        document_source='auxilios_driver',
        received_at=now(),
        sync_status='synced'
    where remito_id=r.remito_id
    returning * into r;
  else
    insert into public.remitos(
      nro_remito,operator_service_id,client_operation_id,trip_id,log_id,driver_id,nro_servicio,
      patente,marca_modelo,razon_social,cuit,telefono,email_cliente,tipo_servicio,origen,destino,
      km_reales,imp_peaje,imp_excedente,imp_otros,pago_1_metodo,pago_1_monto,pago_2_metodo,pago_2_monto,
      observaciones,foto_urls,firma_imagen_url,firmado_at,conformidad_servicio,conformidad_cargos,
      sin_danos,conformidad_arrastre,cliente_presente,status,document_source,created_at_device,
      received_at,sync_status,created_at,creado_por
    ) values (
      v_nro,p_service_id,p_client_operation_id,s.trip_id,t.log_id,v_uid,
      coalesce(nullif(btrim(p_payload->>'nro_servicio'),''),nullif(btrim(s.service_order_number),''),s.service_number),
      v_plate,nullif(btrim(p_payload->>'marca_modelo'),''),nullif(btrim(p_payload->>'razon_social'),''),
      nullif(btrim(p_payload->>'cuit'),''),nullif(btrim(p_payload->>'telefono'),''),nullif(btrim(p_payload->>'email_cliente'),''),
      v_type,v_origin,v_destination,nullif(p_payload->>'km_reales','')::integer,
      coalesce(nullif(p_payload->>'imp_peaje','')::numeric,0),
      coalesce(nullif(p_payload->>'imp_excedente','')::numeric,0),
      coalesce(nullif(p_payload->>'imp_otros','')::numeric,0),
      nullif(p_payload->>'pago_1_metodo',''),nullif(p_payload->>'pago_1_monto','')::numeric,
      nullif(p_payload->>'pago_2_metodo',''),nullif(p_payload->>'pago_2_monto','')::numeric,
      nullif(btrim(p_payload->>'observaciones'),''),v_photo_urls,
      case when v_status='firmado' then nullif(p_payload->>'firma_imagen_url','') end,
      case when v_status='firmado' then (p_payload->>'firmado_at')::timestamptz end,
      (p_payload->>'conformidad_servicio')::boolean,(p_payload->>'conformidad_cargos')::boolean,
      (p_payload->>'sin_danos')::boolean,(p_payload->>'conformidad_arrastre')::boolean,
      (p_payload->>'cliente_presente')::boolean,v_status,'auxilios_driver',
      coalesce((p_payload->>'created_at_device')::timestamptz,now()),now(),'synced',now(),v_uid
    ) returning * into r;
  end if;

  select * into s from public.operator_services where service_id=p_service_id;
  return jsonb_build_object(
    'service_id',p_service_id,
    'trip_id',r.trip_id,
    'remito_id',r.remito_id,
    'remito_status',r.status,
    'previous_remito_status',v_previous_status,
    'document_status',s.document_status,
    'status',s.status,
    'idempotent',false
  );
end;
$function$;

revoke all on function public.save_driver_operator_service_remito_v3(uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_driver_operator_service_remito_v3(uuid,jsonb,uuid) to authenticated, service_role;

-- Vista mínima común para que Administración, Operaciones, Supervisión y
-- Facturación vean la recepción documental sin exponer datos comerciales.
create or replace function public.list_operator_service_document_connections_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la recepción de remitos';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id',s.service_id,
    'service_origin',s.service_origin,
    'administrative_review_status',s.administrative_review_status,
    'document_status',s.document_status,
    'remito_id',s.remito_id,
    'remito_number',r.nro_remito,
    'remito_status',r.status,
    'remito_received_at',r.received_at
  )),'[]'::jsonb)
  into v_result
  from public.operator_services s
  left join public.remitos r on r.remito_id=s.remito_id;

  return v_result;
end;
$function$;

revoke all on function public.list_operator_service_document_connections_v1() from public, anon;
grant execute on function public.list_operator_service_document_connections_v1() to authenticated, service_role;

-- La recepción documental es el gate para Facturación, no para terminar el
-- trabajo operativo. Un servicio puede finalizar sin remito, pero permanece
-- NOT_READY hasta que Administración apruebe el documento o la excepción.
create or replace function app_private.guard_operator_service_document_billing_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if new.status='completed'
     and new.billing_status in ('pending','reviewed','invoiced')
     and new.document_status not in ('approved','exception_approved') then
    new.billing_status:='not_ready';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.guard_operator_service_document_billing_v1() from public, anon, authenticated;

drop trigger if exists operator_services_document_billing_guard_v1 on public.operator_services;
create trigger operator_services_document_billing_guard_v1
before update of status,billing_status,document_status on public.operator_services
for each row execute function app_private.guard_operator_service_document_billing_v1();

create or replace function public.resolve_operator_service_document_v1(
  p_service_id uuid,
  p_action text
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
  r public.remitos%rowtype;
  v_document_status text;
  v_event_type text;
  v_notes text;
begin
  if v_uid is null or v_role<>'administracion' then
    raise exception 'Sólo Administración puede resolver la recepción documental';
  end if;
  if p_action not in ('approve','approve_missing_remito_exception') then
    raise exception 'Acción documental inválida';
  end if;

  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;

  if p_action='approve' then
    if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
    select * into r from public.remitos where remito_id=s.remito_id;
    if not found or r.status<>'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
      raise exception 'El remito todavía no está firmado y recibido';
    end if;
    v_document_status:='approved';
    v_event_type:='remito_approved';
    v_notes:='Administración aprobó el remito recibido';
  else
    if s.remito_id is not null then
      raise exception 'El servicio ya tiene un remito para revisar';
    end if;
    if s.status not in ('at_origin','completed') then
      raise exception 'La excepción sin remito sólo corresponde a un servicio arribado o finalizado';
    end if;
    v_document_status:='exception_approved';
    v_event_type:='remito_exception_approved';
    v_notes:='Administración aprobó la excepción: el chofer no completó el remito';
  end if;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services
  set document_status=v_document_status,
      administrative_review_status='approved',
      billing_status=case
        when status='completed' and billing_status='not_ready' then 'pending'
        else billing_status
      end,
      updated_by=v_uid,
      updated_at=now()
  where service_id=p_service_id
  returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values (
    s.service_id,v_event_type,s.status,s.status,v_notes,v_uid,
    jsonb_build_object('document_status',s.document_status,'remito_id',s.remito_id)
  );

  return jsonb_build_object(
    'service_id',s.service_id,
    'document_status',s.document_status,
    'administrative_review_status',s.administrative_review_status,
    'billing_status',s.billing_status,
    'remito_id',s.remito_id
  );
end;
$function$;

revoke all on function public.resolve_operator_service_document_v1(uuid,text) from public, anon;
grant execute on function public.resolve_operator_service_document_v1(uuid,text) to authenticated, service_role;

-- Los triggers heredados dejan de buscar En camino/Cargado/En destino. Durante
-- la compatibilidad sólo relacionan el viaje canónico ASIGNADO/ARRIBADO.
create or replace function app_private.phase3_link_remito()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
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

revoke all on function app_private.phase3_link_remito() from public, anon, authenticated;

create or replace function app_private.phase3_link_incident()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare v_trip_id integer;
begin
  if new.trip_id is not null or new.driver_id is null or new.log_id is null then return new; end if;
  select t.trip_id into v_trip_id
  from public.trips t
  join public.operator_services s on s.trip_id=t.trip_id
  where t.driver_id=new.driver_id
    and t.log_id=new.log_id
    and t.fecha_hora_fin is null
    and s.assigned_driver_id=new.driver_id
    and s.status in ('assigned','at_origin')
  order by t.fecha_hora_inicio desc,t.trip_id desc
  limit 1;
  if v_trip_id is not null then
    update public.incidents set trip_id=v_trip_id
    where incident_id=new.incident_id and trip_id is null;
  end if;
  return new;
end;
$function$;

revoke all on function app_private.phase3_link_incident() from public, anon, authenticated;
