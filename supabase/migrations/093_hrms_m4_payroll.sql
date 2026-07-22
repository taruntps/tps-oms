-- Migration 093 (HRMS M4 Payroll). Applied to staging; additive/EXPAND. Money=paise; statutory placeholder-seeded + effective-dated; salary/payroll RLS-confidential; audit fn_audit_wave2.
-- Migration 093 — HRMS M4: Payroll. EXPAND only (additive). Per PAYROLL_DATA_MODEL_SPEC.
-- Money = bigint paise. Statutory placeholder-seeded + effective-dated. Salary/payroll RLS-confidential
-- (hr/director/super_admin; payslip self). audit fn_audit_wave2. Reuses M1/M2/M3 + Finance + DMS.

-- ══ Part A: Masters ══
create table if not exists public.hr_component_master (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, name text not null,
  type text not null check (type in ('earning','deduction','employer_contribution','reimbursement')),
  calc_type text not null default 'fixed' check (calc_type in ('fixed','percent_of_base','slab','formula','balancing')),
  base_code text, depends_on text,
  is_taxable boolean not null default true, is_pf_wage boolean not null default false, is_esi_wage boolean not null default false,
  is_part_of_ctc boolean not null default true, is_part_of_gross boolean not null default true, prorate_on_lop boolean not null default true,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_statutory_config (
  id uuid primary key default uuid_generate_v4(),
  statute text not null check (statute in ('PF','ESI','PT','TDS','GRATUITY','BONUS','LWF')),
  param_key text not null, value jsonb not null,
  effective_from date not null default current_date, effective_to date, note text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_statutory_config_idx on public.hr_statutory_config(statute, param_key, effective_from);

-- ══ Part B: Salary structures + effective-dated assignment + revisions ══
create table if not exists public.hr_salary_structures (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique, name text not null, grade_id uuid references public.hr_grades(id),
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_salary_components (
  id uuid primary key default uuid_generate_v4(),
  structure_id uuid not null references public.hr_salary_structures(id) on delete cascade,
  component_code text not null references public.hr_component_master(code),
  value_type text not null default 'amount' check (value_type in ('amount','percent')),
  value numeric(14,2) not null default 0, sort_order int not null default 0
);
create table if not exists public.hr_employee_salary (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  structure_id uuid references public.hr_salary_structures(id),
  ctc bigint not null default 0, effective_from date not null default current_date, effective_to date,
  status text not null default 'active' check (status in ('active','superseded')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index if not exists hr_employee_salary_idx on public.hr_employee_salary(employee_id, effective_from desc);
create table if not exists public.hr_employee_salary_components (
  id uuid primary key default uuid_generate_v4(),
  employee_salary_id uuid not null references public.hr_employee_salary(id) on delete cascade,
  component_code text not null references public.hr_component_master(code),
  amount bigint not null default 0, percent numeric(6,2)
);
create table if not exists public.hr_salary_revisions (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  from_salary_id uuid references public.hr_employee_salary(id), to_salary_id uuid references public.hr_employee_salary(id),
  effective_date date not null, reason text, source text check (source in ('review','promotion','manual')),
  approved_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- ══ Part C: Payroll runs + lines + statutory + payslips ══
create table if not exists public.hr_payroll_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id),
  period_month int not null, period_year int not null, version int not null default 1, run_no text,
  status text not null default 'draft' check (status in ('draft','computed','approved','locked','paid','cancelled')),
  lop_basis text, is_adjustment boolean not null default false, original_run_id uuid references public.hr_payroll_runs(id),
  computed_at timestamptz, approved_by uuid references public.profiles(id), approved_at timestamptz, locked_at timestamptz,
  notes text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique (org_id, period_month, period_year, version, is_adjustment)
);
create table if not exists public.hr_payroll_lines (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.profiles(id),
  employee_salary_id uuid references public.hr_employee_salary(id),
  payable_days numeric(5,2) not null default 0, lop_days numeric(5,2) not null default 0,
  gross bigint not null default 0, total_earnings bigint not null default 0, total_deductions bigint not null default 0,
  total_statutory bigint not null default 0, net_pay bigint not null default 0, round_off bigint not null default 0,
  remarks text, created_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create table if not exists public.hr_payroll_component_lines (
  id uuid primary key default uuid_generate_v4(),
  payroll_line_id uuid not null references public.hr_payroll_lines(id) on delete cascade,
  component_code text references public.hr_component_master(code),
  component_type text, amount bigint not null default 0, is_statutory boolean not null default false
);
create table if not exists public.hr_payroll_statutory (
  id uuid primary key default uuid_generate_v4(),
  payroll_line_id uuid not null references public.hr_payroll_lines(id) on delete cascade,
  statute text not null, wage_base bigint not null default 0, employee_share bigint not null default 0,
  employer_share bigint not null default 0, details jsonb
);
create table if not exists public.hr_payslips (
  id uuid primary key default uuid_generate_v4(),
  payroll_line_id uuid not null references public.hr_payroll_lines(id) on delete cascade,
  employee_id uuid not null references public.profiles(id), run_id uuid not null references public.hr_payroll_runs(id),
  document_id uuid, published_at timestamptz, ytd jsonb, created_at timestamptz not null default now(),
  unique (payroll_line_id)
);

-- ══ Part D: Inputs — variable pay, reimbursements, arrears, loans, adjustments ══
create table if not exists public.hr_variable_pay (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  period_month int not null, period_year int not null, component_code text references public.hr_component_master(code),
  amount bigint not null default 0, is_taxable boolean not null default true, note text, source_ref uuid,
  status text not null default 'pending' check (status in ('pending','included','paid','cancelled')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_reimbursements (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  category text, amount bigint not null default 0, claim_ref text, document_id uuid,
  status text not null default 'submitted' check (status in ('submitted','approved','paid','rejected')),
  period_month int, period_year int, approver_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_arrears (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  reason text, amount bigint not null default 0, period_from date, period_to date,
  source_run_id uuid references public.hr_payroll_runs(id), applied_run_id uuid references public.hr_payroll_runs(id),
  status text not null default 'pending' check (status in ('pending','applied','cancelled')), created_at timestamptz not null default now()
);
create table if not exists public.hr_loans (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'loan' check (type in ('loan','advance')), principal bigint not null default 0,
  balance bigint not null default 0, emi bigint not null default 0, start_date date,
  status text not null default 'active' check (status in ('active','closed')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.hr_loan_schedule (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid not null references public.hr_loans(id) on delete cascade,
  due_month int not null, due_year int not null, amount bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','recovered','waived')),
  payroll_line_id uuid references public.hr_payroll_lines(id)
);
create table if not exists public.hr_payroll_adjustments (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  original_run_id uuid references public.hr_payroll_runs(id), adjustment_run_id uuid references public.hr_payroll_runs(id),
  type text check (type in ('credit','debit')), amount bigint not null default 0, reason text,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

-- ══ Part E: Finance handoff + bank advice (post-Finance) ══
create table if not exists public.hr_payroll_finance_handoff (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade unique,
  batch_ref text, amount_total bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','finance_review','authorized','paid','rejected')),
  finance_ref text, authorized_by uuid references public.profiles(id), authorized_at timestamptz, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.hr_bank_advice (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.hr_payroll_runs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','finance_approved','generated','exported')),
  generated_at timestamptz, generated_by uuid references public.profiles(id), file_document_id uuid, finance_batch_ref text,
  created_at timestamptz not null default now()
);
create table if not exists public.hr_bank_advice_lines (
  id uuid primary key default uuid_generate_v4(),
  advice_id uuid not null references public.hr_bank_advice(id) on delete cascade,
  employee_id uuid not null references public.profiles(id), bank_ref text, amount bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','returned'))
);

-- ══ Part F: Permissions ══
insert into public.permissions (perm_key, module, label) values
  ('hrms.salary.view','hrms','View salary structures & CTC'),
  ('hrms.salary.manage','hrms','Manage salary structures/components/config'),
  ('hrms.payroll.process','hrms','Create/compute payroll runs'),
  ('hrms.payroll.approve','hrms','Approve/lock payroll runs'),
  ('hrms.payroll.view','hrms','View payroll runs & reports'),
  ('hrms.payslip.self','hrms','View own payslip (ESS)')
on conflict (perm_key) do nothing;
insert into public.role_permissions (role_key, perm_key, scope)
select r.role_key, p.perm_key, 'all' from (values ('super_admin'),('director')) r(role_key)
cross join public.permissions p where p.module='hrms' and (p.perm_key like 'hrms.payroll%' or p.perm_key like 'hrms.salary%' or p.perm_key='hrms.payslip.self')
on conflict do nothing;
insert into public.role_permissions (role_key, perm_key, scope) values
  ('hr','hrms.salary.view','all'),('hr','hrms.salary.manage','all'),('hr','hrms.payroll.process','all'),('hr','hrms.payroll.view','all'),('hr','hrms.payslip.self','all'),
  ('accounts','hrms.payroll.view','all'),('accounts','hrms.payslip.self','all'),
  ('auditor','hrms.payroll.view','all'),('auditor','hrms.salary.view','all'),
  ('executive','hrms.payslip.self','all'),('manager','hrms.payslip.self','all')
on conflict do nothing;

-- ══ Part G: RLS + audit ══
do $$
declare t text;
  confidential text[] := array['hr_component_master','hr_statutory_config','hr_salary_structures','hr_salary_components','hr_employee_salary','hr_employee_salary_components','hr_salary_revisions','hr_payroll_runs','hr_payroll_lines','hr_payroll_component_lines','hr_payroll_statutory','hr_variable_pay','hr_reimbursements','hr_arrears','hr_loans','hr_loan_schedule','hr_payroll_adjustments','hr_payroll_finance_handoff','hr_bank_advice','hr_bank_advice_lines'];
  selfpay text[] := array['hr_payslips'];
begin
  foreach t in array confidential loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'auditor'::user_role,'accounts'::user_role]))$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
  foreach t in array selfpay loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format($p$create policy %I on public.%I for select to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role,'auditor'::user_role]) or employee_id = auth.uid())$p$, t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format($p$create policy %I on public.%I for all to public using (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role])) with check (auth_role() = any (array['super_admin'::user_role,'director'::user_role,'hr'::user_role]))$p$, t||'_write', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_'||t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function fn_audit_wave2()', 'trg_audit_'||t, t);
  end loop;
end $$;

-- ══ Part H: Seed placeholder component master + statutory config + payroll policy (all editable) ══
insert into public.hr_component_master (code,name,type,calc_type,base_code,is_taxable,is_pf_wage,is_esi_wage,prorate_on_lop,sort_order) values
  ('BASIC','Basic','earning','percent_of_base','GROSS',true,true,true,true,1),
  ('HRA','House Rent Allowance','earning','percent_of_base','BASIC',true,false,true,true,2),
  ('CONV','Conveyance Allowance','earning','fixed',null,true,false,true,true,3),
  ('SPECIAL','Special Allowance','earning','balancing',null,true,false,true,true,4),
  ('PF_EE','Provident Fund (Employee)','deduction','formula','BASIC',false,false,false,false,20),
  ('ESI_EE','ESI (Employee)','deduction','formula','GROSS',false,false,false,false,21),
  ('PT','Professional Tax','deduction','slab',null,false,false,false,false,22),
  ('TDS','TDS','deduction','fixed',null,false,false,false,false,23),
  ('PF_ER','Provident Fund (Employer)','employer_contribution','formula','BASIC',false,false,false,false,30),
  ('ESI_ER','ESI (Employer)','employer_contribution','formula','GROSS',false,false,false,false,31)
on conflict (code) do nothing;
insert into public.hr_statutory_config (statute,param_key,value,note) values
  ('PF','employee_rate','0'::jsonb,'PLACEHOLDER — set actual PF employee rate % in Administration'),
  ('PF','employer_rate','0'::jsonb,'PLACEHOLDER — employer rate %'),
  ('PF','wage_ceiling','0'::jsonb,'PLACEHOLDER — PF wage ceiling (paise)'),
  ('ESI','employee_rate','0'::jsonb,'PLACEHOLDER — ESI employee %'),
  ('ESI','employer_rate','0'::jsonb,'PLACEHOLDER — ESI employer %'),
  ('ESI','eligibility_ceiling','0'::jsonb,'PLACEHOLDER — ESI gross eligibility ceiling (paise)'),
  ('PT','slabs','[]'::jsonb,'PLACEHOLDER — Punjab PT slabs'),
  ('GRATUITY','formula','{}'::jsonb,'PLACEHOLDER — gratuity formula params'),
  ('BONUS','params','{}'::jsonb,'PLACEHOLDER — bonus params'),
  ('LWF','params','{}'::jsonb,'PLACEHOLDER — LWF params')
on conflict do nothing;
insert into public.hr_policy_settings (scope_type, key, value, note) values
  ('company','payroll.cycle','"monthly"'::jsonb,'Payroll cycle'),
  ('company','payroll.cutoff_day','25'::jsonb,'Attendance/input cut-off day'),
  ('company','payroll.lop_basis','"calendar"'::jsonb,'LOP basis: calendar | fixed30'),
  ('company','payroll.rounding','1'::jsonb,'Net rounding to nearest rupee'),
  ('company','payroll.ot_enabled','false'::jsonb,'Paid OT disabled by default (comp-off)'),
  ('company','payroll.ot_rate_multiplier','1'::jsonb,'OT multiplier when enabled'),
  ('company','payroll.encash_basis_days','30'::jsonb,'Leave encashment basis days')
on conflict do nothing;;
