-- AuxiliOS · Facturación · cálculo canónico de servicios con peajes separados.

create or replace function app_private.calculate_operator_service_billing_quote_v2(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  s public.operator_services%rowtype;
  v_items jsonb:='[]'::jsonb;
  v_toll_rows integer:=0;
  v_toll_input numeric:=0;
  v_asphalt numeric:=0;
  v_gravel numeric:=0;
  v_service_quote jsonb;
  v_quote_with_legacy_toll jsonb;
  v_setting public.company_billing_settings%rowtype;
  v_service_amount numeric:=0;
  v_current numeric:=0;
  v_stored_raw numeric:=0;
  v_stored_toll numeric:=0;
  v_stored_toll_input numeric:=0;
  v_stored_service_amount numeric:=0;
  v_stored_amount numeric:=0;
  v_effective_toll numeric:=0;
  v_legacy_priced_toll numeric:=0;
  v_toll_billing_mode text:='with_service';
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

  select bs.* into v_setting
  from public.company_billing_settings bs
  where bs.company_id=s.company_id
    and bs.is_active
    and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
    and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
    and (bs.contract_id is null or bs.contract_id=s.contract_id)
  order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
  limit 1;
  if not found then raise exception 'La prestadora no tiene parámetros de facturación vigentes'; end if;

  v_toll_billing_mode:=coalesce(v_setting.toll_billing_mode,'with_service');

  -- El valor del servicio se calcula siempre sin peajes.
  v_service_quote:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,
    v_asphalt,v_gravel,0,s.is_holiday
  );

  -- Compatibilidad con tarifarios anteriores: si todavía definen un valor de peaje,
  -- se respeta. Caso contrario se usa el importe operativo real/estimado.
  v_quote_with_legacy_toll:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,
    v_asphalt,v_gravel,v_toll_input,s.is_holiday
  );
  v_legacy_priced_toll:=coalesce((v_quote_with_legacy_toll->>'toll_total')::numeric,0);
  v_effective_toll:=case
    when v_setting.toll_calculation_mode='not_applicable' then 0
    when v_legacy_priced_toll>0 then v_legacy_priced_toll
    else greatest(v_toll_input,0)
  end;

  v_service_amount:=coalesce((v_service_quote->>'company_estimated_total')::numeric,0);
  v_current:=v_service_amount+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end;

  -- El snapshot operativo no se reescribe. Para comparar importes, se normaliza
  -- con la misma regla contractual actual (servicio solo o servicio + peajes).
  v_stored_raw:=coalesce(nullif(s.pricing_snapshot->>'company_estimated_total','')::numeric,s.company_estimated_total,0);
  v_stored_toll:=coalesce(nullif(s.pricing_snapshot->>'toll_total','')::numeric,0);
  v_stored_toll_input:=case
    when v_setting.toll_calculation_mode='not_applicable' then 0
    when v_stored_toll>0 then v_stored_toll
    else coalesce(nullif(s.pricing_snapshot->>'toll_input','')::numeric,0)
  end;
  v_stored_service_amount:=greatest(v_stored_raw-v_stored_toll,0);
  v_stored_amount:=v_stored_service_amount+case when v_toll_billing_mode='with_service' then v_stored_toll_input else 0 end;

  return v_service_quote||jsonb_build_object(
    'service_id',s.service_id,
    'service_number',s.service_number,
    'toll_billing_mode',v_toll_billing_mode,
    'toll_total',round(v_effective_toll,2),
    'included_toll_amount',case when v_toll_billing_mode='with_service' then round(v_effective_toll,2) else 0 end,
    'separate_toll_amount',case when v_toll_billing_mode='separate' then round(v_effective_toll,2) else 0 end,
    'service_company_amount',round(v_service_amount,2),
    'company_amount_with_tolls',round(v_service_amount+v_effective_toll,2),
    'stored_company_amount',round(v_stored_amount,2),
    'current_company_amount',round(v_current,2),
    'company_estimated_total',round(v_current,2),
    'estimated_total',round(coalesce((v_service_quote->>'estimated_total')::numeric,0)+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end,2),
    'billing_delta',round(v_current-v_stored_amount,2),
    'billing_source','current_tariff_period',
    'operational_snapshot_calculated_at',s.pricing_snapshot->>'calculated_at'
  );
end;
$function$;

revoke all on function app_private.calculate_operator_service_billing_quote_v2(uuid) from public,anon,authenticated;
