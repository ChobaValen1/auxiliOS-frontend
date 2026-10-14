-- Anular un servicio desde Facturación daba 400: annul_operator_billing_service_v2
-- guarda cancellation_reason_code='billing_admin', que no estaba en la lista permitida.
alter table public.operator_services drop constraint operator_services_cancellation_reason_code_check;
alter table public.operator_services add constraint operator_services_cancellation_reason_code_check check (cancellation_reason_code is null or cancellation_reason_code = any (array['absent_or_not_towable','provider','us','other','delay','within_authorized_window','cancelled_by_us','client_or_provider','billing_admin']));
