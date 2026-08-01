create or replace function public.calculate_operator_service_quote(
  p_company_id uuid,
  p_branch_id uuid,
  p_scheduled_for timestamptz,
  p_primary_concept_id uuid,
  p_secondary_items jsonb default '[]'::jsonb,
  p_distance_km numeric default 0,
  p_toll_amount numeric default 0,
  p_is_holiday boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_local timestamp := coalesce(p_scheduled_for, now()) at time zone 'America/Argentina/Buenos_Aires';
  v_date date;
  v_time time;
  v_dow integer;
  v_contract public.company_contracts%rowtype;
  v_card public.company_rate_cards%rowtype;
  v_primary public.company_rate_items%rowtype;
  v_item public.company_rate_items%rowtype;
  v_link public.company_rate_service_links%rowtype;
  v_billing public.company_rate_billing_settings%rowtype;
  v_rule public.company_rate_rules%rowtype;
  v_sec jsonb;
  v_sec_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_subtotal numeric;
  v_link_count integer;
  v_components jsonb := '[]'::jsonb;
  v_surcharges jsonb := '[]'::jsonb;
  v_base numeric := 0;
  v_eligible numeric := 0;
  v_charge numeric := 0;
  v_surcharge_total numeric := 0;
  v_toll numeric := 0;
  v_total numeric := 0;
  v_copay numeric := 0;
  v_company_total numeric := 0;
  v_applies boolean;
  v_source text;
begin
  if v_role not in ('administracion','supervision') then
    raise exception 'Sin permiso para cotizar servicios';
  end if;
  if p_distance_km < 0 or p_toll_amount < 0 then
    raise exception 'Distancia o peaje inválido';
  end if;

  v_date := v_local::date;
  v_time := v_local::time;
  v_dow := extract(dow from v_local)::integer;

  select c.* into v_contract
  from public.company_contracts c
  where c.company_id = p_company_id
    and c.status = 'active'
    and c.valid_from <= v_date
    and (c.valid_until is null or c.valid_until >= v_date)
  order by c.is_primary desc, c.valid_from desc, c.created_at desc
  limit 1;
  if not found then raise exception 'La empresa no tiene un contrato vigente'; end if;

  select r.* into v_card
  from public.company_rate_cards r
  where r.contract_id = v_contract.contract_id
    and r.status = 'active'
    and r.valid_from <= v_date
    and (r.valid_until is null or r.valid_until >= v_date)
  order by r.version desc, r.valid_from desc
  limit 1;
  if not found then raise exception 'El contrato no tiene un tarifario publicado y vigente'; end if;

  select i.* into v_primary
  from public.company_rate_items i
  where i.rate_card_id = v_card.rate_card_id
    and i.concept_id = p_primary_concept_id
    and i.can_be_primary
    and i.is_active
    and (i.branch_id is null or i.branch_id = p_branch_id)
  order by (i.branch_id = p_branch_id) desc nulls last, i.branch_id nulls last
  limit 1;
  if not found then raise exception 'El concepto principal no está habilitado en el tarifario'; end if;

  v_unit_price := v_primary.primary_price;
  v_subtotal := v_unit_price;
  v_source := case when v_primary.branch_id is null then 'general' else 'branch' end;
  v_components := v_components || jsonb_build_array(jsonb_build_object(
    'role','primary','concept_id',v_primary.concept_id,'rate_item_id',v_primary.rate_item_id,
    'service_code',v_primary.service_code,'service_name',v_primary.service_name,
    'pricing_unit',v_primary.pricing_unit,'quantity',1,'unit_price',v_unit_price,
    'subtotal',v_subtotal,'price_source',v_source
  ));
  v_base := v_base + v_subtotal;

  select count(*) into v_link_count
  from public.company_rate_service_links l
  where l.rate_card_id = v_card.rate_card_id
    and l.primary_concept_id = p_primary_concept_id
    and l.is_enabled;

  for v_sec in select value from jsonb_array_elements(coalesce(p_secondary_items,'[]'::jsonb)) loop
    begin
      v_sec_id := (v_sec->>'concept_id')::uuid;
    exception when others then
      raise exception 'Concepto secundario inválido';
    end;
    v_qty := greatest(coalesce(nullif(v_sec->>'quantity','')::numeric,1),0);
    if v_qty <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;

    select i.* into v_item
    from public.company_rate_items i
    where i.rate_card_id = v_card.rate_card_id
      and i.concept_id = v_sec_id
      and i.can_be_secondary
      and i.is_active
      and (i.branch_id is null or i.branch_id = p_branch_id)
    order by (i.branch_id = p_branch_id) desc nulls last, i.branch_id nulls last
    limit 1;
    if not found then raise exception 'Un adicional seleccionado no está habilitado'; end if;

    select l.* into v_link
    from public.company_rate_service_links l
    where l.rate_card_id = v_card.rate_card_id
      and l.primary_concept_id = p_primary_concept_id
      and l.secondary_concept_id = v_sec_id
      and l.is_enabled
    limit 1;

    if v_link_count > 0 and not found then
      raise exception 'El adicional no es compatible con el servicio principal';
    end if;

    if found and v_link.price_override is not null then
      v_unit_price := v_link.price_override;
      v_source := 'link_override';
    else
      v_unit_price := v_item.secondary_price;
      v_source := case when v_item.branch_id is null then 'general' else 'branch' end;
    end if;

    v_subtotal := round(v_unit_price * v_qty,2);
    v_components := v_components || jsonb_build_array(jsonb_build_object(
      'role','secondary','concept_id',v_item.concept_id,'rate_item_id',v_item.rate_item_id,
      'service_code',v_item.service_code,'service_name',v_item.service_name,
      'pricing_unit',v_item.pricing_unit,'quantity',v_qty,'unit_price',v_unit_price,
      'subtotal',v_subtotal,'price_source',v_source
    ));
    v_base := v_base + v_subtotal;
  end loop;

  for v_rule in
    select * from public.company_rate_rules
    where rate_card_id = v_card.rate_card_id and enabled
    order by rule_type
  loop
    v_applies := false;
    if v_rule.rule_type = 'night' and v_rule.start_time is not null and v_rule.end_time is not null then
      v_applies := case
        when v_rule.start_time <= v_rule.end_time then v_time between v_rule.start_time and v_rule.end_time
        else v_time >= v_rule.start_time or v_time <= v_rule.end_time
      end;
    elsif v_rule.rule_type = 'weekend_holiday' then
      if v_dow = 6 and v_rule.saturday_start is not null and v_rule.saturday_end is not null then
        v_applies := case
          when v_rule.saturday_start <= v_rule.saturday_end then v_time between v_rule.saturday_start and v_rule.saturday_end
          else v_time >= v_rule.saturday_start or v_time <= v_rule.saturday_end
        end;
      elsif (v_dow = 0 or p_is_holiday) and v_rule.sunday_holiday_start is not null and v_rule.sunday_holiday_end is not null then
        v_applies := case
          when v_rule.sunday_holiday_start <= v_rule.sunday_holiday_end then v_time between v_rule.sunday_holiday_start and v_rule.sunday_holiday_end
          else v_time >= v_rule.sunday_holiday_start or v_time <= v_rule.sunday_holiday_end
        end;
      end if;
    elsif v_rule.rule_type = 'wide_coverage' then
      v_applies := p_distance_km >= coalesce(v_rule.distance_threshold_km,0) and coalesce(v_rule.distance_threshold_km,0) > 0;
    end if;

    if v_applies then
      select coalesce(sum((c.value->>'subtotal')::numeric),0) into v_eligible
      from jsonb_array_elements(v_components) c(value)
      where not exists (
        select 1 from public.company_rate_rule_exceptions e
        where e.rule_id = v_rule.rule_id
          and e.concept_id = (c.value->>'concept_id')::uuid
      );
      v_charge := case
        when v_eligible <= 0 then 0
        when v_rule.calculation_mode = 'fixed' then v_rule.amount
        else round(v_eligible * v_rule.amount / 100,2)
      end;
      if v_charge > 0 then
        v_surcharge_total := v_surcharge_total + v_charge;
        v_surcharges := v_surcharges || jsonb_build_array(jsonb_build_object(
          'rule_id',v_rule.rule_id,'rule_type',v_rule.rule_type,
          'calculation_mode',v_rule.calculation_mode,'configured_value',v_rule.amount,
          'eligible_base',v_eligible,'amount',v_charge
        ));
      end if;
    end if;
  end loop;

  select b.* into v_billing
  from public.company_rate_billing_settings b
  where b.rate_card_id = v_card.rate_card_id;

  if found and v_billing.toll_enabled and v_billing.toll_invoice_enabled then
    v_toll := case v_billing.toll_mode
      when 'fixed' then v_billing.toll_fixed_amount
      when 'at_cost' then p_toll_amount
      else 0
    end;
  end if;

  v_total := round(v_base + v_surcharge_total + v_toll,2);
  if found and v_billing.copay_enabled then
    v_copay := case v_billing.copay_mode
      when 'percentage' then round(v_total * v_billing.copay_value / 100,2)
      else v_billing.copay_value
    end;
    v_copay := least(greatest(v_copay,0),v_total);
  end if;
  v_company_total := v_total - v_copay;

  return jsonb_build_object(
    'company_id',p_company_id,'branch_id',p_branch_id,
    'contract_id',v_contract.contract_id,'contract_name',v_contract.name,
    'rate_card_id',v_card.rate_card_id,'rate_card_name',v_card.name,'rate_card_version',v_card.version,
    'currency',v_card.currency,'scheduled_for',p_scheduled_for,
    'primary_concept_id',p_primary_concept_id,'components',v_components,'surcharges',v_surcharges,
    'distance_km',p_distance_km,'toll_input',p_toll_amount,'is_holiday',p_is_holiday,
    'base_subtotal',round(v_base,2),'surcharge_total',round(v_surcharge_total,2),
    'toll_total',round(v_toll,2),'copay_total',round(v_copay,2),
    'estimated_total',round(v_total,2),'company_estimated_total',round(v_company_total,2),
    'calculated_at',now()
  );
end;
$$;

revoke all on function public.calculate_operator_service_quote(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,boolean) from public, anon;
grant execute on function public.calculate_operator_service_quote(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,boolean) to authenticated;

create or replace function public.create_operator_service(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_quote jsonb;
  v_service public.operator_services%rowtype;
  v_component jsonb;
  v_driver uuid;
  v_truck integer;
  v_scheduled timestamptz;
  v_status text;
begin
  if v_role not in ('administracion','supervision') then
    raise exception 'Sin permiso para crear servicios';
  end if;

  v_driver := nullif(p_payload->>'assigned_driver_id','')::uuid;
  v_truck := nullif(p_payload->>'assigned_truck_id','')::integer;
  if (v_driver is null) <> (v_truck is null) then
    raise exception 'Chofer y móvil deben asignarse juntos';
  end if;

  if v_driver is not null and not exists (
    select 1 from public.users u join public.roles r on r.role_id=u.role_id
    where u.user_id=v_driver and coalesce(u.is_active,true) and r.name='chofer'
  ) then raise exception 'Chofer inválido o inactivo'; end if;

  if v_truck is not null and not exists (
    select 1 from public.trucks t where t.truck_id=v_truck and t.status='active'
  ) then raise exception 'Móvil inválido o inactivo'; end if;

  v_scheduled := coalesce(nullif(p_payload->>'scheduled_for','')::timestamptz,now());
  v_quote := public.calculate_operator_service_quote(
    (p_payload->>'company_id')::uuid,
    nullif(p_payload->>'branch_id','')::uuid,
    v_scheduled,
    (p_payload->>'primary_concept_id')::uuid,
    coalesce(p_payload->'secondary_items','[]'::jsonb),
    coalesce(nullif(p_payload->>'estimated_distance_km','')::numeric,0),
    coalesce(nullif(p_payload->>'toll_estimate','')::numeric,0),
    coalesce((p_payload->>'is_holiday')::boolean,false)
  );

  v_status := case when v_driver is not null then 'assigned' else 'pending' end;

  insert into public.operator_services(
    status,priority,company_id,branch_id,contract_id,rate_card_id,
    service_order_number,purchase_order_number,requested_at,scheduled_for,estimated_arrival_at,
    customer_name,customer_phone,customer_email,vehicle_plate,vehicle_make_model,
    origin,destination,primary_concept_id,assigned_driver_id,assigned_truck_id,assigned_at,assigned_by,
    estimated_distance_km,toll_estimate,is_holiday,currency,base_subtotal,surcharge_total,toll_total,
    copay_total,estimated_total,company_estimated_total,pricing_snapshot,
    operator_notes,driver_instructions,created_by,updated_by
  ) values (
    v_status,coalesce(nullif(p_payload->>'priority',''),'normal'),
    (p_payload->>'company_id')::uuid,nullif(p_payload->>'branch_id','')::uuid,
    (v_quote->>'contract_id')::uuid,(v_quote->>'rate_card_id')::uuid,
    nullif(p_payload->>'service_order_number',''),nullif(p_payload->>'purchase_order_number',''),
    now(),v_scheduled,nullif(p_payload->>'estimated_arrival_at','')::timestamptz,
    nullif(p_payload->>'customer_name',''),nullif(p_payload->>'customer_phone',''),nullif(p_payload->>'customer_email',''),
    upper(nullif(p_payload->>'vehicle_plate','')),nullif(p_payload->>'vehicle_make_model',''),
    trim(p_payload->>'origin'),trim(p_payload->>'destination'),(p_payload->>'primary_concept_id')::uuid,
    v_driver,v_truck,case when v_driver is not null then now() end,case when v_driver is not null then auth.uid() end,
    coalesce((v_quote->>'distance_km')::numeric,0),coalesce((v_quote->>'toll_input')::numeric,0),
    coalesce((v_quote->>'is_holiday')::boolean,false),v_quote->>'currency',
    (v_quote->>'base_subtotal')::numeric,(v_quote->>'surcharge_total')::numeric,
    (v_quote->>'toll_total')::numeric,(v_quote->>'copay_total')::numeric,
    (v_quote->>'estimated_total')::numeric,(v_quote->>'company_estimated_total')::numeric,v_quote,
    nullif(p_payload->>'operator_notes',''),nullif(p_payload->>'driver_instructions',''),auth.uid(),auth.uid()
  ) returning * into v_service;

  for v_component in select value from jsonb_array_elements(v_quote->'components') loop
    insert into public.operator_service_items(
      service_id,concept_id,rate_item_id,item_role,service_code,service_name,pricing_unit,
      quantity,unit_price,subtotal,price_source,snapshot,sort_order
    ) values (
      v_service.service_id,(v_component->>'concept_id')::uuid,(v_component->>'rate_item_id')::uuid,
      v_component->>'role',v_component->>'service_code',v_component->>'service_name',v_component->>'pricing_unit',
      (v_component->>'quantity')::numeric,(v_component->>'unit_price')::numeric,(v_component->>'subtotal')::numeric,
      v_component->>'price_source',v_component,
      case when v_component->>'role'='primary' then 0 else 10 end
    );
  end loop;

  return to_jsonb(v_service) || jsonb_build_object('quote',v_quote);
end;
$$;

revoke all on function public.create_operator_service(jsonb) from public, anon;
grant execute on function public.create_operator_service(jsonb) to authenticated;

comment on table public.operator_services is 'Pedidos operativos creados antes de la jornada del chofer; conserva asignación y snapshot tarifario.';
comment on table public.operator_service_items is 'Conceptos principales y secundarios facturados dentro de un servicio operativo.';
comment on table public.operator_service_events is 'Historial de creación, asignación y cambios de estado del servicio.';
