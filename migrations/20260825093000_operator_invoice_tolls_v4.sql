-- AuxiliOS · Facturas v4 · servicios + peajes separados
-- Preparada para revisión. NO aplicar a producción sin autorización explícita.
--
-- Objetivos:
-- 1) Facturar servicios, peajes separados o ambos en un mismo comprobante.
-- 2) Congelar importes y snapshots de peajes con trazabilidad histórica.
-- 3) Impedir que un peaje tenga dos vínculos activos de factura.
-- 4) Liberar servicios y peajes al anular administrativamente una factura, sin borrar historial.
-- 5) Calcular cada servicio una sola vez durante la creación de la factura.

alter table public.operator_invoices
  add column if not exists toll_count integer not null default 0;

alter table public.operator_invoices
  alter column service_count set default 0;

alter table public.operator_invoices
  drop constraint if exists operator_invoices_service_count_check;

alter table public.operator_invoices
  drop constraint if exists operator_invoices_item_count_check;

alter table public.operator_invoices
  add constraint operator_invoices_item_count_check
  check (
    service_count >= 0
    and toll_count >= 0
    and (service_count + toll_count) > 0
  );

create table if not exists public.operator_invoice_tolls (
  invoice_toll_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.operator_invoices(invoice_id) on delete restrict,
  service_toll_id uuid not null references public.operator_service_tolls(service_toll_id) on delete restrict,
  line_number integer not null check (line_number > 0),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency in ('ARS','USD')),
  toll_snapshot jsonb not null,
  service_snapshot jsonb not null,
  released_at timestamptz,
  released_by uuid references public.users(user_id) on delete restrict,
  release_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists operator_invoice_tolls_active_toll_uq
  on public.operator_invoice_tolls(service_toll_id)
  where released_at is null;

create index if not exists operator_invoice_tolls_invoice_idx
  on public.operator_invoice_tolls(invoice_id,line_number);

create index if not exists operator_invoice_tolls_history_idx
  on public.operator_invoice_tolls(service_toll_id,created_at desc);

alter table public.operator_invoice_tolls enable row level security;
revoke all on table public.operator_invoice_tolls from public,anon,authenticated;

create or replace function app_private.create_operator_invoice_core_v3(
  p_service_ids uuid[],
  p_service_toll_ids uuid[],
  p_document_type text default null,
  p_point_of_sale text default null,
  p_document_number text default null,
  p_issued_on date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service_ids uuid[]:=coalesce(p_service_ids,'{}'::uuid[]);
  v_toll_ids uuid[]:=coalesce(p_service_toll_ids,'{}'::uuid[]);
  v_service_count integer:=coalesce(cardinality(p_service_ids),0);
  v_toll_count integer:=coalesce(cardinality(p_service_toll_ids),0);
  v_unique integer;
  v_valid integer;
  v_company_id uuid;
  v_company_name text;
  v_currency text;
  v_total numeric:=0;
  v_service_total numeric:=0;
  v_toll_total numeric:=0;
  v_invoice public.operator_invoices%rowtype;
  v_invoice_number text;
  v_id uuid;
  v_line_no integer:=0;
  v_amount numeric;
  v_previous numeric;
  v_service_quotes jsonb:='{}'::jsonb;
  s public.operator_services%rowtype;
  t public.operator_service_tolls%rowtype;
  q jsonb;
  v_toll_mode text;
  v_toll_calc text;
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para facturar';
  end if;
  if v_service_count+v_toll_count=0 then
    raise exception 'Seleccioná al menos un servicio o peaje';
  end if;
  if v_service_count>500 or v_toll_count>1000 or v_service_count+v_toll_count>1000 then
    raise exception 'La factura contiene demasiados conceptos';
  end if;

  select count(distinct x) into v_unique from unnest(v_service_ids) selected(x);
  if v_unique<>v_service_count then raise exception 'La selección contiene servicios duplicados'; end if;
  select count(distinct x) into v_unique from unnest(v_toll_ids) selected(x);
  if v_unique<>v_toll_count then raise exception 'La selección contiene peajes duplicados'; end if;

  perform 1
  from public.operator_services locked
  where locked.service_id in (
    select x from unnest(v_service_ids) x
    union
    select st.service_id
    from public.operator_service_tolls st
    where st.service_toll_id=any(v_toll_ids)
  )
  order by locked.service_id
  for update;

  perform 1
  from public.operator_service_tolls locked
  where locked.service_toll_id=any(v_toll_ids)
  order by locked.service_toll_id
  for update;

  if v_service_count>0 then
    select count(*) into v_valid
    from public.operator_services os
    where os.service_id=any(v_service_ids)
      and os.status='completed'
      and os.billing_status in ('pending','reviewed');
    if v_valid<>v_service_count then
      raise exception 'La selección contiene servicios que ya no están disponibles para facturar';
    end if;
  end if;

  foreach v_id in array v_service_ids loop
    select * into s from public.operator_services where service_id=v_id;
    if v_company_id is null then v_company_id:=s.company_id;
    elsif v_company_id<>s.company_id then raise exception 'No se pueden facturar juntas diferentes prestadoras';
    end if;

    q:=app_private.calculate_operator_service_billing_quote_v2(v_id);
    v_amount:=round(coalesce((q->>'current_company_amount')::numeric,0),2);
    if v_currency is null then v_currency:=coalesce(q->>'currency',s.currency,'ARS');
    elsif v_currency<>coalesce(q->>'currency',s.currency,'ARS') then raise exception 'No se pueden mezclar monedas en una misma factura';
    end if;

    v_service_quotes:=v_service_quotes||jsonb_build_object(v_id::text,q);
    v_service_total:=v_service_total+v_amount;
  end loop;

  foreach v_id in array v_toll_ids loop
    select * into t from public.operator_service_tolls where service_toll_id=v_id;
    if not found then raise exception 'Peaje inexistente'; end if;

    select * into s from public.operator_services where service_id=t.service_id;
    if s.status<>'completed' then raise exception 'El peaje pertenece a un servicio que no está FINALIZADO'; end if;
    if coalesce(t.payer_agent,'')<>'provider' or coalesce(t.total_amount,0)<=0 then
      raise exception 'La selección contiene un peaje no facturable';
    end if;

    select bs.toll_billing_mode,bs.toll_calculation_mode
    into v_toll_mode,v_toll_calc
    from public.company_billing_settings bs
    where bs.company_id=s.company_id
      and bs.is_active
      and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
      and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
      and (bs.contract_id is null or bs.contract_id=s.contract_id)
    order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
    limit 1;

    if not found or v_toll_mode<>'separate' or v_toll_calc='not_applicable' then
      raise exception 'La selección contiene un peaje que no se factura por separado';
    end if;

    if exists(
      select 1 from public.operator_invoice_tolls il
      where il.service_toll_id=v_id and il.released_at is null
    ) then
      raise exception 'La selección contiene un peaje que ya fue facturado';
    end if;

    if v_company_id is null then v_company_id:=s.company_id;
    elsif v_company_id<>s.company_id then raise exception 'No se pueden facturar juntas diferentes prestadoras';
    end if;

    if v_currency is null then v_currency:=coalesce(t.currency,s.currency,'ARS');
    elsif v_currency<>coalesce(t.currency,s.currency,'ARS') then raise exception 'No se pueden mezclar monedas en una misma factura';
    end if;

    v_toll_total:=v_toll_total+round(coalesce(t.total_amount,0),2);
  end loop;

  select coalesce(c.trade_name,c.legal_name,'Prestadora') into v_company_name
  from public.companies c where c.company_id=v_company_id;

  v_total:=round(v_service_total+v_toll_total,2);

  insert into public.operator_invoices(
    company_id,currency,service_count,toll_count,total_amount,
    document_type,point_of_sale,document_number,issued_on,notes
  ) values(
    v_company_id,coalesce(v_currency,'ARS'),v_service_count,v_toll_count,v_total,
    p_document_type,p_point_of_sale,p_document_number,p_issued_on,nullif(btrim(p_notes),'')
  ) returning * into v_invoice;

  v_invoice_number:=app_private.operator_invoice_display_number(
    v_invoice.document_type,v_invoice.point_of_sale,v_invoice.document_number,v_invoice.invoice_sequence
  );

  foreach v_id in array v_service_ids loop
    v_line_no:=v_line_no+1;
    select * into s from public.operator_services where service_id=v_id;
    q:=v_service_quotes->v_id::text;
    v_amount:=round(coalesce((q->>'current_company_amount')::numeric,0),2);

    insert into public.operator_invoice_services(
      invoice_id,service_id,line_number,company_amount,currency,service_snapshot,quote_snapshot
    ) values(
      v_invoice.invoice_id,v_id,v_line_no,v_amount,coalesce(q->>'currency',s.currency,'ARS'),
      jsonb_build_object(
        'service_number',s.service_number,'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,
        'billing_base_id',s.billing_base_id,'primary_concept_id',s.primary_concept_id,
        'customer_name',s.customer_name,'vehicle_plate',s.vehicle_plate,
        'vehicle_make_model',s.vehicle_make_model,'origin',s.origin,'destination',s.destination,
        'estimated_distance_km',s.estimated_distance_km,'estimated_asphalt_km',s.estimated_asphalt_km,
        'estimated_gravel_km',s.estimated_gravel_km
      ),q
    );

    select r.company_amount into v_previous
    from public.operator_service_billing_revisions r
    where r.service_id=v_id order by r.created_at desc limit 1;
    v_previous:=coalesce(v_previous,nullif(q->>'stored_company_amount','')::numeric,v_amount);

    insert into public.operator_service_billing_revisions(
      service_id,billing_status,previous_company_amount,company_amount,currency,
      quote_snapshot,rate_card_id,rate_card_version,reason
    ) values(
      v_id,'invoiced',round(v_previous,2),v_amount,coalesce(q->>'currency',s.currency,'ARS'),q,
      nullif(q->>'rate_card_id','')::uuid,nullif(q->>'rate_card_version','')::integer,v_invoice_number
    );

    update public.operator_services
    set billing_status='invoiced',billing_snapshot=q,
        contract_id=nullif(q->>'contract_id','')::uuid,
        rate_card_id=nullif(q->>'rate_card_id','')::uuid,
        currency=coalesce(q->>'currency',currency),
        base_subtotal=coalesce((q->>'base_subtotal')::numeric,base_subtotal),
        surcharge_total=coalesce((q->>'surcharge_total')::numeric,surcharge_total),
        toll_total=coalesce((q->>'toll_total')::numeric,toll_total),
        copay_total=coalesce((q->>'copay_total')::numeric,copay_total),
        estimated_total=coalesce((q->>'estimated_total')::numeric,estimated_total),
        company_estimated_total=v_amount,updated_by=auth.uid(),updated_at=now()
    where service_id=v_id;

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      v_id,'billing_invoiced','completed','completed','Servicio incorporado a Factura',auth.uid(),
      jsonb_build_object('invoice_id',v_invoice.invoice_id,'invoice_sequence',v_invoice.invoice_sequence,
        'invoice_number',v_invoice_number,'company_amount',v_amount,'billing_status','invoiced')
    );
  end loop;

  v_line_no:=0;
  foreach v_id in array v_toll_ids loop
    v_line_no:=v_line_no+1;
    select * into t from public.operator_service_tolls where service_toll_id=v_id;
    select * into s from public.operator_services where service_id=t.service_id;
    v_amount:=round(coalesce(t.total_amount,0),2);

    insert into public.operator_invoice_tolls(
      invoice_id,service_toll_id,line_number,amount,currency,toll_snapshot,service_snapshot
    ) values(
      v_invoice.invoice_id,v_id,v_line_no,v_amount,coalesce(t.currency,s.currency,'ARS'),
      jsonb_build_object(
        'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,
        'toll_code',t.toll_code_snapshot,'toll_name',t.toll_name_snapshot,
        'road',t.road_snapshot,'direction',t.direction_snapshot,'vehicle_category',t.vehicle_category,
        'payment_method',t.payment_method,'quantity',t.quantity,'unit_amount',t.unit_amount,
        'total_amount',t.total_amount,'currency',t.currency,'source',t.source,'crossed_at',t.crossed_at,
        'payer_agent',t.payer_agent,'notes',t.notes
      ),
      jsonb_build_object(
        'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,'billing_base_id',s.billing_base_id,
        'customer_name',s.customer_name,'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination
      )
    );

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      s.service_id,'billing_toll_invoiced','completed','completed','Peaje incorporado a Factura',auth.uid(),
      jsonb_build_object('invoice_id',v_invoice.invoice_id,'invoice_number',v_invoice_number,
        'service_toll_id',v_id,'amount',v_amount,'currency',coalesce(t.currency,s.currency,'ARS'))
    );
  end loop;

  return jsonb_build_object(
    'invoice_id',v_invoice.invoice_id,'invoice_sequence',v_invoice.invoice_sequence,
    'invoice_number',v_invoice_number,'document_type',v_invoice.document_type,
    'point_of_sale',v_invoice.point_of_sale,'document_number',v_invoice.document_number,
    'issued_on',v_invoice.issued_on,'notes',v_invoice.notes,'status',v_invoice.status,
    'company_id',v_company_id,'company_name',v_company_name,
    'service_count',v_service_count,'toll_count',v_toll_count,
    'service_total',round(v_service_total,2),'toll_total',round(v_toll_total,2),
    'total_amount',v_total,'currency',coalesce(v_currency,'ARS'),'created_at',v_invoice.created_at
  );
end;
$function$;

revoke all on function app_private.create_operator_invoice_core_v3(uuid[],uuid[],text,text,text,date,text) from public,anon,authenticated;

create or replace function public.create_operator_invoice_v3(
  p_service_ids uuid[],
  p_service_toll_ids uuid[],
  p_document_type text,
  p_point_of_sale text,
  p_document_number text,
  p_issued_on date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_type text:=upper(btrim(coalesce(p_document_type,'')));
  v_pos text:=btrim(coalesce(p_point_of_sale,''));
  v_number text:=btrim(coalesce(p_document_number,''));
  v_display text;
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion') then raise exception 'Sin permiso para facturar'; end if;
  if v_type not in ('FA','FB','FC') then raise exception 'Seleccioná un tipo de comprobante válido'; end if;
  if v_pos !~ '^[0-9]{1,10}$' then raise exception 'El punto de venta debe contener sólo números'; end if;
  if v_number !~ '^[0-9]{1,20}$' then raise exception 'El número de factura debe contener sólo números'; end if;
  if p_issued_on is null then raise exception 'Ingresá la fecha de emisión'; end if;
  if length(coalesce(p_notes,''))>300 then raise exception 'Las observaciones no pueden superar 300 caracteres'; end if;

  v_display:=app_private.operator_invoice_display_number(v_type,v_pos,v_number,0);
  if exists(
    select 1 from public.operator_invoices i
    where i.document_type=v_type
      and i.point_of_sale is not null and i.document_number is not null
      and (i.point_of_sale)::numeric=(v_pos)::numeric
      and (i.document_number)::numeric=(v_number)::numeric
  ) then raise exception 'Ya existe la %',v_display;
  end if;

  return app_private.create_operator_invoice_core_v3(
    p_service_ids,p_service_toll_ids,v_type,v_pos,v_number,p_issued_on,nullif(btrim(coalesce(p_notes,'')),'')
  );
exception
  when unique_violation then
    raise exception 'Ya existe la % o alguno de los conceptos ya fue facturado',coalesce(v_display,'factura indicada');
end;
$function$;

revoke all on function public.create_operator_invoice_v3(uuid[],uuid[],text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_v3(uuid[],uuid[],text,text,text,date,text) to authenticated,service_role;

create or replace function public.create_operator_invoice_v2(
  p_service_ids uuid[],
  p_document_type text,
  p_point_of_sale text,
  p_document_number text,
  p_issued_on date,
  p_notes text default null
)
returns jsonb
language sql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
  select public.create_operator_invoice_v3(
    p_service_ids,'{}'::uuid[],p_document_type,p_point_of_sale,p_document_number,p_issued_on,p_notes
  );
$function$;

revoke all on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) to authenticated,service_role;

create or replace function public.create_operator_invoice_v1(p_service_ids uuid[])
returns jsonb
language sql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
  select app_private.create_operator_invoice_core_v3(
    p_service_ids,'{}'::uuid[],null,null,null,current_date,null
  );
$function$;

revoke all on function public.create_operator_invoice_v1(uuid[]) from public,anon;
grant execute on function public.create_operator_invoice_v1(uuid[]) to authenticated,service_role;

drop function if exists app_private.create_operator_invoice_core_v2(uuid[],text,text,text,date,text,boolean);

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
  v_rows jsonb:='[]'::jsonb;
  v_total numeric:=0;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Peajes de Facturación'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  select coalesce(jsonb_agg(row_data order by scheduled_for desc,created_at desc),'[]'::jsonb),coalesce(sum(amount),0)
  into v_rows,v_total
  from (
    select s.scheduled_for,t.created_at,coalesce(t.total_amount,0) amount,
      jsonb_build_object(
        'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'service_id',s.service_id,
        'service_number',s.service_number,'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,
        'service_billing_status',s.billing_status,'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
        'billing_base_name',coalesce(b.name,'Sin base'),'origin',s.origin,'destination',s.destination,
        'customer_name',s.customer_name,'vehicle_plate',s.vehicle_plate,
        'toll_name',coalesce(t.toll_name_snapshot,'Peaje'),'road',t.road_snapshot,
        'direction',t.direction_snapshot,'quantity',coalesce(t.quantity,1),
        'amount',coalesce(t.total_amount,0),'currency',coalesce(t.currency,s.currency,'ARS'),
        'source',t.source,'payment_method',t.payment_method,'crossed_at',t.crossed_at,
        'payer_agent',t.payer_agent,'invoiceable',true
      ) row_data
    from public.operator_service_tolls t
    join public.operator_services s on s.service_id=t.service_id
    join public.companies c on c.company_id=s.company_id
    left join public.billing_bases b on b.base_id=s.billing_base_id
    join lateral (
      select bs.toll_billing_mode,bs.toll_calculation_mode
      from public.company_billing_settings bs
      where bs.company_id=s.company_id and bs.is_active
        and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
        and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
        and (bs.contract_id is null or bs.contract_id=s.contract_id)
      order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
      limit 1
    ) cfg on cfg.toll_billing_mode='separate' and cfg.toll_calculation_mode<>'not_applicable'
    where s.status='completed'
      and t.payer_agent='provider'
      and coalesce(t.total_amount,0)>0
      and not exists(
        select 1 from public.operator_invoice_tolls il
        where il.service_toll_id=t.service_toll_id and il.released_at is null
      )
      and (p_company_id is null or s.company_id=p_company_id)
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
      and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,t.toll_name_snapshot,t.road_snapshot,t.direction_snapshot,t.notes)) like '%'||v_search||'%')
  ) filtered;

  return jsonb_build_object('rows',v_rows,'total_amount',round(v_total,2));
end;
$function$;

revoke all on function public.list_operator_billing_tolls_v2(text,uuid,date,date) from public,anon;
grant execute on function public.list_operator_billing_tolls_v2(text,uuid,date,date) to authenticated,service_role;

create or replace function public.annul_operator_invoice_v2(
  p_invoice_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_invoice public.operator_invoices%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_service_count integer:=0;
  v_toll_count integer:=0;
  r record;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para anular facturas'; end if;
  if length(v_reason)<3 then raise exception 'Ingresá un motivo de anulación'; end if;
  if length(v_reason)>300 then raise exception 'El motivo no puede superar 300 caracteres'; end if;

  select * into v_invoice from public.operator_invoices where invoice_id=p_invoice_id for update;
  if not found then raise exception 'Factura inexistente'; end if;
  if v_invoice.status='cancelled' then raise exception 'La factura ya está anulada'; end if;
  if v_invoice.status='credited' then raise exception 'La factura tiene una Nota de Crédito y no puede anularse administrativamente'; end if;

  perform 1
  from public.operator_services s
  where s.service_id in (
    select l.service_id from public.operator_invoice_services l
    where l.invoice_id=p_invoice_id and l.released_at is null
    union
    select t.service_id
    from public.operator_invoice_tolls it
    join public.operator_service_tolls t on t.service_toll_id=it.service_toll_id
    where it.invoice_id=p_invoice_id and it.released_at is null
  )
  order by s.service_id
  for update;

  for r in
    select l.service_id,l.company_amount,l.currency,l.quote_snapshot
    from public.operator_invoice_services l
    where l.invoice_id=p_invoice_id and l.released_at is null
    order by l.line_number
  loop
    update public.operator_services
    set billing_status='pending',updated_by=auth.uid(),updated_at=now()
    where service_id=r.service_id and billing_status='invoiced';

    insert into public.operator_service_billing_revisions(
      service_id,billing_status,previous_company_amount,company_amount,currency,
      quote_snapshot,rate_card_id,rate_card_version,reason
    ) values(
      r.service_id,'pending',r.company_amount,r.company_amount,r.currency,r.quote_snapshot,
      nullif(r.quote_snapshot->>'rate_card_id','')::uuid,
      nullif(r.quote_snapshot->>'rate_card_version','')::integer,'Factura anulada · '||v_reason
    );

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_invoice_cancelled','completed','completed',
      'Factura anulada; servicio devuelto a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'reason',v_reason,'billing_status','pending')
    );
    v_service_count:=v_service_count+1;
  end loop;

  for r in
    select it.service_toll_id,t.service_id,it.amount,it.currency
    from public.operator_invoice_tolls it
    join public.operator_service_tolls t on t.service_toll_id=it.service_toll_id
    where it.invoice_id=p_invoice_id and it.released_at is null
    order by it.line_number
  loop
    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_toll_invoice_cancelled','completed','completed',
      'Factura anulada; peaje devuelto a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'service_toll_id',r.service_toll_id,
        'reason',v_reason,'amount',r.amount,'currency',r.currency)
    );
    v_toll_count:=v_toll_count+1;
  end loop;

  update public.operator_invoice_services
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoice_tolls
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoices
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_reason=v_reason,updated_at=now()
  where invoice_id=p_invoice_id;

  return jsonb_build_object(
    'invoice_id',p_invoice_id,'status','cancelled',
    'released_service_count',v_service_count,'released_toll_count',v_toll_count,'reason',v_reason
  );
end;
$function$;

revoke all on function public.annul_operator_invoice_v2(uuid,text) from public,anon;
grant execute on function public.annul_operator_invoice_v2(uuid,text) to authenticated,service_role;

create or replace function public.list_operator_invoices_v2(
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
  v_search text:=lower(btrim(coalesce(p_search,'')));
  v_rows jsonb;
  v_companies jsonb;
  v_periods jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturas'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('company_id',x.company_id,'company_name',x.company_name) order by x.company_name),'[]'::jsonb)
  into v_companies
  from (
    select distinct i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_invoices i join public.companies c on c.company_id=i.company_id
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
  into v_periods
  from (
    select distinct to_char(coalesce(i.issued_on,i.created_at::date),'YYYY-MM') period
    from public.operator_invoices i
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select i.invoice_id,
      app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence) invoice_number,
      i.document_type,i.point_of_sale,i.document_number,i.issued_on,i.notes,
      i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
      i.status,i.currency,i.service_count,i.toll_count,i.total_amount,i.created_at,i.updated_at,
      coalesce(u.full_name,'Usuario') created_by_name,
      i.pdf_path,i.pdf_name,i.pdf_uploaded_at,i.cancelled_at,i.cancellation_reason,i.credited_at,
      cn.credit_note_id,cn.document_type credit_note_type,cn.point_of_sale credit_note_point_of_sale,
      cn.document_number credit_note_number,cn.issued_on credit_note_issued_on,cn.amount credit_note_amount
    from public.operator_invoices i
    join public.companies c on c.company_id=i.company_id
    left join public.users u on u.user_id=i.created_by
    left join public.operator_invoice_credit_notes cn on cn.invoice_id=i.invoice_id
    where (p_company_id is null or i.company_id=p_company_id)
      and (p_period_start is null or coalesce(i.issued_on,i.created_at::date)>=p_period_start)
      and (p_period_end is null or coalesce(i.issued_on,i.created_at::date)<=p_period_end)
      and (
        v_search=''
        or lower(app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence)) like '%'||v_search||'%'
        or lower(coalesce(c.trade_name,c.legal_name,'')) like '%'||v_search||'%'
        or lower(coalesce(cn.document_type||' '||cn.point_of_sale||'-'||cn.document_number,'')) like '%'||v_search||'%'
        or exists(select 1 from public.operator_invoice_services l where l.invoice_id=i.invoice_id and lower(l.service_snapshot::text) like '%'||v_search||'%')
        or exists(select 1 from public.operator_invoice_tolls t where t.invoice_id=i.invoice_id and lower(t.toll_snapshot::text||' '||t.service_snapshot::text) like '%'||v_search||'%')
      )
  ) x;

  return jsonb_build_object('rows',v_rows,'filters',jsonb_build_object('companies',v_companies,'periods',v_periods));
end;
$function$;

create or replace function public.get_operator_invoice_detail_v2(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_invoice jsonb;
  v_lines jsonb;
  v_toll_lines jsonb;
  v_credit_note jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturas'; end if;

  select jsonb_build_object(
    'invoice_id',i.invoice_id,
    'invoice_number',app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence),
    'document_type',i.document_type,'point_of_sale',i.point_of_sale,'document_number',i.document_number,
    'issued_on',i.issued_on,'notes',i.notes,'company_id',i.company_id,
    'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
    'status',i.status,'currency',i.currency,'service_count',i.service_count,'toll_count',i.toll_count,
    'total_amount',i.total_amount,'created_by_name',coalesce(u.full_name,'Usuario'),
    'created_at',i.created_at,'updated_at',i.updated_at,'pdf_path',i.pdf_path,'pdf_name',i.pdf_name,
    'pdf_uploaded_at',i.pdf_uploaded_at,'cancelled_at',i.cancelled_at,
    'cancellation_reason',i.cancellation_reason,'credited_at',i.credited_at
  ) into v_invoice
  from public.operator_invoices i
  join public.companies c on c.company_id=i.company_id
  left join public.users u on u.user_id=i.created_by
  where i.invoice_id=p_invoice_id;

  if v_invoice is null then raise exception 'Factura inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_service_id',l.invoice_service_id,'service_id',l.service_id,'line_number',l.line_number,
    'company_amount',l.company_amount,'currency',l.currency,'service_snapshot',l.service_snapshot,
    'quote_snapshot',l.quote_snapshot,'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_lines
  from public.operator_invoice_services l where l.invoice_id=p_invoice_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_toll_id',l.invoice_toll_id,'service_toll_id',l.service_toll_id,'line_number',l.line_number,
    'amount',l.amount,'currency',l.currency,'toll_snapshot',l.toll_snapshot,'service_snapshot',l.service_snapshot,
    'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_toll_lines
  from public.operator_invoice_tolls l where l.invoice_id=p_invoice_id;

  select jsonb_build_object(
    'credit_note_id',cn.credit_note_id,'document_type',cn.document_type,'point_of_sale',cn.point_of_sale,
    'document_number',cn.document_number,'issued_on',cn.issued_on,'amount',cn.amount,'currency',cn.currency,
    'notes',cn.notes,'created_at',cn.created_at
  ) into v_credit_note
  from public.operator_invoice_credit_notes cn where cn.invoice_id=p_invoice_id;

  return jsonb_build_object('invoice',v_invoice,'lines',v_lines,'toll_lines',v_toll_lines,'credit_note',v_credit_note);
end;
$function$;

revoke all on function public.list_operator_invoices_v2(text,uuid,date,date) from public,anon;
grant execute on function public.list_operator_invoices_v2(text,uuid,date,date) to authenticated,service_role;
revoke all on function public.get_operator_invoice_detail_v2(uuid) from public,anon;
grant execute on function public.get_operator_invoice_detail_v2(uuid) to authenticated,service_role;
