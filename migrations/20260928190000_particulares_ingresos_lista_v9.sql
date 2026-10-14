-- Particulares v9: la lista de ingresos del chofer dice si lo marcó como
-- particular y el monto acordado.
CREATE OR REPLACE FUNCTION public.list_driver_service_intakes_v2(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if auth.uid() is null or coalesce(v_role,'') not in ('administracion','operador','supervision') then
    raise exception 'Sin permiso para consultar ingresos de Chofer';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select i.created_at,jsonb_build_object(
      'intake_id',i.intake_id,'driver_activated',i.driver_activated,
      'intake_number',i.intake_number,
      'service_code',coalesce(nullif(btrim(i.service_reference),''),nullif(btrim(r.nro_servicio),''),i.intake_number),
      'service_reference',i.service_reference,
      'status',i.status,
      'document_status',i.document_status,
      'driver_id',i.driver_id,
      'driver_name',u.full_name,
      'truck_id',i.truck_id,
      'truck_label',coalesce(t.numero_interno,t.plate),
      'trip_id',i.trip_id,
      'remito_id',i.remito_id,
      'remito_number',r.nro_remito,
      'vehicle_plate',coalesce(nullif(btrim(r.patente),''),i.vehicle_plate),
      'vehicle_make_model',coalesce(nullif(btrim(r.marca_modelo),''),i.vehicle_make_model),
      'service_type',coalesce(nullif(btrim(r.tipo_servicio),''),i.service_type),
      'origin',coalesce(nullif(btrim(r.origen),''),i.origin),
      'destination',coalesce(nullif(btrim(r.destino),''),i.destination),
      'origin_formatted_address',coalesce(nullif(btrim(r.origin_formatted_address),''),nullif(btrim(i.origin_formatted_address),''),i.origin),
      'destination_formatted_address',coalesce(nullif(btrim(r.destination_formatted_address),''),nullif(btrim(i.destination_formatted_address),''),i.destination),
      'km_traveled',coalesce(r.km_reales,tr.km_traveled,0),
      'customer_name',coalesce(nullif(btrim(r.razon_social),''),i.customer_name),
      'customer_document',r.cuit,
      'customer_phone',coalesce(nullif(btrim(r.telefono),''),i.customer_phone),
      'toll_count',coalesce(addons.toll_count,0),
      'toll_total',coalesce(addons.toll_total,0),
      'excess_count',coalesce(addons.excess_count,0),
      'excess_total',coalesce(addons.excess_total,0),
      'client_kind',i.client_kind,
      'agreed_amount',i.agreed_amount,
      'received_at',i.received_at,
      'created_at',i.created_at
    ) row_data
    from public.driver_service_intakes i
    left join public.users u on u.user_id=i.driver_id
    left join public.trucks t on t.truck_id=i.truck_id
    left join public.remitos r on r.remito_id=i.remito_id
    left join public.trips tr on tr.trip_id=i.trip_id
    left join lateral (
      select
        (select count(*) from public.remito_toll_reports rt where rt.remito_id=i.remito_id) toll_count,
        (select coalesce(sum(rt.total_amount),0) from public.remito_toll_reports rt where rt.remito_id=i.remito_id) toll_total,
        (select count(*) from public.remito_excess_reports re where re.remito_id=i.remito_id) excess_count,
        (select coalesce(sum(re.total_amount),0) from public.remito_excess_reports re where re.remito_id=i.remito_id) excess_total
    ) addons on true
    where i.status='pending_admin'
    order by i.created_at desc
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) q;

  return v_result;
end;
$function$;
