-- ─────────────────────────────────────────────────────────────────────
-- 2026-07-14 · Sincronizar rendiciones al editar/anular/eliminar remitos
--
-- Problema: rendicion_cierre.efectivo_esperado queda congelado al momento
-- en que el chofer rinde. Si después administración cambia el medio de
-- pago (efectivo → transferencia), el monto o anula/elimina el remito,
-- la rendición y su alerta de diferencia quedan desincronizadas y
-- distorsionan el arqueo mensual.
--
-- Solución:
--   1. Trigger en remitos → recalcula efectivo_esperado de la rendición
--      del chofer/día afectado usando calcular_efectivo_dia().
--   2. Trigger en rendicion_cierre → cuando cambia la diferencia,
--      actualiza / resuelve / crea la alerta de diferencia_efectivo.
--
-- Las liquidaciones aprobadas/pagadas no se tocan: guardan su propio
-- snapshot en payroll_liquidaciones.ajuste_rendiciones.
-- ─────────────────────────────────────────────────────────────────────

-- 1 · Recalcular rendición cuando cambia un remito
CREATE OR REPLACE FUNCTION public.tg_remitos_sync_rendicion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Día/chofer del registro anterior (UPDATE/DELETE)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.driver_id IS NOT NULL THEN
    UPDATE rendicion_cierre
       SET efectivo_esperado = calcular_efectivo_dia(OLD.driver_id,
             DATE(OLD.created_at_device AT TIME ZONE 'America/Argentina/Buenos_Aires'))
     WHERE driver_id = OLD.driver_id
       AND fecha = DATE(OLD.created_at_device AT TIME ZONE 'America/Argentina/Buenos_Aires')
       AND estado <> 'rechazado';
  END IF;

  -- Día/chofer del registro nuevo (INSERT/UPDATE)
  -- Si es el mismo par chofer/día del bloque anterior, el UPDATE repetido es inocuo.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.driver_id IS NOT NULL THEN
    UPDATE rendicion_cierre
       SET efectivo_esperado = calcular_efectivo_dia(NEW.driver_id,
             DATE(NEW.created_at_device AT TIME ZONE 'America/Argentina/Buenos_Aires'))
     WHERE driver_id = NEW.driver_id
       AND fecha = DATE(NEW.created_at_device AT TIME ZONE 'America/Argentina/Buenos_Aires')
       AND estado <> 'rechazado';
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_remitos_sync_rendicion ON public.remitos;
CREATE TRIGGER trg_remitos_sync_rendicion
AFTER INSERT OR DELETE
   OR UPDATE OF pago_1_metodo, pago_1_monto, pago_2_metodo, pago_2_monto,
                status, driver_id, created_at_device
ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.tg_remitos_sync_rendicion();

-- 2 · Ajustar la alerta cuando cambia la diferencia de una rendición
--    Tolerancia $500 — misma que la edge function y el módulo de sueldos.
CREATE OR REPLACE FUNCTION public.tg_rendicion_sync_alerta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dif numeric := COALESCE(NEW.diferencia, 0);
BEGIN
  IF NEW.diferencia IS NOT DISTINCT FROM OLD.diferencia THEN
    RETURN NULL;
  END IF;

  IF abs(v_dif) <= 500 THEN
    -- Quedó dentro de la tolerancia → resolver alertas abiertas
    UPDATE alertas_operativas
       SET estado          = 'aprobado',
           resuelto_at     = now(),
           nota_resolucion = TRIM(COALESCE(nota_resolucion, '') ||
             ' Resuelta automáticamente: la diferencia quedó en $' || ROUND(v_dif) ||
             ' al recalcular la rendición tras una edición del remito.')
     WHERE rendicion_id = NEW.rendicion_id
       AND tipo   = 'diferencia_efectivo'
       AND estado IN ('pendiente', 'auditando');
  ELSE
    -- Sigue fuera de tolerancia → actualizar el monto de la alerta abierta
    UPDATE alertas_operativas
       SET diferencia_monto = v_dif
     WHERE rendicion_id = NEW.rendicion_id
       AND tipo   = 'diferencia_efectivo'
       AND estado IN ('pendiente', 'auditando');
    -- Si no había alerta abierta, crear una nueva
    IF NOT FOUND THEN
      INSERT INTO alertas_operativas
        (rendicion_id, driver_id, fecha, tipo, diferencia_monto, estado)
      VALUES
        (NEW.rendicion_id, NEW.driver_id, NEW.fecha, 'diferencia_efectivo', v_dif, 'pendiente');
    END IF;
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_rendicion_sync_alerta ON public.rendicion_cierre;
CREATE TRIGGER trg_rendicion_sync_alerta
AFTER UPDATE ON public.rendicion_cierre
FOR EACH ROW
EXECUTE FUNCTION public.tg_rendicion_sync_alerta();
