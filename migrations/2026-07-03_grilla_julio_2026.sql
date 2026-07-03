-- ================================================================
-- GRILLA DE ASIGNACIONES — JULIO 2026 (29-jun-2026 a 02-ago-2026)
-- Idempotente: re-ejecutable sin duplicar datos.
--  - Crea tabla asignaciones_grilla si no existe
--  - Crea choferes faltantes (busca por nombre, rol chofer)
--  - Crea móviles faltantes (busca por numero_interno)
--  - Carga/actualiza la grilla (ON CONFLICT fecha+truck_id)
-- Celdas: nombre = asignado | FRANCO = descanso | TALLER = mantenimiento
-- ================================================================

BEGIN;

-- 1) Tabla de grilla ------------------------------------------------
CREATE TABLE IF NOT EXISTS asignaciones_grilla (
  asignacion_id BIGSERIAL PRIMARY KEY,
  fecha         DATE    NOT NULL,
  truck_id      INTEGER NOT NULL REFERENCES trucks(truck_id) ON DELETE CASCADE,
  driver_id     UUID    REFERENCES users(user_id),
  estado        TEXT    NOT NULL DEFAULT 'asignado'
                CHECK (estado IN ('asignado','franco','taller')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_grilla_fecha_movil UNIQUE (fecha, truck_id),
  CONSTRAINT chk_grilla_driver CHECK (
    (estado = 'asignado' AND driver_id IS NOT NULL) OR
    (estado IN ('franco','taller') AND driver_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grilla_fecha  ON asignaciones_grilla (fecha);
CREATE INDEX IF NOT EXISTS idx_grilla_driver ON asignaciones_grilla (driver_id, fecha);

-- Por si la DB no tiene aún la columna de interno en trucks
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(20);

-- 2) Carga ----------------------------------------------------------
DO $$
DECLARE
  v_fecha_inicio CONSTANT DATE := DATE '2026-06-29';
  v_role_chofer  INTEGER;
  v_nombres      TEXT[] := ARRAY['RICARDO','HECTOR','PABLO','JORGE','SERGIO','IVAN','ELIAS','CRISTIAN'];
  v_internos     TEXT[] := ARRAY['114','201','110','116','118','120','122'];

  -- 7 móviles x 35 días (semanas 1 a 5, lunes a domingo)
  v_grilla TEXT[][] := ARRAY[
    -- 114
    ARRAY['RICARDO','RICARDO','RICARDO','RICARDO','RICARDO','FRANCO','RICARDO',
          'RICARDO','RICARDO','RICARDO','RICARDO','RICARDO','RICARDO','RICARDO',
          'RICARDO','RICARDO','FRANCO','RICARDO','RICARDO','FRANCO','RICARDO',
          'RICARDO','RICARDO','RICARDO','RICARDO','RICARDO','FRANCO','RICARDO',
          'RICARDO','RICARDO','RICARDO','RICARDO','RICARDO','FRANCO','RICARDO'],
    -- 201
    ARRAY['HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','FRANCO',
          'HECTOR','HECTOR','FRANCO','HECTOR','HECTOR','HECTOR','HECTOR',
          'HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','FRANCO',
          'HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','FRANCO',
          'HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','HECTOR','FRANCO'],
    -- 110
    ARRAY['PABLO','TALLER','PABLO','PABLO','PABLO','FRANCO','PABLO',
          'PABLO','TALLER','PABLO','PABLO','PABLO','FRANCO','PABLO',
          'PABLO','TALLER','PABLO','PABLO','PABLO','FRANCO','PABLO',
          'PABLO','TALLER','PABLO','PABLO','PABLO','FRANCO','PABLO',
          'PABLO','TALLER','PABLO','PABLO','PABLO','FRANCO','PABLO'],
    -- 116
    ARRAY['JORGE','JORGE','JORGE','JORGE','TALLER','TALLER','JORGE',
          'JORGE','FRANCO','JORGE','JORGE','JORGE','TALLER','JORGE',
          'JORGE','JORGE','JORGE','JORGE','TALLER','TALLER','JORGE',
          'JORGE','JORGE','JORGE','JORGE','TALLER','TALLER','JORGE',
          'JORGE','JORGE','JORGE','JORGE','TALLER','TALLER','JORGE'],
    -- 118
    ARRAY['SERGIO','SERGIO','SERGIO','TALLER','SERGIO','SERGIO','FRANCO',
          'SERGIO','SERGIO','SERGIO','TALLER','SERGIO','SERGIO','FRANCO',
          'SERGIO','SERGIO','SERGIO','TALLER','SERGIO','SERGIO','FRANCO',
          'SERGIO','SERGIO','SERGIO','TALLER','SERGIO','SERGIO','FRANCO',
          'SERGIO','SERGIO','SERGIO','TALLER','SERGIO','SERGIO','FRANCO'],
    -- 120
    ARRAY['IVAN','IVAN','TALLER','IVAN','IVAN','IVAN','FRANCO',
          'IVAN','IVAN','TALLER','IVAN','IVAN','IVAN','FRANCO',
          'IVAN','IVAN','TALLER','IVAN','IVAN','IVAN','FRANCO',
          'IVAN','IVAN','TALLER','IVAN','IVAN','IVAN','FRANCO',
          'IVAN','IVAN','TALLER','IVAN','IVAN','IVAN','FRANCO'],
    -- 122
    ARRAY['ELIAS','CRISTIAN','ELIAS','CRISTIAN','ELIAS','CRISTIAN','ELIAS',
          'CRISTIAN','ELIAS','CRISTIAN','ELIAS','TALLER','ELIAS','CRISTIAN',
          'ELIAS','CRISTIAN','ELIAS','CRISTIAN','TALLER','CRISTIAN','ELIAS',
          'CRISTIAN','ELIAS','CRISTIAN','ELIAS','TALLER','ELIAS','CRISTIAN',
          'ELIAS','CRISTIAN','ELIAS','CRISTIAN','TALLER','CRISTIAN','ELIAS']
  ];

  v_nombre   TEXT;
  v_interno  TEXT;
  v_uid      UUID;
  v_tid      INTEGER;
  v_celda    TEXT;
  v_fecha    DATE;
  i INTEGER; j INTEGER;
BEGIN
  SELECT role_id INTO v_role_chofer FROM roles WHERE name = 'chofer';
  IF v_role_chofer IS NULL THEN
    RAISE EXCEPTION 'No existe el rol "chofer" en la tabla roles';
  END IF;

  -- Mapas temporales nombre->user_id e interno->truck_id
  CREATE TEMP TABLE IF NOT EXISTS tmp_chofer_map (nombre TEXT PRIMARY KEY, user_id UUID) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS tmp_truck_map  (interno TEXT PRIMARY KEY, truck_id INTEGER) ON COMMIT DROP;

  -- 2a) Choferes: buscar por nombre, crear si falta ------------------
  FOREACH v_nombre IN ARRAY v_nombres LOOP
    SELECT user_id INTO v_uid
    FROM users
    WHERE full_name ILIKE v_nombre || '%'
      AND is_active
    ORDER BY (role_id = v_role_chofer) DESC, created_at
    LIMIT 1;

    IF v_uid IS NULL THEN
      INSERT INTO users (role_id, legajo, email, password_hash, full_name)
      VALUES (
        v_role_chofer,
        'CHO-G' || lpad((100 + array_position(v_nombres, v_nombre))::TEXT, 3, '0'),
        lower(v_nombre) || '@sigmaremolques.com',
        crypt('Chofer1234!', gen_salt('bf')),
        initcap(v_nombre)
      )
      ON CONFLICT (email) DO UPDATE SET is_active = TRUE
      RETURNING user_id INTO v_uid;
      RAISE NOTICE 'Chofer creado: % (%)', initcap(v_nombre), v_uid;
    END IF;

    INSERT INTO tmp_chofer_map VALUES (v_nombre, v_uid)
    ON CONFLICT (nombre) DO UPDATE SET user_id = EXCLUDED.user_id;
  END LOOP;

  -- 2b) Móviles: buscar por numero_interno, crear si falta -----------
  FOREACH v_interno IN ARRAY v_internos LOOP
    SELECT truck_id INTO v_tid
    FROM trucks
    WHERE regexp_replace(COALESCE(numero_interno,''), '\D', '', 'g') = v_interno
    ORDER BY truck_id
    LIMIT 1;

    IF v_tid IS NULL THEN
      BEGIN
        INSERT INTO trucks (plate, numero_interno, status, notes)
        VALUES ('MOVIL-' || v_interno, v_interno, 'activo',
                'Creado por migración grilla julio 2026 — completar patente real')
        RETURNING truck_id INTO v_tid;
      EXCEPTION WHEN check_violation THEN
        -- Esquemas donde el CHECK de status solo admite valores en inglés
        INSERT INTO trucks (plate, numero_interno, status, notes)
        VALUES ('MOVIL-' || v_interno, v_interno, 'active',
                'Creado por migración grilla julio 2026 — completar patente real')
        RETURNING truck_id INTO v_tid;
      END;
      RAISE NOTICE 'Móvil creado: % (truck_id=%)', v_interno, v_tid;
    END IF;

    INSERT INTO tmp_truck_map VALUES (v_interno, v_tid)
    ON CONFLICT (interno) DO UPDATE SET truck_id = EXCLUDED.truck_id;
  END LOOP;

  -- 2c) Grilla: 7 móviles x 35 días ----------------------------------
  FOR i IN 1 .. array_length(v_internos, 1) LOOP
    SELECT truck_id INTO v_tid FROM tmp_truck_map WHERE interno = v_internos[i];

    FOR j IN 1 .. 35 LOOP
      v_fecha := v_fecha_inicio + (j - 1);
      v_celda := v_grilla[i][j];

      IF v_celda IN ('FRANCO','TALLER') THEN
        INSERT INTO asignaciones_grilla (fecha, truck_id, driver_id, estado)
        VALUES (v_fecha, v_tid, NULL, lower(v_celda))
        ON CONFLICT (fecha, truck_id)
        DO UPDATE SET driver_id = NULL, estado = lower(v_celda);
      ELSE
        SELECT user_id INTO v_uid FROM tmp_chofer_map WHERE nombre = v_celda;
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'Chofer no mapeado en grilla: % (móvil %, %)', v_celda, v_internos[i], v_fecha;
        END IF;
        INSERT INTO asignaciones_grilla (fecha, truck_id, driver_id, estado)
        VALUES (v_fecha, v_tid, v_uid, 'asignado')
        ON CONFLICT (fecha, truck_id)
        DO UPDATE SET driver_id = EXCLUDED.driver_id, estado = 'asignado';
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Grilla julio 2026 cargada: % filas', (
    SELECT COUNT(*) FROM asignaciones_grilla
    WHERE fecha BETWEEN v_fecha_inicio AND v_fecha_inicio + 34
  );
END $$;

COMMIT;

-- Verificación rápida:
-- SELECT g.fecha, t.numero_interno AS movil,
--        COALESCE(u.full_name, upper(g.estado)) AS asignacion
-- FROM asignaciones_grilla g
-- JOIN trucks t USING (truck_id)
-- LEFT JOIN users u ON u.user_id = g.driver_id
-- ORDER BY g.fecha, t.numero_interno;
