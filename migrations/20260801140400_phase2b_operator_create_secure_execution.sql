alter function public.create_operator_service(jsonb) security definer;
alter function public.create_operator_service(jsonb) set search_path = public, app_private, pg_temp;
revoke all on function public.create_operator_service(jsonb) from public, anon;
grant execute on function public.create_operator_service(jsonb) to authenticated;
