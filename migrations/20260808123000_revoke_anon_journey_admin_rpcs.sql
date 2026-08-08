-- Supabase advisor hardening: admin-only Jornada RPCs must never be callable by anon.
revoke execute on function public.update_daily_log_admin(integer,jsonb,text) from anon;
revoke execute on function public.void_daily_log_admin(integer,text) from anon;
