-- Migration 098 — HRMS M9: Employee Self-Service hub. EXPAND only (additive).
-- Single consolidated ESS landing; one broad self-view permission granted to every role.
insert into public.permissions (perm_key, module, label) values
  ('hrms.ess.view','hrms','View the Employee Self-Service hub')
on conflict (perm_key) do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, 'hrms.ess.view', 'all'
from (values ('super_admin'),('director'),('manager'),('hr'),('auditor'),('executive'),('accounts')) r(role_key)
on conflict do nothing;
