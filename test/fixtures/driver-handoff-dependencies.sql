-- Contract-test substitutes for unrelated pricing/addon RPCs.
-- These do NOT prove tariff, RLS or production-trigger integration.
create table test_addons(remito_id integer primary key, payload jsonb);
create function public.get_driver_remito_addons_v2(p_remito_id integer) returns jsonb
language sql as $$ select coalesce((select payload from public.test_addons where remito_id=p_remito_id),'{"tolls":[],"excesses":[],"evidence":[]}'::jsonb) $$;

create function public.save_driver_ad_hoc_remito_v2(p_payload jsonb,p_client_operation_id uuid) returns jsonb
language plpgsql as $$
declare result jsonb;
begin
  result:=public.save_driver_ad_hoc_remito_v1(p_payload,p_client_operation_id);
  if not coalesce((result->>'idempotent')::boolean,false) then
    insert into test_addons values((result->>'remito_id')::integer,
      jsonb_build_object('tolls',p_payload->'tolls','excesses',p_payload->'excesses','evidence',p_payload->'evidence'))
    on conflict(remito_id) do update set payload=excluded.payload;
  end if;
  return result;
end;
$$;

create function public.create_operator_service_v3(p_payload jsonb) returns jsonb
language plpgsql as $$
declare s public.operator_services%rowtype;
begin
  if nullif(p_payload->>'company_id','') is null then raise exception 'Prestadora requerida'; end if;
  if coalesce(jsonb_array_length(p_payload#>'{commercial_addons,tolls}'),0)>0
    or coalesce(jsonb_array_length(p_payload#>'{commercial_addons,excess_charges}'),0)>0 then
    raise exception 'Reported charges leaked into planned charges';
  end if;
  insert into public.operator_services(service_order_number,company_id,status,assigned_driver_id,assigned_truck_id,
    customer_name,customer_phone,customer_email,vehicle_plate,vehicle_make_model,origin,destination,
    origin_lat,origin_lng,destination_lat,destination_lng,origin_place_id,destination_place_id,
    origin_formatted_address,destination_formatted_address,estimated_distance_km,operator_notes)
  select service_order_number,company_id,'assigned',assigned_driver_id,assigned_truck_id,
    customer_name,customer_phone,customer_email,vehicle_plate,vehicle_make_model,origin,destination,
    origin_lat,origin_lng,destination_lat,destination_lng,origin_place_id,destination_place_id,
    origin_formatted_address,destination_formatted_address,estimated_distance_km,operator_notes
  from jsonb_populate_record(null::public.operator_services,p_payload)
  returning * into s;
  return to_jsonb(s);
end;
$$;

create function public.get_operator_service_edit_context(p_service_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('service',to_jsonb(s),'locks',jsonb_build_object('can_edit',true,'remito_locked',s.remito_id is not null))
  from public.operator_services s where service_id=p_service_id;
$$;
create function public.get_operator_service_commercial_addons_v1(p_service_id uuid) returns jsonb language sql as $$
  select '{"tolls":[],"excess_charges":[]}'::jsonb;
$$;
create function public.get_driver_operator_queue_v3() returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.operator_services s where assigned_driver_id=auth.uid();
$$;
create function public.update_operator_service(p_service_id uuid,p_payload jsonb,p_reason text) returns jsonb language sql as $$
  select to_jsonb(s) from public.operator_services s where service_id=p_service_id;
$$;

create function public.test_fail_link() returns trigger language plpgsql as $$
begin
  if new.status='linked' and current_setting('test.fail_link',true)='on' then
    raise exception 'Simulated last-stage link failure';
  end if;
  return new;
end;
$$;
create trigger test_fail_link after update on public.driver_service_intakes for each row execute function public.test_fail_link();
