-- Bandeja documental liviana y segura para Operaciones/Administracion.
-- La firma se obtiene solamente al abrir el remito; no se transporta en cada
-- refresco de la grilla de Servicios.

create or replace function public.list_operator_service_document_connections_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_uid is null
     or v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la recepcion de remitos';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'service_id', s.service_id,
    'service_origin', s.service_origin,
    'toll_coverage_mode', s.toll_coverage_mode,
    'administrative_review_status', s.administrative_review_status,
    'document_status', s.document_status,
    'remito_id', s.remito_id,
    'remito_number', r.nro_remito,
    'remito_status', r.status,
    'remito_received_at', r.received_at,
    'remito_signed_at', r.firmado_at,
    'remito_has_signature', r.firma_imagen_url is not null,
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
    'remito_excess_payment_methods', coalesce(x.excess_payment_methods,'[]'::jsonb),
    'remito_evidence_count', coalesce(e.evidence_count,0)
  )) order by coalesce(r.received_at,s.updated_at,s.created_at) desc), '[]'::jsonb)
  into v_result
  from public.operator_services s
  join public.remitos r on r.remito_id = s.remito_id
  left join lateral (
    select count(*)::integer as toll_count,
           coalesce(sum(tr.total_amount),0)::numeric as toll_total,
           (array_agg(tr.toll_name_snapshot order by tr.created_at,tr.toll_name_snapshot))[1] as toll_first,
           coalesce(jsonb_agg(distinct tr.customer_payment_method)
             filter (where tr.customer_payment_method is not null),'[]'::jsonb) as toll_payment_methods
    from public.remito_toll_reports tr
    where tr.remito_id = r.remito_id
  ) t on true
  left join lateral (
    select count(*)::integer as excess_count,
           coalesce(sum(er.total_amount),0)::numeric as excess_total,
           (array_agg(er.concept_name_snapshot order by er.created_at,er.concept_name_snapshot))[1] as excess_first,
           coalesce(jsonb_agg(distinct er.customer_payment_method)
             filter (where er.customer_payment_method is not null),'[]'::jsonb) as excess_payment_methods
    from public.remito_excess_reports er
    where er.remito_id = r.remito_id
  ) x on true
  left join lateral (
    select count(*)::integer as evidence_count
    from public.remito_evidence re
    where re.remito_id = r.remito_id
  ) e on true;

  return v_result;
end;
$function$;

comment on function public.list_operator_service_document_connections_v2() is
  'Resumen liviano de remitos para Servicios; omite la firma y exige un rol administrativo/operativo valido.';

-- La version anterior no rechazaba de forma explicita auth.uid() nulo. Se
-- conserva para trazabilidad de migraciones, pero deja de estar expuesta.
revoke all on function public.list_operator_service_document_connections_v1()
  from public, anon, authenticated;
revoke all on function public.list_operator_service_document_connections_v2()
  from public, anon, authenticated;
grant execute on function public.list_operator_service_document_connections_v2()
  to authenticated;
