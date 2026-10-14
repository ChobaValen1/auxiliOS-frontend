-- El código de prestadora llegaba a veces con espacios o tabulaciones al final (copiado y
-- pegado), y eso complica buscarlo. Se limpian solos al guardar, por cualquier camino.
create or replace function app_private.trim_operator_service_order_number_v1() returns trigger language plpgsql set search_path to '' as $f$
begin
  if new.service_order_number is not null then
    new.service_order_number := nullif(btrim(new.service_order_number, E' \t\r\n\u00a0'), '');
  end if;
  return new;
end $f$;
create trigger operator_services_aa_trim_order_number_v1 before insert or update of service_order_number on public.operator_services for each row execute function app_private.trim_operator_service_order_number_v1();
