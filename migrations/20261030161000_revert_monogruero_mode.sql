-- Solo reemplaza al «modo oficina / modo chofer»: el rol vuelve a ser el guardado en users (solo base de Solo).
create or replace function app_private.current_auxilios_role() returns text language sql stable security definer set search_path to 'public','pg_temp' as $f$
  SELECT r.name
  FROM public.users u
  JOIN public.roles r ON r.role_id = u.role_id
  WHERE u.user_id = auth.uid()
    AND COALESCE(u.is_active, TRUE) = TRUE
  LIMIT 1
$f$;
drop function if exists public.get_monogruero_profile_v1();
drop function if exists app_private.install_edition();
delete from public.user_feature_flags where feature_key='monogruero_owner';
