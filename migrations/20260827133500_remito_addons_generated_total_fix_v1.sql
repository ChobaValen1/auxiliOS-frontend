-- imp_total_extras es una columna generada. PostgreSQL sólo permite asignarle
-- DEFAULT durante un UPDATE; el valor se recalcula desde los importes fuente.

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
