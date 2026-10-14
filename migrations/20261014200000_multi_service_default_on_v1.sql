-- Varios servicios a la vez · regla por defecto (14/10/2026).
-- La cola de servicios queda encendida para todos los choferes, también los nuevos.
-- Para apagarla a un chofer puntual se guarda una fila con enabled=false en
-- user_feature_flags (feature_key='multi_service_v1').
create or replace function app_private.multi_service_enabled_v1(p_driver uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p_driver is not null and not exists(
    select 1 from public.user_feature_flags f
    where f.user_id = p_driver and f.feature_key = 'multi_service_v1' and not f.enabled
  );
$function$;
