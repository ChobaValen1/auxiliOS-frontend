-- Full driver -> operations handoff. No historical backfill.
alter table public.operator_services add column if not exists customer_document text;

-- Shared Services configuration. Missing/hidden fields never erase saved data.
create or replace function app_private.prepare_driver_customer_payload_v1(p_payload jsonb,p_saved jsonb,p_service jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_modes jsonb;
  v_key text;
  v_field text;
  v_mode text;
  v_value text;
begin
  select field_modes into v_modes from public.service_module_settings where settings_key='default';
  foreach v_key in array array['cuit','telefono'] loop
    v_field:=case v_key when 'cuit' then 'customer_document' else 'customer_phone' end;
    v_mode:=coalesce(v_modes->>v_field,'optional');
    v_value:=coalesce(p_saved->>v_key,p_service->>v_field);
    if v_mode='hidden' then
      v_payload:=v_payload||jsonb_build_object(v_key,coalesce(v_value,v_payload->>v_key));
    elsif not (v_payload ? v_key) or v_payload->v_key='null'::jsonb then
      v_payload:=v_payload||jsonb_build_object(v_key,v_value);
    end if;
    if v_payload->>'status'='firmado' and v_mode='required'
       and nullif(btrim(v_payload->>v_key),'') is null then
      raise exception 'Completá % antes de firmar',case v_key when 'cuit' then 'DNI/CUIT' else 'el teléfono del socio' end;
    end if;
  end loop;
  return v_payload;
end;
$$;
revoke all on function app_private.prepare_driver_customer_payload_v1(jsonb,jsonb,jsonb) from public,anon,authenticated;

-- One explicit mapping, used both for display and the authoritative transaction.
create or replace function app_private.driver_intake_service_seed_v1(p_intake jsonb,p_remito jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'service_order_number',coalesce(nullif(p_intake->>'service_reference',''),nullif(p_remito->>'nro_servicio','')),
    'customer_name',p_remito->>'razon_social',
    'customer_document',p_remito->>'cuit',
    'customer_phone',p_remito->>'telefono',
    'customer_email',p_remito->>'email_cliente',
    'vehicle_plate',p_remito->>'patente',
    'vehicle_make_model',p_remito->>'marca_modelo',
    'origin',p_remito->>'origen','destination',p_remito->>'destino',
    'origin_lat',p_remito->'origin_lat','origin_lng',p_remito->'origin_lng',
    'destination_lat',p_remito->'destination_lat','destination_lng',p_remito->'destination_lng',
    'origin_place_id',p_remito->>'origin_place_id','destination_place_id',p_remito->>'destination_place_id',
    'origin_formatted_address',p_remito->>'origin_formatted_address',
    'destination_formatted_address',p_remito->>'destination_formatted_address',
    'assigned_driver_id',p_intake->>'driver_id','assigned_truck_id',p_intake->'truck_id',
    'operator_notes',p_remito->>'observaciones'
  );
$$;
revoke all on function app_private.driver_intake_service_seed_v1(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.get_driver_service_intake_context_v1(p_intake_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
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
    'version',1,'intake_id',i.intake_id,'intake_number',i.intake_number,'status',i.status,
    'document_status',i.document_status,'linked_service_id',i.linked_service_id,
    'service',app_private.driver_intake_service_seed_v1(to_jsonb(i),to_jsonb(r)),
    'remito',jsonb_build_object('remito_id',r.remito_id,'nro_remito',r.nro_remito,'status',r.status,
      'firmado_at',r.firmado_at,'km_reales',r.km_reales,'service_type',r.tipo_servicio),
    'addons',public.get_driver_remito_addons_v2(r.remito_id)
  );
end;
$$;
revoke all on function public.get_driver_service_intake_context_v1(uuid) from public,anon;
grant execute on function public.get_driver_service_intake_context_v1(uuid) to authenticated;

-- Fill missing Maps data only when it describes the same administrative address.
create or replace function app_private.sync_driver_intake_maps_to_service()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.linked_service_id is not null then
    update public.operator_services s set
      origin=coalesce(nullif(s.origin,''),new.origin),
      origin_lat=case when nullif(s.origin_place_id,'') is null then new.origin_lat else s.origin_lat end,
      origin_lng=case when nullif(s.origin_place_id,'') is null then new.origin_lng else s.origin_lng end,
      origin_formatted_address=case when nullif(s.origin_place_id,'') is null then new.origin_formatted_address else s.origin_formatted_address end,
      origin_place_id=coalesce(nullif(s.origin_place_id,''),new.origin_place_id)
    where s.service_id=new.linked_service_id
      and (nullif(btrim(s.origin),'') is null or btrim(s.origin)=btrim(new.origin));
    update public.operator_services s set
      destination=coalesce(nullif(s.destination,''),new.destination),
      destination_lat=case when nullif(s.destination_place_id,'') is null then new.destination_lat else s.destination_lat end,
      destination_lng=case when nullif(s.destination_place_id,'') is null then new.destination_lng else s.destination_lng end,
      destination_formatted_address=case when nullif(s.destination_place_id,'') is null then new.destination_formatted_address else s.destination_formatted_address end,
      destination_place_id=coalesce(nullif(s.destination_place_id,''),new.destination_place_id)
    where s.service_id=new.linked_service_id
      and (nullif(btrim(s.destination),'') is null or btrim(s.destination)=btrim(new.destination));
  end if;
  return new;
end;
$$;
revoke all on function app_private.sync_driver_intake_maps_to_service() from public,anon,authenticated;

-- A locked intake is the idempotency key. Creation and link share one transaction.
create or replace function public.create_and_link_driver_service_intake_v1(p_intake_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.driver_service_intakes%rowtype; r public.remitos%rowtype;
  v_payload jsonb; v_service jsonb; v_link jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then
    raise exception 'Sólo Administración u Operaciones puede crear y vincular';
  end if;
  select * into i from public.driver_service_intakes where intake_id=p_intake_id for update;
  if not found then raise exception 'Ingreso inexistente'; end if;
  if i.status='linked' and i.linked_service_id is not null then
    return jsonb_build_object('intake_id',i.intake_id,'service_id',i.linked_service_id,'idempotent',true);
  end if;
  if i.status<>'pending_admin' or i.document_status<>'submitted' then
    raise exception 'El ingreso debe tener un remito firmado pendiente de clasificación';
  end if;
  select * into r from public.remitos where remito_id=i.remito_id for update;
  if not found or r.status<>'firmado' or r.firma_imagen_url is null then
    raise exception 'El ingreso todavía no tiene un remito firmado';
  end if;
  v_payload:=coalesce(p_payload,'{}'::jsonb)||app_private.driver_intake_service_seed_v1(to_jsonb(i),to_jsonb(r));
  -- The reference may be supplied by Operations only when the driver left it blank.
  v_payload:=v_payload||jsonb_build_object('service_order_number',
    coalesce(nullif(v_payload->>'service_order_number',''),nullif(btrim(p_payload->>'service_order_number'),'')));
  -- Reported amounts remain on the signed remito; never turn them into planned charges.
  v_payload:=v_payload-'actual_tolls'-'reportedAddons'-'reported_addons';
  v_payload:=v_payload||jsonb_build_object(
    'operator_notes',coalesce(p_payload->'operator_notes',to_jsonb(r.observaciones)),
    'commercial_addons',jsonb_build_object(
      'toll_coverage_mode',p_payload#>'{commercial_addons,toll_coverage_mode}',
      'tolls','[]'::jsonb,'excess_charges','[]'::jsonb
    )
  );
  v_service:=public.create_operator_service_v3(v_payload);
  v_link:=public.link_driver_service_intake_v1(p_intake_id,(v_service->>'service_id')::uuid);
  return v_link||jsonb_build_object('idempotent',false);
end;
$$;
revoke all on function public.create_and_link_driver_service_intake_v1(uuid,jsonb) from public,anon;
grant execute on function public.create_and_link_driver_service_intake_v1(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.save_driver_ad_hoc_remito_v1(p_payload jsonb, p_client_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  l public.daily_logs%rowtype;
  t public.trips%rowtype;
  i public.driver_service_intakes%rowtype;
  r public.remitos%rowtype;
  v_nro text:=nullif(btrim(coalesce(p_payload->>'nro_remito','')),'');
  v_status text:=lower(btrim(coalesce(p_payload->>'status','pendiente')));
  v_plate text:=upper(nullif(btrim(coalesce(p_payload->>'patente','')),''));
  v_type text:=nullif(btrim(coalesce(p_payload->>'tipo_servicio','')),'');
  v_origin text:=nullif(btrim(coalesce(p_payload->>'origen','')),'');
  v_destination text:=nullif(btrim(coalesce(p_payload->>'destino','')),'');
  v_photo_urls text[];
  v_existing boolean:=false;
  v_intake_exists boolean:=false;
begin
  if v_uid is null or coalesce(v_role,'')<>'chofer' then
    raise exception 'Sólo el Chofer puede registrar un servicio sin asignación';
  end if;
  if p_client_operation_id is null then raise exception 'La operación no tiene identificador'; end if;
  -- Serializa reintentos y altas simultáneas del mismo Chofer sin bloquear a
  -- otros Choferes.
  perform pg_advisory_xact_lock(hashtextextended(
    'driver-intake:'||v_uid::text,0
  ));
  if v_nro is null then raise exception 'El número de remito es obligatorio'; end if;
  if v_status not in ('pendiente','firmado') then raise exception 'Estado de remito inválido'; end if;
  if v_status='firmado' and (
    nullif(btrim(p_payload->>'firma_imagen_url'),'') is null
    or nullif(btrim(p_payload->>'firmado_at'),'') is null
  ) then raise exception 'La firma todavía no fue almacenada'; end if;

  select * into i
  from public.driver_service_intakes
  where driver_id=v_uid and client_operation_id=p_client_operation_id
  for update;
  v_intake_exists:=found;

  if v_intake_exists then
    v_plate:=coalesce(v_plate,i.vehicle_plate);
    v_type:=coalesce(v_type,i.service_type);
    v_origin:=coalesce(v_origin,i.origin);
    v_destination:=coalesce(v_destination,i.destination);
  end if;
  if v_plate is null or v_type is null or v_origin is null or v_destination is null then
    raise exception 'Completá patente, tipo de servicio, origen y destino';
  end if;

  if not v_intake_exists then
    if exists(
      select 1 from public.operator_services s
      where s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin')
    ) then
      raise exception 'SERVICIO_ASIGNADO: ya tenés un servicio activo; abrí su remito desde Servicios';
    end if;

    select * into l
    from public.daily_logs
    where driver_id=v_uid and truck_id is not null
      and coalesce(status,'open')='open' and hora_fin is null
    order by log_date desc,hora_inicio desc,log_id desc
    limit 1;
    if not found then
      raise exception 'JORNADA_REQUERIDA: iniciá una jornada con móvil antes de registrar el servicio';
    end if;

    select * into t
    from public.trips
    where driver_id=v_uid and fecha_hora_inicio is not null and fecha_hora_fin is null
    order by fecha_hora_inicio desc,trip_id desc
    limit 1;

    if found then
      if t.log_id is distinct from l.log_id
         or exists(select 1 from public.operator_services s where s.trip_id=t.trip_id)
         or exists(select 1 from public.driver_service_intakes x where x.trip_id=t.trip_id) then
        raise exception 'VIAJE_EN_CURSO: finalizá el viaje actual antes de registrar otro servicio';
      end if;
      update public.trips set
        nro_servicio=coalesce(nullif(btrim(p_payload->>'nro_servicio'),''),nro_servicio),
        patente=v_plate,tipo_servicio=v_type,origin=v_origin,destination=v_destination,
        notes=concat_ws(E'\n',nullif(notes,''),'Adoptado por ingreso sin asignación administrativa'),
        received_at=now(),sync_status='synced'
      where trip_id=t.trip_id returning * into t;
    else
      insert into public.trips(
        log_id,driver_id,nro_servicio,patente,tipo_servicio,origin,destination,
        fecha_hora_inicio,notes,created_at_device,received_at,sync_status
      ) values (
        l.log_id,v_uid,nullif(btrim(p_payload->>'nro_servicio'),''),v_plate,v_type,
        v_origin,v_destination,now(),'Ingreso iniciado por Chofer sin asignación administrativa',
        coalesce((p_payload->>'created_at_device')::timestamptz,now()),now(),'synced'
      ) returning * into t;
    end if;

    insert into public.driver_service_intakes(
      driver_id,truck_id,log_id,trip_id,client_operation_id,service_reference,
      customer_name,customer_phone,customer_email,vehicle_plate,vehicle_make_model,
      service_type,origin,destination,driver_notes,created_at_device
    ) values (
      v_uid,l.truck_id,l.log_id,t.trip_id,p_client_operation_id,
      nullif(btrim(p_payload->>'nro_servicio'),''),
      coalesce(nullif(btrim(p_payload->>'razon_social'),''),nullif(btrim(p_payload->>'cliente'),'')),
      nullif(btrim(p_payload->>'telefono'),''),nullif(btrim(p_payload->>'email_cliente'),''),
      v_plate,nullif(btrim(p_payload->>'marca_modelo'),''),v_type,v_origin,v_destination,
      nullif(btrim(p_payload->>'observaciones'),''),
      coalesce((p_payload->>'created_at_device')::timestamptz,now())
    ) returning * into i;

    insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
    values(i.intake_id,'created','Chofer registró un servicio sin asignación previa',v_uid,
      jsonb_build_object('trip_id',i.trip_id,'log_id',i.log_id,'truck_id',i.truck_id));
  else
    select * into l from public.daily_logs where log_id=i.log_id;
    select * into t from public.trips where trip_id=i.trip_id;
    if i.status<>'pending_admin' then
      raise exception 'El ingreso ya fue resuelto por Administración';
    end if;
  end if;

  if jsonb_typeof(p_payload->'foto_urls')='array' then
    select coalesce(array_agg(value),'{}'::text[]) into v_photo_urls
    from jsonb_array_elements_text(p_payload->'foto_urls');
  end if;

  select * into r from public.remitos
  where driver_id=v_uid and client_operation_id=p_client_operation_id
  limit 1 for update;
  if found then v_existing:=true; end if;

  if not v_existing then
    select * into r from public.remitos
    where driver_intake_id=i.intake_id and coalesce(status,'pendiente')<>'anulado'
    limit 1 for update;
    if found then v_existing:=true; end if;
  end if;

  if v_existing and r.status='firmado' then
    return jsonb_build_object('intake_id',i.intake_id,'intake_number',i.intake_number,
      'trip_id',r.trip_id,'remito_id',r.remito_id,'remito_status',r.status,
      'intake_status',i.status,'idempotent',true);
  end if;

  p_payload:=app_private.prepare_driver_customer_payload_v1(p_payload,to_jsonb(r));
  if v_existing then
    update public.remitos set
      driver_intake_id=i.intake_id,
      client_operation_id=coalesce(client_operation_id,p_client_operation_id),
      trip_id=i.trip_id,log_id=i.log_id,driver_id=v_uid,
      nro_servicio=coalesce(nullif(btrim(p_payload->>'nro_servicio'),''),i.service_reference,r.nro_servicio),
      patente=v_plate,marca_modelo=nullif(btrim(p_payload->>'marca_modelo'),''),
      razon_social=coalesce(nullif(btrim(p_payload->>'razon_social'),''),nullif(btrim(p_payload->>'cliente'),'')),
      cuit=nullif(btrim(p_payload->>'cuit'),''),telefono=nullif(btrim(p_payload->>'telefono'),''),
      email_cliente=nullif(btrim(p_payload->>'email_cliente'),''),tipo_servicio=v_type,
      origen=v_origin,destino=v_destination,km_reales=nullif(p_payload->>'km_reales','')::integer,
      imp_peaje=coalesce(nullif(p_payload->>'imp_peaje','')::numeric,0),
      imp_excedente=coalesce(nullif(p_payload->>'imp_excedente','')::numeric,0),
      imp_otros=coalesce(nullif(p_payload->>'imp_otros','')::numeric,0),
      pago_1_metodo=nullif(p_payload->>'pago_1_metodo',''),pago_1_monto=nullif(p_payload->>'pago_1_monto','')::numeric,
      pago_2_metodo=nullif(p_payload->>'pago_2_metodo',''),pago_2_monto=nullif(p_payload->>'pago_2_monto','')::numeric,
      observaciones=nullif(btrim(p_payload->>'observaciones'),''),foto_urls=coalesce(v_photo_urls,foto_urls),
      firma_imagen_url=case when v_status='firmado' then nullif(p_payload->>'firma_imagen_url','') else firma_imagen_url end,
      firmado_at=case when v_status='firmado' then (p_payload->>'firmado_at')::timestamptz else firmado_at end,
      conformidad_servicio=coalesce((p_payload->>'conformidad_servicio')::boolean,conformidad_servicio),
      conformidad_cargos=coalesce((p_payload->>'conformidad_cargos')::boolean,conformidad_cargos),
      sin_danos=coalesce((p_payload->>'sin_danos')::boolean,sin_danos),
      conformidad_arrastre=coalesce((p_payload->>'conformidad_arrastre')::boolean,conformidad_arrastre),
      cliente_presente=coalesce((p_payload->>'cliente_presente')::boolean,cliente_presente),
      status=v_status,document_source='driver_ad_hoc',received_at=now(),sync_status='synced'
    where remito_id=r.remito_id returning * into r;
  else
    insert into public.remitos(
      nro_remito,driver_intake_id,client_operation_id,trip_id,log_id,driver_id,nro_servicio,
      patente,marca_modelo,razon_social,cuit,telefono,email_cliente,tipo_servicio,origen,destino,
      km_reales,imp_peaje,imp_excedente,imp_otros,pago_1_metodo,pago_1_monto,pago_2_metodo,pago_2_monto,
      observaciones,foto_urls,firma_imagen_url,firmado_at,conformidad_servicio,conformidad_cargos,
      sin_danos,conformidad_arrastre,cliente_presente,status,document_source,created_at_device,
      received_at,sync_status,created_at,creado_por
    ) values (
      v_nro,i.intake_id,p_client_operation_id,i.trip_id,i.log_id,v_uid,
      coalesce(nullif(btrim(p_payload->>'nro_servicio'),''),i.service_reference,r.nro_servicio),
      v_plate,nullif(btrim(p_payload->>'marca_modelo'),''),
      coalesce(nullif(btrim(p_payload->>'razon_social'),''),nullif(btrim(p_payload->>'cliente'),'')),
      nullif(btrim(p_payload->>'cuit'),''),nullif(btrim(p_payload->>'telefono'),''),
      nullif(btrim(p_payload->>'email_cliente'),''),v_type,v_origin,v_destination,
      nullif(p_payload->>'km_reales','')::integer,
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
      (p_payload->>'cliente_presente')::boolean,v_status,'driver_ad_hoc',
      coalesce((p_payload->>'created_at_device')::timestamptz,now()),now(),'synced',now(),v_uid
    ) returning * into r;
  end if;

  update public.driver_service_intakes set
    remito_id=r.remito_id,
    service_reference=r.nro_servicio,
    document_status=case when r.status='firmado' then 'submitted' else 'draft' end,
    customer_name=coalesce(nullif(btrim(p_payload->>'razon_social'),''),nullif(btrim(p_payload->>'cliente'),''),customer_name),
    customer_phone=coalesce(nullif(btrim(p_payload->>'telefono'),''),customer_phone),
    customer_email=coalesce(nullif(btrim(p_payload->>'email_cliente'),''),customer_email),
    vehicle_plate=v_plate,vehicle_make_model=coalesce(nullif(btrim(p_payload->>'marca_modelo'),''),vehicle_make_model),
    service_type=v_type,origin=v_origin,destination=v_destination,
    driver_notes=coalesce(nullif(btrim(p_payload->>'observaciones'),''),driver_notes),
    received_at=case when r.status='firmado' then now() else received_at end,
    updated_at=now()
  where intake_id=i.intake_id returning * into i;

  update public.trips set nro_servicio=r.nro_servicio where trip_id=i.trip_id;
  if r.status='firmado' then
    update public.trips set fecha_hora_fin=coalesce(fecha_hora_fin,r.firmado_at,now()),
      received_at=now(),sync_status='synced'
    where trip_id=i.trip_id;
    if not exists(select 1 from public.driver_service_intake_events e where e.intake_id=i.intake_id and e.event_type='submitted') then
      insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
      values(i.intake_id,'submitted','Remito firmado recibido para clasificación administrativa',v_uid,
        jsonb_build_object('remito_id',r.remito_id));
    end if;
  end if;

  return jsonb_build_object('intake_id',i.intake_id,'intake_number',i.intake_number,
    'trip_id',i.trip_id,'remito_id',r.remito_id,'remito_status',r.status,
    'document_status',i.document_status,'intake_status',i.status,'idempotent',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_driver_ad_hoc_remito_v3(p_payload jsonb, p_client_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_intake_id uuid;
  v_remito_id integer;
  v_trip_id integer;
  v_origin_lat numeric:=nullif(p_payload->>'origin_lat','')::numeric;
  v_origin_lng numeric:=nullif(p_payload->>'origin_lng','')::numeric;
  v_destination_lat numeric:=nullif(p_payload->>'destination_lat','')::numeric;
  v_destination_lng numeric:=nullif(p_payload->>'destination_lng','')::numeric;
  v_origin_place_id text:=nullif(btrim(p_payload->>'origin_place_id'),'');
  v_destination_place_id text:=nullif(btrim(p_payload->>'destination_place_id'),'');
  v_origin_address text:=nullif(btrim(p_payload->>'origin_formatted_address'),'');
  v_destination_address text:=nullif(btrim(p_payload->>'destination_formatted_address'),'');
begin
  if v_uid is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then
    raise exception 'Sólo el Chofer puede guardar el remito';
  end if;
  if coalesce(nullif(p_payload->>'maps_version','')::integer,0)<>1 then
    raise exception 'Versión de ubicaciones inválida';
  end if;
  if v_origin_place_id is null or v_destination_place_id is null
     or v_origin_address is null or v_destination_address is null
     or v_origin_lat is null or v_origin_lng is null
     or v_destination_lat is null or v_destination_lng is null then
    raise exception 'Seleccioná origen y destino desde Google Maps';
  end if;
  if v_origin_lat not between -90 and 90 or v_destination_lat not between -90 and 90
     or v_origin_lng not between -180 and 180 or v_destination_lng not between -180 and 180 then
    raise exception 'Coordenadas de Google Maps inválidas';
  end if;

  select public.save_driver_ad_hoc_remito_v2(p_payload,p_client_operation_id) into v_result;
  -- A replay of a signed submission must not change its route.
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result; end if;
  v_intake_id:=(v_result->>'intake_id')::uuid;
  v_remito_id:=(v_result->>'remito_id')::integer;
  v_trip_id:=(v_result->>'trip_id')::integer;

  update public.driver_service_intakes set
    origin=v_origin_address,destination=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address,
    updated_at=now()
  where intake_id=v_intake_id and driver_id=v_uid;

  update public.remitos set
    origen=v_origin_address,destino=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address
  where remito_id=v_remito_id and driver_id=v_uid;

  update public.trips set
    origin=v_origin_address,destination=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address
  where trip_id=v_trip_id and driver_id=v_uid;

  return v_result||jsonb_build_object('maps_version',1,'maps_verified',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_driver_operator_service_remito_draft_v1(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_addons jsonb;
begin
  if v_uid is null or coalesce(v_role,'')<>'chofer' then
    raise exception 'Solo los choferes pueden recuperar este borrador';
  end if;

  select * into s
  from public.operator_services
  where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from v_uid then
    raise exception 'El servicio no está asignado a este chofer';
  end if;

  select * into r
  from public.remitos
  where operator_service_id=p_service_id
    and driver_id=v_uid
    and status='pendiente'
  order by remito_id desc
  limit 1;
  if not found then return null; end if;

  if r.addons_version=2 then
    v_addons:=public.get_driver_remito_addons_v2(r.remito_id);
  else
    v_addons:=jsonb_build_object(
      'addons_version',2,
      'tolls','[]'::jsonb,
      'excesses','[]'::jsonb,
      'evidence','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'remito_id',r.remito_id,
    'nro_remito',r.nro_remito,
    'nro_servicio',r.nro_servicio,
    'origin_lat',r.origin_lat,'origin_lng',r.origin_lng,
    'destination_lat',r.destination_lat,'destination_lng',r.destination_lng,
    'origin_place_id',r.origin_place_id,'destination_place_id',r.destination_place_id,
    'origin_formatted_address',r.origin_formatted_address,
    'destination_formatted_address',r.destination_formatted_address,
    'customer_name',r.razon_social,
    'customer_document',r.cuit,
    'customer_phone',r.telefono,
    'vehicle_plate',r.patente,
    'vehicle_make_model',r.marca_modelo,
    'origin',r.origen,
    'destination',r.destino,
    'km_reales',r.km_reales,
    'observations',r.observaciones,
    'addons',v_addons
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION app_private.sync_operator_service_driver_remito_visibility_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
begin
  if new.operator_service_id is null
     or coalesce(new.document_source,'') <> 'auxilios_driver'
     or coalesce(new.status,'pendiente') = 'anulado' then
    return new;
  end if;

  update public.operator_services s
  set remito_id = new.remito_id,
      document_status = case
        when new.status = 'firmado' and new.firma_imagen_url is not null then 'submitted'
        when coalesce(s.document_status,'not_started') in ('not_started','draft') then 'draft'
        else s.document_status
      end,
      administrative_review_status = case
        when new.status = 'firmado' and new.firma_imagen_url is not null then 'pending'
        else s.administrative_review_status
      end,
      customer_name = coalesce(nullif(btrim(new.razon_social),''), s.customer_name),
      customer_phone = coalesce(nullif(btrim(new.telefono),''), s.customer_phone),
      customer_email = coalesce(nullif(btrim(new.email_cliente),''), s.customer_email),
      vehicle_plate = coalesce(nullif(btrim(new.patente),''), s.vehicle_plate),
      vehicle_make_model = coalesce(nullif(btrim(new.marca_modelo),''), s.vehicle_make_model),
      origin = coalesce(nullif(btrim(new.origen),''), s.origin),
      destination = coalesce(nullif(btrim(new.destino),''), s.destination),
      customer_document = coalesce(nullif(btrim(new.cuit),''), s.customer_document),
      updated_at = now(),
      updated_by = coalesce(new.driver_id, s.updated_by)
  where s.service_id = new.operator_service_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.link_driver_service_intake_v1(p_intake_id uuid, p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  i public.driver_service_intakes%rowtype;
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
begin
  if v_uid is null or coalesce(v_role,'') not in ('administracion','operador') then
    raise exception 'Sólo Administración u Operaciones puede vincular el ingreso';
  end if;
  select * into i from public.driver_service_intakes where intake_id=p_intake_id for update;
  if not found then raise exception 'Ingreso inexistente'; end if;
  if i.status='linked' and i.linked_service_id=p_service_id then
    return jsonb_build_object('intake_id',i.intake_id,'service_id',p_service_id,'idempotent',true);
  end if;
  if i.status<>'pending_admin' then raise exception 'El ingreso ya fue resuelto'; end if;
  if i.remito_id is null then raise exception 'El ingreso todavía no tiene remito'; end if;
  if i.document_status<>'submitted' then
    raise exception 'El Chofer todavía no firmó y envió el remito';
  end if;

  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('assigned','at_origin') then raise exception 'El servicio debe estar ASIGNADO o ARRIBADO'; end if;
  if s.assigned_driver_id is distinct from i.driver_id or s.assigned_truck_id is distinct from i.truck_id then
    raise exception 'El servicio debe estar asignado al mismo Chofer y Móvil del ingreso';
  end if;
  if s.trip_id is not null and s.trip_id is distinct from i.trip_id then
    raise exception 'El servicio ya tiene otro viaje preparado';
  end if;
  if s.remito_id is not null and s.remito_id is distinct from i.remito_id then
    raise exception 'El servicio ya tiene otro remito';
  end if;
  select * into r from public.remitos where remito_id=i.remito_id for update;
  if not found then raise exception 'Remito inexistente'; end if;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services set
    trip_id=i.trip_id,remito_id=i.remito_id,service_origin='driver_ad_hoc',
    administrative_review_status='pending',document_status=i.document_status,
    service_order_number=coalesce(nullif(btrim(service_order_number),''),i.service_reference,r.nro_servicio),
    customer_document=coalesce(nullif(btrim(customer_document),''),r.cuit),
    customer_name=coalesce(nullif(btrim(customer_name),''),r.razon_social,i.customer_name),
    customer_phone=coalesce(nullif(btrim(customer_phone),''),r.telefono,i.customer_phone),
    customer_email=coalesce(nullif(btrim(customer_email),''),r.email_cliente,i.customer_email),
    vehicle_plate=coalesce(nullif(btrim(vehicle_plate),''),r.patente,i.vehicle_plate),
    vehicle_make_model=coalesce(nullif(btrim(vehicle_make_model),''),r.marca_modelo,i.vehicle_make_model),
    operator_notes=concat_ws(E'\n',nullif(operator_notes,''),'Ingreso '||i.intake_number||' iniciado por Chofer'),
    updated_by=v_uid,updated_at=now()
  where service_id=s.service_id returning * into s;

  update public.remitos set operator_service_id=s.service_id
  where remito_id=r.remito_id returning * into r;

  update public.driver_service_intakes set status='linked',linked_service_id=s.service_id,
    linked_at=now(),linked_by=v_uid,updated_at=now()
  where intake_id=i.intake_id returning * into i;

  insert into public.driver_service_intake_events(intake_id,event_type,notes,created_by,details)
  values(i.intake_id,'linked','Ingreso vinculado a servicio administrativo',v_uid,
    jsonb_build_object('service_id',s.service_id,'service_number',s.service_number));
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(s.service_id,'driver_intake_linked',s.status,s.status,
    'Ingreso de Chofer vinculado al servicio',v_uid,
    jsonb_build_object('intake_id',i.intake_id,'intake_number',i.intake_number,'remito_id',r.remito_id));

  select * into s from public.operator_services where service_id=p_service_id;
  return jsonb_build_object('intake_id',i.intake_id,'intake_status',i.status,
    'service_id',s.service_id,'service_number',s.service_number,'service_status',s.status,
    'document_status',s.document_status,'remito_id',s.remito_id,'trip_id',s.trip_id);
end;
$function$
;

create or replace function public.save_driver_operator_service_remito_v4(p_service_id uuid,p_payload jsonb,p_client_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.operator_services%rowtype; r public.remitos%rowtype;
  v_result jsonb; v_addons jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then
    raise exception 'Sólo el Chofer puede guardar el remito';
  end if;
  if coalesce(nullif(p_payload->>'addons_version','')::integer,0)<>2 then
    raise exception 'Versión de peajes y excedentes inválida';
  end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found or s.assigned_driver_id is distinct from auth.uid() then
    raise exception 'El servicio no está asignado a este chofer';
  end if;
  select * into r from public.remitos where operator_service_id=p_service_id
    and driver_id=auth.uid() and status in ('pendiente','firmado')
    order by remito_id desc limit 1 for update;
  if r.status is distinct from 'firmado' then
    p_payload:=app_private.prepare_driver_customer_payload_v1(p_payload,to_jsonb(r),to_jsonb(s));
  end if;
  v_result:=public.save_driver_operator_service_remito_v3(p_service_id,p_payload,p_client_operation_id);
  if coalesce((v_result->>'idempotent')::boolean,false) then
    return v_result||jsonb_build_object('addons_version',2);
  end if;
  -- Use the assigned service's verified coordinates only for matching addresses.
  update public.remitos m set
    origin_lat=s.origin_lat,origin_lng=s.origin_lng,origin_place_id=s.origin_place_id,
    origin_formatted_address=s.origin_formatted_address
    where m.remito_id=(v_result->>'remito_id')::integer and btrim(m.origen)=btrim(s.origin);
  update public.remitos m set
    destination_lat=s.destination_lat,destination_lng=s.destination_lng,destination_place_id=s.destination_place_id,
    destination_formatted_address=s.destination_formatted_address
    where m.remito_id=(v_result->>'remito_id')::integer and btrim(m.destino)=btrim(s.destination);
  v_addons:=app_private.persist_driver_remito_addons_v3((v_result->>'remito_id')::integer,p_payload,auth.uid());
  return v_result||v_addons;
end;
$$;

create or replace function public.get_operator_service_handoff_context_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb; s public.operator_services%rowtype; r public.remitos%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion','supervision','facturacion') then
    raise exception 'Sin permiso para consultar el servicio';
  end if;
  v_context:=public.get_operator_service_edit_context(p_service_id);
  select * into s from public.operator_services where service_id=p_service_id;
  select * into r from public.remitos where remito_id=s.remito_id;
  return jsonb_set(v_context,'{service}',coalesce(v_context->'service','{}'::jsonb)||jsonb_build_object(
      'remito_id',r.remito_id,'remito_status',r.status,'document_status',s.document_status,
      'customer_document',coalesce(s.customer_document,r.cuit),
      'reported_distance_km',r.km_reales,'remito_number',r.nro_remito
    ),true)||jsonb_build_object(
      'reported_addons',case when r.remito_id is not null then public.get_driver_remito_addons_v2(r.remito_id) end,
      'commercial_addons',public.get_operator_service_commercial_addons_v1(p_service_id)
    );
end;
$$;
revoke all on function public.get_operator_service_handoff_context_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_handoff_context_v1(uuid) to authenticated;

create or replace function public.get_driver_operator_queue_v4()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_queue jsonb; v_result jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'')<>'chofer' then
    raise exception 'Sólo choferes pueden consultar su cola';
  end if;
  v_queue:=public.get_driver_operator_queue_v3();
  select coalesce(jsonb_agg(q.value||jsonb_build_object(
    'customer_document',s.customer_document,
    'origin_lat',s.origin_lat,'origin_lng',s.origin_lng,
    'destination_lat',s.destination_lat,'destination_lng',s.destination_lng,
    'origin_place_id',s.origin_place_id,'destination_place_id',s.destination_place_id,
    'origin_formatted_address',s.origin_formatted_address,
    'destination_formatted_address',s.destination_formatted_address
  ) order by q.ordinality),'[]'::jsonb) into v_result
  from jsonb_array_elements(v_queue) with ordinality q(value,ordinality)
  join public.operator_services s on s.service_id=(q.value->>'service_id')::uuid
  where s.assigned_driver_id=auth.uid();
  return v_result;
end;
$$;
revoke all on function public.get_driver_operator_queue_v4() from public,anon;
grant execute on function public.get_driver_operator_queue_v4() to authenticated;

-- The Services document field also works for manually created administrative services.
create or replace function public.create_operator_service_v4(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_modes jsonb; v_document text:=nullif(btrim(p_payload->>'customer_document'),'');
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then
    raise exception 'Sin permiso para crear servicios';
  end if;
  select field_modes into v_modes from public.service_module_settings where settings_key='default';
  if v_modes->>'customer_document'='required' and v_document is null then raise exception 'Completá DNI/CUIT'; end if;
  if v_modes->>'customer_phone'='required' and nullif(btrim(p_payload->>'customer_phone'),'') is null then raise exception 'Completá el teléfono del socio'; end if;
  v_result:=public.create_operator_service_v3(p_payload-'customer_document');
  update public.operator_services set customer_document=v_document where service_id=(v_result->>'service_id')::uuid;
  return v_result||jsonb_build_object('customer_document',v_document);
end;
$$;
revoke all on function public.create_operator_service_v4(jsonb) from public,anon;
grant execute on function public.create_operator_service_v4(jsonb) to authenticated;

create or replace function public.update_operator_service_v3(p_service_id uuid,p_payload jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.operator_services%rowtype; v_result jsonb; v_context jsonb; v_modes jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('operador','administracion') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  v_context:=public.get_operator_service_edit_context(p_service_id);
  if not coalesce((v_context#>>'{locks,can_edit}')::boolean,false) then raise exception 'El servicio ya no admite modificaciones'; end if;
  select field_modes into v_modes from public.service_module_settings where settings_key='default';
  if v_modes->>'customer_document'='hidden' then p_payload:=p_payload-'customer_document'; end if;
  if p_payload ? 'customer_document' and v_modes->>'customer_document'='required' and nullif(btrim(p_payload->>'customer_document'),'') is null then
    raise exception 'Completá DNI/CUIT';
  end if;
  if p_payload ? 'customer_document' and nullif(btrim(p_payload->>'customer_document'),'') is distinct from s.customer_document
    and (coalesce((v_context#>>'{locks,remito_locked}')::boolean,false)
      or exists(select 1 from public.remitos where remito_id=s.remito_id and status='firmado')) then
    raise exception 'Los datos del socio del remito firmado no se pueden modificar';
  end if;
  v_result:=public.update_operator_service(p_service_id,p_payload-'customer_document',p_reason);
  if p_payload ? 'customer_document' then
    update public.operator_services set customer_document=nullif(btrim(p_payload->>'customer_document'),''),
      updated_by=auth.uid(),updated_at=now() where service_id=p_service_id;
  end if;
  return v_result||jsonb_build_object('customer_document',(select customer_document from public.operator_services where service_id=p_service_id));
end;
$$;
revoke all on function public.update_operator_service_v3(uuid,jsonb,text) from public,anon;
grant execute on function public.update_operator_service_v3(uuid,jsonb,text) to authenticated;

notify pgrst,'reload schema';
