-- Current administrative payment methods are editable; the driver's signed value remains explicit audit data.
create or replace function app_private.validate_administrative_commercial_v1(p_service_id uuid,p_company_id uuid,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare s public.operator_services%rowtype; x jsonb; original jsonb; id uuid; report_id uuid; client_id uuid; qty numeric; unit numeric; payer text; label text; mode text; kind text; id_key text; report_key text; result jsonb; arr jsonb; seen text[]; customer_method text; reported_method text;
begin
 select * into s from public.operator_services where service_id=p_service_id;
 mode:=nullif(p_data->>'toll_coverage_mode','');
 if mode is not null and mode not in ('mixed_manual','provider_roundtrip','customer_roundtrip') then raise exception 'Formato de cobro inválido'; end if;
 result:=jsonb_build_object('toll_coverage_mode',mode);
 foreach kind in array array['tolls','excess_charges'] loop
  if jsonb_typeof(p_data->kind) is distinct from 'array' then raise exception 'Los cargos deben enviarse como listas'; end if;
  if jsonb_array_length(p_data->kind)>100 then raise exception 'Demasiados cargos'; end if;
  arr:='[]'; seen:='{}';
  id_key:=case kind when 'tolls' then 'toll_id' else 'concept_id' end;
  report_key:=case kind when 'tolls' then 'toll_report_id' else 'excess_report_id' end;
  for x in select value from jsonb_array_elements(p_data->kind) loop
   id:=nullif(x->>id_key,'')::uuid; report_id:=nullif(x->>report_key,'')::uuid;
   original:=null;
   if report_id is not null then
    if kind='tolls' then select to_jsonb(t) into original from public.remito_toll_reports t where t.toll_report_id=report_id and t.remito_id=s.remito_id;
    else select to_jsonb(e) into original from public.remito_excess_reports e where e.excess_report_id=report_id and e.remito_id=s.remito_id; end if;
    if original is null then raise exception 'El cargo no pertenece al remito'; end if;
   end if;
   client_id:=coalesce(nullif(x->>'review_line_client_id','')::uuid,gen_random_uuid());
   if coalesce(report_id,client_id)::text=any(seen) then raise exception 'Cargo duplicado'; end if;
   seen:=array_append(seen,coalesce(report_id,client_id)::text);
   qty:=(x->>'quantity')::numeric; unit:=(x->>'unit_amount')::numeric; payer:=x->>'payer_agent';
   if qty is null or unit is null or qty<=0 or unit<=0 or qty>100000 or unit>100000000 or qty::text='NaN' or unit::text='NaN' then raise exception 'Cantidad e importe deben ser positivos'; end if;
   if kind='tolls' and qty<>trunc(qty) then raise exception 'La cantidad de peajes debe ser entera'; end if;
   if payer is null or payer not in ('customer','provider') then raise exception 'Seleccioná quién debe pagar cada cargo'; end if;
   customer_method:=nullif(lower(btrim(x->>'customer_payment_method')),'');
   if payer='customer' and customer_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Seleccioná el medio de pago de cada cargo a cargo del cliente'; end if;
   if payer='provider' then customer_method:=null; end if;
   reported_method:=original->>'customer_payment_method';
   if kind='tolls' then
    if mode is null then raise exception 'Seleccioná el formato de cobro de peajes'; end if;
    if (mode='provider_roundtrip' and payer<>'provider') or (mode='customer_roundtrip' and payer<>'customer') then raise exception 'El pagador no coincide con el formato de peajes'; end if;
    select name into label from public.toll_locations where toll_id=id and is_active;
   else
    select name into label from public.service_concepts c where concept_id=id and is_active and service_category in ('secondary','mixed') and billing_family<>'system'
     and exists(select 1 from public.company_service_settings cs where cs.company_id=p_company_id and cs.concept_id=id and cs.is_enabled);
   end if;
   if label is null then raise exception 'Concepto inexistente o no habilitado'; end if;
   arr:=arr||jsonb_build_array(jsonb_build_object(id_key,id,report_key,report_id,
    'review_line_client_id',case when report_id is null then client_id end,
    case kind when 'tolls' then 'toll_name' else 'concept_name' end,label,
    'quantity',qty,'unit_amount',round(unit,2),'total_amount',round(qty*round(unit,2),2),'currency','ARS','payer_agent',payer,
    'customer_payment_method',customer_method,'reported_customer_payment_method',reported_method,
    'reported_total_amount',original->'total_amount','payment_method',coalesce(original->>'payment_method','manual')));
  end loop;
  result:=result||jsonb_build_object(kind,arr);
 end loop;
 return result;
end; $$;
revoke all on function app_private.validate_administrative_commercial_v1(uuid,uuid,jsonb) from public,anon,authenticated;
