  -- Migration: integración de rendiciones con liquidación de sueldos
  -- Fecha: 2026-07-01
  -- Motivo: reflejar faltantes de rendición como ajuste descontado del recibo.
  -- Regla de negocio:
  --   * SOLO faltantes descuentan (efectivo_declarado + gastos_extra < efectivo_esperado).
  --   * Sobrantes NO acreditan (auditoría manual — evita fraude por sobre-declaración).
  --   * Ajuste se auto-recalcula mientras estado='pendiente'.
  --   * Al pasar a 'aprobada' → snapshot congelado.
  -- Idempotente.

  ALTER TABLE payroll_liquidaciones
    ADD COLUMN IF NOT EXISTS ajuste_rendiciones NUMERIC(12,2) NOT NULL DEFAULT 0;

  COMMENT ON COLUMN payroll_liquidaciones.ajuste_rendiciones IS
    'Descuento por faltantes de rendición del mes. Positivo = se resta del total. Snapshot al aprobar.';
