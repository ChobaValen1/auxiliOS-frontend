-- Migration: módulo de liquidación de sueldos (payroll)
-- Fecha: 2026-07-01
-- Motivo: 4 tablas nuevas para calcular sueldos mensuales de choferes
--         (catálogo de objetivos, esquema salarial por chofer,
--          liquidaciones mes×chofer, cumplimientos de objetivos con trazabilidad).
-- Idempotente: usa IF NOT EXISTS y ON CONFLICT DO NOTHING.

-- ============================================================
-- 1) payroll_objetivos — catálogo global configurable
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_objetivos (
  objetivo_id   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT         NOT NULL UNIQUE,
  tipo          TEXT         NOT NULL
    CHECK (tipo IN ('fijo','porcentaje')),
  valor         NUMERIC(12,2) NOT NULL DEFAULT 0,
  descripcion   TEXT,
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_objetivos_activo
  ON payroll_objetivos (activo, nombre);

-- ============================================================
-- 2) payroll_settings — esquema salarial por chofer
--    PK = user_id (una fila por chofer). CASCADE: si se borra el
--    chofer, no tiene sentido conservar el esquema.
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_settings (
  user_id            UUID          PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  sueldo_basico      NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_km           NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_servicio     NUMERIC(12,2) NOT NULL DEFAULT 0,
  bono_presentismo   NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3) payroll_liquidaciones — una por chofer × mes
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_liquidaciones (
  liquidacion_id     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id          UUID          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  periodo_yyyymm     INTEGER       NOT NULL,          -- ej. 202607
  -- snapshot
  jornadas           INTEGER       NOT NULL DEFAULT 0,
  km_total           INTEGER       NOT NULL DEFAULT 0,
  servicios          INTEGER       NOT NULL DEFAULT 0,
  -- desglose
  sueldo_basico      NUMERIC(12,2) NOT NULL DEFAULT 0,
  adic_km            NUMERIC(12,2) NOT NULL DEFAULT 0,
  adic_serv          NUMERIC(12,2) NOT NULL DEFAULT 0,
  presentismo_paga   BOOLEAN       NOT NULL DEFAULT FALSE,
  bono_presentismo   NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonos_objetivos    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- flujo
  estado             TEXT          NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobada','pagada')),
  aprobada_by        UUID          REFERENCES users(user_id) ON DELETE SET NULL,
  aprobada_at        TIMESTAMPTZ,
  pagada_at          TIMESTAMPTZ,
  pagada_metodo      TEXT,
  notas              TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_liq_driver_periodo UNIQUE (driver_id, periodo_yyyymm)
);

CREATE INDEX IF NOT EXISTS idx_payroll_liq_periodo_estado
  ON payroll_liquidaciones (periodo_yyyymm, estado);

CREATE INDEX IF NOT EXISTS idx_payroll_liq_driver_periodo
  ON payroll_liquidaciones (driver_id, periodo_yyyymm DESC);

-- ============================================================
-- 4) payroll_objetivo_cumplimientos — una fila por cumplimiento cargado
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_objetivo_cumplimientos (
  cumplimiento_id    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  objetivo_id        UUID          NOT NULL REFERENCES payroll_objetivos(objetivo_id) ON DELETE CASCADE,
  driver_id          UUID          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  periodo_yyyymm     INTEGER       NOT NULL,
  fecha              DATE          NOT NULL DEFAULT CURRENT_DATE,
  cantidad           NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus_calculado    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_tipo           TEXT          NOT NULL DEFAULT 'manual'
    CHECK (ref_tipo IN ('remito','servicio','manual')),
  ref_id             TEXT,          -- link libre: remito_id, service_id, etc.
  cargado_by         UUID          REFERENCES users(user_id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_cumpl_driver_periodo
  ON payroll_objetivo_cumplimientos (driver_id, periodo_yyyymm);

CREATE INDEX IF NOT EXISTS idx_payroll_cumpl_objetivo
  ON payroll_objetivo_cumplimientos (objetivo_id);

-- ============================================================
-- SEED: 3 objetivos default (idempotente por unique(nombre))
-- ============================================================
INSERT INTO payroll_objetivos (nombre, tipo, valor, descripcion, activo) VALUES
  ('Baterías',   'fijo',       3000, 'Por batería vendida',           TRUE),
  ('Particular', 'porcentaje', 10,   'Del total del remito particular', TRUE),
  ('Taller',     'fijo',       2000, 'Por servicio derivado',         TRUE)
ON CONFLICT (nombre) DO NOTHING;
