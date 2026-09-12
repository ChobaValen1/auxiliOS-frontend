-- AuxiliOS · Remito sin asignación · ubicaciones Google Maps v1

alter table public.driver_service_intakes
  add column if not exists origin_lat numeric(10,7),
  add column if not exists origin_lng numeric(10,7),
  add column if not exists destination_lat numeric(10,7),
  add column if not exists destination_lng numeric(10,7),
  add column if not exists origin_place_id text,
  add column if not exists destination_place_id text,
  add column if not exists origin_formatted_address text,
  add column if not exists destination_formatted_address text;

alter table public.remitos
  add column if not exists origin_lat numeric(10,7),
  add column if not exists origin_lng numeric(10,7),
  add column if not exists destination_lat numeric(10,7),
  add column if not exists destination_lng numeric(10,7),
  add column if not exists origin_place_id text,
  add column if not exists destination_place_id text,
  add column if not exists origin_formatted_address text,
  add column if not exists destination_formatted_address text;

alter table public.trips
  add column if not exists origin_lat numeric(10,7),
  add column if not exists origin_lng numeric(10,7),
  add column if not exists destination_lat numeric(10,7),
  add column if not exists destination_lng numeric(10,7),
  add column if not exists origin_place_id text,
  add column if not exists destination_place_id text,
  add column if not exists origin_formatted_address text,
  add column if not exists destination_formatted_address text;

create or replace function public.save_driver_ad_hoc_remito_v3(
  p_payload jsonb,
  p_client_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_intake_id uuid;
  v_remito_id integer;
  v_trip_id integer;
  v_origin_lat numeric:=nullif(p_payload->>'origin_lat','')::numeric;
  v_origin_lng numeric:=nullif(p_payload->>'origin_lng','')::numeric;
  v_destination_lat numeric:=nullif(p_payload->>'destination_lat','')::numeric;
  v_destination_lng numeric:=nullif(p_payload->>'destination_lng','')::numeric;
  v_origin_place_id text:=nullif(btrim(p_payload->>'origin_place_id'),'');
  v_destination_place_id text:=nullif(btrim(p_payload->>'destination_place_id'),'');
  v_origin_address text:=nullif(btrim(p_payload->>'origin_formatted_address'),'');
  v_destination_address text:=nullif(btrim(p_payload->>'destination_formatted_address'),'');
begin
  if v_uid is null or app_private.current_auxilios_role()<>'chofer' then
    raise exception 'Sólo el Chofer puede guardar el remito';
  end if;
  if coalesce(nullif(p_payload->>'maps_version','')::integer,0)<>1 then
    raise exception 'Versión de ubicaciones inválida';
  end if;
  if v_origin_place_id is null or v_destination_place_id is null
     or v_origin_address is null or v_destination_address is null
     or v_origin_lat is null or v_origin_lng is null
     or v_destination_lat is null or v_destination_lng is null then
    raise exception 'Seleccioná origen y destino desde Google Maps';
  end if;
  if v_origin_lat not between -90 and 90 or v_destination_lat not between -90 and 90
     or v_origin_lng not between -180 and 180 or v_destination_lng not between -180 and 180 then
    raise exception 'Coordenadas de Google Maps inválidas';
  end if;

  select public.save_driver_ad_hoc_remito_v2(p_payload,p_client_operation_id) into v_result;
  v_intake_id:=(v_result->>'intake_id')::uuid;
  v_remito_id:=(v_result->>'remito_id')::integer;
  v_trip_id:=(v_result->>'trip_id')::integer;

  update public.driver_service_intakes set
    origin=v_origin_address,destination=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address,
    updated_at=now()
  where intake_id=v_intake_id and driver_id=v_uid;

  update public.remitos set
    origen=v_origin_address,destino=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address
  where remito_id=v_remito_id and driver_id=v_uid;

  update public.trips set
    origin=v_origin_address,destination=v_destination_address,
    origin_lat=v_origin_lat,origin_lng=v_origin_lng,
    destination_lat=v_destination_lat,destination_lng=v_destination_lng,
    origin_place_id=v_origin_place_id,destination_place_id=v_destination_place_id,
    origin_formatted_address=v_origin_address,destination_formatted_address=v_destination_address
  where trip_id=v_trip_id and driver_id=v_uid;

  return v_result||jsonb_build_object('maps_version',1,'maps_verified',true);
end;
$function$;

revoke all on function public.save_driver_ad_hoc_remito_v3(jsonb,uuid) from public,anon;
grant execute on function public.save_driver_ad_hoc_remito_v3(jsonb,uuid) to authenticated;

create or replace function app_private.sync_driver_intake_maps_to_service()
returns trigger
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
begin
  if new.linked_service_id is not null then
    update public.operator_services set
      origin=new.origin,destination=new.destination,
      origin_lat=new.origin_lat,origin_lng=new.origin_lng,
      destination_lat=new.destination_lat,destination_lng=new.destination_lng,
      origin_place_id=new.origin_place_id,destination_place_id=new.destination_place_id,
      origin_formatted_address=new.origin_formatted_address,
      destination_formatted_address=new.destination_formatted_address,
      updated_at=now()
    where service_id=new.linked_service_id;
  end if;
  return new;
end;
$function$;

revoke all on function app_private.sync_driver_intake_maps_to_service() from public,anon,authenticated;
drop trigger if exists driver_intake_maps_to_service_trg on public.driver_service_intakes;
create trigger driver_intake_maps_to_service_trg
after update of linked_service_id on public.driver_service_intakes
for each row
when (new.linked_service_id is not null)
execute function app_private.sync_driver_intake_maps_to_service();
