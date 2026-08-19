-- 110 — crm_leads.estimated_value was NOT NULL, but the Lead form sends null when
-- the amount is left blank (app treats it as optional, shows "—"), so leads without
-- an estimate failed to insert. Applied live via apply_migration; repo record.
alter table public.crm_leads alter column estimated_value drop not null;
