-- 130 — Data-level lock for the Finance module (defense-in-depth for per-employee
-- access overrides). The Finance nav/routes/buttons are already hidden for a denied
-- user by my_permissions(); this closes the residual API leak where a role that reads
-- finance via the loose auth_role() list (notably `executive`) could still pull rows
-- directly through PostgREST after being hidden in the UI.
--
-- SUBTRACTIVE-ONLY, ZERO REGRESSION: every existing role-list check is preserved
-- verbatim; we only AND a clause that removes access for a user who carries an EXPLICIT
-- deny override (user_permission_overrides.granted = false) for the relevant perm.
-- No deny rows exist until an admin hides Finance for someone, so behaviour is identical
-- to today until the feature is actually used. super_admin is never subtracted.

-- Helper: does the current user carry an explicit deny for this perm?
create or replace function public.has_deny(p_perm text)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_permission_overrides
    where user_id = auth.uid() and perm_key = p_perm and granted = false
  );
$$;
grant execute on function public.has_deny(text) to authenticated;

-- finance_invoices --------------------------------------------------------------
drop policy if exists finance_invoices_read on public.finance_invoices;
create policy finance_invoices_read on public.finance_invoices for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.invoice.view'))
);

-- finance_invoice_lines ---------------------------------------------------------
drop policy if exists finance_invoice_lines_read on public.finance_invoice_lines;
create policy finance_invoice_lines_read on public.finance_invoice_lines for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.invoice.view'))
);

-- finance_credit_notes ----------------------------------------------------------
drop policy if exists finance_credit_notes_read on public.finance_credit_notes;
create policy finance_credit_notes_read on public.finance_credit_notes for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.invoice.view'))
);

-- finance_govt_fees -------------------------------------------------------------
drop policy if exists finance_govt_fees_read on public.finance_govt_fees;
create policy finance_govt_fees_read on public.finance_govt_fees for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.govtfee.manage'))
);

-- finance_bank_accounts ---------------------------------------------------------
drop policy if exists finance_bank_accounts_read on public.finance_bank_accounts;
create policy finance_bank_accounts_read on public.finance_bank_accounts for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.report.view'))
);

-- finance_accounting_periods ----------------------------------------------------
drop policy if exists finance_accounting_periods_read on public.finance_accounting_periods;
create policy finance_accounting_periods_read on public.finance_accounting_periods for select using (
  (auth_role() = any (array['super_admin','director','manager','accounts','auditor','executive']::user_role[]))
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.report.view'))
);

-- payments (uses has_role variadic; preserve it, add deny) -----------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (
  has_role(variadic array['super_admin','director','manager','executive','accounts','hr','auditor']::user_role[])
  and (auth_role() = 'super_admin'::user_role or not has_deny('finance.payment.view'))
);
