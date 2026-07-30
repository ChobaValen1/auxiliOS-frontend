-- ================================================================
-- FIX PABLO MISKO — vincular el chofer "Pablo" con su login real
--
-- ANTES DE EJECUTAR (una sola vez, en el Dashboard de Supabase):
--   Authentication → Users → Add user →
--   crear el usuario indicado con una contraseña definida fuera del repositorio
--   y confirmar el email según el procedimiento operativo vigente.
--
-- Este script después:
--   1. Encuentra el auth user por email (auth.users)
--   2. Crea la fila definitiva en public.users con ESE uuid y nombre "Pablo Misko"
--   3. Repunta grilla, jornadas, remitos, rendiciones e incidentes
--   4. Borra la fila provisoria creada por la migración de la grilla
-- Idempotente: si ya está migrado, no hace nada.
-- ================================================================

BEGIN;

DO $$
DECLARE
  v_new UUID;  -- id del auth user (login real)
  v_old UUID;  -- id provisorio creado por la migración de la grilla
BEGIN
  SELECT id INTO v_new FROM auth.users WHERE email = 'pablo@sigmaremolques.com';
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Primero creá el usuario requerido en Supabase Authentication';
  END IF;

  SELECT user_id INTO v_old
  FROM public.users
  WHERE email = 'pablo@sigmaremolques.com' AND user_id <> v_new;

  IF v_old IS NULL THEN
    -- Ya migrado o nunca existió el provisorio: solo asegurar nombre
    UPDATE public.users SET full_name = 'Pablo Misko' WHERE user_id = v_new;
    RAISE NOTICE 'Sin fila provisoria que migrar. Nombre actualizado si correspondía.';
    RETURN;
  END IF;

  -- Liberar email/legajo del provisorio y crear la fila definitiva
  UPDATE public.users
  SET email = 'pablo.old@migrar.local', legajo = legajo || '-OLD'
  WHERE user_id = v_old;

  INSERT INTO public.users (user_id, role_id, legajo, email, password_hash, full_name, phone, dni, is_active)
  SELECT v_new, role_id, replace(legajo, '-OLD', ''), 'pablo@sigmaremolques.com',
         password_hash, 'Pablo Misko', phone, dni, TRUE
  FROM public.users WHERE user_id = v_old
  ON CONFLICT (user_id) DO UPDATE SET full_name = 'Pablo Misko', is_active = TRUE;

  -- Repuntar todas las referencias del provisorio al definitivo
  UPDATE asignaciones_grilla SET driver_id = v_new WHERE driver_id = v_old;
  UPDATE daily_logs          SET driver_id = v_new WHERE driver_id = v_old;
  UPDATE remitos             SET driver_id = v_new WHERE driver_id = v_old;
  UPDATE rendicion_cierre    SET driver_id = v_new WHERE driver_id = v_old;
  UPDATE incidents           SET driver_id = v_new WHERE driver_id = v_old;

  DELETE FROM public.users WHERE user_id = v_old;

  RAISE NOTICE 'Pablo Misko migrado: % → %', v_old, v_new;
END $$;

COMMIT;

-- Verificación:
-- SELECT user_id, full_name, email, legajo FROM users WHERE email LIKE 'pablo%';
-- SELECT COUNT(*) FROM asignaciones_grilla g JOIN users u ON u.user_id = g.driver_id WHERE u.full_name = 'Pablo Misko';
