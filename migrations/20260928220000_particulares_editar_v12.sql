-- Particulares v12: editar un servicio particular con su propio formulario.
--
-- get_private_service_edit_v1: datos del servicio para prellenar el formulario,
--   con presupuesto, factura, captación y cobro.
-- update_private_service_v1: guarda en un paso los datos del servicio
--   (update_operator_service_v4), el presupuesto y la factura
--   (update_private_service_quote_v1) y quién lo consiguió. Con el remito
--   firmado sólo se mandan los campos que v4 admite en ese estado.

create or replace function public.get_private_service_edit_v1(p_service_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
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

create or replace function public.update_private_service_v1(
  p_service_id uuid, p_payload jsonb, p_quoted_total numeric, p_invoice jsonb default null, p_reason text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  s public.operator_services%rowtype;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb) - 'company_id' - 'service_order_number' - 'items' - 'item_codes'
                     - 'invoice_requested' - 'customer_tax_condition' - 'quoted_total' - 'referred_by_driver_id';
  v_referrer uuid := nullif(p_payload->>'referred_by_driver_id', '')::uuid;
  v_signed boolean;
  v_allowed text[] := array['billing_base_id','primary_concept_id','category_id','scheduled_for','priority','logistics_type',
    'granted_delay_minutes','origin','destination','origin_lat','origin_lng','destination_lat','destination_lng',
    'origin_place_id','destination_place_id','origin_formatted_address','destination_formatted_address',
    'estimated_asphalt_km','estimated_gravel_km','estimated_distance_km','is_holiday','operator_notes'];
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('operador', 'administracion') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found or s.quoted_total is null then raise exception 'No es un servicio particular'; end if;
  if s.status = 'cancelled' then raise exception 'El servicio está anulado'; end if;
  if v_referrer is not null and not exists (
    select 1 from public.users u join public.roles r on r.role_id = u.role_id where u.user_id = v_referrer and r.name = 'chofer') then
    raise exception 'El chofer que consiguió el servicio no es válido';
  end if;
  perform app_private.validate_private_customer_v1(coalesce(p_payload, '{}'::jsonb));

  select exists (select 1 from public.remitos r where r.remito_id = s.remito_id and (r.status = 'firmado' or r.firmado_at is not null)) into v_signed;
  if v_signed then
    -- Con remito firmado, cliente, vehículo y asignación vienen del remito.
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_payload from jsonb_each(v_payload) as e(k, v) where k = any(v_allowed);
    v_payload := v_payload || jsonb_build_object('administrative_revision', s.administrative_revision);
  end if;
  if s.status <> 'completed' and v_payload <> '{}'::jsonb then
    perform public.update_operator_service_v4(p_service_id, v_payload, coalesce(nullif(btrim(p_reason), ''), 'Edición del servicio particular'));
  end if;

  perform public.update_private_service_quote_v1(p_service_id, p_quoted_total, p_invoice, p_reason);
  update public.operator_services set referred_by_driver_id = v_referrer where service_id = p_service_id;
  return public.get_private_service_edit_v1(p_service_id);
end
$function$;

revoke all on function public.get_private_service_edit_v1(uuid) from public, anon;
revoke all on function public.update_private_service_v1(uuid, jsonb, numeric, jsonb, text) from public, anon;
grant execute on function public.get_private_service_edit_v1(uuid) to authenticated;
grant execute on function public.update_private_service_v1(uuid, jsonb, numeric, jsonb, text) to authenticated;
