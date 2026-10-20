-- Cobro al cliente · medio principal + segundo medio · 20/10/2026 (pedido del dueño)
-- El cliente paga el TOTAL (peajes a su cargo + excedentes que cobra la Empresa) con un medio principal y,
-- si hace falta, un segundo medio por una parte del importe. Ya no hay un medio por peaje.
-- El operador puede dejar el principal "A definir" (to_define): lo completa el Chofer en el remito.
-- Aditivo: columnas nuevas en servicios y remitos; cada línea del cliente sigue guardando el medio principal
-- para que lo existente (facturación, revisión, exportaciones) funcione igual. Reemplazos puntuales (fallan si no
-- encuentran el texto). Lo que ya existe se sigue leyendo como hasta ahora.
set lock_timeout = '10s';

alter table public.operator_services
  add column if not exists customer_payment_primary text,
  add column if not exists customer_payment_secondary text,
  add column if not exists customer_payment_secondary_amount numeric(14,2);
alter table public.remitos
  add column if not exists customer_payment_primary text,
  add column if not exists customer_payment_secondary text,
  add column if not exists customer_payment_secondary_amount numeric(14,2);

do $c$ begin
  if not exists (select 1 from pg_constraint where conname='operator_services_customer_payment_chk') then
    alter table public.operator_services add constraint operator_services_customer_payment_chk check (
      (customer_payment_primary is null or customer_payment_primary in ('cash','transfer','card','mercado_pago','other','to_define'))
      and (customer_payment_secondary is null or customer_payment_secondary in ('cash','transfer','card','mercado_pago','other'))
      and ((customer_payment_secondary is null) = (customer_payment_secondary_amount is null))
      and (customer_payment_secondary is null or (customer_payment_secondary_amount > 0
           and customer_payment_primary is not null and customer_payment_primary <> 'to_define'
           and customer_payment_secondary <> customer_payment_primary)));
  end if;
  if not exists (select 1 from pg_constraint where conname='remitos_customer_payment_chk') then
    alter table public.remitos add constraint remitos_customer_payment_chk check (
      (customer_payment_primary is null or customer_payment_primary in ('cash','transfer','card','mercado_pago','other','not_collected'))
      and (customer_payment_secondary is null or customer_payment_secondary in ('cash','transfer','card','mercado_pago','other'))
      and ((customer_payment_secondary is null) = (customer_payment_secondary_amount is null))
      and (customer_payment_secondary is null or (customer_payment_secondary_amount > 0
           and customer_payment_primary is not null and customer_payment_primary <> 'not_collected'
           and customer_payment_secondary <> customer_payment_primary)));
  end if;
end $c$;

-- "A definir" en las líneas previstas por el operador.
alter table public.operator_service_tolls drop constraint if exists operator_service_tolls_customer_payment_chk;
alter table public.operator_service_tolls add constraint operator_service_tolls_customer_payment_chk check (
  customer_payment_method is null or customer_payment_method in ('cash','transfer','card','mercado_pago','other','to_define'));
alter table public.operator_service_excess_charges drop constraint if exists operator_service_excess_charges_customer_payment_method_check;
alter table public.operator_service_excess_charges add constraint operator_service_excess_charges_customer_payment_method_check check (
  customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected','to_define'));
alter table public.operator_service_excess_charges drop constraint if exists operator_service_excess_collector_chk;
alter table public.operator_service_excess_charges add constraint operator_service_excess_collector_chk check (
  (collector_agent = 'provider' and customer_payment_method is null)
  or (collector_agent = 'company' and customer_payment_method in ('cash','transfer','card','mercado_pago','other','not_collected','to_define')));

-- normalize: lee customer_payment, lo valida y lo aplica como medio de cada línea del cliente.
do $mig$ declare d text; n int;
  procedure_text text;
begin
  d := replace(pg_get_functiondef('app_private.normalize_service_commercial_addons_v1(uuid,timestamp with time zone,jsonb)'::regprocedure), E'\r', '');
  if position('v_cp_primary' in d) = 0 then
    -- declaraciones
    n := (length(d)-length(replace(d,'  v_unit numeric;'||E'\n','')))/length('  v_unit numeric;'||E'\n');
    if n <> 1 then raise exception 'normalize: declaraciones no encontradas'; end if;
    d := replace(d, '  v_unit numeric;'||E'\n', '  v_unit numeric;'||E'\n'||$x$  v_cp jsonb:=coalesce(p_payload,'{}'::jsonb)->'customer_payment';
  v_cp_primary text;
  v_cp_secondary text;
  v_cp_amount numeric;
  v_company_excess numeric:=0;
$x$);
    -- lectura y validación de customer_payment, antes de recorrer los peajes
    procedure_text := $a$  for v_row in select value from jsonb_array_elements(coalesce(v_payload->'tolls','[]'::jsonb)) loop$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: inicio de peajes no encontrado'; end if;
    d := replace(d, procedure_text, $b$  if jsonb_typeof(v_cp)='object' then
    v_cp_primary:=nullif(lower(btrim(coalesce(v_cp->>'primary',''))),'');
    v_cp_secondary:=nullif(lower(btrim(coalesce(v_cp->>'secondary',''))),'');
    v_cp_amount:=round(nullif(btrim(coalesce(v_cp->>'secondary_amount','')),'')::numeric,2);
    if v_cp_primary is not null and v_cp_primary not in ('cash','transfer','card','mercado_pago','other','to_define') then raise exception 'Medio de pago principal inválido'; end if;
    if v_cp_secondary is not null then
      if v_cp_primary is null or v_cp_primary='to_define' then raise exception 'Elegí el medio principal antes de sumar un segundo medio'; end if;
      if v_cp_secondary not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Segundo medio de pago inválido'; end if;
      if v_cp_secondary=v_cp_primary then raise exception 'El segundo medio tiene que ser distinto del principal'; end if;
      if coalesce(v_cp_amount,0)<=0 then raise exception 'Indicá cuánto se paga con el segundo medio'; end if;
    else
      v_cp_amount:=null;
    end if;
  end if;
$b$||procedure_text);
    -- peajes: el medio de cada línea del cliente es el principal; se acepta "A definir"
    -- (primero el manual, con 6 espacios: su texto contiene al del catálogo)
    procedure_text := $a$      if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Cuando paga el cliente, el medio de pago es obligatorio'; end if;$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: validación de peaje manual no encontrada (%)', n; end if;
    d := replace(d, procedure_text, $b$      if v_payer='customer' and v_cp_primary is not null then v_customer_method:=v_cp_primary; end if;
      if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','to_define') then raise exception 'Elegí el medio de pago del cliente'; end if;$b$);
    procedure_text := $a$    if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other') then raise exception 'Cuando paga el cliente, el medio de pago es obligatorio'; end if;$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: validación de peaje del catálogo no encontrada (%)', n; end if;
    d := replace(d, procedure_text, $b$    if v_payer='customer' and v_cp_primary is not null then v_customer_method:=v_cp_primary; end if;
    if v_payer='customer' and v_customer_method not in ('cash','transfer','card','mercado_pago','other','to_define') then raise exception 'Elegí el medio de pago del cliente'; end if;$b$);
    -- excedentes que cobra la Empresa: mismo medio principal
    procedure_text := $a$    if v_collector='provider' then
      v_customer_method:=null;
    elsif v_customer_method not in ('cash','transfer','card','mercado_pago','other') then$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: validación de excedente no encontrada'; end if;
    d := replace(d, procedure_text, $b$    if v_collector<>'provider' and v_cp_primary is not null then v_customer_method:=v_cp_primary; end if;
    if v_collector='provider' then
      v_customer_method:=null;
    elsif v_customer_method not in ('cash','transfer','card','mercado_pago','other','to_define') then$b$);
    procedure_text := $a$    v_excess_total:=v_excess_total+(v_excess_qty*v_excess_unit);$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: total de excedentes no encontrado'; end if;
    d := replace(d, procedure_text, procedure_text||E'\n'||$b$    if v_collector<>'provider' then v_company_excess:=v_company_excess+(v_excess_qty*v_excess_unit); end if;$b$);
    -- salida: el segundo importe tiene que ser menor al total a cobrar
    procedure_text := $a$  return jsonb_build_object(
    'toll_coverage_mode',v_mode,$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: retorno no encontrado'; end if;
    d := replace(d, procedure_text, $b$  if round(v_customer_total+v_company_excess,2)<=0 then
    v_cp_primary:=null; v_cp_secondary:=null; v_cp_amount:=null;
  elsif v_cp_secondary is not null and v_cp_amount>=round(v_customer_total+v_company_excess,2) then
    raise exception 'Lo que se paga con el segundo medio tiene que ser menor al total a cobrar ($%)',translate(to_char(round(v_customer_total+v_company_excess,2),'FM999,999,990.00'),',.','.,');
  end if;
$b$||procedure_text);
    procedure_text := $a$'customer_excess_total',round(v_excess_total,2)
  );$a$;
    n := (length(d)-length(replace(d,procedure_text,'')))/length(procedure_text);
    if n <> 1 then raise exception 'normalize: cierre del retorno no encontrado'; end if;
    d := replace(d, procedure_text, $b$'customer_excess_total',round(v_excess_total,2)
  )||case when jsonb_typeof(v_cp)='object' then jsonb_build_object('customer_payment',jsonb_build_object(
    'primary',v_cp_primary,'secondary',v_cp_secondary,'secondary_amount',v_cp_amount,
    'total',round(v_customer_total+v_company_excess,2))) else '{}'::jsonb end;$b$);
    execute d;
  end if;
end $mig$;

-- persist: guarda el cobro previsto en el servicio (sólo si vino en el payload).
do $mig$ declare d text; a text := $a$toll_coverage_mode=nullif(p_normalized->>'toll_coverage_mode',''),updated_by=v_uid,updated_at=now()
  where service_id=p_service_id;$a$; begin
  d := replace(pg_get_functiondef('app_private.persist_service_commercial_addons_v1(uuid,jsonb)'::regprocedure), E'\r', '');
  if position('customer_payment_primary' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'persist_service_commercial_addons_v1: texto no encontrado'; end if;
    d := replace(d, a, a||$b$

  if p_normalized ? 'customer_payment' then
    update public.operator_services set
      customer_payment_primary=nullif(p_normalized#>>'{customer_payment,primary}',''),
      customer_payment_secondary=nullif(p_normalized#>>'{customer_payment,secondary}',''),
      customer_payment_secondary_amount=nullif(p_normalized#>>'{customer_payment,secondary_amount}','')::numeric
    where service_id=p_service_id;
  end if;$b$);
    execute d;
  end if;
end $mig$;

-- lectura: el formulario del operador recibe el cobro previsto.
do $mig$ declare d text; a text := $a$'tolls',v_tolls,'excess_charges',v_excess,'actual_tolls',v_actual_tolls$a$; begin
  d := replace(pg_get_functiondef('public.get_operator_service_commercial_addons_v1(uuid)'::regprocedure), E'\r', '');
  if position('customer_payment_primary' in d) = 0 then
    if (length(d)-length(replace(d,a,'')))/length(a) <> 1 then raise exception 'get_operator_service_commercial_addons_v1: texto no encontrado'; end if;
    d := replace(d, a, $b$'customer_payment',jsonb_build_object('primary',v_service.customer_payment_primary,'secondary',v_service.customer_payment_secondary,'secondary_amount',v_service.customer_payment_secondary_amount),$b$||a);
    execute d;
  end if;
end $mig$;
