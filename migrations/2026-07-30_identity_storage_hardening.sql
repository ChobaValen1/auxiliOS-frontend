-- AuxiliOS security hardening - phase 1
-- Applied to Supabase production on 2026-07-30.
-- Scope: remove anonymous access to identity data, retire the legacy user-creation RPC,
-- restrict role catalogs to authenticated read-only access, and require authentication
-- for docs/odometer object access policies. Buckets intentionally remain public in this
-- phase so existing public object URLs continue to work.

begin;

-- The application uses Supabase Auth sessions. This legacy public table is empty and
-- must not be reachable from the Data API.
alter table public.sessions enable row level security;
revoke all privileges on table public.sessions from anon, authenticated;
grant all privileges on table public.sessions to service_role;

-- Prevent unauthenticated access to user profiles. Authenticated DML is retained for
-- compatibility until the user-management screens are migrated fully to backend APIs.
revoke all privileges on table public.users from anon;
revoke truncate, references, trigger on table public.users from authenticated;

-- Identity catalogs are read-only for signed-in users and inaccessible to anonymous clients.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

revoke all privileges on table public.roles, public.permissions, public.role_permissions from anon;
revoke all privileges on table public.roles, public.permissions, public.role_permissions from authenticated;
grant select on table public.roles, public.permissions, public.role_permissions to authenticated;
grant all privileges on table public.roles, public.permissions, public.role_permissions to service_role;

drop policy if exists identity_roles_read_authenticated on public.roles;
create policy identity_roles_read_authenticated
  on public.roles for select to authenticated using (true);

drop policy if exists identity_permissions_read_authenticated on public.permissions;
create policy identity_permissions_read_authenticated
  on public.permissions for select to authenticated using (true);

drop policy if exists identity_role_permissions_read_authenticated on public.role_permissions;
create policy identity_role_permissions_read_authenticated
  on public.role_permissions for select to authenticated using (true);

-- Retire the legacy RPC that inserted users with a shared default password.
alter function public.crear_usuario_admin(text,text,text,text,text)
  set search_path = public, pg_temp;
revoke execute on function public.crear_usuario_admin(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.crear_usuario_admin(text,text,text,text,text)
  to service_role;

-- Keep operational calculation RPCs available to signed-in users, never anonymous users.
alter function public.calcular_efectivo_dia(uuid,date)
  set search_path = public, pg_temp;
alter function public.calcular_gastos_dia(uuid,date)
  set search_path = public, pg_temp;
revoke execute on function public.calcular_efectivo_dia(uuid,date) from public, anon;
revoke execute on function public.calcular_gastos_dia(uuid,date) from public, anon;
grant execute on function public.calcular_efectivo_dia(uuid,date) to authenticated, service_role;
grant execute on function public.calcular_gastos_dia(uuid,date) to authenticated, service_role;

-- Trigger functions must not be exposed as public RPCs.
revoke execute on function public.tg_daily_logs_alerta_km_manual() from public, anon, authenticated;
revoke execute on function public.tg_remitos_sync_rendicion() from public, anon, authenticated;
revoke execute on function public.tg_rendicion_sync_alerta() from public, anon, authenticated;
revoke execute on function public.fn_actualizar_km_camion() from public, anon, authenticated;
revoke execute on function public.fn_bloquear_periodo_cerrado() from public, anon, authenticated;
grant execute on function public.tg_daily_logs_alerta_km_manual() to service_role;
grant execute on function public.tg_remitos_sync_rendicion() to service_role;
grant execute on function public.tg_rendicion_sync_alerta() to service_role;
grant execute on function public.fn_actualizar_km_camion() to service_role;
grant execute on function public.fn_bloquear_periodo_cerrado() to service_role;

-- Stop anonymous listing/upload through Storage policies. Public bucket URLs remain
-- compatible in this phase; private buckets and signed URLs are a later migration.
drop policy if exists "Permitir lectura publica de docs" on storage.objects;
drop policy if exists "Permitir lectura publica de odometros" on storage.objects;
drop policy if exists "Permitir subida de fotos de odometros" on storage.objects;
drop policy if exists "Lectura docs autenticados" on storage.objects;
drop policy if exists "Lectura odometros autenticados" on storage.objects;
drop policy if exists "Subida odometros autenticados" on storage.objects;

create policy "Lectura docs autenticados"
  on storage.objects for select to authenticated
  using (bucket_id = 'docs');

create policy "Lectura odometros autenticados"
  on storage.objects for select to authenticated
  using (bucket_id = 'odometros');

create policy "Subida odometros autenticados"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'odometros');

commit;
