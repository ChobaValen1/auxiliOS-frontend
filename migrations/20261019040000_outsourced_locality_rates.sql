-- Tercerizados · precio fijo por localidad · 19/10/2026 (autorizado por el dueño)
-- Algunos tercerizados cobran un precio fijo según la localidad (Villa Gesell 50.000, Mar Azul 55.000…).
--   · Tarifa: nuevo modo por tipo de servicio, calc_mode = 'locality', con lines[].localities = [{name, amount}].
--   · Servicio: el operador elige la localidad de la lista del tercerizado (outsourced_service_costs.locality).
--   · El precio de la localidad es TODO lo que se paga: no se suman km, adicionales ni peajes (el ajuste de
--     Administración sigue disponible).
--   · Al operador le llegan los nombres de las localidades, sin importes.

alter table public.outsourced_service_costs add column if not exists locality text;

create or replace function public.save_outsourced_rate_version_v1(p_provider_id uuid, p_version_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_from date := nullif(p->>'valid_from', '')::date;
  v_tolls text := coalesce(nullif(p->>'tolls_mode', ''), 'separate');
  v_in jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_out jsonb := '[]'::jsonb;
  v_line jsonb;
  v_concept public.service_concepts%rowtype;
  v_mode text;
  v_seen uuid[] := '{}';
  v_primary int := 0;
  n numeric;
  v_row public.outsourced_rate_versions%rowtype;
  v_name text;
  v_amt numeric;
  v_loc jsonb;
  v_locs jsonb;
  v_locnames text[];
  v_lname text;
begin
  if v_role <> 'administracion' then raise exception 'Sólo Administración puede cargar tarifas de tercerizados' using errcode = '42501'; end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(v_in) <> 'array' then raise exception 'Datos inválidos'; end if;
  select display_name into v_name from public.outsourced_providers where provider_id = p_provider_id;
  if not found then raise exception 'El tercerizado no existe'; end if;
  if v_from is null then raise exception 'Indicá desde qué fecha vale la tarifa'; end if;
  if v_tolls not in ('separate', 'included') then raise exception 'Peajes: aparte o incluidos'; end if;
  if exists (select 1 from public.outsourced_rate_versions where provider_id = p_provider_id and valid_from = v_from and version_id is distinct from p_version_id) then
    raise exception 'Ya hay una tarifa de % que vale desde el %', v_name, to_char(v_from, 'DD/MM/YYYY');
  end if;

  for v_line in select value from jsonb_array_elements(v_in) loop
    select * into v_concept from public.service_concepts where concept_id = nullif(v_line->>'concept_id', '')::uuid;
    if not found then raise exception 'Hay un tipo de servicio o adicional que no existe'; end if;
    if v_concept.concept_id = any(v_seen) then raise exception '% está repetido', v_concept.name; end if;
    v_seen := v_seen || v_concept.concept_id;
    v_mode := v_line->>'calc_mode';
    if v_concept.service_category in ('primary', 'mixed') then
      if v_mode = 'movida_km' then
        foreach v_amt in array array[coalesce(nullif(v_line->>'movida_amount', '')::numeric, 0), coalesce(nullif(v_line->>'km_asphalt_amount', '')::numeric, 0), coalesce(nullif(v_line->>'km_gravel_amount', '')::numeric, 0)] loop
          if v_amt < 0 then raise exception '%: los importes no pueden ser negativos', v_concept.name; end if;
        end loop;
        if coalesce(nullif(v_line->>'movida_amount', '')::numeric, 0) + coalesce(nullif(v_line->>'km_asphalt_amount', '')::numeric, 0) + coalesce(nullif(v_line->>'km_gravel_amount', '')::numeric, 0) <= 0 then
          raise exception '%: cargá la movida o el precio por km', v_concept.name;
        end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object('concept_id', v_concept.concept_id, 'calc_mode', 'movida_km',
          'movida_amount', round(coalesce(nullif(v_line->>'movida_amount', '')::numeric, 0), 2),
          'km_asphalt_amount', round(coalesce(nullif(v_line->>'km_asphalt_amount', '')::numeric, 0), 2),
          'km_gravel_amount', round(coalesce(nullif(v_line->>'km_gravel_amount', '')::numeric, 0), 2)));
      elsif v_mode = 'fixed' then
        n := nullif(v_line->>'fixed_amount', '')::numeric;
        if n is null or n <= 0 then raise exception '%: cargá el monto fijo', v_concept.name; end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object('concept_id', v_concept.concept_id, 'calc_mode', 'fixed', 'fixed_amount', round(n, 2)));
      elsif v_mode = 'locality' then
        if jsonb_typeof(coalesce(v_line->'localities', 'null'::jsonb)) <> 'array' or jsonb_array_length(v_line->'localities') = 0 then
          raise exception '%: cargá al menos una localidad con su precio', v_concept.name;
        end if;
        v_locs := '[]'::jsonb; v_locnames := '{}';
        for v_loc in select value from jsonb_array_elements(v_line->'localities') loop
          v_lname := nullif(btrim(regexp_replace(coalesce(v_loc->>'name', ''), '\s+', ' ', 'g')), '');
          n := nullif(v_loc->>'amount', '')::numeric;
          if v_lname is null then raise exception '%: hay una localidad sin nombre', v_concept.name; end if;
          if lower(v_lname) = any(v_locnames) then raise exception '%: % está repetida', v_concept.name, v_lname; end if;
          if n is null or n <= 0 then raise exception '%: cargá el precio de %', v_concept.name, v_lname; end if;
          v_locnames := v_locnames || lower(v_lname);
          v_locs := v_locs || jsonb_build_array(jsonb_build_object('name', v_lname, 'amount', round(n, 2)));
        end loop;
        v_out := v_out || jsonb_build_array(jsonb_build_object('concept_id', v_concept.concept_id, 'calc_mode', 'locality', 'localities', v_locs));
      else
        raise exception '%: elegí movida + km, monto fijo o por localidad', v_concept.name;
      end if;
      v_primary := v_primary + 1;
    else
      if v_concept.billing_family = 'sale' or v_concept.input_mode = 'toggle' then raise exception '% no se paga al tercerizado', v_concept.name; end if;
      n := nullif(v_line->>'unit_amount', '')::numeric;
      if n is null or n <= 0 then raise exception '%: cargá el importe', v_concept.name; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('concept_id', v_concept.concept_id, 'calc_mode', 'per_unit', 'unit_amount', round(n, 2), 'unit', coalesce(v_concept.default_pricing_unit, 'unit')));
    end if;
  end loop;
  if v_primary = 0 then raise exception 'Cargá el precio de al menos un tipo de servicio'; end if;

  if p_version_id is null then
    insert into public.outsourced_rate_versions(provider_id, valid_from, tolls_mode, lines, created_by, updated_by)
    values (p_provider_id, v_from, v_tolls, v_out, auth.uid(), auth.uid())
    returning * into v_row;
  else
    update public.outsourced_rate_versions set valid_from = v_from, tolls_mode = v_tolls, lines = v_out, updated_at = now(), updated_by = auth.uid()
    where version_id = p_version_id and provider_id = p_provider_id
    returning * into v_row;
    if not found then raise exception 'La tarifa no existe'; end if;
  end if;
  return to_jsonb(v_row);
end $function$;
revoke all on function public.save_outsourced_rate_version_v1(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_outsourced_rate_version_v1(uuid, uuid, jsonb) to authenticated;

create or replace function app_private.outsourced_quote(p jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_provider uuid := nullif(p->>'provider_id', '')::uuid;
  v_concept uuid := nullif(p->>'concept_id', '')::uuid;
  v_date date := coalesce(nullif(p->>'date', '')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_kma numeric := greatest(coalesce(nullif(p->>'km_asphalt', '')::numeric, 0), 0);
  v_kmg numeric := greatest(coalesce(nullif(p->>'km_gravel', '')::numeric, 0), 0);
  v_tolls numeric := greatest(coalesce(nullif(p->>'tolls_amount', '')::numeric, 0), 0);
  v_adj numeric := coalesce(nullif(p->>'adjustment_amount', '')::numeric, 0);
  v_locality text := nullif(btrim(coalesce(p->>'locality', '')), '');
  v_rate public.outsourced_rate_versions%rowtype;
  v_line jsonb; v_x jsonb; v_q numeric; v_name text; v_prov text; v_loc jsonb;
  v_base numeric := 0; v_extra numeric := 0; v_tpay numeric := 0;
  v_rows jsonb := '[]'::jsonb; v_extras jsonb := '[]'::jsonb;
  v_is_loc boolean := false;
begin
  if v_provider is null then return jsonb_build_object('error', 'Elegí el tercerizado'); end if;
  select display_name into v_prov from public.outsourced_providers where provider_id = v_provider;
  if not found then return jsonb_build_object('error', 'El tercerizado no existe'); end if;
  if v_concept is null then return jsonb_build_object('error', 'Elegí el tipo de servicio'); end if;
  v_rate := app_private.outsourced_rate_at(v_provider, v_date);
  if v_rate.version_id is null then return jsonb_build_object('error', format('%s no tiene tarifa para el %s', v_prov, to_char(v_date, 'DD/MM/YYYY'))); end if;
  select l into v_line from jsonb_array_elements(v_rate.lines) l where l->>'concept_id' = v_concept::text;
  select name into v_name from public.service_concepts where concept_id = v_concept;
  if v_line is null then return jsonb_build_object('error', format('La tarifa de %s no incluye %s', v_prov, coalesce(v_name, 'este tipo de servicio')), 'version_id', v_rate.version_id, 'valid_from', v_rate.valid_from); end if;

  if v_line->>'calc_mode' = 'locality' then
    -- Precio fijo por localidad: es todo lo que se paga (sin km, adicionales ni peajes).
    v_is_loc := true;
    if v_locality is null then return jsonb_build_object('error', 'Elegí la localidad', 'calc_mode', 'locality'); end if;
    select l into v_loc from jsonb_array_elements(v_line->'localities') l where lower(l->>'name') = lower(v_locality);
    if v_loc is null then return jsonb_build_object('error', format('La tarifa de %s no tiene la localidad %s', v_prov, v_locality), 'calc_mode', 'locality'); end if;
    v_locality := v_loc->>'name';
    v_base := (v_loc->>'amount')::numeric;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', coalesce(v_name, 'Servicio') || ' · ' || v_locality, 'amount', v_base));
    v_kma := 0; v_kmg := 0; v_tolls := 0;
  elsif v_line->>'calc_mode' = 'fixed' then
    v_locality := null;
    v_base := (v_line->>'fixed_amount')::numeric;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', coalesce(v_name, 'Servicio') || ' · monto fijo', 'amount', v_base));
  else
    v_locality := null;
    if coalesce((v_line->>'movida_amount')::numeric, 0) > 0 then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Movida · ' || coalesce(v_name, ''), 'amount', (v_line->>'movida_amount')::numeric));
    end if;
    if v_kma > 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Km asfalto', 'quantity', v_kma, 'unit', 'km', 'unit_amount', coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 'amount', round(v_kma * coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 2))); end if;
    if v_kmg > 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Km ripio', 'quantity', v_kmg, 'unit', 'km', 'unit_amount', coalesce((v_line->>'km_gravel_amount')::numeric, 0), 'amount', round(v_kmg * coalesce((v_line->>'km_gravel_amount')::numeric, 0), 2))); end if;
    v_base := coalesce((v_line->>'movida_amount')::numeric, 0) + round(v_kma * coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 2) + round(v_kmg * coalesce((v_line->>'km_gravel_amount')::numeric, 0), 2);
  end if;

  if not v_is_loc then
    for v_x in select value from jsonb_array_elements(coalesce(p->'extras', '[]'::jsonb)) loop
      v_q := coalesce(nullif(v_x->>'quantity', '')::numeric, 0);
      if v_q < 0 then return jsonb_build_object('error', 'Las cantidades no pueden ser negativas'); end if;
      if v_q = 0 then continue; end if;
      select l into v_line from jsonb_array_elements(v_rate.lines) l where l->>'concept_id' = v_x->>'concept_id' and l->>'calc_mode' = 'per_unit';
      if v_line is null then return jsonb_build_object('error', 'Hay un adicional que la tarifa no paga'); end if;
      select name into v_name from public.service_concepts where concept_id = (v_x->>'concept_id')::uuid;
      v_extras := v_extras || jsonb_build_array(jsonb_build_object('concept_id', v_x->>'concept_id', 'quantity', v_q));
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', v_name, 'quantity', v_q, 'unit', v_line->>'unit', 'unit_amount', (v_line->>'unit_amount')::numeric, 'amount', round(v_q * (v_line->>'unit_amount')::numeric, 2)));
      v_extra := v_extra + round(v_q * (v_line->>'unit_amount')::numeric, 2);
    end loop;
    if v_rate.tolls_mode = 'separate' and v_tolls > 0 then
      v_tpay := round(v_tolls, 2);
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Peajes (se pagan aparte)', 'amount', v_tpay));
    end if;
  end if;
  if v_adj <> 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Ajuste', 'amount', round(v_adj, 2))); end if;
  if v_base + v_extra + v_tpay + v_adj < 0 then return jsonb_build_object('error', 'Con el ajuste el total queda negativo'); end if;

  return jsonb_build_object('provider_id', v_provider, 'provider_name', v_prov, 'concept_id', v_concept, 'date', v_date,
    'version_id', v_rate.version_id, 'valid_from', v_rate.valid_from, 'tolls_mode', v_rate.tolls_mode,
    'calc_mode', case when v_is_loc then 'locality' end, 'locality', v_locality,
    'km_asphalt', v_kma, 'km_gravel', v_kmg, 'tolls_amount', v_tolls, 'extras', v_extras, 'breakdown', v_rows,
    'base_amount', round(v_base, 2), 'extras_amount', round(v_extra, 2), 'tolls_payable', v_tpay, 'adjustment_amount', round(v_adj, 2),
    'total_amount', round(v_base + v_extra + v_tpay + v_adj, 2),
    'rate_snapshot', jsonb_build_object('version_id', v_rate.version_id, 'valid_from', v_rate.valid_from, 'tolls_mode', v_rate.tolls_mode, 'lines', v_rate.lines));
end $function$;
revoke all on function app_private.outsourced_quote(jsonb) from public, anon;

-- Para el formulario: por tipo de servicio, cómo se calcula y qué localidades hay (importes sólo para Administración).
create or replace function public.list_outsourced_providers_for_service_v1(p_date date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare v_date date := coalesce(p_date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_admin boolean := coalesce(app_private.current_auxilios_role(), '') = 'administracion';
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('provider_id', p.provider_id, 'display_name', p.display_name, 'is_active', p.is_active,
      'has_rate', r.version_id is not null, 'tolls_mode', r.tolls_mode,
      'concepts', coalesce((select jsonb_agg(l->>'concept_id') from jsonb_array_elements(r.lines) l where l->>'calc_mode' <> 'per_unit'), '[]'::jsonb),
      'modes', coalesce((select jsonb_object_agg(l->>'concept_id', jsonb_build_object('calc_mode', l->>'calc_mode',
                 'localities', coalesce((select jsonb_agg(jsonb_build_object('name', x->>'name') || case when v_admin then jsonb_build_object('amount', (x->>'amount')::numeric) else '{}'::jsonb end order by x->>'name')
                                         from jsonb_array_elements(coalesce(l->'localities', '[]'::jsonb)) x), '[]'::jsonb)))
                 from jsonb_array_elements(r.lines) l where l->>'calc_mode' <> 'per_unit'), '{}'::jsonb),
      'extras', coalesce((select jsonb_agg(jsonb_build_object('concept_id', l->>'concept_id', 'name', c.name, 'unit', l->>'unit')
                 || case when v_admin then jsonb_build_object('unit_amount', (l->>'unit_amount')::numeric) else '{}'::jsonb end)
                 from jsonb_array_elements(r.lines) l join public.service_concepts c on c.concept_id = (l->>'concept_id')::uuid where l->>'calc_mode' = 'per_unit'), '[]'::jsonb))
      order by p.display_name)
    from public.outsourced_providers p
    left join lateral (select * from app_private.outsourced_rate_at(p.provider_id, v_date)) r on true
    where p.is_active), '[]'::jsonb);
end $function$;
revoke all on function public.list_outsourced_providers_for_service_v1(date) from public, anon;
grant execute on function public.list_outsourced_providers_for_service_v1(date) to authenticated;

create or replace function public.set_outsourced_service_cost_v1(p_service_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  v_old public.outsourced_service_costs%rowtype;
  v_has_old boolean;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  q jsonb;
  v_reason text;
  v_row public.outsourced_service_costs%rowtype;
begin
  if coalesce(v_role, '') not in ('administracion', 'operador') then raise exception 'Sin permiso para cargar el costo del tercerizado' using errcode = '42501'; end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'El servicio no existe'; end if;
  select * into v_old from public.outsourced_service_costs where service_id = p_service_id for update;
  v_has_old := found;
  if v_has_old and v_old.settlement_id is not null then raise exception 'Este servicio ya está en una liquidación del tercerizado: no se puede cambiar lo que se le paga'; end if;
  if v_role <> 'administracion' then
    p := (p - 'adjustment_amount' - 'adjustment_reason') || jsonb_build_object(
      'adjustment_amount', case when v_has_old then coalesce(v_old.adjustment_amount, 0) else 0 end,
      'adjustment_reason', case when v_has_old then v_old.adjustment_reason end);
  end if;
  v_reason := nullif(btrim(coalesce(p->>'adjustment_reason', '')), '');

  if nullif(p->>'provider_id', '') is null or coalesce(s.logistics_type, 'own') <> 'third_party' then
    if v_has_old then
      update public.outsourced_service_costs set provider_id = null, version_id = null, rate_snapshot = null, breakdown = '[]'::jsonb, locality = null,
        base_amount = 0, extras_amount = 0, tolls_payable = 0, adjustment_amount = 0, adjustment_reason = null, total_amount = 0,
        updated_at = now(), updated_by = auth.uid()
      where service_id = p_service_id returning * into v_row;
      return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
    end if;
    return null;
  end if;

  q := app_private.outsourced_quote(p || jsonb_build_object('concept_id', s.primary_concept_id,
         'date', (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date));
  if q ? 'error' then raise exception '%', q->>'error'; end if;
  if (q->>'adjustment_amount')::numeric <> 0 and char_length(coalesce(v_reason, '')) < 5 then raise exception 'Contá el motivo del ajuste (al menos 5 letras)'; end if;

  insert into public.outsourced_service_costs as c (service_id, provider_id, version_id, concept_id, service_date, rate_snapshot,
    km_asphalt, km_gravel, tolls_amount, extras, breakdown, base_amount, extras_amount, tolls_payable, adjustment_amount, adjustment_reason,
    total_amount, locality, created_by, updated_by)
  values (p_service_id, (q->>'provider_id')::uuid, (q->>'version_id')::uuid, (q->>'concept_id')::uuid, (q->>'date')::date, q->'rate_snapshot',
    (q->>'km_asphalt')::numeric, (q->>'km_gravel')::numeric, (q->>'tolls_amount')::numeric, q->'extras', q->'breakdown',
    (q->>'base_amount')::numeric, (q->>'extras_amount')::numeric, (q->>'tolls_payable')::numeric, (q->>'adjustment_amount')::numeric,
    case when (q->>'adjustment_amount')::numeric <> 0 then v_reason end, (q->>'total_amount')::numeric, q->>'locality', auth.uid(), auth.uid())
  on conflict (service_id) do update set provider_id = excluded.provider_id, version_id = excluded.version_id, concept_id = excluded.concept_id,
    service_date = excluded.service_date, rate_snapshot = excluded.rate_snapshot, km_asphalt = excluded.km_asphalt, km_gravel = excluded.km_gravel,
    tolls_amount = excluded.tolls_amount, extras = excluded.extras, breakdown = excluded.breakdown, base_amount = excluded.base_amount,
    extras_amount = excluded.extras_amount, tolls_payable = excluded.tolls_payable, adjustment_amount = excluded.adjustment_amount,
    adjustment_reason = excluded.adjustment_reason, total_amount = excluded.total_amount, locality = excluded.locality,
    updated_at = now(), updated_by = auth.uid()
  returning * into v_row;
  return case when v_role = 'administracion' then to_jsonb(v_row) else app_private.outsourced_hide_amounts(to_jsonb(v_row)) end;
end $function$;
revoke all on function public.set_outsourced_service_cost_v1(uuid, jsonb) from public, anon;
grant execute on function public.set_outsourced_service_cost_v1(uuid, jsonb) to authenticated;
