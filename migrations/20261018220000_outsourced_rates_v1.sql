-- Tercerizados · paso 2: tarifas por tercerizado con vigencia · 18/10/2026 (autorizado por el dueño)
-- Tabla nueva; no toca nada existente. Sólo Administración la ve y la edita.
-- Cada versión vale desde una fecha (la siguiente versión la reemplaza) y define:
--   · peajes aparte o incluidos;
--   · precio por tipo de servicio principal: movida + km (asfalto/ripio) o monto fijo;
--   · adicionales por unidad (hora, km, día, unidad o servicio, según el concepto).
-- Los precios van en lines (jsonb) y los valida save_outsourced_rate_version_v1. Queda auditado.

create table if not exists public.outsourced_rate_versions (
  version_id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.outsourced_providers(provider_id),
  valid_from date not null,
  tolls_mode text not null default 'separate' check (tolls_mode in ('separate', 'included')),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint outsourced_rate_versions_from_key unique (provider_id, valid_from)
);
create index if not exists outsourced_rate_versions_provider_idx on public.outsourced_rate_versions(provider_id, valid_from desc);

alter table public.outsourced_rate_versions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outsourced_rate_versions' and policyname = 'outsourced_rate_versions_select_admin') then
    create policy outsourced_rate_versions_select_admin on public.outsourced_rate_versions for select to authenticated
      using ((select app_private.current_auxilios_role()) = 'administracion');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'outsourced_rate_versions_audit' and tgrelid = 'public.outsourced_rate_versions'::regclass) then
    create trigger outsourced_rate_versions_audit after insert or delete or update on public.outsourced_rate_versions
      for each row execute function public.capture_audit_event('version_id');
  end if;
end $$;
revoke all on public.outsourced_rate_versions from anon;
grant select on public.outsourced_rate_versions to authenticated;

-- Crear (p_version_id null) o editar una versión. Devuelve la versión guardada.
-- lines: [{concept_id, calc_mode: movida_km|fixed|per_unit, movida_amount, km_asphalt_amount, km_gravel_amount, fixed_amount, unit_amount}]
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
      else
        raise exception '%: elegí movida + km o monto fijo', v_concept.name;
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

-- Tarifa vigente de un tercerizado en una fecha (la de valid_from más reciente que no la supere). Para el paso 3.
create or replace function app_private.outsourced_rate_at(p_provider_id uuid, p_date date)
returns public.outsourced_rate_versions language sql stable set search_path to 'public', 'pg_temp' as $function$
  select * from public.outsourced_rate_versions
  where provider_id = p_provider_id and valid_from <= p_date
  order by valid_from desc limit 1
$function$;
