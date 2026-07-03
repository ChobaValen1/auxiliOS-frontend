-- ================================================================
-- FERIADOS — marca días feriados para la pantalla de grilla mensual
-- Idempotente. Un feriado aplica al día completo (todas las unidades).
-- ================================================================

CREATE TABLE IF NOT EXISTS feriados (
  fecha      DATE PRIMARY KEY,
  nombre     TEXT NOT NULL DEFAULT 'Feriado',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feriados nacionales AR restantes de 2026 (editables desde la app)
INSERT INTO feriados (fecha, nombre) VALUES
  ('2026-07-09', 'Día de la Independencia'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín'),
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('2026-11-20', 'Día de la Soberanía Nacional'),
  ('2026-12-08', 'Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad')
ON CONFLICT (fecha) DO NOTHING;
