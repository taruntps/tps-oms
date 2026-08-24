-- 131 — Make every remaining nav page + each Reports tab per-employee controllable.
-- Same zero-regression recipe as migrations 129/130: new permission keys granted to
-- EXACTLY the roles that see the page/tab today, so nobody's default access changes;
-- the override engine can then Hide/View them per employee. No RLS here (nav-visibility
-- only). Legacy per-user report_permissions holders are migrated to grant-overrides so
-- their access is preserved under the new model.

-- ── Role-only nav pages → dedicated view perms ────────────────────────────────
insert into public.permissions (perm_key, module, label, is_system) values
  ('core.projects.view',            'core',      'Projects',            false),
  ('core.operations.view',          'core',      'Operations',          false),
  ('core.whatsapp.campaigns.view',  'core',      'WhatsApp Campaigns',  false),
  ('core.whatsapp.inbox.view',      'core',      'WhatsApp Inbox',      false),
  ('knowledge.kb.view',             'knowledge', 'Knowledge Base',      false),
  ('knowledge.browse.view',         'knowledge', 'Browse',              false),
  ('admin.settings.view',           'admin',     'Settings',            false),
  -- Reports section + one perm per tab
  ('reports.view',                  'reports',   'Reports',             false),
  ('reports.performance.view',      'reports',   'Performance',         false),
  ('reports.pending_payments.view', 'reports',   'Pending Payments',    false),
  ('reports.queries.view',          'reports',   'Queries Report',      false),
  ('reports.referrals.view',        'reports',   'Referrals',           false),
  ('reports.govt_fees.view',        'reports',   'Govt Fees',           false),
  ('reports.project_timeline.view', 'reports',   'Project Timeline',    false),
  ('reports.stage_perf.view',       'reports',   'Stage Performance',   false),
  ('reports.employee_timeline.view','reports',   'Employee Timeline',   false)
on conflict do nothing;

-- ── Grants: exactly today's audiences ─────────────────────────────────────────
insert into public.role_permissions (role_key, perm_key, scope)
select r, 'core.projects.view', 'all'
from unnest(array['super_admin','director','manager','executive']) r on conflict do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r, 'core.operations.view', 'all'
from unnest(array['super_admin','director','manager','executive','accounts','hr','auditor']) r on conflict do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r, p, 'all'
from unnest(array['super_admin','director','hr']) r,
     unnest(array['core.whatsapp.campaigns.view','core.whatsapp.inbox.view']) p on conflict do nothing;

-- Knowledge Base + Browse are visible to everyone today (no roles gate) → grant to all.
insert into public.role_permissions (role_key, perm_key, scope)
select r, p, 'all'
from unnest(array['super_admin','director','manager','executive','accounts','hr','auditor']) r,
     unnest(array['knowledge.kb.view','knowledge.browse.view']) p on conflict do nothing;

insert into public.role_permissions (role_key, perm_key, scope)
select r, 'admin.settings.view', 'all'
from unnest(array['super_admin','director']) r on conflict do nothing;

-- Reports section + all tabs → super_admin / director / manager (today's full-access set).
insert into public.role_permissions (role_key, perm_key, scope)
select r, p, 'all'
from unnest(array['super_admin','director','manager']) r,
     unnest(array[
       'reports.view','reports.performance.view','reports.pending_payments.view',
       'reports.queries.view','reports.referrals.view','reports.govt_fees.view',
       'reports.project_timeline.view','reports.stage_perf.view','reports.employee_timeline.view'
     ]) p on conflict do nothing;

-- ── Migrate the 2 legacy report_permissions executives to grant-overrides ──────
-- They currently see Reports + the pending_payments/queries/govt_fees tabs via the
-- legacy profiles.report_permissions array. Give them explicit granted=true overrides
-- so the new perm model preserves their access (and can later Hide per the panel).
insert into public.user_permission_overrides (user_id, perm_key, granted, scope)
select pr.id, p, true, 'all'
from public.profiles pr
cross join unnest(array[
  'reports.view','reports.pending_payments.view','reports.queries.view','reports.govt_fees.view'
]) p
where pr.report_permissions is not null
  and pr.report_permissions::text not in ('null','[]','{}')
on conflict (user_id, perm_key) do update set granted = excluded.granted;
