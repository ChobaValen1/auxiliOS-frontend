-- Limitar helpers de sincronización a ejecución interna.
revoke all on function app_private.sync_rendicion_jornada(integer, boolean, text) from public;
revoke all on function app_private.sync_rendicion_jornada(integer, boolean, text) from anon, authenticated;
grant execute on function app_private.sync_rendicion_jornada(integer, boolean, text) to service_role;

revoke all on function public.tg_remitos_sync_rendicion() from public;
revoke all on function public.tg_fuel_sync_rendicion() from public;
