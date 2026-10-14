-- Peajes: el importe nuevo rige desde la fecha de ARGENTINA, no la del servidor (UTC).
-- Entre las 21:00 y las 24:00 de Argentina, current_date ya es el día siguiente:
-- el importe se guardaba "desde mañana" y la pantalla (que pide el vigente con la
-- fecha local) seguía mostrando el anterior, como si no se hubiera guardado.
-- Mismo cuerpo que antes; sólo cambia current_date por v_hoy.

create or replace function public.save_simple_toll(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_toll_id uuid := nullif(p_payload->>'toll_id', '')::uuid;
  v_name text := coalesce(nullif(btrim(p_payload->>'name'), ''), '');
  v_address text := nullif(btrim(p_payload->>'address'), '');
  v_amount numeric := coalesce(nullif(p_payload->>'amount', '')::numeric, -1);
  v_is_active boolean := coalesce((p_payload->>'is_active')::boolean, true);
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_location public.toll_locations%rowtype;
  v_rate public.toll_rates%rowtype;
begin
  if v_uid is null or v_role <> 'administracion' then
    raise exception 'Solo administración puede gestionar peajes';
  end if;
  if v_name = '' then raise exception 'El nombre del peaje es obligatorio'; end if;
  if v_amount < 0 then raise exception 'El importe debe ser igual o mayor a cero'; end if;

  if v_toll_id is null then
    insert into public.toll_locations(code,name,road,direction,is_active,created_by,updated_by,latitude,longitude)
    values('PEAJE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),v_name,v_address,'both',v_is_active,v_uid,v_uid,
      nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric) /* ubicacion_v1 */
    returning * into v_location;
    v_toll_id := v_location.toll_id;
  else
    update public.toll_locations
    set name=v_name, road=v_address, is_active=v_is_active, updated_by=v_uid, updated_at=now(),
        latitude=coalesce(nullif(p_payload->>'latitude','')::numeric, latitude),
        longitude=coalesce(nullif(p_payload->>'longitude','')::numeric, longitude)
    where toll_id=v_toll_id
    returning * into v_location;
    if not found then raise exception 'Peaje inexistente'; end if;
  end if;

  select r.* into v_rate
  from public.toll_rates r
  where r.toll_id=v_toll_id
    and r.vehicle_category='light_2_axles'
    and r.payment_method='any'
    and r.is_active
    and r.valid_from<=v_hoy
    and (r.valid_until is null or r.valid_until>=v_hoy)
  order by r.valid_from desc, r.created_at desc
  limit 1;

  if found then
    if round(v_rate.amount,2)<>round(v_amount,2) then
      if v_rate.valid_from=v_hoy then
        update public.toll_rates
        set amount=round(v_amount,2), currency='ARS', notes='Actualización desde Peajes y Adicionales'
        where toll_rate_id=v_rate.toll_rate_id
        returning * into v_rate;
      else
        update public.toll_rates set valid_until=v_hoy-1 where toll_rate_id=v_rate.toll_rate_id;
        insert into public.toll_rates(toll_id,vehicle_category,payment_method,amount,currency,valid_from,valid_until,notes,is_active,created_by)
        values(v_toll_id,'light_2_axles','any',round(v_amount,2),'ARS',v_hoy,null,'Actualización desde Peajes y Adicionales',true,v_uid)
        returning * into v_rate;
      end if;
    end if;
  else
    insert into public.toll_rates(toll_id,vehicle_category,payment_method,amount,currency,valid_from,valid_until,notes,is_active,created_by)
    values(v_toll_id,'light_2_axles','any',round(v_amount,2),'ARS',v_hoy,null,'Alta desde Peajes y Adicionales',true,v_uid)
    returning * into v_rate;
  end if;

  return jsonb_build_object('toll',to_jsonb(v_location),'rate',to_jsonb(v_rate));
end;
$function$;
