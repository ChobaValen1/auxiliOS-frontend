-- Remito de un particular que ya pagó todo (seña + saldo antes del servicio):
-- el chofer no tiene nada que cobrar, pero save_driver_operator_service_remito_v5
-- exigía igual un medio de pago o "No cobré". Sin saldo y sin cobro informado,
-- el remito se guarda sin reporte de cobro.
do $mig$
declare
  v_def text := pg_get_functiondef('public.save_driver_operator_service_remito_v5(uuid,jsonb,uuid)'::regprocedure);
  v_new text;
begin
  if position('cobro_ya_pago_v1' in v_def) > 0 then return; end if;
  v_new := replace(v_def,
    '  elsif v_total <= 0 then',
    '  elsif v_total <= 0 and v_saldo <= 0.009 then
    return v_result; -- cobro_ya_pago_v1: ya estaba todo pago
  elsif v_total <= 0 then');
  if v_new = v_def then raise exception 'save_driver_operator_service_remito_v5: no se encontró el punto a cambiar'; end if;
  execute v_new;
end
$mig$;
