CREATE OR REPLACE FUNCTION public.save_driver_operator_service_remito_v3(p_service_id uuid, p_payload jsonb, p_client_operation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
  if s.status='assigned' or (s.status='at_origin' and s.driver_arrived_at is not null and coalesce(s.document_status,'') not in ('submitted','approved','exception_approved')) then
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
$function$
