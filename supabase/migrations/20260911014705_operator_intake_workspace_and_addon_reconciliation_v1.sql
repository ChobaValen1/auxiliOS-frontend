-- AuxiliOS · Ingresos operativos y conciliación de adicionales v1
-- La mesa recibe un resumen completo por RPC y la aprobación conserva cada
-- concepto planificado que no haya sido reemplazado por lo informado.

create or replace function public.list_driver_service_intakes_v2(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
      'intake_id',i.intake_id,
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

revoke all on function public.list_driver_service_intakes_v2(integer) from public,anon;
grant execute on function public.list_driver_service_intakes_v2(integer) to authenticated;

create or replace function public.resolve_operator_service_document_v6(
  p_service_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_service public.operator_services%rowtype;
  v_remito public.remitos%rowtype;
  v_preserved_tolls integer := 0;
  v_preserved_excesses integer := 0;
  v_toll_total numeric := 0;
  v_excess_total numeric := 0;
begin
  -- v5 mantiene la validación de rol, el bloqueo, la revisión y el cierre atómico.
  v_result := public.resolve_operator_service_document_v5(p_service_id,p_action,p_payload);

  select * into v_service
  from public.operator_services
  where service_id=p_service_id
  for update;
  select * into v_remito
  from public.remitos
  where remito_id=v_service.remito_id
  for update;

  -- Una línea informada reemplaza solamente a la planificada del mismo concepto
  -- y responsable. Las demás pasan al conjunto actual sin borrar el original.
  insert into public.operator_service_tolls(
    service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,
    road_snapshot,direction_snapshot,vehicle_category,payment_method,quantity,
    unit_amount,currency,source,crossed_at,notes,created_by,updated_by,is_test,
    payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,
    remito_toll_report_id
  )
  select
    planned.service_id,planned.toll_id,planned.toll_rate_id,planned.toll_code_snapshot,
    planned.toll_name_snapshot,planned.road_snapshot,planned.direction_snapshot,
    planned.vehicle_category,planned.payment_method,planned.quantity,planned.unit_amount,
    planned.currency,'actual',planned.crossed_at,
    concat_ws(E'\n',nullif(planned.notes,''),'Conservado desde la planificación al conciliar el remito'),
    v_uid,v_uid,planned.is_test,planned.payer_agent,planned.customer_payment_method,
    planned.provider_unit_amount,planned.customer_unit_amount,null
  from public.operator_service_tolls planned
  where planned.service_id=p_service_id
    and planned.source in ('planned','manual')
    and not exists (
      select 1
      from public.operator_service_tolls actual
      where actual.service_id=planned.service_id
        and actual.source='actual'
        and coalesce(actual.payer_agent,'provider')=coalesce(planned.payer_agent,'provider')
        and (
          (actual.toll_id is not null and actual.toll_id=planned.toll_id)
          or (
            actual.toll_id is null and planned.toll_id is null
            and lower(btrim(actual.toll_name_snapshot))=lower(btrim(planned.toll_name_snapshot))
          )
        )
    );
  get diagnostics v_preserved_tolls = row_count;

  insert into public.operator_service_excess_charges(
    service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,
    payer_agent,collector_agent,customer_payment_method,created_by,updated_by,
    is_test,source,remito_excess_report_id
  )
  select
    planned.service_id,planned.concept_id,planned.concept_name_snapshot,planned.quantity,
    planned.unit_amount,planned.currency,planned.payer_agent,planned.collector_agent,
    planned.customer_payment_method,v_uid,v_uid,planned.is_test,'actual',null
  from public.operator_service_excess_charges planned
  where planned.service_id=p_service_id
    and planned.source in ('planned','manual')
    and not exists (
      select 1
      from public.operator_service_excess_charges actual
      where actual.service_id=planned.service_id
        and actual.source='actual'
        and actual.concept_id=planned.concept_id
        and coalesce(actual.payer_agent,'customer')=coalesce(planned.payer_agent,'customer')
        and coalesce(actual.collector_agent,'company')=coalesce(planned.collector_agent,'company')
    );
  get diagnostics v_preserved_excesses = row_count;

  select coalesce(sum(total_amount),0) into v_toll_total
  from public.operator_service_tolls
  where service_id=p_service_id and source='actual';
  select coalesce(sum(total_amount),0) into v_excess_total
  from public.operator_service_excess_charges
  where service_id=p_service_id and source='actual';

  update public.remitos set
    accepted_imp_peaje=round(v_toll_total,2),
    accepted_imp_excedente=round(v_excess_total,2),
    accepted_imp_total_extras=round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2)
  where remito_id=v_remito.remito_id;

  if v_preserved_tolls>0 or v_preserved_excesses>0 then
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      p_service_id,'remito_addons_reconciled',v_service.status,v_service.status,
      'Adicionales planificados no reemplazados conservados para Facturación',v_uid,
      jsonb_build_object(
        'remito_id',v_remito.remito_id,
        'preserved_planned_tolls',v_preserved_tolls,
        'preserved_planned_excesses',v_preserved_excesses,
        'accepted_toll_total',round(v_toll_total,2),
        'accepted_excess_total',round(v_excess_total,2)
      )
    );
  end if;

  return v_result||jsonb_build_object(
    'reconciled',true,
    'preserved_planned_tolls',v_preserved_tolls,
    'preserved_planned_excesses',v_preserved_excesses,
    'accepted_toll_total',round(v_toll_total,2),
    'accepted_excess_total',round(v_excess_total,2)
  );
end;
$function$;

revoke all on function public.resolve_operator_service_document_v6(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_operator_service_document_v6(uuid,text,jsonb) to authenticated;
