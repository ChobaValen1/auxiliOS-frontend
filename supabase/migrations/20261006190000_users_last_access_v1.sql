-- Último acceso de cada usuario para la pantalla Personal (solo administración y supervisión).
create or replace function public.get_users_last_access_v1()
returns table(user_id uuid, last_sign_in_at timestamptz)
language plpgsql security definer set search_path to '' as $function$
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion','supervision') then
    raise exception 'Sin permiso';
  end if;
  return query select u.user_id, a.last_sign_in_at from public.users u left join auth.users a on a.id = u.user_id;
end $function$;
revoke all on function public.get_users_last_access_v1() from public, anon;
grant execute on function public.get_users_last_access_v1() to authenticated;
