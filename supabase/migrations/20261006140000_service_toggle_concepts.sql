-- Se aplica con lock_timeout para no esperar locks en tablas con uso.
set lock_timeout = '5s';
-- Conceptos "interruptor" (sí/no, sin precio), por ejemplo Pinacars.
-- Lo marcan el operador en el servicio y el chofer en el remito; no pasan por
-- excedentes, cotización ni facturación. Solo alimentan las comisiones de sueldos.

alter table public.service_concepts
  add column if not exists input_mode text not null default 'quantity';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'service_concepts_input_mode_check') then
    alter table public.service_concepts
      add constraint service_concepts_input_mode_check check (input_mode in ('quantity','toggle'));
  end if;
end $$;

create table if not exists public.service_toggle_marks (
  mark_id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('operator','driver')),
  -- Sin FK a servicios/remitos para no bloquear sus bajas; una marca huérfana no cuenta.
  service_id uuid,
  remito_id integer,
  concept_id uuid not null references public.service_concepts(concept_id),
  is_on boolean not null default true,
  marked_by uuid,
  marked_at timestamptz not null default now(),
  check ((source = 'operator' and service_id is not null) or (source = 'driver' and remito_id is not null))
);
create unique index if not exists service_toggle_marks_operator_uq on public.service_toggle_marks(service_id, concept_id) where source = 'operator';
create unique index if not exists service_toggle_marks_driver_uq on public.service_toggle_marks(remito_id, concept_id) where source = 'driver';
alter table public.service_toggle_marks enable row level security;

-- Conceptos interruptor habilitados para la empresa del servicio y los ya marcados.
create or replace function public.get_service_toggle_concepts_v1(p_company_id uuid default null, p_service_id uuid default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_role text := coalesce(app_private.current_auxilios_role(), '');
  v_company uuid := p_company_id;
  v_driver uuid;
  v_selected uuid[] := '{}';
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion','chofer') then
    raise exception 'Sin permiso';
  end if;
  if p_service_id is not null then
    select s.company_id, s.assigned_driver_id into v_company, v_driver
    from public.operator_services s where s.service_id = p_service_id;
    if not found then raise exception 'Servicio inexistente'; end if;
    if v_role = 'chofer' and v_driver is distinct from auth.uid() then raise exception 'Sin permiso'; end if;
    select coalesce(array_agg(distinct m.concept_id), '{}') into v_selected
    from public.service_toggle_marks m
    where m.is_on and ((m.source = 'operator' and m.service_id = p_service_id)
       or (m.source = 'driver' and m.remito_id in (
            select r.remito_id from public.remitos r
            where r.operator_service_id = p_service_id
              and (v_role <> 'chofer' or r.driver_id = auth.uid()))));
  end if;
  return jsonb_build_object(
    'concepts', coalesce((select jsonb_agg(jsonb_build_object('concept_id', c.concept_id, 'code', c.code, 'name', c.name,
        'icon', c.icon, 'description', c.description) order by c.sort_order, c.name)
      from public.service_concepts c
      where c.is_active and c.input_mode = 'toggle'
        and (v_company is null or exists (select 1 from public.company_service_settings css
          where css.company_id = v_company and css.concept_id = c.concept_id and css.is_enabled))), '[]'::jsonb),
    'selected', to_jsonb(v_selected));
end $function$;

create or replace function public.set_operator_service_toggles_v1(p_service_id uuid, p_concept_ids uuid[])
returns uuid[] language plpgsql security definer set search_path to '' as $function$
declare v_ids uuid[] := array(select distinct x from unnest(coalesce(p_concept_ids, '{}')) x where x is not null);
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion','operador') then
    raise exception 'Sin permiso para editar servicios';
  end if;
  if not exists (select 1 from public.operator_services where service_id = p_service_id) then raise exception 'Servicio inexistente'; end if;
  if exists (select 1 from unnest(v_ids) x left join public.service_concepts c on c.concept_id = x
             where c.concept_id is null or not c.is_active or c.input_mode <> 'toggle') then
    raise exception 'Uno de los conceptos no está habilitado';
  end if;
  update public.service_toggle_marks set is_on = false, marked_by = auth.uid(), marked_at = now()
   where source = 'operator' and service_id = p_service_id and is_on and not (concept_id = any(v_ids));
  insert into public.service_toggle_marks(source, service_id, concept_id, marked_by)
  select 'operator', p_service_id, x, auth.uid() from unnest(v_ids) x
  on conflict (service_id, concept_id) where source = 'operator'
  do update set is_on = true, marked_by = excluded.marked_by, marked_at = now();
  return v_ids;
end $function$;

create or replace function public.set_driver_remito_toggles_v1(p_remito_id integer, p_concept_ids uuid[])
returns uuid[] language plpgsql security definer set search_path to '' as $function$
declare v_ids uuid[] := array(select distinct x from unnest(coalesce(p_concept_ids, '{}')) x where x is not null);
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') <> 'chofer' then raise exception 'Sin permiso'; end if;
  if not exists (select 1 from public.remitos where remito_id = p_remito_id and driver_id = auth.uid()) then
    raise exception 'Remito inexistente para el Chofer';
  end if;
  if exists (select 1 from public.operator_service_document_addon_reviews x where x.remito_id = p_remito_id) then
    raise exception 'El remito ya fue revisado por Administración';
  end if;
  if exists (select 1 from unnest(v_ids) x left join public.service_concepts c on c.concept_id = x
             where c.concept_id is null or not c.is_active or c.input_mode <> 'toggle') then
    raise exception 'Uno de los conceptos no está habilitado';
  end if;
  update public.service_toggle_marks set is_on = false, marked_by = auth.uid(), marked_at = now()
   where source = 'driver' and remito_id = p_remito_id and is_on and not (concept_id = any(v_ids));
  insert into public.service_toggle_marks(source, remito_id, concept_id, marked_by)
  select 'driver', p_remito_id, x, auth.uid() from unnest(v_ids) x
  on conflict (remito_id, concept_id) where source = 'driver'
  do update set is_on = true, marked_by = excluded.marked_by, marked_at = now();
  return v_ids;
end $function$;

revoke all on function public.get_service_toggle_concepts_v1(uuid, uuid) from public, anon;
revoke all on function public.set_operator_service_toggles_v1(uuid, uuid[]) from public, anon;
revoke all on function public.set_driver_remito_toggles_v1(integer, uuid[]) from public, anon;
grant execute on function public.get_service_toggle_concepts_v1(uuid, uuid) to authenticated;
grant execute on function public.set_operator_service_toggles_v1(uuid, uuid[]) to authenticated;
grant execute on function public.set_driver_remito_toggles_v1(integer, uuid[]) to authenticated;

-- Catálogo: input_mode se lista y se guarda como cualquier otro dato del concepto.
CREATE OR REPLACE FUNCTION public.list_service_types_config(p_include_inactive boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_role text:=app_private.current_auxilios_role(); v_result jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',sc.concept_id,'code',sc.code,'name',sc.name,'description',sc.description,
    'category',sc.service_category,'billing_family',sc.billing_family,'vehicle_class',sc.vehicle_class,
    'distance_chargeable',sc.distance_chargeable,'pricing_unit',sc.default_pricing_unit,
    'icon',sc.icon,'sort_order',sc.sort_order,'is_active',sc.is_active,'single_address',sc.single_address,
    'input_mode',sc.input_mode,
    'tariff_types',coalesce((select jsonb_agg(jsonb_build_object('tariff_type_id',tt.tariff_type_id,'code',tt.code,'name',tt.name,'adds_km',tt.adds_km))
      from public.tariff_type_service_links l join public.tariff_types tt on tt.tariff_type_id=l.tariff_type_id
      where l.concept_id=sc.concept_id and l.is_active and tt.is_active),'[]'::jsonb)
  ) order by sc.sort_order,sc.name),'[]'::jsonb) into v_result
  from public.service_concepts sc
  where sc.billing_family<>'system' and (p_include_inactive or sc.is_active);
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.save_service_type_config(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_id uuid;
  v_category text;
  v_code text;
  v_name text;
  v_distance_chargeable boolean;
  v_billing_family text;
  v_row public.service_concepts%rowtype;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administración puede modificar tipos de servicio';
  end if;

  v_id := nullif(p_payload->>'concept_id','')::uuid;
  v_code := lower(trim(coalesce(p_payload->>'code','')));
  v_name := trim(coalesce(p_payload->>'name',''));
  v_category := coalesce(nullif(p_payload->>'category',''),'secondary');
  v_distance_chargeable := coalesce((p_payload->>'distance_chargeable')::boolean,false);
  v_billing_family := case
    when v_distance_chargeable then 'primary'
    else coalesce(nullif(p_payload->>'billing_family',''),'variable')
  end;

  if v_code = '' or v_name = '' then
    raise exception 'Nombre y código son obligatorios';
  end if;
  if v_category not in ('primary','secondary','mixed') then
    raise exception 'Categoría inválida';
  end if;
  if v_billing_family not in ('primary','variable','sale','system') then
    raise exception 'Familia de facturación inválida';
  end if;

  if v_id is null then
    insert into public.service_concepts(
      code,name,description,default_can_be_primary,default_can_be_secondary,
      default_pricing_unit,icon,sort_order,is_active,billing_family,vehicle_class,distance_chargeable
    ) values (
      v_code,v_name,nullif(trim(coalesce(p_payload->>'description','')),''),
      v_category in ('primary','mixed'),v_category in ('secondary','mixed'),
      coalesce(nullif(p_payload->>'pricing_unit',''),'service'),coalesce(nullif(p_payload->>'icon',''),'⚙'),
      coalesce(nullif(p_payload->>'sort_order','')::integer,100),coalesce((p_payload->>'is_active')::boolean,true),
      v_billing_family,nullif(p_payload->>'vehicle_class',''),v_distance_chargeable
    ) returning * into v_row;
  else
    update public.service_concepts set
      code = v_code,
      name = v_name,
      description = nullif(trim(coalesce(p_payload->>'description','')),''),
      default_can_be_primary = v_category in ('primary','mixed'),
      default_can_be_secondary = v_category in ('secondary','mixed'),
      default_pricing_unit = coalesce(nullif(p_payload->>'pricing_unit',''),default_pricing_unit),
      icon = coalesce(nullif(p_payload->>'icon',''),icon),
      sort_order = coalesce(nullif(p_payload->>'sort_order','')::integer,sort_order),
      is_active = coalesce((p_payload->>'is_active')::boolean,is_active),
      billing_family = v_billing_family,
      vehicle_class = nullif(p_payload->>'vehicle_class',''),
      distance_chargeable = v_distance_chargeable,
      updated_by = auth.uid(),
      updated_at = now()
    where concept_id = v_id
    returning * into v_row;
  end if;

  if v_row.concept_id is not null and p_payload ? 'single_address' then
    update public.service_concepts
       set single_address = coalesce((p_payload->>'single_address')::boolean, false)
     where concept_id = v_row.concept_id
    returning * into v_row;
  end if;

  -- Interruptor (sí/no, sin precio): no aparece como excedente ni en la matriz de tarifas.
  if v_row.concept_id is not null and p_payload ? 'input_mode' then
    if coalesce(p_payload->>'input_mode','quantity') not in ('quantity','toggle') then
      raise exception 'Forma de carga inválida';
    end if;
    update public.service_concepts
       set input_mode = coalesce(p_payload->>'input_mode','quantity'),
           matrix_visible = case when coalesce(p_payload->>'input_mode','quantity') = 'toggle' then false
                                 when input_mode = 'toggle' then true else matrix_visible end
     where concept_id = v_row.concept_id
    returning * into v_row;
  end if;

  if v_row.concept_id is null then
    raise exception 'Tipo de servicio inexistente';
  end if;
  return to_jsonb(v_row);
end
$function$;

-- Sueldos: los conceptos interruptor marcados en remitos firmados del chofer cuentan
-- como una unidad (importe 0) en la fuente "extras", una sola vez por servicio y concepto.
CREATE OR REPLACE FUNCTION public.get_payroll_matrix_sources(p_driver uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(app_private.current_auxilios_role(),'') not in ('administracion','supervision') then raise exception 'No autorizado'; end if;
 if p_driver is null or p_from is null or p_until is null or p_until<=p_from or p_until-p_from>32 then raise exception 'Período inválido'; end if;
 return jsonb_build_object(
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',l.invoice_service_id,'service_id',s.service_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',coalesce(nullif(l.quote_snapshot->>'service_company_amount','')::numeric,l.company_amount),'currency',l.currency,'km',case when l.quote_snapshot ? 'billable_asphalt_km' and l.quote_snapshot ? 'billable_gravel_km' then coalesce((l.quote_snapshot->>'billable_asphalt_km')::numeric,0)+coalesce((l.quote_snapshot->>'billable_gravel_km')::numeric,0) else null end)) from public.operator_invoice_services l join public.operator_invoices i using(invoice_id) join public.operator_services s using(service_id) join public.companies c on c.company_id=s.company_id where c.client_kind<>'particular' and s.assigned_driver_id=p_driver and l.released_at is null and i.status='created' and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb)
 -- Particulares: no se facturan a una prestadora; cuentan al firmarse el remito.
 ||coalesce((select jsonb_agg(jsonb_build_object('id','part:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',s.primary_concept_id,'quantity',1,'amount',s.quoted_total,'currency','ARS','km',r.km_reales,'client_kind','particular')) from public.operator_services s join public.companies c on c.company_id=s.company_id join lateral (select x.remito_id,x.km_reales,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.driver_id=p_driver and x.status='firmado' order by x.firmado_at desc limit 1) r on true where c.client_kind='particular' and s.quoted_total is not null and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb),
 'extras',coalesce((select jsonb_agg(jsonb_build_object('id',e.excess_report_id,'remito_id',r.remito_id,'concept_id',e.concept_id,'quantity',e.quantity,'amount',e.total_amount,'currency',e.currency)) from public.remito_excess_reports e join public.remitos r using(remito_id) where r.driver_id=p_driver and r.status='firmado' and e.customer_payment_method<>'not_collected' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb)
 -- Interruptores (p. ej. Pinacars): marcados por el chofer en el remito o por el operador en el servicio.
 ||coalesce((select jsonb_agg(jsonb_build_object('id',t.k,'remito_id',t.remito_id,'service_id',t.service_id,'concept_id',t.concept_id,'quantity',1,'amount',0,'currency','ARS')) from (select distinct on (k) 'tog:'||coalesce(r.operator_service_id::text,'r'||r.remito_id)||':'||m.concept_id as k,r.remito_id,r.operator_service_id as service_id,m.concept_id from public.remitos r join public.service_toggle_marks m on m.is_on and ((m.source='driver' and m.remito_id=r.remito_id) or (m.source='operator' and m.service_id=r.operator_service_id)) join public.service_concepts sc on sc.concept_id=m.concept_id and sc.input_mode='toggle' where r.driver_id=p_driver and r.status='firmado' and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until order by k,r.firmado_at desc) t),'[]'::jsonb),
 -- Captación: servicios particulares que consiguió el chofer, sobre lo cobrado.
 'captacion',coalesce((select jsonb_agg(jsonb_build_object('id','capt:'||s.service_id,'service_id',s.service_id,'remito_id',r.remito_id,'concept_id',null,'quantity',1,'amount',coalesce((select sum(p.amount) from public.service_payments p where p.service_id=s.service_id and p.voided_at is null),0),'currency','ARS')) from public.operator_services s join lateral (select x.remito_id,x.firmado_at from public.remitos x where x.operator_service_id=s.service_id and x.status='firmado' order by x.firmado_at desc limit 1) r on true where s.referred_by_driver_id=p_driver and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_from and (r.firmado_at at time zone 'America/Argentina/Buenos_Aires')::date<p_until),'[]'::jsonb));
end $function$;
