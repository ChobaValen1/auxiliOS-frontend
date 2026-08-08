revoke execute on function public.get_daily_log_admin_impact(integer) from anon;
revoke execute on function public.get_daily_log_admin_history(integer) from anon;
revoke execute on function public.list_voided_daily_logs_admin(integer) from anon;
revoke execute on function public.restore_daily_log_admin(integer,text) from anon;

-- Trigger functions are internal implementation details and do not need direct API execution.
revoke execute on function public.tg_fuel_sync_rendicion() from anon, authenticated;
revoke execute on function public.tg_remitos_sync_rendicion() from anon, authenticated;
