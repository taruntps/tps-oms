// Finance & Accounts module — sidebar nav entries.
// A "Finance" group surfacing the dashboard, invoices, payments and government
// fees. Gated to the finance-facing roles; the registry filters entries by the
// current user's role (see core/registry.ts).
import type { NavEntry } from '@/core/moduleTypes'

const FINANCE_ROLES = ['super_admin', 'director', 'manager', 'accounts', 'auditor']

// PR1: grouped under "Finance" with Sales (from the sales module, order 0).
// Invoices → "Billing", Payments → "Collections" per the required enterprise nav.
export const financeNav: NavEntry[] = [
  {
    to: '/finance/invoices',
    label: 'Billing',
    icon: 'receipt_long',
    roles: FINANCE_ROLES,
    permission: 'finance.invoice.view',
    group: 'Finance',
    order: 1,
  },
  {
    to: '/finance',
    label: 'Finance',
    icon: 'account_balance',
    roles: FINANCE_ROLES,
    permission: 'finance.report.view',
    group: 'Finance',
    order: 2,
  },
  {
    to: '/finance/payments',
    label: 'Collections',
    icon: 'payments',
    roles: FINANCE_ROLES,
    permission: 'finance.payment.view',
    group: 'Finance',
    order: 3,
  },
  {
    to: '/finance/govt-fees',
    label: 'Govt Fees',
    icon: 'gavel',
    roles: FINANCE_ROLES,
    permission: 'finance.govtfee.manage',
    group: 'Finance',
    order: 5,
  },
]
