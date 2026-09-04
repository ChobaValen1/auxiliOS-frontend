-- Hace visible en Operaciones/Administración la información cargada por el
-- chofer en el remito. El remito firmado sigue siendo la fuente documental,
-- pero el servicio recibe los datos operativos principales para que la grilla,
-- bandeja de revisión y pantallas administrativas no queden desactualizadas.

create or replace function app_private.sync_operator_service_driver_remito_visibility_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
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
      estimated_distance_km = coalesce(new.km_reales::numeric, s.estimated_distance_km),
      updated_at = now(),
      updated_by = coalesce(new.driver_id, s.updated_by)
  where s.service_id = new.operator_service_id;

  return new;
end;
$function$;

revoke all on function app_private.sync_operator_service_driver_remito_visibility_v1() from public, anon, authenticated;

drop trigger if exists remitos_driver_admin_visibility_v1 on public.remitos;
create trigger remitos_driver_admin_visibility_v1
after insert or update of operator_service_id,document_source,status,firma_imagen_url,razon_social,cuit,telefono,email_cliente,patente,marca_modelo,origen,destino,km_reales,received_at on public.remitos
for each row execute function app_private.sync_operator_service_driver_remito_visibility_v1();

-- Ejecuta la sincronización para remitos de chofer ya recibidos antes de esta
-- migración, sin tocar remitos anulados ni documentos de otro origen.
update public.remitos
set received_at = coalesce(received_at, now())
where operator_service_id is not null
  and coalesce(document_source,'') = 'auxilios_driver'
  and coalesce(status,'pendiente') <> 'anulado';

create or replace function public.list_operator_service_document_connections_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la recepción de remitos';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'service_id', s.service_id,
    'service_origin', s.service_origin,
    'administrative_review_status', s.administrative_review_status,
    'document_status', s.document_status,
    'remito_id', s.remito_id,
    'remito_number', r.nro_remito,
    'remito_status', r.status,
    'remito_received_at', r.received_at,
    'remito_signed_at', r.firmado_at,
    'remito_signature_url', r.firma_imagen_url,
    'remito_customer_name', r.razon_social,
    'remito_customer_document', r.cuit,
    'remito_customer_phone', r.telefono,
    'remito_customer_email', r.email_cliente,
    'remito_vehicle_plate', r.patente,
    'remito_vehicle_make_model', r.marca_modelo,
    'remito_origin', r.origen,
    'remito_destination', r.destino,
    'remito_km_reales', r.km_reales,
    'remito_observations', r.observaciones,
    'remito_conformidad_servicio', r.conformidad_servicio,
    'remito_conformidad_cargos', r.conformidad_cargos,
    'remito_sin_danos', r.sin_danos,
    'remito_conformidad_arrastre', r.conformidad_arrastre,
    'remito_addons_version', r.addons_version,
    'remito_addons_review_status', r.addons_review_status,
    'remito_toll_count', coalesce(t.toll_count,0),
    'remito_toll_total', coalesce(t.toll_total,0),
    'remito_toll_first', t.toll_first,
    'remito_toll_more_count', greatest(coalesce(t.toll_count,0)-1,0),
    'remito_toll_payment_methods', coalesce(t.toll_payment_methods,'[]'::jsonb),
    'remito_excess_count', coalesce(x.excess_count,0),
    'remito_excess_total', coalesce(x.excess_total,0),
    'remito_excess_first', x.excess_first,
    'remito_excess_more_count', greatest(coalesce(x.excess_count,0)-1,0),
    'remito_excess_payment_methods', coalesce(x.excess_payment_methods,'[]'::jsonb)
  )) order by coalesce(r.received_at,s.updated_at,s.created_at) desc), '[]'::jsonb)
  into v_result
  from public.operator_services s
  left join public.remitos r on r.remito_id = s.remito_id
  left join lateral (
    select count(*)::integer as toll_count,
           coalesce(sum(tr.total_amount),0)::numeric as toll_total,
           (array_agg(tr.toll_name_snapshot order by tr.created_at, tr.toll_name_snapshot))[1] as toll_first,
           coalesce(jsonb_agg(distinct tr.customer_payment_method) filter (where tr.customer_payment_method is not null), '[]'::jsonb) as toll_payment_methods
    from public.remito_toll_reports tr
    where tr.remito_id = r.remito_id
  ) t on true
  left join lateral (
    select count(*)::integer as excess_count,
           coalesce(sum(er.total_amount),0)::numeric as excess_total,
           (array_agg(er.concept_name_snapshot order by er.created_at, er.concept_name_snapshot))[1] as excess_first,
           coalesce(jsonb_agg(distinct er.customer_payment_method) filter (where er.customer_payment_method is not null), '[]'::jsonb) as excess_payment_methods
    from public.remito_excess_reports er
    where er.remito_id = r.remito_id
  ) x on true;

  return v_result;
end;
$function$;

revoke all on function public.list_operator_service_document_connections_v1() from public, anon;
grant execute on function public.list_operator_service_document_connections_v1() to authenticated;

create or replace function public.get_operator_service_remito_review_v1(p_service_id uuid)
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
  v_driver_name text;
  v_company_name text;
  v_report jsonb;
  v_planned_tolls jsonb;
  v_planned_excess jsonb;
  v_toll_catalog jsonb;
  v_concepts jsonb;
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para revisar remitos';
  end if;

  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id = s.remito_id;
  if not found then raise exception 'Remito inexistente'; end if;

  select u.full_name into v_driver_name from public.users u where u.user_id = r.driver_id;
  select coalesce(c.trade_name,c.legal_name) into v_company_name from public.companies c where c.company_id = s.company_id;
  v_report := public.get_driver_remito_addons_v2(r.remito_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_toll_id', t.service_toll_id,
    'toll_id', t.toll_id,
    'toll_name', t.toll_name_snapshot,
    'quantity', t.quantity,
    'unit_amount', t.unit_amount,
    'total_amount', t.total_amount,
    'currency', t.currency,
    'payer_agent', t.payer_agent,
    'customer_payment_method', t.customer_payment_method
  ) order by t.created_at), '[]'::jsonb)
  into v_planned_tolls
  from public.operator_service_tolls t
  where t.service_id = p_service_id and t.source in ('planned','manual');

  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_charge_id', e.excess_charge_id,
    'concept_id', e.concept_id,
    'concept_name', e.concept_name_snapshot,
    'quantity', e.quantity,
    'unit_amount', e.unit_amount,
    'total_amount', e.total_amount,
    'currency', e.currency,
    'collector_agent', e.collector_agent,
    'customer_payment_method', e.customer_payment_method
  ) order by e.created_at), '[]'::jsonb)
  into v_planned_excess
  from public.operator_service_excess_charges e
  where e.service_id = p_service_id and e.source in ('planned','manual');

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id', l.toll_id,
    'name', l.name,
    'code', l.code,
    'road', l.road,
    'direction', l.direction
  ) order by l.name), '[]'::jsonb)
  into v_toll_catalog
  from public.toll_locations l
  where l.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id', c.concept_id,
    'name', c.name,
    'code', c.code
  ) order by c.sort_order,c.name), '[]'::jsonb)
  into v_concepts
  from public.service_concepts c
  where c.is_active and c.default_can_be_secondary and c.billing_family <> 'system';

  return jsonb_build_object(
    'service', jsonb_build_object(
      'service_id', s.service_id,
      'service_number', s.service_number,
      'service_order_number', s.service_order_number,
      'status', s.status,
      'document_status', s.document_status,
      'administrative_review_status', s.administrative_review_status,
      'billing_status', s.billing_status,
      'company_name', v_company_name,
      'customer_name', s.customer_name,
      'customer_phone', s.customer_phone,
      'vehicle_plate', s.vehicle_plate,
      'vehicle_make_model', s.vehicle_make_model,
      'origin', s.origin,
      'destination', s.destination,
      'estimated_distance_km', s.estimated_distance_km,
      'scheduled_for', s.scheduled_for,
      'toll_coverage_mode', s.toll_coverage_mode,
      'invoiced', s.billing_status = 'invoiced'
    ),
    'remito', jsonb_build_object(
      'remito_id', r.remito_id,
      'remito_number', r.nro_remito,
      'status', r.status,
      'driver_name', v_driver_name,
      'received_at', r.received_at,
      'signed_at', r.firmado_at,
      'signature_url', r.firma_imagen_url,
      'km', r.km_reales,
      'km_reales', r.km_reales,
      'customer_name', r.razon_social,
      'customer_document', r.cuit,
      'customer_phone', r.telefono,
      'customer_email', r.email_cliente,
      'vehicle_plate', r.patente,
      'vehicle_make_model', r.marca_modelo,
      'origin', r.origen,
      'destination', r.destino,
      'observations', r.observaciones,
      'conformity_service', r.conformidad_servicio,
      'conformity_charges', r.conformidad_cargos,
      'conformity_no_damage', r.sin_danos,
      'conformity_tow', r.conformidad_arrastre,
      'reported_toll_total', coalesce(r.imp_peaje,0),
      'reported_excess_total', coalesce(r.imp_excedente,0),
      'reported_other_total', coalesce(r.imp_otros,0),
      'legacy_photos', coalesce(to_jsonb(r.foto_urls),'[]'::jsonb)
    ),
    'reported', v_report,
    'planned', jsonb_build_object('tolls', v_planned_tolls, 'excesses', v_planned_excess),
    'references', jsonb_build_object('tolls', v_toll_catalog, 'excess_concepts', v_concepts),
    'can_resolve', v_role = 'administracion' and s.billing_status <> 'invoiced' and s.document_status in ('submitted','approved')
  );
end;
$function$;

revoke all on function public.get_operator_service_remito_review_v1(uuid) from public, anon;
grant execute on function public.get_operator_service_remito_review_v1(uuid) to authenticated;
