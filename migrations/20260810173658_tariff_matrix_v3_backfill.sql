-- AuxiliOS · Tarifario V3 · catálogo y backfill compatible

insert into public.service_categories(code,name,description,legacy_primary_concept_id,sort_order,is_active)
select 'light','Liviano','Categoría migrada desde el servicio primario Liviano.',concept_id,10,is_active
from public.service_concepts where code='urban_tow';
insert into public.service_categories(code,name,description,legacy_primary_concept_id,sort_order,is_active)
select 'semi_heavy','Semipesado','Categoría migrada desde el servicio primario Semipesado.',concept_id,20,is_active
from public.service_concepts where code='semi_heavy_assistance';
insert into public.service_categories(code,name,description,legacy_primary_concept_id,sort_order,is_active)
select 'uml','UML','Categoría migrada desde el servicio primario UML.',concept_id,30,is_active
from public.service_concepts where code='uml';

update public.service_concepts
set matrix_visible=false,updated_at=now()
where code in ('urban_tow','semi_heavy_assistance','uml','wait_work_light','wait_work_semi');

insert into public.service_concepts(
  code,name,description,default_can_be_primary,default_can_be_secondary,default_pricing_unit,
  icon,sort_order,is_active,billing_family,vehicle_class,distance_chargeable,
  quantity_source,auto_apply,matrix_visible
)
values
  ('movement_charge','Movida','Cargo base de movida para la categoría seleccionada.',false,true,'unit','↔',5,true,'variable',null,false,'one',true,true),
  ('asphalt_km','KM Asfalto','Kilómetros de asfalto facturables.',false,true,'km','⌁',10,true,'variable',null,false,'asphalt_km',true,true),
  ('gravel_km','KM Ripio','Kilómetros de ripio facturables.',false,true,'km','⌁',15,true,'variable',null,false,'gravel_km',true,true),
  ('wait_work','Hora de Trabajo / Espera','Trabajo o espera facturable por hora o fracción.',false,true,'hour','◷',35,true,'variable',null,false,'manual',false,true)
on conflict (code) do update set
  name=excluded.name,description=excluded.description,default_pricing_unit=excluded.default_pricing_unit,
  quantity_source=excluded.quantity_source,auto_apply=excluded.auto_apply,matrix_visible=true,updated_at=now();

insert into public.tariff_type_service_links(tariff_type_id,concept_id,is_active)
select tt.tariff_type_id,sc.concept_id,true
from public.tariff_types tt
join public.service_concepts sc on sc.code in ('movement_charge','asphalt_km','gravel_km')
where tt.code='movement'
on conflict (tariff_type_id,concept_id) do update set is_active=true,updated_at=now();
insert into public.tariff_type_service_links(tariff_type_id,concept_id,is_active)
select tt.tariff_type_id,sc.concept_id,true
from public.tariff_types tt
join public.service_concepts sc on sc.code='wait_work'
where tt.code='work'
on conflict (tariff_type_id,concept_id) do update set is_active=true,updated_at=now();

update public.company_service_settings css
set requires_own_code=true,updated_at=now()
from public.service_concepts sc
where sc.concept_id=css.concept_id and sc.default_can_be_secondary and css.code_mode='manual';

insert into public.company_service_category_settings(company_id,category_id,is_enabled,notes)
select css.company_id,cat.category_id,css.is_enabled,'Migrado desde configuración V2'
from public.company_service_settings css
join public.service_categories cat on cat.legacy_primary_concept_id=css.concept_id
on conflict (company_id,category_id) do update set is_enabled=excluded.is_enabled,updated_at=now();

with latest_cards as (
  select distinct on (cc.company_id) cc.company_id,rc.rate_card_id
  from public.company_rate_cards rc
  join public.company_contracts cc on cc.contract_id=rc.contract_id
  where rc.status='active' and rc.valid_from<=current_date and (rc.valid_until is null or rc.valid_until>=current_date)
  order by cc.company_id,rc.version desc,rc.valid_from desc,rc.created_at desc
)
insert into public.company_service_category_settings(company_id,category_id,is_enabled,notes)
select lc.company_id,cat.category_id,true,'Inferido desde tarifario V2 activo'
from latest_cards lc
join public.company_rate_items ri on ri.rate_card_id=lc.rate_card_id and ri.is_active and ri.can_be_primary
join public.service_categories cat on cat.legacy_primary_concept_id=ri.concept_id
on conflict (company_id,category_id) do nothing;

insert into public.company_service_settings(company_id,concept_id,is_enabled,requires_own_code,notes)
select distinct ccs.company_id,sc.concept_id,true,false,'Concepto automático Tarifario V3'
from public.company_service_category_settings ccs
cross join public.service_concepts sc
where ccs.is_enabled and sc.code in ('movement_charge','asphalt_km','gravel_km')
on conflict (company_id,concept_id) do update set is_enabled=true,requires_own_code=false,updated_at=now();

insert into public.company_service_settings(company_id,concept_id,is_enabled,requires_own_code,notes)
select css.company_id,newc.concept_id,bool_or(css.is_enabled),bool_or(css.code_mode='manual'),'Migrado desde conceptos de espera V2'
from public.company_service_settings css
join public.service_concepts oldc on oldc.concept_id=css.concept_id and oldc.code in ('wait_work_light','wait_work_semi')
cross join lateral (select concept_id from public.service_concepts where code='wait_work') newc
group by css.company_id,newc.concept_id
on conflict (company_id,concept_id) do update set
  is_enabled=excluded.is_enabled,requires_own_code=excluded.requires_own_code,updated_at=now();

-- Versiones históricas explícitas: Movida, KM Asfalto y KM Ripio.
insert into public.company_tariff_matrix_rates(
  company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,
  pricing_unit,unit_price,change_reason,metadata,superseded_at,created_by,created_at
)
select pv.company_id,pv.billing_base_id,cat.category_id,mov.concept_id,pv.valid_from,pv.valid_until,pv.revision,pv.is_current,pv.currency,
       'unit',pv.service_day_value,pv.change_reason,
       jsonb_build_object('source','company_service_price_versions','legacy_price_version_id',pv.price_version_id,'legacy_component','service_day'),
       pv.superseded_at,pv.created_by,pv.created_at
from public.company_service_price_versions pv
join public.service_categories cat on cat.legacy_primary_concept_id=pv.concept_id
cross join lateral (select concept_id from public.service_concepts where code='movement_charge') mov
where pv.service_day_mode='numeric' and pv.service_day_value is not null
on conflict do nothing;

insert into public.company_tariff_matrix_rates(
  company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,
  pricing_unit,unit_price,change_reason,metadata,superseded_at,created_by,created_at
)
select pv.company_id,pv.billing_base_id,cat.category_id,km.concept_id,pv.valid_from,pv.valid_until,pv.revision,pv.is_current,pv.currency,
       'km',pv.asphalt_day_value,pv.change_reason,
       jsonb_build_object('source','company_service_price_versions','legacy_price_version_id',pv.price_version_id,'legacy_component','asphalt_day'),
       pv.superseded_at,pv.created_by,pv.created_at
from public.company_service_price_versions pv
join public.service_categories cat on cat.legacy_primary_concept_id=pv.concept_id
cross join lateral (select concept_id from public.service_concepts where code='asphalt_km') km
where pv.asphalt_day_mode='numeric' and pv.asphalt_day_value is not null
on conflict do nothing;

insert into public.company_tariff_matrix_rates(
  company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,
  pricing_unit,unit_price,change_reason,metadata,superseded_at,created_by,created_at
)
select pv.company_id,pv.billing_base_id,cat.category_id,km.concept_id,pv.valid_from,pv.valid_until,pv.revision,pv.is_current,pv.currency,
       'km',pv.dirt_day_value,pv.change_reason,
       jsonb_build_object('source','company_service_price_versions','legacy_price_version_id',pv.price_version_id,'legacy_component','dirt_day'),
       pv.superseded_at,pv.created_by,pv.created_at
from public.company_service_price_versions pv
join public.service_categories cat on cat.legacy_primary_concept_id=pv.concept_id
cross join lateral (select concept_id from public.service_concepts where code='gravel_km') km
where pv.dirt_day_mode='numeric' and pv.dirt_day_value is not null
on conflict do nothing;

-- Espera histórica específica por categoría.
insert into public.company_tariff_matrix_rates(
  company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,
  pricing_unit,unit_price,change_reason,metadata,superseded_at,created_by,created_at
)
select pv.company_id,pv.billing_base_id,cat.category_id,newc.concept_id,pv.valid_from,pv.valid_until,pv.revision,pv.is_current,pv.currency,
       'hour',pv.service_day_value,pv.change_reason,
       jsonb_build_object('source','company_service_price_versions','legacy_price_version_id',pv.price_version_id,'legacy_concept',oldc.code),
       pv.superseded_at,pv.created_by,pv.created_at
from public.company_service_price_versions pv
join public.service_concepts oldc on oldc.concept_id=pv.concept_id and oldc.code in ('wait_work_light','wait_work_semi')
join public.service_categories cat on cat.code=case oldc.code when 'wait_work_light' then 'light' else 'semi_heavy' end
cross join lateral (select concept_id from public.service_concepts where code='wait_work') newc
where pv.service_day_mode='numeric' and pv.service_day_value is not null
on conflict do nothing;

-- Secundarios históricos genéricos: replicación por categorías habilitadas, respetando links explícitos.
insert into public.company_tariff_matrix_rates(
  company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,
  pricing_unit,unit_price,change_reason,metadata,superseded_at,created_by,created_at
)
select pv.company_id,pv.billing_base_id,ccs.category_id,pv.concept_id,pv.valid_from,pv.valid_until,pv.revision,pv.is_current,pv.currency,
       coalesce(ri.pricing_unit,sc.default_pricing_unit),pv.service_day_value,pv.change_reason,
       jsonb_build_object('source','company_service_price_versions','legacy_price_version_id',pv.price_version_id),
       pv.superseded_at,pv.created_by,pv.created_at
from public.company_service_price_versions pv
join public.service_concepts sc on sc.concept_id=pv.concept_id
join public.company_service_category_settings ccs on ccs.company_id=pv.company_id and ccs.is_enabled
join public.service_categories cat on cat.category_id=ccs.category_id
left join lateral (
  select i.pricing_unit
  from public.company_rate_items i
  where i.rate_card_id=pv.rate_card_id and i.concept_id=pv.concept_id and i.is_active
    and (coalesce(i.billing_base_id,i.branch_id) is null or coalesce(i.billing_base_id,i.branch_id)=pv.billing_base_id)
  order by (coalesce(i.billing_base_id,i.branch_id)=pv.billing_base_id) desc nulls last
  limit 1
) ri on true
where sc.matrix_visible and sc.billing_family in ('variable','sale')
  and pv.service_day_mode='numeric' and pv.service_day_value is not null
  and (
    not exists(select 1 from public.company_rate_service_links l where l.rate_card_id=pv.rate_card_id and l.is_enabled)
    or exists(select 1 from public.company_rate_service_links l where l.rate_card_id=pv.rate_card_id and l.is_enabled
      and l.primary_concept_id=cat.legacy_primary_concept_id and l.secondary_concept_id=pv.concept_id)
  )
on conflict do nothing;

-- Fallback desde el último tarifario activo para prestadoras sin price_versions.
with latest_cards as (
  select distinct on (cc.company_id) cc.company_id,rc.*
  from public.company_rate_cards rc join public.company_contracts cc on cc.contract_id=rc.contract_id
  where rc.status='active' and rc.valid_from<=current_date and (rc.valid_until is null or rc.valid_until>=current_date)
  order by cc.company_id,rc.version desc,rc.valid_from desc,rc.created_at desc
)
insert into public.company_tariff_matrix_rates(company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,pricing_unit,unit_price,change_reason,metadata)
select lc.company_id,coalesce(ri.billing_base_id,ri.branch_id),cat.category_id,mov.concept_id,lc.valid_from,lc.valid_until,1,true,lc.currency,
       'unit',ri.primary_price,'Migrado desde tarifario V2',jsonb_build_object('source','company_rate_items','legacy_rate_item_id',ri.rate_item_id)
from latest_cards lc
join public.company_rate_items ri on ri.rate_card_id=lc.rate_card_id and ri.is_active and ri.can_be_primary
join public.service_categories cat on cat.legacy_primary_concept_id=ri.concept_id
cross join lateral (select concept_id from public.service_concepts where code='movement_charge') mov
where not exists(select 1 from public.company_tariff_matrix_rates r
  where r.company_id=lc.company_id and r.category_id=cat.category_id and r.concept_id=mov.concept_id and r.is_current
    and coalesce(r.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(coalesce(ri.billing_base_id,ri.branch_id),'00000000-0000-0000-0000-000000000000'::uuid));

with latest_cards as (
  select distinct on (cc.company_id) cc.company_id,rc.*
  from public.company_rate_cards rc join public.company_contracts cc on cc.contract_id=rc.contract_id
  where rc.status='active' and rc.valid_from<=current_date and (rc.valid_until is null or rc.valid_until>=current_date)
  order by cc.company_id,rc.version desc,rc.valid_from desc,rc.created_at desc
)
insert into public.company_tariff_matrix_rates(company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,pricing_unit,unit_price,change_reason,metadata)
select lc.company_id,coalesce(ri.billing_base_id,ri.branch_id),cat.category_id,km.concept_id,lc.valid_from,lc.valid_until,1,true,lc.currency,
       'km',ri.extra_km_price,'Migrado desde tarifario V2',jsonb_build_object('source','company_rate_items','legacy_rate_item_id',ri.rate_item_id,'legacy_component','extra_km_price')
from latest_cards lc
join public.company_rate_items ri on ri.rate_card_id=lc.rate_card_id and ri.is_active and ri.can_be_primary
join public.service_categories cat on cat.legacy_primary_concept_id=ri.concept_id
cross join lateral (select concept_id from public.service_concepts where code='asphalt_km') km
where ri.extra_km_price>0
  and not exists(select 1 from public.company_tariff_matrix_rates r
    where r.company_id=lc.company_id and r.category_id=cat.category_id and r.concept_id=km.concept_id and r.is_current
      and coalesce(r.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(coalesce(ri.billing_base_id,ri.branch_id),'00000000-0000-0000-0000-000000000000'::uuid));

with latest_cards as (
  select distinct on (cc.company_id) cc.company_id,rc.*
  from public.company_rate_cards rc join public.company_contracts cc on cc.contract_id=rc.contract_id
  where rc.status='active' and rc.valid_from<=current_date and (rc.valid_until is null or rc.valid_until>=current_date)
  order by cc.company_id,rc.version desc,rc.valid_from desc,rc.created_at desc
), candidates as (
  select lc.company_id,lc.rate_card_id,lc.valid_from,lc.valid_until,lc.currency,
         ri.rate_item_id,ri.concept_id,ri.billing_base_id,ri.branch_id,ri.pricing_unit,ri.secondary_price,ri.code_mode,
         sc.code as legacy_code,sc.matrix_visible,ccs.category_id,cat.code as category_code,cat.legacy_primary_concept_id
  from latest_cards lc
  join public.company_rate_items ri on ri.rate_card_id=lc.rate_card_id and ri.is_active and ri.can_be_secondary
  join public.service_concepts sc on sc.concept_id=ri.concept_id
  join public.company_service_category_settings ccs on ccs.company_id=lc.company_id and ccs.is_enabled
  join public.service_categories cat on cat.category_id=ccs.category_id
  where sc.billing_family in ('variable','sale')
)
insert into public.company_tariff_matrix_rates(company_id,billing_base_id,category_id,concept_id,valid_from,valid_until,revision,is_current,currency,pricing_unit,unit_price,change_reason,metadata)
select x.company_id,coalesce(x.billing_base_id,x.branch_id),x.category_id,
       case when x.legacy_code in ('wait_work_light','wait_work_semi') then wc.concept_id else x.concept_id end,
       x.valid_from,x.valid_until,1,true,x.currency,
       case when x.legacy_code in ('wait_work_light','wait_work_semi') then 'hour' else x.pricing_unit end,
       x.secondary_price,'Migrado desde tarifario V2',jsonb_build_object('source','company_rate_items','legacy_rate_item_id',x.rate_item_id)
from candidates x
cross join lateral (select concept_id from public.service_concepts where code='wait_work') wc
where (x.matrix_visible or x.legacy_code in ('wait_work_light','wait_work_semi'))
  and (x.legacy_code<>'wait_work_light' or x.category_code='light')
  and (x.legacy_code<>'wait_work_semi' or x.category_code='semi_heavy')
  and (
    not exists(select 1 from public.company_rate_service_links l where l.rate_card_id=x.rate_card_id and l.is_enabled)
    or exists(select 1 from public.company_rate_service_links l where l.rate_card_id=x.rate_card_id and l.is_enabled
      and l.primary_concept_id=x.legacy_primary_concept_id and l.secondary_concept_id=x.concept_id)
  )
  and not exists(select 1 from public.company_tariff_matrix_rates r
    where r.company_id=x.company_id and r.category_id=x.category_id
      and r.concept_id=case when x.legacy_code in ('wait_work_light','wait_work_semi') then wc.concept_id else x.concept_id end
      and r.is_current
      and coalesce(r.billing_base_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(coalesce(x.billing_base_id,x.branch_id),'00000000-0000-0000-0000-000000000000'::uuid));

with latest_cards as (
  select distinct on (cc.company_id) cc.company_id,rc.rate_card_id
  from public.company_rate_cards rc join public.company_contracts cc on cc.contract_id=rc.contract_id
  where rc.status='active' and rc.valid_from<=current_date and (rc.valid_until is null or rc.valid_until>=current_date)
  order by cc.company_id,rc.version desc,rc.valid_from desc,rc.created_at desc
)
insert into public.company_service_settings(company_id,concept_id,is_enabled,requires_own_code,notes)
select distinct lc.company_id,case when sc.code in ('wait_work_light','wait_work_semi') then wc.concept_id else sc.concept_id end,
       true,ri.code_mode='manual','Inferido desde tarifario V2 activo'
from latest_cards lc
join public.company_rate_items ri on ri.rate_card_id=lc.rate_card_id and ri.is_active and ri.can_be_secondary
join public.service_concepts sc on sc.concept_id=ri.concept_id
cross join lateral (select concept_id from public.service_concepts where code='wait_work') wc
where sc.matrix_visible or sc.code in ('wait_work_light','wait_work_semi')
on conflict (company_id,concept_id) do update set
  is_enabled=public.company_service_settings.is_enabled or excluded.is_enabled,
  requires_own_code=public.company_service_settings.requires_own_code or excluded.requires_own_code,
  updated_at=now();

update public.operator_services os
set category_id=cat.category_id
from public.service_categories cat
where os.category_id is null and cat.legacy_primary_concept_id=os.primary_concept_id;
update public.operator_service_items osi
set category_id=os.category_id,list_unit_price=coalesce(osi.list_unit_price,osi.unit_price)
from public.operator_services os
where os.service_id=osi.service_id;
