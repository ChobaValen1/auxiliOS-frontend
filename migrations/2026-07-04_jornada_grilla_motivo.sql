-- ================================================================
-- Motivo del chofer cuando abre jornada fuera de lo planificado
-- (móvil distinto al de la grilla, franco trabajado o móvil en taller).
-- Lo completa la app al iniciar jornada; lo muestra la alerta del admin.
-- ================================================================

ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS grilla_motivo TEXT;
