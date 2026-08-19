-- AuxiliOS · Google Maps · ubicaciones canónicas v1
-- Bases geográficas ya poseen modelo Places. Esta migración lleva Peajes al mismo contrato.

alter table public.toll_locations
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists postal_code text,
  add column if not exists country text default 'Argentina',
  add column if not exists google_place_id text,
  add column if not exists geocoded_at timestamptz,
  add column if not exists address_source text default 'manual',
  add column if not exists address_verified boolean not null default false,
  add column if not exists place_details jsonb not null default '{}'::jsonb;

update public.toll_locations
set address=coalesce(address,road),
    country=coalesce(country,'Argentina'),
    address_source=coalesce(address_source,'manual'),
    place_details=coalesce(place_details,'{}'::jsonb)
where address is null or country is null or address_source is null or place_details is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.toll_locations'::regclass
      and conname='toll_locations_address_source_check'
  ) then
    alter table public.toll_locations
      add constraint toll_locations_address_source_check
      check (address_source in ('manual','google'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.toll_locations'::regclass
      and conname='toll_locations_coordinates_pair_check'
  ) then
    alter table public.toll_locations
      add constraint toll_locations_coordinates_pair_check
      check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.toll_locations'::regclass
      and conname='toll_locations_verified_address_check'
  ) then
    alter table public.toll_locations
      add constraint toll_locations_verified_address_check
      check (
        not address_verified
        or (google_place_id is not null and latitude is not null and longitude is not null and address is not null)
      );
  end if;
end $$;

create or replace function public.list_toll_catalog(
  p_as_of date default current_date,
  p_include_inactive boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar peajes';
  end if;

  select coalesce(jsonb_agg(row_data order by name),'[]'::jsonb)
  into v_result
  from (
    select l.name,
      jsonb_build_object(
        'toll_id',l.toll_id,'code',l.code,'name',l.name,
        'road',l.road,'address',l.address,'km_marker',l.km_marker,'direction',l.direction,
        'concessionaire',l.concessionaire,'city',l.city,'province',l.province,
        'postal_code',l.postal_code,'country',l.country,
        'latitude',l.latitude,'longitude',l.longitude,
        'google_place_id',l.google_place_id,'geocoded_at',l.geocoded_at,
        'address_source',l.address_source,'address_verified',l.address_verified,
        'place_details',l.place_details,'notes',l.notes,'is_active',l.is_active,
        'rates',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'toll_rate_id',r.toll_rate_id,'vehicle_category',r.vehicle_category,
              'payment_method',r.payment_method,'amount',r.amount,'currency',r.currency,
              'valid_from',r.valid_from,'valid_until',r.valid_until,'notes',r.notes,
              'is_active',r.is_active,
              'is_current',r.is_active and r.valid_from<=coalesce(p_as_of,current_date)
                and (r.valid_until is null or r.valid_until>=coalesce(p_as_of,current_date))
            ) order by r.vehicle_category,r.payment_method,r.valid_from desc
          )
          from public.toll_rates r
          where r.toll_id=l.toll_id and (p_include_inactive or r.is_active)
        ),'[]'::jsonb)
      ) row_data
    from public.toll_locations l
    where p_include_inactive or l.is_active
  ) q;
  return v_result;
end;
$$;

create or replace function public.save_simple_toll(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_toll_id uuid:=nullif(p_payload->>'toll_id','')::uuid;
  v_name text:=coalesce(nullif(btrim(p_payload->>'name'),''),'');
  v_address text:=nullif(btrim(p_payload->>'address'),'');
  v_road text:=nullif(btrim(p_payload->>'road'),'');
  v_amount numeric:=coalesce(nullif(p_payload->>'amount','')::numeric,-1);
  v_is_active boolean:=coalesce((p_payload->>'is_active')::boolean,true);
  v_lat numeric:=nullif(replace(p_payload->>'latitude',',','.'),'')::numeric;
  v_lng numeric:=nullif(replace(p_payload->>'longitude',',','.'),'')::numeric;
  v_place_id text:=nullif(btrim(p_payload->>'google_place_id'),'');
  v_verified boolean:=coalesce((p_payload->>'address_verified')::boolean,false);
  v_details jsonb:=coalesce(p_payload->'place_details','{}'::jsonb);
  v_location public.toll_locations%rowtype;
  v_rate public.toll_rates%rowtype;
begin
  if v_uid is null or v_role<>'administracion' then
    raise exception 'Solo administración puede gestionar peajes';
  end if;
  if v_name='' then raise exception 'El nombre del peaje es obligatorio'; end if;
  if v_amount<0 then raise exception 'El importe debe ser igual o mayor a cero'; end if;
  if (v_lat is null)<>(v_lng is null) then raise exception 'Latitud y longitud deben cargarse juntas'; end if;
  if v_verified and (v_place_id is null or v_lat is null or v_lng is null or v_address is null) then
    raise exception 'Un peaje verificado requiere Place ID, dirección y coordenadas';
  end if;
  if v_road is null then v_road:=nullif(btrim(v_details->>'street'),''); end if;
  if v_road is null then v_road:=v_address; end if;

  if v_toll_id is null then
    insert into public.toll_locations(
      code,name,road,address,direction,city,province,postal_code,country,
      latitude,longitude,google_place_id,geocoded_at,address_source,address_verified,place_details,
      is_active,created_by,updated_by
    ) values(
      'PEAJE-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
      v_name,v_road,v_address,'both',nullif(btrim(p_payload->>'city'),''),
      nullif(btrim(p_payload->>'province'),''),nullif(btrim(p_payload->>'postal_code'),''),
      coalesce(nullif(btrim(p_payload->>'country'),''),'Argentina'),v_lat,v_lng,v_place_id,
      case when v_verified then coalesce(nullif(p_payload->>'geocoded_at','')::timestamptz,now()) end,
      case when v_verified then 'google' else 'manual' end,v_verified,v_details,
      v_is_active,v_uid,v_uid
    ) returning * into v_location;
    v_toll_id:=v_location.toll_id;
  else
    update public.toll_locations
    set name=v_name,road=v_road,address=v_address,
        city=nullif(btrim(p_payload->>'city'),''),
        province=coalesce(nullif(btrim(p_payload->>'province'),''),province),
        postal_code=nullif(btrim(p_payload->>'postal_code'),''),
        country=coalesce(nullif(btrim(p_payload->>'country'),''),country,'Argentina'),
        latitude=v_lat,longitude=v_lng,google_place_id=v_place_id,
        geocoded_at=case when v_verified then coalesce(nullif(p_payload->>'geocoded_at','')::timestamptz,now()) end,
        address_source=case when v_verified then 'google' else 'manual' end,
        address_verified=v_verified,place_details=v_details,
        is_active=v_is_active,updated_by=v_uid,updated_at=now()
    where toll_id=v_toll_id
    returning * into v_location;
    if not found then raise exception 'Peaje inexistente'; end if;
  end if;

  select r.* into v_rate
  from public.toll_rates r
  where r.toll_id=v_toll_id and r.vehicle_category='light_2_axles'
    and r.payment_method='any' and r.is_active and r.valid_from<=current_date
    and (r.valid_until is null or r.valid_until>=current_date)
  order by r.valid_from desc,r.created_at desc limit 1;

  if found then
    if round(v_rate.amount,2)<>round(v_amount,2) then
      if v_rate.valid_from=current_date then
        update public.toll_rates
        set amount=round(v_amount,2),currency='ARS',notes='Actualización desde Peajes y Adicionales'
        where toll_rate_id=v_rate.toll_rate_id returning * into v_rate;
      else
        update public.toll_rates set valid_until=current_date-1 where toll_rate_id=v_rate.toll_rate_id;
        insert into public.toll_rates(
          toll_id,vehicle_category,payment_method,amount,currency,valid_from,valid_until,notes,is_active,created_by
        ) values(
          v_toll_id,'light_2_axles','any',round(v_amount,2),'ARS',current_date,null,
          'Actualización desde Peajes y Adicionales',true,v_uid
        ) returning * into v_rate;
      end if;
    end if;
  else
    insert into public.toll_rates(
      toll_id,vehicle_category,payment_method,amount,currency,valid_from,valid_until,notes,is_active,created_by
    ) values(
      v_toll_id,'light_2_axles','any',round(v_amount,2),'ARS',current_date,null,
      'Alta desde Peajes y Adicionales',true,v_uid
    ) returning * into v_rate;
  end if;

  return jsonb_build_object('toll',to_jsonb(v_location),'rate',to_jsonb(v_rate));
end;
$$;

revoke all on function public.list_toll_catalog(date,boolean) from public,anon;
revoke all on function public.save_simple_toll(jsonb) from public,anon;
grant execute on function public.list_toll_catalog(date,boolean) to authenticated,service_role;
grant execute on function public.save_simple_toll(jsonb) to authenticated,service_role;
