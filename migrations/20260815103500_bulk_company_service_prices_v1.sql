-- AuxiliOS · edición masiva atómica de precios vigentes v1
-- Reutiliza save_company_service_price_v1 para conservar exactamente las mismas
-- validaciones, cascadas e historial que la edición individual.

CREATE OR REPLACE FUNCTION public.bulk_save_company_service_prices_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_company uuid := nullif(p_payload->>'company_id', '')::uuid;
  v_prices jsonb := coalesce(p_payload->'prices', '[]'::jsonb);
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
  v_key text;
  v_seen text[] := '{}';
BEGIN
  IF v_role <> 'administracion' THEN
    RAISE EXCEPTION 'Solo Administración puede actualizar precios en forma masiva';
  END IF;

  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Prestadora inexistente';
  END IF;

  IF jsonb_typeof(v_prices) <> 'array' THEN
    RAISE EXCEPTION 'El lote de precios debe ser un array';
  END IF;

  v_count := jsonb_array_length(v_prices);
  IF v_count < 1 THEN RAISE EXCEPTION 'No hay precios para actualizar'; END IF;
  IF v_count > 500 THEN RAISE EXCEPTION 'El lote supera el máximo de 500 precios'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_prices)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Cada precio del lote debe ser un objeto';
    END IF;
    IF nullif(v_item->>'concept_id', '') IS NULL THEN
      RAISE EXCEPTION 'Una de las tarifas no tiene Tipo de Servicio';
    END IF;

    v_key := (v_item->>'concept_id') || '|' || coalesce(v_item->>'billing_base_id', '');
    IF v_key = ANY(v_seen) THEN
      RAISE EXCEPTION 'El lote contiene el mismo precio más de una vez';
    END IF;
    v_seen := array_append(v_seen, v_key);

    v_result := public.save_company_service_price_v1(
      v_item || jsonb_build_object('company_id', v_company)
    );
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN jsonb_build_object('count', v_count, 'prices', v_results);
END
$function$;

COMMENT ON FUNCTION public.bulk_save_company_service_prices_v1(jsonb) IS
  'Actualiza múltiples precios vigentes de una Prestadora en una única transacción atómica, reutilizando save_company_service_price_v1.';
