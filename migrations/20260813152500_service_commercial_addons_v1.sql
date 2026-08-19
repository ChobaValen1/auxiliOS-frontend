-- AuxiliOS · liquidación comercial de Peajes y Excedentes
-- Peajes: cobertura manual + pagador + medio de pago del socio.
-- Excedentes: siempre a cargo del socio y con medio de pago obligatorio.

alter table public.operator_services
  add column if not exists toll_coverage_mode text;

alter table public.operator_service_tolls
  add column if not exists payer_agent text,
  add column if not exists customer_payment_method text,
  add column if not exists provider_unit_amount numeric(14,2),
  add column if not exists customer_unit_amount numeric(14,2);

do $$
begin
  if not exists(select 1 from pg_constraint where conname='operator_services_toll_coverage_mode_chk') then
    alter table public.operator_services add constraint operator_services_toll_coverage_mode_chk
      check (toll_coverage_mode is null or toll_coverage_mode in ('provider_roundtrip','mixed_manual','customer_roundtrip'));
  end if;
  if not exists(select 1 from pg_constraint where conname='operator_service_tolls_payer_agent_chk') then
    alter table public.operator_service_tolls add constraint operator_service_tolls_payer_agent_chk
      check (payer_agent is null or payer_agent in ('provider','customer','both'));
  end if;
  if not exists(select 1 from pg_constraint where conname='operator_service_tolls_customer_payment_chk') then
    alter table public.operator_service_tolls add constraint operator_service_tolls_customer_payment_chk
      check (customer_payment_method is null or customer_payment_method in ('cash','transfer','card','mercado_pago','other'));
  end if;
  if not exists(select 1 from pg_constraint where conname='operator_service_tolls_allocation_chk') then
    alter table public.operator_service_tolls add constraint operator_service_tolls_allocation_chk
      check (
        provider_unit_amount is null or customer_unit_amount is null or
        (provider_unit_amount >= 0 and customer_unit_amount >= 0 and round(provider_unit_amount + customer_unit_amount,2)=round(unit_amount,2))
      );
  end if;
end $$;

create unique index if not exists operator_service_tolls_unique_business_charge
on public.operator_service_tolls(
  service_id,
  toll_id,
  payer_agent,
  coalesce(customer_payment_method,'n/a')
)
where source='planned' and toll_id is not null and payer_agent is not null;

create table if not exists public.operator_service_excess_charges(
  excess_charge_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  concept_id uuid not null references public.service_concepts(concept_id),
  concept_name_snapshot text not null,
  quantity numeric(12,2) not null default 1 check (quantity>0),
  unit_amount numeric(14,2) not null check (unit_amount>0),
  total_amount numeric(14,2) generated always as (round(quantity*unit_amount,2)) stored,
  currency text not null default 'ARS',
  payer_agent text not null default 'customer' check (payer_agent='customer'),
  customer_payment_method text not null check (customer_payment_method in ('cash','transfer','card','mercado_pago','other')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_test boolean not null default false
);

alter table public.operator_service_excess_charges enable row level security;
revoke all on table public.operator_service_excess_charges from public,anon,authenticated;

create unique index if not exists operator_service_excess_unique_business_charge
on public.operator_service_excess_charges(
  service_id,
  concept_id,
  unit_amount,
  customer_payment_method
);

create index if not exists operator_service_excess_service_idx
on public.operator_service_excess_charges(service_id,created_at);

create or replace function app_private.normalize_service_commercial_addons_v1(
  p_company_id uuid,
  p_scheduled_for timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_mode text:=nullif(v_payload->>'toll_coverage_mode','');
  v_date date:=(coalesce(p_scheduled_for,now()) at time zone 'America/Argentina/Buenos_Aires')::date;
  v_row jsonb;
  v_toll_id uuid;
  v_rate_id uuid;
  v_qty integer;
  v_payer text;
  v_customer_method text;
  v_customer_unit numeric;
  v_provider_unit numeric;
  v_location public.toll_locations%rowtype;
  v_rate public.toll_rates%rowtype;
  v_tolls jsonb:='[]'::jsonb;
  v_excess jsonb:='[]'::jsonb;
  v_billing_tolls jsonb:='[]'::jsonb;
  v_provider_total numeric:=0;
  v_customer_total numeric:=0;
  v_excess_total numeric:=0;
  v_toll_keys text[]:='{}'::text[];
  v_excess_keys text[]:='{}'::text[];
  v_key text;
  v_concept_id uuid;
  v_concept_name text;
  v_excess_qty numeric;
  v_excess_unit numeric;
  v_currency text;
begin
  if jsonb_typeof(coalesce(v_payload->'tolls','[]'::jsonb))<>'array' then raise exception 'Los peajes deben enviarse como una lista'; end if;
  if jsonb_typeof(coalesce(v_payload->'excess_charges','[]'::jsonb))<>'array' then raise exception 'Los excedentes deben enviarse como una lista'; end if;
  if jsonb_array_length(coalesce(v_payload->'tolls','[]'::jsonb))>0 and v_mode not in ('provider_roundtrip','mixed_manual','customer_roundtrip') then
    raise exception 'Seleccioná la modalidad de cobertura de peajes';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(v_payload->'tolls','[]'::jsonb)) loop
    v_toll_id:=nullif(v_row->>'toll_id','')::uuid;
    v_rate_id:=nullif(v_row->>'toll_rate_id','')::uuid;
    v_qty:=greatest(coalesce(nullif(v_row->>'quantity','')::integer,1),1);
    v_payer:=lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),''));
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    if v_toll_id is null then raise exception 'Seleccioná un peaje dado de alta'; end if;
    if v_payer not in ('provider','customer','both') then raise exception 'Indicá quién paga el peaje'; end if;
    if v_payer in ('customer','both') and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Cuando paga el socio, el medio de pago es obligatorio'; end if;
    if v_payer='provider' then v_customer_method:=null; end if;

    v_key:=v_toll_id::text||'|'||v_payer||'|'||coalesce(v_customer_method,'n/a');
    if v_key=any(v_toll_keys) then raise exception 'No se permiten dos peajes iguales con el mismo pagador y medio de pago; aumentá la cantidad'; end if;
    v_toll_keys:=array_append(v_toll_keys,v_key);

    select l.* into v_location from public.toll_locations l where l.toll_id=v_toll_id and l.is_active;
    if not found then raise exception 'Peaje inexistente o inactivo'; end if;

    if v_rate_id is not null then
      select r.* into v_rate from public.toll_rates r
      where r.toll_rate_id=v_rate_id and r.toll_id=v_toll_id and r.is_active
        and r.valid_from<=v_date and (r.valid_until is null or r.valid_until>=v_date);
    else
      select r.* into v_rate from public.toll_rates r
      where r.toll_id=v_toll_id and r.is_active
        and r.valid_from<=v_date and (r.valid_until is null or r.valid_until>=v_date)
      order by (r.vehicle_category='light_2_axles' and r.payment_method='any') desc,r.valid_from desc,r.created_at desc limit 1;
    end if;
    if not found then raise exception 'El peaje % no tiene una tarifa vigente para la fecha del servicio',v_location.name; end if;

    if v_payer='provider' then
      v_provider_unit:=round(v_rate.amount,2);v_customer_unit:=0;
    elsif v_payer='customer' then
      v_provider_unit:=0;v_customer_unit:=round(v_rate.amount,2);
    else
      v_customer_unit:=round(greatest(coalesce(nullif(v_row->>'customer_unit_amount','')::numeric,0),0),2);
      if v_customer_unit<=0 or v_customer_unit>=round(v_rate.amount,2) then raise exception 'En %, la parte del socio debe ser mayor a cero y menor al importe total',v_location.name; end if;
      v_provider_unit:=round(v_rate.amount-v_customer_unit,2);
    end if;

    v_provider_total:=v_provider_total+(v_provider_unit*v_qty);
    v_customer_total:=v_customer_total+(v_customer_unit*v_qty);

    v_tolls:=v_tolls||jsonb_build_array(jsonb_build_object(
      'toll_id',v_location.toll_id,'toll_rate_id',v_rate.toll_rate_id,'toll_code',v_location.code,'toll_name',v_location.name,
      'road',v_location.road,'direction',v_location.direction,'vehicle_category',v_rate.vehicle_category,'payment_method',v_rate.payment_method,
      'quantity',v_qty,'unit_amount',round(v_rate.amount,2),'currency',upper(v_rate.currency),'source','planned',
      'payer_agent',v_payer,'customer_payment_method',v_customer_method,'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
    ));

    if v_provider_unit>0 then
      v_billing_tolls:=v_billing_tolls||jsonb_build_array(jsonb_build_object(
        'toll_id',v_location.toll_id,'toll_rate_id',v_rate.toll_rate_id,'toll_name',v_location.name,
        'vehicle_category',v_rate.vehicle_category,'payment_method',v_rate.payment_method,'quantity',v_qty,
        'unit_amount',v_provider_unit,'currency',upper(v_rate.currency),'source','planned'
      ));
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(coalesce(v_payload->'excess_charges','[]'::jsonb)) loop
    v_concept_id:=nullif(v_row->>'concept_id','')::uuid;
    v_excess_qty:=greatest(coalesce(nullif(v_row->>'quantity','')::numeric,1),0);
    v_excess_unit:=round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,0),0),2);
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    v_currency:=upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS'));
    if v_concept_id is null then raise exception 'Seleccioná el concepto del excedente'; end if;
    if v_excess_qty<=0 then raise exception 'La cantidad del excedente debe ser mayor a cero'; end if;
    if v_excess_unit<=0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
    if v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'El medio de pago del excedente es obligatorio'; end if;

    select sc.name into v_concept_name from public.service_concepts sc
    where sc.concept_id=v_concept_id and sc.is_active and sc.billing_family<>'system' and sc.service_category in ('secondary','mixed')
      and exists(select 1 from public.company_service_settings css where css.company_id=p_company_id and css.concept_id=sc.concept_id and css.is_enabled);
    if not found then raise exception 'El concepto de excedente no está habilitado para la prestadora'; end if;

    v_key:=v_concept_id::text||'|'||to_char(v_excess_unit,'FM999999999999990.00')||'|'||v_customer_method;
    if v_key=any(v_excess_keys) then raise exception 'No se permiten dos excedentes iguales con el mismo importe y medio de pago; aumentá la cantidad'; end if;
    v_excess_keys:=array_append(v_excess_keys,v_key);
    v_excess_total:=v_excess_total+(v_excess_qty*v_excess_unit);
    v_excess:=v_excess||jsonb_build_array(jsonb_build_object(
      'concept_id',v_concept_id,'concept_name',v_concept_name,'quantity',v_excess_qty,'unit_amount',v_excess_unit,
      'currency',v_currency,'payer_agent','customer','customer_payment_method',v_customer_method
    ));
  end loop;

  return jsonb_build_object(
    'toll_coverage_mode',v_mode,'tolls',v_tolls,'billing_tolls',v_billing_tolls,
    'excess_charges',v_excess,'provider_toll_total',round(v_provider_total,2),
    'customer_toll_total',round(v_customer_total,2),'customer_excess_total',round(v_excess_total,2)
  );
end;
$$;

revoke all on function app_private.normalize_service_commercial_addons_v1(uuid,timestamptz,jsonb) from public,anon,authenticated;

create or replace function app_private.persist_service_commercial_addons_v1(
  p_service_id uuid,
  p_normalized jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service public.operator_services%rowtype;
  v_row jsonb;
  v_uid uuid:=auth.uid();
begin
  select * into v_service from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;

  update public.operator_services set toll_coverage_mode=nullif(p_normalized->>'toll_coverage_mode',''),updated_by=v_uid,updated_at=now()
  where service_id=p_service_id;

  delete from public.operator_service_tolls where service_id=p_service_id and source in ('planned','manual');
  for v_row in select value from jsonb_array_elements(coalesce(p_normalized->'tolls','[]'::jsonb)) loop
    insert into public.operator_service_tolls(
      service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      vehicle_category,payment_method,quantity,unit_amount,currency,source,notes,created_by,updated_by,is_test,
      payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount
    ) values(
      p_service_id,(v_row->>'toll_id')::uuid,(v_row->>'toll_rate_id')::uuid,nullif(v_row->>'toll_code',''),v_row->>'toll_name',
      nullif(v_row->>'road',''),nullif(v_row->>'direction',''),v_row->>'vehicle_category',v_row->>'payment_method',
      (v_row->>'quantity')::integer,(v_row->>'unit_amount')::numeric,v_row->>'currency','planned',null,v_uid,v_uid,v_service.is_test,
      v_row->>'payer_agent',nullif(v_row->>'customer_payment_method',''),(v_row->>'provider_unit_amount')::numeric,(v_row->>'customer_unit_amount')::numeric
    );
  end loop;

  delete from public.operator_service_excess_charges where service_id=p_service_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_normalized->'excess_charges','[]'::jsonb)) loop
    insert into public.operator_service_excess_charges(
      service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,customer_payment_method,created_by,updated_by,is_test
    ) values(
      p_service_id,(v_row->>'concept_id')::uuid,v_row->>'concept_name',(v_row->>'quantity')::numeric,(v_row->>'unit_amount')::numeric,
      v_row->>'currency','customer',v_row->>'customer_payment_method',v_uid,v_uid,v_service.is_test
    );
  end loop;
end;
$$;
revoke all on function app_private.persist_service_commercial_addons_v1(uuid,jsonb) from public,anon,authenticated;

create or replace function public.get_operator_service_commercial_addons_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_tolls jsonb;
  v_excess jsonb;
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar peajes y excedentes'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,'quantity',t.quantity,
    'payer_agent',coalesce(t.payer_agent,'provider'),'customer_payment_method',t.customer_payment_method,
    'customer_unit_amount',t.customer_unit_amount,'unit_amount',t.unit_amount,'currency',t.currency
  )) order by t.created_at),'[]'::jsonb)
  into v_tolls from public.operator_service_tolls t
  where t.service_id=p_service_id and t.source='planned' and t.toll_id is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',e.concept_id,'quantity',e.quantity,'unit_amount',e.unit_amount,'currency',e.currency,
    'customer_payment_method',e.customer_payment_method
  ) order by e.created_at),'[]'::jsonb)
  into v_excess from public.operator_service_excess_charges e where e.service_id=p_service_id;

  return jsonb_build_object(
    'toll_coverage_mode',coalesce(v_service.toll_coverage_mode,case when jsonb_array_length(v_tolls)>0 then 'provider_roundtrip' end),
    'tolls',v_tolls,'excess_charges',v_excess
  );
end;
$$;
revoke all on function public.get_operator_service_commercial_addons_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_commercial_addons_v1(uuid) to authenticated,service_role;

-- Envolvemos los RPC públicos existentes. Los clientes viejos siguen usando la implementación previa.
do $$
begin
  if to_regprocedure('public.create_operator_service_v3_commercial_legacy(jsonb)') is null then
    execute 'alter function public.create_operator_service_v3(jsonb) rename to create_operator_service_v3_commercial_legacy';
  end if;
  if to_regprocedure('public.update_operator_service_commercial_legacy(uuid,jsonb,text)') is null then
    execute 'alter function public.update_operator_service(uuid,jsonb,text) rename to update_operator_service_commercial_legacy';
  end if;
end $$;

revoke all on function public.create_operator_service_v3_commercial_legacy(jsonb) from public,anon,authenticated;
revoke all on function public.update_operator_service_commercial_legacy(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_operator_service_v3_commercial_legacy(jsonb) to service_role;
grant execute on function public.update_operator_service_commercial_legacy(uuid,jsonb,text) to service_role;

create or replace function public.create_operator_service_v3(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_commercial jsonb;
  v_result jsonb;
  v_service_id uuid;
  v_scheduled timestamptz;
  v_company_id uuid;
begin
  if not (v_payload ? 'commercial_addons') then return public.create_operator_service_v3_commercial_legacy(v_payload); end if;
  v_company_id:=nullif(v_payload->>'company_id','')::uuid;
  v_scheduled:=coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,now());
  v_commercial:=app_private.normalize_service_commercial_addons_v1(v_company_id,v_scheduled,v_payload->'commercial_addons');
  v_payload:=v_payload-'commercial_addons';
  v_payload:=jsonb_set(v_payload,'{tolls}',coalesce(v_commercial->'billing_tolls','[]'::jsonb),true);
  v_payload:=jsonb_set(v_payload,'{toll_estimate}',to_jsonb(coalesce((v_commercial->>'provider_toll_total')::numeric,0)),true);

  -- Saltamos el wrapper de catálogo anterior para permitir el mismo peaje con distinto pagador/medio de pago.
  v_result:=public.create_operator_service_v3_catalog_legacy(v_payload);
  v_service_id:=nullif(v_result->>'service_id','')::uuid;
  if v_service_id is null then raise exception 'No se pudo identificar el servicio creado'; end if;
  perform app_private.persist_service_commercial_addons_v1(v_service_id,v_commercial);
  return v_result||jsonb_build_object('commercial_addons',v_commercial);
end;
$$;
revoke all on function public.create_operator_service_v3(jsonb) from public,anon;
grant execute on function public.create_operator_service_v3(jsonb) to authenticated,service_role;

create or replace function public.update_operator_service(
  p_service_id uuid,
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_service public.operator_services%rowtype;
  v_commercial jsonb;
  v_result jsonb;
  v_reason text:=nullif(btrim(p_reason),'');
begin
  if not (v_payload ? 'commercial_addons') then return public.update_operator_service_commercial_legacy(p_service_id,v_payload,p_reason); end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if (v_service.trip_id is not null or v_service.status not in ('pending','assigned')) and v_reason is null then
    raise exception 'Indicá el motivo de la corrección porque el viaje ya fue iniciado';
  end if;

  v_commercial:=app_private.normalize_service_commercial_addons_v1(
    v_service.company_id,
    coalesce(nullif(v_payload->>'scheduled_for','')::timestamptz,v_service.scheduled_for),
    v_payload->'commercial_addons'
  );
  v_payload:=v_payload-'commercial_addons';
  v_payload:=jsonb_set(v_payload,'{tolls}',coalesce(v_commercial->'billing_tolls','[]'::jsonb),true);
  v_payload:=jsonb_set(v_payload,'{toll_estimate}',to_jsonb(coalesce((v_commercial->>'provider_toll_total')::numeric,0)),true);

  v_result:=app_private.update_operator_service_full(p_service_id,v_payload,p_reason);
  perform app_private.persist_service_commercial_addons_v1(p_service_id,v_commercial);
  return v_result||jsonb_build_object('commercial_addons',v_commercial);
end;
$$;
revoke all on function public.update_operator_service(uuid,jsonb,text) from public,anon;
grant execute on function public.update_operator_service(uuid,jsonb,text) to authenticated,service_role;
