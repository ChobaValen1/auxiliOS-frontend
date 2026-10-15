-- Limpieza de funciones viejas · paso 1 de 2: copia de seguridad (15/10/2026)
-- Guarda la definición completa y los permisos de las 67 funciones públicas
-- que ya no usa nadie (ni la app, ni las funciones del servidor, ni otras funciones
-- de la base, y sin llamadas en los últimos 7 días). No borra nada.
create table if not exists app_private.function_backup_20261015 (
  signature text primary key,
  definition text not null,
  grants text not null,
  saved_at timestamptz not null default now()
);
revoke all on app_private.function_backup_20261015 from public, anon, authenticated;

insert into app_private.function_backup_20261015(signature, definition, grants)
select p.oid::regprocedure::text,
       pg_get_functiondef(p.oid),
       coalesce((
         select string_agg(format('grant execute on function %s to %s;', p.oid::regprocedure,
                  case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end), E'\n')
         from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE'), '')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = any(array['adjust_operator_service_item_v3','advance_operator_service','bulk_save_company_tariff_rates_v3','calcular_efectivo_dia','calcular_gastos_dia','calculate_operator_service_quote','cancel_operator_service','close_operator_service_exception','crear_usuario_admin','create_operator_invoice_v2','create_operator_service','dashboard_zonas_v1','delete_company_tariff_exception_v4','ensure_company_tariff_draft_v4','get_active_driver_for_truck','get_company_service_price_history_v2','get_company_tariff_history_v4','get_company_tariff_matrix_v3','get_company_tariff_rate_history_v3','get_company_tariffs_v4','get_driver_operator_history_v2','get_driver_operator_queue','get_driver_remito_capabilities_v1','get_driver_remito_reference_v1','get_fuel_record_history','get_operator_billing_base_catalog','get_operator_category_tariff_v3','get_operator_service_catalog','get_operator_service_detail','get_operator_service_item_adjustments_v3','get_operator_service_review_draft_v1','get_operator_service_trace','leave_operator_service_review_pending_v1','link_operator_service_remito','list_billing_bases','list_company_tariff_matrix_v2','list_driver_service_intakes_v1','list_fuel_records_for_truck','list_operator_billing_services_v2','list_operator_billing_tolls_v1','list_operator_service_document_connections_v1','list_service_categories_v3','list_tariff_concepts_v3','mark_driver_operator_service_activated_v1','mark_driver_operator_service_activated_v2','publish_company_tariff_draft_v4','reassign_operator_service','resolve_operator_service_document_v2','resolve_operator_service_document_v3','resolve_operator_service_document_v4','review_operator_service_closure','save_billing_base','save_company_category_setting_v3','save_company_concept_setting_v3','save_company_service_price_version_v2','save_company_tariff_item_v4','save_company_tariff_rate_v3','save_service_category_v3','save_tariff_concept_v3','save_toll_location','save_toll_rate','set_billing_base_status','transition_operator_service_from_desk','update_operator_billing_service_v1','update_operator_service_assignment','void_operator_service_from_desk','void_service_payment_v1'])
on conflict (signature) do nothing;

do $$ begin
  if (select count(*) from app_private.function_backup_20261015) <> 67 then
    raise exception 'La copia no tiene las 67 funciones';
  end if;
end $$;
