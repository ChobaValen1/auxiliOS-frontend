-- Facturación · Excel: más datos por servicio · 19/10/2026 (pedido del dueño)
-- get_operator_billing_export_rows_v1 devuelve además: N° de remito, hora de arribo, demora otorgada,
-- activado (sí/no, tipo, km, si se cobra), logística (propia/tercerizada), nombre del tercerizado (sin importes)
-- y los conceptos sí/no marcados (p. ej. Pinacars).
-- Sólo lectura: no cambia ningún dato. Reemplazos puntuales sobre la función vigente (falla si no encuentra su texto).
do $mig$ declare d text; begin
  d := pg_get_functiondef('public.get_operator_billing_export_rows_v1(uuid[])'::regprocedure);
  if position('outsourced_provider_name' in d) = 0 then
    d := replace(d, $a$      rem.observaciones remito_observations
$a$, $b$      rem.observaciones remito_observations,rem.nro_remito remito_number,
      s.arrived_at,s.granted_delay_minutes,s.driver_activated,s.activation_kind,s.activation_km,s.activation_billing,s.logistics_type,
      (SELECT p.display_name FROM public.outsourced_service_costs oc JOIN public.outsourced_providers p ON p.provider_id=oc.provider_id WHERE oc.service_id=s.service_id) outsourced_provider_name,
      (SELECT string_agg(DISTINCT tc.name,', ') FROM public.service_toggle_marks m JOIN public.service_concepts tc ON tc.concept_id=m.concept_id
        WHERE m.is_on AND (m.service_id=s.service_id OR (s.remito_id IS NOT NULL AND m.remito_id=s.remito_id))) toggle_names
$b$);
    d := replace(d, $a$'pricing_error',v_error,'quote',q
    ));$a$, $b$'pricing_error',v_error,'quote',q
    )||jsonb_build_object(
      'remito_number',r.remito_number,'arrived_at',r.arrived_at,'granted_delay_minutes',r.granted_delay_minutes,
      'driver_activated',coalesce(r.driver_activated,false),'activation_kind',r.activation_kind,'activation_km',r.activation_km,
      'activation_billing',r.activation_billing,'logistics_type',coalesce(r.logistics_type,'own'),
      'outsourced_provider_name',r.outsourced_provider_name,'toggle_names',r.toggle_names
    ));$b$);
    if position('outsourced_provider_name,' in d) = 0 or position('''toggle_names'',r.toggle_names' in d) = 0 then
      raise exception 'get_operator_billing_export_rows_v1: no se encontró el texto a reemplazar';
    end if;
    execute d;
  end if;
end $mig$;
