-- AuxiliOS · Facturas v2 · numeración real ingresada por el usuario
-- Esta migración prepara el modelo y las RPC. No debe aplicarse a producción sin autorización explícita.

alter table public.operator_invoices
  add column if not exists document_type text,
  add column if not exists point_of_sale text,
  add column if not exists document_number text,
  add column if not exists issued_on date,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.operator_invoices'::regclass
      and conname='operator_invoices_document_type_ck'
  ) then
    alter table public.operator_invoices
      add constraint operator_invoices_document_type_ck
      check (document_type is null or document_type in ('FA','FB','FC'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.operator_invoices'::regclass
      and conname='operator_invoices_point_of_sale_ck'
  ) then
    alter table public.operator_invoices
      add constraint operator_invoices_point_of_sale_ck
      check (point_of_sale is null or (point_of_sale ~ '^[0-9]{1,10}$'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.operator_invoices'::regclass
      and conname='operator_invoices_document_number_ck'
  ) then
    alter table public.operator_invoices
      add constraint operator_invoices_document_number_ck
      check (document_number is null or (document_number ~ '^[0-9]{1,20}$'));
  end if;
end $$;

-- Conserva los ceros ingresados para mostrar el comprobante, pero considera
-- 0004 y 4 como el mismo punto de venta a efectos de unicidad.
create unique index if not exists operator_invoices_external_number_uq
  on public.operator_invoices(
    document_type,
    ((point_of_sale)::numeric),
    ((document_number)::numeric)
  )
  where document_type is not null
    and point_of_sale is not null
    and document_number is not null;

create or replace function app_private.operator_invoice_display_number(
  p_document_type text,
  p_point_of_sale text,
  p_document_number text,
  p_invoice_sequence bigint
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_document_type is not null
      and p_point_of_sale is not null
      and p_document_number is not null
    then (case upper(p_document_type)
      when 'FA' then 'Factura A'
      when 'FB' then 'Factura B'
      when 'FC' then 'Factura C'
      else upper(p_document_type)
    end) || ' ' || p_point_of_sale || '-' || p_document_number
    else 'FAC-' || lpad(coalesce(p_invoice_sequence,0)::text,8,'0')
  end;
$function$;

revoke all on function app_private.operator_invoice_display_number(text,text,text,bigint) from public,anon,authenticated;

create or replace function app_private.create_operator_invoice_core_v2(
  p_service_ids uuid[],
  p_document_type text default null,
  p_point_of_sale text default null,
  p_document_number text default null,
  p_issued_on date default null,
  p_notes text default null,
  p_require_reviewed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_requested integer:=coalesce(array_length(p_service_ids,1),0);
  v_unique integer;
  v_valid integer;
  v_company_count integer;
  v_company_id uuid;
  v_company_name text;
  v_currency text;
  v_total numeric:=0;
  v_invoice public.operator_invoices%rowtype;
  v_invoice_number text;
  v_id uuid;
  v_line_no integer:=0;
  v_amount numeric;
  v_previous numeric;
  s public.operator_services%rowtype;
  q jsonb;
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para facturar servicios';
  end if;
  if v_requested=0 then raise exception 'Seleccioná al menos un servicio'; end if;
  if v_requested>500 then raise exception 'La factura no puede contener más de 500 servicios'; end if;

  select count(distinct id) into v_unique
  from unnest(p_service_ids) as selected(id);
  if v_unique<>v_requested then raise exception 'La selección contiene servicios duplicados'; end if;

  perform 1
  from public.operator_services locked
  where locked.service_id=any(p_service_ids)
  order by locked.service_id
  for update;

  select count(*),count(distinct company_id)
  into v_valid,v_company_count
  from public.operator_services
  where service_id=any(p_service_ids)
    and status='completed'
    and (
      (p_require_reviewed and billing_status='reviewed')
      or (not p_require_reviewed and billing_status in ('pending','reviewed'))
    );

  if v_valid<>v_requested then
    if p_require_reviewed then
      raise exception 'La selección contiene servicios que no están APROBADOS o ya fueron facturados';
    end if;
    raise exception 'La selección contiene servicios que ya no están disponibles para facturar';
  end if;
  if v_company_count<>1 then
    raise exception 'No se pueden facturar juntas diferentes prestadoras';
  end if;

  select company_id into v_company_id
  from public.operator_services
  where service_id=any(p_service_ids)
  limit 1;

  select coalesce(c.trade_name,c.legal_name,'Prestadora') into v_company_name
  from public.companies c
  where c.company_id=v_company_id;

  foreach v_id in array p_service_ids loop
    select * into s
    from public.operator_services
    where service_id=v_id;

    q:=app_private.calculate_operator_service_billing_quote_v2(v_id);
    v_amount:=round(coalesce((q->>'current_company_amount')::numeric,0),2);

    if v_currency is null then
      v_currency:=coalesce(q->>'currency',s.currency,'ARS');
    elsif v_currency<>coalesce(q->>'currency',s.currency,'ARS') then
      raise exception 'No se pueden mezclar monedas en una misma factura';
    end if;
    v_total:=v_total+v_amount;
  end loop;

  insert into public.operator_invoices(
    company_id,currency,service_count,total_amount,
    document_type,point_of_sale,document_number,issued_on,notes
  ) values(
    v_company_id,coalesce(v_currency,'ARS'),v_requested,round(v_total,2),
    p_document_type,p_point_of_sale,p_document_number,p_issued_on,nullif(btrim(p_notes),'')
  ) returning * into v_invoice;

  v_invoice_number:=app_private.operator_invoice_display_number(
    v_invoice.document_type,
    v_invoice.point_of_sale,
    v_invoice.document_number,
    v_invoice.invoice_sequence
  );

  foreach v_id in array p_service_ids loop
    v_line_no:=v_line_no+1;
    select * into s
    from public.operator_services
    where service_id=v_id;

    q:=app_private.calculate_operator_service_billing_quote_v2(v_id);
    v_amount:=round(coalesce((q->>'current_company_amount')::numeric,0),2);

    insert into public.operator_invoice_services(
      invoice_id,service_id,line_number,company_amount,currency,service_snapshot,quote_snapshot
    ) values(
      v_invoice.invoice_id,
      v_id,
      v_line_no,
      v_amount,
      coalesce(q->>'currency',s.currency,'ARS'),
      jsonb_build_object(
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
      ),
      q
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
      v_id,
      'invoiced',
      round(v_previous,2),
      v_amount,
      coalesce(q->>'currency',s.currency,'ARS'),
      q,
      nullif(q->>'rate_card_id','')::uuid,
      nullif(q->>'rate_card_version','')::integer,
      v_invoice_number
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
        updated_by=auth.uid(),
        updated_at=now()
    where service_id=v_id;

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      v_id,
      'billing_invoiced',
      'completed',
      'completed',
      'Servicio incorporado a Factura',
      auth.uid(),
      jsonb_build_object(
        'invoice_id',v_invoice.invoice_id,
        'invoice_sequence',v_invoice.invoice_sequence,
        'invoice_number',v_invoice_number,
        'company_amount',v_amount,
        'billing_status','invoiced'
      )
    );
  end loop;

  return jsonb_build_object(
    'invoice_id',v_invoice.invoice_id,
    'invoice_sequence',v_invoice.invoice_sequence,
    'invoice_number',v_invoice_number,
    'document_type',v_invoice.document_type,
    'point_of_sale',v_invoice.point_of_sale,
    'document_number',v_invoice.document_number,
    'issued_on',v_invoice.issued_on,
    'notes',v_invoice.notes,
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

revoke all on function app_private.create_operator_invoice_core_v2(uuid[],text,text,text,date,text,boolean) from public,anon,authenticated;

-- Compatibilidad con consumidores anteriores: la secuencia FAC interna sigue disponible,
-- pero toda la lógica de creación vive en un único núcleo.
create or replace function public.create_operator_invoice_v1(p_service_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
begin
  return app_private.create_operator_invoice_core_v2(
    p_service_ids,
    null,null,null,current_date,null,false
  );
end;
$function$;

create or replace function public.create_operator_invoice_v2(
  p_service_ids uuid[],
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
  if app_private.current_auxilios_role() not in ('administracion','facturacion') then
    raise exception 'Sin permiso para facturar servicios';
  end if;
  if v_type not in ('FA','FB','FC') then
    raise exception 'Seleccioná un tipo de comprobante válido';
  end if;
  if v_pos !~ '^[0-9]{1,10}$' then
    raise exception 'El punto de venta debe contener sólo números';
  end if;
  if v_number !~ '^[0-9]{1,20}$' then
    raise exception 'El número de factura debe contener sólo números';
  end if;
  if p_issued_on is null then
    raise exception 'Ingresá la fecha de emisión';
  end if;
  if length(coalesce(p_notes,''))>300 then
    raise exception 'Las observaciones no pueden superar 300 caracteres';
  end if;

  v_display:=app_private.operator_invoice_display_number(v_type,v_pos,v_number,0);

  if exists(
    select 1
    from public.operator_invoices i
    where i.document_type=v_type
      and i.point_of_sale is not null
      and i.document_number is not null
      and (i.point_of_sale)::numeric=(v_pos)::numeric
      and (i.document_number)::numeric=(v_number)::numeric
  ) then
    raise exception 'Ya existe la %',v_display;
  end if;

  return app_private.create_operator_invoice_core_v2(
    p_service_ids,
    v_type,
    v_pos,
    v_number,
    p_issued_on,
    nullif(btrim(coalesce(p_notes,'')),''),
    true
  );
exception
  when unique_violation then
    raise exception 'Ya existe la %',coalesce(v_display,'factura indicada');
end;
$function$;

revoke all on function public.create_operator_invoice_v1(uuid[]) from public,anon;
grant execute on function public.create_operator_invoice_v1(uuid[]) to authenticated,service_role;
revoke all on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) to authenticated,service_role;

-- Las APIs de consulta conservan su nombre para no duplicar pantallas, pero muestran
-- el número real cuando existe y el FAC interno sólo para facturas históricas/legadas.
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
  v_rows jsonb:='[]'::jsonb;
  v_companies jsonb:='[]'::jsonb;
  v_periods jsonb:='[]'::jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturas';
  end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then
    raise exception 'Período inválido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'company_id',x.company_id,'company_name',x.company_name
  ) order by x.company_name),'[]'::jsonb)
  into v_companies
  from (
    select distinct i.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_invoices i
    join public.companies c on c.company_id=i.company_id
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
  into v_periods
  from (
    select distinct to_char(coalesce(i.issued_on,(i.created_at at time zone 'America/Argentina/Buenos_Aires')::date),'YYYY-MM') period
    from public.operator_invoices i
  ) x;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select i.created_at,
      jsonb_build_object(
        'invoice_id',i.invoice_id,
        'invoice_sequence',i.invoice_sequence,
        'invoice_number',app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence),
        'document_type',i.document_type,
        'point_of_sale',i.point_of_sale,
        'document_number',i.document_number,
        'issued_on',i.issued_on,
        'notes',i.notes,
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
      ) row_data
    from public.operator_invoices i
    join public.companies c on c.company_id=i.company_id
    left join public.users u on u.user_id=i.created_by
    where (p_company_id is null or i.company_id=p_company_id)
      and (p_period_start is null or coalesce(i.issued_on,(i.created_at at time zone 'America/Argentina/Buenos_Aires')::date)>=p_period_start)
      and (p_period_end is null or coalesce(i.issued_on,(i.created_at at time zone 'America/Argentina/Buenos_Aires')::date)<=p_period_end)
      and (
        v_search=''
        or lower(app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence)) like '%'||v_search||'%'
        or lower(coalesce(c.trade_name,c.legal_name,'')) like '%'||v_search||'%'
        or exists(
          select 1
          from public.operator_invoice_services il
          where il.invoice_id=i.invoice_id
            and lower(il.service_snapshot::text) like '%'||v_search||'%'
        )
      )
  ) filtered;

  return jsonb_build_object(
    'rows',v_rows,
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
    'invoice_number',app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence),
    'document_type',i.document_type,
    'point_of_sale',i.point_of_sale,
    'document_number',i.document_number,
    'issued_on',i.issued_on,
    'notes',i.notes,
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

revoke all on function public.list_operator_invoices_v1(text,uuid,date,date) from public,anon;
grant execute on function public.list_operator_invoices_v1(text,uuid,date,date) to authenticated,service_role;
revoke all on function public.get_operator_invoice_detail_v1(uuid) from public,anon;
grant execute on function public.get_operator_invoice_detail_v1(uuid) to authenticated,service_role;
