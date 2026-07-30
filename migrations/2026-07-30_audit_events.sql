-- 2026-07-30 · Auditoría inmutable de operaciones críticas
-- Objetivo: trazabilidad técnica para ISO/IEC 27001 e ISO 9001.
-- Esta migración no reemplaza las políticas RLS de cada tabla de negocio.

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_events (
  event_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id       UUID        REFERENCES public.users(user_id) ON DELETE SET NULL,
  operation      TEXT        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  entity_schema  TEXT        NOT NULL,
  entity_table   TEXT        NOT NULL,
  entity_id      TEXT,
  before_data    JSONB,
  after_data     JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_table, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON public.audit_events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON public.audit_events (occurred_at DESC);

COMMENT ON TABLE public.audit_events IS
  'Registro append-only de cambios críticos. No admite UPDATE ni DELETE por roles de aplicación.';

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.current_auxilios_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.name
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE u.user_id = auth.uid()
    AND COALESCE(u.is_active, TRUE) = TRUE
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_auxilios_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_auxilios_role() TO authenticated;

DROP POLICY IF EXISTS audit_events_admin_read ON public.audit_events;
CREATE POLICY audit_events_admin_read
ON public.audit_events
FOR SELECT
TO authenticated
USING (public.current_auxilios_role() IN ('administracion', 'supervision'));

CREATE OR REPLACE FUNCTION public.capture_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before JSONB;
  v_after  JSONB;
  v_id     TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
  ELSE
    v_before := to_jsonb(OLD);
  END IF;

  v_id := COALESCE(
    v_after ->> TG_ARGV[0],
    v_before ->> TG_ARGV[0]
  );

  INSERT INTO public.audit_events (
    actor_id, operation, entity_schema, entity_table, entity_id, before_data, after_data
  ) VALUES (
    auth.uid(), TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME, v_id, v_before, v_after
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_audit_event() FROM PUBLIC;

-- Crea triggers únicamente para tablas presentes en el ambiente. Esto permite
-- aplicar la migración tanto sobre la base actual como sobre ambientes nuevos.
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('users',                  'user_id'),
      ('trucks',                 'truck_id'),
      ('daily_logs',             'log_id'),
      ('remitos',                'remito_id'),
      ('fuel_records',           'fuel_id'),
      ('incidents',              'incident_id'),
      ('rendicion_cierre',       'rendicion_id'),
      ('payroll_settings',       'user_id'),
      ('payroll_liquidaciones',  'liquidacion_id'),
      ('maintenance_logs',       'maintenance_id'),
      ('tire_checks',            'check_id'),
      ('truck_docs',             'doc_id'),
      ('driver_docs',            'driver_doc_id'),
      ('asignaciones_grilla',    'asignacion_id'),
      ('alertas_operativas',     'alerta_id'),
      ('emergencias_config',     'config_id')
    ) AS targets(table_name, id_column)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%I_changes ON public.%I', item.table_name, item.table_name);
      EXECUTE format(
        'CREATE TRIGGER audit_%I_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.capture_audit_event(%L)',
        item.table_name,
        item.table_name,
        item.id_column
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
