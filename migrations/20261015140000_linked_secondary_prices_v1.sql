-- Tarifas que dependen del servicio principal (15/10/2026).
-- Un adicional puede tomar su precio del servicio principal de cada servicio:
--   primary_movement   → la Movida del principal (ej.: Hora de Espera)
--   primary_asphalt_km → el Km asfalto del principal (ej.: Doble Cabina)
-- Se guarda por prestadora en company_service_settings.price_link. Si está vacío,
-- el adicional usa su precio propio, como antes. Vale para todas las bases y para
-- los precios programados, porque se resuelve al calcular.

alter table public.company_service_settings
  add column if not exists price_link text
  check (price_link in ('primary_movement','primary_asphalt_km'));

alter table public.operator_service_items drop constraint operator_service_items_price_source_check;
alter table public.operator_service_items add constraint operator_service_items_price_source_check
  check (price_source = any (array['general','branch','billing_base','link_override','price_version','matrix_v3','linked_primary']));

-- Precio vinculado de un adicional para un servicio principal, prestadora, base y fecha.
create or replace function app_private.linked_secondary_price_v1(p_company_id uuid, p_base_id uuid, p_primary_concept_id uuid, p_date date, p_link text)
returns numeric language plpgsql stable security definer set search_path to '' as $f$
declare v_contract uuid; v_card uuid; v_rate public.company_rate_items%rowtype;
begin
  if p_link is null or p_company_id is null or p_primary_concept_id is null then return null; end if;
  select c.contract_id into v_contract from public.company_contracts c
  where c.company_id=p_company_id and c.status='active' and c.valid_from<=p_date and (c.valid_until is null or c.valid_until>=p_date)
  order by c.is_primary desc,c.valid_from desc,c.created_at desc limit 1;
  if v_contract is null then return null; end if;
  select r.rate_card_id into v_card from public.company_rate_cards r
  where r.contract_id=v_contract and r.status in ('active','scheduled') and r.valid_from<=p_date and (r.valid_until is null or r.valid_until>=p_date)
  order by r.valid_from desc,r.version desc limit 1;
  if v_card is null then return null; end if;
  select i.* into v_rate from public.company_rate_items i
  where i.rate_card_id=v_card and i.concept_id=p_primary_concept_id and i.is_active and i.branch_id is null
    and (i.billing_base_id is null or i.billing_base_id=p_base_id)
  order by (i.billing_base_id=p_base_id) desc nulls last limit 1;
  if v_rate.rate_item_id is null then return null; end if;
  return case p_link
    when 'primary_movement' then coalesce(v_rate.primary_price,v_rate.base_price,0)
    when 'primary_asphalt_km' then coalesce(v_rate.asphalt_km_price,v_rate.extra_km_price,0)
  end;
end $f$;

-- Guardar el vínculo (solo Administración)
create or replace function public.set_company_service_price_link_v1(p_company_id uuid, p_concept_id uuid, p_link text)
returns jsonb language plpgsql security definer set search_path to '' as $f$
declare v_sc public.service_concepts%rowtype; v_link text:=nullif(btrim(coalesce(p_link,'')),''); v_row public.company_service_settings%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede editar precios'; end if;
  if v_link is not null and v_link not in ('primary_movement','primary_asphalt_km') then raise exception 'Vínculo de precio inválido'; end if;
  select * into v_sc from public.service_concepts where concept_id=p_concept_id;
  if v_sc.concept_id is null or v_sc.service_category<>'secondary' or v_sc.distance_chargeable then
    raise exception 'Solo los servicios adicionales pueden tomar el precio del principal';
  end if;
  update public.company_service_settings set price_link=v_link, updated_by=auth.uid(), updated_at=now()
  where company_id=p_company_id and concept_id=p_concept_id and is_enabled returning * into v_row;
  if v_row.company_service_setting_id is null then raise exception 'El servicio no está habilitado para la prestadora'; end if;
  return jsonb_build_object('company_id',p_company_id,'concept_id',p_concept_id,'price_link',v_row.price_link);
end $f$;
revoke all on function public.set_company_service_price_link_v1(uuid,uuid,text) from public, anon;
grant execute on function public.set_company_service_price_link_v1(uuid,uuid,text) to authenticated;

do $p$ declare d text; n text; begin
  -- 1) Cálculo del servicio
  d := pg_get_functiondef('app_private.calculate_operator_service_quote_v4_full(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean)'::regprocedure);
  n := replace(d, E'  v_distance_applies boolean:=false;\n',
    E'  v_distance_applies boolean:=false;\n  v_primary_rate_id uuid;\n  v_primary_movement_price numeric:=0;\n  v_unit numeric;\n  v_unit_rate_id uuid;\n  v_unit_pricing text;\n  v_unit_source text;\n');
  n := replace(n, E'  v_gravel_unit_price:=coalesce(v_rate.gravel_km_price,v_rate.extra_km_price,0);\n',
    E'  v_gravel_unit_price:=coalesce(v_rate.gravel_km_price,v_rate.extra_km_price,0);\n  v_primary_rate_id:=v_rate.rate_item_id;\n  v_primary_movement_price:=coalesce(v_rate.primary_price,v_rate.base_price,0);\n');
  n := replace(n, E'coalesce(css.code_mode,''fixed'') code_mode INTO v_concept',
    E'coalesce(css.code_mode,''fixed'') code_mode,css.price_link INTO v_concept');
  n := replace(n,
    E'    SELECT i.* INTO v_rate\n    FROM public.company_rate_items i\n    WHERE i.rate_card_id=v_card.rate_card_id AND i.concept_id=v_concept.concept_id AND i.is_active\n      AND i.branch_id IS NULL AND (i.billing_base_id IS NULL OR i.billing_base_id=p_base_id)\n    ORDER BY (i.billing_base_id=p_base_id) DESC NULLS LAST LIMIT 1;\n    IF NOT FOUND THEN RAISE EXCEPTION ''El servicio % no tiene tarifa vigente'',v_concept.name; END IF;\n\n    v_subtotal:=round(v_qty*coalesce(v_rate.secondary_price,v_rate.base_price,0),2);',
    E'    IF v_concept.price_link IS NOT NULL THEN\n      v_unit:=CASE v_concept.price_link WHEN ''primary_movement'' THEN v_primary_movement_price ELSE v_asphalt_unit_price END;\n      v_unit_rate_id:=v_primary_rate_id;\n      v_unit_pricing:=coalesce(v_concept.default_pricing_unit,''unit'');\n      v_unit_source:=''linked_primary'';\n    ELSE\n    SELECT i.* INTO v_rate\n    FROM public.company_rate_items i\n    WHERE i.rate_card_id=v_card.rate_card_id AND i.concept_id=v_concept.concept_id AND i.is_active\n      AND i.branch_id IS NULL AND (i.billing_base_id IS NULL OR i.billing_base_id=p_base_id)\n    ORDER BY (i.billing_base_id=p_base_id) DESC NULLS LAST LIMIT 1;\n    IF NOT FOUND THEN RAISE EXCEPTION ''El servicio % no tiene tarifa vigente'',v_concept.name; END IF;\n      v_unit:=coalesce(v_rate.secondary_price,v_rate.base_price,0);\n      v_unit_rate_id:=v_rate.rate_item_id;\n      v_unit_pricing:=v_rate.pricing_unit;\n      v_unit_source:=CASE WHEN v_rate.billing_base_id IS NULL THEN ''general'' ELSE ''billing_base'' END;\n    END IF;\n\n    v_subtotal:=round(v_qty*v_unit,2);');
  n := replace(n,
    E'''rate_item_id'',v_rate.rate_item_id,''service_code'',v_concept.code,''service_name'',v_concept.name,\n      ''pricing_unit'',v_rate.pricing_unit,''quantity'',v_qty,\n      ''unit_price'',coalesce(v_rate.secondary_price,v_rate.base_price,0),''subtotal'',v_subtotal,\n      ''requires_own_code'',v_concept.code_mode=''manual'',\n      ''price_source'',CASE WHEN v_rate.billing_base_id IS NULL THEN ''general'' ELSE ''billing_base'' END',
    E'''rate_item_id'',v_unit_rate_id,''service_code'',v_concept.code,''service_name'',v_concept.name,\n      ''pricing_unit'',v_unit_pricing,''quantity'',v_qty,\n      ''unit_price'',v_unit,''subtotal'',v_subtotal,\n      ''requires_own_code'',v_concept.code_mode=''manual'',\n      ''price_link'',v_concept.price_link,\n      ''price_source'',v_unit_source');
  if position('v_primary_movement_price:=coalesce' in n)=0 or position('css.price_link INTO v_concept' in n)=0
     or position('v_subtotal:=round(v_qty*v_unit,2)' in n)=0 or position('''price_source'',v_unit_source' in n)=0 then
    raise exception 'parche: cálculo del servicio';
  end if;
  execute n;

  -- 2) Pantalla de precios: devolver el vínculo de cada adicional
  d := pg_get_functiondef('public.get_company_service_prices_v1(uuid)'::regprocedure);
  n := replace(d, E'''concept_id'',sc.concept_id,''name'',sc.name,''category'',sc.service_category,',
    E'''concept_id'',sc.concept_id,''name'',sc.name,''category'',sc.service_category,''price_link'',css.price_link,');
  if n = d then raise exception 'parche: get_company_service_prices_v1'; end if;
  execute n;

  -- 3) Precio sugerido del remito del chofer
  d := pg_get_functiondef('public.get_driver_remito_reference_v2(uuid)'::regprocedure);
  n := replace(d, E'  v_category_id uuid;\n', E'  v_category_id uuid;\n  v_primary_id uuid;\n');
  n := replace(n, E's.company_id,s.billing_base_id,s.category_id,coalesce(s.currency,''ARS'')\n      into v_date,v_company_id,v_billing_base_id,v_category_id,v_currency',
    E's.company_id,s.billing_base_id,s.category_id,coalesce(s.currency,''ARS''),s.primary_concept_id\n      into v_date,v_company_id,v_billing_base_id,v_category_id,v_currency,v_primary_id');
  n := replace(n, E'then coalesce(nullif(p.amount,0),nullif(m.unit_price,0)) else null end',
    E'then coalesce(nullif(p.amount,0),case when css.price_link is not null then nullif(app_private.linked_secondary_price_v1(v_company_id,v_billing_base_id,v_primary_id,v_date,css.price_link),0) end,nullif(m.unit_price,0)) else null end');
  n := replace(n, E'when coalesce(m.unit_price,0)>0 then ''tariff''',
    E'when css.price_link is not null and v_primary_id is not null then ''tariff'' when coalesce(m.unit_price,0)>0 then ''tariff''');
  if position('v_primary_id uuid' in n)=0 or position('s.primary_concept_id' in n)=0 or position('linked_secondary_price_v1' in n)=0
     or position('css.price_link is not null and v_primary_id' in n)=0 then
    raise exception 'parche: get_driver_remito_reference_v2';
  end if;
  execute n;
end $p$;
