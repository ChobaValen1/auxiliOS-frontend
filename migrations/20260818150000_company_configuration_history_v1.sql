-- AuxiliOS · Historial de configuración de Prestadoras v1
-- Completa la auditoría de la ficha y contactos y expone un historial por company_id.

BEGIN;

-- La auditoría genérica ya existe. Faltaban la ficha de la prestadora y sus contactos.
DROP TRIGGER IF EXISTS companies_audit ON public.companies;
CREATE TRIGGER companies_audit
AFTER INSERT OR UPDATE OR DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.capture_audit_event('company_id');

DROP TRIGGER IF EXISTS company_contacts_audit ON public.company_contacts;
CREATE TRIGGER company_contacts_audit
AFTER INSERT OR UPDATE OR DELETE ON public.company_contacts
FOR EACH ROW EXECUTE FUNCTION public.capture_audit_event('contact_id');

-- El trigger existente de servicios no informaba la PK a capture_audit_event,
-- por lo que entity_id quedaba NULL. Se corrige sin perder before_data/after_data.
DROP TRIGGER IF EXISTS company_service_settings_audit ON public.company_service_settings;
CREATE TRIGGER company_service_settings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.company_service_settings
FOR EACH ROW EXECUTE FUNCTION public.capture_audit_event('company_service_setting_id');

CREATE OR REPLACE FUNCTION public.get_company_configuration_history_v1(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('administracion','facturacion','supervision') THEN
    RAISE EXCEPTION 'Sin permiso para consultar el historial de la prestadora';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.company_id = p_company_id) THEN
    RAISE EXCEPTION 'Prestadora inexistente';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.event_id,
      a.occurred_at,
      a.actor_id,
      u.full_name AS actor_name,
      a.operation,
      a.entity_table,
      a.entity_id,
      a.before_data,
      a.after_data,
      CASE a.entity_table
        WHEN 'companies' THEN COALESCE(a.after_data->>'trade_name', a.after_data->>'legal_name', a.before_data->>'trade_name', a.before_data->>'legal_name', 'Prestadora')
        WHEN 'company_contacts' THEN COALESCE(a.after_data->>'full_name', a.before_data->>'full_name', 'Contacto')
        WHEN 'company_billing_settings' THEN 'Parámetros de facturación'
        WHEN 'company_billing_base_links' THEN COALESCE((
          SELECT b.name FROM public.billing_bases b
          WHERE b.base_id = NULLIF(COALESCE(a.after_data->>'base_id', a.before_data->>'base_id'), '')::uuid
        ), 'Base habilitada')
        WHEN 'company_service_settings' THEN COALESCE((
          SELECT sc.name FROM public.service_concepts sc
          WHERE sc.concept_id = NULLIF(COALESCE(a.after_data->>'concept_id', a.before_data->>'concept_id'), '')::uuid
        ), 'Servicio habilitado')
        WHEN 'company_rate_rules' THEN CASE COALESCE(a.after_data->>'rule_type', a.before_data->>'rule_type')
          WHEN 'night' THEN 'Recargo nocturno'
          WHEN 'weekend_holiday' THEN 'Recargo fin de semana / feriado'
          ELSE 'Regla de facturación'
        END
        WHEN 'company_rate_rule_exceptions' THEN COALESCE((
          SELECT 'Excepción · ' || sc.name FROM public.service_concepts sc
          WHERE sc.concept_id = NULLIF(COALESCE(a.after_data->>'concept_id', a.before_data->>'concept_id'), '')::uuid
        ), 'Excepción de recargo')
        ELSE replace(a.entity_table, '_', ' ')
      END AS subject_label
    FROM public.audit_events a
    LEFT JOIN public.users u ON u.user_id = a.actor_id
    WHERE a.entity_table IN (
      'companies',
      'company_contacts',
      'company_billing_settings',
      'company_billing_base_links',
      'company_service_settings',
      'company_rate_rules',
      'company_rate_rule_exceptions'
    )
    AND (
      (a.entity_table = 'companies' AND (
        a.entity_id = p_company_id::text
        OR COALESCE(a.after_data->>'company_id', a.before_data->>'company_id') = p_company_id::text
      ))
      OR (a.entity_table IN ('company_contacts','company_billing_settings','company_service_settings')
        AND COALESCE(a.after_data->>'company_id', a.before_data->>'company_id') = p_company_id::text)
      OR (a.entity_table = 'company_billing_base_links' AND EXISTS (
        SELECT 1
        FROM public.company_billing_settings s
        WHERE s.billing_setting_id = NULLIF(COALESCE(a.after_data->>'billing_setting_id', a.before_data->>'billing_setting_id'), '')::uuid
          AND s.company_id = p_company_id
      ))
      OR (a.entity_table IN ('company_rate_rules','company_rate_rule_exceptions') AND EXISTS (
        SELECT 1
        FROM public.company_rate_cards rc
        JOIN public.company_contracts cc ON cc.contract_id = rc.contract_id
        WHERE rc.rate_card_id = NULLIF(COALESCE(a.after_data->>'rate_card_id', a.before_data->>'rate_card_id'), '')::uuid
          AND cc.company_id = p_company_id
      ))
    )
    ORDER BY a.occurred_at DESC
    LIMIT 150
  ) x;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_configuration_history_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_configuration_history_v1(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_company_configuration_history_v1(uuid) IS
  'Historial centralizado de cambios de configuración de una prestadora: ficha, contactos, parámetros, bases, servicios y recargos.';

COMMIT;
