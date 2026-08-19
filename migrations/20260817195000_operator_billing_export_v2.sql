-- AuxiliOS · Facturación · dataset canónico para exportación Excel v2
-- Devuelve únicamente datos comerciales/operativos necesarios para armar reportes configurables.

create or replace function public.get_operator_billing_export_rows_v1(p_service_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_rows jsonb:='[]'::jsonb;
  r record;
  q jsonb;
  v_error text;
  v_rate_item_id uuid;
  v_primary_price numeric:=0;
  v_km_price numeric:=0;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para exportar Facturación';
  end if;
  if coalesce(array_length(p_service_ids,1),0)=0 then
    return jsonb_build_object('rows','[]'::jsonb);
  end if;
  if array_length(p_service_ids,1)>5000 then
    raise exception 'La exportación admite hasta 5000 servicios por archivo';
  end if;

  for r in
    select
      s.service_id,s.service_number,s.service_order_number,s.scheduled_for,s.completed_at,
      s.billing_status,s.company_id,s.primary_concept_id,s.vehicle_plate,s.vehicle_make_model,
      s.customer_name,s.origin,s.destination,s.origin_formatted_address,s.destination_formatted_address,
      s.estimated_distance_km,s.estimated_asphalt_km,s.estimated_gravel_km,
      s.operator_notes,s.driver_notes,s.currency,s.company_estimated_total,s.pricing_snapshot,
      coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
      coalesce(sc.name,'Servicio') service_name,
      coalesce(b.name,'Sin base') billing_base_name,
      u.full_name driver_name,
      case when tr.truck_id is null then null else concat_ws(' · ',nullif(tr.numero_interno,''),nullif(tr.plate,''),nullif(trim(concat_ws(' ',tr.brand,tr.model)) ,'')) end mobile_name,
      rem.observaciones remito_observations
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.billing_bases b on b.base_id=s.billing_base_id
    left join lateral (
      select
        nullif(e.details->>'old_driver_id','')::uuid driver_id,
        nullif(e.details->>'old_truck_id','')::integer truck_id
      from public.operator_service_events e
      where e.service_id=s.service_id and e.event_type='finalized'
      order by e.created_at desc
      limit 1
    ) fin on true
    left join public.remitos rem on rem.remito_id=s.remito_id
    left join public.users u on u.user_id=coalesce(fin.driver_id,s.assigned_driver_id,rem.driver_id)
    left join public.trucks tr on tr.truck_id=coalesce(fin.truck_id,s.assigned_truck_id)
    where s.service_id=any(p_service_ids)
      and s.status='completed'
      and s.billing_status in ('pending','reviewed')
    order by array_position(p_service_ids,s.service_id)
  loop
    q:=null;
    v_error:=null;
    v_rate_item_id:=null;
    v_primary_price:=0;
    v_km_price:=0;

    begin
      q:=app_private.calculate_operator_service_billing_quote_v2(r.service_id);
    exception when others then
      v_error:=sqlerrm;
      q:=coalesce(r.pricing_snapshot,'{}'::jsonb)||jsonb_build_object(
        'current_company_amount',coalesce(r.company_estimated_total,0),
        'company_estimated_total',coalesce(r.company_estimated_total,0)
      );
    end;

    begin
      select nullif(x.value->>'rate_item_id','')::uuid
        into v_rate_item_id
      from jsonb_array_elements(coalesce(q->'components','[]'::jsonb)) x(value)
      where x.value->>'concept_id'=r.primary_concept_id::text
      order by case when x.value->>'role' in ('movement','primary') then 0 else 1 end
      limit 1;
    exception when others then
      v_rate_item_id:=null;
    end;

    if v_rate_item_id is not null then
      select coalesce(i.primary_price,i.base_price,0),coalesce(i.extra_km_price,0)
        into v_primary_price,v_km_price
      from public.company_rate_items i
      where i.rate_item_id=v_rate_item_id;
    end if;

    if coalesce(v_primary_price,0)=0 then
      select coalesce(max(nullif(x.value->>'unit_price','')::numeric) filter(where x.value->>'role' in ('movement','primary')),0)
        into v_primary_price
      from jsonb_array_elements(coalesce(q->'components','[]'::jsonb)) x(value);
    end if;
    if coalesce(v_km_price,0)=0 then
      select coalesce(max(nullif(x.value->>'unit_price','')::numeric) filter(where x.value->>'role'='distance'),0)
        into v_km_price
      from jsonb_array_elements(coalesce(q->'components','[]'::jsonb)) x(value);
    end if;

    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'service_id',r.service_id,
      'service_number',r.service_number,
      'service_order_number',r.service_order_number,
      'scheduled_for',r.scheduled_for,
      'completed_at',r.completed_at,
      'billing_status',r.billing_status,
      'company_id',r.company_id,
      'company_name',r.company_name,
      'driver_name',r.driver_name,
      'mobile_name',r.mobile_name,
      'service_name',r.service_name,
      'billing_base_name',r.billing_base_name,
      'customer_name',r.customer_name,
      'vehicle_plate',r.vehicle_plate,
      'vehicle_make_model',r.vehicle_make_model,
      'origin',r.origin,
      'destination',r.destination,
      'origin_formatted_address',r.origin_formatted_address,
      'destination_formatted_address',r.destination_formatted_address,
      'asphalt_km',round(coalesce(r.estimated_asphalt_km,0),2),
      'gravel_km',round(coalesce(r.estimated_gravel_km,0),2),
      'total_km',round(coalesce(nullif(coalesce(r.estimated_asphalt_km,0)+coalesce(r.estimated_gravel_km,0),0),r.estimated_distance_km,0),2),
      'operator_notes',r.operator_notes,
      'driver_notes',r.driver_notes,
      'remito_observations',r.remito_observations,
      'primary_price',round(coalesce(v_primary_price,0),2),
      'km_unit_price',round(coalesce(v_km_price,0),2),
      'pricing_error',v_error,
      'quote',q
    ));
  end loop;

  return jsonb_build_object('rows',v_rows);
end;
$function$;

revoke all on function public.get_operator_billing_export_rows_v1(uuid[]) from public,anon;
grant execute on function public.get_operator_billing_export_rows_v1(uuid[]) to authenticated;

comment on function public.get_operator_billing_export_rows_v1(uuid[])
is 'Dataset canónico para exportación configurable de Facturación; conserva tarifas, componentes, KM, asignación final y observaciones.';