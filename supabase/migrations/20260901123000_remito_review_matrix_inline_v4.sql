alter table public.operator_service_document_addon_reviews
  add column if not exists review_line_kind text,
  add column if not exists review_client_line_id uuid;

do $$
begin
  alter table public.operator_service_document_addon_reviews
    drop constraint if exists operator_service_document_addon_review_owner_chk;
  if not exists(select 1 from pg_constraint where conname='operator_service_document_addon_review_owner_v2_chk') then
    alter table public.operator_service_document_addon_reviews
      add constraint operator_service_document_addon_review_owner_v2_chk
      check (
        (toll_report_id is not null and excess_report_id is null and review_client_line_id is null)
        or (toll_report_id is null and excess_report_id is not null and review_client_line_id is null)
        or (toll_report_id is null and excess_report_id is null and review_client_line_id is not null and review_line_kind in ('toll','excess'))
      );
  end if;
end $$;

create unique index if not exists operator_service_document_client_review_unique
  on public.operator_service_document_addon_reviews(service_id,remito_id,review_client_line_id)
  where review_client_line_id is not null;

create or replace function public.resolve_operator_service_document_v4(
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
  v_client_line_id uuid;
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
    if exists(
      select 1 from public.remito_toll_reports rt
      where rt.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_toll_decisions) d(row)
          where nullif(d.row->>'toll_report_id','')::uuid = rt.toll_report_id
        )
    ) then
      raise exception 'Revisá todos los peajes antes de aprobar';
    end if;
    if exists(
      select 1 from public.remito_excess_reports re
      where re.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_excess_decisions) d(row)
          where nullif(d.row->>'excess_report_id','')::uuid = re.excess_report_id
        )
    ) then
      raise exception 'Revisá todos los excedentes antes de aprobar';
    end if;

    for v_row in select value from jsonb_array_elements(v_toll_decisions) loop
      v_report_id := nullif(v_row->>'toll_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de peaje inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de peaje no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un peaje agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into t from public.remito_toll_reports where toll_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el peaje'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
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
      v_qty := greatest(coalesce(nullif(v_row->>'quantity','')::numeric,t.quantity,1),1);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,t.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del peaje debe ser mayor a cero'; end if;
      v_method := lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),t.payment_method,'manual'));
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
      v_changed := v_report_id is null
        or v_toll_id is distinct from t.toll_id
        or round(v_qty,2) is distinct from t.quantity::numeric
        or v_unit is distinct from t.unit_amount
        or v_method is distinct from t.payment_method;
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
        'light_2_axles',case when v_method='other' then 'manual' else v_method end,v_qty::integer,
        v_unit,coalesce(t.currency,'ARS'),'actual',t.crossed_at,v_reason,v_uid,v_uid,s.is_test,
        v_payer,v_customer_method,v_provider_unit,v_customer_unit,v_report_id
      ) returning service_toll_id into v_service_toll_id;
      v_toll_total := v_toll_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,service_toll_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,jsonb_build_object(
          'toll_id',v_toll_id,'toll_name',v_name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(t.currency,'ARS'),'payment_method',v_method,
          'payer_agent',v_payer,'customer_payment_method',v_customer_method,
          'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
        ),v_reason,v_service_toll_id,v_uid,s.is_test
      );
    end loop;

    for v_row in select value from jsonb_array_elements(v_excess_decisions) loop
      v_report_id := nullif(v_row->>'excess_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'review_reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de excedente inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de excedente no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un excedente agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into x from public.remito_excess_reports where excess_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los excedentes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el excedente'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
        continue;
      end if;

      v_concept_id := coalesce(nullif(v_row->>'concept_id','')::uuid,x.concept_id);
      select * into c from public.service_concepts
      where concept_id = v_concept_id and is_active and default_can_be_secondary and billing_family <> 'system';
      if not found then raise exception 'Seleccioná el concepto comercial del excedente'; end if;
      v_qty := round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,x.quantity,1),0.01),2);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,x.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
      v_collector := lower(coalesce(nullif(btrim(v_row->>'collector_agent'),''),'company'));
      if v_collector not in ('company','provider') then raise exception 'Cobrador del excedente inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_collector = 'company' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo se cobró el excedente';
      end if;
      if v_collector = 'provider' then v_customer_method := null; end if;
      v_changed := v_report_id is null or v_concept_id is distinct from x.concept_id or v_qty is distinct from x.quantity or v_unit is distinct from x.unit_amount;
      if v_changed or v_decision = 'adjusted' then
        if v_reason is null then raise exception 'Explicá el ajuste realizado al excedente'; end if;
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_excess_charges(
        service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
        customer_payment_method,created_by,updated_by,is_test,source,remito_excess_report_id
      ) values (
        p_service_id,v_concept_id,c.name,v_qty,v_unit,coalesce(x.currency,'ARS'),'customer',v_collector,v_customer_method,
        v_uid,v_uid,s.is_test,'actual',v_report_id
      ) returning excess_charge_id into v_excess_charge_id;
      v_excess_total := v_excess_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,excess_charge_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,jsonb_build_object(
          'concept_id',v_concept_id,'concept_name',c.name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(x.currency,'ARS'),'collector_agent',v_collector,
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

revoke all on function public.resolve_operator_service_document_v4(uuid,text,jsonb) from public, anon;
grant execute on function public.resolve_operator_service_document_v4(uuid,text,jsonb) to authenticated;
