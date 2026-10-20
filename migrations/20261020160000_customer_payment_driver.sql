-- Cobro al cliente · remito del chofer y rendición · 20/10/2026 (pedido del dueño, entrega 2)
-- 1) remito_customer_payment_lines_v1: cómo cobró el chofer cada remito, como filas (medio, importe).
--    Si el remito tiene el cobro nuevo: medio principal (total − segundo importe) y segundo medio. Si no, una fila
--    por peaje/excedente con su medio (como hasta ahora). Lo usan la rendición de efectivo y el resumen del mes.
-- 2) persist_driver_remito_addons_v3 acepta customer_payment {primary, secondary, secondary_amount}: lo valida, lo
--    guarda en el remito y usa el medio principal en cada peaje/excedente del cliente.
-- 3) get_driver_remito_addons_v2 devuelve el cobro guardado; get_driver_remito_reference_v2 devuelve los peajes del
--    cliente que cargó el operador y el cobro previsto, para precargarlos en el remito.
-- 4) monthly_cash_source y driver_month_ops_v1 cuentan el efectivo con esas filas. Los remitos sin cobro nuevo dan
--    exactamente lo mismo que antes. Reemplazos puntuales (fallan si no encuentran el texto).

create or replace function app_private.remito_customer_payment_lines_v1(p_remito_id integer)
returns table(method text, amount numeric) language sql stable security definer set search_path to '' as $f$
  with r as (
    select customer_payment_primary p, customer_payment_secondary s, coalesce(customer_payment_secondary_amount,0) sa
    from public.remitos where remito_id=p_remito_id
  ), lines as (
    select t.customer_payment_method m, t.total_amount a from public.remito_toll_reports t
    where t.remito_id=p_remito_id and t.customer_payment_method is not null
    union all
    select e.customer_payment_method, e.total_amount from public.remito_excess_reports e
    where e.remito_id=p_remito_id and e.customer_payment_method is not null
  ), tot as (select coalesce(sum(a),0) total from lines)
  select l.m, l.a from lines l, r where r.p is null
  union all
  select r.p, greatest(tot.total-r.sa,0) from r, tot where r.p is not null and tot.total>0
  union all
  select r.s, r.sa from r where r.p is not null and r.s is not null and r.sa>0;
$f$;
revoke all on function app_private.remito_customer_payment_lines_v1(integer) from public, anon, authenticated;

-- persist: cobro del chofer
do $mig$ declare d text; n int; t text; begin
  d := replace(pg_get_functiondef('app_private.persist_driver_remito_addons_v3(integer,jsonb,uuid)'::regprocedure), E'\r', '');
  if position('v_cp_primary' in d) = 0 then
    t := $a$  v_toll_total numeric:=0; v_excess_total numeric:=0; v_is_test boolean:=false;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'persist v3: declaraciones no encontradas'; end if;
    d := replace(d, t, t||E'\n'||$b$  v_cp jsonb:=coalesce(p_payload,'{}'::jsonb)->'customer_payment'; v_cp_primary text; v_cp_secondary text; v_cp_amount numeric; v_cp_total numeric:=0;$b$);
    t := $a$  if exists(select 1 from public.operator_service_document_addon_reviews x where x.remito_id=p_remito_id) then raise exception 'El remito ya fue revisado por Administración'; end if;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'persist v3: control de revisión no encontrado'; end if;
    d := replace(d, t, t||E'\n'||$b$  if jsonb_typeof(v_cp)='object' then
    v_cp_primary:=nullif(lower(btrim(coalesce(v_cp->>'primary',''))),'');
    v_cp_secondary:=nullif(lower(btrim(coalesce(v_cp->>'secondary',''))),'');
    v_cp_amount:=round(nullif(btrim(coalesce(v_cp->>'secondary_amount','')),'')::numeric,2);
    if v_cp_primary is not null and v_cp_primary not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente'; end if;
    if v_cp_secondary is not null then
      if v_cp_primary is null or v_cp_primary='not_collected' then raise exception 'Con «No cobrado» no se puede sumar un segundo medio'; end if;
      if v_cp_secondary not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Segundo medio de pago inválido'; end if;
      if v_cp_secondary=v_cp_primary then raise exception 'El segundo medio tiene que ser distinto del principal'; end if;
      if coalesce(v_cp_amount,0)<=0 then raise exception 'Indicá cuánto pagó con el segundo medio'; end if;
    else
      v_cp_amount:=null;
    end if;
  end if;$b$);
    t := $a$    if v_payer='provider' then v_method:=null;
    elsif v_method is null$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'persist v3: medio del peaje no encontrado'; end if;
    d := replace(d, t, $b$    if v_payer<>'provider' and v_cp_primary is not null then v_method:=v_cp_primary; end if;
$b$||t);
    t := $a$    if v_method not in ('cash','transfer','card','mercado_pago','other','not_collected') then raise exception 'Indicá cómo pagó el cliente el excedente'; end if;$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'persist v3: medio del excedente no encontrado'; end if;
    d := replace(d, t, $b$    if v_cp_primary is not null then v_method:=v_cp_primary; end if;
$b$||t);
    t := $a$  update public.remitos set addons_version=2,$a$;
    n := (length(d)-length(replace(d,t,'')))/length(t); if n <> 1 then raise exception 'persist v3: actualización final no encontrada'; end if;
    d := replace(d, t, $b$  v_cp_total:=round(case when v_payer='customer' then v_toll_total else 0 end+v_excess_total,2);
  if jsonb_typeof(v_cp)='object' then
    if v_cp_total<=0 then v_cp_primary:=null; v_cp_secondary:=null; v_cp_amount:=null;
    elsif v_cp_primary is null then raise exception 'Indicá cómo pagó el cliente';
    elsif v_cp_secondary is not null and v_cp_amount>=v_cp_total then
      raise exception 'Lo que pagó con el segundo medio tiene que ser menor al total ($%)',translate(to_char(v_cp_total,'FM999,999,990.00'),',.','.,');
    end if;
  end if;
  update public.remitos set customer_payment_primary=v_cp_primary,customer_payment_secondary=v_cp_secondary,
    customer_payment_secondary_amount=v_cp_amount where remito_id=p_remito_id;
$b$||t);
    execute d;
  end if;
end $mig$;

-- lectura del remito del chofer: devuelve el cobro guardado
do $mig$ declare d text; a text := $a$'reviewed_at',r.addons_reviewed_at,'tolls',v_tolls$a$; begin
  d := replace(pg_get_functiondef('public.get_driver_remito_addons_v2(integer)'::regprocedure), E'\r', '');
  if position('customer_payment_primary' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'get_driver_remito_addons_v2: texto no encontrado'; end if;
    d := replace(d, a, $b$'customer_payment',case when r.customer_payment_primary is null then null else jsonb_build_object('primary',r.customer_payment_primary,'secondary',r.customer_payment_secondary,'secondary_amount',r.customer_payment_secondary_amount) end,$b$||a);
    execute d;
  end if;
end $mig$;

-- referencia del remito: peajes del cliente que cargó el operador y cobro previsto
do $mig$ declare d text; a text := $a$    'manual_toll',true,$a$; begin
  d := replace(pg_get_functiondef('public.get_driver_remito_reference_v2(uuid)'::regprocedure), E'\r', '');
  if position('planned_customer_tolls' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'get_driver_remito_reference_v2: texto no encontrado'; end if;
    d := replace(d, a, $b$    'planned_customer_tolls',case when p_service_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('toll_id',t.toll_id,'manual',t.toll_id is null,'toll_name',t.toll_name_snapshot,'quantity',t.quantity,'unit_amount',t.unit_amount,'currency',t.currency) order by t.created_at) from public.operator_service_tolls t where t.service_id=p_service_id and t.payer_agent='customer' and t.source in ('planned','manual')),'[]'::jsonb) end,
    'planned_customer_payment',case when p_service_id is null then null else (select case when s.customer_payment_primary is null then null else jsonb_build_object('primary',s.customer_payment_primary,'secondary',s.customer_payment_secondary,'secondary_amount',s.customer_payment_secondary_amount) end from public.operator_services s where s.service_id=p_service_id) end,
$b$||a);
    execute d;
  end if;
end $mig$;

-- rendición de efectivo del mes
do $mig$ declare d text; a text := $a$then coalesce((select sum(t.total_amount) from public.remito_toll_reports t where t.remito_id=r.remito_id and t.customer_payment_method='cash'),0)+coalesce((select sum(e.total_amount) from public.remito_excess_reports e where e.remito_id=r.remito_id and e.customer_payment_method='cash'),0)$a$; begin
  d := replace(pg_get_functiondef('app_private.monthly_cash_source(uuid,integer)'::regprocedure), E'\r', '');
  if position('remito_customer_payment_lines_v1' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'monthly_cash_source: texto no encontrado'; end if;
    d := replace(d, a, $b$then coalesce((select sum(x.amount) from app_private.remito_customer_payment_lines_v1(r.remito_id) x where x.method='cash'),0)$b$);
    execute d;
  end if;
end $mig$;

-- resumen del mes del chofer: cobros por medio
do $mig$ declare d text; a text := $a$    select coalesce(nullif(t.customer_payment_method,''),'other'), t.total_amount
      from public.remito_toll_reports t join rem on rem.remito_id = t.remito_id
     where rem.v2 and t.customer_payment_method is not null
    union all
    select coalesce(nullif(e.customer_payment_method,''),'other'), e.total_amount
      from public.remito_excess_reports e join rem on rem.remito_id = e.remito_id
     where rem.v2 and e.customer_payment_method is not null$a$; begin
  d := replace(pg_get_functiondef('app_private.driver_month_ops_v1(uuid,date)'::regprocedure), E'\r', '');
  if position('remito_customer_payment_lines_v1' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'driver_month_ops_v1: texto no encontrado'; end if;
    d := replace(d, a, $b$    select coalesce(nullif(x.method,''),'other'), x.amount
      from rem cross join lateral app_private.remito_customer_payment_lines_v1(rem.remito_id) x
     where rem.v2$b$);
    execute d;
  end if;
end $mig$;
