-- AuxiliOS · Las bases de facturación vinculadas tienen la misma jerarquía.
-- Aplicada y validada en Supabase productivo el 2026-08-03.

begin;

update public.company_billing_base_links
set is_primary = false,
    priority = 100,
    updated_at = now()
where is_primary is distinct from false
   or priority is distinct from 100;

drop index if exists public.company_billing_base_links_primary_unique;
drop index if exists public.company_billing_base_links_lookup_idx;
create index if not exists company_billing_base_links_lookup_idx
  on public.company_billing_base_links (billing_setting_id, is_active, base_id);

comment on column public.company_billing_base_links.is_primary is
  'Campo legado sin efecto. Todas las bases vinculadas tienen la misma jerarquía.';
comment on column public.company_billing_base_links.priority is
  'Campo legado sin efecto. Se conserva temporalmente con valor neutral 100.';

create or replace function public.get_company_billing_configuration(
  p_company_id uuid,
  p_scheduled_for timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_date date := (coalesce(p_scheduled_for, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_setting public.company_billing_settings%rowtype;
  v_links jsonb;
  v_bases jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar la configuración de facturación';
  end if;
  if not exists (select 1 from public.companies c where c.company_id = p_company_id) then
    raise exception 'Empresa inexistente';
  end if;

  select s.* into v_setting
  from public.company_billing_settings s
  where s.company_id = p_company_id
    and s.contract_id is null
    and s.valid_from <= v_date
    and (s.valid_until is null or s.valid_until >= v_date)
  order by s.is_active desc, s.valid_from desc, s.created_at desc
  limit 1;

  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'link_id', l.link_id,
      'base_id', l.base_id,
      'is_active', l.is_active,
      'notes', l.notes,
      'name', b.name,
      'base_code', b.base_code,
      'address', b.address,
      'city', b.city,
      'province', b.province,
      'latitude', b.latitude,
      'longitude', b.longitude,
      'google_place_id', b.google_place_id,
      'address_verified', b.address_verified,
      'base_active', b.is_active
    ) order by b.name, b.base_code), '[]'::jsonb)
    into v_links
    from public.company_billing_base_links l
    join public.billing_bases b on b.base_id = l.base_id
    where l.billing_setting_id = v_setting.billing_setting_id;
  else
    v_links := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'base_id', b.base_id,
    'base_code', b.base_code,
    'name', b.name,
    'address', b.address,
    'city', b.city,
    'province', b.province,
    'latitude', b.latitude,
    'longitude', b.longitude,
    'google_place_id', b.google_place_id,
    'address_verified', b.address_verified,
    'is_active', b.is_active
  ) order by b.is_active desc, b.name, b.base_code), '[]'::jsonb)
  into v_bases
  from public.billing_bases b;

  return jsonb_build_object(
    'company_id', p_company_id,
    'setting', case when v_setting.billing_setting_id is null then null else to_jsonb(v_setting) end,
    'links', v_links,
    'available_bases', v_bases,
    'ready_for_routing', v_setting.billing_setting_id is not null
      and v_setting.is_active
      and exists (
        select 1
        from public.company_billing_base_links l
        join public.billing_bases b on b.base_id = l.base_id
        where l.billing_setting_id = v_setting.billing_setting_id
          and l.is_active
          and b.is_active
          and (not v_setting.requires_verified_base or b.address_verified)
      )
  );
end
$function$;

create or replace function public.save_company_billing_configuration(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_id uuid := nullif(p_payload->>'billing_setting_id','')::uuid;
  v_company uuid := nullif(p_payload->>'company_id','')::uuid;
  v_contract uuid := nullif(p_payload->>'contract_id','')::uuid;
  v_from date := coalesce(nullif(p_payload->>'valid_from','')::date, current_date);
  v_until date := nullif(p_payload->>'valid_until','')::date;
  v_active boolean := coalesce((p_payload->>'is_active')::boolean, true);
  v_bases jsonb := coalesce(p_payload->'bases', '[]'::jsonb);
  v_entry jsonb;
  v_saved public.company_billing_settings%rowtype;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administración puede modificar la configuración de facturación';
  end if;
  if v_company is null or not exists (select 1 from public.companies where company_id = v_company) then
    raise exception 'Seleccioná una empresa válida';
  end if;
  if v_contract is not null and not exists (
    select 1 from public.company_contracts where contract_id = v_contract and company_id = v_company
  ) then
    raise exception 'El contrato no pertenece a la empresa';
  end if;
  if v_until is not null and v_until < v_from then
    raise exception 'La fecha hasta no puede ser anterior a la fecha desde';
  end if;
  if v_active and jsonb_array_length(v_bases) = 0 then
    raise exception 'Una configuración activa debe tener al menos una base aplicable';
  end if;

  if v_id is null then
    insert into public.company_billing_settings(
      company_id, contract_id, route_mode, toll_calculation_mode, valid_from, valid_until,
      requires_verified_base, is_active, notes, created_by, updated_by
    ) values (
      v_company, v_contract,
      coalesce(nullif(p_payload->>'route_mode',''), 'base_origin_destination_base'),
      coalesce(nullif(p_payload->>'toll_calculation_mode',''), 'route_estimate'),
      v_from, v_until,
      coalesce((p_payload->>'requires_verified_base')::boolean, true),
      v_active, nullif(btrim(p_payload->>'notes'), ''), auth.uid(), auth.uid()
    ) returning * into v_saved;
  else
    select * into v_saved
    from public.company_billing_settings
    where billing_setting_id = v_id;
    if not found then raise exception 'Configuración inexistente'; end if;
    if v_saved.company_id <> v_company then
      raise exception 'No se puede cambiar la empresa de la configuración';
    end if;

    update public.company_billing_settings
    set contract_id = v_contract,
        route_mode = coalesce(nullif(p_payload->>'route_mode',''), 'base_origin_destination_base'),
        toll_calculation_mode = coalesce(nullif(p_payload->>'toll_calculation_mode',''), 'route_estimate'),
        valid_from = v_from,
        valid_until = v_until,
        requires_verified_base = coalesce((p_payload->>'requires_verified_base')::boolean, true),
        is_active = v_active,
        notes = nullif(btrim(p_payload->>'notes'), ''),
        updated_by = auth.uid()
    where billing_setting_id = v_id
    returning * into v_saved;
  end if;

  delete from public.company_billing_base_links
  where billing_setting_id = v_saved.billing_setting_id;

  for v_entry in select value from jsonb_array_elements(v_bases)
  loop
    if nullif(v_entry->>'base_id','') is null
       or not exists (
         select 1 from public.billing_bases b
         where b.base_id = (v_entry->>'base_id')::uuid
       ) then
      raise exception 'Una de las bases seleccionadas no existe';
    end if;

    insert into public.company_billing_base_links(
      billing_setting_id, base_id, is_primary, priority, is_active, notes, created_by, updated_by
    ) values (
      v_saved.billing_setting_id,
      (v_entry->>'base_id')::uuid,
      false,
      100,
      coalesce((v_entry->>'is_active')::boolean, true),
      nullif(btrim(v_entry->>'notes'), ''),
      auth.uid(), auth.uid()
    );
  end loop;

  return public.get_company_billing_configuration(v_company, now());
end
$function$;

create or replace function public.get_company_configuration_v2(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso';
  end if;

  return jsonb_build_object(
    'company', (select to_jsonb(c) from public.companies c where c.company_id = p_company_id),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'concept_id', sc.concept_id,
        'name', sc.name,
        'category', sc.service_category,
        'billing_family', sc.billing_family,
        'is_enabled', coalesce(css.is_enabled, false),
        'external_code', css.external_code,
        'code_mode', coalesce(css.code_mode, 'fixed'),
        'notes', css.notes
      ) order by sc.sort_order, sc.name)
      from public.service_concepts sc
      left join public.company_service_settings css
        on css.company_id = p_company_id and css.concept_id = sc.concept_id
      where sc.billing_family <> 'system' and sc.is_active
    ), '[]'::jsonb),
    'bases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'base_id', b.base_id,
        'base_code', b.base_code,
        'name', b.name,
        'address', b.address,
        'city', b.city,
        'province', b.province,
        'address_verified', b.address_verified,
        'is_active', l.is_active
      ) order by b.name, b.base_code)
      from public.company_billing_settings s
      join public.company_billing_base_links l
        on l.billing_setting_id = s.billing_setting_id and l.is_active
      join public.billing_bases b
        on b.base_id = l.base_id and b.is_active
      where s.company_id = p_company_id and s.is_active
    ), '[]'::jsonb)
  );
end
$function$;

create or replace function public.get_operator_billing_base_catalog(
  p_company_id uuid,
  p_scheduled_for timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_date date := (coalesce(p_scheduled_for, now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_contract public.company_contracts%rowtype;
  v_setting public.company_billing_settings%rowtype;
  v_result jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision','operador') then
    raise exception 'Sin permiso para consultar bases de facturación';
  end if;

  select c.* into v_contract
  from public.company_contracts c
  where c.company_id = p_company_id
    and c.status = 'active'
    and c.valid_from <= v_date
    and (c.valid_until is null or c.valid_until >= v_date)
  order by c.is_primary desc, c.valid_from desc, c.created_at desc
  limit 1;

  select s.* into v_setting
  from public.company_billing_settings s
  where s.company_id = p_company_id
    and s.is_active
    and s.valid_from <= v_date
    and (s.valid_until is null or s.valid_until >= v_date)
    and (s.contract_id is null or s.contract_id = v_contract.contract_id)
  order by (s.contract_id = v_contract.contract_id) desc nulls last,
           s.valid_from desc,
           s.created_at desc
  limit 1;

  if not found then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'billing_base_id', b.base_id,
    'branch_id', b.base_id,
    'name', b.name,
    'code', b.base_code,
    'address', b.address,
    'formatted_address', b.address,
    'city', b.city,
    'province', b.province,
    'latitude', b.latitude,
    'longitude', b.longitude,
    'google_place_id', b.google_place_id,
    'address_verified', b.address_verified,
    'billing_setting_id', v_setting.billing_setting_id,
    'route_mode', v_setting.route_mode,
    'toll_calculation_mode', v_setting.toll_calculation_mode,
    'requires_verified_base', v_setting.requires_verified_base,
    'route_ready', (not v_setting.requires_verified_base or b.address_verified)
  ) order by b.name, b.base_code), '[]'::jsonb)
  into v_result
  from public.company_billing_base_links l
  join public.billing_bases b on b.base_id = l.base_id
  where l.billing_setting_id = v_setting.billing_setting_id
    and l.is_active
    and b.is_active;

  return v_result;
end
$function$;

create or replace function public.get_operator_service_reference_data()
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
begin
  if v_role not in ('administracion','facturacion','operador','supervision') then
    raise exception 'Sin permiso para consultar datos operativos';
  end if;

  return jsonb_build_object(
    'companies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'company_id', c.company_id,
        'legal_name', c.legal_name,
        'trade_name', c.trade_name,
        'status', c.status
      ) order by coalesce(c.trade_name, c.legal_name)), '[]'::jsonb)
      from public.companies c
      where c.status = 'active'
    ),
    'branches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'branch_id', b.base_id,
        'billing_base_id', b.base_id,
        'company_id', s.company_id,
        'name', b.name,
        'branch_code', b.base_code,
        'address', b.address,
        'city', b.city,
        'province', b.province,
        'latitude', b.latitude,
        'longitude', b.longitude,
        'google_place_id', b.google_place_id,
        'address_verified', b.address_verified,
        'billing_setting_id', s.billing_setting_id,
        'route_mode', s.route_mode,
        'toll_calculation_mode', s.toll_calculation_mode
      ) order by s.company_id, b.name, b.base_code), '[]'::jsonb)
      from public.company_billing_settings s
      join public.company_billing_base_links l
        on l.billing_setting_id = s.billing_setting_id
      join public.billing_bases b on b.base_id = l.base_id
      where s.is_active
        and l.is_active
        and b.is_active
        and s.valid_from <= current_date
        and (s.valid_until is null or s.valid_until >= current_date)
        and (not s.requires_verified_base or b.address_verified)
    ),
    'drivers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.user_id,
        'full_name', u.full_name,
        'phone', u.phone
      ) order by u.full_name), '[]'::jsonb)
      from public.users u
      join public.roles r on r.role_id = u.role_id
      where coalesce(u.is_active, true) and r.name = 'chofer'
    ),
    'trucks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'truck_id', t.truck_id,
        'plate', t.plate,
        'brand', t.brand,
        'model', t.model,
        'numero_interno', t.numero_interno,
        'tipo_equipo', t.tipo_equipo
      ) order by t.numero_interno nulls last, t.plate), '[]'::jsonb)
      from public.trucks t
      where t.status = 'active'
    ),
    'concepts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'concept_id', s.concept_id,
        'code', s.code,
        'name', s.name,
        'icon', s.icon,
        'description', s.description
      ) order by s.sort_order, s.name), '[]'::jsonb)
      from public.service_concepts s
      where s.is_active
    )
  );
end
$function$;

commit;
