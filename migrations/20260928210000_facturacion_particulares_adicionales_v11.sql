-- Facturación: pestañas Particulares y Adicionales.
--
-- list_operator_billing_private_v1: servicios particulares finalizados pendientes
--   de facturar, con los datos del cliente para la factura y el cobro.
-- close_private_billing_without_invoice_v1: un particular que no pide factura
--   sale de Facturación (billing_status 'excluded') con motivo, auditado.
-- list_operator_billing_extras_v1: adicionales (excedentes) de los servicios
--   finalizados del período, con quién paga, medio y estado de facturación.

create or replace function public.list_operator_billing_private_v1(
  p_search text default null, p_period_start date default null, p_period_end date default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'service_id', s.service_id, 'service_number', s.service_number, 'service_order_number', s.service_order_number,
      'scheduled_for', s.scheduled_for, 'completed_at', s.completed_at, 'billing_status', s.billing_status,
      'customer_name', s.customer_name, 'customer_document', s.customer_document, 'customer_phone', s.customer_phone,
      'invoice_requested', coalesce(s.invoice_requested, false), 'customer_tax_condition', s.customer_tax_condition,
      'service_name', coalesce(sc.name, 'Servicio'), 'origin', s.origin, 'destination', s.destination,
      'vehicle_plate', s.vehicle_plate, 'driver_name', u.full_name, 'currency', coalesce(s.currency, 'ARS'),
      'quoted_total', s.quoted_total, 'paid', coalesce(p.pagado, 0),
      'balance', greatest(coalesce(s.quoted_total, 0) - coalesce(p.pagado, 0), 0),
      'methods', coalesce(p.medios, '[]'::jsonb))
      order by s.scheduled_for desc)
    from public.operator_services s
    join public.companies c on c.company_id = s.company_id and c.client_kind = 'particular'
    left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
    left join public.users u on u.user_id = s.assigned_driver_id
    left join lateral (
      select sum(sp.amount) pagado, jsonb_agg(distinct sp.method) medios
        from public.service_payments sp where sp.service_id = s.service_id and sp.voided_at is null
    ) p on true
    where s.status = 'completed' and s.billing_status in ('pending', 'reviewed')
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_period_end)
      and (v_search = '' or lower(concat_ws(' ', s.service_number, s.service_order_number, s.customer_name, s.customer_document,
            s.vehicle_plate, s.origin, s.destination, sc.name, u.full_name)) like '%' || v_search || '%')
  ), '[]'::jsonb);
end
$function$;

create or replace function public.close_private_billing_without_invoice_v1(p_service_id uuid, p_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare s public.operator_services%rowtype; v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'No pidió factura');
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'facturacion') then
    raise exception 'Sin permiso para cerrar la facturación';
  end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.quoted_total is null or not exists (select 1 from public.companies c where c.company_id = s.company_id and c.client_kind = 'particular') then
    raise exception 'Sólo un servicio particular se cierra sin factura';
  end if;
  if s.status <> 'completed' or s.billing_status not in ('pending', 'reviewed') then
    raise exception 'El servicio ya no está pendiente de facturar';
  end if;
  if s.invoice_requested and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'El cliente pidió factura: indicá por qué se cierra sin factura';
  end if;
  update public.operator_services set billing_status = 'excluded', updated_by = auth.uid(), updated_at = now() where service_id = p_service_id;
  insert into public.operator_service_billing_revisions(service_id, billing_status, previous_company_amount, company_amount, currency, quote_snapshot, reason)
  values (p_service_id, 'excluded', s.quoted_total, s.quoted_total, coalesce(s.currency, 'ARS'), '{}'::jsonb, 'Particular sin factura: ' || v_reason);
  insert into public.operator_service_events(service_id, event_type, from_status, to_status, notes, created_by, details)
  values (p_service_id, 'billing_closed_without_invoice', 'completed', 'completed', 'Particular cerrado sin factura', auth.uid(),
          jsonb_build_object('reason', v_reason, 'billing_status', 'excluded'));
  return jsonb_build_object('service_id', p_service_id, 'billing_status', 'excluded');
end
$function$;

create or replace function public.list_operator_billing_extras_v1(
  p_search text default null, p_company_id uuid default null, p_period_start date default null, p_period_end date default null)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'excess_charge_id', e.excess_charge_id, 'service_id', s.service_id,
      'service_number', s.service_number, 'service_order_number', s.service_order_number,
      'scheduled_for', s.scheduled_for, 'company_id', s.company_id,
      'company_name', coalesce(c.trade_name, c.legal_name, 'Prestadora'), 'client_kind', c.client_kind,
      'billing_base_name', b.name, 'concept_name', coalesce(e.concept_name_snapshot, sc.name, 'Adicional'),
      'quantity', e.quantity, 'unit_amount', e.unit_amount, 'total_amount', e.total_amount, 'currency', coalesce(e.currency, 'ARS'),
      'payer_agent', e.payer_agent, 'collector_agent', e.collector_agent, 'customer_payment_method', e.customer_payment_method,
      'billing_status', s.billing_status, 'customer_name', s.customer_name, 'vehicle_plate', s.vehicle_plate)
      order by s.scheduled_for desc, e.created_at)
    from public.operator_service_excess_charges e
    join public.operator_services s on s.service_id = e.service_id
    join public.companies c on c.company_id = s.company_id
    left join public.service_concepts sc on sc.concept_id = e.concept_id
    left join public.billing_bases b on b.base_id = s.billing_base_id
    where s.status = 'completed' and s.billing_status in ('pending', 'reviewed', 'invoiced')
      and not coalesce(e.is_test, false)
      and (p_company_id is null or s.company_id = p_company_id)
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date <= p_period_end)
      and (v_search = '' or lower(concat_ws(' ', s.service_number, s.service_order_number, s.customer_name, s.vehicle_plate,
            c.trade_name, c.legal_name, e.concept_name_snapshot, sc.name)) like '%' || v_search || '%')
  ), '[]'::jsonb);
end
$function$;

revoke all on function public.list_operator_billing_private_v1(text, date, date) from public, anon;
revoke all on function public.close_private_billing_without_invoice_v1(uuid, text) from public, anon;
revoke all on function public.list_operator_billing_extras_v1(text, uuid, date, date) from public, anon;
grant execute on function public.list_operator_billing_private_v1(text, date, date) to authenticated;
grant execute on function public.close_private_billing_without_invoice_v1(uuid, text) to authenticated;
grant execute on function public.list_operator_billing_extras_v1(text, uuid, date, date) to authenticated;
