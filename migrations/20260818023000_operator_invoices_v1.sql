-- AuxiliOS · Facturación -> Facturas v1
-- La mesa deja de exponer Pendiente/Revisado como etapas de negocio.
-- Mientras convive con el frontend anterior, ambos estados internos se consideran "disponibles".
-- Al facturar, el importe y la composición quedan congelados en Facturas y el servicio pasa a invoiced.

create table if not exists public.operator_invoices (
  invoice_id uuid primary key default gen_random_uuid(),
  invoice_sequence bigint generated always as identity unique,
  company_id uuid not null references public.companies(company_id) on delete restrict,
  status text not null default 'created' check (status in ('created','cancelled')),
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  service_count integer not null check (service_count > 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  created_by uuid not null default auth.uid() references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_invoice_services (
  invoice_service_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.operator_invoices(invoice_id) on delete restrict,
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  line_number integer not null check (line_number > 0),
  company_amount numeric(14,2) not null check (company_amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  service_snapshot jsonb not null default '{}'::jsonb,
  quote_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(invoice_id,line_number),
  unique(service_id)
);

create index if not exists operator_invoices_company_created_idx
  on public.operator_invoices(company_id,created_at desc);
create index if not exists operator_invoice_services_invoice_idx
  on public.operator_invoice_services(invoice_id,line_number);

alter table public.operator_invoices enable row level security;
alter table public.operator_invoice_services enable row level security;
revoke all on table public.operator_invoices from public,anon,authenticated;
revoke all on table public.operator_invoice_services from public,anon,authenticated;

create or replace function public.list_operator_billing_services_v3(
  p_search text default null,
  p_company_id uuid default null,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  r record;
  q jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_search text:=lower(trim(coalesce(p_search,'')));
  v_amount numeric:=0;
  v_error text;
  v_companies jsonb:='[]'::jsonb;
  v_periods jsonb:='[]'::jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then
    raise exception 'Período inválido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('company_id',x.company_id,'company_name',x.company_name) order by x.company_name),'[]'::jsonb)
    into v_companies
  from (
    select distinct s.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    where s.status='completed' and s.billing_status in ('pending','reviewed')
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
    into v_periods
  from (
    select distinct to_char(s.scheduled_for at time zone 'America/Argentina/Buenos_Aires','YYYY-MM') period
    from public.operator_services s
    where s.status='completed' and s.billing_status in ('pending','reviewed')
  ) x;

  for r in
    select s.service_id,s.service_number,s.service_order_number,s.scheduled_for,s.completed_at,
           s.billing_status,s.vehicle_plate,s.vehicle_make_model,s.customer_name,s.origin,s.destination,
           s.estimated_distance_km,s.estimated_asphalt_km,s.estimated_gravel_km,s.company_estimated_total,s.currency,
           s.remito_id,s.company_id,s.primary_concept_id,
           coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
           coalesce(sc.name,'Servicio') service_name,coalesce(b.name,'Sin base') billing_base_name
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.billing_bases b on b.base_id=s.billing_base_id
    where s.status='completed'
      and s.billing_status in ('pending','reviewed')
      and (p_company_id is null or s.company_id=p_company_id)
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
      and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.vehicle_make_model,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,b.name,sc.name)) like '%'||v_search||'%')
    order by s.scheduled_for desc,s.service_number desc
  loop
    q:=null; v_error:=null;
    begin
      q:=app_private.calculate_operator_service_billing_quote_v2(r.service_id);
      v_amount:=coalesce((q->>'current_company_amount')::numeric,0);
    exception when others then
      v_error:=sqlerrm;
      v_amount:=coalesce(r.company_estimated_total,0);
    end;

    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'service_id',r.service_id,'service_number',r.service_number,'service_order_number',r.service_order_number,
      'scheduled_for',r.scheduled_for,'completed_at',r.completed_at,'billing_status',r.billing_status,
      'company_id',r.company_id,'company_name',r.company_name,'billing_base_name',r.billing_base_name,
      'service_name',r.service_name,'vehicle_plate',r.vehicle_plate,'vehicle_make_model',r.vehicle_make_model,
      'customer_name',r.customer_name,'origin',r.origin,'destination',r.destination,
      'km',round(coalesce(nullif(r.estimated_asphalt_km+r.estimated_gravel_km,0),r.estimated_distance_km,0),2),
      'stored_company_amount',case when q is null then round(coalesce(r.company_estimated_total,0),2) else (q->>'stored_company_amount')::numeric end,
      'current_company_amount',round(v_amount,2),
      'billing_delta',case when q is null then null else (q->>'billing_delta')::numeric end,
      'currency',coalesce(q->>'currency',r.currency,'ARS'),
      'pricing_error',v_error
    ));
  end loop;

  return jsonb_build_object(
    'rows',v_rows,
    'filters',jsonb_build_object('companies',v_companies,'periods',v_periods)
  );
end;
$function$;

create or replace function public.get_operator_billing_service_detail_v3(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service jsonb;
  q jsonb;
  v_revisions jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturación';
  end if;

  select jsonb_build_object(
    'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
    'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,'billing_status',s.billing_status,
    'company_id',s.company_id,'company_name',coalesce(c.trade_name,c.legal_name),'service_name',sc.name,
    'billing_base_name',b.name,'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
    'customer_name',s.customer_name,'origin',s.origin,'destination',s.destination,
    'estimated_distance_km',s.estimated_distance_km,'estimated_asphalt_km',s.estimated_asphalt_km,'estimated_gravel_km',s.estimated_gravel_km,
    'remito_id',s.remito_id,'operator_notes',s.operator_notes,
    'operational_pricing_snapshot',s.pricing_snapshot,'operational_billing_snapshot',s.billing_snapshot
  ) into v_service
  from public.operator_services s
  join public.companies c on c.company_id=s.company_id
  left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
  left join public.billing_bases b on b.base_id=s.billing_base_id
  where s.service_id=p_service_id
    and s.status='completed'
    and s.billing_status in ('pending','reviewed');

  if v_service is null then raise exception 'Servicio no disponible en Facturación'; end if;
  q:=app_private.calculate_operator_service_billing_quote_v2(p_service_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'revision_id',r.revision_id,'billing_status',r.billing_status,
    'previous_company_amount',r.previous_company_amount,'company_amount',r.company_amount,
    'currency',r.currency,'rate_card_id',r.rate_card_id,'rate_card_version',r.rate_card_version,
    'reason',r.reason,'created_by',r.created_by,'created_by_name',u.full_name,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb)
    into v_revisions
  from public.operator_service_billing_revisions r
  left join public.users u on u.user_id=r.created_by
  where r.service_id=p_service_id;

  return jsonb_build_object('service',v_service,'current_quote',q,'revisions',v_revisions);
end;
$function$;

create or replace function public.create_operator_invoice_v1(p_service_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_requested integer:=coalesce(array_length(p_service_ids,1),0);
  v_unique integer:=0;
  v_valid integer:=0;
  v_company_count integer:=0;
  v_company_id uuid;
  v_company_name text;
  v_currency text;
  v_total numeric:=0;
  v_lines jsonb:='[]'::jsonb;
  v_line jsonb;
  v_id uuid;
  s public.operator_services%rowtype;
  q jsonb;
  v_amount numeric;
  v_previous numeric;
  v_invoice public.operator_invoices%rowtype;
  v_line_no integer:=0;
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para facturar servicios';
  end if;
  if v_requested=0 then raise exception 'Seleccioná al menos un servicio'; end if;
  if v_requested>500 then raise exception 'La factura no puede contener más de 500 servicios'; end if;

  select count(distinct x) into v_unique from unnest(p_service_ids) x;
  if v_unique<>v_requested then raise exception 'La selección contiene servicios duplicados'; end if;

  perform 1
  from public.operator_services s0
  where s0.service_id=any(p_service_ids)
  order by s0.service_id
  for update;

  select count(*),count(distinct company_id),min(company_id)
    into v_valid,v_company_count,v_company_id
  from public.operator_services
  where service_id=any(p_service_ids)
    and status='completed'
    and billing_status in ('pending','reviewed');

  if v_valid<>v_requested then
    raise exception 'La selección contiene servicios que ya no están disponibles para facturar';
  end if;
  if v_company_count<>1 then
    raise exception 'No se pueden facturar juntas diferentes prestadoras';
  end if;

  select coalesce(c.trade_name,c.legal_name,'Prestadora') into v_company_name
  from public.companies c where c.company_id=v_company_id;

  foreach v_id in array p_service_ids loop
    select * into s from public.operator_services where service_id=v_id;
    q:=app_private.calculate_operator_service_billing_quote_v2(v_id);
    v_amount:=round(coalesce((q->>'current_company_amount')::numeric,0),2);

    if v_currency is null then
      v_currency:=coalesce(q->>'currency',s.currency,'ARS');
    elsif v_currency<>coalesce(q->>'currency',s.currency,'ARS') then
      raise exception 'No se pueden mezclar monedas en una misma factura';
    end if;

    v_total:=v_total+v_amount;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'service_id',s.service_id,
      'company_amount',v_amount,
      'currency',coalesce(q->>'currency',s.currency,'ARS'),
      'quote_snapshot',q,
      'service_snapshot',jsonb_build_object(
        'service_number',s.service_number,
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'completed_at',s.completed_at,
        'billing_base_id',s.billing_base_id,
        'primary_concept_id',s.primary_concept_id,
        'customer_name',s.customer_name,
        'vehicle_plate',s.vehicle_plate,
        'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,
        'destination',s.destination,
        'estimated_distance_km',s.estimated_distance_km,
        'estimated_asphalt_km',s.estimated_asphalt_km,
        'estimated_gravel_km',s.estimated_gravel_km
      )
    ));
  end loop;

  insert into public.operator_invoices(company_id,currency,service_count,total_amount)
  values(v_company_id,coalesce(v_currency,'ARS'),v_requested,round(v_total,2))
  returning * into v_invoice;

  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_line_no:=v_line_no+1;
    v_id:=(v_line->>'service_id')::uuid;
    q:=v_line->'quote_snapshot';
    v_amount:=(v_line->>'company_amount')::numeric;

    insert into public.operator_invoice_services(
      invoice_id,service_id,line_number,company_amount,currency,service_snapshot,quote_snapshot
    ) values(
      v_invoice.invoice_id,v_id,v_line_no,v_amount,v_line->>'currency',v_line->'service_snapshot',q
    );

    select r.company_amount into v_previous
    from public.operator_service_billing_revisions r
    where r.service_id=v_id
    order by r.created_at desc
    limit 1;
    v_previous:=coalesce(v_previous,nullif(q->>'stored_company_amount','')::numeric,v_amount);

    insert into public.operator_service_billing_revisions(
      service_id,billing_status,previous_company_amount,company_amount,currency,
      quote_snapshot,rate_card_id,rate_card_version,reason
    ) values(
      v_id,'invoiced',round(v_previous,2),v_amount,coalesce(q->>'currency','ARS'),q,
      nullif(q->>'rate_card_id','')::uuid,nullif(q->>'rate_card_version','')::integer,
      'Factura FAC-'||lpad(v_invoice.invoice_sequence::text,8,'0')
    );

    update public.operator_services
    set billing_status='invoiced',
        billing_snapshot=q,
        contract_id=nullif(q->>'contract_id','')::uuid,
        rate_card_id=nullif(q->>'rate_card_id','')::uuid,
        currency=coalesce(q->>'currency',currency),
        base_subtotal=coalesce((q->>'base_subtotal')::numeric,base_subtotal),
        surcharge_total=coalesce((q->>'surcharge_total')::numeric,surcharge_total),
        toll_total=coalesce((q->>'toll_total')::numeric,toll_total),
        copay_total=coalesce((q->>'copay_total')::numeric,copay_total),
        estimated_total=coalesce((q->>'estimated_total')::numeric,estimated_total),
        company_estimated_total=v_amount,
        updated_by=auth.uid(),updated_at=now()
    where service_id=v_id;

    insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
    values(
      v_id,'billing_invoiced','completed','completed','Servicio incorporado a Factura',auth.uid(),
      jsonb_build_object(
        'invoice_id',v_invoice.invoice_id,
        'invoice_sequence',v_invoice.invoice_sequence,
        'company_amount',v_amount,
        'billing_status','invoiced'
      )
    );
  end loop;

  return jsonb_build_object(
    'invoice_id',v_invoice.invoice_id,
    'invoice_sequence',v_invoice.invoice_sequence,
    'invoice_number','FAC-'||lpad(v_invoice.invoice_sequence::text,8,'0'),
    'status',v_invoice.status,
    'company_id',v_company_id,
    'company_name',v_company_name,
    'service_count',v_requested,
    'total_amount',round(v_total,2),
    'currency',coalesce(v_currency,'ARS'),
    'created_at',v_invoice.created_at
  );
end;
$function$;

create or replace function public.list_operator_invoices_v1(
  p_search text default null,
  p_company_id uuid default null,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_search text:=lower(trim(coalesce(p_search,'')));
  v_companies jsonb:='[]'::jsonb;
  v_periods jsonb:='[]'::jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturas';
  end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then
    raise exception 'Período inválido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('company_id',x.company_id,'company_name',x.company_name) order by x.company_name),'[]'::jsonb)
    into v_companies
  from (
    select distinct i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_invoices i
    join public.companies c on c.company_id=i.company_id
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
    into v_periods
  from (
    select distinct to_char(i.created_at at time zone 'America/Argentina/Buenos_Aires','YYYY-MM') period
    from public.operator_invoices i
  ) x;

  return jsonb_build_object(
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'invoice_id',i.invoice_id,
        'invoice_sequence',i.invoice_sequence,
        'invoice_number','FAC-'||lpad(i.invoice_sequence::text,8,'0'),
        'company_id',i.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
        'status',i.status,
        'currency',i.currency,
        'service_count',i.service_count,
        'total_amount',i.total_amount,
        'created_by',i.created_by,
        'created_by_name',u.full_name,
        'created_at',i.created_at,
        'updated_at',i.updated_at
      ) order by i.created_at desc),'[]'::jsonb)
      from public.operator_invoices i
      join public.companies c on c.company_id=i.company_id
      left join public.users u on u.user_id=i.created_by
      where (p_company_id is null or i.company_id=p_company_id)
        and (p_period_start is null or (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (i.created_at at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
        and (
          v_search=''
          or lower('FAC-'||lpad(i.invoice_sequence::text,8,'0')) like '%'||v_search||'%'
          or lower(coalesce(c.trade_name,c.legal_name,'')) like '%'||v_search||'%'
          or exists (
            select 1 from public.operator_invoice_services il
            where il.invoice_id=i.invoice_id
              and lower(il.service_snapshot::text) like '%'||v_search||'%'
          )
        )
    ),'[]'::jsonb),
    'filters',jsonb_build_object('companies',v_companies,'periods',v_periods)
  );
end;
$function$;

create or replace function public.get_operator_invoice_detail_v1(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_invoice jsonb;
  v_lines jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturas';
  end if;

  select jsonb_build_object(
    'invoice_id',i.invoice_id,
    'invoice_sequence',i.invoice_sequence,
    'invoice_number','FAC-'||lpad(i.invoice_sequence::text,8,'0'),
    'company_id',i.company_id,
    'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
    'status',i.status,
    'currency',i.currency,
    'service_count',i.service_count,
    'total_amount',i.total_amount,
    'created_by',i.created_by,
    'created_by_name',u.full_name,
    'created_at',i.created_at,
    'updated_at',i.updated_at
  ) into v_invoice
  from public.operator_invoices i
  join public.companies c on c.company_id=i.company_id
  left join public.users u on u.user_id=i.created_by
  where i.invoice_id=p_invoice_id;

  if v_invoice is null then raise exception 'Factura inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_service_id',l.invoice_service_id,
    'service_id',l.service_id,
    'line_number',l.line_number,
    'company_amount',l.company_amount,
    'currency',l.currency,
    'service_snapshot',l.service_snapshot,
    'quote_snapshot',l.quote_snapshot,
    'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
    into v_lines
  from public.operator_invoice_services l
  where l.invoice_id=p_invoice_id;

  return jsonb_build_object('invoice',v_invoice,'lines',v_lines);
end;
$function$;

create or replace function public.list_operator_billing_tolls_v2(
  p_search text default null,
  p_company_id uuid default null,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_search text:=lower(trim(coalesce(p_search,'')));
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Peajes de Facturación'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  return jsonb_build_object(
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_toll_id',t.service_toll_id,
        'toll_id',t.toll_id,
        'service_id',s.service_id,
        'service_number',s.service_number,
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'completed_at',s.completed_at,
        'service_billing_status',s.billing_status,
        'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
        'billing_base_name',coalesce(b.name,'Sin base'),
        'origin',s.origin,
        'destination',s.destination,
        'customer_name',s.customer_name,
        'vehicle_plate',s.vehicle_plate,
        'toll_name',coalesce(t.toll_name_snapshot,'Peaje'),
        'road',t.road_snapshot,
        'direction',t.direction_snapshot,
        'quantity',coalesce(t.quantity,1),
        'amount',coalesce(t.total_amount,0),
        'currency',coalesce(t.currency,s.currency,'ARS'),
        'source',t.source,
        'payment_method',t.payment_method,
        'crossed_at',t.crossed_at,
        'payer_agent',t.payer_agent
      ) order by s.scheduled_for desc,t.created_at desc)
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases b on b.base_id=s.billing_base_id
      join lateral (
        select bs.toll_billing_mode,bs.toll_calculation_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate' and cfg.toll_calculation_mode<>'not_applicable'
      where s.status='completed'
        and s.billing_status in ('pending','reviewed','invoiced')
        and t.payer_agent='provider'
        and coalesce(t.total_amount,0)>0
        and (p_company_id is null or s.company_id=p_company_id)
        and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
        and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,t.toll_name_snapshot,t.road_snapshot,t.direction_snapshot,t.notes)) like '%'||v_search||'%')
    ),'[]'::jsonb),
    'total_amount',coalesce((
      select sum(coalesce(t.total_amount,0))
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join lateral (
        select bs.toll_billing_mode,bs.toll_calculation_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate' and cfg.toll_calculation_mode<>'not_applicable'
      where s.status='completed'
        and s.billing_status in ('pending','reviewed','invoiced')
        and t.payer_agent='provider'
        and coalesce(t.total_amount,0)>0
        and (p_company_id is null or s.company_id=p_company_id)
        and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
    ),0)
  );
end;
$function$;

revoke all on function public.list_operator_billing_services_v3(text,uuid,date,date) from public,anon,authenticated;
revoke all on function public.get_operator_billing_service_detail_v3(uuid) from public,anon,authenticated;
revoke all on function public.create_operator_invoice_v1(uuid[]) from public,anon,authenticated;
revoke all on function public.list_operator_invoices_v1(text,uuid,date,date) from public,anon,authenticated;
revoke all on function public.get_operator_invoice_detail_v1(uuid) from public,anon,authenticated;
revoke all on function public.list_operator_billing_tolls_v2(text,uuid,date,date) from public,anon,authenticated;

grant execute on function public.list_operator_billing_services_v3(text,uuid,date,date) to authenticated;
grant execute on function public.get_operator_billing_service_detail_v3(uuid) to authenticated;
grant execute on function public.create_operator_invoice_v1(uuid[]) to authenticated;
grant execute on function public.list_operator_invoices_v1(text,uuid,date,date) to authenticated;
grant execute on function public.get_operator_invoice_detail_v1(uuid) to authenticated;
grant execute on function public.list_operator_billing_tolls_v2(text,uuid,date,date) to authenticated;
