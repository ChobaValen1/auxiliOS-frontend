BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_self ON public.users;
DROP POLICY IF EXISTS users_select_management ON public.users;
DROP POLICY IF EXISTS users_admin_update ON public.users;

-- Every signed-in person can load the profile associated with their Auth UID.
CREATE POLICY users_select_self
ON public.users
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Management screens need the complete personnel directory.
CREATE POLICY users_select_management
ON public.users
FOR SELECT
TO authenticated
USING ((SELECT public.current_auxilios_role()) IN ('administracion', 'supervision'));

-- Only administration may alter personnel records from the browser.
CREATE POLICY users_admin_update
ON public.users
FOR UPDATE
TO authenticated
USING ((SELECT public.current_auxilios_role()) = 'administracion')
WITH CHECK ((SELECT public.current_auxilios_role()) = 'administracion');

-- Anonymous clients have no access to personnel data.
REVOKE ALL ON TABLE public.users FROM anon;

-- Signed-in clients cannot create or delete personnel records. User creation and
-- credential management remain restricted to the backend service-role client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.users FROM authenticated;

GRANT SELECT ON TABLE public.users TO authenticated;

-- Preserve the existing administration UI while preventing browser-side edits
-- to email, password_hash, legajo, user_id, and other identity-critical fields.
GRANT UPDATE (
  full_name,
  phone,
  role_id,
  dni,
  license_number,
  license_expiry,
  is_active
) ON public.users TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.users TO service_role;

COMMIT;
