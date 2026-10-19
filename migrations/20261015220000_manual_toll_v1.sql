-- Peaje "Manual / Varios" · 15/10/2026
-- Para los peajes que no se sabe por cuáles pasó: sin peaje del catálogo (toll_id null) y con el importe cargado a mano.
-- Mismas reglas que un peaje normal: quién paga, formato de cobro y medio de pago si paga el cliente.
do $$
declare d text:=pg_get_functiondef('app_private.normalize_service_commercial_addons_v1(uuid,timestamp with time zone,jsonb)'::regprocedure); n text;
begin
  n:=replace(d,$a$  v_collector text;
begin$a$,$a$  v_collector text;
  v_unit numeric;
begin$a$);
  n:=replace(n,$a$    if v_toll_id is null then raise exception 'Seleccioná un peaje dado de alta'; end if;$a$,
$a$    if v_toll_id is null and coalesce(nullif(v_row->>'manual','')::boolean,false) then
      v_unit:=round(greatest(coalesce(nullif(v_row->>'unit_amount','')::numeric,0),0),2);
      if v_unit<=0 then raise exception 'Indicá el importe del peaje Manual / Varios'; end if;
      if v_payer not in ('provider','customer') then raise exception 'Quién paga debe ser Cliente o Prestadora'; end if;
      if v_mode='provider_roundtrip' and v_payer<>'provider' then raise exception 'En formato A cargo de la Prestadora, todos los peajes deben quedar a cargo de la Prestadora'; end if;
      if v_mode='customer_roundtrip' and v_payer<>'customer' then raise exception 'En formato A cargo del cliente, todos los peajes deben quedar a cargo del cliente'; end if;
      if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Cuando paga el cliente, el medio de pago es obligatorio'; end if;
      if v_payer='provider' then v_customer_method:=null; end if;
      v_key:='manual|'||to_char(v_unit,'FM999999999999990.00')||'|'||v_payer||'|'||coalesce(v_customer_method,'n/a');
      if v_key=any(v_toll_keys) then raise exception 'Ese peaje Manual / Varios ya existe con el mismo importe, pagador y medio de pago; aumentá la cantidad'; end if;
      v_toll_keys:=array_append(v_toll_keys,v_key);
      if v_payer='provider' then v_provider_unit:=v_unit; v_customer_unit:=0; else v_provider_unit:=0; v_customer_unit:=v_unit; end if;
      v_provider_total:=v_provider_total+(v_provider_unit*v_qty);
      v_customer_total:=v_customer_total+(v_customer_unit*v_qty);
      v_tolls:=v_tolls||jsonb_build_array(jsonb_build_object(
        'toll_id',null,'toll_rate_id',null,'toll_code','MANUAL','toll_name','Manual / Varios',
        'road',null,'direction',null,'vehicle_category','light_2_axles','payment_method','any',
        'quantity',v_qty,'unit_amount',v_unit,'currency','ARS','source','planned',
        'payer_agent',v_payer,'customer_payment_method',v_customer_method,'provider_unit_amount',v_provider_unit,'customer_unit_amount',v_customer_unit));
      if v_provider_unit>0 then
        v_billing_tolls:=v_billing_tolls||jsonb_build_array(jsonb_build_object(
          'toll_id',null,'toll_rate_id',null,'toll_name','Manual / Varios','vehicle_category','light_2_axles','payment_method','any',
          'quantity',v_qty,'unit_amount',v_provider_unit,'currency','ARS','source','planned'));
      end if;
      continue;
    end if;
    if v_toll_id is null then raise exception 'Seleccioná un peaje dado de alta'; end if;$a$);
  if n=d or position('v_unit numeric;' in n)=0 or position('Manual / Varios' in n)=0 then raise exception 'No se pudo parchear normalize_service_commercial_addons_v1'; end if;
  execute n;
end $$;

-- La lectura de los peajes del servicio también devuelve los Manual / Varios (sin peaje del catálogo).
do $$
declare d text:=pg_get_functiondef('public.get_operator_service_commercial_addons_v1(uuid)'::regprocedure); n text;
begin
  n:=replace(d,$a$'unit_amount',t.unit_amount,'currency',t.currency
  )) order by t.created_at),'[]'::jsonb) into v_tolls$a$,$a$'unit_amount',t.unit_amount,'currency',t.currency,
    'manual',case when t.toll_id is null then true end,'toll_name',case when t.toll_id is null then t.toll_name_snapshot end
  )) order by t.created_at),'[]'::jsonb) into v_tolls$a$);
  n:=replace(n,$a$t.source in ('planned','manual') and t.toll_id is not null;$a$,$a$t.source in ('planned','manual') and (t.toll_id is not null or t.toll_code_snapshot='MANUAL');$a$);
  if n=d or position('toll_code_snapshot=''MANUAL''' in n)=0 or position('''manual'',case' in n)=0 then raise exception 'No se pudo parchear get_operator_service_commercial_addons_v1'; end if;
  execute n;
end $$;
