-- Radio cubierto = umbral, no descuento (12/11/2026).
-- Regla de las prestadoras (y lo que ya decía Parámetros): si el recorrido total está dentro del
-- radio cubierto se cobra sólo la movida; si lo supera, se cobran la movida y TODOS los kilómetros.
-- El motor restaba el radio a los km (95 km con radio 10 → 85 km): se facturaban 10 km de menos.
-- Corrige las dos versiones del motor. Las facturas ya emitidas no cambian (importes congelados).
-- Las cotizaciones nuevas llevan covered_radius_consumption_order = 'threshold_all_km'.
do $patch$
declare
  fn text;
  d text;
  old_block text := 'v_billable_distance:=greatest(v_distance-coalesce(v_radius,0),0);
    v_distance_applies:=v_billable_distance>0;
    v_billable_asphalt:=greatest(coalesce(p_asphalt_km,0)-coalesce(v_radius,0),0);
    v_billable_gravel:=greatest(
      coalesce(p_gravel_km,0)-greatest(coalesce(v_radius,0)-coalesce(p_asphalt_km,0),0),
      0
    );';
  new_block text := '-- Radio = umbral: dentro del radio sólo movida; fuera, todos los km (asfalto y ripio completos).
    v_billable_distance:=case when v_distance<=coalesce(v_radius,0) then 0 else v_distance end;
    v_distance_applies:=v_billable_distance>0;
    v_billable_asphalt:=case when v_distance<=coalesce(v_radius,0) then 0 else coalesce(p_asphalt_km,0) end;
    v_billable_gravel:=case when v_distance<=coalesce(v_radius,0) then 0 else coalesce(p_gravel_km,0) end;';
  old_tag text := '''covered_radius_consumption_order'',''asphalt_then_gravel''';
  new_tag text := '''covered_radius_consumption_order'',''threshold_all_km''';
begin
  foreach fn in array array[
    'app_private.calculate_operator_service_quote_v4_full(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean)',
    'app_private.calculate_operator_service_quote_v5_km_full(uuid,uuid,timestamptz,uuid,jsonb,numeric,numeric,numeric,boolean)'
  ] loop
    if to_regprocedure(fn) is null then continue; end if;
    d := replace(pg_get_functiondef(fn::regprocedure), E'\r', '');
    if position(new_tag in d) > 0 then continue; end if;  -- ya aplicada
    if (length(d) - length(replace(d, old_block, ''))) / length(old_block) <> 1
       or (length(d) - length(replace(d, old_tag, ''))) / length(old_tag) <> 1 then
      raise exception 'El motor de tarifas cambió (%); revisar antes de corregir el radio', fn;
    end if;
    d := replace(replace(d, old_block, new_block), old_tag, new_tag);
    execute d;
  end loop;
end
$patch$;
