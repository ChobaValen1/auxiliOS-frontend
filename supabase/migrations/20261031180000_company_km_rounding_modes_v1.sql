-- Redondeo de km visible en Servicios y Facturación · 31/10/2026
-- Servicios y Facturación muestran los km como los factura la prestadora: si en Parámetros eligió
-- «Kilómetros enteros», asfalto y ripio se muestran redondeados (cada uno por separado).
-- El operador no lee company_billing_settings; esta función expone sólo la regla de redondeo y su vigencia.
-- Sólo lectura: no cambia datos ni el cálculo de precios.
create or replace function public.list_company_km_rounding_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
begin
 if auth.uid() is null or coalesce(app_private.current_auxilios_role(),'') not in ('administracion','operador','supervision','facturacion') then
  raise exception 'Sin permiso para consultar reglas de facturación';
 end if;
 -- Mismo orden que usa el motor para elegir la regla vigente: primero la general (sin contrato), la más reciente.
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'company_id',s.company_id,'valid_from',s.valid_from,'valid_until',s.valid_until,
    'km_rounding_mode',coalesce(s.km_rounding_mode,'decimal'))
   order by s.company_id,(s.contract_id is null) desc,s.valid_from desc,s.created_at desc)
  from public.company_billing_settings s where s.is_active),'[]'::jsonb);
end $f$;
revoke all on function public.list_company_km_rounding_v1() from public,anon;
grant execute on function public.list_company_km_rounding_v1() to authenticated;
