-- Servicios · la lista muestra el tercerizado en Chofer / Móvil · 19/10/2026 (pedido del dueño)
-- list_operator_services agrega outsourced_provider_name (sólo el nombre, sin importes: el operador no ve precios).
do $mig$ declare d text; begin
  d := pg_get_functiondef('public.list_operator_services(integer)'::regprocedure);
  if position('outsourced_provider_name' in d)=0 then
    d := replace(d, $a$'logistics_type',s.logistics_type,$a$, $b$'logistics_type',s.logistics_type,
        'outsourced_provider_name',(select op.display_name from public.outsourced_service_costs oc join public.outsourced_providers op on op.provider_id=oc.provider_id where oc.service_id=s.service_id),$b$);
    if position('outsourced_provider_name' in d)=0 then raise exception 'list_operator_services: no se encontró el texto a reemplazar'; end if;
    execute d;
  end if;
end $mig$;
