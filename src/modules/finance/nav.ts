// Finance & Accounts module — sidebar nav entries.
// A "Finance" group surfacing the dashboard, invoices, payments and government
// fees. Gated to the finance-facing roles; the registry filters entries by the
// current user's role (see core/registry.ts).
import type { NavEntry } from '@/core/moduleTypes'

const FINANCE_ROLES = ['super_admin', 'director', 'manager', 'accounts', 'auditor']

export const financeNav: NavEntry[] = [
  {
    to: '/finance',
    label: 'Dashboard',
    icon: 'account_balance',
    roles: FINANCE_ROLES,
    permission: 'finance.report.view',
  },
  {
    to: '/finance/invoices',
    label: 'Invoices',
    icon: 'receipt_long',
    roles: FINANCE_ROLES,
    permission: 'finance.invoice.view',
  },
  {
    to: '/finance/payments',
    label: 'Payments',
    icon: 'payments',
    roles: FINANCE_ROLES,
    permission: 'finance.payment.view',
  },
  {
    to: '/finance/govt-fees',
    label: 'Govt Fees',
    icon: 'gavel',
    roles: FINANCE_ROLES,
    permission: 'finance.govtfee.manage',
  },
]
