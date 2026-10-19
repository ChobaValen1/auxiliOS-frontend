-- Tercerizados · paso 3: lo que se le paga al tercerizado por cada servicio · 18/10/2026 (autorizado por el dueño)
-- Tabla nueva; no toca operator_services. Administración y operadores la cargan desde el formulario del servicio.
-- El cálculo se hace en la base con la tarifa vigente a la fecha del servicio y queda una copia de esa tarifa
-- (rate_snapshot), así el importe no cambia si después se actualizan los precios. Queda auditado.

create table if not exists public.outsourced_service_costs (
  service_id uuid primary key references public.operator_services(service_id),
  provider_id uuid references public.outsourced_providers(provider_id),
  version_id uuid references public.outsourced_rate_versions(version_id),
  concept_id uuid,
  service_date date,
  rate_snapshot jsonb,
  km_asphalt numeric(10,2) not null default 0 check (km_asphalt >= 0),
  km_gravel numeric(10,2) not null default 0 check (km_gravel >= 0),
  tolls_amount numeric(14,2) not null default 0 check (tolls_amount >= 0),
  extras jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),
  breakdown jsonb not null default '[]'::jsonb,
  base_amount numeric(14,2) not null default 0,
  extras_amount numeric(14,2) not null default 0,
  tolls_payable numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,
  adjustment_reason text,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  settlement_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists outsourced_service_costs_provider_idx on public.outsourced_service_costs(provider_id, service_date);

alter table public.outsourced_service_costs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outsourced_service_costs' and policyname = 'outsourced_service_costs_select_staff') then
    create policy outsourced_service_costs_select_staff on public.outsourced_service_costs for select to authenticated
      using ((select app_private.current_auxilios_role()) in ('administracion', 'operador'));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'outsourced_service_costs_audit' and tgrelid = 'public.outsourced_service_costs'::regclass) then
    create trigger outsourced_service_costs_audit after insert or delete or update on public.outsourced_service_costs
      for each row execute function public.capture_audit_event('service_id');
  end if;
end $$;
revoke all on public.outsourced_service_costs from anon;
grant select on public.outsourced_service_costs to authenticated;

-- Cálculo (sin guardar). Devuelve el desglose o {error}. p: {provider_id, concept_id, date, km_asphalt, km_gravel, tolls_amount, extras:[{concept_id, quantity}], adjustment_amount}
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
  v_rate public.outsourced_rate_versions%rowtype;
  v_line jsonb; v_x jsonb; v_q numeric; v_name text; v_prov text;
  v_base numeric := 0; v_extra numeric := 0; v_tpay numeric := 0;
  v_rows jsonb := '[]'::jsonb; v_extras jsonb := '[]'::jsonb;
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

  if v_line->>'calc_mode' = 'fixed' then
    v_base := (v_line->>'fixed_amount')::numeric;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', coalesce(v_name, 'Servicio') || ' · monto fijo', 'amount', v_base));
  else
    if coalesce((v_line->>'movida_amount')::numeric, 0) > 0 then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Movida · ' || coalesce(v_name, ''), 'amount', (v_line->>'movida_amount')::numeric));
    end if;
    -- quantity y unit_amount van aparte: la pantalla los muestra con formato argentino.
    if v_kma > 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Km asfalto', 'quantity', v_kma, 'unit', 'km', 'unit_amount', coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 'amount', round(v_kma * coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 2))); end if;
    if v_kmg > 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Km ripio', 'quantity', v_kmg, 'unit', 'km', 'unit_amount', coalesce((v_line->>'km_gravel_amount')::numeric, 0), 'amount', round(v_kmg * coalesce((v_line->>'km_gravel_amount')::numeric, 0), 2))); end if;
    v_base := coalesce((v_line->>'movida_amount')::numeric, 0) + round(v_kma * coalesce((v_line->>'km_asphalt_amount')::numeric, 0), 2) + round(v_kmg * coalesce((v_line->>'km_gravel_amount')::numeric, 0), 2);
  end if;

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
  if v_adj <> 0 then v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Ajuste', 'amount', round(v_adj, 2))); end if;
  if v_base + v_extra + v_tpay + v_adj < 0 then return jsonb_build_object('error', 'Con el ajuste el total queda negativo'); end if;

  return jsonb_build_object('provider_id', v_provider, 'provider_name', v_prov, 'concept_id', v_concept, 'date', v_date,
    'version_id', v_rate.version_id, 'valid_from', v_rate.valid_from, 'tolls_mode', v_rate.tolls_mode,
    'km_asphalt', v_kma, 'km_gravel', v_kmg, 'tolls_amount', v_tolls, 'extras', v_extras, 'breakdown', v_rows,
    'base_amount', round(v_base, 2), 'extras_amount', round(v_extra, 2), 'tolls_payable', v_tpay, 'adjustment_amount', round(v_adj, 2),
    'total_amount', round(v_base + v_extra + v_tpay + v_adj, 2),
    'rate_snapshot', jsonb_build_object('version_id', v_rate.version_id, 'valid_from', v_rate.valid_from, 'tolls_mode', v_rate.tolls_mode, 'lines', v_rate.lines));
end $function$;
revoke all on function app_private.outsourced_quote(jsonb) from public, anon;

create or replace function public.quote_outsourced_service_cost_v1(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return app_private.outsourced_quote(coalesce(p_payload, '{}'::jsonb)) - 'rate_snapshot';
end $function$;
revoke all on function public.quote_outsourced_service_cost_v1(jsonb) from public, anon;
grant execute on function public.quote_outsourced_service_cost_v1(jsonb) to authenticated;

-- Tercerizados activos para elegir en el formulario, con los adicionales que paga su tarifa en esa fecha.
create or replace function public.list_outsourced_providers_for_service_v1(p_date date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare v_date date := coalesce(p_date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'operador') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('provider_id', p.provider_id, 'display_name', p.display_name, 'is_active', p.is_active,
      'has_rate', r.version_id is not null, 'tolls_mode', r.tolls_mode,
      'concepts', coalesce((select jsonb_agg(l->>'concept_id') from jsonb_array_elements(r.lines) l where l->>'calc_mode' <> 'per_unit'), '[]'::jsonb),
      'extras', coalesce((select jsonb_agg(jsonb_build_object('concept_id', l->>'concept_id', 'name', c.name, 'unit', l->>'unit', 'unit_amount', (l->>'unit_amount')::numeric))
                 from jsonb_array_elements(r.lines) l join public.service_concepts c on c.concept_id = (l->>'concept_id')::uuid where l->>'calc_mode' = 'per_unit'), '[]'::jsonb))
      order by p.display_name)
    from public.outsourced_providers p
    left join lateral (select * from app_private.outsourced_rate_at(p.provider_id, v_date)) r on true
    where p.is_active), '[]'::jsonb);
end $function$;
revoke all on function public.list_outsourced_providers_for_service_v1(date) from public, anon;
grant execute on function public.list_outsourced_providers_for_service_v1(date) to authenticated;

-- Guardar lo que se le paga al tercerizado en un servicio. p_payload null o sin provider_id: el servicio deja de tenerlo.
create or replace function public.set_outsourced_service_cost_v1(p_service_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  v_old public.outsourced_service_costs%rowtype;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  q jsonb;
  v_reason text := nullif(btrim(coalesce(p->>'adjustment_reason', '')), '');
  v_row public.outsourced_service_costs%rowtype;
begin
  if coalesce(v_role, '') not in ('administracion', 'operador') then raise exception 'Sin permiso para cargar el costo del tercerizado' using errcode = '42501'; end if;
  select * into s from public.operator_services where service_id = p_service_id;
  if not found then raise exception 'El servicio no existe'; end if;
  select * into v_old from public.outsourced_service_costs where service_id = p_service_id for update;
  if found and v_old.settlement_id is not null then raise exception 'Este servicio ya está en una liquidación del tercerizado: no se puede cambiar lo que se le paga'; end if;

  if nullif(p->>'provider_id', '') is null or coalesce(s.logistics_type, 'own') <> 'third_party' then
    if found then
      update public.outsourced_service_costs set provider_id = null, version_id = null, rate_snapshot = null, breakdown = '[]'::jsonb,
        base_amount = 0, extras_amount = 0, tolls_payable = 0, adjustment_amount = 0, adjustment_reason = null, total_amount = 0,
        updated_at = now(), updated_by = auth.uid()
      where service_id = p_service_id returning * into v_row;
      return to_jsonb(v_row);
    end if;
    return null;
  end if;

  q := app_private.outsourced_quote(p || jsonb_build_object('concept_id', s.primary_concept_id,
         'date', (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date));
  if q ? 'error' then raise exception '%', q->>'error'; end if;
  if (q->>'adjustment_amount')::numeric <> 0 and char_length(coalesce(v_reason, '')) < 5 then raise exception 'Contá el motivo del ajuste (al menos 5 letras)'; end if;

  insert into public.outsourced_service_costs as c (service_id, provider_id, version_id, concept_id, service_date, rate_snapshot,
    km_asphalt, km_gravel, tolls_amount, extras, breakdown, base_amount, extras_amount, tolls_payable, adjustment_amount, adjustment_reason,
    total_amount, created_by, updated_by)
  values (p_service_id, (q->>'provider_id')::uuid, (q->>'version_id')::uuid, (q->>'concept_id')::uuid, (q->>'date')::date, q->'rate_snapshot',
    (q->>'km_asphalt')::numeric, (q->>'km_gravel')::numeric, (q->>'tolls_amount')::numeric, q->'extras', q->'breakdown',
    (q->>'base_amount')::numeric, (q->>'extras_amount')::numeric, (q->>'tolls_payable')::numeric, (q->>'adjustment_amount')::numeric,
    case when (q->>'adjustment_amount')::numeric <> 0 then v_reason end, (q->>'total_amount')::numeric, auth.uid(), auth.uid())
  on conflict (service_id) do update set provider_id = excluded.provider_id, version_id = excluded.version_id, concept_id = excluded.concept_id,
    service_date = excluded.service_date, rate_snapshot = excluded.rate_snapshot, km_asphalt = excluded.km_asphalt, km_gravel = excluded.km_gravel,
    tolls_amount = excluded.tolls_amount, extras = excluded.extras, breakdown = excluded.breakdown, base_amount = excluded.base_amount,
    extras_amount = excluded.extras_amount, tolls_payable = excluded.tolls_payable, adjustment_amount = excluded.adjustment_amount,
    adjustment_reason = excluded.adjustment_reason, total_amount = excluded.total_amount, updated_at = now(), updated_by = auth.uid()
  returning * into v_row;
  return to_jsonb(v_row);
end $function$;
revoke all on function public.set_outsourced_service_cost_v1(uuid, jsonb) from public, anon;
grant execute on function public.set_outsourced_service_cost_v1(uuid, jsonb) to authenticated;
