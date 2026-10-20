-- Corrección administrativa con la tabla nueva de peajes · 20/10/2026 (pedido del dueño)
-- Después de la firma, el servicio se corrige con la misma tabla que «Nuevo servicio» (Quién paga | Peaje | Importe |
-- Cantidad) y un solo «Cobro al cliente», en vez de una fila por pasada con su propio medio de pago.
-- 1) validate_administrative_commercial_v1:
--    · acepta customer_payment {primary, secondary, secondary_amount}: lo valida, lo guarda dentro de
--      administrative_commercial y usa el medio principal en cada cargo del cliente;
--    · acepta extra_report_ids en un peaje: las otras pasadas del chofer que quedan en la misma fila («Peaje ×2»).
--      Tienen que ser del mismo remito y del mismo peaje, no repetirse y no superar la cantidad − 1.
-- 2) get_operator_service_remito_review_v3: una pasada que está en extra_report_ids no figura como «Excluida».
-- Reemplazos puntuales (fallan si no encuentran el texto) y no se repiten si ya están aplicados.

do $mig$ declare d text; n int; t text; begin
  d := replace(pg_get_functiondef('app_private.validate_administrative_commercial_v1(uuid,uuid,jsonb)'::regprocedure), E'\r', '');
  if position('v_cp_primary' in d) = 0 then
    t := $a$customer_method text; reported_method text;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: declaraciones no encontradas'; end if;
    d := replace(d, t, t||$b$ v_cp jsonb:=p_data->'customer_payment'; v_cp_primary text; v_cp_secondary text; v_cp_amount numeric; v_extra jsonb:='[]'; v_eid uuid; v_e jsonb;$b$);

    t := $a$ result:=jsonb_build_object('toll_coverage_mode',mode);$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: inicio no encontrado'; end if;
    d := replace(d, t, t||$b$
 if jsonb_typeof(v_cp)='object' then
  v_cp_primary:=nullif(lower(btrim(coalesce(v_cp->>'primary',''))),'');
  v_cp_secondary:=nullif(lower(btrim(coalesce(v_cp->>'secondary',''))),'');
  v_cp_amount:=round(nullif(btrim(coalesce(v_cp->>'secondary_amount','')),'')::numeric,2);
  if v_cp_primary is not null and v_cp_primary not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente'; end if;
  if v_cp_secondary is not null then
   if v_cp_primary is null or v_cp_primary='not_collected' then raise exception 'Con «No cobrado» no se puede sumar un segundo medio'; end if;
   if v_cp_secondary not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Segundo medio de pago inválido'; end if;
   if v_cp_secondary=v_cp_primary then raise exception 'El segundo medio tiene que ser distinto del principal'; end if;
   if coalesce(v_cp_amount,0)<=0 then raise exception 'Indicá cuánto pagó con el segundo medio'; end if;
  else v_cp_amount:=null; end if;
  result:=result||jsonb_build_object('customer_payment',jsonb_build_object('primary',v_cp_primary,'secondary',v_cp_secondary,'secondary_amount',v_cp_amount));
 end if;$b$);

    t := $a$   original:=null;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: inicio de fila no encontrado'; end if;
    d := replace(d, t, t||$b$ v_extra:='[]';$b$);

    t := $a$   customer_method:=nullif(lower(btrim(x->>'customer_payment_method')),'');$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: medio de pago no encontrado'; end if;
    d := replace(d, t, t||$b$
   if payer='customer' and v_cp_primary is not null then customer_method:=v_cp_primary; end if;$b$);

    t := $a$   if kind='tolls' and qty<>trunc(qty) then raise exception 'La cantidad de peajes debe ser entera'; end if;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: cantidad entera no encontrada'; end if;
    d := replace(d, t, t||$b$
   if kind='tolls' and jsonb_typeof(x->'extra_report_ids')='array' and jsonb_array_length(x->'extra_report_ids')>0 then
    if report_id is null then raise exception 'Las pasadas agrupadas necesitan el peaje informado'; end if;
    if jsonb_array_length(x->'extra_report_ids')>qty-1 then raise exception 'Hay más pasadas agrupadas que la cantidad del peaje'; end if;
    for v_e in select value from jsonb_array_elements(x->'extra_report_ids') loop
     v_eid:=nullif(v_e#>>'{}','')::uuid;
     if v_eid is null or not exists(select 1 from public.remito_toll_reports t where t.toll_report_id=v_eid and t.remito_id=s.remito_id and t.toll_id is not distinct from (original->>'toll_id')::uuid) then raise exception 'El cargo no pertenece al remito'; end if;
     if v_eid::text=any(seen) then raise exception 'Cargo duplicado'; end if;
     seen:=array_append(seen,v_eid::text); v_extra:=v_extra||to_jsonb(v_eid::text);
    end loop;
   end if;$b$);

    t := $a$'reported_total_amount',original->'total_amount',$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'validate admin: salida no encontrada'; end if;
    d := replace(d, t, $b$'reported_total_amount',case when jsonb_array_length(v_extra)>0 then to_jsonb((original->>'total_amount')::numeric+(select coalesce(sum(t.total_amount),0) from public.remito_toll_reports t where t.toll_report_id::text in (select e#>>'{}' from jsonb_array_elements(v_extra) e))) else original->'total_amount' end,'extra_report_ids',v_extra,$b$);
    execute d;
  end if;
end $mig$;

do $mig$ declare d text; n int; t text; begin
  d := replace(pg_get_functiondef('public.get_operator_service_remito_review_v3(uuid)'::regprocedure), E'\r', '');
  if position('extra_report_ids' in d) = 0 then
    t := $a$where a->>'toll_report_id'=x->>'toll_report_id')$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'review v3: exclusión de peajes no encontrada'; end if;
    d := replace(d, t, $b$where a->>'toll_report_id'=x->>'toll_report_id' or coalesce(a->'extra_report_ids','[]'::jsonb) ? (x->>'toll_report_id'))$b$);
    execute d;
  end if;
end $mig$;
