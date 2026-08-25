-- AuxiliOS · Facturación · sector Peajes para prestadoras con facturación separada.

create or replace function public.list_operator_billing_tolls_v1(
  p_search text default null,
  p_company_id uuid default null,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_search text:=lower(trim(coalesce(p_search,'')));
begin
  if v_role not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso para consultar Peajes de Facturación'; end if;
  if p_period_start is not null and p_period_end is not null and p_period_start>p_period_end then raise exception 'Período inválido'; end if;

  return jsonb_build_object(
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'service_toll_id',t.service_toll_id,
        'toll_id',t.toll_id,
        'service_id',s.service_id,
        'service_number',s.service_number,
        'service_order_number',s.service_order_number,
        'scheduled_for',s.scheduled_for,
        'completed_at',s.completed_at,
        'service_billing_status',s.billing_status,
        'company_id',s.company_id,
        'company_name',coalesce(c.trade_name,c.legal_name,'Prestadora'),
        'billing_base_name',coalesce(b.name,'Sin base'),
        'origin',s.origin,
        'destination',s.destination,
        'customer_name',s.customer_name,
        'vehicle_plate',s.vehicle_plate,
        'toll_name',coalesce(t.toll_name_snapshot,'Peaje'),
        'road',t.road_snapshot,
        'direction',t.direction_snapshot,
        'quantity',coalesce(t.quantity,1),
        'amount',coalesce(t.total_amount,0),
        'currency',coalesce(t.currency,s.currency,'ARS'),
        'source',t.source,
        'payment_method',t.payment_method,
        'crossed_at',t.crossed_at,
        'payer_agent',t.payer_agent
      ) order by s.scheduled_for desc,t.created_at desc)
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases b on b.base_id=s.billing_base_id
      join lateral (
        select bs.toll_billing_mode,bs.toll_calculation_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate' and cfg.toll_calculation_mode<>'not_applicable'
      where s.status='completed'
        and s.billing_status in ('pending','reviewed')
        and t.payer_agent='provider'
        and coalesce(t.total_amount,0)>0
        and (p_company_id is null or s.company_id=p_company_id)
        and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
        and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,t.toll_name_snapshot,t.road_snapshot,t.direction_snapshot,t.notes)) like '%'||v_search||'%')
    ),'[]'::jsonb),
    'total_amount',coalesce((
      select sum(coalesce(t.total_amount,0))
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join lateral (
        select bs.toll_billing_mode,bs.toll_calculation_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate' and cfg.toll_calculation_mode<>'not_applicable'
      where s.status='completed'
        and s.billing_status in ('pending','reviewed')
        and t.payer_agent='provider'
        and coalesce(t.total_amount,0)>0
        and (p_company_id is null or s.company_id=p_company_id)
        and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
    ),0)
  );
end;
$function$;

revoke all on function public.list_operator_billing_tolls_v1(text,uuid,date,date) from public,anon;
grant execute on function public.list_operator_billing_tolls_v1(text,uuid,date,date) to authenticated;
