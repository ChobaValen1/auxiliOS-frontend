-- AuxiliOS · Peajes canónicos en alta/edición de Servicios
-- Los peajes nuevos deben provenir del catálogo y su importe se toma de toll_rates.

create or replace function app_private.normalize_service_catalog_tolls(
  p_service_id uuid,
  p_scheduled_for timestamptz,
  p_tolls jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_toll jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_toll_id uuid;
  v_rate_id uuid;
  v_quantity integer;
  v_vehicle_category text;
  v_payment_method text;
  v_location public.toll_locations%rowtype;
  v_rate public.toll_rates%rowtype;
  v_existing public.operator_service_tolls%rowtype;
  v_date date := (coalesce(p_scheduled_for, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_seen uuid[] := '{}'::uuid[];
begin
  if jsonb_typeof(coalesce(p_tolls, '[]'::jsonb)) <> 'array' then
    raise exception 'Los peajes del servicio deben enviarse como una lista';
  end if;

  for v_toll in select value from jsonb_array_elements(coalesce(p_tolls, '[]'::jsonb)) loop
    v_toll_id := nullif(v_toll->>'toll_id','')::uuid;
    v_rate_id := nullif(v_toll->>'toll_rate_id','')::uuid;
    v_quantity := greatest(coalesce(nullif(v_toll->>'quantity','')::integer,1),1);
    v_vehicle_category := lower(coalesce(nullif(btrim(v_toll->>'vehicle_category'),''),'light_2_axles'));
    v_payment_method := lower(coalesce(nullif(btrim(v_toll->>'payment_method'),''),'any'));

    -- Compatibilidad: un peaje manual histórico puede conservarse, pero nunca crearse de nuevo.
    if v_toll_id is null then
      if p_service_id is null then
        raise exception 'Seleccioná un peaje dado de alta en Configuración';
      end if;

      select t.* into v_existing
      from public.operator_service_tolls t
      where t.service_id = p_service_id
        and t.source = 'manual'
        and lower(btrim(coalesce(t.toll_name_snapshot,''))) = lower(btrim(coalesce(v_toll->>'toll_name','')))
        and t.quantity = v_quantity
        and t.unit_amount = greatest(coalesce(nullif(v_toll->>'unit_amount','')::numeric,0),0)
        and upper(t.currency) = upper(coalesce(nullif(btrim(v_toll->>'currency'),''),t.currency))
      order by t.created_at
      limit 1;

      if not found then
        raise exception 'Los peajes nuevos deben seleccionarse desde el catálogo';
      end if;

      v_normalized := v_normalized || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'toll_id', null,
        'toll_rate_id', null,
        'toll_name', v_existing.toll_name_snapshot,
        'toll_code', v_existing.toll_code_snapshot,
        'road', v_existing.road_snapshot,
        'direction', v_existing.direction_snapshot,
        'vehicle_category', v_existing.vehicle_category,
        'payment_method', v_existing.payment_method,
        'quantity', v_existing.quantity,
        'unit_amount', v_existing.unit_amount,
        'currency', v_existing.currency,
        'source', 'manual',
        'notes', v_existing.notes
      )));
      continue;
    end if;

    if v_toll_id = any(v_seen) then
      raise exception 'El peaje ya fue agregado. Modificá la cantidad en lugar de repetirlo';
    end if;
    v_seen := array_append(v_seen, v_toll_id);

    select l.* into v_location
    from public.toll_locations l
    where l.toll_id = v_toll_id;
    if not found then raise exception 'Peaje inexistente'; end if;

    if v_rate_id is not null then
      select r.* into v_rate
      from public.toll_rates r
      where r.toll_rate_id = v_rate_id
        and r.toll_id = v_toll_id
        and r.is_active
        and r.valid_from <= v_date
        and (r.valid_until is null or r.valid_until >= v_date);
    else
      select r.* into v_rate
      from public.toll_rates r
      where r.toll_id = v_toll_id
        and r.is_active
        and r.valid_from <= v_date
        and (r.valid_until is null or r.valid_until >= v_date)
      order by
        (r.vehicle_category = v_vehicle_category and r.payment_method = v_payment_method) desc,
        (r.vehicle_category = 'light_2_axles' and r.payment_method = 'any') desc,
        r.valid_from desc,
        r.created_at desc
      limit 1;
    end if;

    if not found then
      raise exception 'El peaje % no tiene una tarifa vigente para la fecha del servicio', v_location.name;
    end if;

    v_normalized := v_normalized || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'toll_id', v_location.toll_id,
      'toll_rate_id', v_rate.toll_rate_id,
      'toll_name', v_location.name,
      'toll_code', v_location.code,
      'road', v_location.road,
      'direction', v_location.direction,
      'vehicle_category', v_rate.vehicle_category,
      'payment_method', v_rate.payment_method,
      'quantity', v_quantity,
      'unit_amount', round(v_rate.amount,2),
      'currency', upper(v_rate.currency),
      'source', 'planned',
      'notes', nullif(btrim(v_toll->>'notes'),'')
    )));
  end loop;

  return v_normalized;
end;
$$;

revoke all on function app_private.normalize_service_catalog_tolls(uuid,timestamptz,jsonb) from public, anon, authenticated;

-- Conservamos la implementación de alta vigente como núcleo y la envolvemos con
-- normalización/persistencia atómica del catálogo de peajes.
do $$
begin
  if to_regprocedure('public.create_operator_service_v3_catalog_legacy(jsonb)') is null then
    execute 'alter function public.create_operator_service_v3(jsonb) rename to create_operator_service_v3_catalog_legacy';
  end if;
end;
$$;

revoke all on function public.create_operator_service_v3_catalog_legacy(jsonb) from public, anon, authenticated;
grant execute on function public.create_operator_service_v3_catalog_legacy(jsonb) to service_role;

create or replace function public.create_operator_service_v3(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_scheduled timestamptz;
  v_tolls jsonb;
  v_toll jsonb;
  v_toll_total numeric := 0;
  v_result jsonb;
  v_service_id uuid;
  v_service public.operator_services%rowtype;
  v_uid uuid := auth.uid();
begin
  v_scheduled := coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz, now());
  v_tolls := app_private.normalize_service_catalog_tolls(null, v_scheduled, coalesce(v_payload->'tolls','[]'::jsonb));

  select coalesce(sum((x->>'unit_amount')::numeric * greatest(coalesce((x->>'quantity')::integer,1),1)),0)
  into v_toll_total
  from jsonb_array_elements(v_tolls) x;

  v_payload := jsonb_set(v_payload, '{tolls}', v_tolls, true);
  v_payload := jsonb_set(v_payload, '{toll_estimate}', to_jsonb(round(v_toll_total,2)), true);

  v_result := public.create_operator_service_v3_catalog_legacy(v_payload);
  v_service_id := nullif(v_result->>'service_id','')::uuid;
  if v_service_id is null then raise exception 'No se pudo identificar el servicio creado'; end if;

  select * into v_service from public.operator_services where service_id=v_service_id;
  if not found then raise exception 'El servicio creado no pudo recuperarse'; end if;

  for v_toll in select value from jsonb_array_elements(v_tolls) loop
    insert into public.operator_service_tolls(
      service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      vehicle_category,payment_method,quantity,unit_amount,currency,source,notes,created_by,updated_by,is_test
    ) values (
      v_service_id,(v_toll->>'toll_id')::uuid,(v_toll->>'toll_rate_id')::uuid,
      nullif(v_toll->>'toll_code',''),v_toll->>'toll_name',nullif(v_toll->>'road',''),nullif(v_toll->>'direction',''),
      v_toll->>'vehicle_category',v_toll->>'payment_method',(v_toll->>'quantity')::integer,
      (v_toll->>'unit_amount')::numeric,v_toll->>'currency','planned',nullif(v_toll->>'notes',''),v_uid,v_uid,v_service.is_test
    );
  end loop;

  return v_result || jsonb_build_object('tolls',v_tolls,'toll_estimate',round(v_toll_total,2));
end;
$$;

revoke all on function public.create_operator_service_v3(jsonb) from public, anon;
grant execute on function public.create_operator_service_v3(jsonb) to authenticated, service_role;

-- La edición pública conserva la vía rápida actual para cambios no tarifarios.
-- Si llegan peajes, se normalizan primero y se usa el motor completo para que Operaciones
-- pueda agregarlos sin tener permiso para escribir importes arbitrarios.
do $$
begin
  if to_regprocedure('public.update_operator_service_catalog_legacy(uuid,jsonb,text)') is null then
    execute 'alter function public.update_operator_service(uuid,jsonb,text) rename to update_operator_service_catalog_legacy';
  end if;
end;
$$;

revoke all on function public.update_operator_service_catalog_legacy(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.update_operator_service_catalog_legacy(uuid,jsonb,text) to service_role;

create or replace function public.update_operator_service(
  p_service_id uuid,
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_scheduled timestamptz;
  v_tolls jsonb;
  v_toll_total numeric := 0;
begin
  if v_payload ? 'tolls' then
    select coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,s.scheduled_for)
    into v_scheduled
    from public.operator_services s
    where s.service_id=p_service_id;
    if not found then raise exception 'Servicio inexistente'; end if;

    v_tolls := app_private.normalize_service_catalog_tolls(p_service_id,v_scheduled,coalesce(v_payload->'tolls','[]'::jsonb));
    select coalesce(sum((x->>'unit_amount')::numeric * greatest(coalesce((x->>'quantity')::integer,1),1)),0)
    into v_toll_total
    from jsonb_array_elements(v_tolls) x;

    v_payload := jsonb_set(v_payload,'{tolls}',v_tolls,true);
    v_payload := jsonb_set(v_payload,'{toll_estimate}',to_jsonb(round(v_toll_total,2)),true);

    return app_private.update_operator_service_full(p_service_id,v_payload,p_reason);
  end if;

  return public.update_operator_service_catalog_legacy(p_service_id,v_payload,p_reason);
end;
$$;

revoke all on function public.update_operator_service(uuid,jsonb,text) from public, anon;
grant execute on function public.update_operator_service(uuid,jsonb,text) to authenticated, service_role;
