-- AuxiliOS · Consola operativa V2 · Beta individual

create table if not exists public.user_feature_flags (
  user_id uuid not null references public.users(user_id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  rollout_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(user_id) on delete set null,
  primary key (user_id, feature_key),
  constraint user_feature_flags_key_check
    check (feature_key ~ '^[a-z][a-z0-9_]{2,63}$')
);

create index if not exists user_feature_flags_created_by_idx
  on public.user_feature_flags(created_by)
  where created_by is not null;

alter table public.user_feature_flags enable row level security;

drop policy if exists user_feature_flags_select_own
  on public.user_feature_flags;
create policy user_feature_flags_select_own
  on public.user_feature_flags
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_feature_flags from public, anon, authenticated;
grant select on table public.user_feature_flags to authenticated;

create table if not exists public.user_view_preferences (
  user_id uuid not null references public.users(user_id) on delete cascade,
  view_key text not null,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, view_key),
  constraint user_view_preferences_key_check
    check (view_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint user_view_preferences_object_check
    check (jsonb_typeof(preferences) = 'object')
);

alter table public.user_view_preferences enable row level security;

drop policy if exists user_view_preferences_select_own
  on public.user_view_preferences;
create policy user_view_preferences_select_own
  on public.user_view_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_view_preferences_insert_own
  on public.user_view_preferences;
create policy user_view_preferences_insert_own
  on public.user_view_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_view_preferences_update_own
  on public.user_view_preferences;
create policy user_view_preferences_update_own
  on public.user_view_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_view_preferences_delete_own
  on public.user_view_preferences;
create policy user_view_preferences_delete_own
  on public.user_view_preferences
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_view_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.user_view_preferences to authenticated;

-- Activación inicial: solo la cuenta administrativa principal.
insert into public.user_feature_flags (
  user_id,
  feature_key,
  enabled,
  rollout_notes,
  created_by
)
select
  u.user_id,
  'operator_console_v2',
  true,
  'Beta privada de la consola operativa escalable',
  u.user_id
from public.users u
where lower(u.email) = 'admin@sigmaremolques.com'
  and u.is_active = true
on conflict (user_id, feature_key)
do update set
  enabled = excluded.enabled,
  rollout_notes = excluded.rollout_notes,
  updated_at = now();
