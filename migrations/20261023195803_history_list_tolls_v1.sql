-- Read-only bulk source for the actual Historial lists, not just their detail modals.
create or replace function public.get_history_list_tolls_v1(p_service_ids uuid[] default '{}',p_remito_ids integer[] default '{}')
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare v_role text:=coalesce(app_private.current_auxilios_role(),''); s public.operator_services; rid integer; d jsonb;
  service_rows jsonb:='[]'; remito_rows jsonb:='[]';
begin
  if auth.uid() is null or v_role not in ('administracion','supervision','operador','facturacion','chofer') then raise exception 'Sin permiso'; end if;
  if coalesce(cardinality(p_service_ids),0)+coalesce(cardinality(p_remito_ids),0)>100 then raise exception 'Hasta 100 registros por consulta'; end if;
  if v_role='chofer' and coalesce(cardinality(p_service_ids),0)>0 then raise exception 'Sin permiso'; end if;
  for rid in select distinct x from unnest(p_remito_ids) x loop
    -- Reuse the owner/role guard; never expose another driver's remito in a batch.
    d:=public.get_driver_remito_history_v3(rid);
    if d is not null then remito_rows:=remito_rows||jsonb_build_array(jsonb_build_object(
      'remito_id',rid,'service_id',d->'service_id','history_tolls',d->'history_tolls','accepted_toll_total',d->'accepted_toll_total')); end if;
  end loop;
  for s in select * from public.operator_services where service_id=any(p_service_ids) loop
    select r.remito_id into rid from public.remitos r
      where r.remito_id=s.remito_id or (r.operator_service_id=s.service_id and r.status<>'anulado')
      order by (r.remito_id=s.remito_id) desc nulls last,r.firmado_at desc nulls last,r.remito_id desc limit 1;
    if rid is not null then d:=public.get_driver_remito_history_v3(rid);
    else d:=jsonb_build_object('service_id',s.service_id,'history_tolls',app_private.merge_history_tolls_v1(
      app_private.service_history_tolls_v1(s.service_id),'[]'::jsonb,s.document_status in ('approved','exception_approved'))); end if;
    service_rows:=service_rows||jsonb_build_array(jsonb_build_object('service_id',s.service_id,
      'history_tolls',d->'history_tolls','accepted_toll_total',d->'accepted_toll_total'));
  end loop;
  return jsonb_build_object('services',service_rows,'remitos',remito_rows);
end $f$;
revoke all on function public.get_history_list_tolls_v1(uuid[],integer[]) from public,anon;
grant execute on function public.get_history_list_tolls_v1(uuid[],integer[]) to authenticated;
