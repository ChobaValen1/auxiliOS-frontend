-- AuxiliOS · Beta privada de edición de servicios y peajes

insert into public.user_feature_flags (
  user_id,
  feature_key,
  enabled,
  rollout_notes,
  created_by
)
select
  u.user_id,
  'service_editing_tolls_v1',
  true,
  'Beta privada: edición auditada de servicios abiertos y módulo de peajes',
  u.user_id
from public.users u
where lower(u.email) = 'admin@sigmaremolques.com'
  and u.is_active = true
on conflict (user_id, feature_key)
do update set
  enabled = excluded.enabled,
  rollout_notes = excluded.rollout_notes,
  updated_at = now();
