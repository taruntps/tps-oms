-- 129 — Make the two role-only core nav entries (Clients, Tasks) per-employee
-- controllable, by giving each a dedicated nav-visibility permission and granting it to
-- EXACTLY the roles that see them today. New perms with no prior dependency → zero
-- regression. Nav entries reference these keys (coreNav.ts), so the override engine can
-- now hide Clients / Tasks for a specific employee.

insert into public.permissions (perm_key, module, label, is_system) values
  ('core.clients.view', 'core', 'Clients', false),
  ('core.tasks.view',   'core', 'Tasks',   false)
on conflict do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r, 'core.clients.view', 'all'
from unnest(array['super_admin','director','manager','executive','accounts','auditor']) r
on conflict do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r, 'core.tasks.view', 'all'
from unnest(array['super_admin','director','manager','executive','accounts','hr','auditor']) r
on conflict do nothing;
