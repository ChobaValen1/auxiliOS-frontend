-- AuxiliOS · Remito del Chofer · importes automáticos y un único medio por selección

alter table public.remito_excess_reports
  drop constraint if exists remito_excess_reports_amount_chk;
alter table public.remito_excess_reports
  add constraint remito_excess_reports_amount_chk check(unit_amount >= 0);

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
  v_billing_base_id uuid;
  v_category_id uuid;
  v_currency text:='ARS';
  v_tolls jsonb;
  v_concepts jsonb;
begin
  if v_uid is null or v_role<>'chofer' then raise exception 'Sólo el Chofer puede consultar referencias del remito'; end if;
  if p_service_id is not null then
    select coalesce((s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date,current_date),
      s.company_id,s.billing_base_id,s.category_id,coalesce(s.currency,'ARS')
      into v_date,v_company_id,v_billing_base_id,v_category_id,v_currency
    from public.operator_services s
    where s.service_id=p_service_id and s.assigned_driver_id=v_uid and s.status in ('assigned','at_origin','arrived');
    if not found then raise exception 'El servicio no está disponible para este Chofer'; end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,
    'rate_id',r.toll_rate_id,'reference_amount',r.amount,'price_source','toll_rate',
    'currency',coalesce(r.currency,'ARS')
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
    'concept_id',c.concept_id,'code',c.code,'name',c.name,'quantity_source',c.quantity_source,
    'reference_amount',coalesce(nullif(p.amount,0),nullif(m.unit_price,0)),
    'price_source',case when coalesce(p.amount,0)>0 then 'planned' when coalesce(m.unit_price,0)>0 then 'tariff' else 'pending' end,
    'currency',coalesce(m.currency,v_currency,'ARS')
  ) order by c.sort_order,c.name),'[]'::jsonb)
  into v_concepts
  from public.service_concepts c
  left join lateral(
    select sum(i.subtotal) amount
    from public.operator_service_items i
    where p_service_id is not null and i.service_id=p_service_id and i.concept_id=c.concept_id and i.item_role='secondary'
  ) p on true
  left join lateral(
    select x.unit_price,x.currency
    from public.company_tariff_matrix_rates x
    where v_company_id is not null and x.company_id=v_company_id and x.concept_id=c.concept_id
      and x.billing_base_id is not distinct from v_billing_base_id
      and x.category_id is not distinct from v_category_id
      and x.is_current and x.valid_from<=v_date and (x.valid_until is null or x.valid_until>=v_date)
    order by x.valid_from desc,x.revision desc limit 1
  ) m on true
  where c.is_active and c.billing_family<>'system' and coalesce(c.matrix_visible,true)
    and c.service_category in ('secondary','mixed')
    and (v_company_id is null or exists(
      select 1 from public.company_service_settings css
      where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled
    ));

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
revoke all on function public.get_driver_remito_reference_v2(uuid) from public,anon,authenticated;
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
  v_billing_base_id uuid;
  v_category_id uuid;
  v_service_date date;
  v_service_currency text:='ARS';
  v_amount numeric;
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
  v_service_date:=coalesce((r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date,current_date);
  if r.operator_service_id is not null then
    select s.company_id,coalesce(s.is_test,false),s.billing_base_id,s.category_id,
      coalesce((s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date,v_service_date),coalesce(s.currency,'ARS')
      into v_company_id,v_is_test,v_billing_base_id,v_category_id,v_service_date,v_service_currency
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
    select tr.amount into v_amount from public.toll_rates tr
    where tr.toll_id=v_toll_id and tr.is_active and tr.vehicle_category='light_2_axles'
      and tr.valid_from<=v_service_date and (tr.valid_until is null or tr.valid_until>=v_service_date)
    order by (tr.payment_method='any') desc,tr.valid_from desc,tr.created_at desc limit 1;
    if coalesce(v_amount,0)<=0 then raise exception 'Uno de los peajes no tiene tarifa vigente'; end if;
    insert into public.remito_toll_reports(
      remito_id,client_line_id,toll_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      quantity,unit_amount,currency,payment_method,customer_payment_method,crossed_at,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_toll_id,v_toll.code,v_toll.name,v_toll.road,v_toll.direction,
      1,round(v_amount,2),upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),
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
    v_amount:=null;
    if r.operator_service_id is not null then
      select sum(i.subtotal) into v_amount from public.operator_service_items i
      where i.service_id=r.operator_service_id and i.concept_id=v_concept_id and i.item_role='secondary';
      if coalesce(v_amount,0)<=0 then
        select x.unit_price into v_amount from public.company_tariff_matrix_rates x
        where x.company_id=v_company_id and x.concept_id=v_concept_id
          and x.billing_base_id is not distinct from v_billing_base_id
          and x.category_id is not distinct from v_category_id
          and x.is_current and x.valid_from<=v_service_date and (x.valid_until is null or x.valid_until>=v_service_date)
        order by x.valid_from desc,x.revision desc limit 1;
      end if;
    end if;
    v_amount:=round(greatest(coalesce(v_amount,0),0),2);
    insert into public.remito_excess_reports(
      remito_id,client_line_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,
      customer_payment_method,reason,notes,created_by,is_test
    ) values(
      p_remito_id,v_line_id,v_concept_id,v_concept.name,1,v_amount,
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),v_service_currency,'ARS')),v_method,v_concept.name,
      case when v_amount=0 then 'amount_pending_admin_review' else null end,p_uid,v_is_test
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
