-- Migration: calcular_gastos_dia debe considerar SOLO combustible pagado en efectivo.
-- Motivo: las cargas con payment_method='app' (YPF/SHELL/etc.) se pagan por contrato
-- a 15 días y NO afectan la caja diaria del chofer. Excluirlas del gasto del sistema
-- evita que la rendición marque falsos faltantes de efectivo.

CREATE OR REPLACE FUNCTION calcular_gastos_dia(
  p_driver_id UUID,
  p_fecha     DATE
) RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(fr.total_cost), 0)::NUMERIC
  FROM   fuel_records fr
  JOIN   daily_logs   dl ON dl.truck_id = fr.truck_id
                        AND dl.log_date = fr.fuel_date
  WHERE  dl.driver_id      = p_driver_id
    AND  fr.fuel_date      = p_fecha
    AND  fr.payment_method = 'efectivo';
$$ LANGUAGE SQL STABLE;
