-- PR3 Stage 1 (corrected) — the effective critical hotfix.
-- get_google_sa_json() (returns the decrypted Google service-account secret from Vault)
-- and get_employee_face_by_email() (returns biometric face descriptors) were
-- SECURITY DEFINER and EXECUTE-able by PUBLIC (hence anon + authenticated) with no
-- caller guard — reachable with the public anon key. Revoke from PUBLIC and grant
-- EXECUTE only to service_role (drive-ops / face-login edge functions use the
-- service-role key). Function bodies untouched. Fully reversible.
--
-- Evidence: client (src/) never calls either RPC; get_google_sa_json is called only
-- by the drive-ops edge fn via SUPABASE_SERVICE_ROLE_KEY; get_employee_face_by_email
-- has no caller in the repo. Verified post-apply: anon/authenticated EXECUTE = false,
-- service_role EXECUTE = true.
--
-- ROLLBACK (restores original PUBLIC grant):
--   grant execute on function public.get_google_sa_json() to public;
--   grant execute on function public.get_employee_face_by_email(text) to public;

revoke execute on function public.get_google_sa_json() from public, anon, authenticated;
revoke execute on function public.get_employee_face_by_email(text) from public, anon, authenticated;

grant execute on function public.get_google_sa_json() to service_role;
grant execute on function public.get_employee_face_by_email(text) to service_role;
