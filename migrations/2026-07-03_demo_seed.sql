-- ================================================================
--  SEED DE DEMO — últimos 14 días de actividad ficticia
--  Requiere: users (rol chofer), trucks y asignaciones_grilla cargados
--  (migración 2026-07-03_grilla_julio_2026.sql).
--
--  Coherente con la grilla: cada jornada usa el chofer↔móvil real del
--  día; días franco/taller no generan jornada. Para días anteriores a
--  la grilla usa el titular habitual de cada móvil.
--
--  Idempotente: no duplica jornadas ya existentes ni docs/mantenimientos.
--  No toca: users, roles, trucks (catálogo), service_plans.
--  Genera: daily_logs, remitos, fuel_records, rendicion_cierre,
--          incidents, tire_checks, maintenance_logs, truck_docs
-- ================================================================

BEGIN;

DO $seed$
DECLARE
  v_asig            RECORD;
  v_dia             DATE;
  v_km_actual       INTEGER;
  v_km_dia          INTEGER;
  v_remitos_dia     INTEGER;
  v_i               INTEGER;
  v_log_id          INTEGER;
  v_monto_total     NUMERIC;
  v_efectivo        NUMERIC;
  v_efectivo_esp    NUMERIC;
  v_gasto_ef        NUMERIC;
  v_metodo1         TEXT;
  v_nro_rem         BIGINT;
  v_tipos_serv      TEXT[] := ARRAY['Auxilio mecánico','Traslado por avería','Grúa plana','Remolque','Cambio de rueda','Batería'];
  v_origenes        TEXT[] := ARRAY['Ruta 3 Km 45','Av. Rivadavia 8500','Panamericana Km 32','Ruta 2 Km 78','Autopista 25 de Mayo','Av. Gral. Paz Km 12','Ruta 5 Km 90'];
  v_destinos        TEXT[] := ARRAY['Taller Central Lomas','Concesionaria Ford Quilmes','Base SIGMA','Taller Renault Avellaneda','Domicilio particular','Base Operativa Norte'];
  v_razones         TEXT[] := ARRAY['Transporte del Sur SA','Logística Andina SRL','García Automotores','La Segunda Seguros','Federación Patronal','Allianz Argentina','Cliente particular'];
  v_estaciones      TEXT[] := ARRAY['YPF Ruta 3','Shell Panamericana','Axion Km 25','YPF Av. Rivadavia','Puma Zona Sur'];
BEGIN

  -- ===== Titular habitual de cada móvil (fallback días sin grilla) =====
  CREATE TEMP TABLE tmp_titulares ON COMMIT DROP AS
  SELECT DISTINCT ON (truck_id) truck_id, driver_id
  FROM (
    SELECT truck_id, driver_id, COUNT(*) AS c
    FROM asignaciones_grilla
    WHERE estado = 'asignado'
    GROUP BY truck_id, driver_id
  ) s
  ORDER BY truck_id, c DESC;

  -- ===== Kilometraje corriente por camión (sin resetear valores reales) =====
  CREATE TEMP TABLE tmp_km ON COMMIT DROP AS
  SELECT truck_id, GREATEST(COALESCE(current_km, 0), 150000) AS current_km
  FROM trucks
  WHERE status IN ('active','activo');

  -- Numeración de remitos continuando la existente
  SELECT COALESCE(MAX(substring(nro_remito FROM 2)::BIGINT), 100000)
  INTO v_nro_rem
  FROM remitos
  WHERE nro_remito ~ '^R[0-9]+$';

  -- ===== Loop por día (últimos 14 días) =====
  FOR v_dia IN SELECT (CURRENT_DATE - i)::DATE FROM generate_series(1, 14) i LOOP

    FOR v_asig IN
      -- Día cubierto por la grilla: asignaciones reales (franco/taller no generan)
      SELECT g.truck_id, g.driver_id
      FROM asignaciones_grilla g
      WHERE g.fecha = v_dia AND g.estado = 'asignado'
      UNION ALL
      -- Día sin grilla: titular habitual, salteando ~20% como francos
      SELECT t.truck_id, t.driver_id
      FROM tmp_titulares t
      WHERE NOT EXISTS (SELECT 1 FROM asignaciones_grilla WHERE fecha = v_dia)
        AND RANDOM() >= 0.20
    LOOP

      -- Idempotencia: no duplicar jornadas
      IF EXISTS (
        SELECT 1 FROM daily_logs
        WHERE driver_id = v_asig.driver_id AND log_date = v_dia
      ) THEN CONTINUE; END IF;

      SELECT current_km INTO v_km_actual FROM tmp_km WHERE truck_id = v_asig.truck_id;
      IF v_km_actual IS NULL THEN CONTINUE; END IF;

      v_km_dia := 120 + (RANDOM() * 280)::INTEGER; -- 120-400 km/día

      INSERT INTO daily_logs
        (driver_id, truck_id, log_date, km_inicio, km_final, hora_inicio, hora_fin, status, created_at_device)
      VALUES
        (v_asig.driver_id, v_asig.truck_id, v_dia,
         v_km_actual, v_km_actual + v_km_dia,
         (TIME '06:00' + (RANDOM() * INTERVAL '2 hours')),
         (TIME '17:00' + (RANDOM() * INTERVAL '4 hours')),
         'closed',
         v_dia + TIME '06:00')
      RETURNING log_id INTO v_log_id;

      v_km_actual := v_km_actual + v_km_dia;
      UPDATE tmp_km SET current_km = v_km_actual WHERE truck_id = v_asig.truck_id;

      -- ===== Remitos del día (2 a 5) =====
      v_remitos_dia := 2 + (RANDOM() * 3)::INTEGER;
      v_efectivo := 0;
      v_monto_total := 0;

      FOR v_i IN 1..v_remitos_dia LOOP
        v_nro_rem := v_nro_rem + 1;
        v_metodo1 := (ARRAY['efectivo','transferencia','tarjeta','app'])[1 + (RANDOM() * 3)::INTEGER];
        DECLARE
          v_monto NUMERIC := 15000 + (RANDOM() * 65000)::NUMERIC(12,2);
          v_peaje NUMERIC := CASE WHEN RANDOM() < 0.3 THEN 1500 + (RANDOM() * 3500)::NUMERIC(12,2) ELSE 0 END;
        BEGIN
          INSERT INTO remitos
            (nro_remito, log_id, driver_id, nro_servicio, patente, marca_modelo,
             razon_social, tipo_servicio, origen, destino, km_reales,
             imp_peaje, pago_1_metodo, pago_1_monto,
             conformidad_servicio, conformidad_cargos, sin_danos,
             status, created_at_device)
          VALUES
            ('R' || LPAD(v_nro_rem::TEXT, 8, '0'),
             v_log_id, v_asig.driver_id,
             'SRV-' || (100000 + v_nro_rem)::TEXT,
             CHR(65 + (RANDOM()*25)::INT) || CHR(65 + (RANDOM()*25)::INT) ||
               LPAD(((RANDOM()*999)::INT)::TEXT, 3, '0') ||
               CHR(65 + (RANDOM()*25)::INT) || CHR(65 + (RANDOM()*25)::INT),
             (ARRAY['Ford Ranger 2019','VW Amarok 2020','Toyota Hilux 2021','Chevrolet S10 2018','Renault Duster 2022'])[1+(RANDOM()*4)::INT],
             v_razones[1 + (RANDOM() * (array_length(v_razones,1)-1))::INT],
             v_tipos_serv[1 + (RANDOM() * (array_length(v_tipos_serv,1)-1))::INT],
             v_origenes[1 + (RANDOM() * (array_length(v_origenes,1)-1))::INT],
             v_destinos[1 + (RANDOM() * (array_length(v_destinos,1)-1))::INT],
             30 + (RANDOM() * 120)::INTEGER,
             v_peaje,
             v_metodo1, v_monto,
             TRUE, TRUE, TRUE,
             'firmado',
             v_dia + TIME '08:00' + (v_i * INTERVAL '2 hours'));

          IF v_metodo1 = 'efectivo' THEN v_efectivo := v_efectivo + v_monto; END IF;
          v_monto_total := v_monto_total + v_monto;
        END;
      END LOOP;

      -- ===== Combustible cada 3 días aprox =====
      IF (EXTRACT(DAY FROM v_dia)::INT % 3) = 0 THEN
        DECLARE
          v_litros NUMERIC := 60 + (RANDOM() * 60)::NUMERIC(8,2);
          v_precio NUMERIC := 1200 + (RANDOM() * 80)::NUMERIC(10,2);
          v_pay_fuel TEXT := CASE WHEN RANDOM() < 0.5 THEN 'efectivo' ELSE 'app' END;
        BEGIN
          INSERT INTO fuel_records
            (truck_id, log_id, fuel_date, liters, price_per_liter, km_at_load,
             payment_method, payment_app, gas_station, created_at_device)
          VALUES
            (v_asig.truck_id, v_log_id, v_dia,
             v_litros, v_precio, v_km_actual - (RANDOM() * 50)::INTEGER,
             v_pay_fuel,
             CASE WHEN v_pay_fuel = 'app' THEN 'YPF Ruta' ELSE NULL END,
             v_estaciones[1 + (RANDOM() * (array_length(v_estaciones,1)-1))::INT],
             v_dia + TIME '12:00');

          IF v_pay_fuel = 'efectivo' THEN
            v_gasto_ef := v_litros * v_precio;
          ELSE
            v_gasto_ef := 0;
          END IF;
        END;
      ELSE
        v_gasto_ef := 0;
      END IF;

      -- ===== Rendición del día =====
      v_efectivo_esp := v_efectivo - v_gasto_ef;
      INSERT INTO rendicion_cierre
        (log_id, driver_id, fecha, efectivo_declarado, efectivo_esperado,
         gastos_extra, motivo_gastos_extra, estado,
         admin_status, created_at)
      VALUES
        (v_log_id, v_asig.driver_id, v_dia,
         v_efectivo_esp + (CASE WHEN RANDOM() < 0.15 THEN -(2000 + RANDOM()*3000) ELSE 0 END)::NUMERIC(12,2),
         v_efectivo_esp,
         CASE WHEN RANDOM() < 0.2 THEN (1500 + RANDOM()*5000)::NUMERIC(12,2) ELSE 0 END,
         CASE WHEN RANDOM() < 0.2 THEN 'Almuerzo + peaje adicional' ELSE NULL END,
         'pendiente',
         CASE WHEN v_dia < CURRENT_DATE - 3 THEN 'aprobada' ELSE 'pendiente' END,
         v_dia + TIME '19:00');

      -- ===== Incidente ocasional (~10% de los días) =====
      IF RANDOM() < 0.10 THEN
        INSERT INTO incidents
          (log_id, driver_id, type, severity, description, location, created_at_device)
        VALUES
          (v_log_id, v_asig.driver_id,
           (ARRAY['averia','multa','otro'])[1 + (RANDOM() * 2)::INT],
           (ARRAY['leve','moderado'])[1 + (RANDOM())::INT],
           'Evento detectado en jornada de demostración',
           v_origenes[1 + (RANDOM() * (array_length(v_origenes,1)-1))::INT],
           v_dia + TIME '14:00');
      END IF;

      -- ===== Control de gomas (~30%) =====
      IF RANDOM() < 0.30 THEN
        INSERT INTO tire_checks
          (truck_id, log_id, check_date, tire_condition, brake_condition, pressure_psi, notes)
        VALUES
          (v_asig.truck_id, v_log_id, v_dia,
           (ARRAY['bueno','bueno','regular'])[1 + (RANDOM()*2)::INT],
           (ARRAY['bueno','bueno','regular'])[1 + (RANDOM()*2)::INT],
           95 + (RANDOM() * 25)::NUMERIC(5,1),
           NULL);
      END IF;

    END LOOP; -- fin asignaciones del día
  END LOOP;   -- fin días

  -- ===== Actualizar km de los camiones (solo hacia arriba) =====
  UPDATE trucks t
  SET current_km = k.current_km
  FROM tmp_km k
  WHERE t.truck_id = k.truck_id AND k.current_km > COALESCE(t.current_km, 0);

  -- ===== Docs de camiones (VTV + seguro + habilitación), sin duplicar =====
  INSERT INTO truck_docs (truck_id, doc_type, doc_number, issuer, issued_date, expiry_date, alert_days)
  SELECT t.truck_id, d.doc_type, d.pref || t.truck_id || d.suf, d.issuer, d.issued, d.expiry, d.alert
  FROM trucks t
  CROSS JOIN (VALUES
    ('VTV',          'VTV-', '-2025', 'RTO Zona Sur', DATE '2025-01-15', DATE '2027-01-15', 30),
    ('seguro',       'POL-', '-2026', 'La Caja',      DATE '2026-01-01', DATE '2027-01-01', 30),
    ('habilitacion', 'HAB-', '-2025', 'CNRT',         DATE '2025-06-01', DATE '2026-08-01', 45)
  ) AS d(doc_type, pref, suf, issuer, issued, expiry, alert)
  WHERE t.status IN ('active','activo')
    AND NOT EXISTS (
      SELECT 1 FROM truck_docs td
      WHERE td.truck_id = t.truck_id AND td.doc_type = d.doc_type
    );

  -- ===== Mantenimiento reciente por camión, sin duplicar =====
  INSERT INTO maintenance_logs (truck_id, plan_id, performed_at, km_at_service, cost, notes)
  SELECT t.truck_id, sp.plan_id, CURRENT_DATE - 20, GREATEST(t.current_km - 5000, 0),
         45000 + (RANDOM()*30000)::NUMERIC(10,2), 'Servicio programado'
  FROM trucks t
  CROSS JOIN LATERAL (SELECT plan_id FROM service_plans LIMIT 1) sp
  WHERE t.status IN ('active','activo')
    AND NOT EXISTS (
      SELECT 1 FROM maintenance_logs ml
      WHERE ml.truck_id = t.truck_id AND ml.performed_at >= CURRENT_DATE - 30
    );

END $seed$;

COMMIT;

-- Verificación rápida
SELECT 'daily_logs'        AS tabla, COUNT(*) FROM daily_logs
UNION ALL SELECT 'remitos',           COUNT(*) FROM remitos
UNION ALL SELECT 'fuel_records',      COUNT(*) FROM fuel_records
UNION ALL SELECT 'rendicion_cierre',  COUNT(*) FROM rendicion_cierre
UNION ALL SELECT 'incidents',         COUNT(*) FROM incidents
UNION ALL SELECT 'tire_checks',       COUNT(*) FROM tire_checks
UNION ALL SELECT 'truck_docs',        COUNT(*) FROM truck_docs
UNION ALL SELECT 'maintenance_logs',  COUNT(*) FROM maintenance_logs;
