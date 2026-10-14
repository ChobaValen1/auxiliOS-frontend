-- Preserve individual review decisions while an operator leaves a signed remito pending.
begin;

create or replace function public.save_operator_service_review_draft_v1(
  p_service_id uuid, p_note text, p_decisions jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.operator_services%rowtype;
  v_note text := btrim(coalesce(p_note,''));
  v_decisions jsonb := coalesce(p_decisions,'{}'::jsonb);
  v_entry record;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador') then
    raise exception 'Sin permiso para dejar pendiente';
  end if;
  if length(v_note)<3 then raise exception 'Indicá una nota para dejar pendiente'; end if;
  if jsonb_typeof(v_decisions)<>'object' then raise exception 'Las decisiones deben ser un objeto'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status in ('completed','cancelled') then raise exception 'El servicio ya está cerrado'; end if;
  if s.remito_id is null then raise exception 'El servicio no tiene remito'; end if;
  if (select count(*) from jsonb_each(v_decisions))>100 then raise exception 'Demasiadas decisiones'; end if;
  for v_entry in select key,value from jsonb_each(v_decisions) loop
    if v_entry.key !~ '^(toll|excess):[0-9a-fA-F-]{36}$'
       or coalesce(v_entry.value->>'value','') not in ('accepted','rejected')
       or jsonb_typeof(v_entry.value)<>'object' then
      raise exception 'Decisión inválida';
    end if;
    if v_entry.value->>'value'='rejected' and length(btrim(coalesce(v_entry.value->>'reason','')))<1 then
      raise exception 'Indicá el motivo de cada rechazo';
    end if;
    if left(v_entry.key,5)='toll:' and not exists (
      select 1 from public.remito_toll_reports r where r.remito_id=s.remito_id and r.toll_report_id=substring(v_entry.key from 6)::uuid
    ) then raise exception 'Un peaje no pertenece al remito'; end if;
    if left(v_entry.key,7)='excess:' and not exists (
      select 1 from public.remito_excess_reports r where r.remito_id=s.remito_id and r.excess_report_id=substring(v_entry.key from 8)::uuid
    ) then raise exception 'Un excedente no pertenece al remito'; end if;
  end loop;
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'remito_review_pending',s.status,s.status,v_note,auth.uid(),
    jsonb_build_object('actor_role',app_private.current_auxilios_role(),'decisions',v_decisions,'administrative_revision',s.administrative_revision));
  return jsonb_build_object('service_id',p_service_id,'pending',true);
end; $$;

revoke all on function public.save_operator_service_review_draft_v1(uuid,text,jsonb) from public,anon;
grant execute on function public.save_operator_service_review_draft_v1(uuid,text,jsonb) to authenticated;

create or replace function public.get_operator_service_review_draft_v1(p_service_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s public.operator_services%rowtype;
  v_event public.operator_service_events%rowtype;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador') then
    raise exception 'Sin permiso para consultar la revisión';
  end if;
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  select * into v_event from public.operator_service_events
  where service_id=p_service_id and event_type='remito_review_pending'
  order by created_at desc, event_id desc limit 1;
  if not found then return jsonb_build_object('decisions','{}'::jsonb,'note',''); end if;
  return jsonb_build_object('decisions',coalesce(v_event.details->'decisions','{}'::jsonb),
    'note',coalesce(v_event.notes,''),'administrative_revision',v_event.details->'administrative_revision');
end; $$;

revoke all on function public.get_operator_service_review_draft_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_review_draft_v1(uuid) to authenticated;

-- Create and close an already signed intake in a single database transaction.
-- An error during document resolution also rolls back service creation.
create or replace function public.create_and_finalize_driver_service_intake_v1(
  p_intake_id uuid, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_created jsonb;
  v_review jsonb;
  v_service_id uuid;
  v_tolls jsonb;
  v_excesses jsonb;
  v_result jsonb;
  v_status text;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador') then
    raise exception 'Sin permiso para crear y finalizar el servicio';
  end if;
  v_created:=public.create_and_link_driver_service_intake_v2(p_intake_id,p_payload);
  v_service_id:=(v_created->>'service_id')::uuid;
  if v_service_id is null then raise exception 'No se creó el servicio'; end if;
  if coalesce((v_created->>'idempotent')::boolean,false) then
    select status into strict v_status from public.operator_services where service_id=v_service_id;
    if v_status<>'completed' then raise exception 'El ingreso ya está vinculado a un servicio abierto'; end if;
    return v_created;
  end if;
  v_review:=public.get_operator_service_remito_review_v3(v_service_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'toll_report_id',line->'toll_report_id','review_line_client_id',line->'review_line_client_id',
    'decision',case when coalesce((line->>'administratively_excluded')::boolean,false) then 'rejected' when line->>'toll_report_id' is null then 'adjusted' else 'accepted' end,
    'reason',case when coalesce((line->>'administratively_excluded')::boolean,false) then 'Excluido en la corrección administrativa' end,
    'toll_id',line->'toll_id','toll_name',line->'toll_name',
    'quantity',coalesce(line->'quantity','1'::jsonb),
    'unit_amount',coalesce(line->'unit_amount',line->'total_amount'),
    'payment_method',coalesce(line->'payment_method','"manual"'::jsonb),
    'payer_agent',coalesce(line->'payer_agent',case when nullif(line->>'customer_payment_method','') is null then '"provider"'::jsonb else '"customer"'::jsonb end),
    'customer_payment_method',line->'customer_payment_method'
  )),'[]'::jsonb) into v_tolls from jsonb_array_elements(coalesce(v_review#>'{reported,tolls}','[]'::jsonb)) line;
  select coalesce(jsonb_agg(jsonb_build_object(
    'excess_report_id',line->'excess_report_id','review_line_client_id',line->'review_line_client_id',
    'decision',case when coalesce((line->>'administratively_excluded')::boolean,false) then 'rejected' when line->>'excess_report_id' is null then 'adjusted' else 'accepted' end,
    'review_reason',case when coalesce((line->>'administratively_excluded')::boolean,false) then 'Excluido en la corrección administrativa' end,
    'concept_id',line->'concept_id',
    'quantity',coalesce(line->'quantity','1'::jsonb),
    'unit_amount',coalesce(line->'unit_amount',line->'total_amount'),
    'payer_agent',coalesce(line->'payer_agent','"customer"'::jsonb),
    'collector_agent',coalesce(line->'collector_agent','"company"'::jsonb),
    'customer_payment_method',coalesce(line->'customer_payment_method',line->'payment_method')
  )),'[]'::jsonb) into v_excesses from jsonb_array_elements(coalesce(v_review#>'{reported,excesses}','[]'::jsonb)) line;
  v_result:=public.resolve_operator_service_document_v6(v_service_id,'approve_and_finalize',
    jsonb_build_object('tolls',v_tolls,'excesses',v_excesses,
      'administrative_revision',coalesce((v_review->>'administrative_revision')::integer,0)));
  return v_created||jsonb_build_object('finalized',true,'resolution',v_result);
end; $$;

revoke all on function public.create_and_finalize_driver_service_intake_v1(uuid,jsonb) from public,anon;
grant execute on function public.create_and_finalize_driver_service_intake_v1(uuid,jsonb) to authenticated;

commit;
