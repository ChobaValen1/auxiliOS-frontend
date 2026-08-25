-- AuxiliOS · Facturación · núcleo canónico v1
-- FINALIZADO -> PENDIENTE -> REVISADO. Facturado se implementa junto con la entidad factura.

create table if not exists public.operator_service_billing_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  billing_status text not null check (billing_status in ('pending','reviewed','invoiced','excluded')),
  previous_company_amount numeric(14,2),
  company_amount numeric(14,2) not null check (company_amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  quote_snapshot jsonb not null default '{}'::jsonb,
  rate_card_id uuid references public.company_rate_cards(rate_card_id) on delete restrict,
  rate_card_version integer,
  reason text,
  created_by uuid not null default auth.uid() references public.users(user_id),
  created_at timestamptz not null default now()
);

create index if not exists operator_service_billing_revisions_service_idx
  on public.operator_service_billing_revisions(service_id, created_at desc);

alter table public.operator_service_billing_revisions enable row level security;
revoke all on table public.operator_service_billing_revisions from anon, authenticated;

create or replace function app_private.calculate_operator_service_billing_quote_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_service public.operator_services%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_toll_rows integer := 0;
  v_toll_input numeric := 0;
  v_asphalt numeric := 0;
  v_gravel numeric := 0;
  v_quote jsonb;
  v_current numeric := 0;
  v_stored numeric := 0;
begin
  select * into v_service
  from public.operator_services
  where service_id=p_service_id;

  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.status<>'completed' then raise exception 'Sólo los servicios FINALIZADOS pueden ingresar a Facturación'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',i.concept_id,
    'quantity',i.quantity
  ) order by i.sort_order,i.created_at),'[]'::jsonb)
  into v_items
  from public.operator_service_items i
  where i.service_id=p_service_id and i.item_role='secondary';

  select count(*),coalesce(sum(case when t.payer_agent='provider' then t.total_amount else 0 end),0)
  into v_toll_rows,v_toll_input
  from public.operator_service_tolls t
  where t.service_id=p_service_id;

  if v_toll_rows=0 then
    v_toll_input:=coalesce(nullif(v_service.pricing_snapshot->>'toll_input','')::numeric,0);
  end if;

  if coalesce(v_service.estimated_asphalt_km,0)+coalesce(v_service.estimated_gravel_km,0)>0 then
    v_asphalt:=coalesce(v_service.estimated_asphalt_km,0);
    v_gravel:=coalesce(v_service.estimated_gravel_km,0);
  else
    -- Compatibilidad con servicios creados antes de separar Asfalto/Ripio.
    v_asphalt:=coalesce(nullif(v_service.pricing_snapshot->>'distance_km','')::numeric,v_service.estimated_distance_km,0);
    v_gravel:=0;
  end if;

  v_quote:=app_private.calculate_operator_service_quote_v4_full(
    v_service.company_id,
    v_service.billing_base_id,
    v_service.scheduled_for,
    v_service.primary_concept_id,
    v_items,
    v_asphalt,
    v_gravel,
    v_toll_input,
    v_service.is_holiday
  );

  v_current:=coalesce((v_quote->>'company_estimated_total')::numeric,0);
  v_stored:=coalesce(v_service.company_estimated_total,0);

  return v_quote || jsonb_build_object(
    'service_id',v_service.service_id,
    'service_number',v_service.service_number,
    'stored_company_amount',round(v_stored,2),
    'current_company_amount',round(v_current,2),
    'billing_delta',round(v_current-v_stored,2),
    'billing_source','current_tariff_period',
    'operational_snapshot_calculated_at',v_service.pricing_snapshot->>'calculated_at'
  );
end;
$$;

revoke all on function app_private.calculate_operator_service_billing_quote_v1(uuid) from public,anon,authenticated;

create or replace function public.list_operator_billing_services_v1(
  p_status text default null,
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_row record;
  v_quote jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_search text:=lower(trim(coalesce(p_search,'')));
  v_pending integer:=0;
  v_reviewed integer:=0;
  v_pending_amount numeric:=0;
  v_reviewed_amount numeric:=0;
  v_amount numeric:=0;
  v_error text;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturación'; end if;
  if p_status is not null and p_status not in ('pending','reviewed','invoiced','excluded') then raise exception 'Estado de facturación inválido'; end if;

  for v_row in
    select s.service_id,s.service_number,s.service_order_number,s.scheduled_for,s.completed_at,
           s.billing_status,s.vehicle_plate,s.origin,s.destination,s.estimated_distance_km,
           s.estimated_asphalt_km,s.estimated_gravel_km,s.company_estimated_total,s.currency,
           s.remito_id,s.pricing_snapshot,s.company_id,s.primary_concept_id,
           coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
           c.cuit,coalesce(sc.name,'Servicio') service_name,
           coalesce(b.name,'Sin base') billing_base_name,
           r.revision_id last_revision_id,r.company_amount last_reviewed_amount,
           r.created_at last_reviewed_at,u.full_name last_reviewed_by
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.billing_bases b on b.base_id=s.billing_base_id
    left join lateral (
      select rr.* from public.operator_service_billing_revisions rr
      where rr.service_id=s.service_id and rr.billing_status='reviewed'
      order by rr.created_at desc limit 1
    ) r on true
    left join public.users u on u.user_id=r.created_by
    where s.status='completed'
      and s.billing_status<>'not_ready'
      and (p_status is null or s.billing_status=p_status)
      and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,c.trade_name,c.legal_name,sc.name)) like '%'||v_search||'%')
    order by coalesce(s.completed_at,s.scheduled_for) desc,s.service_number desc
  loop
    v_quote:=null; v_error:=null;
    begin
      v_quote:=app_private.calculate_operator_service_billing_quote_v1(v_row.service_id);
      v_amount:=coalesce((v_quote->>'current_company_amount')::numeric,0);
    exception when others then
      v_error:=sqlerrm;
      v_amount:=coalesce(v_row.company_estimated_total,0);
    end;

    if v_row.billing_status='pending' then
      v_pending:=v_pending+1; v_pending_amount:=v_pending_amount+v_amount;
    elsif v_row.billing_status='reviewed' then
      v_reviewed:=v_reviewed+1; v_reviewed_amount:=v_reviewed_amount+v_amount;
    end if;

    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'service_id',v_row.service_id,
      'service_number',v_row.service_number,
      'service_order_number',v_row.service_order_number,
      'scheduled_for',v_row.scheduled_for,
      'completed_at',v_row.completed_at,
      'billing_status',v_row.billing_status,
      'company_id',v_row.company_id,
      'company_name',v_row.company_name,
      'company_cuit',v_row.cuit,
      'service_name',v_row.service_name,
      'billing_base_name',v_row.billing_base_name,
      'vehicle_plate',v_row.vehicle_plate,
      'origin',v_row.origin,
      'destination',v_row.destination,
      'remito_id',v_row.remito_id,
      'stored_company_amount',round(coalesce(v_row.company_estimated_total,0),2),
      'current_company_amount',round(v_amount,2),
      'billing_delta',case when v_quote is null then null else (v_quote->>'billing_delta')::numeric end,
      'currency',coalesce(v_quote->>'currency',v_row.currency,'ARS'),
      'rate_card_name',v_quote->>'rate_card_name',
      'rate_card_version',nullif(v_quote->>'rate_card_version','')::integer,
      'pricing_error',v_error,
      'last_reviewed_amount',v_row.last_reviewed_amount,
      'last_reviewed_at',v_row.last_reviewed_at,
      'last_reviewed_by',v_row.last_reviewed_by
    ));
  end loop;

  return jsonb_build_object(
    'rows',v_rows,
    'kpis',jsonb_build_object(
      'pending_count',v_pending,
      'pending_amount',round(v_pending_amount,2),
      'reviewed_count',v_reviewed,
      'reviewed_amount',round(v_reviewed_amount,2)
    )
  );
end;
$$;

create or replace function public.get_operator_billing_service_detail_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service jsonb;
  v_quote jsonb;
  v_revisions jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturación'; end if;

  select jsonb_build_object(
    'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
    'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,'billing_status',s.billing_status,
    'company_id',s.company_id,'company_name',coalesce(c.trade_name,c.legal_name),'company_cuit',c.cuit,
    'service_name',sc.name,'billing_base_name',b.name,'vehicle_plate',s.vehicle_plate,
    'origin',s.origin,'destination',s.destination,'customer_name',s.customer_name,
    'estimated_distance_km',s.estimated_distance_km,'estimated_asphalt_km',s.estimated_asphalt_km,
    'estimated_gravel_km',s.estimated_gravel_km,'remito_id',s.remito_id,
    'operator_notes',s.operator_notes,'stored_company_amount',s.company_estimated_total,
    'operational_pricing_snapshot',s.pricing_snapshot,'operational_billing_snapshot',s.billing_snapshot
  ) into v_service
  from public.operator_services s
  join public.companies c on c.company_id=s.company_id
  left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
  left join public.billing_bases b on b.base_id=s.billing_base_id
  where s.service_id=p_service_id and s.status='completed';

  if v_service is null then raise exception 'Servicio FINALIZADO inexistente'; end if;
  v_quote:=app_private.calculate_operator_service_billing_quote_v1(p_service_id);

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

  return jsonb_build_object('service',v_service,'current_quote',v_quote,'revisions',v_revisions);
end;
$$;

create or replace function public.review_operator_billing_service_v1(
  p_service_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_quote jsonb;
  v_amount numeric;
  v_previous numeric;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Solo Administración o Facturación puede revisar servicios'; end if;

  select * into v_service from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if v_service.status<>'completed' then raise exception 'El servicio todavía no está FINALIZADO'; end if;
  if v_service.billing_status<>'pending' then raise exception 'Sólo un servicio PENDIENTE puede marcarse REVISADO'; end if;

  v_quote:=app_private.calculate_operator_service_billing_quote_v1(p_service_id);
  v_amount:=coalesce((v_quote->>'current_company_amount')::numeric,0);
  v_previous:=coalesce((select r.company_amount from public.operator_service_billing_revisions r where r.service_id=p_service_id order by r.created_at desc limit 1),v_service.company_estimated_total,0);

  insert into public.operator_service_billing_revisions(
    service_id,billing_status,previous_company_amount,company_amount,currency,
    quote_snapshot,rate_card_id,rate_card_version,reason
  ) values (
    p_service_id,'reviewed',round(v_previous,2),round(v_amount,2),coalesce(v_quote->>'currency',v_service.currency,'ARS'),
    v_quote,nullif(v_quote->>'rate_card_id','')::uuid,nullif(v_quote->>'rate_card_version','')::integer,
    nullif(trim(coalesce(p_notes,'')),'')
  );

  update public.operator_services
  set billing_status='reviewed',updated_by=auth.uid(),updated_at=now()
  where service_id=p_service_id;

  return public.get_operator_billing_service_detail_v1(p_service_id);
end;
$$;

revoke all on function public.list_operator_billing_services_v1(text,text) from public,anon;
revoke all on function public.get_operator_billing_service_detail_v1(uuid) from public,anon;
revoke all on function public.review_operator_billing_service_v1(uuid,text) from public,anon;
grant execute on function public.list_operator_billing_services_v1(text,text) to authenticated;
grant execute on function public.get_operator_billing_service_detail_v1(uuid) to authenticated;
grant execute on function public.review_operator_billing_service_v1(uuid,text) to authenticated;
