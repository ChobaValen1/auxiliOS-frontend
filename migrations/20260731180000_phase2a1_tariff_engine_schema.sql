-- AuxiliOS · Fase 2A.1: motor tarifario y configuración dinámica

create table if not exists public.service_concepts (
  concept_id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,60}$'),
  name text not null,
  description text,
  default_can_be_primary boolean not null default false,
  default_can_be_secondary boolean not null default false,
  default_pricing_unit text not null default 'service'
    check (default_pricing_unit in ('service','hour','km','unit','day','fixed')),
  icon text not null default '⚙',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_can_be_primary or default_can_be_secondary)
);

insert into public.service_concepts
(code,name,description,default_can_be_primary,default_can_be_secondary,default_pricing_unit,icon,sort_order)
values
('urban_tow','Asistencia liviano','Servicio principal para vehículos livianos.',true,false,'service','🚗',10),
('semi_heavy_assistance','Asistencia semipesado','Servicio principal para unidades semipesadas.',true,false,'service','🚚',20),
('uml','UML','Unidad móvil liviana.',true,false,'service','🛻',30),
('extraction','Extracción','Puede solicitarse sola o como adicional.',true,true,'service','🪝',40),
('wait_work_light','Hora de Trabajo / Espera LIVIANO','Tiempo adicional para livianos.',false,true,'hour','⏱',50),
('wait_work_semi','Hora de Espera / Trabajo SEMIPESADO','Tiempo adicional para semipesados.',false,true,'hour','⏱',60),
('double_cabin_traveler','Doble Cabina / Viajero','Traslado de acompañantes.',false,true,'unit','👥',70),
('tow_dolly','Uso de Carros','Uso de carros o dolly.',false,true,'service','🛞',80),
('battery_1250','Venta batería 1250','Venta e instalación.',true,true,'unit','🔋',90),
('battery_1265','Venta batería 1265','Venta e instalación.',true,true,'unit','🔋',100),
('battery_1275','Venta batería 1275','Venta e instalación.',true,true,'unit','🔋',110),
('battery_bosch','Venta batería Bosch','Venta e instalación.',true,true,'unit','🔋',120),
('vehicle_storage','Guarda de Vehículo','Guarda o estadía.',true,true,'day','🅿',130),
('toll','Peaje','Peajes utilizados.',false,true,'unit','🛣',140),
('extra_km','Kilómetro excedente','Kilómetros adicionales.',false,true,'km','📍',150),
('cancellation','Cancelación','Cargo por cancelación.',false,true,'fixed','✕',160),
('crane_service','Grúa / Izaje','Maniobra de grúa o izaje.',true,true,'service','🏗',170)
on conflict (code) do update set
 name=excluded.name, description=excluded.description,
 default_can_be_primary=excluded.default_can_be_primary,
 default_can_be_secondary=excluded.default_can_be_secondary,
 default_pricing_unit=excluded.default_pricing_unit,
 icon=excluded.icon, sort_order=excluded.sort_order,
 is_active=true, updated_at=now();

insert into public.service_concepts
(code,name,default_can_be_primary,default_can_be_secondary,default_pricing_unit,icon,sort_order)
select distinct ri.service_code,ri.service_name,true,false,'service','⚙',500
from public.company_rate_items ri
where not exists(select 1 from public.service_concepts sc where sc.code=ri.service_code)
on conflict(code) do nothing;

alter table public.company_rate_items
 add column if not exists concept_id uuid references public.service_concepts(concept_id) on delete restrict,
 add column if not exists can_be_primary boolean not null default true,
 add column if not exists can_be_secondary boolean not null default false,
 add column if not exists pricing_unit text not null default 'service'
   check (pricing_unit in ('service','hour','km','unit','day','fixed')),
 add column if not exists primary_price numeric(14,2) not null default 0 check(primary_price>=0),
 add column if not exists secondary_price numeric(14,2) not null default 0 check(secondary_price>=0);

alter table public.company_rate_items disable trigger company_rate_items_validate;
update public.company_rate_items ri set
 concept_id=sc.concept_id,
 can_be_primary=sc.default_can_be_primary,
 can_be_secondary=sc.default_can_be_secondary,
 pricing_unit=sc.default_pricing_unit,
 primary_price=case when sc.default_can_be_primary then ri.base_price else 0 end,
 secondary_price=case when sc.default_can_be_secondary and not sc.default_can_be_primary then ri.base_price else 0 end
from public.service_concepts sc
where sc.code=ri.service_code and ri.concept_id is null;
alter table public.company_rate_items enable trigger company_rate_items_validate;
alter table public.company_rate_items alter column concept_id set not null;
create index if not exists company_rate_items_concept_idx
 on public.company_rate_items(rate_card_id,concept_id,branch_id);

create or replace function app_private.validate_company_rate_item()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare company_id uuid; card_status text; c public.service_concepts%rowtype;
begin
 select ct.company_id,rc.status into company_id,card_status
 from public.company_rate_cards rc
 join public.company_contracts ct on ct.contract_id=rc.contract_id
 where rc.rate_card_id=case when tg_op='DELETE' then old.rate_card_id else new.rate_card_id end;
 if company_id is null then raise exception 'Tarifario inexistente.'; end if;
 if card_status<>'draft' then raise exception 'Solo se puede modificar un tarifario en borrador.'; end if;
 if tg_op='DELETE' then return old; end if;
 if new.branch_id is not null and not exists(
  select 1 from public.company_branches b
  where b.branch_id=new.branch_id and b.company_id=company_id and b.is_active
 ) then raise exception 'La sucursal no pertenece a la empresa o está inactiva.'; end if;
 select * into c from public.service_concepts where concept_id=new.concept_id and is_active;
 if c.concept_id is null then raise exception 'Concepto inexistente o inactivo.'; end if;
 if not(new.can_be_primary or new.can_be_secondary) then
   raise exception 'El concepto debe habilitarse como principal, secundario o mixto.';
 end if;
 if new.can_be_primary and not c.default_can_be_primary then
   raise exception 'Este concepto no puede utilizarse como principal.';
 end if;
 if new.can_be_secondary and not c.default_can_be_secondary then
   raise exception 'Este concepto no puede utilizarse como secundario.';
 end if;
 new.service_code:=c.code;
 new.service_name:=c.name;
 new.base_price:=case when new.can_be_primary then new.primary_price else new.secondary_price end;
 return new;
end $$;

create table if not exists public.company_rate_service_links(
 link_id uuid primary key default gen_random_uuid(),
 rate_card_id uuid not null references public.company_rate_cards(rate_card_id) on delete cascade,
 primary_concept_id uuid not null references public.service_concepts(concept_id) on delete restrict,
 secondary_concept_id uuid not null references public.service_concepts(concept_id) on delete restrict,
 price_override numeric(14,2) check(price_override is null or price_override>=0),
 is_enabled boolean not null default true,
 notes text,
 created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(primary_concept_id<>secondary_concept_id),
 unique(rate_card_id,primary_concept_id,secondary_concept_id)
);

create table if not exists public.company_rate_rules(
 rule_id uuid primary key default gen_random_uuid(),
 rate_card_id uuid not null references public.company_rate_cards(rate_card_id) on delete cascade,
 rule_type text not null check(rule_type in ('night','weekend_holiday','wide_coverage')),
 enabled boolean not null default false,
 calculation_mode text not null default 'percentage' check(calculation_mode in ('percentage','fixed')),
 amount numeric(14,2) not null default 0 check(amount>=0),
 start_time time, end_time time,
 saturday_start time, saturday_end time,
 sunday_holiday_start time, sunday_holiday_end time,
 distance_threshold_km numeric(10,2) check(distance_threshold_km is null or distance_threshold_km>=0),
 notes text,
 created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(rate_card_id,rule_type)
);

create table if not exists public.company_rate_rule_exceptions(
 exception_id uuid primary key default gen_random_uuid(),
 rate_card_id uuid not null references public.company_rate_cards(rate_card_id) on delete cascade,
 rule_id uuid not null references public.company_rate_rules(rule_id) on delete cascade,
 concept_id uuid not null references public.service_concepts(concept_id) on delete restrict,
 created_by uuid default auth.uid(), created_at timestamptz not null default now(),
 unique(rule_id,concept_id)
);

create table if not exists public.company_rate_billing_settings(
 rate_card_id uuid primary key references public.company_rate_cards(rate_card_id) on delete cascade,
 copay_enabled boolean not null default false,
 copay_mode text not null default 'fixed' check(copay_mode in ('fixed','percentage')),
 copay_value numeric(14,2) not null default 0 check(copay_value>=0),
 toll_enabled boolean not null default false,
 toll_invoice_enabled boolean not null default false,
 toll_mode text not null default 'at_cost' check(toll_mode in ('at_cost','fixed','included')),
 toll_fixed_amount numeric(14,2) not null default 0 check(toll_fixed_amount>=0),
 require_toll_receipt boolean not null default true,
 created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.company_rate_codes(
 code_id uuid primary key default gen_random_uuid(),
 rate_card_id uuid not null references public.company_rate_cards(rate_card_id) on delete cascade,
 code_key text not null check(code_key in ('traveler','work','toll','wait','osa','extraction','storage','excess','special')),
 enabled boolean not null default false,
 created_by uuid default auth.uid(), updated_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(rate_card_id,code_key)
);

create or replace function app_private.rate_card_is_draft(p_id uuid)
returns boolean language sql stable security invoker
set search_path=pg_catalog,public as $$
 select exists(select 1 from public.company_rate_cards where rate_card_id=p_id and status='draft')
$$;

create or replace function app_private.initialize_rate_card_engine()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
 insert into public.company_rate_rules
 (rate_card_id,rule_type,enabled,calculation_mode,amount,start_time,end_time,saturday_start,saturday_end,sunday_holiday_start,sunday_holiday_end)
 values
 (new.rate_card_id,'night',false,'percentage',20,'21:59','05:59',null,null,null,null),
 (new.rate_card_id,'weekend_holiday',false,'percentage',20,null,null,'21:59','05:59','21:59','05:59'),
 (new.rate_card_id,'wide_coverage',false,'percentage',0,null,null,null,null,null,null)
 on conflict(rate_card_id,rule_type) do nothing;
 insert into public.company_rate_billing_settings(rate_card_id) values(new.rate_card_id)
 on conflict(rate_card_id) do nothing;
 insert into public.company_rate_codes(rate_card_id,code_key,enabled) values
 (new.rate_card_id,'traveler',true),(new.rate_card_id,'work',false),(new.rate_card_id,'toll',false),
 (new.rate_card_id,'wait',true),(new.rate_card_id,'osa',false),(new.rate_card_id,'extraction',true),
 (new.rate_card_id,'storage',true),(new.rate_card_id,'excess',true),(new.rate_card_id,'special',true)
 on conflict(rate_card_id,code_key) do nothing;
 return new;
end $$;

create or replace function app_private.validate_rate_card_engine_child()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare d jsonb; card_id uuid; p uuid; s uuid; r uuid; c uuid;
begin
 d:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 card_id:=(d->>'rate_card_id')::uuid;
 if card_id is null or not app_private.rate_card_is_draft(card_id) then
   raise exception 'Solo se puede modificar un tarifario en borrador.';
 end if;
 if tg_table_name='company_rate_service_links' and tg_op<>'DELETE' then
   p:=(d->>'primary_concept_id')::uuid; s:=(d->>'secondary_concept_id')::uuid;
   if not exists(select 1 from public.company_rate_items where rate_card_id=card_id and concept_id=p and can_be_primary and is_active)
      or not exists(select 1 from public.company_rate_items where rate_card_id=card_id and concept_id=s and can_be_secondary and is_active)
   then raise exception 'La relación requiere conceptos principal y secundario habilitados.'; end if;
 end if;
 if tg_table_name='company_rate_rule_exceptions' and tg_op<>'DELETE' then
   r:=(d->>'rule_id')::uuid; c:=(d->>'concept_id')::uuid;
   if not exists(select 1 from public.company_rate_rules where rule_id=r and rate_card_id=card_id)
      or not exists(select 1 from public.company_rate_items where rate_card_id=card_id and concept_id=c and is_active)
   then raise exception 'La excepción no pertenece al tarifario o el concepto no está habilitado.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

create or replace function app_private.prepare_rate_card_activation()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public as $$
begin
 if new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
   if not exists(select 1 from public.company_rate_items where rate_card_id=new.rate_card_id and is_active and can_be_primary)
   then raise exception 'El tarifario debe tener al menos un concepto principal.'; end if;
   update public.company_rate_cards set status='expired',
    valid_until=coalesce(valid_until,greatest(valid_from,new.valid_from-1)),
    updated_at=now(),updated_by=auth.uid()
   where contract_id=new.contract_id and status='active' and rate_card_id<>new.rate_card_id;
 end if;
 return new;
end $$;
