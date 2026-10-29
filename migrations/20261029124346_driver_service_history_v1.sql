-- Driver history is a service ledger, not only a list of receipts.
-- Read-only: no changes to lifecycle, assignments, billing or payroll.
create or replace function public.list_driver_service_history_v1(
  p_page integer default 1, p_page_size integer default 50, p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path to '' as $f$
declare
  uid uuid := auth.uid(); result jsonb; item jsonb; enriched jsonb := '[]'; tolls jsonb;
  page_size integer := least(100,greatest(1,coalesce(p_page_size,50)));
  filters jsonb := coalesce(p_filters,'{}'); from_day date; until_day date;
begin
  if uid is null or coalesce(app_private.current_auxilios_role(),'') <> 'chofer' then
    raise exception 'Sin permiso para consultar el historial del chofer';
  end if;
  -- Identity comes exclusively from the session. No caller-supplied driver ID.
  if filters->>'periodo'='mes' then
    from_day := date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
    until_day := (from_day+interval '1 month')::date;
  elsif filters->>'periodo'='dia' and nullif(filters->>'diaEspecifico','') is not null then
    from_day := (filters->>'diaEspecifico')::date; until_day := from_day+1;
  elsif filters->>'periodo'='rango' and nullif(filters->>'desde','') is not null and nullif(filters->>'hasta','') is not null then
    from_day := (filters->>'desde')::date; until_day := (filters->>'hasta')::date+1;
  end if;
  with closed as materialized (
    select s.*, coalesce(case when s.status='cancelled' then s.cancelled_at end,
      s.completed_at,s.activated_at,s.updated_at,s.created_at) history_at
    from public.operator_services s
    where s.logistics_type='own' and (s.status in ('completed','cancelled') or s.driver_activated)
  ), owned as materialized (
    select s.*, case when r.driver_id=uid then to_jsonb(r) end receipt,
      coalesce(s.activation_truck_id,s.assigned_truck_id,a.truck_id) history_truck_id
    from closed s
    left join lateral (
      select x.* from public.remitos x where x.operator_service_id=s.service_id or x.remito_id=s.remito_id
      order by (x.status='firmado') desc, x.firmado_at desc nulls last,x.remito_id desc limit 1
    ) r on true
    left join lateral (
      select x.driver_id,x.truck_id from public.operator_service_assignments x
      where x.service_id=s.service_id and x.driver_id is not null and x.assigned_at<=s.history_at
      order by x.assigned_at desc,x.assignment_sequence desc nulls last,x.assignment_id desc limit 1
    ) a on true
    where coalesce(case when s.driver_activated then s.activation_driver_id end,
      r.driver_id,s.assigned_driver_id,a.driver_id)=uid
  ), legacy as (
    select distinct on (coalesce('s:'||r.operator_service_id::text,'r:'||r.remito_id::text)) r.*,
      coalesce(i.driver_activated,false) intake_activated,i.activation_reason_code intake_reason,
      i.activation_reason_detail intake_detail
    from public.remitos r
    left join public.driver_service_intakes i on i.intake_id=r.driver_intake_id and i.driver_id=uid
    where r.driver_id=uid
      and not (r.status='pendiente' and (r.driver_intake_id is not null or r.document_source='driver_ad_hoc') and r.operator_service_id is null)
      and not exists(select 1 from owned s where s.service_id=r.operator_service_id or s.remito_id=r.remito_id or (s.receipt->>'remito_id')::integer=r.remito_id)
    order by coalesce('s:'||r.operator_service_id::text,'r:'||r.remito_id::text),
      (r.status='firmado') desc,r.firmado_at desc nulls last,r.remito_id desc
  ), entries as (
    select 's:'||s.service_id::text key, s.history_at occurred_at,
      case when s.status='cancelled' then 'anulado' when s.driver_activated then 'activado' else 'finalizado' end history_state,
      s.receipt remito,
      jsonb_build_object('service_id',s.service_id,'service_order_number',s.service_order_number,
        'service_number',s.service_number,'status',s.status,'driver_activated',s.driver_activated,
        'activation_kind',s.activation_kind,'activation_reason_code',s.cancellation_reason_code,
        'activation_reason_detail',s.cancellation_reason_detail,'cancellation_reason_code',s.cancellation_reason_code,
        'cancellation_reason_detail',s.cancellation_reason_detail,'customer_name',s.customer_name,
        'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
        'origin',s.origin,'destination',s.destination,'scheduled_for',s.scheduled_for,
        'completed_at',s.completed_at,'cancelled_at',s.cancelled_at,'activated_at',s.activated_at,
        'concept_id',s.primary_concept_id,'concept_name',c.name,'truck_label',t.numero_interno,
        'document_status',s.document_status) service,
      null::jsonb intake
    from owned s left join public.service_concepts c on c.concept_id=s.primary_concept_id
    left join public.trucks t on t.truck_id=s.history_truck_id
    union all
    select 'r:'||r.remito_id::text,coalesce(r.firmado_at,r.created_at_device,r.created_at),
      case when r.intake_activated then 'activado' when r.status='anulado' then 'anulado'
        when r.status='cerrado_admin' then 'finalizado' else r.status end,
      to_jsonb(r)-'intake_activated'-'intake_reason'-'intake_detail',null,
      jsonb_build_object('driver_activated',r.intake_activated,'activation_reason_code',r.intake_reason,'activation_reason_detail',r.intake_detail)
    from legacy r
  ), filtered as materialized (
    select * from entries e
    where (coalesce(filters->>'estado','') in ('','todos') or e.history_state=filters->>'estado')
      and (from_day is null or e.occurred_at >= (from_day::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (until_day is null or e.occurred_at < (until_day::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (nullif(filters->>'patente','') is null or coalesce(e.service->>'vehicle_plate',e.remito->>'patente','') ilike '%'||(filters->>'patente')||'%')
      and (nullif(filters->>'tipoServicio','') is null
        or (filters->>'tipoServicio'='__sin__' and e.service is null and e.remito->>'operator_service_id' is null)
        or e.service->>'concept_id'=filters->>'tipoServicio' or e.remito->>'tipo_servicio'=filters->>'tipoServicio')
      and (nullif(filters->>'pagoMetodo','') is null or lower(filters->>'pagoMetodo') in (e.remito->>'pago_1_metodo',e.remito->>'pago_2_metodo'))
      and (nullif(btrim(filters->>'buscar'),'') is null or strpos(lower(concat_ws(' ',
        e.service->>'service_order_number',e.service->>'service_number',e.service->>'customer_name',
        e.service->>'vehicle_plate',e.service->>'origin',e.service->>'destination',
        e.remito->>'nro_remito',e.remito->>'nro_servicio',e.remito->>'razon_social',e.remito->>'patente',
        e.remito->>'origen',e.remito->>'destino')),lower(btrim(filters->>'buscar')))>0)
  ), totals as (select count(*) total from filtered), paging as (
    select total,least(greatest(1,coalesce(p_page,1)),greatest(1,ceil(total::numeric/page_size)::integer)) page from totals
  ), page_rows as (
    select * from filtered order by occurred_at desc nulls last,key desc
    limit page_size offset ((select page from paging)-1)*page_size
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc nulls last,key desc) from page_rows p),'[]'::jsonb),
    'total',paging.total,'page',paging.page,'page_size',page_size,
    'drafts',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at_device desc,r.remito_id desc)
      from public.remitos r where r.driver_id=uid and r.status='pendiente' and r.operator_service_id is null
        and (r.driver_intake_id is not null or r.document_source='driver_ad_hoc')),'[]'::jsonb))
  into result from paging;
  -- Enrich only the authorized, paginated rows. Existing receipt guard remains intact.
  for item in select value from jsonb_array_elements(result->'items') loop
    begin
    if item->'remito'->>'remito_id' is not null then
      tolls := public.get_driver_remito_history_v3((item->'remito'->>'remito_id')::integer);
    elsif item->'service'->>'service_id' is not null then
      tolls := jsonb_build_object('history_tolls',app_private.merge_history_tolls_v1(
        app_private.service_history_tolls_v1((item->'service'->>'service_id')::uuid),'[]'::jsonb,
        item->'service'->>'document_status' in ('approved','exception_approved')));
    else tolls := jsonb_build_object('history_tolls','[]'::jsonb); end if;
    exception when others then tolls := jsonb_build_object('load_error',true); end;
    enriched := enriched||jsonb_build_array(item||jsonb_build_object('tolls',jsonb_build_object(
      'history_tolls',tolls->'history_tolls','accepted_toll_total',tolls->'accepted_toll_total','load_error',coalesce((tolls->>'load_error')::boolean,false))));
  end loop;
  return result||jsonb_build_object('items',enriched);
end $f$;
revoke all on function public.list_driver_service_history_v1(integer,integer,jsonb) from public,anon;
grant execute on function public.list_driver_service_history_v1(integer,integer,jsonb) to authenticated;
