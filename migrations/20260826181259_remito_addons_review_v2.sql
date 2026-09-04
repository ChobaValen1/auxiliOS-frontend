-- AuxiliOS · Remitos v2 · peajes/excedentes informados, revisión y promoción comercial
-- El contenido informado y firmado por el Chofer queda inmutable. Administración
-- crea una aceptación separada que alimenta Servicios y Facturación.

create table if not exists public.remito_toll_reports (
  toll_report_id uuid primary key default gen_random_uuid(),
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  client_line_id uuid not null,
  toll_id uuid references public.toll_locations(toll_id) on delete set null,
  toll_code_snapshot text,
  toll_name_snapshot text not null,
  road_snapshot text,
  direction_snapshot text,
  quantity integer not null default 1,
  unit_amount numeric(14,2) not null,
  total_amount numeric(14,2) generated always as (round(quantity*unit_amount,2)) stored,
  currency text not null default 'ARS',
  payment_method text not null,
  crossed_at timestamptz,
  missing_evidence_reason text,
  notes text,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  constraint remito_toll_reports_line_unique unique(remito_id,client_line_id),
  constraint remito_toll_reports_name_chk check (btrim(toll_name_snapshot)<>''),
  constraint remito_toll_reports_quantity_chk check (quantity>0),
  constraint remito_toll_reports_amount_chk check (unit_amount>=0),
  constraint remito_toll_reports_currency_chk check (currency~'^[A-Z]{3}$'),
  constraint remito_toll_reports_payment_chk check (payment_method in ('cash','electronic','telepass','manual','other'))
);

create index if not exists remito_toll_reports_remito_idx
  on public.remito_toll_reports(remito_id,created_at);
create index if not exists remito_toll_reports_toll_idx
  on public.remito_toll_reports(toll_id) where toll_id is not null;
create index if not exists remito_toll_reports_created_by_idx
  on public.remito_toll_reports(created_by);

create table if not exists public.remito_excess_reports (
  excess_report_id uuid primary key default gen_random_uuid(),
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  client_line_id uuid not null,
  concept_id uuid references public.service_concepts(concept_id) on delete set null,
  concept_name_snapshot text not null,
  quantity numeric(12,2) not null default 1,
  unit_amount numeric(14,2) not null,
  total_amount numeric(14,2) generated always as (round(quantity*unit_amount,2)) stored,
  currency text not null default 'ARS',
  reason text not null,
  notes text,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  is_test boolean not null default false,
  constraint remito_excess_reports_line_unique unique(remito_id,client_line_id),
  constraint remito_excess_reports_name_chk check (btrim(concept_name_snapshot)<>''),
  constraint remito_excess_reports_quantity_chk check (quantity>0),
  constraint remito_excess_reports_amount_chk check (unit_amount>0),
  constraint remito_excess_reports_currency_chk check (currency~'^[A-Z]{3}$'),
  constraint remito_excess_reports_reason_chk check (btrim(reason)<>'')
);

create index if not exists remito_excess_reports_remito_idx
  on public.remito_excess_reports(remito_id,created_at);
create index if not exists remito_excess_reports_concept_idx
  on public.remito_excess_reports(concept_id) where concept_id is not null;
create index if not exists remito_excess_reports_created_by_idx
  on public.remito_excess_reports(created_by);

create table if not exists public.remito_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  client_evidence_id uuid not null,
  toll_report_id uuid references public.remito_toll_reports(toll_report_id) on delete cascade,
  excess_report_id uuid references public.remito_excess_reports(excess_report_id) on delete cascade,
  evidence_kind text not null,
  storage_bucket text not null default 'remito-evidence-v2',
  storage_path text not null,
  mime_type text not null,
  original_name text,
  size_bytes bigint,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint remito_evidence_client_unique unique(remito_id,client_evidence_id),
  constraint remito_evidence_object_unique unique(storage_bucket,storage_path),
  constraint remito_evidence_kind_chk check (evidence_kind in ('vehicle_front','vehicle_side','odometer','extra','toll_ticket','excess_support')),
  constraint remito_evidence_mime_chk check (mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')),
  constraint remito_evidence_size_chk check (size_bytes is null or (size_bytes>0 and size_bytes<=10485760)),
  constraint remito_evidence_owner_chk check (
    (evidence_kind='toll_ticket' and toll_report_id is not null and excess_report_id is null)
    or (evidence_kind='excess_support' and excess_report_id is not null and toll_report_id is null)
    or (evidence_kind in ('vehicle_front','vehicle_side','odometer','extra') and toll_report_id is null and excess_report_id is null)
  )
);

create index if not exists remito_evidence_remito_idx
  on public.remito_evidence(remito_id,created_at);
create index if not exists remito_evidence_toll_idx
  on public.remito_evidence(toll_report_id) where toll_report_id is not null;
create index if not exists remito_evidence_excess_idx
  on public.remito_evidence(excess_report_id) where excess_report_id is not null;
create index if not exists remito_evidence_created_by_idx
  on public.remito_evidence(created_by);

create table if not exists public.operator_service_document_addon_reviews (
  review_line_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete cascade,
  remito_id integer not null references public.remitos(remito_id) on delete cascade,
  toll_report_id uuid references public.remito_toll_reports(toll_report_id) on delete restrict,
  excess_report_id uuid references public.remito_excess_reports(excess_report_id) on delete restrict,
  decision text not null,
  original_snapshot jsonb not null,
  accepted_snapshot jsonb not null default '{}'::jsonb,
  reason text,
  service_toll_id uuid references public.operator_service_tolls(service_toll_id) on delete restrict,
  excess_charge_id uuid references public.operator_service_excess_charges(excess_charge_id) on delete restrict,
  reviewed_by uuid not null references public.users(user_id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  is_test boolean not null default false,
  constraint operator_service_document_addon_review_owner_chk check ((toll_report_id is not null)::integer+(excess_report_id is not null)::integer=1),
  constraint operator_service_document_addon_review_decision_chk check (decision in ('accepted','adjusted','rejected')),
  constraint operator_service_document_addon_review_reason_chk check (decision='accepted' or nullif(btrim(reason),'') is not null)
);

create unique index if not exists operator_service_document_toll_review_unique
  on public.operator_service_document_addon_reviews(toll_report_id) where toll_report_id is not null;
create unique index if not exists operator_service_document_excess_review_unique
  on public.operator_service_document_addon_reviews(excess_report_id) where excess_report_id is not null;
create index if not exists operator_service_document_addon_service_idx
  on public.operator_service_document_addon_reviews(service_id,reviewed_at);
create index if not exists operator_service_document_addon_review_remito_idx
  on public.operator_service_document_addon_reviews(remito_id);
create index if not exists operator_service_document_addon_review_reviewer_idx
  on public.operator_service_document_addon_reviews(reviewed_by);
create index if not exists operator_service_document_addon_review_service_toll_idx
  on public.operator_service_document_addon_reviews(service_toll_id) where service_toll_id is not null;
create index if not exists operator_service_document_addon_review_excess_charge_idx
  on public.operator_service_document_addon_reviews(excess_charge_id) where excess_charge_id is not null;

alter table public.remitos
  add column if not exists addons_version integer not null default 1,
  add column if not exists addons_review_status text not null default 'legacy',
  add column if not exists accepted_imp_peaje numeric(14,2),
  add column if not exists accepted_imp_excedente numeric(14,2),
  add column if not exists accepted_imp_total_extras numeric(14,2),
  add column if not exists addons_reviewed_by uuid references public.users(user_id),
  add column if not exists addons_reviewed_at timestamptz;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='remitos_addons_version_chk') then
    alter table public.remitos add constraint remitos_addons_version_chk check(addons_version in (1,2));
  end if;
  if not exists(select 1 from pg_constraint where conname='remitos_addons_review_status_chk') then
    alter table public.remitos add constraint remitos_addons_review_status_chk check(addons_review_status in ('legacy','draft','pending','approved','adjusted'));
  end if;
end $$;

alter table public.operator_service_tolls
  add column if not exists remito_toll_report_id uuid references public.remito_toll_reports(toll_report_id) on delete restrict;
create unique index if not exists operator_service_tolls_remito_report_unique
  on public.operator_service_tolls(remito_toll_report_id) where remito_toll_report_id is not null;

alter table public.operator_service_excess_charges
  add column if not exists source text not null default 'planned',
  add column if not exists remito_excess_report_id uuid references public.remito_excess_reports(excess_report_id) on delete restrict;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='operator_service_excess_source_chk') then
    alter table public.operator_service_excess_charges add constraint operator_service_excess_source_chk
      check(source in ('planned','actual','manual'));
  end if;
end $$;

drop index if exists public.operator_service_excess_unique_business_charge;
create unique index operator_service_excess_unique_business_charge
  on public.operator_service_excess_charges(
    service_id,concept_id,unit_amount,collector_agent,coalesce(customer_payment_method,'n/a')
  ) where source in ('planned','manual');
create unique index if not exists operator_service_excess_remito_report_unique
  on public.operator_service_excess_charges(remito_excess_report_id) where remito_excess_report_id is not null;

alter table public.remito_toll_reports enable row level security;
alter table public.remito_excess_reports enable row level security;
alter table public.remito_evidence enable row level security;
alter table public.operator_service_document_addon_reviews enable row level security;
revoke all on table public.remito_toll_reports from public,anon,authenticated;
revoke all on table public.remito_excess_reports from public,anon,authenticated;
revoke all on table public.remito_evidence from public,anon,authenticated;
revoke all on table public.operator_service_document_addon_reviews from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'remito-evidence-v2','remito-evidence-v2',false,10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists remito_evidence_v2_insert_own on storage.objects;
create policy remito_evidence_v2_insert_own on storage.objects
  for insert to authenticated
  with check(bucket_id='remito-evidence-v2' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists remito_evidence_v2_select on storage.objects;
create policy remito_evidence_v2_select on storage.objects
  for select to authenticated
  using(
    bucket_id='remito-evidence-v2' and (
      (storage.foldername(name))[1]=(select auth.uid())::text
      or app_private.current_auxilios_role() in ('administracion','operador','supervision','facturacion')
    )
  );
drop policy if exists remito_evidence_v2_update_own on storage.objects;
create policy remito_evidence_v2_update_own on storage.objects
  for update to authenticated
  using(bucket_id='remito-evidence-v2' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='remito-evidence-v2' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists remito_evidence_v2_delete_own on storage.objects;
create policy remito_evidence_v2_delete_own on storage.objects
  for delete to authenticated
  using(bucket_id='remito-evidence-v2' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.get_driver_remito_reference_v1(p_service_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  v_date date:=current_date;
  v_tolls jsonb;
  v_concepts jsonb;
begin
  if v_uid is null or v_role<>'chofer' then raise exception 'Sólo el Chofer puede consultar referencias del remito'; end if;
  if p_service_id is not null then
    select (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date into v_date
    from public.operator_services s
    where s.service_id=p_service_id and s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin');
    if not found then raise exception 'El servicio no está disponible para este Chofer'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,
    'rate_id',r.toll_rate_id,'amount',r.amount,'currency',coalesce(r.currency,'ARS'),
    'payment_method',coalesce(r.payment_method,'any')
  ) order by l.name),'[]'::jsonb)
  into v_tolls
  from public.toll_locations l
  left join lateral(
    select tr.* from public.toll_rates tr
    where tr.toll_id=l.toll_id and tr.is_active and tr.vehicle_category='light_2_axles'
      and tr.valid_from<=v_date and (tr.valid_until is null or tr.valid_until>=v_date)
    order by (tr.payment_method='any') desc,tr.valid_from desc,tr.created_at desc limit 1
  ) r on true
  where l.is_active;

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',c.concept_id,'code',c.code,'name',c.name,'quantity_source',c.quantity_source
  ) order by c.sort_order,c.name),'[]'::jsonb)
  into v_concepts
  from public.service_concepts c
  where c.is_active and c.default_can_be_secondary and c.billing_family<>'system'
    and coalesce(c.matrix_visible,true);

  return jsonb_build_object(
    'version',1,'service_id',p_service_id,'tolls',v_tolls,'excess_concepts',v_concepts,
    'evidence',jsonb_build_object('bucket','remito-evidence-v2','max_bytes',10485760,
      'mime_types',jsonb_build_array('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'))
  );
end;
$function$;
revoke all on function public.get_driver_remito_reference_v1(uuid) from public,anon;
grant execute on function public.get_driver_remito_reference_v1(uuid) to authenticated;

create or replace function app_private.persist_driver_remito_addons_v2(
  p_remito_id integer,
  p_payload jsonb,
  p_uid uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  r public.remitos%rowtype;
  v_tolls jsonb:=coalesce(p_payload->'tolls','[]'::jsonb);
  v_excesses jsonb:=coalesce(p_payload->'excesses','[]'::jsonb);
  v_evidence jsonb:=coalesce(p_payload->'evidence','[]'::jsonb);
  v_row jsonb;
  v_line_id uuid;
  v_owner_line uuid;
  v_toll_id uuid;
  v_concept_id uuid;
  v_toll public.toll_locations%rowtype;
  v_concept public.service_concepts%rowtype;
  v_toll_report_id uuid;
  v_excess_report_id uuid;
  v_name text;
  v_method text;
  v_kind text;
  v_path text;
  v_mime text;
  v_toll_total numeric:=0;
  v_excess_total numeric:=0;
  v_is_test boolean:=false;
begin
  if p_uid is null then raise exception 'Usuario requerido'; end if;
  select * into r from public.remitos where remito_id=p_remito_id and driver_id=p_uid for update;
  if not found then raise exception 'Remito inexistente para el Chofer'; end if;
  if r.operator_service_id is not null then
    select coalesce(s.is_test,false) into v_is_test from public.operator_services s where s.service_id=r.operator_service_id;
  end if;
  if jsonb_typeof(v_tolls)<>'array' or jsonb_typeof(v_excesses)<>'array' or jsonb_typeof(v_evidence)<>'array' then
    raise exception 'Peajes, excedentes y evidencia deben ser listas';
  end if;
  if jsonb_array_length(v_tolls)>30 or jsonb_array_length(v_excesses)>20 or jsonb_array_length(v_evidence)>80 then
    raise exception 'El remito contiene demasiados conceptos o archivos';
  end if;
  if exists(select 1 from public.operator_service_document_addon_reviews x where x.remito_id=p_remito_id) then
    raise exception 'El remito ya fue revisado por Administración';
  end if;

  delete from public.remito_evidence where remito_id=p_remito_id;
  delete from public.remito_toll_reports where remito_id=p_remito_id;
  delete from public.remito_excess_reports where remito_id=p_remito_id;

  for v_row in select value from jsonb_array_elements(v_tolls) loop
    v_line_id:=nullif(v_row->>'client_line_id','')::uuid;
    v_toll_id:=nullif(v_row->>'toll_id','')::uuid;
    v_method:=lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),'manual'));
    if v_line_id is null then raise exception 'Cada peaje necesita identificador'; end if;
    if v_method not in ('cash','electronic','telepass','manual','other') then raise exception 'Medio de peaje inválido'; end if;
    if v_toll_id is not null then
      select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
      if not found then raise exception 'Uno de los peajes ya no está activo'; end if;
      v_name:=v_toll.name;
    else
      v_toll:=null;
      v_name:=nullif(btrim(v_row->>'toll_name'),'');
      if v_name is null then raise exception 'Indicá el nombre del peaje manual'; end if;
    end if;
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      quantity,unit_amount,currency,payment_method,crossed_at,missing_evidence_reason,notes,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_toll_id,case when v_toll_id is null then null else v_toll.code end,v_name,
      coalesce(nullif(v_row->>'road',''),case when v_toll_id is null then null else v_toll.road end),
      coalesce(nullif(v_row->>'direction',''),case when v_toll_id is null then null else v_toll.direction end),
      greatest(coalesce(nullif(v_row->>'quantity','')::integer,1),1),
      round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,0),0),2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),v_method,
      coalesce(nullif(v_row->>'crossed_at','')::timestamptz,r.created_at_device),
      nullif(btrim(v_row->>'missing_evidence_reason'),''),nullif(btrim(v_row->>'notes'),''),p_uid,v_is_test
    );
  end loop;

  for v_row in select value from jsonb_array_elements(v_excesses) loop
    v_line_id:=nullif(v_row->>'client_line_id','')::uuid;
    v_concept_id:=nullif(v_row->>'concept_id','')::uuid;
    if v_line_id is null then raise exception 'Cada excedente necesita identificador'; end if;
    if v_concept_id is not null then
      select * into v_concept from public.service_concepts
      where concept_id=v_concept_id and is_active and default_can_be_secondary and billing_family<>'system';
      if not found then raise exception 'Concepto de excedente inválido'; end if;
      v_name:=v_concept.name;
    else
      v_concept:=null;
      v_name:=nullif(btrim(v_row->>'concept_name'),'');
      if v_name is null then raise exception 'Indicá el concepto del excedente'; end if;
    end if;
    insert into public.remito_excess_reports(
      remito_id,client_line_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,reason,notes,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_concept_id,v_name,
      round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,1),0.01),2),
      round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,0),0),2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),
      nullif(btrim(v_row->>'reason'),''),nullif(btrim(v_row->>'notes'),''),p_uid,v_is_test
    );
  end loop;

  for v_row in select value from jsonb_array_elements(v_evidence) loop
    v_line_id:=nullif(v_row->>'client_evidence_id','')::uuid;
    v_owner_line:=nullif(coalesce(v_row->>'owner_client_line_id',v_row->>'client_line_id'),'')::uuid;
    v_kind:=lower(nullif(btrim(coalesce(v_row->>'kind',v_row->>'evidence_kind')),''));
    v_path:=nullif(btrim(v_row->>'storage_path'),'');
    v_mime:=lower(nullif(btrim(v_row->>'mime_type'),''));
    v_toll_report_id:=null;
    v_excess_report_id:=null;
    if v_line_id is null or v_kind is null or v_path is null or v_mime is null then raise exception 'La evidencia está incompleta'; end if;
    if split_part(v_path,'/',1)<>p_uid::text then raise exception 'Ruta de evidencia inválida'; end if;
    if v_kind='toll_ticket' then
      select toll_report_id into v_toll_report_id from public.remito_toll_reports
      where remito_id=p_remito_id and client_line_id=v_owner_line;
      if v_toll_report_id is null then raise exception 'El ticket no corresponde a un peaje'; end if;
    elsif v_kind='excess_support' then
      select excess_report_id into v_excess_report_id from public.remito_excess_reports
      where remito_id=p_remito_id and client_line_id=v_owner_line;
      if v_excess_report_id is null then raise exception 'La evidencia no corresponde a un excedente'; end if;
    elsif v_kind not in ('vehicle_front','vehicle_side','odometer','extra') then
      raise exception 'Tipo de evidencia inválido';
    end if;
    insert into public.remito_evidence(
      remito_id,client_evidence_id,toll_report_id,excess_report_id,evidence_kind,storage_bucket,storage_path,
      mime_type,original_name,size_bytes,created_by
    ) values(
      p_remito_id,v_line_id,v_toll_report_id,v_excess_report_id,v_kind,'remito-evidence-v2',v_path,v_mime,
      nullif(btrim(v_row->>'original_name'),''),nullif(v_row->>'size_bytes','')::bigint,p_uid
    );
  end loop;

  if exists(
    select 1 from public.remito_toll_reports t
    where t.remito_id=p_remito_id and not exists(
      select 1 from public.remito_evidence e where e.toll_report_id=t.toll_report_id and e.evidence_kind='toll_ticket'
    ) and nullif(btrim(t.missing_evidence_reason),'') is null
  ) then raise exception 'Adjuntá el ticket o justificá por qué no está disponible'; end if;

  select coalesce(sum(total_amount),0) into v_toll_total from public.remito_toll_reports where remito_id=p_remito_id;
  select coalesce(sum(total_amount),0) into v_excess_total from public.remito_excess_reports where remito_id=p_remito_id;
  update public.remitos set
    addons_version=2,
    addons_review_status=case when status='firmado' then 'pending' else 'draft' end,
    imp_peaje=round(v_toll_total,2),imp_excedente=round(v_excess_total,2),
    imp_total_extras=default
  where remito_id=p_remito_id;

  return jsonb_build_object('addons_version',2,'review_status',case when r.status='firmado' then 'pending' else 'draft' end,
    'toll_total',round(v_toll_total,2),'excess_total',round(v_excess_total,2));
end;
$function$;
revoke all on function app_private.persist_driver_remito_addons_v2(integer,jsonb,uuid) from public,anon,authenticated;

create or replace function public.save_driver_operator_service_remito_v4(
  p_service_id uuid,
  p_payload jsonb,
  p_client_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_addons jsonb;
begin
  if v_uid is null or app_private.current_auxilios_role()<>'chofer' then raise exception 'Sólo el Chofer puede guardar el remito'; end if;
  if coalesce(nullif(p_payload->>'addons_version','')::integer,0)<>2 then raise exception 'Versión de peajes y excedentes inválida'; end if;
  select public.save_driver_operator_service_remito_v3(p_service_id,p_payload,p_client_operation_id) into v_result;
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result||jsonb_build_object('addons_version',2); end if;
  v_addons:=app_private.persist_driver_remito_addons_v2((v_result->>'remito_id')::integer,p_payload,v_uid);
  return v_result||v_addons;
end;
$function$;
revoke all on function public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid) to authenticated;

create or replace function public.save_driver_ad_hoc_remito_v2(
  p_payload jsonb,
  p_client_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_addons jsonb;
begin
  if v_uid is null or app_private.current_auxilios_role()<>'chofer' then raise exception 'Sólo el Chofer puede guardar el remito'; end if;
  if coalesce(nullif(p_payload->>'addons_version','')::integer,0)<>2 then raise exception 'Versión de peajes y excedentes inválida'; end if;
  select public.save_driver_ad_hoc_remito_v1(p_payload,p_client_operation_id) into v_result;
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result||jsonb_build_object('addons_version',2); end if;
  v_addons:=app_private.persist_driver_remito_addons_v2((v_result->>'remito_id')::integer,p_payload,v_uid);
  return v_result||v_addons;
end;
$function$;
revoke all on function public.save_driver_ad_hoc_remito_v2(jsonb,uuid) from public,anon;
grant execute on function public.save_driver_ad_hoc_remito_v2(jsonb,uuid) to authenticated;

create or replace function public.get_driver_remito_capabilities_v2()
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_temp
as $function$
  select jsonb_build_object(
    'version',2,
    'assigned',to_regprocedure('public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid)') is not null,
    'ad_hoc',to_regprocedure('public.save_driver_ad_hoc_remito_v2(jsonb,uuid)') is not null,
    'structured_addons',true,
    'private_evidence',true
  );
$function$;
revoke all on function public.get_driver_remito_capabilities_v2() from public,anon;
grant execute on function public.get_driver_remito_capabilities_v2() to authenticated;

create or replace function public.get_driver_remito_addons_v2(p_remito_id integer)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  r public.remitos%rowtype;
  v_tolls jsonb;
  v_excesses jsonb;
  v_general_evidence jsonb;
begin
  if v_uid is null then raise exception 'Sesión requerida'; end if;
  select * into r from public.remitos where remito_id=p_remito_id;
  if not found then raise exception 'Remito inexistente'; end if;
  if r.driver_id is distinct from v_uid and v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar el remito';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_report_id',t.toll_report_id,'client_line_id',t.client_line_id,'toll_id',t.toll_id,
    'toll_code',t.toll_code_snapshot,'toll_name',t.toll_name_snapshot,'road',t.road_snapshot,
    'direction',t.direction_snapshot,'quantity',t.quantity,'unit_amount',t.unit_amount,
    'total_amount',t.total_amount,'currency',t.currency,'payment_method',t.payment_method,
    'crossed_at',t.crossed_at,'missing_evidence_reason',t.missing_evidence_reason,'notes',t.notes,
    'evidence',coalesce((select jsonb_agg(jsonb_build_object(
      'evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,
      'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes
    ) order by e.created_at) from public.remito_evidence e where e.toll_report_id=t.toll_report_id),'[]'::jsonb),
    'review',coalesce((select jsonb_build_object(
      'decision',x.decision,'accepted',x.accepted_snapshot,'reason',x.reason,'reviewed_at',x.reviewed_at
    ) from public.operator_service_document_addon_reviews x where x.toll_report_id=t.toll_report_id),'null'::jsonb)
  ) order by t.created_at),'[]'::jsonb)
  into v_tolls from public.remito_toll_reports t where t.remito_id=p_remito_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_report_id',x.excess_report_id,'client_line_id',x.client_line_id,'concept_id',x.concept_id,
    'concept_name',x.concept_name_snapshot,'quantity',x.quantity,'unit_amount',x.unit_amount,
    'total_amount',x.total_amount,'currency',x.currency,'reason',x.reason,'notes',x.notes,
    'evidence',coalesce((select jsonb_agg(jsonb_build_object(
      'evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,
      'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes
    ) order by e.created_at) from public.remito_evidence e where e.excess_report_id=x.excess_report_id),'[]'::jsonb),
    'review',coalesce((select jsonb_build_object(
      'decision',rv.decision,'accepted',rv.accepted_snapshot,'reason',rv.reason,'reviewed_at',rv.reviewed_at
    ) from public.operator_service_document_addon_reviews rv where rv.excess_report_id=x.excess_report_id),'null'::jsonb)
  ) order by x.created_at),'[]'::jsonb)
  into v_excesses from public.remito_excess_reports x where x.remito_id=p_remito_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,
    'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes
  ) order by e.created_at),'[]'::jsonb)
  into v_general_evidence
  from public.remito_evidence e
  where e.remito_id=p_remito_id and e.toll_report_id is null and e.excess_report_id is null;

  return jsonb_build_object(
    'remito_id',r.remito_id,'remito_number',r.nro_remito,'service_id',r.operator_service_id,
    'addons_version',r.addons_version,'review_status',r.addons_review_status,
    'reported_toll_total',coalesce(r.imp_peaje,0),'reported_excess_total',coalesce(r.imp_excedente,0),
    'accepted_toll_total',r.accepted_imp_peaje,'accepted_excess_total',r.accepted_imp_excedente,
    'accepted_total_extras',r.accepted_imp_total_extras,'reviewed_at',r.addons_reviewed_at,
    'tolls',v_tolls,'excesses',v_excesses,'evidence',v_general_evidence
  );
end;
$function$;
revoke all on function public.get_driver_remito_addons_v2(integer) from public,anon;
grant execute on function public.get_driver_remito_addons_v2(integer) to authenticated;

create or replace function public.get_operator_service_remito_review_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_driver_name text;
  v_company_name text;
  v_report jsonb;
  v_planned_tolls jsonb;
  v_planned_excess jsonb;
  v_toll_catalog jsonb;
  v_concepts jsonb;
begin
  if v_uid is null or v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para revisar remitos';
  end if;
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id=s.remito_id;
  if not found then raise exception 'Remito inexistente'; end if;
  select u.full_name into v_driver_name from public.users u where u.user_id=r.driver_id;
  select coalesce(c.trade_name,c.legal_name) into v_company_name from public.companies c where c.company_id=s.company_id;
  v_report:=public.get_driver_remito_addons_v2(r.remito_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'toll_name',t.toll_name_snapshot,
    'quantity',t.quantity,'unit_amount',t.unit_amount,'total_amount',t.total_amount,'currency',t.currency,
    'payer_agent',t.payer_agent,'customer_payment_method',t.customer_payment_method
  ) order by t.created_at),'[]'::jsonb)
  into v_planned_tolls from public.operator_service_tolls t
  where t.service_id=p_service_id and t.source in ('planned','manual');

  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_charge_id',e.excess_charge_id,'concept_id',e.concept_id,'concept_name',e.concept_name_snapshot,
    'quantity',e.quantity,'unit_amount',e.unit_amount,'total_amount',e.total_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method
  ) order by e.created_at),'[]'::jsonb)
  into v_planned_excess from public.operator_service_excess_charges e
  where e.service_id=p_service_id and e.source in ('planned','manual');

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id',l.toll_id,'name',l.name,'code',l.code,'road',l.road,'direction',l.direction
  ) order by l.name),'[]'::jsonb)
  into v_toll_catalog from public.toll_locations l where l.is_active;

  select coalesce(jsonb_agg(jsonb_build_object('concept_id',c.concept_id,'name',c.name,'code',c.code)
    order by c.sort_order,c.name),'[]'::jsonb)
  into v_concepts from public.service_concepts c
  where c.is_active and c.default_can_be_secondary and c.billing_family<>'system';

  return jsonb_build_object(
    'service',jsonb_build_object(
      'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
      'status',s.status,'document_status',s.document_status,'administrative_review_status',s.administrative_review_status,
      'billing_status',s.billing_status,'company_name',v_company_name,'customer_name',s.customer_name,
      'vehicle_plate',s.vehicle_plate,'origin',s.origin,'destination',s.destination,'scheduled_for',s.scheduled_for,
      'toll_coverage_mode',s.toll_coverage_mode,'invoiced',s.billing_status='invoiced'
    ),
    'remito',jsonb_build_object(
      'remito_id',r.remito_id,'remito_number',r.nro_remito,'status',r.status,'driver_name',v_driver_name,
      'received_at',r.received_at,'signed_at',r.firmado_at,'signature_url',r.firma_imagen_url,
      'km',r.km_reales,'customer_name',r.razon_social,'vehicle_plate',r.patente,
      'origin',r.origen,'destination',r.destino,'observations',r.observaciones,
      'conformity_service',r.conformidad_servicio,'conformity_charges',r.conformidad_cargos,
      'reported_toll_total',coalesce(r.imp_peaje,0),'reported_excess_total',coalesce(r.imp_excedente,0),
      'reported_other_total',coalesce(r.imp_otros,0),'legacy_photos',coalesce(to_jsonb(r.foto_urls),'[]'::jsonb)
    ),
    'reported',v_report,'planned',jsonb_build_object('tolls',v_planned_tolls,'excesses',v_planned_excess),
    'references',jsonb_build_object('tolls',v_toll_catalog,'excess_concepts',v_concepts),
    'can_resolve',v_role='administracion' and s.billing_status<>'invoiced' and s.document_status in ('submitted','approved')
  );
end;
$function$;
revoke all on function public.get_operator_service_remito_review_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_remito_review_v1(uuid) to authenticated;

create or replace function public.list_operator_service_document_connections_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion','operador','supervision','facturacion') then
    raise exception 'Sin permiso para consultar la recepción de remitos';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id',s.service_id,'service_origin',s.service_origin,
    'administrative_review_status',s.administrative_review_status,'document_status',s.document_status,
    'remito_id',s.remito_id,'remito_number',r.nro_remito,'remito_status',r.status,
    'remito_received_at',r.received_at,'remito_addons_version',r.addons_version,
    'remito_addons_review_status',r.addons_review_status,
    'reported_toll_total',coalesce(r.imp_peaje,0),'reported_excess_total',coalesce(r.imp_excedente,0),
    'accepted_toll_total',r.accepted_imp_peaje,'accepted_excess_total',r.accepted_imp_excedente
  )),'[]'::jsonb) into v_result
  from public.operator_services s left join public.remitos r on r.remito_id=s.remito_id;
  return v_result;
end;
$function$;
revoke all on function public.list_operator_service_document_connections_v1() from public,anon;
grant execute on function public.list_operator_service_document_connections_v1() to authenticated;

create or replace function public.resolve_operator_service_document_v2(
  p_service_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_toll_decisions jsonb:=coalesce(p_payload->'tolls','[]'::jsonb);
  v_excess_decisions jsonb:=coalesce(p_payload->'excesses','[]'::jsonb);
  v_row jsonb;
  t public.remito_toll_reports%rowtype;
  x public.remito_excess_reports%rowtype;
  l public.toll_locations%rowtype;
  c public.service_concepts%rowtype;
  v_report_id uuid;
  v_decision text;
  v_reason text;
  v_toll_id uuid;
  v_concept_id uuid;
  v_name text;
  v_qty numeric;
  v_unit numeric;
  v_method text;
  v_payer text;
  v_collector text;
  v_customer_method text;
  v_provider_unit numeric;
  v_customer_unit numeric;
  v_service_toll_id uuid;
  v_excess_charge_id uuid;
  v_changed boolean;
  v_adjusted boolean:=false;
  v_toll_total numeric:=0;
  v_excess_total numeric:=0;
  v_expected integer;
begin
  if v_uid is null or v_role<>'administracion' then raise exception 'Sólo Administración puede resolver la recepción documental'; end if;
  if p_action='approve_missing_remito_exception' then
    return public.resolve_operator_service_document_v1(p_service_id,p_action);
  end if;
  if p_action<>'approve' then raise exception 'Acción documental inválida'; end if;
  if jsonb_typeof(v_toll_decisions)<>'array' or jsonb_typeof(v_excess_decisions)<>'array' then raise exception 'La revisión debe contener listas'; end if;

  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.billing_status='invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id=s.remito_id for update;
  if not found or r.status<>'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado y recibido';
  end if;
  if s.document_status not in ('submitted','approved') then raise exception 'El remito no está pendiente de revisión'; end if;
  if exists(select 1 from public.operator_service_document_addon_reviews rv where rv.service_id=p_service_id and rv.remito_id=r.remito_id) then
    return jsonb_build_object('service_id',s.service_id,'remito_id',r.remito_id,'document_status',s.document_status,
      'review_status',r.addons_review_status,'idempotent',true);
  end if;

  select count(*) into v_expected from public.remito_toll_reports where remito_id=r.remito_id;
  if jsonb_array_length(v_toll_decisions)<>v_expected then raise exception 'Revisá todos los peajes antes de aprobar'; end if;
  select count(*) into v_expected from public.remito_excess_reports where remito_id=r.remito_id;
  if jsonb_array_length(v_excess_decisions)<>v_expected then raise exception 'Revisá todos los excedentes antes de aprobar'; end if;

  for v_row in select value from jsonb_array_elements(v_toll_decisions) loop
    v_report_id:=nullif(v_row->>'toll_report_id','')::uuid;
    select * into t from public.remito_toll_reports where toll_report_id=v_report_id and remito_id=r.remito_id;
    if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
    v_decision:=lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
    v_reason:=nullif(btrim(v_row->>'reason'),'');
    if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de peaje inválida'; end if;
    if v_decision='rejected' then
      if v_reason is null then raise exception 'Explicá por qué se rechaza el peaje'; end if;
      v_adjusted:=true;
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,toll_report_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
      ) values(p_service_id,r.remito_id,t.toll_report_id,'rejected',to_jsonb(t),'{}'::jsonb,v_reason,v_uid,s.is_test);
      continue;
    end if;

    v_toll_id:=nullif(v_row->>'toll_id','')::uuid;
    v_name:=nullif(btrim(v_row->>'toll_name'),'');
    if v_toll_id is not null then
      select * into l from public.toll_locations where toll_id=v_toll_id;
      if not found then raise exception 'Peaje aceptado inexistente'; end if;
      v_name:=l.name;
    elsif v_name is null then raise exception 'Indicá el peaje aceptado';
    end if;
    v_qty:=greatest(coalesce(nullif(v_row->>'quantity','')::numeric,t.quantity),1);
    v_unit:=round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,t.unit_amount),0),2);
    v_method:=lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),t.payment_method));
    if v_method not in ('cash','electronic','telepass','manual','other') then raise exception 'Medio de peaje inválido'; end if;
    v_payer:=lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),'provider'));
    if v_payer not in ('provider','customer') then raise exception 'Responsable comercial de peaje inválido'; end if;
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    if v_payer in ('customer','both') and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then
      raise exception 'Indicá cómo pagó el cliente el peaje';
    end if;
    if v_payer='provider' then v_provider_unit:=v_unit;v_customer_unit:=0;v_customer_method:=null;
    elsif v_payer='customer' then v_provider_unit:=0;v_customer_unit:=v_unit;
    else
      v_provider_unit:=round(greatest(coalesce(nullif(v_row->>'provider_unit_amount','')::numeric,0),0),2);
      v_customer_unit:=round(greatest(coalesce(nullif(v_row->>'customer_unit_amount','')::numeric,0),0),2);
      if round(v_provider_unit+v_customer_unit,2)<>v_unit then raise exception 'La distribución del peaje no coincide con el importe'; end if;
    end if;
    v_changed:=v_toll_id is distinct from t.toll_id or round(v_qty,2) is distinct from t.quantity::numeric
      or v_unit is distinct from t.unit_amount or v_method is distinct from t.payment_method;
    if v_changed or v_decision='adjusted' then
      if v_reason is null then raise exception 'Explicá el ajuste realizado al peaje'; end if;
      v_decision:='adjusted';v_adjusted:=true;
    else v_decision:='accepted'; end if;

    insert into public.operator_service_tolls(
      service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      vehicle_category,payment_method,quantity,unit_amount,currency,source,crossed_at,notes,created_by,updated_by,
      is_test,payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,remito_toll_report_id
    ) values(
      p_service_id,v_toll_id,null,case when v_toll_id is null then t.toll_code_snapshot else l.code end,v_name,
      case when v_toll_id is null then t.road_snapshot else l.road end,
      case when v_toll_id is null then t.direction_snapshot else l.direction end,
      'light_2_axles',case when v_method='other' then 'manual' else v_method end,v_qty::integer,v_unit,t.currency,'actual',
      t.crossed_at,v_reason,v_uid,v_uid,s.is_test,v_payer,v_customer_method,v_provider_unit,v_customer_unit,t.toll_report_id
    ) returning service_toll_id into v_service_toll_id;
    v_toll_total:=v_toll_total+round(v_qty*v_unit,2);
    insert into public.operator_service_document_addon_reviews(
      service_id,remito_id,toll_report_id,decision,original_snapshot,accepted_snapshot,reason,service_toll_id,reviewed_by,is_test
    ) values(
      p_service_id,r.remito_id,t.toll_report_id,v_decision,to_jsonb(t),jsonb_build_object(
        'toll_id',v_toll_id,'toll_name',v_name,'quantity',v_qty,'unit_amount',v_unit,'total_amount',round(v_qty*v_unit,2),
        'currency',t.currency,'payment_method',v_method,'payer_agent',v_payer,'customer_payment_method',v_customer_method,
        'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
      ),v_reason,v_service_toll_id,v_uid,s.is_test
    );
  end loop;

  for v_row in select value from jsonb_array_elements(v_excess_decisions) loop
    v_report_id:=nullif(v_row->>'excess_report_id','')::uuid;
    select * into x from public.remito_excess_reports where excess_report_id=v_report_id and remito_id=r.remito_id;
    if not found then raise exception 'Uno de los excedentes no pertenece al remito'; end if;
    v_decision:=lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
    v_reason:=nullif(btrim(v_row->>'review_reason'),'');
    if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de excedente inválida'; end if;
    if v_decision='rejected' then
      if v_reason is null then raise exception 'Explicá por qué se rechaza el excedente'; end if;
      v_adjusted:=true;
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,excess_report_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
      ) values(p_service_id,r.remito_id,x.excess_report_id,'rejected',to_jsonb(x),'{}'::jsonb,v_reason,v_uid,s.is_test);
      continue;
    end if;
    v_concept_id:=coalesce(nullif(v_row->>'concept_id','')::uuid,x.concept_id);
    select * into c from public.service_concepts
    where concept_id=v_concept_id and is_active and default_can_be_secondary and billing_family<>'system';
    if not found then raise exception 'Seleccioná el concepto comercial del excedente'; end if;
    v_qty:=round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,x.quantity),0.01),2);
    v_unit:=round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,x.unit_amount),0),2);
    if v_unit<=0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
    v_collector:=lower(coalesce(nullif(btrim(v_row->>'collector_agent'),''),'company'));
    if v_collector not in ('company','provider') then raise exception 'Cobrador del excedente inválido'; end if;
    v_customer_method:=nullif(lower(btrim(v_row->>'customer_payment_method')),'');
    if v_collector='company' and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then
      raise exception 'Indicá cómo se cobró el excedente';
    end if;
    if v_collector='provider' then v_customer_method:=null; end if;
    v_changed:=v_concept_id is distinct from x.concept_id or v_qty is distinct from x.quantity or v_unit is distinct from x.unit_amount;
    if v_changed or v_decision='adjusted' then
      if v_reason is null then raise exception 'Explicá el ajuste realizado al excedente'; end if;
      v_decision:='adjusted';v_adjusted:=true;
    else v_decision:='accepted'; end if;

    insert into public.operator_service_excess_charges(
      service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
      customer_payment_method,created_by,updated_by,is_test,source,remito_excess_report_id
    ) values(
      p_service_id,v_concept_id,c.name,v_qty,v_unit,x.currency,'customer',v_collector,v_customer_method,
      v_uid,v_uid,s.is_test,'actual',x.excess_report_id
    ) returning excess_charge_id into v_excess_charge_id;
    v_excess_total:=v_excess_total+round(v_qty*v_unit,2);
    insert into public.operator_service_document_addon_reviews(
      service_id,remito_id,excess_report_id,decision,original_snapshot,accepted_snapshot,reason,excess_charge_id,reviewed_by,is_test
    ) values(
      p_service_id,r.remito_id,x.excess_report_id,v_decision,to_jsonb(x),jsonb_build_object(
        'concept_id',v_concept_id,'concept_name',c.name,'quantity',v_qty,'unit_amount',v_unit,
        'total_amount',round(v_qty*v_unit,2),'currency',x.currency,'collector_agent',v_collector,
        'customer_payment_method',v_customer_method
      ),v_reason,v_excess_charge_id,v_uid,s.is_test
    );
  end loop;

  update public.remitos set
    addons_review_status=case when v_adjusted then 'adjusted' else 'approved' end,
    accepted_imp_peaje=round(v_toll_total,2),accepted_imp_excedente=round(v_excess_total,2),
    accepted_imp_total_extras=round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2),
    addons_reviewed_by=v_uid,addons_reviewed_at=now()
  where remito_id=r.remito_id returning * into r;

  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services set
    document_status='approved',administrative_review_status='approved',
    billing_status=case when status='completed' and billing_status='not_ready' then 'pending' else billing_status end,
    updated_by=v_uid,updated_at=now()
  where service_id=p_service_id returning * into s;

  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'remito_addons_reviewed',s.status,s.status,
    case when v_adjusted then 'Administración aprobó el remito con ajustes' else 'Administración aprobó el remito informado' end,
    v_uid,jsonb_build_object('remito_id',r.remito_id,'review_status',r.addons_review_status,
      'reported_toll_total',coalesce(r.imp_peaje,0),'accepted_toll_total',v_toll_total,
      'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_excess_total',v_excess_total));

  return jsonb_build_object('service_id',s.service_id,'remito_id',r.remito_id,'document_status',s.document_status,
    'billing_status',s.billing_status,'review_status',r.addons_review_status,'accepted_toll_total',round(v_toll_total,2),
    'accepted_excess_total',round(v_excess_total,2),'idempotent',false);
end;
$function$;
revoke all on function public.resolve_operator_service_document_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.resolve_operator_service_document_v2(uuid,text,jsonb) to authenticated;

-- La edición administrativa conserva las filas reales provenientes del remito.
create or replace function app_private.persist_service_commercial_addons_v1(
  p_service_id uuid,
  p_normalized jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
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

  delete from public.operator_service_excess_charges where service_id=p_service_id and source in ('planned','manual');
  for v_row in select value from jsonb_array_elements(coalesce(p_normalized->'excess_charges','[]'::jsonb)) loop
    insert into public.operator_service_excess_charges(
      service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
      customer_payment_method,created_by,updated_by,is_test,source
    ) values(
      p_service_id,(v_row->>'concept_id')::uuid,v_row->>'concept_name',(v_row->>'quantity')::numeric,(v_row->>'unit_amount')::numeric,
      v_row->>'currency','customer',v_row->>'collector_agent',nullif(v_row->>'customer_payment_method',''),v_uid,v_uid,v_service.is_test,'planned'
    );
  end loop;
end;
$function$;
revoke all on function app_private.persist_service_commercial_addons_v1(uuid,jsonb) from public,anon,authenticated;

create or replace function public.get_operator_service_commercial_addons_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_tolls jsonb;
  v_excess jsonb;
  v_actual_tolls jsonb;
  v_actual_excess jsonb;
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar peajes y excedentes'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,'quantity',t.quantity,
    'payer_agent',coalesce(t.payer_agent,'provider'),'customer_payment_method',t.customer_payment_method,
    'unit_amount',t.unit_amount,'currency',t.currency
  )) order by t.created_at),'[]'::jsonb) into v_tolls
  from public.operator_service_tolls t where t.service_id=p_service_id and t.source in ('planned','manual') and t.toll_id is not null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',e.concept_id,'quantity',e.quantity,'unit_amount',e.unit_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method
  ) order by e.created_at),'[]'::jsonb) into v_excess
  from public.operator_service_excess_charges e where e.service_id=p_service_id and e.source in ('planned','manual');
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'toll_name',t.toll_name_snapshot,'quantity',t.quantity,
    'unit_amount',t.unit_amount,'total_amount',t.total_amount,'currency',t.currency,'payer_agent',t.payer_agent,
    'customer_payment_method',t.customer_payment_method,'crossed_at',t.crossed_at,'source',t.source
  ) order by t.created_at),'[]'::jsonb) into v_actual_tolls
  from public.operator_service_tolls t where t.service_id=p_service_id and t.source='actual';
  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_charge_id',e.excess_charge_id,'concept_id',e.concept_id,'concept_name',e.concept_name_snapshot,
    'quantity',e.quantity,'unit_amount',e.unit_amount,'total_amount',e.total_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method,'source',e.source
  ) order by e.created_at),'[]'::jsonb) into v_actual_excess
  from public.operator_service_excess_charges e where e.service_id=p_service_id and e.source='actual';
  return jsonb_build_object(
    'toll_coverage_mode',coalesce(v_service.toll_coverage_mode,case when jsonb_array_length(v_tolls)>0 then 'provider_roundtrip' end),
    'tolls',v_tolls,'excess_charges',v_excess,'actual_tolls',v_actual_tolls,'actual_excess_charges',v_actual_excess
  );
end;
$function$;
revoke all on function public.get_operator_service_commercial_addons_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_commercial_addons_v1(uuid) to authenticated,service_role;

create or replace function app_private.calculate_operator_service_billing_quote_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  s public.operator_services%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_toll_rows integer:=0;
  v_toll_input numeric:=0;
  v_use_actual boolean:=false;
  v_asphalt numeric:=0;
  v_gravel numeric:=0;
  v_service_quote jsonb;
  v_quote_with_legacy_toll jsonb;
  v_setting public.company_billing_settings%rowtype;
  v_service_amount numeric:=0;
  v_current numeric:=0;
  v_stored_raw numeric:=0;
  v_stored_toll numeric:=0;
  v_stored_toll_input numeric:=0;
  v_stored_service_amount numeric:=0;
  v_stored_amount numeric:=0;
  v_effective_toll numeric:=0;
  v_legacy_priced_toll numeric:=0;
  v_toll_billing_mode text:='with_service';
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' then raise exception 'Sólo los servicios FINALIZADOS pueden ingresar a Facturación'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('concept_id',i.concept_id,'quantity',i.quantity) order by i.sort_order,i.created_at),'[]'::jsonb)
    into v_items from public.operator_service_items i where i.service_id=p_service_id and i.item_role='secondary';

  select exists(
    select 1 from public.remitos r where r.remito_id=s.remito_id and r.addons_version=2
      and r.addons_review_status in ('approved','adjusted') and s.document_status='approved'
  ) into v_use_actual;
  select count(*),coalesce(sum(case
      when t.payer_agent='provider' then t.total_amount
      when t.payer_agent='both' then coalesce(t.provider_unit_amount,0)*t.quantity
      else 0 end),0)
    into v_toll_rows,v_toll_input
  from public.operator_service_tolls t
  where t.service_id=p_service_id and (
    (v_use_actual and t.source='actual') or (not v_use_actual and t.source in ('planned','manual'))
  );
  if not v_use_actual and v_toll_rows=0 then
    v_toll_input:=coalesce(nullif(s.pricing_snapshot->>'toll_input','')::numeric,0);
  end if;

  if coalesce(s.estimated_asphalt_km,0)+coalesce(s.estimated_gravel_km,0)>0 then
    v_asphalt:=coalesce(s.estimated_asphalt_km,0);v_gravel:=coalesce(s.estimated_gravel_km,0);
  else
    v_asphalt:=coalesce(nullif(s.pricing_snapshot->>'distance_km','')::numeric,s.estimated_distance_km,0);v_gravel:=0;
  end if;
  select bs.* into v_setting from public.company_billing_settings bs
  where bs.company_id=s.company_id and bs.is_active
    and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
    and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
    and (bs.contract_id is null or bs.contract_id=s.contract_id)
  order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc limit 1;
  if not found then raise exception 'La prestadora no tiene parámetros de facturación vigentes'; end if;
  v_toll_billing_mode:=coalesce(v_setting.toll_billing_mode,'with_service');
  v_service_quote:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,v_asphalt,v_gravel,0,s.is_holiday
  );
  v_quote_with_legacy_toll:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,v_asphalt,v_gravel,v_toll_input,s.is_holiday
  );
  v_legacy_priced_toll:=coalesce((v_quote_with_legacy_toll->>'toll_total')::numeric,0);
  v_effective_toll:=case when v_setting.toll_calculation_mode='not_applicable' then 0
    when v_legacy_priced_toll>0 then v_legacy_priced_toll else greatest(v_toll_input,0) end;
  v_service_amount:=coalesce((v_service_quote->>'company_estimated_total')::numeric,0);
  v_current:=v_service_amount+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end;
  v_stored_raw:=coalesce(nullif(s.pricing_snapshot->>'company_estimated_total','')::numeric,s.company_estimated_total,0);
  v_stored_toll:=coalesce(nullif(s.pricing_snapshot->>'toll_total','')::numeric,0);
  v_stored_toll_input:=case when v_setting.toll_calculation_mode='not_applicable' then 0
    when v_stored_toll>0 then v_stored_toll else coalesce(nullif(s.pricing_snapshot->>'toll_input','')::numeric,0) end;
  v_stored_service_amount:=greatest(v_stored_raw-v_stored_toll,0);
  v_stored_amount:=v_stored_service_amount+case when v_toll_billing_mode='with_service' then v_stored_toll_input else 0 end;
  return v_service_quote||jsonb_build_object(
    'service_id',s.service_id,'service_number',s.service_number,'toll_billing_mode',v_toll_billing_mode,
    'toll_source',case when v_use_actual then 'actual' else 'planned' end,'toll_total',round(v_effective_toll,2),
    'included_toll_amount',case when v_toll_billing_mode='with_service' then round(v_effective_toll,2) else 0 end,
    'separate_toll_amount',case when v_toll_billing_mode='separate' then round(v_effective_toll,2) else 0 end,
    'service_company_amount',round(v_service_amount,2),'company_amount_with_tolls',round(v_service_amount+v_effective_toll,2),
    'stored_company_amount',round(v_stored_amount,2),'current_company_amount',round(v_current,2),
    'company_estimated_total',round(v_current,2),
    'estimated_total',round(coalesce((v_service_quote->>'estimated_total')::numeric,0)+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end,2),
    'billing_delta',round(v_current-v_stored_amount,2),'billing_source','current_tariff_period',
    'operational_snapshot_calculated_at',s.pricing_snapshot->>'calculated_at'
  );
end;
$function$;
revoke all on function app_private.calculate_operator_service_billing_quote_v2(uuid) from public,anon,authenticated;

create or replace function app_private.assert_operator_invoice_toll_precedence_v1(p_service_toll_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_bad record;
begin
  if coalesce(cardinality(p_service_toll_ids),0)=0 then return; end if;

  select s.service_number,t.source,r.addons_review_status into v_bad
  from unnest(p_service_toll_ids) selected(service_toll_id)
  join public.operator_service_tolls t on t.service_toll_id=selected.service_toll_id
  join public.operator_services s on s.service_id=t.service_id
  left join public.remitos r on r.remito_id=s.remito_id
  where (
    r.addons_version=2 and r.addons_review_status in ('approved','adjusted')
    and s.document_status='approved' and t.source<>'actual'
  ) or (
    t.source='actual' and not(
      r.addons_version=2 and r.addons_review_status in ('approved','adjusted')
      and s.document_status='approved'
    )
  )
  limit 1;
  if found then
    raise exception 'El peaje del servicio % no coincide con la versión aprobada del remito',v_bad.service_number;
  end if;
end;
$function$;
revoke all on function app_private.assert_operator_invoice_toll_precedence_v1(uuid[]) from public,anon,authenticated;

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

  perform app_private.assert_operator_invoice_toll_precedence_v1(coalesce(p_service_toll_ids,'{}'::uuid[]));
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
    left join public.remitos r on r.remito_id=s.remito_id
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
      and (
        (r.addons_version=2 and r.addons_review_status in ('approved','adjusted') and s.document_status='approved' and t.source='actual')
        or (not(r.addons_version=2 and r.addons_review_status in ('approved','adjusted') and s.document_status='approved') and t.source in ('planned','manual'))
      )
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

create or replace function app_private.operator_service_uses_actual_addons_v1(p_service_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1
    from public.operator_services s
    join public.remitos r on r.remito_id=s.remito_id
    where s.service_id=p_service_id and s.document_status='approved'
      and r.addons_version=2 and r.addons_review_status in ('approved','adjusted')
  );
$function$;
revoke all on function app_private.operator_service_uses_actual_addons_v1(uuid) from public,anon,authenticated;

create or replace function public.list_operator_services(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,300),1),1000);
  v_result jsonb;
begin
  if v_role in ('administracion','facturacion') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,
        to_jsonb(s)||jsonb_build_object(
          'company_name',coalesce(c.trade_name,c.legal_name),
          'billing_base_id',s.billing_base_id,
          'branch_id',coalesce(s.billing_base_id,s.branch_id),
          'branch_name',coalesce(bb.name,lb.name),
          'billing_base_name',coalesce(bb.name,lb.name),
          'concept_name',sc.name,
          'concept_icon',sc.icon,
          'driver_name',du.full_name,
          'truck_label',coalesce(t.numero_interno,t.plate),
          'customer_amount_due',coalesce(excess.amount_due,0),
          'customer_payment_methods',coalesce(excess.payment_methods,array[]::text[])
        ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join public.users du on du.user_id=s.assigned_driver_id
      left join public.trucks t on t.truck_id=s.assigned_truck_id
      left join lateral (
        select
          coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(
            array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
              filter (where oe.customer_payment_method is not null),
            array[]::text[]
          ) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual'))
        )
      ) excess on true
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  elsif v_role in ('operador','supervision') then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,jsonb_build_object(
        'service_id',s.service_id,'service_number',s.service_number,'status',s.status,
        'priority',s.priority,'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name),
        'billing_base_id',s.billing_base_id,
        'branch_id',coalesce(s.billing_base_id,s.branch_id),
        'branch_name',coalesce(bb.name,lb.name),
        'billing_base_name',coalesce(bb.name,lb.name),
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'estimated_arrival_at',s.estimated_arrival_at,
        'estimated_finish_at',s.estimated_finish_at,
        'granted_delay_minutes',s.granted_delay_minutes,
        'logistics_type',s.logistics_type,
        'vehicle_plate',s.vehicle_plate,
        'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,
        'origin_formatted_address',s.origin_formatted_address,
        'destination_formatted_address',s.destination_formatted_address,
        'origin_place_id',s.origin_place_id,'destination_place_id',s.destination_place_id,
        'primary_concept_id',s.primary_concept_id,
        'concept_name',sc.name,'concept_icon',sc.icon,
        'assigned_driver_id',s.assigned_driver_id,'assigned_truck_id',s.assigned_truck_id,
        'driver_name',du.full_name,'truck_label',coalesce(t.numero_interno,t.plate),
        'estimated_distance_km',s.estimated_distance_km,
        'driver_instructions',s.driver_instructions,'operator_notes',s.operator_notes,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,
        'created_at',s.created_at,'updated_at',s.updated_at,
        'customer_amount_due',coalesce(excess.amount_due,0),
        'customer_payment_methods',coalesce(excess.payment_methods,array[]::text[])
      ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join public.users du on du.user_id=s.assigned_driver_id
      left join public.trucks t on t.truck_id=s.assigned_truck_id
      left join lateral (
        select
          coalesce(sum(oe.total_amount),0) amount_due,
          coalesce(
            array_agg(distinct oe.customer_payment_method order by oe.customer_payment_method)
              filter (where oe.customer_payment_method is not null),
            array[]::text[]
          ) payment_methods
        from public.operator_service_excess_charges oe
        where oe.service_id=s.service_id and (
          (app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source='actual')
          or (not app_private.operator_service_uses_actual_addons_v1(s.service_id) and oe.source in ('planned','manual'))
        )
      ) excess on true
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  elsif v_role='chofer' then
    select coalesce(jsonb_agg(row_data order by scheduled_for desc),'[]'::jsonb) into v_result
    from (
      select s.scheduled_for,jsonb_build_object(
        'service_id',s.service_id,'service_number',s.service_number,'status',s.status,
        'priority',s.priority,'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name),
        'billing_base_id',s.billing_base_id,
        'branch_id',coalesce(s.billing_base_id,s.branch_id),
        'branch_name',coalesce(bb.name,lb.name),'billing_base_name',coalesce(bb.name,lb.name),
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'estimated_arrival_at',s.estimated_arrival_at,
        'estimated_finish_at',s.estimated_finish_at,
        'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,
        'origin_formatted_address',s.origin_formatted_address,
        'destination_formatted_address',s.destination_formatted_address,
        'primary_concept_id',s.primary_concept_id,
        'concept_name',sc.name,'concept_icon',sc.icon,
        'assigned_driver_id',s.assigned_driver_id,'assigned_truck_id',s.assigned_truck_id,
        'truck_label',coalesce(t.numero_interno,t.plate),
        'driver_instructions',s.driver_instructions,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,
        'created_at',s.created_at,'updated_at',s.updated_at
      ) row_data
      from public.operator_services s
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases bb on bb.base_id=s.billing_base_id
      left join public.company_branches lb on lb.branch_id=s.branch_id
      left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
      left join public.trucks t on t.truck_id=s.assigned_truck_id
      where s.assigned_driver_id=v_uid
      order by s.scheduled_for desc
      limit v_limit
    ) q;
  else
    raise exception 'Sin permiso para consultar servicios';
  end if;
  return v_result;
end;
$function$;
revoke all on function public.list_operator_services(integer) from public,anon;
grant execute on function public.list_operator_services(integer) to authenticated,service_role;

create or replace function app_private.capture_legacy_remito_addons_v2(p_remito_id integer)
returns void
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  r public.remitos%rowtype;
  s public.operator_services%rowtype;
  v_is_test boolean:=false;
  v_has_toll boolean:=false;
  v_has_excess boolean:=false;
begin
  select * into r from public.remitos where remito_id=p_remito_id for update;
  if not found or r.driver_id is null or r.addons_version<>1 then return; end if;
  if exists(select 1 from public.operator_service_document_addon_reviews x where x.remito_id=p_remito_id) then return; end if;
  if exists(select 1 from public.remito_toll_reports t where t.remito_id=p_remito_id and coalesce(t.notes,'')<>'legacy_scalar_v1')
    or exists(select 1 from public.remito_excess_reports x where x.remito_id=p_remito_id and coalesce(x.notes,'')<>'legacy_scalar_v1') then return;
  end if;

  -- El historial sin servicio conserva el fallback escalar. Sólo los remitos
  -- conectados y aún no facturados requieren clasificación administrativa.
  if r.operator_service_id is null then return; end if;
  select * into s from public.operator_services where service_id=r.operator_service_id;
  if not found or s.billing_status='invoiced' then return; end if;
  v_is_test:=s.is_test;

  delete from public.remito_toll_reports where remito_id=p_remito_id and notes='legacy_scalar_v1';
  delete from public.remito_excess_reports where remito_id=p_remito_id and notes='legacy_scalar_v1';

  if coalesce(r.imp_peaje,0)>0 then
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_name_snapshot,quantity,unit_amount,currency,payment_method,
      missing_evidence_reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total de peajes legado',1,r.imp_peaje,'ARS','manual',
      'Carga histórica sin comprobante estructurado','legacy_scalar_v1',r.driver_id,v_is_test
    );
    v_has_toll:=true;
  end if;
  if coalesce(r.imp_excedente,0)>0 then
    insert into public.remito_excess_reports(
      remito_id,client_line_id,concept_name_snapshot,quantity,unit_amount,currency,reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total de excedentes legado',1,r.imp_excedente,'ARS',
      'Carga histórica pendiente de clasificación','legacy_scalar_v1',r.driver_id,v_is_test
    );
    v_has_excess:=true;
  end if;
  if r.status='firmado' and not v_has_toll and not v_has_excess then
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_name_snapshot,quantity,unit_amount,currency,payment_method,
      missing_evidence_reason,notes,created_by,is_test
    ) values(
      r.remito_id,gen_random_uuid(),'Total legado informado sin extras',1,0,'ARS','manual',
      'Carga histórica sin comprobante estructurado','legacy_scalar_v1',r.driver_id,v_is_test
    );
  end if;

  update public.remitos
  set addons_version=2,
      addons_review_status=case when status='firmado' then 'pending' else 'draft' end
  where remito_id=p_remito_id;
end;
$function$;
revoke all on function app_private.capture_legacy_remito_addons_v2(integer) from public,anon,authenticated;

create or replace function app_private.capture_legacy_remito_addons_trigger_v2()
returns trigger
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
begin
  perform app_private.capture_legacy_remito_addons_v2(new.remito_id);
  return new;
end;
$function$;

drop trigger if exists trg_capture_legacy_remito_addons_v2 on public.remitos;
create trigger trg_capture_legacy_remito_addons_v2
after insert or update of imp_peaje,imp_excedente,status on public.remitos
for each row execute function app_private.capture_legacy_remito_addons_trigger_v2();

do $backfill$
declare
  v_remito_id integer;
begin
  for v_remito_id in
    select r.remito_id
    from public.remitos r
    left join public.operator_services s on s.service_id=r.operator_service_id
    where r.status='firmado' and r.driver_id is not null and r.addons_version=1
      and r.operator_service_id is not null
      and coalesce(s.billing_status,'not_ready')<>'invoiced'
  loop
    perform app_private.capture_legacy_remito_addons_v2(v_remito_id);
  end loop;
end;
$backfill$;
