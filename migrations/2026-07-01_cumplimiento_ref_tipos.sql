-- Migration: extender ref_tipo de cumplimientos para incluir patente/socio
-- Fecha: 2026-07-01
-- Motivo: la referencia del cumplimiento ahora es obligatoria y cruzada contra
--         datos reales del chofer en el período (patente, razón social o
--         nro de servicio). Necesitamos preservar de dónde salió la referencia
--         para auditoría.
-- Idempotente.

ALTER TABLE payroll_objetivo_cumplimientos
  DROP CONSTRAINT IF EXISTS payroll_objetivo_cumplimientos_ref_tipo_check;

ALTER TABLE payroll_objetivo_cumplimientos
  ADD CONSTRAINT payroll_objetivo_cumplimientos_ref_tipo_check
  CHECK (ref_tipo IN ('remito','servicio','manual','patente','socio'));
