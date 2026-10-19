-- Restaurar sólo si no quedan servicios Sin costo que deban editarse.
CREATE OR REPLACE FUNCTION public.create_private_service_from_intake_v1(p_intake_id uuid, p_payload jsonb, p_quoted_total numeric, p_collection jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company uuid := app_private.private_company_id_v1();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_referrer uuid := nullif(p_payload->>'referred_by_driver_id', '')::uuid;
  v_intake public.driver_service_intakes%rowtype;
  v_created jsonb; v_review jsonb; v_result jsonb;
  v_service uuid; v_tolls jsonb; v_excesses jsonb;
  v_lines jsonb := '[]'::jsonb; v_line jsonb; v_total numeric := 0;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para crear y finalizar el servicio';
  end if;
  if v_company is null then raise exception 'Falta configurar la cuenta Particulares'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  perform app_private.validate_private_customer_v1(v_payload);
  select * into v_intake from public.driver_service_intakes where intake_id = p_intake_id;
  if not found then raise exception 'Ingreso inexistente'; end if;
  if v_intake.driver_activated then raise exception 'Un activado no se puede cargar como particular'; end if;
  if v_referrer is not null and not exists (
    select 1 from public.users u join public.roles r on r.role_id = u.role_id
     where u.user_id = v_referrer and r.name = 'chofer') then
    raise exception 'El chofer que consiguió el servicio no es válido';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_collection->'lines', '[]'::jsonb)) loop
    if coalesce(v_line->>'method', '') not in ('cash', 'transfer', 'card', 'mercado_pago', 'other') then
      raise exception 'Medio de pago inválido';
    end if;
    if coalesce(nullif(v_line->>'amount', '')::numeric, 0) <= 0 then raise exception 'Importe cobrado inválido'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('method', v_line->>'method', 'amount', round((v_line->>'amount')::numeric, 2)));
    v_total := v_total + round((v_line->>'amount')::numeric, 2);
  end loop;
  if v_total > round(p_quoted_total, 2) then raise exception 'Lo cobrado no puede superar el presupuesto'; end if;

  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  if nullif(btrim(v_payload->>'service_order_number'), '') is null then
    v_payload := v_payload || jsonb_build_object('service_order_number',
      'PART-' || lpad(nextval('public.private_service_number_seq')::text, 5, '0'));
  end if;
  v_created := public.create_and_link_driver_service_intake_v2(p_intake_id,
    v_payload - 'invoice_requested' - 'customer_tax_condition' - 'quoted_total' - 'referred_by_driver_id');
  v_service := (v_created->>'service_id')::uuid;
  if v_service is null then raise exception 'No se creó el servicio'; end if;
  if coalesce((v_created->>'idempotent')::boolean, false) then return v_created; end if;

  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((v_payload->>'invoice_requested')::boolean, false),
         customer_tax_condition = nullif(v_payload->>'customer_tax_condition', ''),
         referred_by_driver_id = v_referrer,
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2))
   where service_id = v_service;

  if jsonb_array_length(v_lines) > 0 then
    insert into public.service_collection_reports
      (service_id, remito_id, driver_id, lines, collected_total, not_collected, reason, status, review_note, reviewed_by, reviewed_at)
    values (v_service, v_intake.remito_id, v_intake.driver_id, v_lines, v_total, false, null,
            'approved', 'Cargado por Operaciones al crear el servicio desde el ingreso', auth.uid(), now());
    insert into public.service_payments (service_id, kind, amount, method, received_by, note)
    select v_service, 'saldo', (l->>'amount')::numeric, l->>'method', v_intake.driver_id, 'Cobrado por el chofer en el lugar'
      from jsonb_array_elements(v_lines) l;
  end if;

  v_review := public.get_operator_service_remito_review_v3(v_service);
  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_report_id', line->'toll_report_id', 'review_line_client_id', line->'review_line_client_id',
    'decision', case when coalesce((line->>'administratively_excluded')::boolean, false) then 'rejected' when line->>'toll_report_id' is null then 'adjusted' else 'accepted' end,
    'reason', case when coalesce((line->>'administratively_excluded')::boolean, false) then 'Excluido en la corrección administrativa' end,
    'toll_id', line->'toll_id', 'toll_name', line->'toll_name',
    'quantity', coalesce(line->'quantity', '1'::jsonb),
    'unit_amount', coalesce(line->'unit_amount', line->'total_amount'),
    'payment_method', coalesce(line->'payment_method', '"manual"'::jsonb),
    'payer_agent', coalesce(line->'payer_agent', case when nullif(line->>'customer_payment_method', '') is null then '"provider"'::jsonb else '"customer"'::jsonb end),
    'customer_payment_method', line->'customer_payment_method'
  )), '[]'::jsonb) into v_tolls from jsonb_array_elements(coalesce(v_review#>'{reported,tolls}', '[]'::jsonb)) line;
  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_report_id', line->'excess_report_id', 'review_line_client_id', line->'review_line_client_id',
    'decision', case when coalesce((line->>'administratively_excluded')::boolean, false) then 'rejected' when line->>'excess_report_id' is null then 'adjusted' else 'accepted' end,
    'review_reason', case when coalesce((line->>'administratively_excluded')::boolean, false) then 'Excluido en la corrección administrativa' end,
    'concept_id', line->'concept_id',
    'quantity', coalesce(line->'quantity', '1'::jsonb),
    'unit_amount', coalesce(line->'unit_amount', line->'total_amount'),
    'payer_agent', coalesce(line->'payer_agent', '"customer"'::jsonb),
    'collector_agent', coalesce(line->'collector_agent', '"company"'::jsonb),
    'customer_payment_method', coalesce(line->'customer_payment_method', line->'payment_method')
  )), '[]'::jsonb) into v_excesses from jsonb_array_elements(coalesce(v_review#>'{reported,excesses}', '[]'::jsonb)) line;
  v_result := public.resolve_operator_service_document_v6(v_service, 'approve_and_finalize',
    jsonb_build_object('tolls', v_tolls, 'excesses', v_excesses,
      'administrative_revision', coalesce((v_review->>'administrative_revision')::integer, 0)));

  return v_created || jsonb_build_object('finalized', true, 'resolution', v_result, 'client_kind', 'particular',
    'collected_total', v_total) || app_private.service_balance_v1(v_service);
end
$function$;

CREATE OR REPLACE FUNCTION public.create_private_service_v1(p_payload jsonb, p_quoted_total numeric, p_deposit jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company uuid := app_private.private_company_id_v1();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_result jsonb;
  v_service uuid;
  v_deposit numeric := nullif(p_deposit->>'amount', '')::numeric;
  v_referrer uuid := nullif(p_payload->>'referred_by_driver_id', '')::uuid;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para crear servicios';
  end if;
  if v_company is null then raise exception 'Falta configurar la cuenta Particulares'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  perform app_private.validate_private_customer_v1(v_payload);
  if v_deposit is not null and (v_deposit < 0 or v_deposit > p_quoted_total) then
    raise exception 'El pago no puede superar el presupuesto';
  end if;
  if v_referrer is not null and not exists (
    select 1 from public.users u join public.roles r on r.role_id = u.role_id
     where u.user_id = v_referrer and r.name = 'chofer') then
    raise exception 'El chofer que consiguió el servicio no es válido';
  end if;

  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  if nullif(btrim(v_payload->>'service_order_number'), '') is null then
    v_payload := v_payload || jsonb_build_object('service_order_number',
      'PART-' || lpad(nextval('public.private_service_number_seq')::text, 5, '0'));
  end if;
  v_result := public.create_operator_service_v4(
    v_payload - 'invoice_requested' - 'customer_tax_condition' - 'quoted_total' - 'referred_by_driver_id');
  v_service := (v_result->>'service_id')::uuid;

  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((v_payload->>'invoice_requested')::boolean, false),
         customer_tax_condition = nullif(v_payload->>'customer_tax_condition', ''),
         referred_by_driver_id = v_referrer,
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2))
   where service_id = v_service;

  if coalesce(v_deposit, 0) > 0 then
    insert into public.service_payments (service_id, kind, amount, method, received_by, note)
    values (v_service,
            case when round(v_deposit, 2) >= round(p_quoted_total, 2) then 'saldo' else 'sena' end,
            round(v_deposit, 2), coalesce(nullif(p_deposit->>'method', ''), 'cash'), auth.uid(),
            nullif(btrim(p_deposit->>'note'), ''));
  end if;

  return v_result || jsonb_build_object('client_kind', 'particular', 'referred_by_driver_id', v_referrer)
                  || app_private.service_balance_v1(v_service);
end
$function$;

CREATE OR REPLACE FUNCTION public.get_private_service_edit_v1(p_service_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.operator_services%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found or s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  return jsonb_build_object(
    'service_id', s.service_id, 'service_number', s.service_number, 'service_order_number', s.service_order_number,
    'status', s.status, 'billing_status', s.billing_status, 'administrative_revision', s.administrative_revision,
    'remito_signed', exists (select 1 from public.remitos r where r.remito_id = s.remito_id and (r.status = 'firmado' or r.firmado_at is not null)),
    'customer_name', s.customer_name, 'customer_phone', s.customer_phone, 'customer_document', s.customer_document,
    'vehicle_plate', s.vehicle_plate, 'vehicle_make_model', s.vehicle_make_model,
    'primary_concept_id', s.primary_concept_id, 'billing_base_id', s.billing_base_id, 'scheduled_for', s.scheduled_for,
    'origin', s.origin, 'destination', s.destination, 'origin_lat', s.origin_lat, 'origin_lng', s.origin_lng,
    'destination_lat', s.destination_lat, 'destination_lng', s.destination_lng,
    'origin_place_id', s.origin_place_id, 'destination_place_id', s.destination_place_id,
    'origin_formatted_address', s.origin_formatted_address, 'destination_formatted_address', s.destination_formatted_address,
    'assigned_driver_id', s.assigned_driver_id, 'assigned_truck_id', s.assigned_truck_id,
    'operator_notes', s.operator_notes, 'referred_by_driver_id', s.referred_by_driver_id,
    'invoice_requested', coalesce(s.invoice_requested, false), 'customer_tax_condition', s.customer_tax_condition
  ) || app_private.service_balance_v1(p_service_id);
end
$function$;

CREATE OR REPLACE FUNCTION public.update_private_service_quote_v1(p_service_id uuid, p_quoted_total numeric, p_invoice jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s public.operator_services%rowtype;
  v_pagado numeric;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  select * into v_s from public.operator_services where service_id = p_service_id for update;
  if not found or v_s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  if v_s.billing_status = 'invoiced' then raise exception 'El servicio ya está facturado'; end if;
  if p_quoted_total is null or p_quoted_total <= 0 then raise exception 'Completá el presupuesto'; end if;
  select coalesce(sum(amount), 0) into v_pagado from public.service_payments
   where service_id = p_service_id and voided_at is null;
  if p_quoted_total < v_pagado then
    raise exception 'El presupuesto no puede ser menor a lo ya cobrado ($%)', v_pagado;
  end if;
  if p_invoice is not null then
    perform app_private.validate_private_customer_v1(jsonb_build_object(
      'customer_name', v_s.customer_name, 'customer_phone', v_s.customer_phone,
      'customer_document', coalesce(p_invoice->>'customer_document', v_s.customer_document),
      'invoice_requested', p_invoice->'invoice_requested',
      'customer_tax_condition', p_invoice->>'customer_tax_condition'));
  end if;
  update public.operator_services
     set quoted_total = round(p_quoted_total, 2),
         invoice_requested = coalesce((p_invoice->>'invoice_requested')::boolean, invoice_requested),
         customer_tax_condition = case when p_invoice ? 'customer_tax_condition'
                                       then nullif(p_invoice->>'customer_tax_condition', '') else customer_tax_condition end,
         customer_document = coalesce(nullif(regexp_replace(coalesce(p_invoice->>'customer_document', ''), '\D', '', 'g'), ''), customer_document),
         pricing_snapshot = coalesce(pricing_snapshot, '{}'::jsonb)
           || jsonb_build_object('mode', 'presupuesto', 'quoted_total', round(p_quoted_total, 2),
                                 'quote_changed_reason', nullif(btrim(p_reason), ''))
   where service_id = p_service_id;
  return app_private.service_balance_v1(p_service_id);
end
$function$;
