-- AuxiliOS · Remitos firmados: edición restringida y cierre documental/operativo atómico.

create table if not exists app_private.driver_remito_correction_operations (
  client_operation_id uuid primary key,
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  driver_id uuid not null references public.users(user_id),
  result jsonb,
  created_at timestamptz not null default now()
);

revoke all on table app_private.driver_remito_correction_operations from public, anon, authenticated;

create or replace function public.get_driver_operator_queue_v3()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  v_rows jsonb;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Solo los choferes pueden consultar esta cola';
  end if;

  select coalesce(jsonb_agg(
    row_value || jsonb_build_object(
      'can_complete_remito',
        coalesce(row_value->>'status','') = 'assigned'
        and coalesce(row_value->>'remito_status','') <> 'firmado',
      'can_edit_remito',
        coalesce(row_value->>'status','') = 'at_origin'
        and coalesce(row_value->>'remito_status','') = 'firmado',
      'remito_action', case
        when coalesce(row_value->>'status','') = 'at_origin'
          and coalesce(row_value->>'remito_status','') = 'firmado' then 'edit'
        when coalesce(row_value->>'status','') = 'assigned'
          and coalesce(row_value->>'remito_status','') <> 'firmado' then 'complete'
        else 'view'
      end
    ) order by ordinality
  ), '[]'::jsonb)
  into v_rows
  from jsonb_array_elements(public.get_driver_operator_queue_v2()) with ordinality as q(row_value, ordinality);

  return v_rows;
end;
$function$;

revoke all on function public.get_driver_operator_queue_v3() from public, anon;
grant execute on function public.get_driver_operator_queue_v3() to authenticated;

create or replace function public.get_driver_signed_remito_edit_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_addons jsonb;
  v_last_edit jsonb;
begin
  if v_uid is null or v_role <> 'chofer' then
    raise exception 'Solo el Chofer puede editar su remito';
  end if;

  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este Chofer'; end if;
  if s.status <> 'at_origin' then raise exception 'El remito solo puede corregirse antes de finalizar el servicio'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;

  select * into r from public.remitos where remito_id = s.remito_id;
  if not found or r.status <> 'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado';
  end if;

  v_addons := public.get_driver_remito_addons_v2(r.remito_id);
  select jsonb_build_object('edited_at', e.created_at, 'edited_by', e.created_by)
  into v_last_edit
  from public.operator_service_events e
  where e.service_id = s.service_id and e.event_type = 'driver_remito_corrected'
  order by e.created_at desc limit 1;

  return jsonb_build_object(
    'service_id', s.service_id,
    'service_status', s.status,
    'document_status', s.document_status,
    'can_edit', true,
    'remito', jsonb_build_object(
      'remito_id', r.remito_id,
      'remito_number', r.nro_remito,
      'signed_at', r.firmado_at,
      'signature_url', r.firma_imagen_url,
      'customer_name', r.razon_social,
      'customer_document', r.cuit,
      'customer_phone', r.telefono,
      'vehicle_plate', r.patente,
      'vehicle_make_model', r.marca_modelo,
      'origin', r.origen,
      'destination', r.destino,
      'observations', r.observaciones
    ),
    'addons', v_addons,
    'last_correction', v_last_edit
  );
end;
$function$;

revoke all on function public.get_driver_signed_remito_edit_v1(uuid) from public, anon;
grant execute on function public.get_driver_signed_remito_edit_v1(uuid) to authenticated;

create or replace function public.update_driver_signed_remito_v1(
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
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_result jsonb;
  v_addons jsonb;
  v_inserted integer := 0;
  v_old_observations text;
begin
  if v_uid is null or v_role <> 'chofer' then raise exception 'Solo el Chofer puede corregir su remito'; end if;
  if p_client_operation_id is null then raise exception 'La corrección necesita un identificador de operación'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'La corrección es inválida'; end if;
  if exists(
    select 1 from jsonb_object_keys(p_payload) as k(key)
    where k.key not in ('addons_version','observations','tolls','excesses','evidence')
  ) then
    raise exception 'La corrección contiene campos bloqueados del remito';
  end if;

  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.assigned_driver_id is distinct from v_uid then raise exception 'El servicio no está asignado a este Chofer'; end if;
  if s.status <> 'at_origin' then raise exception 'El remito solo puede corregirse antes de finalizar el servicio'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;

  select * into r from public.remitos where remito_id = s.remito_id for update;
  if not found or r.status <> 'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado';
  end if;

  insert into app_private.driver_remito_correction_operations(
    client_operation_id, service_id, remito_id, driver_id
  ) values (p_client_operation_id, s.service_id, r.remito_id, v_uid)
  on conflict (client_operation_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select o.result into v_result
    from app_private.driver_remito_correction_operations o
    where o.client_operation_id = p_client_operation_id
      and o.service_id = s.service_id and o.driver_id = v_uid;
    if v_result is null then raise exception 'El identificador de operación ya fue utilizado'; end if;
    return v_result || jsonb_build_object('idempotent', true);
  end if;

  -- Si un flujo anterior dejó una revisión sobre un servicio aún abierto, se
  -- invalida únicamente la materialización comercial derivada de este remito.
  delete from public.operator_service_document_addon_reviews rv
  where rv.service_id = s.service_id and rv.remito_id = r.remito_id;
  delete from public.operator_service_tolls t
  where t.service_id = s.service_id and t.source = 'actual'
    and t.remito_toll_report_id in (
      select tr.toll_report_id from public.remito_toll_reports tr where tr.remito_id = r.remito_id
    );
  delete from public.operator_service_excess_charges x
  where x.service_id = s.service_id and x.source = 'actual'
    and x.remito_excess_report_id in (
      select er.excess_report_id from public.remito_excess_reports er where er.remito_id = r.remito_id
    );

  v_old_observations := r.observaciones;
  update public.remitos set
    observaciones = nullif(btrim(p_payload->>'observations'),''),
    accepted_imp_peaje = null,
    accepted_imp_excedente = null,
    accepted_imp_total_extras = null,
    addons_reviewed_by = null,
    addons_reviewed_at = null,
    addons_review_status = 'pending',
    received_at = now(),
    sync_status = 'synced'
  where remito_id = r.remito_id;

  v_addons := app_private.persist_driver_remito_addons_v3(r.remito_id, p_payload, v_uid);

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services set
    document_status = 'submitted',
    administrative_review_status = 'pending',
    billing_status = 'not_ready',
    driver_notes = coalesce(nullif(btrim(p_payload->>'observations'),''), driver_notes),
    updated_by = v_uid,
    updated_at = now()
  where service_id = s.service_id returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values (
    s.service_id,'driver_remito_corrected',s.status,s.status,
    'El Chofer actualizó cargos, evidencia u observaciones del remito firmado',v_uid,
    jsonb_build_object(
      'remito_id',r.remito_id,
      'client_operation_id',p_client_operation_id,
      'observations_changed',v_old_observations is distinct from nullif(btrim(p_payload->>'observations'),''),
      'toll_count',jsonb_array_length(coalesce(p_payload->'tolls','[]'::jsonb)),
      'excess_count',jsonb_array_length(coalesce(p_payload->'excesses','[]'::jsonb)),
      'evidence_count',jsonb_array_length(coalesce(p_payload->'evidence','[]'::jsonb))
    )
  );

  v_result := jsonb_build_object(
    'service_id',s.service_id,'remito_id',r.remito_id,'remito_status','firmado',
    'service_status',s.status,'document_status',s.document_status,
    'review_status','pending','addons',v_addons,'idempotent',false
  );
  update app_private.driver_remito_correction_operations
  set result = v_result where client_operation_id = p_client_operation_id;
  return v_result;
end;
$function$;

revoke all on function public.update_driver_signed_remito_v1(uuid,jsonb,uuid) from public, anon;
grant execute on function public.update_driver_signed_remito_v1(uuid,jsonb,uuid) to authenticated;

create or replace function public.get_operator_service_remito_review_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  v_data jsonb;
  v_last_edit jsonb;
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para revisar remitos';
  end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  v_data := public.get_operator_service_remito_review_v1(p_service_id);

  select jsonb_build_object(
    'edited_at',e.created_at,
    'edited_by',e.created_by,
    'edited_by_name',u.full_name
  ) into v_last_edit
  from public.operator_service_events e
  left join public.users u on u.user_id = e.created_by
  where e.service_id = p_service_id and e.event_type = 'driver_remito_corrected'
  order by e.created_at desc limit 1;

  return v_data
    || jsonb_build_object(
      'can_resolve',v_role in ('administracion','operador')
        and s.billing_status <> 'invoiced'
        and s.document_status in ('submitted','approved')
        and s.status in ('at_origin','completed')
        and not (s.status='completed' and s.document_status='approved'),
      'resolution_action',case when s.status='completed' then 'approve_legacy_completed' else 'approve_and_finalize' end,
      'last_correction',v_last_edit
    )
    || jsonb_build_object(
      'remito',(v_data->'remito') || jsonb_build_object('edited_after_signing',v_last_edit is not null)
    );
end;
$function$;

revoke all on function public.get_operator_service_remito_review_v2(uuid) from public, anon;
grant execute on function public.get_operator_service_remito_review_v2(uuid) to authenticated;

-- Un remito firmado se cierra únicamente desde la operación documental atómica.
-- Esto evita que la transición histórica "finalize" deje el documento enviado
-- pero el servicio terminado, sin aprobación ni habilitación de Facturación.
create or replace function app_private.guard_signed_remito_atomic_finalize_v1()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $function$
begin
  if old.status = 'at_origin'
     and new.status = 'completed'
     and old.remito_id is not null
     and old.document_status in ('submitted','approved')
     and coalesce(current_setting('app.remito_atomic_finalize',true),'') <> '1' then
    raise exception 'El servicio tiene un remito firmado: aprobalo y finalizalo desde Revisión y cierre';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_guard_signed_remito_atomic_finalize_v1 on public.operator_services;
create trigger trg_guard_signed_remito_atomic_finalize_v1
before update of status on public.operator_services
for each row execute function app_private.guard_signed_remito_atomic_finalize_v1();

create or replace function public.resolve_operator_service_document_v3(
  p_service_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_from_status text;
  v_toll_decisions jsonb := coalesce(p_payload->'tolls','[]'::jsonb);
  v_excess_decisions jsonb := coalesce(p_payload->'excesses','[]'::jsonb);
  v_row jsonb;
  t public.remito_toll_reports%rowtype;
  x public.remito_excess_reports%rowtype;
  l public.toll_locations%rowtype;
  c public.service_concepts%rowtype;
  v_report_id uuid;
  v_decision text;
  v_reason text;
  v_toll_id uuid;
  v_concept_id uuid;
  v_name text;
  v_qty numeric;
  v_unit numeric;
  v_method text;
  v_payer text;
  v_collector text;
  v_customer_method text;
  v_provider_unit numeric;
  v_customer_unit numeric;
  v_service_toll_id uuid;
  v_excess_charge_id uuid;
  v_changed boolean;
  v_adjusted boolean := false;
  v_toll_total numeric := 0;
  v_excess_total numeric := 0;
  v_expected integer;
  v_missing text[];
  v_has_review boolean;
begin
  if v_uid is null or v_role not in ('administracion','operador') then
    raise exception 'Solo Operaciones o Administración puede aprobar y finalizar el servicio';
  end if;
  if lower(btrim(coalesce(p_action,''))) <> 'approve_and_finalize' then
    raise exception 'Acción documental inválida';
  end if;
  if jsonb_typeof(v_toll_decisions) <> 'array' or jsonb_typeof(v_excess_decisions) <> 'array' then
    raise exception 'La revisión debe contener listas';
  end if;

  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id = s.remito_id for update;
  if not found or r.status <> 'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado y recibido';
  end if;

  if s.status = 'completed' and s.document_status = 'approved' then
    return jsonb_build_object(
      'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
      'document_status',s.document_status,'billing_status',s.billing_status,
      'review_status',r.addons_review_status,'idempotent',true
    );
  end if;
  if s.status not in ('at_origin','completed') then
    raise exception 'El servicio debe estar ARRIBADO para aprobar el remito y finalizar';
  end if;
  if s.document_status not in ('submitted','approved') then
    raise exception 'El remito no está pendiente de revisión';
  end if;

  if s.status = 'at_origin' then
    v_missing := app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
    if cardinality(v_missing) > 0 then
      raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', ');
    end if;
  end if;

  select exists(
    select 1 from public.operator_service_document_addon_reviews rv
    where rv.service_id = p_service_id and rv.remito_id = r.remito_id
  ) into v_has_review;

  if v_has_review and s.document_status <> 'approved' then
    raise exception 'La revisión previa quedó inconsistente; volvé a guardar la corrección del remito';
  end if;

  if not v_has_review then
    select count(*) into v_expected from public.remito_toll_reports where remito_id = r.remito_id;
    if jsonb_array_length(v_toll_decisions) <> v_expected then raise exception 'Revisá todos los peajes antes de aprobar'; end if;
    select count(*) into v_expected from public.remito_excess_reports where remito_id = r.remito_id;
    if jsonb_array_length(v_excess_decisions) <> v_expected then raise exception 'Revisá todos los excedentes antes de aprobar'; end if;

    for v_row in select value from jsonb_array_elements(v_toll_decisions) loop
      v_report_id := nullif(v_row->>'toll_report_id','')::uuid;
      select * into t from public.remito_toll_reports
      where toll_report_id = v_report_id and remito_id = r.remito_id;
      if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de peaje inválida'; end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el peaje'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,toll_report_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (p_service_id,r.remito_id,t.toll_report_id,'rejected',to_jsonb(t),'{}'::jsonb,v_reason,v_uid,s.is_test);
        continue;
      end if;

      v_toll_id := nullif(v_row->>'toll_id','')::uuid;
      v_name := nullif(btrim(v_row->>'toll_name'),'');
      if v_toll_id is not null then
        select * into l from public.toll_locations where toll_id = v_toll_id;
        if not found then raise exception 'Peaje aceptado inexistente'; end if;
        v_name := l.name;
      elsif v_name is null then raise exception 'Indicá el peaje aceptado';
      end if;
      v_qty := greatest(coalesce(nullif(v_row->>'quantity','')::numeric,t.quantity),1);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,t.unit_amount),0),2);
      if v_unit <= 0 then raise exception 'El importe del peaje debe ser mayor a cero'; end if;
      v_method := lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),t.payment_method));
      if v_method not in ('cash','electronic','telepass','manual','other') then raise exception 'Medio de peaje inválido'; end if;
      v_payer := lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),'provider'));
      if v_payer not in ('provider','customer') then raise exception 'Responsable comercial de peaje inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_payer = 'customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo pagó el cliente el peaje';
      end if;
      if v_payer = 'provider' then
        v_provider_unit := v_unit; v_customer_unit := 0; v_customer_method := null;
      else
        v_provider_unit := 0; v_customer_unit := v_unit;
      end if;
      v_changed := v_toll_id is distinct from t.toll_id
        or round(v_qty,2) is distinct from t.quantity::numeric
        or v_unit is distinct from t.unit_amount or v_method is distinct from t.payment_method;
      if v_changed or v_decision = 'adjusted' then
        if v_reason is null then raise exception 'Explicá el ajuste realizado al peaje'; end if;
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_tolls(
        service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
        vehicle_category,payment_method,quantity,unit_amount,currency,source,crossed_at,notes,created_by,updated_by,
        is_test,payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,remito_toll_report_id
      ) values (
        p_service_id,v_toll_id,null,case when v_toll_id is null then t.toll_code_snapshot else l.code end,v_name,
        case when v_toll_id is null then t.road_snapshot else l.road end,
        case when v_toll_id is null then t.direction_snapshot else l.direction end,
        'light_2_axles',case when v_method='other' then 'manual' else v_method end,v_qty::integer,v_unit,t.currency,
        'actual',t.crossed_at,v_reason,v_uid,v_uid,s.is_test,v_payer,v_customer_method,v_provider_unit,v_customer_unit,t.toll_report_id
      ) returning service_toll_id into v_service_toll_id;
      v_toll_total := v_toll_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,toll_report_id,decision,original_snapshot,accepted_snapshot,reason,service_toll_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,t.toll_report_id,v_decision,to_jsonb(t),jsonb_build_object(
          'toll_id',v_toll_id,'toll_name',v_name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',t.currency,'payment_method',v_method,
          'payer_agent',v_payer,'customer_payment_method',v_customer_method,
          'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
        ),v_reason,v_service_toll_id,v_uid,s.is_test
      );
    end loop;

    for v_row in select value from jsonb_array_elements(v_excess_decisions) loop
      v_report_id := nullif(v_row->>'excess_report_id','')::uuid;
      select * into x from public.remito_excess_reports
      where excess_report_id = v_report_id and remito_id = r.remito_id;
      if not found then raise exception 'Uno de los excedentes no pertenece al remito'; end if;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'review_reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de excedente inválida'; end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el excedente'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,excess_report_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (p_service_id,r.remito_id,x.excess_report_id,'rejected',to_jsonb(x),'{}'::jsonb,v_reason,v_uid,s.is_test);
        continue;
      end if;
      v_concept_id := coalesce(nullif(v_row->>'concept_id','')::uuid,x.concept_id);
      select * into c from public.service_concepts
      where concept_id = v_concept_id and is_active and default_can_be_secondary and billing_family <> 'system';
      if not found then raise exception 'Seleccioná el concepto comercial del excedente'; end if;
      v_qty := round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,x.quantity),0.01),2);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,x.unit_amount),0),2);
      if v_unit <= 0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
      v_collector := lower(coalesce(nullif(btrim(v_row->>'collector_agent'),''),'company'));
      if v_collector not in ('company','provider') then raise exception 'Cobrador del excedente inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_collector = 'company' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo se cobró el excedente';
      end if;
      if v_collector = 'provider' then v_customer_method := null; end if;
      v_changed := v_concept_id is distinct from x.concept_id or v_qty is distinct from x.quantity or v_unit is distinct from x.unit_amount;
      if v_changed or v_decision = 'adjusted' then
        if v_reason is null then raise exception 'Explicá el ajuste realizado al excedente'; end if;
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_excess_charges(
        service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
        customer_payment_method,created_by,updated_by,is_test,source,remito_excess_report_id
      ) values (
        p_service_id,v_concept_id,c.name,v_qty,v_unit,x.currency,'customer',v_collector,v_customer_method,
        v_uid,v_uid,s.is_test,'actual',x.excess_report_id
      ) returning excess_charge_id into v_excess_charge_id;
      v_excess_total := v_excess_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,excess_report_id,decision,original_snapshot,accepted_snapshot,reason,excess_charge_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,x.excess_report_id,v_decision,to_jsonb(x),jsonb_build_object(
          'concept_id',v_concept_id,'concept_name',c.name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',x.currency,'collector_agent',v_collector,
          'customer_payment_method',v_customer_method
        ),v_reason,v_excess_charge_id,v_uid,s.is_test
      );
    end loop;

    update public.remitos set
      addons_review_status = case when v_adjusted then 'adjusted' else 'approved' end,
      accepted_imp_peaje = round(v_toll_total,2),
      accepted_imp_excedente = round(v_excess_total,2),
      accepted_imp_total_extras = round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2),
      addons_reviewed_by = v_uid,
      addons_reviewed_at = now()
    where remito_id = r.remito_id returning * into r;
  end if;

  v_from_status := s.status;
  perform set_config('app.phase3_bridge','1',true);
  if s.status = 'at_origin' and s.trip_id is not null then
    update public.trips set
      fecha_hora_fin = coalesce(fecha_hora_fin,now()),
      received_at = now(),
      sync_status = 'synced',
      km_traveled = coalesce(r.km_reales,km_traveled)
    where trip_id = s.trip_id;
  end if;

  perform set_config('app.lifecycle_transition','finalize',true);
  perform set_config('app.assignment_reason','finalized',true);
  perform set_config('app.remito_atomic_finalize','1',true);
  update public.operator_services set
    document_status = 'approved',
    administrative_review_status = 'approved',
    status = case when status='at_origin' then 'completed' else status end,
    completed_at = case when status='at_origin' then coalesce(completed_at,now()) else completed_at end,
    billing_status = 'pending',
    assigned_driver_id = case when status='at_origin' then null else assigned_driver_id end,
    assigned_truck_id = case when status='at_origin' then null else assigned_truck_id end,
    updated_by = v_uid,
    updated_at = now()
  where service_id = p_service_id returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values (
    p_service_id,'remito_approved_and_service_finalized',v_from_status,s.status,
    case when v_from_status='completed'
      then 'Remito aprobado; servicio histórico habilitado para Facturación'
      else 'Remito aprobado y servicio finalizado' end,
    v_uid,jsonb_build_object(
      'remito_id',r.remito_id,'review_status',r.addons_review_status,
      'reported_toll_total',coalesce(r.imp_peaje,0),'accepted_toll_total',r.accepted_imp_peaje,
      'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_excess_total',r.accepted_imp_excedente,
      'actor_role',v_role
    )
  );

  return jsonb_build_object(
    'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
    'document_status',s.document_status,'billing_status',s.billing_status,
    'review_status',r.addons_review_status,'idempotent',false
  );
end;
$function$;

revoke all on function public.resolve_operator_service_document_v3(uuid,text,jsonb) from public, anon;
grant execute on function public.resolve_operator_service_document_v3(uuid,text,jsonb) to authenticated;
