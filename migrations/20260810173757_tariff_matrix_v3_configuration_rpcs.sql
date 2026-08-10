-- AuxiliOS · Tarifario V3 · RPCs de configuración

create or replace function public.list_service_categories_v3(p_include_inactive boolean default true)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'category_id',c.category_id,'code',c.code,'name',c.name,'description',c.description,
    'sort_order',c.sort_order,'is_active',c.is_active
  ) order by c.sort_order,c.name) from public.service_categories c where p_include_inactive or c.is_active),'[]'::jsonb);
end $$;

create or replace function public.save_service_category_v3(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_id uuid:=nullif(p_payload->>'category_id','')::uuid;
  v_name text:=trim(coalesce(p_payload->>'name',''));
  v_code text;
  v_compat public.service_concepts%rowtype;
  v_row public.service_categories%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede modificar categorías'; end if;
  if length(v_name)<2 then raise exception 'Ingresá un nombre de categoría'; end if;
  v_code:=lower(trim(coalesce(p_payload->>'code','')));
  if v_code='' then v_code:=trim(both '_' from regexp_replace(translate(lower(v_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','_','g')); end if;
  if v_code !~ '^[a-z0-9_]{2,60}$' then raise exception 'Código interno de categoría inválido'; end if;

  if v_id is null then
    if exists(select 1 from public.service_categories where code=v_code) then raise exception 'Ya existe una categoría con ese código'; end if;
    if exists(select 1 from public.service_concepts where code=left('category_'||v_code,60)) then raise exception 'El código técnico de la categoría ya existe'; end if;
    insert into public.service_concepts(
      code,name,description,default_can_be_primary,default_can_be_secondary,default_pricing_unit,
      icon,sort_order,is_active,billing_family,distance_chargeable,quantity_source,auto_apply,matrix_visible
    ) values(
      left('category_'||v_code,60),v_name,'Concepto técnico de compatibilidad para la categoría '||v_name,
      true,false,'service','▣',coalesce(nullif(p_payload->>'sort_order','')::integer,100),false,'primary',true,'manual',false,false
    ) returning * into v_compat;
    insert into public.service_categories(code,name,description,legacy_primary_concept_id,sort_order,is_active)
    values(v_code,v_name,nullif(trim(coalesce(p_payload->>'description','')),''),v_compat.concept_id,
      coalesce(nullif(p_payload->>'sort_order','')::integer,100),coalesce((p_payload->>'is_active')::boolean,true))
    returning * into v_row;
  else
    update public.service_categories set
      name=v_name,description=nullif(trim(coalesce(p_payload->>'description','')),''),
      sort_order=coalesce(nullif(p_payload->>'sort_order','')::integer,sort_order),
      is_active=coalesce((p_payload->>'is_active')::boolean,is_active),updated_by=auth.uid(),updated_at=now()
    where category_id=v_id returning * into v_row;
    if v_row.category_id is null then raise exception 'Categoría inexistente'; end if;
    update public.service_concepts set name=v_name,updated_by=auth.uid(),updated_at=now()
    where concept_id=v_row.legacy_primary_concept_id and matrix_visible=false;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.list_tariff_concepts_v3(p_include_inactive boolean default true)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'concept_id',sc.concept_id,'code',sc.code,'name',sc.name,'description',sc.description,
    'pricing_unit',sc.default_pricing_unit,'quantity_source',sc.quantity_source,'auto_apply',sc.auto_apply,
    'icon',sc.icon,'sort_order',sc.sort_order,'is_active',sc.is_active,
    'tariff_type_id',tt.tariff_type_id,'tariff_type_code',tt.code,'tariff_type_name',tt.name
  ) order by sc.sort_order,sc.name)
  from public.service_concepts sc
  left join lateral (
    select t.tariff_type_id,t.code,t.name
    from public.tariff_type_service_links l join public.tariff_types t on t.tariff_type_id=l.tariff_type_id and t.is_active
    where l.concept_id=sc.concept_id and l.is_active order by t.sort_order limit 1
  ) tt on true
  where sc.matrix_visible and sc.billing_family<>'system' and (p_include_inactive or sc.is_active)),'[]'::jsonb);
end $$;

create or replace function public.save_tariff_concept_v3(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_id uuid:=nullif(p_payload->>'concept_id','')::uuid;
  v_name text:=trim(coalesce(p_payload->>'name',''));
  v_code text:=lower(trim(coalesce(p_payload->>'code','')));
  v_type uuid:=nullif(p_payload->>'tariff_type_id','')::uuid;
  v_type_code text;
  v_family text;
  v_unit text:=coalesce(nullif(p_payload->>'pricing_unit',''),'unit');
  v_source text:=coalesce(nullif(p_payload->>'quantity_source',''),'manual');
  v_row public.service_concepts%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede modificar conceptos'; end if;
  if length(v_name)<2 then raise exception 'Ingresá un nombre de concepto'; end if;
  if v_code='' then v_code:=trim(both '_' from regexp_replace(translate(lower(v_name),'áéíóúüñ','aeiouun'),'[^a-z0-9]+','_','g')); end if;
  if v_code !~ '^[a-z0-9_]{2,60}$' then raise exception 'Código interno de concepto inválido'; end if;
  if v_unit not in ('service','hour','km','unit','day','fixed') then raise exception 'Unidad inválida'; end if;
  if v_source not in ('manual','one','asphalt_km','gravel_km') then raise exception 'Origen de cantidad inválido'; end if;
  select code into v_type_code from public.tariff_types where tariff_type_id=v_type and is_active;
  if v_type_code is null then raise exception 'Seleccioná un grupo tarifario'; end if;
  v_family:=case when v_type_code='sale' then 'sale' else 'variable' end;

  if v_id is null then
    insert into public.service_concepts(
      code,name,description,default_can_be_primary,default_can_be_secondary,default_pricing_unit,icon,sort_order,is_active,
      billing_family,vehicle_class,distance_chargeable,quantity_source,auto_apply,matrix_visible
    ) values(
      v_code,v_name,nullif(trim(coalesce(p_payload->>'description','')),''),false,true,v_unit,
      coalesce(nullif(p_payload->>'icon',''),'⚙'),coalesce(nullif(p_payload->>'sort_order','')::integer,100),
      coalesce((p_payload->>'is_active')::boolean,true),v_family,null,false,v_source,
      coalesce((p_payload->>'auto_apply')::boolean,false),true
    ) returning * into v_row;
  else
    update public.service_concepts set
      name=v_name,description=nullif(trim(coalesce(p_payload->>'description','')),''),default_pricing_unit=v_unit,
      icon=coalesce(nullif(p_payload->>'icon',''),icon),sort_order=coalesce(nullif(p_payload->>'sort_order','')::integer,sort_order),
      is_active=coalesce((p_payload->>'is_active')::boolean,is_active),billing_family=v_family,vehicle_class=null,distance_chargeable=false,
      quantity_source=v_source,auto_apply=coalesce((p_payload->>'auto_apply')::boolean,auto_apply),matrix_visible=true,
      updated_by=auth.uid(),updated_at=now()
    where concept_id=v_id and matrix_visible returning * into v_row;
  end if;
  if v_row.concept_id is null then raise exception 'Concepto inexistente'; end if;
  update public.tariff_type_service_links set is_active=false,updated_by=auth.uid(),updated_at=now() where concept_id=v_row.concept_id;
  insert into public.tariff_type_service_links(tariff_type_id,concept_id,is_active)
  values(v_type,v_row.concept_id,true)
  on conflict (tariff_type_id,concept_id) do update set is_active=true,updated_by=auth.uid(),updated_at=now();
  return to_jsonb(v_row);
end $$;

create or replace function public.get_company_tariff_matrix_v3(p_company_id uuid,p_base_id uuid default null,p_as_of date default current_date)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  if not exists(select 1 from public.companies where company_id=p_company_id) then raise exception 'Prestadora inexistente'; end if;
  return jsonb_build_object(
    'company',(select jsonb_build_object('company_id',c.company_id,'name',coalesce(c.trade_name,c.legal_name)) from public.companies c where c.company_id=p_company_id),
    'as_of',p_as_of,'billing_base_id',p_base_id,
    'categories',coalesce((select jsonb_agg(jsonb_build_object(
      'category_id',cat.category_id,'code',cat.code,'name',cat.name,'sort_order',cat.sort_order,
      'is_enabled',coalesce(ccs.is_enabled,false)
    ) order by cat.sort_order,cat.name)
    from public.service_categories cat
    left join public.company_service_category_settings ccs on ccs.company_id=p_company_id and ccs.category_id=cat.category_id
    where cat.is_active),'[]'::jsonb),
    'concepts',coalesce((select jsonb_agg(jsonb_build_object(
      'concept_id',sc.concept_id,'code',sc.code,'name',sc.name,'pricing_unit',sc.default_pricing_unit,
      'quantity_source',sc.quantity_source,'auto_apply',sc.auto_apply,'sort_order',sc.sort_order,
      'is_enabled',coalesce(css.is_enabled,false),'requires_own_code',coalesce(css.requires_own_code,false),
      'tariff_type_id',tt.tariff_type_id,'tariff_type_code',tt.code,'tariff_type_name',tt.name
    ) order by sc.sort_order,sc.name)
    from public.service_concepts sc
    left join public.company_service_settings css on css.company_id=p_company_id and css.concept_id=sc.concept_id
    left join lateral (
      select t.tariff_type_id,t.code,t.name from public.tariff_type_service_links l
      join public.tariff_types t on t.tariff_type_id=l.tariff_type_id and t.is_active
      where l.concept_id=sc.concept_id and l.is_active order by t.sort_order limit 1
    ) tt on true
    where sc.matrix_visible and sc.is_active and sc.billing_family<>'system'),'[]'::jsonb),
    'rates',coalesce((select jsonb_agg(jsonb_build_object(
      'category_id',cat.category_id,'concept_id',sc.concept_id,'rate_version_id',r.rate_version_id,
      'pricing_unit',r.pricing_unit,'unit_price',r.unit_price,'currency',r.currency,
      'valid_from',r.valid_from,'valid_until',r.valid_until,'scope',case when r.billing_base_id is null then 'general' else 'base' end
    ))
    from public.service_categories cat cross join public.service_concepts sc
    join lateral (
      select rr.* from public.company_tariff_matrix_rates rr
      where rr.company_id=p_company_id and rr.category_id=cat.category_id and rr.concept_id=sc.concept_id and rr.is_current
        and rr.valid_from<=p_as_of and (rr.valid_until is null or rr.valid_until>=p_as_of)
        and (rr.billing_base_id is null or rr.billing_base_id=p_base_id)
      order by (rr.billing_base_id=p_base_id) desc nulls last,rr.valid_from desc,rr.revision desc limit 1
    ) r on true
    where cat.is_active and sc.matrix_visible and sc.is_active),'[]'::jsonb)
  );
end $$;

create or replace function public.save_company_category_setting_v3(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_row public.company_service_category_settings%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede configurar categorías de la prestadora'; end if;
  insert into public.company_service_category_settings(company_id,category_id,is_enabled,notes)
  values((p_payload->>'company_id')::uuid,(p_payload->>'category_id')::uuid,
    coalesce((p_payload->>'is_enabled')::boolean,true),nullif(trim(coalesce(p_payload->>'notes','')),''))
  on conflict (company_id,category_id) do update set is_enabled=excluded.is_enabled,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.save_company_concept_setting_v3(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_row public.company_service_settings%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede configurar conceptos de la prestadora'; end if;
  insert into public.company_service_settings(company_id,concept_id,is_enabled,requires_own_code,external_code,code_mode,notes)
  values((p_payload->>'company_id')::uuid,(p_payload->>'concept_id')::uuid,
    coalesce((p_payload->>'is_enabled')::boolean,true),coalesce((p_payload->>'requires_own_code')::boolean,false),
    null,'manual',nullif(trim(coalesce(p_payload->>'notes','')),''))
  on conflict (company_id,concept_id) do update set
    is_enabled=excluded.is_enabled,requires_own_code=excluded.requires_own_code,external_code=null,code_mode='manual',
    notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.save_company_tariff_rate_v3(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_company uuid:=(p_payload->>'company_id')::uuid;
  v_base uuid:=nullif(p_payload->>'billing_base_id','')::uuid;
  v_category uuid:=(p_payload->>'category_id')::uuid;
  v_concept uuid:=(p_payload->>'concept_id')::uuid;
  v_from date:=(p_payload->>'valid_from')::date;
  v_until date:=nullif(p_payload->>'valid_until','')::date;
  v_unit text:=coalesce(nullif(p_payload->>'pricing_unit',''),(select default_pricing_unit from public.service_concepts where concept_id=v_concept));
  v_price numeric:=nullif(p_payload->>'unit_price','')::numeric;
  v_revision integer;
  v_next date;
  v_row public.company_tariff_matrix_rates%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede cargar tarifas'; end if;
  if v_from is null then raise exception 'La vigencia desde es obligatoria'; end if;
  if v_price is null or v_price<0 then raise exception 'Ingresá un precio unitario válido'; end if;
  if v_until is not null and v_until<v_from then raise exception 'La vigencia hasta no puede ser anterior al inicio'; end if;
  if not exists(select 1 from public.company_service_category_settings where company_id=v_company and category_id=v_category and is_enabled) then raise exception 'La categoría no está habilitada para la prestadora'; end if;
  if not exists(select 1 from public.company_service_settings where company_id=v_company and concept_id=v_concept and is_enabled) then raise exception 'El concepto no está habilitado para la prestadora'; end if;
  if v_unit not in ('service','hour','km','unit','day','fixed') then raise exception 'Unidad inválida'; end if;

  select min(valid_from) into v_next from public.company_tariff_matrix_rates
  where company_id=v_company and category_id=v_category and concept_id=v_concept and is_current and valid_from>v_from
    and coalesce(billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid);
  if v_next is not null then
    if v_until is null then v_until:=v_next-1;
    elsif v_until>=v_next then raise exception 'La vigencia se superpone con una tarifa posterior que inicia el %',v_next; end if;
  end if;

  select coalesce(max(revision),0)+1 into v_revision from public.company_tariff_matrix_rates
  where company_id=v_company and category_id=v_category and concept_id=v_concept and valid_from=v_from
    and coalesce(billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid);

  update public.company_tariff_matrix_rates set is_current=false,superseded_at=now()
  where company_id=v_company and category_id=v_category and concept_id=v_concept and valid_from=v_from and is_current
    and coalesce(billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid);
  update public.company_tariff_matrix_rates set valid_until=v_from-1
  where company_id=v_company and category_id=v_category and concept_id=v_concept and is_current and valid_from<v_from
    and (valid_until is null or valid_until>=v_from)
    and coalesce(billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(v_base,'00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.company_tariff_matrix_rates(company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,pricing_unit,unit_price,change_reason,metadata)
  values(v_company,v_base,v_category,v_concept,v_from,v_until,v_revision,true,coalesce(nullif(p_payload->>'currency',''),'ARS'),v_unit,v_price,
    nullif(trim(coalesce(p_payload->>'change_reason','')),''),coalesce(p_payload->'metadata','{}'::jsonb))
  returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.get_company_tariff_rate_history_v3(p_company_id uuid,p_base_id uuid,p_category_id uuid,p_concept_id uuid)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'rate_version_id',r.rate_version_id,'valid_from',r.valid_from,'valid_until',r.valid_until,'revision',r.revision,
    'is_current',r.is_current,'currency',r.currency,'pricing_unit',r.pricing_unit,'unit_price',r.unit_price,
    'change_reason',r.change_reason,'created_at',r.created_at,'superseded_at',r.superseded_at
  ) order by r.valid_from desc,r.revision desc)
  from public.company_tariff_matrix_rates r
  where r.company_id=p_company_id and r.category_id=p_category_id and r.concept_id=p_concept_id
    and coalesce(r.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_base_id,'00000000-0000-0000-0000-000000000000'::uuid)),'[]'::jsonb);
end $$;

create or replace function public.check_recent_provider_code_v3(p_company_id uuid,p_code text,p_exclude_service_id uuid default null)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare v_code text:=trim(coalesce(p_code,'')); v_matches jsonb;
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','operador','supervision') then raise exception 'Sin permiso'; end if;
  if v_code='' then return jsonb_build_object('duplicate',false,'window_days',30,'matches','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
    'scheduled_for',s.scheduled_for,'created_at',s.created_at,'status',s.status
  ) order by s.scheduled_for desc),'[]'::jsonb)
  into v_matches
  from public.operator_services s
  where s.company_id=p_company_id
    and lower(trim(coalesce(s.service_order_number,'')))=lower(v_code)
    and s.scheduled_for >= (now()-interval '30 days')
    and (p_exclude_service_id is null or s.service_id<>p_exclude_service_id);
  return jsonb_build_object('duplicate',jsonb_array_length(v_matches)>0,'window_days',30,'matches',v_matches);
end $$;

revoke all on function public.list_service_categories_v3(boolean) from public,anon;
revoke all on function public.save_service_category_v3(jsonb) from public,anon;
revoke all on function public.list_tariff_concepts_v3(boolean) from public,anon;
revoke all on function public.save_tariff_concept_v3(jsonb) from public,anon;
revoke all on function public.get_company_tariff_matrix_v3(uuid,uuid,date) from public,anon;
revoke all on function public.save_company_category_setting_v3(jsonb) from public,anon;
revoke all on function public.save_company_concept_setting_v3(jsonb) from public,anon;
revoke all on function public.save_company_tariff_rate_v3(jsonb) from public,anon;
revoke all on function public.get_company_tariff_rate_history_v3(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.check_recent_provider_code_v3(uuid,text,uuid) from public,anon;
grant execute on function public.list_service_categories_v3(boolean) to authenticated;
grant execute on function public.save_service_category_v3(jsonb) to authenticated;
grant execute on function public.list_tariff_concepts_v3(boolean) to authenticated;
grant execute on function public.save_tariff_concept_v3(jsonb) to authenticated;
grant execute on function public.get_company_tariff_matrix_v3(uuid,uuid,date) to authenticated;
grant execute on function public.save_company_category_setting_v3(jsonb) to authenticated;
grant execute on function public.save_company_concept_setting_v3(jsonb) to authenticated;
grant execute on function public.save_company_tariff_rate_v3(jsonb) to authenticated;
grant execute on function public.get_company_tariff_rate_history_v3(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.check_recent_provider_code_v3(uuid,text,uuid) to authenticated;
