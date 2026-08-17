-- AuxiliOS · Facturación · mesa administrativa v2
-- Prestadora + período + selección masiva. Correcciones posteriores a FINALIZADO sin reabrir recursos.

create or replace function app_private.calculate_operator_service_billing_quote_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  s public.operator_services%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_toll_rows integer:=0;
  v_toll_input numeric:=0;
  v_asphalt numeric:=0;
  v_gravel numeric:=0;
  q jsonb;
  v_current numeric:=0;
  v_stored numeric:=0;
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' then raise exception 'Sólo los servicios FINALIZADOS pueden ingresar a Facturación'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('concept_id',i.concept_id,'quantity',i.quantity) order by i.sort_order,i.created_at),'[]'::jsonb)
    into v_items
  from public.operator_service_items i
  where i.service_id=p_service_id and i.item_role='secondary';

  select count(*),coalesce(sum(case when t.payer_agent='provider' then t.total_amount else 0 end),0)
    into v_toll_rows,v_toll_input
  from public.operator_service_tolls t
  where t.service_id=p_service_id;

  if v_toll_rows=0 then
    v_toll_input:=coalesce(nullif(s.pricing_snapshot->>'toll_input','')::numeric,0);
  end if;

  if coalesce(s.estimated_asphalt_km,0)+coalesce(s.estimated_gravel_km,0)>0 then
    v_asphalt:=coalesce(s.estimated_asphalt_km,0);
    v_gravel:=coalesce(s.estimated_gravel_km,0);
  else
    v_asphalt:=coalesce(nullif(s.pricing_snapshot->>'distance_km','')::numeric,s.estimated_distance_km,0);
    v_gravel:=0;
  end if;

  q:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,
    v_asphalt,v_gravel,v_toll_input,s.is_holiday
  );
  v_current:=coalesce((q->>'company_estimated_total')::numeric,0);
  -- El snapshot de FINALIZADO es auditoría y jamás se pisa por una corrección administrativa posterior.
  v_stored:=coalesce(nullif(s.pricing_snapshot->>'company_estimated_total','')::numeric,s.company_estimated_total,0);

  return q||jsonb_build_object(
    'service_id',s.service_id,
    'service_number',s.service_number,
    'stored_company_amount',round(v_stored,2),
    'current_company_amount',round(v_current,2),
    'billing_delta',round(v_current-v_stored,2),
    'billing_source','current_tariff_period',
    'operational_snapshot_calculated_at',s.pricing_snapshot->>'calculated_at'
  );
end;
$$;
revoke all on function app_private.calculate_operator_service_billing_quote_v2(uuid) from public,anon,authenticated;

create or replace function public.list_operator_billing_services_v2(
  p_status text default null,
  p_search text default null,
  p_company_id uuid default null,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  r record;
  q jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_search text:=lower(trim(coalesce(p_search,'')));
  v_pending integer:=0; v_reviewed integer:=0;
  v_pending_amount numeric:=0; v_reviewed_amount numeric:=0;
  v_amount numeric:=0; v_error text;
  v_companies jsonb:='[]'::jsonb; v_periods jsonb:='[]'::jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturación'; end if;
  if p_status is not null and p_status not in ('pending','reviewed') then raise exception 'Estado de facturación inválido'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('company_id',x.company_id,'company_name',x.company_name) order by x.company_name),'[]'::jsonb)
    into v_companies
  from (
    select distinct s.company_id,coalesce(c.trade_name,c.legal_name,'Prestadora') company_name
    from public.operator_services s join public.companies c on c.company_id=s.company_id
    where s.status='completed' and s.billing_status in ('pending','reviewed')
  ) x;

  select coalesce(jsonb_agg(x.period order by x.period desc),'[]'::jsonb)
    into v_periods
  from (
    select distinct to_char(s.scheduled_for at time zone 'America/Argentina/Buenos_Aires','YYYY-MM') period
    from public.operator_services s
    where s.status='completed' and s.billing_status in ('pending','reviewed')
  ) x;

  for r in
    select s.service_id,s.service_number,s.service_order_number,s.scheduled_for,s.completed_at,
           s.billing_status,s.vehicle_plate,s.vehicle_make_model,s.customer_name,s.origin,s.destination,
           s.estimated_distance_km,s.estimated_asphalt_km,s.estimated_gravel_km,s.company_estimated_total,s.currency,
           s.remito_id,s.company_id,s.primary_concept_id,
           coalesce(c.trade_name,c.legal_name,'Prestadora') company_name,
           coalesce(sc.name,'Servicio') service_name,coalesce(b.name,'Sin base') billing_base_name,
           lr.company_amount last_reviewed_amount,lr.created_at last_reviewed_at,u.full_name last_reviewed_by
    from public.operator_services s
    join public.companies c on c.company_id=s.company_id
    left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
    left join public.billing_bases b on b.base_id=s.billing_base_id
    left join lateral (
      select rr.* from public.operator_service_billing_revisions rr
      where rr.service_id=s.service_id and rr.billing_status='reviewed'
      order by rr.created_at desc limit 1
    ) lr on true
    left join public.users u on u.user_id=lr.created_by
    where s.status='completed'
      and s.billing_status in ('pending','reviewed')
      and (p_status is null or s.billing_status=p_status)
      and (p_company_id is null or s.company_id=p_company_id)
      and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
      and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
      and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.vehicle_make_model,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,b.name,sc.name)) like '%'||v_search||'%')
    order by s.scheduled_for desc,s.service_number desc
  loop
    q:=null; v_error:=null;
    begin
      q:=app_private.calculate_operator_service_billing_quote_v2(r.service_id);
      v_amount:=coalesce((q->>'current_company_amount')::numeric,0);
    exception when others then
      v_error:=sqlerrm; v_amount:=coalesce(r.company_estimated_total,0);
    end;
    if r.billing_status='pending' then v_pending:=v_pending+1;v_pending_amount:=v_pending_amount+v_amount;
    else v_reviewed:=v_reviewed+1;v_reviewed_amount:=v_reviewed_amount+v_amount; end if;

    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'service_id',r.service_id,'service_number',r.service_number,'service_order_number',r.service_order_number,
      'scheduled_for',r.scheduled_for,'completed_at',r.completed_at,'billing_status',r.billing_status,
      'company_id',r.company_id,'company_name',r.company_name,'billing_base_name',r.billing_base_name,
      'service_name',r.service_name,'vehicle_plate',r.vehicle_plate,'vehicle_make_model',r.vehicle_make_model,
      'customer_name',r.customer_name,'origin',r.origin,'destination',r.destination,
      'km',round(coalesce(nullif(r.estimated_asphalt_km+r.estimated_gravel_km,0),r.estimated_distance_km,0),2),
      'stored_company_amount',case when q is null then round(coalesce(r.company_estimated_total,0),2) else (q->>'stored_company_amount')::numeric end,
      'current_company_amount',round(v_amount,2),'billing_delta',case when q is null then null else (q->>'billing_delta')::numeric end,
      'currency',coalesce(q->>'currency',r.currency,'ARS'),'pricing_error',v_error,
      'last_reviewed_amount',r.last_reviewed_amount,'last_reviewed_at',r.last_reviewed_at,'last_reviewed_by',r.last_reviewed_by
    ));
  end loop;

  return jsonb_build_object(
    'rows',v_rows,
    'kpis',jsonb_build_object('pending_count',v_pending,'pending_amount',round(v_pending_amount,2),'reviewed_count',v_reviewed,'reviewed_amount',round(v_reviewed_amount,2)),
    'filters',jsonb_build_object('companies',v_companies,'periods',v_periods)
  );
end;
$$;

create or replace function public.get_operator_billing_service_detail_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); v_service jsonb; q jsonb; v_revisions jsonb;
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Facturación'; end if;
  select jsonb_build_object(
    'service_id',s.service_id,'service_number',s.service_number,'service_order_number',s.service_order_number,
    'scheduled_for',s.scheduled_for,'completed_at',s.completed_at,'billing_status',s.billing_status,
    'company_id',s.company_id,'company_name',coalesce(c.trade_name,c.legal_name),'service_name',sc.name,
    'billing_base_name',b.name,'vehicle_plate',s.vehicle_plate,'vehicle_make_model',s.vehicle_make_model,
    'customer_name',s.customer_name,'origin',s.origin,'destination',s.destination,
    'estimated_distance_km',s.estimated_distance_km,'estimated_asphalt_km',s.estimated_asphalt_km,'estimated_gravel_km',s.estimated_gravel_km,
    'remito_id',s.remito_id,'operator_notes',s.operator_notes,
    'operational_pricing_snapshot',s.pricing_snapshot,'operational_billing_snapshot',s.billing_snapshot
  ) into v_service
  from public.operator_services s
  join public.companies c on c.company_id=s.company_id
  left join public.service_concepts sc on sc.concept_id=s.primary_concept_id
  left join public.billing_bases b on b.base_id=s.billing_base_id
  where s.service_id=p_service_id and s.status='completed' and s.billing_status in ('pending','reviewed');
  if v_service is null then raise exception 'Servicio no disponible en Facturación'; end if;
  q:=app_private.calculate_operator_service_billing_quote_v2(p_service_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision_id',r.revision_id,'billing_status',r.billing_status,'previous_company_amount',r.previous_company_amount,
    'company_amount',r.company_amount,'currency',r.currency,'rate_card_id',r.rate_card_id,'rate_card_version',r.rate_card_version,
    'reason',r.reason,'created_by',r.created_by,'created_by_name',u.full_name,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb) into v_revisions
  from public.operator_service_billing_revisions r left join public.users u on u.user_id=r.created_by where r.service_id=p_service_id;
  return jsonb_build_object('service',v_service,'current_quote',q,'revisions',v_revisions);
end;
$$;

create or replace function public.review_operator_billing_service_v2(p_service_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); s public.operator_services%rowtype; q jsonb; v_amount numeric; v_previous numeric;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Solo Administración o Facturación puede revisar servicios'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' or s.billing_status<>'pending' then raise exception 'Sólo un servicio FINALIZADO y PENDIENTE puede marcarse REVISADO'; end if;
  q:=app_private.calculate_operator_service_billing_quote_v2(p_service_id);
  v_amount:=coalesce((q->>'current_company_amount')::numeric,0);
  v_previous:=coalesce((select r.company_amount from public.operator_service_billing_revisions r where r.service_id=p_service_id order by r.created_at desc limit 1),(q->>'stored_company_amount')::numeric,0);
  insert into public.operator_service_billing_revisions(service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason)
  values(p_service_id,'reviewed',round(v_previous,2),round(v_amount,2),coalesce(q->>'currency',s.currency,'ARS'),q,nullif(q->>'rate_card_id','')::uuid,nullif(q->>'rate_card_version','')::integer,nullif(trim(coalesce(p_notes,'')),''));
  update public.operator_services set billing_status='reviewed',contract_id=nullif(q->>'contract_id','')::uuid,rate_card_id=nullif(q->>'rate_card_id','')::uuid,
    currency=coalesce(q->>'currency',currency),base_subtotal=coalesce((q->>'base_subtotal')::numeric,base_subtotal),surcharge_total=coalesce((q->>'surcharge_total')::numeric,surcharge_total),
    toll_total=coalesce((q->>'toll_total')::numeric,toll_total),copay_total=coalesce((q->>'copay_total')::numeric,copay_total),estimated_total=coalesce((q->>'estimated_total')::numeric,estimated_total),
    company_estimated_total=v_amount,updated_by=auth.uid(),updated_at=now() where service_id=p_service_id;
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'billing_reviewed','completed','completed','Servicio revisado para Facturación',auth.uid(),jsonb_build_object('billing_status','reviewed','company_amount',v_amount));
  return public.get_operator_billing_service_detail_v2(p_service_id);
end;
$$;

create or replace function public.review_operator_billing_services_bulk_v2(p_service_ids uuid[],p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); v_count integer; v_company_count integer; v_id uuid; v_done integer:=0;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para revisión masiva'; end if;
  if coalesce(array_length(p_service_ids,1),0)=0 then raise exception 'Seleccioná al menos un servicio'; end if;
  select count(*),count(distinct company_id) into v_count,v_company_count
  from public.operator_services where service_id=any(p_service_ids) and status='completed' and billing_status='pending';
  if v_count<>array_length(p_service_ids,1) then raise exception 'La selección contiene servicios que ya no están PENDIENTES'; end if;
  if v_company_count<>1 then raise exception 'No se pueden procesar juntas diferentes prestadoras'; end if;
  foreach v_id in array p_service_ids loop perform public.review_operator_billing_service_v2(v_id,p_notes);v_done:=v_done+1;end loop;
  return jsonb_build_object('reviewed_count',v_done);
end;
$$;

create or replace function public.revert_operator_billing_service_v2(p_service_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); s public.operator_services%rowtype; q jsonb; v_reason text:=nullif(btrim(coalesce(p_reason,'')),''); v_amount numeric;
begin
  if v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para revertir Facturación'; end if;
  if v_reason is null or length(v_reason)<5 then raise exception 'Indicá el motivo de la reversión'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' or s.billing_status not in ('pending','reviewed') then raise exception 'El servicio ya no puede revertirse desde Facturación'; end if;
  begin q:=app_private.calculate_operator_service_billing_quote_v2(p_service_id);v_amount:=coalesce((q->>'current_company_amount')::numeric,s.company_estimated_total,0); exception when others then q:='{}'::jsonb;v_amount:=coalesce(s.company_estimated_total,0);end;
  update public.operator_services set billing_status='not_ready',updated_by=auth.uid(),updated_at=now() where service_id=p_service_id;
  insert into public.operator_service_billing_revisions(service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason)
  values(p_service_id,'excluded',v_amount,v_amount,coalesce(q->>'currency',s.currency,'ARS'),q,nullif(q->>'rate_card_id','')::uuid,nullif(q->>'rate_card_version','')::integer,'Revertido a Servicios: '||v_reason);
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'billing_reverted','completed','completed','Revertido de Facturación a Servicios',auth.uid(),jsonb_build_object('reason',v_reason,'billing_status','not_ready'));
  return jsonb_build_object('service_id',p_service_id,'billing_status','not_ready');
end;
$$;

-- Permite la anulación administrativa excepcional de un FINALIZADO sin habilitar reaperturas operativas.
create or replace function app_private.operator_services_before_update()
returns trigger
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role();
  v_bridge boolean:=coalesce(current_setting('app.phase3_bridge',true),'')='1';
  v_transition text:=coalesce(current_setting('app.lifecycle_transition',true),'');
  v_billing_admin boolean:=coalesce(current_setting('app.billing_admin_transition',true),'')='annul_completed';
begin
  if old.status in ('completed','cancelled') and new.status is distinct from old.status then
    if not (old.status='completed' and new.status='cancelled' and v_billing_admin and v_role='administracion') then
      raise exception 'El servicio está cerrado y su estado operativo no puede reabrirse';
    end if;
  end if;
  if new.status is distinct from old.status and not v_bridge then
    if old.status='pending' and new.status='assigned' then if new.assigned_driver_id is null or new.assigned_truck_id is null then raise exception 'Para asignar el servicio se requieren Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='pending' then if new.assigned_driver_id is not null or new.assigned_truck_id is not null then raise exception 'Para volver a Sin asignar deben liberarse Chofer y Móvil'; end if;
    elsif old.status='assigned' and new.status='at_origin' and v_transition in ('manual_arrival','signature_arrival') then null;
    elsif old.status in ('assigned','at_origin') and new.status='completed' and v_transition='finalize' then null;
    elsif old.status in ('pending','assigned','at_origin') and new.status='cancelled' and v_transition='annul' then null;
    elsif old.status='completed' and new.status='cancelled' and v_billing_admin and v_role='administracion' then null;
    else raise exception 'Transición de estado no permitida'; end if;
  end if;
  if not v_bridge and v_role='chofer' then
    if old.assigned_driver_id is distinct from auth.uid() then raise exception 'Servicio no asignado al chofer actual'; end if;
    if new.status is distinct from old.status then raise exception 'El estado del servicio se actualiza mediante la firma del remito'; end if;
    if (to_jsonb(new)-array['driver_notes','updated_at','updated_by']) is distinct from (to_jsonb(old)-array['driver_notes','updated_at','updated_by']) then raise exception 'El chofer solo puede completar el remito y registrar sus datos operativos habilitados'; end if;
  end if;
  if new.status='cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at:=coalesce(new.cancelled_at,now());new.billing_status:='not_ready'; elsif new.status<>'cancelled' then new.cancelled_at:=null; end if;
  if new.status='completed' and old.status is distinct from 'completed' then new.completed_at:=coalesce(new.completed_at,now());new.billing_status:='pending'; end if;
  if new.status='at_origin' and old.status is distinct from 'at_origin' then new.arrived_at:=coalesce(new.arrived_at,now());new.arrived_by:=coalesce(new.arrived_by,auth.uid()); end if;
  if new.assigned_driver_id is not null and (old.assigned_driver_id is distinct from new.assigned_driver_id or old.assigned_truck_id is distinct from new.assigned_truck_id) then new.assigned_at:=now();if v_role in ('administracion','operador','supervision') then new.assigned_by:=auth.uid();end if;end if;
  if new.assigned_driver_id is null and new.assigned_truck_id is null and new.status='assigned' and old.status='assigned' then new.status:='pending';end if;
  new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by,old.updated_by);return new;
end;
$$;

create or replace function public.annul_operator_billing_service_v2(p_service_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); s public.operator_services%rowtype; v_reason text:=nullif(btrim(coalesce(p_reason,'')),''); v_amount numeric;
begin
  if v_role<>'administracion' then raise exception 'Sólo Administración puede anular un servicio FINALIZADO'; end if;
  if v_reason is null or length(v_reason)<5 then raise exception 'Indicá el motivo de la anulación'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' or s.billing_status not in ('pending','reviewed') then raise exception 'El servicio ya no puede anularse desde Facturación'; end if;
  v_amount:=coalesce((select r.company_amount from public.operator_service_billing_revisions r where r.service_id=p_service_id order by r.created_at desc limit 1),s.company_estimated_total,0);
  perform set_config('app.billing_admin_transition','annul_completed',true);
  update public.operator_services set status='cancelled',billing_status='not_ready',cancellation_reason_code='billing_admin',cancellation_reason_detail=v_reason,
    cancellation_reason='Anulación administrativa: '||v_reason,assigned_driver_id=null,assigned_truck_id=null,updated_by=auth.uid() where service_id=p_service_id;
  insert into public.operator_service_billing_revisions(service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,reason)
  values(p_service_id,'excluded',v_amount,v_amount,coalesce(s.currency,'ARS'),'{}'::jsonb,'Anulado desde Facturación: '||v_reason);
  return jsonb_build_object('service_id',p_service_id,'status','cancelled','billing_status','not_ready');
end;
$$;

create or replace function public.update_operator_billing_service_v2(p_service_id uuid,p_payload jsonb,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare
  v_role text:=app_private.current_auxilios_role(); v_uid uuid:=auth.uid(); s public.operator_services%rowtype;
  p jsonb:=coalesce(p_payload,'{}'::jsonb); v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_company uuid; v_base uuid; v_primary uuid; v_scheduled timestamptz; v_date date; v_provider_code text;
  v_asphalt numeric; v_gravel numeric; v_items jsonb; v_item_codes jsonb; v_is_holiday boolean;
  v_commercial jsonb; v_toll_input numeric:=0; q jsonb; v_component jsonb; v_primary_row public.service_concepts%rowtype; v_category uuid; v_setting public.company_billing_settings%rowtype;
  v_instance text; v_before jsonb; v_after jsonb; v_changed text[]; v_previous numeric; v_new numeric;
begin
  if v_role<>'administracion' or v_uid is null then raise exception 'Sólo Administración puede modificar un servicio FINALIZADO'; end if;
  if v_reason is null or length(v_reason)<5 then raise exception 'Indicá el motivo de la corrección'; end if;
  if p ? 'assigned_driver_id' or p ? 'assigned_truck_id' then raise exception 'Chofer y Móvil no pueden modificarse en un servicio FINALIZADO'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status<>'completed' or s.billing_status not in ('not_ready','pending','reviewed') then raise exception 'El servicio ya no admite corrección administrativa'; end if;

  v_company:=case when p?'company_id' then nullif(p->>'company_id','')::uuid else s.company_id end;
  v_base:=case when p?'billing_base_id' then nullif(p->>'billing_base_id','')::uuid else s.billing_base_id end;
  v_primary:=case when p?'primary_concept_id' then nullif(p->>'primary_concept_id','')::uuid else s.primary_concept_id end;
  v_scheduled:=case when p?'scheduled_for' then nullif(p->>'scheduled_for','')::timestamptz else s.scheduled_for end;
  v_provider_code:=case when p?'service_order_number' then nullif(btrim(p->>'service_order_number'),'') else s.service_order_number end;
  v_asphalt:=case when p?'estimated_asphalt_km' then greatest(coalesce(nullif(p->>'estimated_asphalt_km','')::numeric,0),0) else coalesce(s.estimated_asphalt_km,s.estimated_distance_km,0) end;
  v_gravel:=case when p?'estimated_gravel_km' then greatest(coalesce(nullif(p->>'estimated_gravel_km','')::numeric,0),0) else coalesce(s.estimated_gravel_km,0) end;
  v_is_holiday:=case when p?'is_holiday' then coalesce((p->>'is_holiday')::boolean,false) else s.is_holiday end;
  if v_provider_code is null then raise exception 'El código de prestadora es obligatorio'; end if;
  v_date:=(v_scheduled at time zone 'America/Argentina/Buenos_Aires')::date;

  if p?'items' then v_items:=coalesce(p->'items','[]'::jsonb); else
    select coalesce(jsonb_agg(jsonb_build_object('concept_id',concept_id,'quantity',quantity) order by sort_order),'[]'::jsonb) into v_items
    from public.operator_service_items where service_id=p_service_id and item_role='secondary';
  end if;
  if p?'item_codes' then v_item_codes:=coalesce(p->'item_codes','{}'::jsonb); else
    select coalesce(jsonb_object_agg(concept_id::text,instance_code),'{}'::jsonb) into v_item_codes
    from public.operator_service_items where service_id=p_service_id and item_role='secondary' and instance_code is not null;
  end if;

  if p?'commercial_addons' then
    v_commercial:=app_private.normalize_service_commercial_addons_v1(v_company,v_scheduled,p->'commercial_addons');
    v_toll_input:=coalesce((v_commercial->>'provider_toll_total')::numeric,0);
  else
    select coalesce(sum(case when payer_agent='provider' then total_amount else 0 end),0) into v_toll_input from public.operator_service_tolls where service_id=p_service_id;
    if v_toll_input=0 then v_toll_input:=coalesce(nullif(s.pricing_snapshot->>'toll_input','')::numeric,0); end if;
  end if;

  q:=app_private.calculate_operator_service_quote_v4_full(v_company,v_base,v_scheduled,v_primary,v_items,v_asphalt,v_gravel,v_toll_input,v_is_holiday);
  select * into v_primary_row from public.service_concepts where concept_id=v_primary;
  select c.category_id into v_category from public.service_categories c where c.legacy_primary_concept_id=v_primary and c.is_active order by c.sort_order limit 1;
  select bs.* into v_setting from public.company_billing_settings bs where bs.company_id=v_company and bs.is_active and bs.valid_from<=v_date and (bs.valid_until is null or bs.valid_until>=v_date) order by (bs.contract_id is not null) desc,bs.valid_from desc,bs.created_at desc limit 1;
  if not found then raise exception 'La prestadora no tiene parámetros de facturación vigentes'; end if;

  v_before:=to_jsonb(s)-array['pricing_snapshot','billing_snapshot'];
  update public.operator_services set
    company_id=v_company,billing_base_id=v_base,billing_setting_id=v_setting.billing_setting_id,
    primary_concept_id=v_primary,category_id=v_category,service_order_number=v_provider_code,scheduled_for=v_scheduled,
    priority=case when p?'priority' then coalesce(nullif(lower(btrim(p->>'priority')),''),priority) else priority end,
    logistics_type=case when p?'logistics_type' then coalesce(nullif(lower(btrim(p->>'logistics_type')),''),logistics_type) else logistics_type end,
    customer_name=case when p?'customer_name' then nullif(btrim(p->>'customer_name'),'') else customer_name end,
    customer_phone=case when p?'customer_phone' then nullif(btrim(p->>'customer_phone'),'') else customer_phone end,
    customer_email=case when p?'customer_email' then nullif(btrim(p->>'customer_email'),'') else customer_email end,
    vehicle_plate=case when p?'vehicle_plate' then upper(nullif(btrim(p->>'vehicle_plate'),'')) else vehicle_plate end,
    vehicle_make_model=case when p?'vehicle_make_model' then nullif(btrim(p->>'vehicle_make_model'),'') else vehicle_make_model end,
    origin=case when p?'origin' then btrim(p->>'origin') else origin end,destination=case when p?'destination' then btrim(p->>'destination') else destination end,
    origin_lat=case when p?'origin_lat' then nullif(p->>'origin_lat','')::numeric else origin_lat end,origin_lng=case when p?'origin_lng' then nullif(p->>'origin_lng','')::numeric else origin_lng end,
    destination_lat=case when p?'destination_lat' then nullif(p->>'destination_lat','')::numeric else destination_lat end,destination_lng=case when p?'destination_lng' then nullif(p->>'destination_lng','')::numeric else destination_lng end,
    origin_place_id=case when p?'origin_place_id' then nullif(p->>'origin_place_id','') else origin_place_id end,destination_place_id=case when p?'destination_place_id' then nullif(p->>'destination_place_id','') else destination_place_id end,
    origin_formatted_address=case when p?'origin_formatted_address' then nullif(p->>'origin_formatted_address','') else origin_formatted_address end,destination_formatted_address=case when p?'destination_formatted_address' then nullif(p->>'destination_formatted_address','') else destination_formatted_address end,
    estimated_asphalt_km=v_asphalt,estimated_gravel_km=v_gravel,estimated_distance_km=v_asphalt+v_gravel,is_holiday=v_is_holiday,
    estimated_arrival_at=case when p?'estimated_arrival_at' then nullif(p->>'estimated_arrival_at','')::timestamptz else estimated_arrival_at end,
    estimated_finish_at=case when p?'estimated_finish_at' then nullif(p->>'estimated_finish_at','')::timestamptz else estimated_finish_at end,
    granted_delay_minutes=case when p?'granted_delay_minutes' then greatest(coalesce(nullif(p->>'granted_delay_minutes','')::integer,0),0) else granted_delay_minutes end,
    operator_notes=case when p?'operator_notes' then nullif(btrim(p->>'operator_notes'),'') else operator_notes end,
    driver_instructions=case when p?'driver_instructions' then nullif(btrim(p->>'driver_instructions'),'') else driver_instructions end,
    route_distance_meters=case when p?'route_distance_meters' then nullif(p->>'route_distance_meters','')::integer else route_distance_meters end,
    route_duration_seconds=case when p?'route_duration_seconds' then nullif(p->>'route_duration_seconds','')::integer else route_duration_seconds end,
    route_toll_estimate=case when p?'route_toll_estimate' then nullif(p->>'route_toll_estimate','')::numeric else route_toll_estimate end,
    route_toll_currency=case when p?'route_toll_currency' then nullif(p->>'route_toll_currency','') else route_toll_currency end,
    route_provider=case when p?'route_provider' then nullif(p->>'route_provider','') else route_provider end,
    route_calculated_at=case when p?'route_calculated_at' then nullif(p->>'route_calculated_at','')::timestamptz else route_calculated_at end,
    route_legs=case when p?'route_legs' then coalesce(p->'route_legs','[]'::jsonb) else route_legs end,
    contract_id=nullif(q->>'contract_id','')::uuid,rate_card_id=nullif(q->>'rate_card_id','')::uuid,currency=coalesce(q->>'currency',currency),
    base_subtotal=coalesce((q->>'base_subtotal')::numeric,0),surcharge_total=coalesce((q->>'surcharge_total')::numeric,0),toll_total=coalesce((q->>'toll_total')::numeric,0),copay_total=coalesce((q->>'copay_total')::numeric,0),
    estimated_total=coalesce((q->>'estimated_total')::numeric,0),company_estimated_total=coalesce((q->>'company_estimated_total')::numeric,0),
    billing_status='pending',updated_by=v_uid,updated_at=now()
  where service_id=p_service_id returning * into s;

  delete from public.operator_service_items where service_id=p_service_id;
  insert into public.operator_service_items(service_id,concept_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id)
  values(p_service_id,v_primary,'primary',v_primary_row.code,v_provider_code,v_primary_row.name,'service',1,0,0,0,'general',jsonb_build_object('role','primary','concept_id',v_primary,'service_name',v_primary_row.name,'provider_code',v_provider_code,'pricing_model','rate_card_v4'),0,v_category);
  for v_component in select value from jsonb_array_elements(coalesce(q->'components','[]'::jsonb)) loop
    if coalesce((v_component->>'requires_own_code')::boolean,false) then v_instance:=nullif(btrim(coalesce(v_item_codes->>(v_component->>'concept_id'),'')),'');if v_instance is null then raise exception 'El servicio % requiere código propio de prestadora',v_component->>'service_name';end if;else v_instance:=v_provider_code;end if;
    insert into public.operator_service_items(service_id,concept_id,rate_item_id,item_role,service_code,instance_code,service_name,pricing_unit,quantity,unit_price,list_unit_price,subtotal,price_source,snapshot,sort_order,category_id)
    values(p_service_id,(v_component->>'concept_id')::uuid,nullif(v_component->>'rate_item_id','')::uuid,v_component->>'role',v_component->>'service_code',v_instance,v_component->>'service_name',v_component->>'pricing_unit',(v_component->>'quantity')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'subtotal')::numeric,coalesce(nullif(v_component->>'price_source',''),'general'),v_component,case v_component->>'role' when 'movement' then 10 when 'distance' then 20 else 30 end,v_category);
  end loop;
  if p?'commercial_addons' then perform app_private.persist_service_commercial_addons_v1(p_service_id,v_commercial); end if;

  if s.trip_id is not null then update public.trips set nro_servicio=coalesce(nullif(s.service_order_number,''),s.service_number),patente=s.vehicle_plate,tipo_servicio=coalesce(v_primary_row.name,tipo_servicio),origin=s.origin,destination=s.destination,notes=concat_ws(E'\n',nullif(notes,''),'Corrección administrativa posterior a FINALIZADO: '||v_reason),received_at=now(),sync_status='synced' where trip_id=s.trip_id;end if;
  if s.remito_id is not null then update public.remitos set nro_servicio=coalesce(nullif(s.service_order_number,''),nro_servicio),patente=coalesce(nullif(s.vehicle_plate,''),patente),marca_modelo=s.vehicle_make_model,razon_social=s.customer_name,telefono=s.customer_phone,email_cliente=s.customer_email,tipo_servicio=coalesce(v_primary_row.name,tipo_servicio),origen=s.origin,destino=s.destination,historial_ediciones=coalesce(historial_ediciones,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('edited_at',now(),'edited_by',v_uid,'reason',v_reason,'source','billing_correction')),received_at=now(),sync_status='synced' where remito_id=s.remito_id;end if;

  v_after:=to_jsonb(s)-array['pricing_snapshot','billing_snapshot'];
  select coalesce(array_agg(k),'{}'::text[]) into v_changed from (select jsonb_object_keys(p) k union select 'billing_status') z;
  insert into public.operator_service_changes(service_id,service_status,trip_id,remito_id,changed_fields,before_values,after_values,change_reason,changed_by,is_test)
  values(p_service_id,'completed',s.trip_id,s.remito_id,v_changed,v_before,v_after,v_reason,v_uid,s.is_test);
  insert into public.operator_service_events(service_id,event_type,from_status,to_status,notes,created_by,details)
  values(p_service_id,'billing_service_edit','completed','completed','Corrección administrativa posterior a FINALIZADO',v_uid,jsonb_build_object('reason',v_reason,'fields',to_jsonb(v_changed),'billing_status','pending'));

  v_previous:=coalesce((select r.company_amount from public.operator_service_billing_revisions r where r.service_id=p_service_id order by r.created_at desc limit 1),(q->>'stored_company_amount')::numeric,0);
  v_new:=coalesce((q->>'company_estimated_total')::numeric,0);
  insert into public.operator_service_billing_revisions(service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason)
  values(p_service_id,'pending',round(v_previous,2),round(v_new,2),coalesce(q->>'currency','ARS'),q,nullif(q->>'rate_card_id','')::uuid,nullif(q->>'rate_card_version','')::integer,'Corrección administrativa: '||v_reason);
  return jsonb_build_object('service_id',p_service_id,'service_number',s.service_number,'status','completed','billing_status','pending','changed_fields',to_jsonb(v_changed));
end;
$$;

-- Conservamos el editor canónico: sólo ampliamos el contexto para Administración sobre FINALIZADOS no facturados.
do $$
begin
  if to_regprocedure('public.get_operator_service_edit_context_base_v2(uuid)') is null then
    alter function public.get_operator_service_edit_context(uuid) rename to get_operator_service_edit_context_base_v2;
  end if;
  if to_regprocedure('public.update_operator_service_base_v2(uuid,jsonb,text)') is null then
    alter function public.update_operator_service(uuid,jsonb,text) rename to update_operator_service_base_v2;
  end if;
end;
$$;
revoke all on function public.get_operator_service_edit_context_base_v2(uuid) from anon,authenticated;
revoke all on function public.update_operator_service_base_v2(uuid,jsonb,text) from anon,authenticated;

create or replace function public.get_operator_service_edit_context(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare v_role text:=app_private.current_auxilios_role(); s public.operator_services%rowtype; ctx jsonb;
begin
  ctx:=public.get_operator_service_edit_context_base_v2(p_service_id);
  select * into s from public.operator_services where service_id=p_service_id;
  if v_role='administracion' and s.status='completed' and s.billing_status in ('not_ready','pending','reviewed') then
    ctx:=jsonb_set(ctx,'{locks}',coalesce(ctx->'locks','{}'::jsonb)||jsonb_build_object('closed',false,'can_edit',true,'requires_reason',true,'billing_correction',true),true);
  end if;
  return ctx;
end;
$$;

create or replace function public.update_operator_service(p_service_id uuid,p_payload jsonb,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $$
declare s public.operator_services%rowtype;
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status='completed' then return public.update_operator_billing_service_v2(p_service_id,p_payload,p_reason); end if;
  return public.update_operator_service_base_v2(p_service_id,p_payload,p_reason);
end;
$$;

revoke all on function public.list_operator_billing_services_v2(text,text,uuid,date,date) from public,anon;
revoke all on function public.get_operator_billing_service_detail_v2(uuid) from public,anon;
revoke all on function public.review_operator_billing_service_v2(uuid,text) from public,anon;
revoke all on function public.review_operator_billing_services_bulk_v2(uuid[],text) from public,anon;
revoke all on function public.revert_operator_billing_service_v2(uuid,text) from public,anon;
revoke all on function public.annul_operator_billing_service_v2(uuid,text) from public,anon;
revoke all on function public.update_operator_billing_service_v2(uuid,jsonb,text) from public,anon;
revoke all on function public.get_operator_service_edit_context(uuid) from public,anon;
revoke all on function public.update_operator_service(uuid,jsonb,text) from public,anon;
grant execute on function public.list_operator_billing_services_v2(text,text,uuid,date,date) to authenticated;
grant execute on function public.get_operator_billing_service_detail_v2(uuid) to authenticated;
grant execute on function public.review_operator_billing_service_v2(uuid,text) to authenticated;
grant execute on function public.review_operator_billing_services_bulk_v2(uuid[],text) to authenticated;
grant execute on function public.revert_operator_billing_service_v2(uuid,text) to authenticated;
grant execute on function public.annul_operator_billing_service_v2(uuid,text) to authenticated;
grant execute on function public.update_operator_billing_service_v2(uuid,jsonb,text) to authenticated;
grant execute on function public.get_operator_service_edit_context(uuid) to authenticated;
grant execute on function public.update_operator_service(uuid,jsonb,text) to authenticated;

-- Retiramos RPC v1 ya reemplazadas. La migración histórica se conserva en Git.
drop function if exists public.list_operator_billing_services_v1(text,text);
drop function if exists public.get_operator_billing_service_detail_v1(uuid);
drop function if exists public.review_operator_billing_service_v1(uuid,text);
drop function if exists app_private.calculate_operator_service_billing_quote_v1(uuid);
