-- AuxiliOS · Facturas v3 · circuito operativo canónico
-- Preparada para revisión. NO aplicar a producción sin autorización explícita.
--
-- Objetivos:
-- 1) Facturar directamente servicios pendientes/revisados sin paso visible de aprobación.
-- 2) Anular conservando historial y devolver los servicios a Facturación.
-- 3) Adjuntar un PDF privado por factura.
-- 4) Emitir una Nota de Crédito TOTAL asociada sin liberar los servicios.
-- 5) Permitir refacturar un servicio liberado por una factura anulada sin borrar trazabilidad.

-- ---------------------------------------------------------------------------
-- Trazabilidad de líneas: una línea histórica nunca se borra.
-- Sólo puede existir un vínculo ACTIVO por servicio.
-- ---------------------------------------------------------------------------
alter table public.operator_invoice_services
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references public.users(user_id) on delete restrict,
  add column if not exists release_reason text;

alter table public.operator_invoice_services
  drop constraint if exists operator_invoice_services_service_id_key;

drop index if exists public.operator_invoice_services_service_id_key;

create unique index if not exists operator_invoice_services_active_service_uq
  on public.operator_invoice_services(service_id)
  where released_at is null;

create index if not exists operator_invoice_services_service_history_idx
  on public.operator_invoice_services(service_id,created_at desc);

-- ---------------------------------------------------------------------------
-- Estado y metadatos administrativos de la factura.
-- ---------------------------------------------------------------------------
alter table public.operator_invoices
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(user_id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists pdf_path text,
  add column if not exists pdf_name text,
  add column if not exists pdf_uploaded_at timestamptz,
  add column if not exists pdf_uploaded_by uuid references public.users(user_id) on delete restrict,
  add column if not exists credited_at timestamptz,
  add column if not exists credited_by uuid references public.users(user_id) on delete restrict;

alter table public.operator_invoices
  drop constraint if exists operator_invoices_status_check;

alter table public.operator_invoices
  add constraint operator_invoices_status_check
  check (status in ('created','cancelled','credited'));

-- ---------------------------------------------------------------------------
-- Nota de Crédito total. Se modela como documento propio, no como anulación.
-- ---------------------------------------------------------------------------
create table if not exists public.operator_invoice_credit_notes (
  credit_note_id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.operator_invoices(invoice_id) on delete restrict,
  document_type text not null check (document_type in ('NCA','NCB','NCC')),
  point_of_sale text not null check (point_of_sale ~ '^[0-9]{1,10}$'),
  document_number text not null check (document_number ~ '^[0-9]{1,20}$'),
  issued_on date not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency in ('ARS','USD')),
  notes text,
  created_by uuid not null default auth.uid() references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(invoice_id)
);

create unique index if not exists operator_invoice_credit_notes_number_uq
  on public.operator_invoice_credit_notes(
    document_type,
    ((point_of_sale)::numeric),
    ((document_number)::numeric)
  );

alter table public.operator_invoice_credit_notes enable row level security;
revoke all on table public.operator_invoice_credit_notes from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- PDF privado: un archivo canónico por factura. El binario vive en Storage;
-- operator_invoices guarda sólo su referencia y auditoría.
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('operator-invoice-pdfs','operator-invoice-pdfs',false,15728640,array['application/pdf'])
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists operator_invoice_pdfs_read on storage.objects;
drop policy if exists operator_invoice_pdfs_insert on storage.objects;
drop policy if exists operator_invoice_pdfs_update on storage.objects;
drop policy if exists operator_invoice_pdfs_delete on storage.objects;

create policy operator_invoice_pdfs_read
on storage.objects for select to authenticated
using (
  bucket_id='operator-invoice-pdfs'
  and app_private.current_auxilios_role() in ('administracion','facturacion','supervision')
);

create policy operator_invoice_pdfs_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='operator-invoice-pdfs'
  and app_private.current_auxilios_role() in ('administracion','facturacion')
);

create policy operator_invoice_pdfs_update
on storage.objects for update to authenticated
using (
  bucket_id='operator-invoice-pdfs'
  and app_private.current_auxilios_role() in ('administracion','facturacion')
)
with check (
  bucket_id='operator-invoice-pdfs'
  and app_private.current_auxilios_role() in ('administracion','facturacion')
);

create policy operator_invoice_pdfs_delete
on storage.objects for delete to authenticated
using (
  bucket_id='operator-invoice-pdfs'
  and app_private.current_auxilios_role() in ('administracion','facturacion')
);

-- ---------------------------------------------------------------------------
-- Creación directa: mantiene la validación de numeración de v2, pero el núcleo
-- admite pending/reviewed. El paso reviewed deja de ser un requisito operativo.
-- ---------------------------------------------------------------------------
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
    false
  );
exception
  when unique_violation then
    raise exception 'Ya existe la %',coalesce(v_display,'factura indicada');
end;
$function$;

revoke all on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_v2(uuid[],text,text,text,date,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Anulación administrativa. Conserva factura y líneas como historial, libera
-- sus líneas y devuelve exclusivamente sus servicios a pending.
-- ---------------------------------------------------------------------------
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
  v_count integer:=0;
  r record;
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para anular facturas';
  end if;
  if length(v_reason)<3 then
    raise exception 'Ingresá un motivo de anulación';
  end if;
  if length(v_reason)>300 then
    raise exception 'El motivo no puede superar 300 caracteres';
  end if;

  select * into v_invoice
  from public.operator_invoices
  where invoice_id=p_invoice_id
  for update;

  if not found then raise exception 'Factura inexistente'; end if;
  if v_invoice.status='cancelled' then raise exception 'La factura ya está anulada'; end if;
  if v_invoice.status='credited' then
    raise exception 'La factura tiene una Nota de Crédito y no puede anularse administrativamente';
  end if;

  perform 1
  from public.operator_services s
  join public.operator_invoice_services l on l.service_id=s.service_id
  where l.invoice_id=p_invoice_id and l.released_at is null
  order by s.service_id
  for update of s;

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
      r.service_id,'pending',r.company_amount,r.company_amount,r.currency,
      r.quote_snapshot,
      nullif(r.quote_snapshot->>'rate_card_id','')::uuid,
      nullif(r.quote_snapshot->>'rate_card_version','')::integer,
      'Factura anulada · '||v_reason
    );

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values(
      r.service_id,'billing_invoice_cancelled','completed','completed',
      'Factura anulada; servicio devuelto a Facturación',auth.uid(),
      jsonb_build_object('invoice_id',p_invoice_id,'reason',v_reason,'billing_status','pending')
    );
    v_count:=v_count+1;
  end loop;

  update public.operator_invoice_services
  set released_at=now(),released_by=auth.uid(),release_reason=v_reason
  where invoice_id=p_invoice_id and released_at is null;

  update public.operator_invoices
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),
      cancellation_reason=v_reason,updated_at=now()
  where invoice_id=p_invoice_id;

  return jsonb_build_object(
    'invoice_id',p_invoice_id,
    'status','cancelled',
    'released_service_count',v_count,
    'reason',v_reason
  );
end;
$function$;

revoke all on function public.annul_operator_invoice_v2(uuid,text) from public,anon;
grant execute on function public.annul_operator_invoice_v2(uuid,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Asociación del PDF ya subido al bucket privado.
-- ---------------------------------------------------------------------------
create or replace function public.attach_operator_invoice_pdf_v1(
  p_invoice_id uuid,
  p_pdf_path text,
  p_pdf_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_path text:=btrim(coalesce(p_pdf_path,''));
  v_name text:=btrim(coalesce(p_pdf_name,''));
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para adjuntar archivos';
  end if;
  if v_path='' or v_name='' then raise exception 'PDF inválido'; end if;
  if v_path not like p_invoice_id::text||'/%' then
    raise exception 'La ruta del PDF no corresponde a la factura';
  end if;
  if lower(v_name) not like '%.pdf' then raise exception 'El archivo debe ser PDF'; end if;

  update public.operator_invoices
  set pdf_path=v_path,pdf_name=v_name,pdf_uploaded_at=now(),pdf_uploaded_by=auth.uid(),updated_at=now()
  where invoice_id=p_invoice_id;
  if not found then raise exception 'Factura inexistente'; end if;

  return jsonb_build_object('invoice_id',p_invoice_id,'pdf_path',v_path,'pdf_name',v_name);
end;
$function$;

revoke all on function public.attach_operator_invoice_pdf_v1(uuid,text,text) from public,anon;
grant execute on function public.attach_operator_invoice_pdf_v1(uuid,text,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Nota de Crédito TOTAL. No libera servicios: es un documento fiscal asociado,
-- distinto de la anulación administrativa de AuxiliOS.
-- ---------------------------------------------------------------------------
create or replace function public.create_operator_invoice_credit_note_v1(
  p_invoice_id uuid,
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
  v_role text:=app_private.current_auxilios_role();
  v_invoice public.operator_invoices%rowtype;
  v_type text:=upper(btrim(coalesce(p_document_type,'')));
  v_pos text:=btrim(coalesce(p_point_of_sale,''));
  v_number text:=btrim(coalesce(p_document_number,''));
  v_expected text;
  v_note public.operator_invoice_credit_notes%rowtype;
begin
  if v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para emitir Notas de Crédito';
  end if;

  select * into v_invoice
  from public.operator_invoices
  where invoice_id=p_invoice_id
  for update;
  if not found then raise exception 'Factura inexistente'; end if;
  if v_invoice.status='cancelled' then raise exception 'No se puede acreditar una factura anulada'; end if;
  if v_invoice.status='credited' then raise exception 'La factura ya tiene una Nota de Crédito'; end if;

  v_expected:=case v_invoice.document_type when 'FA' then 'NCA' when 'FB' then 'NCB' when 'FC' then 'NCC' else null end;
  if v_expected is null then raise exception 'La factura no tiene un tipo compatible con Nota de Crédito'; end if;
  if v_type<>v_expected then raise exception 'El tipo de Nota de Crédito debe corresponder a la factura original'; end if;
  if v_pos !~ '^[0-9]{1,10}$' then raise exception 'El punto de venta debe contener sólo números'; end if;
  if v_number !~ '^[0-9]{1,20}$' then raise exception 'El número debe contener sólo números'; end if;
  if p_issued_on is null then raise exception 'Ingresá la fecha de emisión'; end if;
  if length(coalesce(p_notes,''))>300 then raise exception 'Las observaciones no pueden superar 300 caracteres'; end if;

  insert into public.operator_invoice_credit_notes(
    invoice_id,document_type,point_of_sale,document_number,issued_on,amount,currency,notes
  ) values(
    p_invoice_id,v_type,v_pos,v_number,p_issued_on,v_invoice.total_amount,v_invoice.currency,
    nullif(btrim(coalesce(p_notes,'')),'')
  ) returning * into v_note;

  update public.operator_invoices
  set status='credited',credited_at=now(),credited_by=auth.uid(),updated_at=now()
  where invoice_id=p_invoice_id;

  return jsonb_build_object(
    'credit_note_id',v_note.credit_note_id,
    'invoice_id',p_invoice_id,
    'document_type',v_note.document_type,
    'point_of_sale',v_note.point_of_sale,
    'document_number',v_note.document_number,
    'issued_on',v_note.issued_on,
    'amount',v_note.amount,
    'currency',v_note.currency,
    'status','credited'
  );
exception
  when unique_violation then
    raise exception 'La Nota de Crédito indicada ya existe o la factura ya fue acreditada';
end;
$function$;

revoke all on function public.create_operator_invoice_credit_note_v1(uuid,text,text,text,date,text) from public,anon;
grant execute on function public.create_operator_invoice_credit_note_v1(uuid,text,text,text,date,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Consulta canónica para la nueva mesa de Facturas.
-- ---------------------------------------------------------------------------
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
      i.status,i.currency,i.service_count,i.total_amount,i.created_at,i.updated_at,
      coalesce(u.full_name,'Usuario') created_by_name,
      i.pdf_path,i.pdf_name,i.pdf_uploaded_at,
      i.cancelled_at,i.cancellation_reason,i.credited_at,
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
        or exists(
          select 1 from public.operator_invoice_services l
          where l.invoice_id=i.invoice_id and lower(l.service_snapshot::text) like '%'||v_search||'%'
        )
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
  v_credit_note jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then
    raise exception 'Sin permiso para consultar Facturas';
  end if;

  select jsonb_build_object(
    'invoice_id',i.invoice_id,
    'invoice_number',app_private.operator_invoice_display_number(i.document_type,i.point_of_sale,i.document_number,i.invoice_sequence),
    'document_type',i.document_type,'point_of_sale',i.point_of_sale,'document_number',i.document_number,
    'issued_on',i.issued_on,'notes',i.notes,
    'company_id',i.company_id,'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
    'status',i.status,'currency',i.currency,'service_count',i.service_count,'total_amount',i.total_amount,
    'created_by_name',coalesce(u.full_name,'Usuario'),'created_at',i.created_at,'updated_at',i.updated_at,
    'pdf_path',i.pdf_path,'pdf_name',i.pdf_name,'pdf_uploaded_at',i.pdf_uploaded_at,
    'cancelled_at',i.cancelled_at,'cancellation_reason',i.cancellation_reason,'credited_at',i.credited_at
  ) into v_invoice
  from public.operator_invoices i
  join public.companies c on c.company_id=i.company_id
  left join public.users u on u.user_id=i.created_by
  where i.invoice_id=p_invoice_id;

  if v_invoice is null then raise exception 'Factura inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'invoice_service_id',l.invoice_service_id,'service_id',l.service_id,'line_number',l.line_number,
    'company_amount',l.company_amount,'currency',l.currency,
    'service_snapshot',l.service_snapshot,'quote_snapshot',l.quote_snapshot,
    'released_at',l.released_at,'release_reason',l.release_reason,'created_at',l.created_at
  ) order by l.line_number),'[]'::jsonb)
  into v_lines
  from public.operator_invoice_services l
  where l.invoice_id=p_invoice_id;

  select jsonb_build_object(
    'credit_note_id',cn.credit_note_id,'document_type',cn.document_type,
    'point_of_sale',cn.point_of_sale,'document_number',cn.document_number,
    'issued_on',cn.issued_on,'amount',cn.amount,'currency',cn.currency,
    'notes',cn.notes,'created_at',cn.created_at
  ) into v_credit_note
  from public.operator_invoice_credit_notes cn
  where cn.invoice_id=p_invoice_id;

  return jsonb_build_object('invoice',v_invoice,'lines',v_lines,'credit_note',v_credit_note);
end;
$function$;

revoke all on function public.list_operator_invoices_v2(text,uuid,date,date) from public,anon;
grant execute on function public.list_operator_invoices_v2(text,uuid,date,date) to authenticated,service_role;
revoke all on function public.get_operator_invoice_detail_v2(uuid) from public,anon;
grant execute on function public.get_operator_invoice_detail_v2(uuid) to authenticated,service_role;
