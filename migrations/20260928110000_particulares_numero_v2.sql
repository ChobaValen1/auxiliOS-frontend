-- Particulares v2: número de servicio propio.
--
-- El alta exige un "código de prestadora" (el N° de prestación que manda la
-- prestadora). Un particular no lo tiene: se genera PART-00001, PART-00002…
-- con una secuencia propia. La unicidad por prestadora la sigue validando el
-- trigger operator_service_validate_order.

create sequence if not exists public.private_service_number_seq;
revoke all on sequence public.private_service_number_seq from anon, authenticated;

do $migration$
declare v_sql text; v_before text;
begin
  select pg_get_functiondef('public.create_private_service_v1(jsonb,numeric,jsonb)'::regprocedure) into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql,
    $a$  v_payload := v_payload || jsonb_build_object('company_id', v_company);$a$,
    $a$  v_payload := v_payload || jsonb_build_object('company_id', v_company);
  if nullif(btrim(v_payload->>'service_order_number'), '') is null then
    v_payload := v_payload || jsonb_build_object('service_order_number',
      'PART-' || lpad(nextval('public.private_service_number_seq')::text, 5, '0'));
  end if;$a$);
  if v_sql = v_before then
    raise exception 'create_private_service_v1: no se encontró el punto de reemplazo';
  end if;
  execute v_sql;
end
$migration$;
