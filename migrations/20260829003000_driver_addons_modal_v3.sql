-- AuxiliOS · Remito del Chofer · peajes/excedentes definitivos por línea

alter table public.remito_toll_reports
  add column if not exists customer_payment_method text;
alter table public.remito_excess_reports
  add column if not exists customer_payment_method text;

alter table public.remito_toll_reports
  drop constraint if exists remito_toll_reports_customer_payment_chk;
alter table public.remito_toll_reports
  add constraint remito_toll_reports_customer_payment_chk
  check(customer_payment_method is null or customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected'));

alter table public.remito_excess_reports
  drop constraint if exists remito_excess_reports_customer_payment_chk;
alter table public.remito_excess_reports
  add constraint remito_excess_reports_customer_payment_chk
  check(customer_payment_method is null or customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected'));

create or replace function public.get_driver_remito_reference_v2(p_service_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text:=app_private.current_auxilios_role();
  v_date date:=current_date;
  v_company_id uuid;
  v_tolls jsonb;
  v_concepts jsonb;
begin
  if v_uid is null or v_role<>'chofer' then raise exception 'Sólo el Chofer puede consultar referencias del remito'; end if;
  if p_service_id is not null then
    select (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date,s.company_id
      into v_date,v_company_id
    from public.operator_services s
    where s.service_id=p_service_id and s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin','arrived');
    if not found then raise exception 'El servicio no está disponible para este Chofer'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,
    'rate_id',r.toll_rate_id,'reference_amount',r.amount,'currency',coalesce(r.currency,'ARS')
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
  where c.is_active and c.billing_family<>'system' and coalesce(c.matrix_visible,true)
    and c.service_category in ('secondary','mixed')
    and (
      v_company_id is null
      or exists(
        select 1 from public.company_service_settings css
        where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled
      )
    );

  return jsonb_build_object(
    'version',2,'service_id',p_service_id,'company_id',v_company_id,
    'excess_scope',case when v_company_id is null then 'global' else 'company' end,
    'tolls',v_tolls,'excess_concepts',v_concepts,
    'payment_methods',jsonb_build_array('cash','transfer','card','mercado_pago','other','not_collected'),
    'evidence',jsonb_build_object('bucket','remito-evidence-v2','max_bytes',10485760,
      'mime_types',jsonb_build_array('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'))
  );
end;
$function$;
revoke all on function public.get_driver_remito_reference_v2(uuid) from public,anon;
grant execute on function public.get_driver_remito_reference_v2(uuid) to authenticated;

create or replace function app_private.persist_driver_remito_addons_v3(
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
  v_company_id uuid;
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
    select s.company_id,coalesce(s.is_test,false) into v_company_id,v_is_test
    from public.operator_services s where s.service_id=r.operator_service_id;
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
    v_method:=lower(nullif(btrim(coalesce(v_row->>'customer_payment_method',v_row->>'payment_method')),''));
    if v_line_id is null then raise exception 'Cada peaje necesita identificador'; end if;
    if v_toll_id is null then raise exception 'Seleccioná un peaje habilitado'; end if;
    if v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el peaje'; end if;
    select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
    if not found then raise exception 'Uno de los peajes ya no está activo'; end if;
    if coalesce(nullif(v_row->>'unit_amount','')::numeric,0)<=0 then raise exception 'El importe del peaje debe ser mayor a cero'; end if;
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      quantity,unit_amount,currency,payment_method,customer_payment_method,crossed_at,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_toll_id,v_toll.code,v_toll.name,v_toll.road,v_toll.direction,
      1,round((v_row->>'unit_amount')::numeric,2),upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),
      'manual',v_method,r.created_at_device,p_uid,v_is_test
    );
  end loop;

  for v_row in select value from jsonb_array_elements(v_excesses) loop
    v_line_id:=nullif(v_row->>'client_line_id','')::uuid;
    v_concept_id:=nullif(v_row->>'concept_id','')::uuid;
    v_method:=lower(nullif(btrim(coalesce(v_row->>'customer_payment_method',v_row->>'payment_method')),''));
    if v_line_id is null then raise exception 'Cada excedente necesita identificador'; end if;
    if v_concept_id is null then raise exception 'Seleccioná un excedente habilitado'; end if;
    if v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el excedente'; end if;
    select * into v_concept from public.service_concepts c
    where c.concept_id=v_concept_id and c.is_active and c.billing_family<>'system'
      and coalesce(c.matrix_visible,true) and c.service_category in ('secondary','mixed')
      and (v_company_id is null or exists(
        select 1 from public.company_service_settings css
        where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled
      ));
    if not found then raise exception 'Uno de los excedentes ya no está habilitado'; end if;
    if coalesce(nullif(v_row->>'unit_amount','')::numeric,0)<=0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
    insert into public.remito_excess_reports(
      remito_id,client_line_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,
      customer_payment_method,reason,notes,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_concept_id,v_concept.name,1,round((v_row->>'unit_amount')::numeric,2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),v_method,v_concept.name,null,p_uid,v_is_test
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

  select coalesce(sum(total_amount),0) into v_toll_total from public.remito_toll_reports where remito_id=p_remito_id;
  select coalesce(sum(total_amount),0) into v_excess_total from public.remito_excess_reports where remito_id=p_remito_id;
  update public.remitos set addons_version=2,
    addons_review_status=case when status='firmado' then 'pending' else 'draft' end,
    imp_peaje=round(v_toll_total,2),imp_excedente=round(v_excess_total,2),imp_total_extras=default
  where remito_id=p_remito_id;
  return jsonb_build_object('addons_version',2,'review_status',case when r.status='firmado' then 'pending' else 'draft' end,
    'toll_total',round(v_toll_total,2),'excess_total',round(v_excess_total,2));
end;
$function$;
revoke all on function app_private.persist_driver_remito_addons_v3(integer,jsonb,uuid) from public,anon,authenticated;

create or replace function public.save_driver_operator_service_remito_v4(p_service_id uuid,p_payload jsonb,p_client_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $function$
declare v_uid uuid:=auth.uid();v_result jsonb;v_addons jsonb;
begin
  if v_uid is null or app_private.current_auxilios_role()<>'chofer' then raise exception 'Sólo el Chofer puede guardar el remito'; end if;
  if coalesce(nullif(p_payload->>'addons_version','')::integer,0)<>2 then raise exception 'Versión de peajes y excedentes inválida'; end if;
  select public.save_driver_operator_service_remito_v3(p_service_id,p_payload,p_client_operation_id) into v_result;
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result||jsonb_build_object('addons_version',2); end if;
  v_addons:=app_private.persist_driver_remito_addons_v3((v_result->>'remito_id')::integer,p_payload,v_uid);
  return v_result||v_addons;
end;$function$;
revoke all on function public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_driver_operator_service_remito_v4(uuid,jsonb,uuid) to authenticated;

create or replace function public.save_driver_ad_hoc_remito_v2(p_payload jsonb,p_client_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $function$
declare v_uid uuid:=auth.uid();v_result jsonb;v_addons jsonb;
begin
  if v_uid is null or app_private.current_auxilios_role()<>'chofer' then raise exception 'Sólo el Chofer puede guardar el remito'; end if;
  if coalesce(nullif(p_payload->>'addons_version','')::integer,0)<>2 then raise exception 'Versión de peajes y excedentes inválida'; end if;
  select public.save_driver_ad_hoc_remito_v1(p_payload,p_client_operation_id) into v_result;
  if coalesce((v_result->>'idempotent')::boolean,false) then return v_result||jsonb_build_object('addons_version',2); end if;
  v_addons:=app_private.persist_driver_remito_addons_v3((v_result->>'remito_id')::integer,p_payload,v_uid);
  return v_result||v_addons;
end;$function$;
revoke all on function public.save_driver_ad_hoc_remito_v2(jsonb,uuid) from public,anon;
grant execute on function public.save_driver_ad_hoc_remito_v2(jsonb,uuid) to authenticated;

create or replace function public.get_driver_remito_addons_v2(p_remito_id integer)
returns jsonb language plpgsql security definer set search_path=public,app_private,pg_temp as $function$
declare v_uid uuid:=auth.uid();v_role text:=app_private.current_auxilios_role();r public.remitos%rowtype;v_tolls jsonb;v_excesses jsonb;v_general_evidence jsonb;
begin
  if v_uid is null then raise exception 'Sesión requerida'; end if;
  select * into r from public.remitos where remito_id=p_remito_id;
  if not found then raise exception 'Remito inexistente'; end if;
  if r.driver_id is distinct from v_uid and v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar el remito'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_report_id',t.toll_report_id,'client_line_id',t.client_line_id,'toll_id',t.toll_id,'toll_code',t.toll_code_snapshot,
    'toll_name',t.toll_name_snapshot,'road',t.road_snapshot,'direction',t.direction_snapshot,'quantity',t.quantity,
    'unit_amount',t.unit_amount,'total_amount',t.total_amount,'currency',t.currency,'payment_method',t.payment_method,
    'customer_payment_method',t.customer_payment_method,'crossed_at',t.crossed_at,'missing_evidence_reason',t.missing_evidence_reason,'notes',t.notes,
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes) order by e.created_at) from public.remito_evidence e where e.toll_report_id=t.toll_report_id),'[]'::jsonb),
    'review',coalesce((select jsonb_build_object('decision',x.decision,'accepted',x.accepted_snapshot,'reason',x.reason,'reviewed_at',x.reviewed_at) from public.operator_service_document_addon_reviews x where x.toll_report_id=t.toll_report_id),'null'::jsonb)
  ) order by t.created_at),'[]'::jsonb) into v_tolls from public.remito_toll_reports t where t.remito_id=p_remito_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_report_id',x.excess_report_id,'client_line_id',x.client_line_id,'concept_id',x.concept_id,'concept_name',x.concept_name_snapshot,
    'quantity',x.quantity,'unit_amount',x.unit_amount,'total_amount',x.total_amount,'currency',x.currency,'reason',x.reason,
    'customer_payment_method',x.customer_payment_method,'notes',x.notes,
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes) order by e.created_at) from public.remito_evidence e where e.excess_report_id=x.excess_report_id),'[]'::jsonb),
    'review',coalesce((select jsonb_build_object('decision',rv.decision,'accepted',rv.accepted_snapshot,'reason',rv.reason,'reviewed_at',rv.reviewed_at) from public.operator_service_document_addon_reviews rv where rv.excess_report_id=x.excess_report_id),'null'::jsonb)
  ) order by x.created_at),'[]'::jsonb) into v_excesses from public.remito_excess_reports x where x.remito_id=p_remito_id;
  select coalesce(jsonb_agg(jsonb_build_object('evidence_id',e.evidence_id,'kind',e.evidence_kind,'bucket',e.storage_bucket,'path',e.storage_path,'mime_type',e.mime_type,'original_name',e.original_name,'size_bytes',e.size_bytes) order by e.created_at),'[]'::jsonb)
    into v_general_evidence from public.remito_evidence e where e.remito_id=p_remito_id and e.toll_report_id is null and e.excess_report_id is null;
  return jsonb_build_object('remito_id',r.remito_id,'remito_number',r.nro_remito,'service_id',r.operator_service_id,
    'addons_version',r.addons_version,'review_status',r.addons_review_status,'reported_toll_total',coalesce(r.imp_peaje,0),
    'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_toll_total',r.accepted_imp_peaje,
    'accepted_excess_total',r.accepted_imp_excedente,'accepted_total_extras',r.accepted_imp_total_extras,
    'reviewed_at',r.addons_reviewed_at,'tolls',v_tolls,'excesses',v_excesses,'evidence',v_general_evidence);
end;$function$;
revoke all on function public.get_driver_remito_addons_v2(integer) from public,anon;
grant execute on function public.get_driver_remito_addons_v2(integer) to authenticated;
