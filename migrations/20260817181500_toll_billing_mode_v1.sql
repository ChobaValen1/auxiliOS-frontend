-- AuxiliOS · Facturación · tratamiento contractual de peajes v1
-- Separa cómo se obtiene el importe del peaje de cómo se factura a cada prestadora.

alter table public.company_billing_settings
  add column if not exists toll_billing_mode text not null default 'with_service';

alter table public.company_billing_settings
  drop constraint if exists company_billing_settings_toll_billing_mode_check;

alter table public.company_billing_settings
  add constraint company_billing_settings_toll_billing_mode_check
  check (toll_billing_mode in ('with_service','separate'));

comment on column public.company_billing_settings.toll_billing_mode is
  'Tratamiento contractual del peaje: with_service suma el peaje al total del servicio; separate lo excluye del importe del servicio y lo deriva al circuito Facturación > Peajes.';

create or replace function public.save_company_billing_configuration(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_id uuid:=nullif(p_payload->>'billing_setting_id','')::uuid;
  v_company uuid:=nullif(p_payload->>'company_id','')::uuid;
  v_contract uuid:=nullif(p_payload->>'contract_id','')::uuid;
  v_from date:=coalesce(nullif(p_payload->>'valid_from','')::date,current_date);
  v_until date:=nullif(p_payload->>'valid_until','')::date;
  v_active boolean:=coalesce((p_payload->>'is_active')::boolean,true);
  v_radius numeric:=nullif(p_payload->>'covered_radius_km','')::numeric;
  v_movement_until numeric:=nullif(p_payload->>'movement_charge_until_km','')::numeric;
  v_toll_billing_mode text:=coalesce(nullif(p_payload->>'toll_billing_mode',''),'with_service');
  v_bases jsonb:=coalesce(p_payload->'bases','[]'::jsonb);
  v_entry jsonb;
  v_saved public.company_billing_settings%rowtype;
begin
  if v_role<>'administracion' then raise exception 'Solo Administración puede modificar la configuración de facturación'; end if;
  if v_company is null or not exists(select 1 from public.companies where company_id=v_company) then raise exception 'Seleccioná una empresa válida'; end if;
  if v_contract is not null and not exists(select 1 from public.company_contracts where contract_id=v_contract and company_id=v_company) then raise exception 'El contrato no pertenece a la empresa'; end if;
  if v_until is not null and v_until<v_from then raise exception 'La fecha hasta no puede ser anterior a la fecha desde'; end if;
  if v_radius is not null and v_radius<0 then raise exception 'El radio cubierto no puede ser negativo'; end if;
  if v_movement_until is not null and v_movement_until<0 then raise exception 'El límite de movida no puede ser negativo'; end if;
  if v_radius is not null and v_movement_until is not null and v_movement_until<v_radius then raise exception 'Cobrar movida hasta debe ser igual o mayor que el radio cubierto'; end if;
  if v_toll_billing_mode not in ('with_service','separate') then raise exception 'Modo de facturación de peajes inválido'; end if;
  if v_active and jsonb_array_length(v_bases)=0 then raise exception 'Una configuración activa debe tener al menos una base aplicable'; end if;

  if v_id is null then
    insert into public.company_billing_settings(
      company_id,contract_id,route_mode,toll_calculation_mode,toll_billing_mode,
      covered_radius_km,movement_charge_until_km,valid_from,valid_until,
      requires_verified_base,is_active,notes,created_by,updated_by
    ) values(
      v_company,v_contract,
      coalesce(nullif(p_payload->>'route_mode',''),'base_origin_destination_base'),
      coalesce(nullif(p_payload->>'toll_calculation_mode',''),'route_estimate'),
      v_toll_billing_mode,v_radius,v_movement_until,v_from,v_until,
      coalesce((p_payload->>'requires_verified_base')::boolean,true),v_active,
      nullif(btrim(p_payload->>'notes'),''),auth.uid(),auth.uid()
    ) returning * into v_saved;
  else
    select * into v_saved from public.company_billing_settings where billing_setting_id=v_id;
    if not found then raise exception 'Configuración inexistente'; end if;
    if v_saved.company_id<>v_company then raise exception 'No se puede cambiar la empresa de la configuración'; end if;

    update public.company_billing_settings set
      contract_id=v_contract,
      route_mode=coalesce(nullif(p_payload->>'route_mode',''),'base_origin_destination_base'),
      toll_calculation_mode=coalesce(nullif(p_payload->>'toll_calculation_mode',''),'route_estimate'),
      toll_billing_mode=v_toll_billing_mode,
      covered_radius_km=v_radius,
      movement_charge_until_km=v_movement_until,
      valid_from=v_from,
      valid_until=v_until,
      requires_verified_base=coalesce((p_payload->>'requires_verified_base')::boolean,true),
      is_active=v_active,
      notes=nullif(btrim(p_payload->>'notes'),''),
      updated_by=auth.uid()
    where billing_setting_id=v_id
    returning * into v_saved;
  end if;

  delete from public.company_billing_base_links where billing_setting_id=v_saved.billing_setting_id;
  for v_entry in select value from jsonb_array_elements(v_bases)
  loop
    if nullif(v_entry->>'base_id','') is null or not exists(select 1 from public.billing_bases b where b.base_id=(v_entry->>'base_id')::uuid) then
      raise exception 'Una de las bases seleccionadas no existe';
    end if;
    insert into public.company_billing_base_links(
      billing_setting_id,base_id,is_primary,priority,is_active,notes,created_by,updated_by
    ) values(
      v_saved.billing_setting_id,(v_entry->>'base_id')::uuid,false,100,
      coalesce((v_entry->>'is_active')::boolean,true),nullif(btrim(v_entry->>'notes'),''),auth.uid(),auth.uid()
    );
  end loop;
  return public.get_company_billing_configuration(v_company,now());
end;
$function$;

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
  q jsonb;
  v_full_company_amount numeric:=0;
  v_current numeric:=0;
  v_stored numeric:=0;
  v_toll_total numeric:=0;
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

  q:=app_private.calculate_operator_service_quote_v4_full(
    s.company_id,s.billing_base_id,s.scheduled_for,s.primary_concept_id,v_items,
    v_asphalt,v_gravel,v_toll_input,s.is_holiday
  );

  select coalesce(bs.toll_billing_mode,'with_service') into v_toll_billing_mode
  from public.company_billing_settings bs
  where bs.company_id=s.company_id
    and bs.is_active
    and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
    and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
    and (bs.contract_id is null or bs.contract_id=s.contract_id)
  order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
  limit 1;

  v_full_company_amount:=coalesce((q->>'company_estimated_total')::numeric,0);
  v_toll_total:=coalesce((q->>'toll_total')::numeric,0);
  v_current:=case
    when v_toll_billing_mode='separate' then greatest(v_full_company_amount-v_toll_total,0)
    else v_full_company_amount
  end;
  v_stored:=coalesce(nullif(s.pricing_snapshot->>'company_estimated_total','')::numeric,s.company_estimated_total,0);

  return q||jsonb_build_object(
    'service_id',s.service_id,
    'service_number',s.service_number,
    'stored_company_amount',round(v_stored,2),
    'current_company_amount',round(v_current,2),
    'company_amount_with_tolls',round(v_full_company_amount,2),
    'separate_toll_amount',case when v_toll_billing_mode='separate' then round(v_toll_total,2) else 0 end,
    'toll_billing_mode',v_toll_billing_mode,
    'billing_delta',round(v_current-v_stored,2),
    'billing_source','current_tariff_period',
    'operational_snapshot_calculated_at',s.pricing_snapshot->>'calculated_at'
  );
end;
$function$;

revoke all on function app_private.calculate_operator_service_billing_quote_v2(uuid) from public,anon,authenticated;

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
        'toll_name',coalesce(t.toll_name,t.notes,'Peaje'),
        'amount',coalesce(t.total_amount,0),
        'currency',coalesce(t.currency,s.currency,'ARS'),
        'receipt_url',t.receipt_url,
        'payer_agent',t.payer_agent
      ) order by s.scheduled_for desc,t.created_at desc)
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join public.companies c on c.company_id=s.company_id
      left join public.billing_bases b on b.base_id=s.billing_base_id
      join lateral (
        select bs.toll_billing_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate'
      where s.status='completed'
        and s.billing_status in ('pending','reviewed')
        and t.payer_agent='provider'
        and coalesce(t.total_amount,0)>0
        and (p_company_id is null or s.company_id=p_company_id)
        and (p_period_start is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date>=p_period_start)
        and (p_period_end is null or (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date<=p_period_end)
        and (v_search='' or lower(concat_ws(' ',s.service_number,s.service_order_number,s.vehicle_plate,s.customer_name,s.origin,s.destination,c.trade_name,c.legal_name,t.toll_name,t.notes)) like '%'||v_search||'%')
    ),'[]'::jsonb),
    'total_amount',coalesce((
      select sum(coalesce(t.total_amount,0))
      from public.operator_service_tolls t
      join public.operator_services s on s.service_id=t.service_id
      join lateral (
        select bs.toll_billing_mode
        from public.company_billing_settings bs
        where bs.company_id=s.company_id
          and bs.is_active
          and bs.valid_from <= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
          and (bs.valid_until is null or bs.valid_until >= (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date)
          and (bs.contract_id is null or bs.contract_id=s.contract_id)
        order by (bs.contract_id=s.contract_id) desc nulls last,bs.valid_from desc,bs.created_at desc
        limit 1
      ) cfg on cfg.toll_billing_mode='separate'
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
