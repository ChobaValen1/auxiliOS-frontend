-- AuxiliOS · preferencias de importes del Chofer por prestadora

alter table public.company_service_settings
  add column if not exists driver_amount_mode text not null default 'fixed';
alter table public.company_service_settings
  drop constraint if exists company_service_settings_driver_amount_mode_chk;
alter table public.company_service_settings
  add constraint company_service_settings_driver_amount_mode_chk
  check(driver_amount_mode in ('fixed','manual'));

comment on column public.company_service_settings.driver_amount_mode is
  'fixed usa el precio definido por Administración; manual exige que el Chofer informe el importe real.';

-- Preserve the behavior of enabled excesses that do not yet have an
-- Administration price. Administrators can later change either mode explicitly.
update public.company_service_settings css
set driver_amount_mode='manual',updated_at=now()
where css.is_enabled
  and exists(
    select 1 from public.service_concepts sc
    where sc.concept_id=css.concept_id and sc.service_category in ('secondary','mixed')
  )
  and not exists(
    select 1 from public.company_tariff_matrix_rates r
    where r.company_id=css.company_id and r.concept_id=css.concept_id
      and r.is_current and r.unit_price>0
  );

create or replace function public.get_company_configuration_v2(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare v_role text:=app_private.current_auxilios_role();
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  return jsonb_build_object(
    'company',(select to_jsonb(c) from public.companies c where c.company_id=p_company_id),
    'services',coalesce((select jsonb_agg(jsonb_build_object(
      'concept_id',sc.concept_id,'name',sc.name,'category',sc.service_category,
      'billing_family',sc.billing_family,'is_enabled',coalesce(css.is_enabled,false),
      'external_code',css.external_code,'code_mode',coalesce(css.code_mode,'fixed'),
      'driver_amount_mode',coalesce(css.driver_amount_mode,'fixed'),'notes',css.notes
    ) order by sc.sort_order,sc.name)
    from public.service_concepts sc
    left join public.company_service_settings css on css.company_id=p_company_id and css.concept_id=sc.concept_id
    where sc.billing_family<>'system' and sc.is_active),'[]'::jsonb),
    'bases',coalesce((select jsonb_agg(jsonb_build_object(
      'base_id',b.base_id,'base_code',b.base_code,'name',b.name,'address',b.address,
      'city',b.city,'province',b.province,'address_verified',b.address_verified,'is_active',l.is_active
    ) order by b.name,b.base_code)
    from public.company_billing_settings s
    join public.company_billing_base_links l on l.billing_setting_id=s.billing_setting_id and l.is_active
    join public.billing_bases b on b.base_id=l.base_id and b.is_active
    where s.company_id=p_company_id and s.is_active),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.get_company_configuration_v2(uuid) from public,anon;
grant execute on function public.get_company_configuration_v2(uuid) to authenticated;

create or replace function public.save_company_service_setting_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,app_private,pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_mode text:=coalesce(nullif(p_payload->>'driver_amount_mode',''),'fixed');
  v_row public.company_service_settings%rowtype;
begin
  if v_role<>'administracion' then raise exception 'Solo Administración puede modificar la configuración de la prestadora'; end if;
  if v_mode not in ('fixed','manual') then raise exception 'Modo de importe del Chofer inválido'; end if;
  insert into public.company_service_settings(company_id,concept_id,is_enabled,external_code,code_mode,driver_amount_mode,notes)
  values((p_payload->>'company_id')::uuid,(p_payload->>'concept_id')::uuid,
    coalesce((p_payload->>'is_enabled')::boolean,true),nullif(trim(coalesce(p_payload->>'external_code','')),''),
    coalesce(nullif(p_payload->>'code_mode',''),'fixed'),v_mode,nullif(trim(coalesce(p_payload->>'notes','')),''))
  on conflict(company_id,concept_id) do update set
    is_enabled=excluded.is_enabled,external_code=excluded.external_code,code_mode=excluded.code_mode,
    driver_amount_mode=excluded.driver_amount_mode,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;
revoke all on function public.save_company_service_setting_v2(jsonb) from public,anon;
grant execute on function public.save_company_service_setting_v2(jsonb) to authenticated;

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
  v_toll_setting text:='route_estimate';
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
    select coalesce(bs.toll_calculation_mode,'route_estimate') into v_toll_setting
    from public.company_billing_settings bs
    where bs.company_id=v_company_id and bs.is_active and bs.valid_from<=v_date
      and (bs.valid_until is null or bs.valid_until>=v_date)
    order by (bs.contract_id is null) desc,bs.valid_from desc,bs.created_at desc limit 1;
    v_toll_setting:=coalesce(v_toll_setting,'route_estimate');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_id',l.toll_id,'code',l.code,'name',l.name,'road',l.road,'direction',l.direction,
    'rate_id',r.toll_rate_id,'reference_amount',case when v_toll_setting='route_estimate' then r.amount else null end,
    'amount_mode',case when v_toll_setting='manual' then 'manual' else 'suggested' end,
    'price_source',case when v_toll_setting='route_estimate' then 'toll_rate' else 'manual' end,
    'currency',coalesce(r.currency,'ARS')
  ) order by l.name),'[]'::jsonb) into v_tolls
  from public.toll_locations l
  left join lateral(select tr.* from public.toll_rates tr
    where tr.toll_id=l.toll_id and tr.is_active and tr.vehicle_category='light_2_axles'
      and tr.valid_from<=v_date and (tr.valid_until is null or tr.valid_until>=v_date)
    order by (tr.payment_method='any') desc,tr.valid_from desc,tr.created_at desc limit 1) r on true
  where l.is_active and v_toll_setting<>'not_applicable';

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',c.concept_id,'code',c.code,'name',c.name,'quantity_source',c.quantity_source,
    'amount_mode',coalesce(css.driver_amount_mode,case when v_company_id is null then 'manual' else 'fixed' end),
    'reference_amount',case when coalesce(css.driver_amount_mode,case when v_company_id is null then 'manual' else 'fixed' end)='fixed'
      then coalesce(nullif(p.amount,0),nullif(m.unit_price,0)) else null end,
    'price_source',case when coalesce(css.driver_amount_mode,case when v_company_id is null then 'manual' else 'fixed' end)='manual' then 'manual'
      when coalesce(p.amount,0)>0 then 'planned' when coalesce(m.unit_price,0)>0 then 'tariff' else 'missing' end,
    'currency',coalesce(m.currency,v_currency,'ARS')
  ) order by c.sort_order,c.name),'[]'::jsonb) into v_concepts
  from public.service_concepts c
  left join public.company_service_settings css on css.company_id=v_company_id and css.concept_id=c.concept_id
  left join lateral(select sum(i.subtotal) amount from public.operator_service_items i
    where p_service_id is not null and i.service_id=p_service_id and i.concept_id=c.concept_id and i.item_role='secondary') p on true
  left join lateral(select x.unit_price,x.currency from public.company_tariff_matrix_rates x
    where v_company_id is not null and x.company_id=v_company_id and x.concept_id=c.concept_id
      and x.billing_base_id is not distinct from v_billing_base_id and x.category_id is not distinct from v_category_id
      and x.is_current and x.valid_from<=v_date and (x.valid_until is null or x.valid_until>=v_date)
    order by x.valid_from desc,x.revision desc limit 1) m on true
  where c.is_active and c.billing_family<>'system' and coalesce(c.matrix_visible,true)
    and c.service_category in ('secondary','mixed')
    and (v_company_id is null or coalesce(css.is_enabled,false));

  return jsonb_build_object('version',2,'service_id',p_service_id,'company_id',v_company_id,
    'toll_amount_mode',case v_toll_setting when 'manual' then 'manual' when 'not_applicable' then 'disabled' else 'suggested' end,
    'excess_scope',case when v_company_id is null then 'global' else 'company' end,
    'tolls',v_tolls,'excess_concepts',v_concepts,
    'payment_methods',jsonb_build_array('cash','transfer','card','mercado_pago','other','not_collected'),
    'evidence',jsonb_build_object('bucket','remito-evidence-v2','max_bytes',10485760,
      'mime_types',jsonb_build_array('image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf')));
end;
$function$;
revoke all on function public.get_driver_remito_reference_v2(uuid) from public,anon,authenticated;
grant execute on function public.get_driver_remito_reference_v2(uuid) to authenticated;

create or replace function app_private.persist_driver_remito_addons_v3(p_remito_id integer,p_payload jsonb,p_uid uuid)
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
  v_row jsonb; v_line_id uuid; v_owner_line uuid; v_toll_id uuid; v_concept_id uuid;
  v_toll public.toll_locations%rowtype; v_concept public.service_concepts%rowtype;
  v_toll_report_id uuid; v_excess_report_id uuid; v_company_id uuid; v_billing_base_id uuid; v_category_id uuid;
  v_service_date date; v_service_currency text:='ARS'; v_amount numeric; v_method text; v_amount_mode text;
  v_toll_setting text:='route_estimate'; v_kind text; v_path text; v_mime text;
  v_toll_total numeric:=0; v_excess_total numeric:=0; v_is_test boolean:=false;
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
    select coalesce(bs.toll_calculation_mode,'route_estimate') into v_toll_setting
    from public.company_billing_settings bs where bs.company_id=v_company_id and bs.is_active
      and bs.valid_from<=v_service_date and (bs.valid_until is null or bs.valid_until>=v_service_date)
    order by (bs.contract_id is null) desc,bs.valid_from desc,bs.created_at desc limit 1;
    v_toll_setting:=coalesce(v_toll_setting,'route_estimate');
  end if;
  if jsonb_typeof(v_tolls)<>'array' or jsonb_typeof(v_excesses)<>'array' or jsonb_typeof(v_evidence)<>'array' then raise exception 'Peajes, excedentes y evidencia deben ser listas'; end if;
  if jsonb_array_length(v_tolls)>30 or jsonb_array_length(v_excesses)>20 or jsonb_array_length(v_evidence)>80 then raise exception 'El remito contiene demasiados conceptos o archivos'; end if;
  if v_toll_setting='not_applicable' and jsonb_array_length(v_tolls)>0 then raise exception 'La prestadora no admite peajes'; end if;
  if exists(select 1 from public.operator_service_document_addon_reviews x where x.remito_id=p_remito_id) then raise exception 'El remito ya fue revisado por Administración'; end if;

  delete from public.remito_evidence where remito_id=p_remito_id;
  delete from public.remito_toll_reports where remito_id=p_remito_id;
  delete from public.remito_excess_reports where remito_id=p_remito_id;

  for v_row in select value from jsonb_array_elements(v_tolls) loop
    v_line_id:=nullif(v_row->>'client_line_id','')::uuid; v_toll_id:=nullif(v_row->>'toll_id','')::uuid;
    v_method:=lower(nullif(btrim(coalesce(v_row->>'customer_payment_method',v_row->>'payment_method')),''));
    v_amount:=nullif(v_row->>'unit_amount','')::numeric;
    if v_line_id is null then raise exception 'Cada peaje necesita identificador'; end if;
    if v_toll_id is null then raise exception 'Seleccioná un peaje habilitado'; end if;
    if coalesce(v_amount,0)<=0 then raise exception 'Indicá el importe real del peaje'; end if;
    if v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el peaje'; end if;
    select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
    if not found then raise exception 'Uno de los peajes ya no está activo'; end if;
    insert into public.remito_toll_reports(remito_id,client_line_id,toll_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      quantity,unit_amount,currency,payment_method,customer_payment_method,crossed_at,created_by,is_test)
    values(p_remito_id,v_line_id,v_toll_id,v_toll.code,v_toll.name,v_toll.road,v_toll.direction,1,round(v_amount,2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),'manual',v_method,r.created_at_device,p_uid,v_is_test);
  end loop;

  for v_row in select value from jsonb_array_elements(v_excesses) loop
    v_line_id:=nullif(v_row->>'client_line_id','')::uuid; v_concept_id:=nullif(v_row->>'concept_id','')::uuid;
    v_method:=lower(nullif(btrim(coalesce(v_row->>'customer_payment_method',v_row->>'payment_method')),''));
    if v_line_id is null then raise exception 'Cada excedente necesita identificador'; end if;
    if v_concept_id is null then raise exception 'Seleccioná un excedente habilitado'; end if;
    if v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el excedente'; end if;
    select * into v_concept from public.service_concepts c where c.concept_id=v_concept_id and c.is_active
      and c.billing_family<>'system' and coalesce(c.matrix_visible,true) and c.service_category in ('secondary','mixed')
      and (v_company_id is null or exists(select 1 from public.company_service_settings css where css.company_id=v_company_id and css.concept_id=c.concept_id and css.is_enabled));
    if not found then raise exception 'Uno de los excedentes ya no está habilitado'; end if;
    select coalesce(css.driver_amount_mode,'fixed') into v_amount_mode from public.company_service_settings css
      where css.company_id=v_company_id and css.concept_id=v_concept_id;
    v_amount_mode:=coalesce(v_amount_mode,case when v_company_id is null then 'manual' else 'fixed' end);
    v_amount:=null;
    if v_amount_mode='manual' then
      v_amount:=nullif(v_row->>'unit_amount','')::numeric;
    else
      if r.operator_service_id is not null then
        select sum(i.subtotal) into v_amount from public.operator_service_items i
        where i.service_id=r.operator_service_id and i.concept_id=v_concept_id and i.item_role='secondary';
        if coalesce(v_amount,0)<=0 then
          select x.unit_price into v_amount from public.company_tariff_matrix_rates x
          where x.company_id=v_company_id and x.concept_id=v_concept_id
            and x.billing_base_id is not distinct from v_billing_base_id and x.category_id is not distinct from v_category_id
            and x.is_current and x.valid_from<=v_service_date and (x.valid_until is null or x.valid_until>=v_service_date)
          order by x.valid_from desc,x.revision desc limit 1;
        end if;
      end if;
    end if;
    if coalesce(v_amount,0)<=0 then raise exception 'El excedente no tiene un importe válido'; end if;
    insert into public.remito_excess_reports(remito_id,client_line_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,
      customer_payment_method,reason,notes,created_by,is_test)
    values(p_remito_id,v_line_id,v_concept_id,v_concept.name,1,round(v_amount,2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),v_service_currency,'ARS')),v_method,v_concept.name,null,p_uid,v_is_test);
  end loop;

  for v_row in select value from jsonb_array_elements(v_evidence) loop
    v_line_id:=nullif(v_row->>'client_evidence_id','')::uuid;
    v_owner_line:=nullif(coalesce(v_row->>'owner_client_line_id',v_row->>'client_line_id'),'')::uuid;
    v_kind:=lower(nullif(btrim(coalesce(v_row->>'kind',v_row->>'evidence_kind')),''));
    v_path:=nullif(btrim(v_row->>'storage_path'),''); v_mime:=lower(nullif(btrim(v_row->>'mime_type'),''));
    v_toll_report_id:=null; v_excess_report_id:=null;
    if v_line_id is null or v_kind is null or v_path is null or v_mime is null then raise exception 'La evidencia está incompleta'; end if;
    if split_part(v_path,'/',1)<>p_uid::text then raise exception 'Ruta de evidencia inválida'; end if;
    if v_kind='toll_ticket' then
      select toll_report_id into v_toll_report_id from public.remito_toll_reports where remito_id=p_remito_id and client_line_id=v_owner_line;
      if v_toll_report_id is null then raise exception 'El ticket no corresponde a un peaje'; end if;
    elsif v_kind='excess_support' then
      select excess_report_id into v_excess_report_id from public.remito_excess_reports where remito_id=p_remito_id and client_line_id=v_owner_line;
      if v_excess_report_id is null then raise exception 'La evidencia no corresponde a un excedente'; end if;
    elsif v_kind not in ('vehicle_front','vehicle_side','odometer','extra') then raise exception 'Tipo de evidencia inválido'; end if;
    insert into public.remito_evidence(remito_id,client_evidence_id,toll_report_id,excess_report_id,evidence_kind,storage_bucket,storage_path,mime_type,original_name,size_bytes,created_by)
    values(p_remito_id,v_line_id,v_toll_report_id,v_excess_report_id,v_kind,'remito-evidence-v2',v_path,v_mime,
      nullif(btrim(v_row->>'original_name'),''),nullif(v_row->>'size_bytes','')::bigint,p_uid);
  end loop;

  select coalesce(sum(total_amount),0) into v_toll_total from public.remito_toll_reports where remito_id=p_remito_id;
  select coalesce(sum(total_amount),0) into v_excess_total from public.remito_excess_reports where remito_id=p_remito_id;
  update public.remitos set addons_version=2,addons_review_status=case when status='firmado' then 'pending' else 'draft' end,
    imp_peaje=round(v_toll_total,2),imp_excedente=round(v_excess_total,2),imp_total_extras=default where remito_id=p_remito_id;
  return jsonb_build_object('addons_version',2,'review_status',case when r.status='firmado' then 'pending' else 'draft' end,
    'toll_total',round(v_toll_total,2),'excess_total',round(v_excess_total,2));
end;
$function$;
revoke all on function app_private.persist_driver_remito_addons_v3(integer,jsonb,uuid) from public,anon,authenticated;
