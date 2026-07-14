-- 2026-07-14 · Control de KM cargados a mano (IA vs chofer)
-- Spec: docs/superpowers/specs/2026-07-14-km-manual-control-design.md

-- 1 · Trazabilidad en daily_logs
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS km_inicio_ia     integer,
  ADD COLUMN IF NOT EXISTS km_inicio_origen text
    CHECK (km_inicio_origen IN ('ia','manual_ia_fallo','manual_editado','manual_offline')),
  ADD COLUMN IF NOT EXISTS km_final_ia      integer,
  ADD COLUMN IF NOT EXISTS km_final_origen  text
    CHECK (km_final_origen  IN ('ia','manual_ia_fallo','manual_editado','manual_offline'));

-- 2 · Soporte del tipo nuevo en alertas_operativas
ALTER TABLE alertas_operativas
  ADD COLUMN IF NOT EXISTS log_id  integer REFERENCES daily_logs(log_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS extremo text CHECK (extremo IN ('inicio','final'));

ALTER TABLE alertas_operativas ALTER COLUMN rendicion_id DROP NOT NULL;
ALTER TABLE alertas_operativas ALTER COLUMN diferencia_monto DROP NOT NULL;  -- km_manual sin lectura IA no tiene diferencia

ALTER TABLE alertas_operativas DROP CONSTRAINT alertas_operativas_tipo_check;
ALTER TABLE alertas_operativas ADD CONSTRAINT alertas_operativas_tipo_check
  CHECK (tipo IN ('diferencia_efectivo','gasto_no_registrado','sin_rendicion','km_manual'));

-- 3 · Trigger: alerta automática cuando el KM se cargó a mano
--     (no dispara para 'ia' ni 'manual_offline'; idempotente por log+extremo)
CREATE OR REPLACE FUNCTION public.tg_daily_logs_alerta_km_manual()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.km_inicio_origen IN ('manual_ia_fallo','manual_editado') THEN
    INSERT INTO alertas_operativas (driver_id, fecha, tipo, log_id, extremo, diferencia_monto, estado)
    SELECT NEW.driver_id, NEW.log_date, 'km_manual', NEW.log_id, 'inicio',
           CASE WHEN NEW.km_inicio_ia IS NOT NULL THEN NEW.km_inicio - NEW.km_inicio_ia END,
           'pendiente'
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_operativas
      WHERE log_id = NEW.log_id AND tipo = 'km_manual' AND extremo = 'inicio');
  END IF;

  IF NEW.km_final_origen IN ('manual_ia_fallo','manual_editado') THEN
    INSERT INTO alertas_operativas (driver_id, fecha, tipo, log_id, extremo, diferencia_monto, estado)
    SELECT NEW.driver_id, NEW.log_date, 'km_manual', NEW.log_id, 'final',
           CASE WHEN NEW.km_final_ia IS NOT NULL THEN NEW.km_final - NEW.km_final_ia END,
           'pendiente'
    WHERE NOT EXISTS (
      SELECT 1 FROM alertas_operativas
      WHERE log_id = NEW.log_id AND tipo = 'km_manual' AND extremo = 'final');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_logs_alerta_km_manual ON public.daily_logs;
CREATE TRIGGER trg_daily_logs_alerta_km_manual
AFTER INSERT OR UPDATE OF km_inicio_origen, km_final_origen
ON public.daily_logs
FOR EACH ROW
EXECUTE FUNCTION public.tg_daily_logs_alerta_km_manual();
