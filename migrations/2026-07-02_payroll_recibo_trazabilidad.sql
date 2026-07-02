-- Migration: trazabilidad completa del recibo de sueldo
-- Fecha: 2026-07-02
-- Motivo: el recibo debe ser auditable después de emitido. Necesitamos:
--   * saber quién generó y quién marcó como pagada la liquidación,
--   * cuándo se emitió (distinto del "pagada_at"),
--   * y preservar los valores unitarios ($/km, $/servicio, presentismo) que se
--     usaron para calcular el bruto, porque el esquema salarial puede cambiar
--     después y el recibo perdería su fórmula reconstruible.
-- Idempotente.

ALTER TABLE payroll_liquidaciones
  ADD COLUMN IF NOT EXISTS generada_by                UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generada_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pagada_by                  UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_km_snapshot          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_servicio_snapshot    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bono_presentismo_snapshot  NUMERIC(12,2);

COMMENT ON COLUMN payroll_liquidaciones.generada_by IS
  'Usuario admin que corrió Generar liquidaciones para este período.';
COMMENT ON COLUMN payroll_liquidaciones.generada_at IS
  'Timestamp exacto de emisión (última regeneración). Distinto de pagada_at.';
COMMENT ON COLUMN payroll_liquidaciones.pagada_by IS
  'Usuario admin que marcó la liquidación como pagada.';
COMMENT ON COLUMN payroll_liquidaciones.valor_km_snapshot IS
  'Valor $/km del esquema salarial en el momento de generar. Se congela para auditoría.';
COMMENT ON COLUMN payroll_liquidaciones.valor_servicio_snapshot IS
  'Valor $/servicio del esquema salarial en el momento de generar. Se congela para auditoría.';
COMMENT ON COLUMN payroll_liquidaciones.bono_presentismo_snapshot IS
  'Bono de presentismo configurado. Se congela aunque no se pague, para explicar el "$0" del recibo.';
