-- Keep the driver's original document timestamp when Operations creates the
-- administrative service. The browser must not replace it with "now".
create or replace function app_private.driver_intake_service_seed_v1(p_intake jsonb,p_remito jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'service_order_number',coalesce(nullif(p_intake->>'service_reference',''),nullif(p_remito->>'nro_servicio','')),
    'scheduled_for',coalesce(
      nullif(p_remito->>'created_at_device','')::timestamptz,
      nullif(p_remito->>'created_at','')::timestamptz,
      nullif(p_intake->>'created_at_device','')::timestamptz,
      nullif(p_intake->>'created_at','')::timestamptz
    ),
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
      'firmado_at',r.firmado_at,'created_at',r.created_at,'created_at_device',r.created_at_device,
      'km_reales',r.km_reales,'service_type',r.tipo_servicio),
    'addons',public.get_driver_remito_addons_v2(r.remito_id)
  );
end;
$$;
revoke all on function public.get_driver_service_intake_context_v1(uuid) from public,anon;
grant execute on function public.get_driver_service_intake_context_v1(uuid) to authenticated;

-- Billing may reopen a completed, not-yet-invoiced service for an audited
-- administrative correction. Invoiced and cancelled services stay immutable.
create or replace function public.get_operator_billing_service_edit_context_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text:=app_private.current_auxilios_role(); s public.operator_services%rowtype; ctx jsonb;
begin
  if auth.uid() is null or v_role<>'administracion' then
    raise exception 'Sólo Administración puede corregir servicios desde Facturación';
  end if;
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status='cancelled' then raise exception 'Un servicio anulado no puede modificarse'; end if;
  if s.billing_status='invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  ctx:=public.get_operator_service_handoff_context_v2(p_service_id);
  return jsonb_set(ctx,'{locks,can_edit}','true'::jsonb,true)
    ||jsonb_build_object('billing_edit',true,'return_to_review',s.status='completed');
end;
$$;
revoke all on function public.get_operator_billing_service_edit_context_v1(uuid) from public,anon;
grant execute on function public.get_operator_billing_service_edit_context_v1(uuid) to authenticated;

create or replace function public.update_operator_billing_service_v1(
  p_service_id uuid,p_payload jsonb,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  result jsonb;
  started_at timestamptz:=transaction_timestamp();
begin
  if auth.uid() is null or v_role<>'administracion' then
    raise exception 'Sólo Administración puede corregir servicios desde Facturación';
  end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status='cancelled' then raise exception 'Un servicio anulado no puede modificarse'; end if;
  if s.billing_status='invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.status<>'completed' then
    return public.update_operator_service_v4(p_service_id,p_payload,p_reason);
  end if;

  -- Reuse the canonical validator/pricer atomically. The temporary state is not
  -- externally visible and is restored before this transaction can commit.
  update public.operator_services set status='at_origin' where service_id=p_service_id;
  result:=public.update_operator_service_v4(p_service_id,p_payload,p_reason);
  update public.operator_services set
    status='completed',
    completed_at=s.completed_at,
    document_status='submitted',
    administrative_review_status='pending',
    billing_status='not_ready'
  where service_id=p_service_id;

  update public.operator_service_changes set service_status='completed'
  where service_id=p_service_id and changed_by=auth.uid() and changed_at>=started_at and service_status='at_origin';
  update public.operator_service_events set from_status='completed',to_status='completed'
  where service_id=p_service_id and created_by=auth.uid() and created_at>=started_at
    and event_type='administrative_remito_correction';
  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values(
    p_service_id,'billing_service_correction','completed','completed',
    'Corrección desde Facturación; el servicio volvió a revisión',auth.uid(),
    jsonb_build_object('previous_billing_status',s.billing_status,'completed_at_preserved',s.completed_at)
  );
  return result||jsonb_build_object(
    'service_id',p_service_id,'status','completed','billing_status','not_ready','returned_to_review',true
  );
end;
$$;
revoke all on function public.update_operator_billing_service_v1(uuid,jsonb,text) from public,anon;
grant execute on function public.update_operator_billing_service_v1(uuid,jsonb,text) to authenticated;

-- Reassert the complete authenticated-only intake API after function replacement.
revoke all on function public.create_and_link_driver_service_intake_v1(uuid,jsonb) from public,anon;
revoke all on function public.create_and_link_driver_service_intake_v2(uuid,jsonb) from public,anon;
grant execute on function public.create_and_link_driver_service_intake_v1(uuid,jsonb) to authenticated;
grant execute on function public.create_and_link_driver_service_intake_v2(uuid,jsonb) to authenticated;

notify pgrst,'reload schema';
