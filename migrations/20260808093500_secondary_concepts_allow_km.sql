-- AuxiliOS · Conceptos secundarios medidos en KM
-- El motor ya multiplica quantity * unit_price para secundarios. La única
-- restricción restante era un rechazo explícito de pricing_unit='km'.

do $migration$
declare
  v_fn regprocedure := 'app_private.calculate_operator_service_quote_full(uuid,uuid,timestamp with time zone,uuid,jsonb,numeric,numeric,boolean)'::regprocedure;
  v_def text;
  v_old text := 'if v_item.pricing_unit=''km'' then raise exception ''Los conceptos secundarios no pueden cobrar kilómetros''; end if;';
begin
  select pg_get_functiondef(v_fn) into v_def;
  if position(v_old in v_def) = 0 then
    raise exception 'No se encontró la restricción legacy de secundarios por KM';
  end if;
  v_def := replace(v_def, v_old, 'null; -- secundarios por KM permitidos; quantity expresa los KM facturables');
  execute v_def;
end
$migration$;
