-- Facturación · detalle v5: suma al detalle v4 los datos del recorrido (para el mapa),
-- la activación y los peajes por cruce. Aditiva: no modifica ninguna función existente.
create or replace function public.get_operator_billing_service_detail_v5(p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare d jsonb; extra jsonb;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;
  d := public.get_operator_billing_service_detail_v4(p_service_id);
  select jsonb_build_object(
    'origin_lat', s.origin_lat, 'origin_lng', s.origin_lng,
    'destination_lat', s.destination_lat, 'destination_lng', s.destination_lng,
    'origin_formatted_address', s.origin_formatted_address,
    'destination_formatted_address', s.destination_formatted_address,
    'route_polyline', s.route_polyline, 'route_legs', s.route_legs,
    'route_distance_meters', s.route_distance_meters, 'route_duration_seconds', s.route_duration_seconds,
    'route_provider', s.route_provider,
    'driver_activated', s.driver_activated, 'activation_kind', s.activation_kind, 'activation_km', s.activation_km,
    'arrived_at', s.arrived_at, 'chained_to_service_id', s.chained_to_service_id,
    'tolls', coalesce((select jsonb_agg(jsonb_build_object(
        'name', t.toll_name_snapshot, 'road', t.road_snapshot, 'direction', t.direction_snapshot,
        'quantity', t.quantity, 'total_amount', t.total_amount, 'currency', t.currency,
        'payment_method', t.payment_method, 'payer_agent', t.payer_agent, 'crossed_at', t.crossed_at)
        order by t.crossed_at)
      from public.remito_toll_reports t where t.remito_id = s.remito_id and coalesce(t.is_test,false) = false), '[]'::jsonb)
  ) into extra
  from public.operator_services s where s.service_id = p_service_id;
  return d || jsonb_build_object('service', coalesce(d->'service','{}'::jsonb) || coalesce(extra,'{}'::jsonb));
end $function$;

create or replace function public.get_operator_billing_service_detail_v5_km_v1(p_service_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare previous text := coalesce(current_setting('app.km_rounding_preview',true),''); result jsonb;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  perform set_config('app.km_rounding_preview','1',true);
  begin result := public.get_operator_billing_service_detail_v5(p_service_id);
  exception when others then perform set_config('app.km_rounding_preview',previous,true); raise; end;
  perform set_config('app.km_rounding_preview',previous,true);
  return result;
end $function$;

revoke all on function public.get_operator_billing_service_detail_v5(uuid) from public, anon;
revoke all on function public.get_operator_billing_service_detail_v5_km_v1(uuid) from public, anon;
grant execute on function public.get_operator_billing_service_detail_v5(uuid) to authenticated;
grant execute on function public.get_operator_billing_service_detail_v5_km_v1(uuid) to authenticated;
