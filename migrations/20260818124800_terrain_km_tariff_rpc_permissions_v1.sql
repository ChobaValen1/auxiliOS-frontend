-- AuxiliOS · Tarifas por terreno · endurecimiento de RPC
-- Los RPC de Tarifas son SECURITY DEFINER y validan el rol internamente.
-- No deben ser invocables por sesiones anónimas.

REVOKE ALL ON FUNCTION public.save_company_service_price_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_company_service_price_schedule_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bulk_save_company_service_prices_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_company_service_price_schedule_v1(uuid,uuid,date,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_company_service_price_exception_v1(uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_company_service_prices_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_company_service_price_schedule_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_company_service_price_history_v1(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_company_service_price_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_service_price_schedule_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_save_company_service_prices_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_company_service_price_schedule_v1(uuid,uuid,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_service_price_exception_v1(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_service_prices_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_service_price_schedule_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_service_price_history_v1(uuid,uuid) TO authenticated;
