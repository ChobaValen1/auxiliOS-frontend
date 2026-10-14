-- Particulares v7: crear un servicio particular desde el ingreso de un chofer
-- (remito firmado sin servicio asignado).
--
-- Igual que create_and_finalize_driver_service_intake_v1 (crea, vincula el
-- remito y finaliza), pero en la cuenta Particulares y con presupuesto. Lo que
-- el chofer cobró en el lugar queda como cobro aprobado del remito (cuenta en
-- su rendición) y como pagos del servicio.

create or replace function public.create_private_service_from_intake_v1(
  p_intake_id uuid, p_payload jsonb, p_quoted_total numeric, p_collection jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- Finalizar igual que un ingreso de prestadora.
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
revoke all on function public.create_private_service_from_intake_v1(uuid, jsonb, numeric, jsonb) from public, anon;
grant execute on function public.create_private_service_from_intake_v1(uuid, jsonb, numeric, jsonb) to authenticated;
