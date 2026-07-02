-- Migration: agrega columnas para el flujo de aprobación admin sobre rendicion_cierre
-- Fecha: 2026-07-01
-- Motivo: Historial de rendiciones (admin puede aprobar / observar con nota)

ALTER TABLE rendicion_cierre
  ADD COLUMN IF NOT EXISTS admin_status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (admin_status IN ('pendiente','aprobada','observada')),
  ADD COLUMN IF NOT EXISTS admin_by     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_nota   TEXT;

-- Índice para el listado admin (ordena por fecha desc + filtra por status)
CREATE INDEX IF NOT EXISTS idx_rendicion_admin_status_fecha
  ON rendicion_cierre (admin_status, fecha DESC);
