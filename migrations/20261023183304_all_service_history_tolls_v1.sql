-- All services, not an example number or an approval-only subset. Read-only.
create or replace function app_private.service_history_tolls_v1(p_service_id uuid)
returns jsonb language sql stable security definer set search_path to '' as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_toll_id',t.service_toll_id,'toll_id',t.toll_id,'toll_name',t.toll_name_snapshot,
    'quantity',t.quantity,'total_amount',t.total_amount,'unit_amount',t.unit_amount,'currency',t.currency,
    'payer_agent',t.payer_agent,'customer_payment_method',t.customer_payment_method,
    'payment_method',t.payment_method,'source',t.source
  ) order by t.created_at,t.service_toll_id),'[]'::jsonb)
  from public.operator_service_tolls t where t.service_id=p_service_id;
$f$;
revoke all on function app_private.service_history_tolls_v1(uuid) from public,anon,authenticated;

create or replace function app_private.merge_history_tolls_v1(p_operational jsonb,p_reported jsonb,p_approved boolean)
returns jsonb language sql immutable set search_path to '' as $f$
  with candidates as (
    select t||jsonb_build_object('display_status',case when t->>'source'='actual' then case when p_approved then 'approved' else 'reported' end else 'planned' end) line,
      case when t->>'source'='actual' then 3 else 1 end priority,ord
      from jsonb_array_elements(coalesce(p_operational,'[]'::jsonb)) with ordinality op(t,ord)
    union all
    select t||coalesce(nullif(t->'review'->'accepted','null'::jsonb),'{}'::jsonb)||jsonb_build_object('source','driver',
      'display_status',case when t->'review'->>'decision'='rejected' then 'rejected' else 'reported' end),2,ord
      from jsonb_array_elements(coalesce(p_reported,'[]'::jsonb)) with ordinality reports(t,ord)
  ), keyed as (
    select *,coalesce(nullif(line->>'toll_id',''),lower(btrim(coalesce(line->>'toll_name','Peaje'))))||'|'||coalesce(line->>'payer_agent','provider') identity from candidates
  ), ranked as (
    select *,max(priority) over(partition by identity) preferred from keyed
  )
  -- Actuals replace their own planned/reported copies; unrelated planned tolls stay visible.
  select coalesce(jsonb_agg(line order by priority desc,ord),'[]'::jsonb) from ranked where priority=preferred;
$f$;
revoke all on function app_private.merge_history_tolls_v1(jsonb,jsonb,boolean) from public,anon,authenticated;

create or replace function public.get_driver_remito_history_v3(p_remito_id integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare d jsonb; sid uuid; approved boolean; all_tolls jsonb; history_tolls jsonb; owner_id uuid;
begin
  select r.driver_id into owner_id from public.remitos r where r.remito_id=p_remito_id;
  if auth.uid() is null or (owner_id is distinct from auth.uid() and coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador','supervision','facturacion')) then raise exception 'Sin permiso'; end if;
  d:=public.get_driver_remito_addons_v2(p_remito_id);
  select s.service_id,coalesce(s.document_status='approved' and r.addons_review_status in ('approved','adjusted'),false)
    into sid,approved from public.remitos r join public.operator_services s
      on s.service_id=r.operator_service_id or s.remito_id=r.remito_id
    where r.remito_id=p_remito_id order by (s.service_id=r.operator_service_id) desc nulls last limit 1;
  all_tolls:=app_private.service_history_tolls_v1(sid);
  history_tolls:=app_private.merge_history_tolls_v1(all_tolls,d->'tolls',coalesce(approved,false));
  if jsonb_array_length(history_tolls)=0 and coalesce((d->>'customer_toll_total')::numeric,0)>0 then
    history_tolls:=jsonb_build_array(jsonb_build_object('toll_name','Peajes informados (sin desglose)','total_amount',(d->>'customer_toll_total')::numeric,'quantity',1,'payer_agent','customer','source','legacy','display_status','reported'));
  end if;
  return d||jsonb_build_object('service_id',sid,'service_tolls',all_tolls,'history_tolls',history_tolls,
    'approved_tolls',case when approved then (select coalesce(jsonb_agg(t),'[]'::jsonb) from jsonb_array_elements(all_tolls) t where t->>'source'='actual') else null end,
    'service_tolls_approved',coalesce(approved,false));
end $f$;
revoke all on function public.get_driver_remito_history_v3(integer) from public,anon;
grant execute on function public.get_driver_remito_history_v3(integer) to authenticated;
