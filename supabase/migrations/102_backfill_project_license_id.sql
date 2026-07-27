-- 102 — Backfill projects.license_id (one-time data fix)
-- Binds existing projects to the correct FSSAI licence so the project credential
-- panel reveals the right password. Idempotent (only touches license_id IS NULL).
-- Ambiguous cases (multi-licence client with no matching app ref, or non-FSSAI
-- single-licence projects) are intentionally LEFT NULL for manual assignment.

-- 1) Precise: project.app_ref_no matches a same-client licence's username or number
update public.projects p
set license_id = l.id
from public.licenses l
where p.license_id is null
  and p.app_ref_no is not null
  and l.client_id = p.client_id
  and (l.credential_username = p.app_ref_no or l.license_number = p.app_ref_no);

-- 2) Fallback: FSSAI-filing project whose client has exactly ONE licence
update public.projects p
set license_id = (select l.id from public.licenses l where l.client_id = p.client_id)
where p.license_id is null
  and p.service_type in ('New Application','Renewal','Modification','Form II')
  and (select count(*) from public.licenses l where l.client_id = p.client_id) = 1;

-- Report what remains unlinked (for manual assignment)
-- select p.project_code, p.service_type, p.app_ref_no,
--   (select count(*) from public.licenses l where l.client_id=p.client_id) as client_licences
-- from public.projects p where p.license_id is null
--   and p.service_type in ('New Application','Renewal','Modification','Form II')
-- order by client_licences desc, p.created_at;
