-- Prevent mobile clock skew from closing a trip before its database start time.
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
    update public.trips set fecha_hora_fin=coalesce(
        fecha_hora_fin,
        greatest(coalesce(r.firmado_at,now()),fecha_hora_inicio)
      ),
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

