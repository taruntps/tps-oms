-- PR3 Stage 1 — Critical security hotfix (smallest change; function bodies untouched).
-- Remove EXECUTE from anon + authenticated on two SECURITY DEFINER functions that
-- return secrets/biometrics with no caller guard. NOTE: superseded by 101 — the
-- functions also had a PUBLIC grant, so anon/authenticated still inherited EXECUTE
-- until 101 revoked PUBLIC. Kept for history / staging parity.
revoke execute on function public.get_google_sa_json() from anon, authenticated;
revoke execute on function public.get_employee_face_by_email(text) from anon, authenticated;
