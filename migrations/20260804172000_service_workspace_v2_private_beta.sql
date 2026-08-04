-- AuxiliOS · Workspace de servicio full screen · Beta privada

insert into public.user_feature_flags (
  user_id,
  feature_key,
  enabled,
  rollout_notes,
  created_by
)
select
  u.user_id,
  'service_workspace_v2',
  true,
  'Beta privada: alta de servicios full screen en tres columnas',
  u.user_id
from public.users u
where lower(u.email) = 'admin@sigmaremolques.com'
  and u.is_active = true
on conflict (user_id, feature_key)
do update set
  enabled = excluded.enabled,
  rollout_notes = excluded.rollout_notes,
  updated_at = now();
