-- Actividad real de los usuarios.
-- "Último acceso" salía de auth.users.last_sign_in_at, que sólo cambia al escribir
-- la contraseña: un chofer que no cierra sesión figuraba "hace 19 d" aunque usara
-- la app ese día. La app ahora avisa cada 2 minutos mientras está a la vista y
-- Administración ve la última actividad y quién está en línea.
-- Aditivo: una tabla nueva (sin acceso directo, sólo por las funciones) y dos RPC.

create table if not exists public.user_presence (
  user_id uuid primary key references public.users(user_id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  screen text,
  app_build text,
  device text check (device in ('movil','escritorio'))
);
alter table public.user_presence enable row level security;
revoke all on public.user_presence from public, anon, authenticated;

create or replace function public.touch_user_presence_v1(p_screen text default null, p_app_build text default null, p_device text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not exists (select 1 from public.users u where u.user_id = auth.uid() and coalesce(u.is_active, true)) then
    return;
  end if;
  insert into public.user_presence as p (user_id, last_seen_at, screen, app_build, device)
  values (auth.uid(), now(), left(nullif(trim(p_screen), ''), 40), left(nullif(trim(p_app_build), ''), 60),
          case when p_device in ('movil','escritorio') then p_device end)
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at,
        screen = coalesce(excluded.screen, p.screen),
        app_build = coalesce(excluded.app_build, p.app_build),
        device = coalesce(excluded.device, p.device);
end $function$;

revoke all on function public.touch_user_presence_v1(text, text, text) from public, anon;
grant execute on function public.touch_user_presence_v1(text, text, text) to authenticated;

-- Última actividad = lo más reciente entre el aviso de la app, la renovación de la
-- sesión y el último ingreso con contraseña. "En línea" = aviso de los últimos 3 minutos.
create or replace function public.get_users_last_access_v2()
returns table(user_id uuid, last_sign_in_at timestamptz, last_seen_at timestamptz, online boolean, screen text, device text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(app_private.current_auxilios_role(), '') not in ('administracion','supervision') then
    raise exception 'Sin permiso';
  end if;
  return query
  select u.user_id,
         a.last_sign_in_at,
         nullif(greatest(coalesce(p.last_seen_at, '-infinity'), coalesce(s.refreshed_at, '-infinity'), coalesce(a.last_sign_in_at, '-infinity')), '-infinity'::timestamptz),
         coalesce(p.last_seen_at > now() - interval '3 minutes', false),
         p.screen,
         p.device
  from public.users u
  left join auth.users a on a.id = u.user_id
  left join public.user_presence p on p.user_id = u.user_id
  left join lateral (
    select max(coalesce(x.updated_at, x.created_at)) as refreshed_at
    from auth.sessions x where x.user_id = u.user_id
  ) s on true;
end $function$;

revoke all on function public.get_users_last_access_v2() from public, anon;
grant execute on function public.get_users_last_access_v2() to authenticated;
