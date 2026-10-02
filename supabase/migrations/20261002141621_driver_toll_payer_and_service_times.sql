ALTER TABLE public.remito_toll_reports ADD COLUMN payer_agent text NOT NULL DEFAULT 'customer' CHECK(payer_agent IN ('customer','provider'));
CREATE OR REPLACE FUNCTION app_private.persist_driver_remito_addons_v3(p_remito_id integer, p_payload jsonb, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  r public.remitos%rowtype;
  v_tolls jsonb:=coalesce(p_payload->'tolls','[]'::jsonb);
  v_excesses jsonb:=coalesce(p_payload->'excesses','[]'::jsonb);
  v_evidence jsonb:=coalesce(p_payload->'evidence','[]'::jsonb);
  v_row jsonb; v_line_id uuid; v_owner_line uuid; v_toll_id uuid; v_concept_id uuid;
  v_toll public.toll_locations%rowtype; v_concept public.service_concepts%rowtype;
  v_toll_report_id uuid; v_excess_report_id uuid; v_company_id uuid; v_billing_base_id uuid; v_category_id uuid;
  v_service_date date; v_service_currency text:='ARS'; v_amount numeric; v_method text; v_amount_mode text;
  v_toll_setting text:='route_estimate'; v_payer text:='customer'; v_coverage text; v_kind text; v_path text; v_mime text;
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
  if r.operator_service_id is not null then
    select toll_coverage_mode into v_coverage from public.operator_services where service_id=r.operator_service_id;
    if jsonb_array_length(v_tolls)>0 and coalesce(v_coverage,'') not in ('provider_roundtrip','customer_roundtrip','mixed_manual') then raise exception 'Operaciones debe definir el formato de cobro de peajes'; end if;
    if v_coverage='provider_roundtrip' then v_payer:='provider'; end if;
  end if;
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
    if v_payer='provider' then v_method:=null;
    elsif v_method is null or v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el peaje'; end if;
    select * into v_toll from public.toll_locations where toll_id=v_toll_id and is_active;
    if not found then raise exception 'Uno de los peajes ya no está activo'; end if;
    insert into public.remito_toll_reports(remito_id,client_line_id,toll_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
      quantity,unit_amount,currency,payment_method,customer_payment_method,crossed_at,created_by,is_test,payer_agent)
    values(p_remito_id,v_line_id,v_toll_id,v_toll.code,v_toll.name,v_toll.road,v_toll.direction,1,round(v_amount,2),
      upper(coalesce(nullif(btrim(v_row->>'currency'),''),'ARS')),'manual',v_method,r.created_at_device,p_uid,v_is_test,v_payer);
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
    imp_peaje=case when v_payer='customer' then round(v_toll_total,2) else 0 end,imp_excedente=round(v_excess_total,2),imp_total_extras=default where remito_id=p_remito_id;
  return jsonb_build_object('addons_version',2,'review_status',case when r.status='firmado' then 'pending' else 'draft' end,
    'toll_total',round(v_toll_total,2),'excess_total',round(v_excess_total,2));
end;
$function$;


CREATE OR REPLACE FUNCTION public.get_driver_remito_addons_v2(p_remito_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
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
    'payer_agent',t.payer_agent,'customer_payment_method',t.customer_payment_method,'crossed_at',t.crossed_at,'missing_evidence_reason',t.missing_evidence_reason,'notes',t.notes,
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
    'toll_coverage_mode',case when r.operator_service_id is null then null else (select s.toll_coverage_mode from public.operator_services s where s.service_id=r.operator_service_id) end,
    'addons_version',r.addons_version,'review_status',r.addons_review_status,'reported_toll_total',(select coalesce(sum(total_amount),0) from public.remito_toll_reports where remito_id=p_remito_id),'customer_toll_total',coalesce(r.imp_peaje,0),
    'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_toll_total',r.accepted_imp_peaje,
    'accepted_excess_total',r.accepted_imp_excedente,'accepted_total_extras',r.accepted_imp_total_extras,
    'reviewed_at',r.addons_reviewed_at,'tolls',v_tolls,'excesses',v_excesses,'evidence',v_general_evidence);
end;$function$;


CREATE OR REPLACE FUNCTION app_private.mark_operator_service_arrived_signature_v2(p_service_id uuid, p_remito_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare s public.operator_services%rowtype; r public.remitos%rowtype; v_missing text[];
begin
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found or s.status not in ('assigned','at_origin') then return; end if;
  select * into r from public.remitos where remito_id=p_remito_id;
  if not found or r.status<>'firmado' or r.firma_imagen_url is null or r.firmado_at is null then return; end if;
  if s.remito_id is distinct from p_remito_id then return; end if;
  if s.arrival_source='signature' and s.arrived_at is not null then return; end if;
  v_missing:=app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
  if cardinality(v_missing)>0 then raise exception 'No se puede confirmar la firma. Faltan completar: %',array_to_string(v_missing,', '); end if;
  perform set_config('app.lifecycle_transition','signature_arrival',true);
  perform set_config('app.phase3_bridge','1',true);
  update public.operator_services set status='at_origin',arrived_at=coalesce(r.firmado_at,now()),arrived_by=r.driver_id,arrival_source='signature',arrival_reason_code=null,updated_by=coalesce(r.driver_id,updated_by) where service_id=p_service_id;
end;
$function$;


CREATE OR REPLACE FUNCTION app_private.sync_signed_remito_arrival_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare v_service_id uuid;
begin
  if new.firma_imagen_url is null or new.firmado_at is null then return new; end if;
  select service_id into v_service_id from public.operator_services where remito_id=new.remito_id and status in ('assigned','at_origin') limit 1;
  if v_service_id is not null then perform app_private.mark_operator_service_arrived_signature_v2(v_service_id,new.remito_id); end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.resolve_operator_service_document_v5(p_service_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text := app_private.current_auxilios_role();
  s public.operator_services%rowtype;
  r public.remitos%rowtype;
  v_from_status text;
  v_toll_decisions jsonb := coalesce(p_payload->'tolls','[]'::jsonb);
  v_excess_decisions jsonb := coalesce(p_payload->'excesses','[]'::jsonb);
  v_row jsonb;
  t public.remito_toll_reports%rowtype;
  x public.remito_excess_reports%rowtype;
  l public.toll_locations%rowtype;
  c public.service_concepts%rowtype;
  v_report_id uuid;
  v_client_line_id uuid;
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
  v_adjusted boolean := false;
  v_toll_total numeric := 0;
  v_excess_total numeric := 0;
  v_missing text[];
  v_has_review boolean;
  v_stale_toll_ids uuid[];
  v_stale_excess_ids uuid[];
  v_stale_review_snapshot jsonb;
begin
  if v_uid is null or coalesce(v_role,'') not in ('administracion','operador') then
    raise exception 'Solo Operaciones o Administración puede aprobar y finalizar el servicio';
  end if;
  if lower(btrim(coalesce(p_action,''))) <> 'approve_and_finalize' then
    raise exception 'Acción documental inválida';
  end if;
  if jsonb_typeof(v_toll_decisions) <> 'array' or jsonb_typeof(v_excess_decisions) <> 'array' then
    raise exception 'La revisión debe contener listas';
  end if;

  select * into s from public.operator_services where service_id = p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.billing_status = 'invoiced' then raise exception 'El servicio ya fue facturado y es inmutable'; end if;
  if s.remito_id is null then raise exception 'El servicio todavía no tiene remito'; end if;
  select * into r from public.remitos where remito_id = s.remito_id for update;
  if not found or r.status <> 'firmado' or r.firma_imagen_url is null or r.firmado_at is null then
    raise exception 'El remito todavía no está firmado y recibido';
  end if;

  if s.status = 'completed' and s.document_status = 'approved' then
    return jsonb_build_object(
      'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
      'document_status',s.document_status,'billing_status',s.billing_status,
      'review_status',r.addons_review_status,'idempotent',true
    );
  end if;
  if s.status not in ('at_origin','completed') then
    raise exception 'El servicio debe estar ARRIBADO para aprobar el remito y finalizar';
  end if;
  if s.document_status not in ('submitted','approved') then
    raise exception 'El remito no está pendiente de revisión';
  end if;

  if s.status = 'at_origin' then
    v_missing := app_private.operator_service_missing_required_v2(p_service_id,'{}'::jsonb);
    if cardinality(v_missing) > 0 then
      raise exception 'No se puede finalizar el servicio. Faltan completar: %',array_to_string(v_missing,', ');
    end if;
  end if;

  select exists(
    select 1 from public.operator_service_document_addon_reviews rv
    where rv.service_id = p_service_id and rv.remito_id = r.remito_id
  ) into v_has_review;

  if v_has_review and s.document_status <> 'approved' then
    if exists(
      select 1
      from public.operator_invoice_services invoice_service
      where invoice_service.service_id = p_service_id
    ) or exists(
      select 1
      from public.operator_invoice_tolls invoice_toll
      join public.operator_service_document_addon_reviews stale_review
        on stale_review.service_toll_id = invoice_toll.service_toll_id
      where stale_review.service_id = p_service_id
        and stale_review.remito_id = r.remito_id
    ) then
      raise exception 'El servicio tiene una revisión ya utilizada por Facturación y no puede reemplazarse';
    end if;

    select
      coalesce(jsonb_agg(to_jsonb(stale_review) order by stale_review.reviewed_at),'[]'::jsonb),
      coalesce(array_agg(stale_review.service_toll_id) filter (where stale_review.service_toll_id is not null),'{}'::uuid[]),
      coalesce(array_agg(stale_review.excess_charge_id) filter (where stale_review.excess_charge_id is not null),'{}'::uuid[])
    into v_stale_review_snapshot,v_stale_toll_ids,v_stale_excess_ids
    from public.operator_service_document_addon_reviews stale_review
    where stale_review.service_id = p_service_id
      and stale_review.remito_id = r.remito_id;

    insert into public.operator_service_events(
      service_id,event_type,from_status,to_status,notes,created_by,details
    ) values (
      p_service_id,'stale_remito_review_replaced',s.status,s.status,
      'Revisión previa reemplazada antes de aprobar y finalizar',v_uid,
      jsonb_build_object(
        'remito_id',r.remito_id,
        'previous_reviews',v_stale_review_snapshot,
        'actor_role',v_role
      )
    );

    delete from public.operator_service_document_addon_reviews
    where service_id = p_service_id and remito_id = r.remito_id;
    delete from public.operator_service_tolls
    where service_toll_id = any(v_stale_toll_ids);
    delete from public.operator_service_excess_charges
    where excess_charge_id = any(v_stale_excess_ids);
    v_has_review := false;
  end if;

  if s.administrative_revision>0 and coalesce((p_payload->>'administrative_revision')::integer,-1)<>s.administrative_revision then raise exception 'Las correcciones cambiaron. Volvé a abrir la revisión'; end if;
  if not v_has_review then
    if exists(
      select 1 from public.remito_toll_reports rt
      where rt.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_toll_decisions) d(row)
          where nullif(d.row->>'toll_report_id','')::uuid = rt.toll_report_id
        )
    ) then
      raise exception 'Revisá todos los peajes antes de aprobar';
    end if;
    if exists(
      select 1 from public.remito_excess_reports re
      where re.remito_id = r.remito_id
        and not exists(
          select 1 from jsonb_array_elements(v_excess_decisions) d(row)
          where nullif(d.row->>'excess_report_id','')::uuid = re.excess_report_id
        )
    ) then
      raise exception 'Revisá todos los excedentes antes de aprobar';
    end if;

    for v_row in select value from jsonb_array_elements(v_toll_decisions) loop
      v_report_id := nullif(v_row->>'toll_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de peaje inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de peaje no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un peaje agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into t from public.remito_toll_reports where toll_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los peajes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el peaje'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
        continue;
      end if;

      v_toll_id := nullif(v_row->>'toll_id','')::uuid;
      v_name := nullif(btrim(v_row->>'toll_name'),'');
      if v_toll_id is not null then
        select * into l from public.toll_locations where toll_id = v_toll_id;
        if not found then raise exception 'Peaje aceptado inexistente'; end if;
        v_name := l.name;
      elsif v_name is null then raise exception 'Indicá el peaje aceptado';
      end if;
      v_qty := greatest(coalesce(nullif(v_row->>'quantity','')::numeric,t.quantity,1),1);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,t.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del peaje debe ser mayor a cero'; end if;
      v_method := lower(coalesce(nullif(btrim(v_row->>'payment_method'),''),t.payment_method,'manual'));
      if v_method not in ('cash','electronic','telepass','manual','other') then raise exception 'Medio de peaje inválido'; end if;
      v_payer := lower(coalesce(nullif(btrim(v_row->>'payer_agent'),''),t.payer_agent,'provider'));
      if v_payer not in ('provider','customer') then raise exception 'Responsable comercial de peaje inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_payer = 'customer' and (v_customer_method is null or v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected')) then
        raise exception 'Indicá cómo pagó el cliente el peaje';
      end if;
      if v_payer = 'provider' then
        v_provider_unit := v_unit; v_customer_unit := 0; v_customer_method := null;
      else
        v_provider_unit := 0; v_customer_unit := v_unit;
      end if;
      v_changed := v_report_id is null
        or v_toll_id is distinct from t.toll_id
        or round(v_qty,2) is distinct from t.quantity::numeric
        or v_unit is distinct from t.unit_amount
        or v_method is distinct from t.payment_method;
      if v_changed or v_decision = 'adjusted' then
        
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_tolls(
        service_id,toll_id,toll_rate_id,toll_code_snapshot,toll_name_snapshot,road_snapshot,direction_snapshot,
        vehicle_category,payment_method,quantity,unit_amount,currency,source,crossed_at,notes,created_by,updated_by,
        is_test,payer_agent,customer_payment_method,provider_unit_amount,customer_unit_amount,remito_toll_report_id
      ) values (
        p_service_id,v_toll_id,null,case when v_toll_id is null then t.toll_code_snapshot else l.code end,v_name,
        case when v_toll_id is null then t.road_snapshot else l.road end,
        case when v_toll_id is null then t.direction_snapshot else l.direction end,
        'light_2_axles',case when v_method='other' then 'manual' else v_method end,v_qty::integer,
        v_unit,coalesce(t.currency,'ARS'),'actual',t.crossed_at,v_reason,v_uid,v_uid,s.is_test,
        v_payer,v_customer_method,v_provider_unit,v_customer_unit,v_report_id
      ) returning service_toll_id into v_service_toll_id;
      v_toll_total := v_toll_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,toll_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,service_toll_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'toll' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(t) end,jsonb_build_object(
          'toll_id',v_toll_id,'toll_name',v_name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(t.currency,'ARS'),'payment_method',v_method,
          'payer_agent',v_payer,'customer_payment_method',v_customer_method,
          'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit
        ),v_reason,v_service_toll_id,v_uid,s.is_test
      );
    end loop;

    for v_row in select value from jsonb_array_elements(v_excess_decisions) loop
      v_report_id := nullif(v_row->>'excess_report_id','')::uuid;
      v_client_line_id := nullif(v_row->>'review_line_client_id','')::uuid;
      v_decision := lower(coalesce(nullif(btrim(v_row->>'decision'),''),'accepted'));
      v_reason := nullif(btrim(v_row->>'review_reason'),'');
      if v_decision not in ('accepted','adjusted','rejected') then raise exception 'Decisión de excedente inválida'; end if;
      if v_report_id is null and v_client_line_id is null then raise exception 'La línea de excedente no tiene identificador de revisión'; end if;
      if v_report_id is null and v_decision <> 'adjusted' then raise exception 'Un excedente agregado por Operaciones debe quedar como modificación'; end if;

      if v_report_id is not null then
        select * into x from public.remito_excess_reports where excess_report_id = v_report_id and remito_id = r.remito_id;
        if not found then raise exception 'Uno de los excedentes no pertenece al remito'; end if;
      end if;
      if v_decision = 'rejected' then
        if v_reason is null then raise exception 'Explicá por qué se rechaza el excedente'; end if;
        v_adjusted := true;
        insert into public.operator_service_document_addon_reviews(
          service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,reviewed_by,is_test
        ) values (
          p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,'rejected',
          case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,'{}'::jsonb,v_reason,v_uid,s.is_test
        );
        continue;
      end if;

      v_concept_id := coalesce(nullif(v_row->>'concept_id','')::uuid,x.concept_id);
      select * into c from public.service_concepts
      where concept_id = v_concept_id and is_active and default_can_be_secondary and billing_family <> 'system';
      if not found then raise exception 'Seleccioná el concepto comercial del excedente'; end if;
      v_qty := round(greatest(coalesce(nullif(v_row->>'quantity','')::numeric,x.quantity,1),0.01),2);
      v_unit := round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,x.unit_amount,0),0),2);
      if v_unit <= 0 then raise exception 'El importe del excedente debe ser mayor a cero'; end if;
      v_payer := coalesce(nullif(v_row->>'payer_agent',''),'customer');
      if v_payer not in ('customer','provider') then raise exception 'Responsable de excedente inválido'; end if;
      v_collector := case when v_payer='provider' then 'provider' else lower(coalesce(nullif(btrim(v_row->>'collector_agent'),''),'company')) end;
      if v_collector not in ('company','provider') then raise exception 'Cobrador del excedente inválido'; end if;
      v_customer_method := nullif(lower(btrim(v_row->>'customer_payment_method')),'');
      if v_collector = 'company' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then
        raise exception 'Indicá cómo se cobró el excedente';
      end if;
      if v_collector = 'provider' then v_customer_method := null; end if;
      v_changed := v_report_id is null or v_concept_id is distinct from x.concept_id or v_qty is distinct from x.quantity or v_unit is distinct from x.unit_amount;
      if v_changed or v_decision = 'adjusted' then
        
        v_decision := 'adjusted'; v_adjusted := true;
      else v_decision := 'accepted'; end if;

      insert into public.operator_service_excess_charges(
        service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,
        customer_payment_method,created_by,updated_by,is_test,source,remito_excess_report_id
      ) values (
        p_service_id,v_concept_id,c.name,v_qty,v_unit,coalesce(x.currency,'ARS'),v_payer,v_collector,v_customer_method,
        v_uid,v_uid,s.is_test,'actual',v_report_id
      ) returning excess_charge_id into v_excess_charge_id;
      v_excess_total := v_excess_total + round(v_qty*v_unit,2);
      insert into public.operator_service_document_addon_reviews(
        service_id,remito_id,excess_report_id,review_line_kind,review_client_line_id,decision,original_snapshot,accepted_snapshot,reason,excess_charge_id,reviewed_by,is_test
      ) values (
        p_service_id,r.remito_id,v_report_id,case when v_report_id is null then 'excess' end,v_client_line_id,v_decision,
        case when v_report_id is null then '{}'::jsonb else to_jsonb(x) end,jsonb_build_object(
          'concept_id',v_concept_id,'concept_name',c.name,'quantity',v_qty,'unit_amount',v_unit,
          'total_amount',round(v_qty*v_unit,2),'currency',coalesce(x.currency,'ARS'),'payer_agent',v_payer,'collector_agent',v_collector,
          'customer_payment_method',v_customer_method
        ),v_reason,v_excess_charge_id,v_uid,s.is_test
      );
    end loop;

    update public.remitos set
      addons_review_status = case when v_adjusted then 'adjusted' else 'approved' end,
      accepted_imp_peaje = round(v_toll_total,2),
      accepted_imp_excedente = round(v_excess_total,2),
      accepted_imp_total_extras = round(v_toll_total+v_excess_total+coalesce(imp_otros,0),2),
      addons_reviewed_by = v_uid,
      addons_reviewed_at = now()
    where remito_id = r.remito_id returning * into r;
  end if;

  v_from_status := s.status;
  perform set_config('app.phase3_bridge','1',true);
  if s.status = 'at_origin' and s.trip_id is not null then
    update public.trips set
      fecha_hora_fin = coalesce(fecha_hora_fin,now()),
      received_at = now(),
      sync_status = 'synced',
      km_traveled = coalesce(r.km_reales,km_traveled)
    where trip_id = s.trip_id;
  end if;

  perform set_config('app.lifecycle_transition','finalize',true);
  perform set_config('app.assignment_reason','finalized',true);
  perform set_config('app.remito_atomic_finalize','1',true);
  update public.operator_services set
    document_status = 'approved',
    administrative_review_status = 'approved',
    status = case when status='at_origin' then 'completed' else status end,
    completed_at = case when status='at_origin' then coalesce(completed_at,now()) else completed_at end,
    billing_status = 'pending',
    assigned_driver_id = case when status='at_origin' then null else assigned_driver_id end,
    assigned_truck_id = case when status='at_origin' then null else assigned_truck_id end,
    updated_by = v_uid,
    updated_at = now()
  where service_id = p_service_id returning * into s;

  insert into public.operator_service_events(
    service_id,event_type,from_status,to_status,notes,created_by,details
  ) values (
    p_service_id,'remito_approved_and_service_finalized',v_from_status,s.status,
    case when v_from_status='completed'
      then 'Remito aprobado; servicio histórico habilitado para Facturación'
      else 'Remito aprobado y servicio finalizado' end,
    v_uid,jsonb_build_object(
      'remito_id',r.remito_id,'review_status',r.addons_review_status,
      'reported_toll_total',coalesce(r.imp_peaje,0),'accepted_toll_total',r.accepted_imp_peaje,
      'reported_excess_total',coalesce(r.imp_excedente,0),'accepted_excess_total',r.accepted_imp_excedente,
      'actor_role',v_role
    )
  );

  return jsonb_build_object(
    'service_id',s.service_id,'remito_id',r.remito_id,'status',s.status,
    'document_status',s.document_status,'billing_status',s.billing_status,
    'review_status',r.addons_review_status,'idempotent',false
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.finalize_operator_service_at_v1(p_service_id uuid,p_finished_at timestamptz,p_mode text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE s public.operator_services%rowtype; result jsonb;
BEGIN
 IF auth.uid() is null OR coalesce(app_private.current_auxilios_role(),'') NOT IN ('operador','administracion') THEN RAISE EXCEPTION 'Sin permiso para finalizar servicios'; END IF;
 SELECT * INTO s FROM public.operator_services WHERE service_id=p_service_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Servicio inexistente'; END IF;
 IF s.status='completed' THEN RETURN jsonb_build_object('service_id',s.service_id,'status',s.status,'document_status',s.document_status,'billing_status',s.billing_status,'completed_at',s.completed_at,'idempotent',true); END IF;
 IF p_finished_at IS NULL OR NOT isfinite(p_finished_at) THEN RAISE EXCEPTION 'Indicá la hora de fin'; END IF;
 IF p_finished_at>clock_timestamp()+interval '2 minutes' THEN RAISE EXCEPTION 'La hora de fin no puede ser futura'; END IF;
 IF s.arrived_at IS NOT NULL AND p_finished_at<s.arrived_at THEN RAISE EXCEPTION 'La hora de fin no puede ser anterior al arribo'; END IF;
 IF p_mode='review' THEN
  result:=public.resolve_operator_service_document_v6(p_service_id,'approve_and_finalize',p_payload);
 ELSIF p_mode='transition' THEN
  result:=public.transition_operator_service_v2(p_service_id,'finalize',p_payload->>'reason_code',p_payload->>'reason_detail');
 ELSIF p_mode='activated' THEN
  result:=public.finalize_activated_service_v1(p_service_id,(p_payload->>'billable')::boolean,p_payload->>'reason');
 ELSE RAISE EXCEPTION 'Modo de cierre inválido'; END IF;
 PERFORM public.set_service_finish_time_v1(p_service_id,p_finished_at);
 RETURN result||jsonb_build_object('completed_at',p_finished_at);
END; $function$;
REVOKE ALL ON FUNCTION public.finalize_operator_service_at_v1(uuid,timestamptz,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_operator_service_at_v1(uuid,timestamptz,text,jsonb) TO authenticated;
