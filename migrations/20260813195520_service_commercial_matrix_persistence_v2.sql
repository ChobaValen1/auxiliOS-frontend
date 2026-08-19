-- AuxiliOS · persistencia/lectura de la matriz comercial v2

create or replace function app_private.persist_service_commercial_addons_v1(
  p_service_id uuid,
  p_normalized jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
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

  delete from public.operator_service_excess_charges where service_id=p_service_id;
  for v_row in select value from jsonb_array_elements(coalesce(p_normalized->'excess_charges','[]'::jsonb)) loop
    insert into public.operator_service_excess_charges(
      service_id,concept_id,concept_name_snapshot,quantity,unit_amount,currency,payer_agent,collector_agent,customer_payment_method,created_by,updated_by,is_test
    ) values(
      p_service_id,(v_row->>'concept_id')::uuid,v_row->>'concept_name',(v_row->>'quantity')::numeric,(v_row->>'unit_amount')::numeric,
      v_row->>'currency','customer',v_row->>'collector_agent',v_row->>'customer_payment_method',v_uid,v_uid,v_service.is_test
    );
  end loop;
end;
$$;

revoke all on function app_private.persist_service_commercial_addons_v1(uuid,jsonb) from public,anon,authenticated;

create or replace function public.get_operator_service_commercial_addons_v1(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_service public.operator_services%rowtype;
  v_tolls jsonb;
  v_excess jsonb;
begin
  if auth.uid() is null or v_role not in ('administracion','operador','supervision','facturacion') then raise exception 'Sin permiso para consultar peajes y excedentes'; end if;
  select * into v_service from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'toll_id',t.toll_id,'toll_rate_id',t.toll_rate_id,'quantity',t.quantity,
    'payer_agent',coalesce(t.payer_agent,'provider'),'customer_payment_method',t.customer_payment_method,
    'unit_amount',t.unit_amount,'currency',t.currency
  )) order by t.created_at),'[]'::jsonb)
  into v_tolls from public.operator_service_tolls t
  where t.service_id=p_service_id and t.source='planned' and t.toll_id is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'concept_id',e.concept_id,'quantity',e.quantity,'unit_amount',e.unit_amount,'currency',e.currency,
    'collector_agent',e.collector_agent,'customer_payment_method',e.customer_payment_method
  ) order by e.created_at),'[]'::jsonb)
  into v_excess from public.operator_service_excess_charges e where e.service_id=p_service_id;

  return jsonb_build_object(
    'toll_coverage_mode',coalesce(v_service.toll_coverage_mode,case when jsonb_array_length(v_tolls)>0 then 'provider_roundtrip' end),
    'tolls',v_tolls,'excess_charges',v_excess
  );
end;
$$;

revoke all on function public.get_operator_service_commercial_addons_v1(uuid) from public,anon;
grant execute on function public.get_operator_service_commercial_addons_v1(uuid) to authenticated,service_role;
