-- AuxiliOS · Reajuste administrativo de un ítem sin alterar el tarifario
create or replace function public.adjust_operator_service_item_v3(p_item_id uuid,p_new_unit_price numeric,p_reason text)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
declare
  v_item public.operator_service_items%rowtype; v_service public.operator_services%rowtype;
  v_prev_subtotal numeric; v_new_subtotal numeric; v_base numeric; v_surcharge numeric:=0; v_total numeric; v_copay numeric:=0; v_company_total numeric;
  v_s jsonb; v_rule public.company_rate_rules%rowtype; v_eligible numeric; v_amount numeric; v_billing public.company_rate_billing_settings%rowtype;
begin
  if app_private.current_auxilios_role()<>'administracion' then raise exception 'Solo Administración puede realizar reajustes'; end if;
  if p_new_unit_price is null or p_new_unit_price<0 then raise exception 'Ingresá un nuevo precio válido'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Ingresá el motivo del reajuste'; end if;

  select * into v_item from public.operator_service_items where item_id=p_item_id for update;
  if not found then raise exception 'Ítem inexistente'; end if;
  if v_item.item_role='primary' or v_item.matrix_rate_id is null then raise exception 'El ítem seleccionado no admite reajuste tarifario V3'; end if;
  select * into v_service from public.operator_services where service_id=v_item.service_id for update;
  v_prev_subtotal:=v_item.subtotal;
  v_new_subtotal:=round(v_item.quantity*p_new_unit_price,2);

  insert into public.operator_service_item_adjustments(item_id,service_id,previous_unit_price,new_unit_price,previous_subtotal,new_subtotal,reason)
  values(v_item.item_id,v_service.service_id,v_item.unit_price,p_new_unit_price,v_prev_subtotal,v_new_subtotal,trim(p_reason));

  update public.operator_service_items set
    list_unit_price=coalesce(list_unit_price,unit_price),unit_price=p_new_unit_price,subtotal=v_new_subtotal,
    snapshot=coalesce(snapshot,'{}'::jsonb)||jsonb_build_object('reajuste_aplicado',true,'applied_unit_price',p_new_unit_price,'last_adjustment_reason',trim(p_reason))
  where item_id=v_item.item_id;

  select coalesce(sum(subtotal),0) into v_base from public.operator_service_items
  where service_id=v_service.service_id and item_role<>'primary';

  for v_s in select value from jsonb_array_elements(coalesce(v_service.pricing_snapshot->'surcharges','[]'::jsonb)) loop
    select * into v_rule from public.company_rate_rules where rule_id=nullif(v_s->>'rule_id','')::uuid;
    if found then
      select coalesce(sum(i.subtotal),0) into v_eligible
      from public.operator_service_items i
      where i.service_id=v_service.service_id and i.item_role<>'primary'
        and not exists(select 1 from public.company_rate_rule_exceptions e where e.rule_id=v_rule.rule_id and e.concept_id=i.concept_id);
      v_amount:=case when v_rule.calculation_mode='fixed' then v_rule.amount else round(v_eligible*v_rule.amount/100,2) end;
    else
      v_amount:=coalesce((v_s->>'amount')::numeric,0);
    end if;
    v_surcharge:=v_surcharge+coalesce(v_amount,0);
  end loop;

  v_total:=round(v_base+v_surcharge+coalesce(v_service.toll_total,0),2);
  select * into v_billing from public.company_rate_billing_settings where rate_card_id=v_service.rate_card_id;
  if found and v_billing.copay_enabled then
    v_copay:=case when v_billing.copay_mode='percentage' then round(v_total*v_billing.copay_value/100,2) else v_billing.copay_value end;
    v_copay:=least(greatest(v_copay,0),v_total);
  end if;
  v_company_total:=v_total-v_copay;

  update public.operator_services set
    base_subtotal=round(v_base,2),surcharge_total=round(v_surcharge,2),copay_total=round(v_copay,2),
    estimated_total=round(v_total,2),company_estimated_total=round(v_company_total,2),updated_by=auth.uid(),updated_at=now()
  where service_id=v_service.service_id;

  return jsonb_build_object(
    'item_id',v_item.item_id,'service_id',v_service.service_id,'list_unit_price',coalesce(v_item.list_unit_price,v_item.unit_price),
    'previous_unit_price',v_item.unit_price,'applied_unit_price',p_new_unit_price,'quantity',v_item.quantity,
    'previous_subtotal',v_prev_subtotal,'subtotal',v_new_subtotal,'reason',trim(p_reason),
    'service_total',round(v_total,2),'company_total',round(v_company_total,2)
  );
end $$;

create or replace function public.get_operator_service_item_adjustments_v3(p_item_id uuid)
returns jsonb language plpgsql security definer
set search_path='public','app_private','pg_temp'
as $$
begin
  if app_private.current_auxilios_role() not in ('administracion','facturacion','supervision') then raise exception 'Sin permiso'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'adjustment_id',a.adjustment_id,'previous_unit_price',a.previous_unit_price,'new_unit_price',a.new_unit_price,
    'previous_subtotal',a.previous_subtotal,'new_subtotal',a.new_subtotal,'reason',a.reason,
    'adjusted_by',a.adjusted_by,'adjusted_at',a.adjusted_at
  ) order by a.adjusted_at desc) from public.operator_service_item_adjustments a where a.item_id=p_item_id),'[]'::jsonb);
end $$;

revoke all on function public.adjust_operator_service_item_v3(uuid,numeric,text) from public,anon;
revoke all on function public.get_operator_service_item_adjustments_v3(uuid) from public,anon;
grant execute on function public.adjust_operator_service_item_v3(uuid,numeric,text) to authenticated;
grant execute on function public.get_operator_service_item_adjustments_v3(uuid) to authenticated;
