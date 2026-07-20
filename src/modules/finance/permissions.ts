// Finance & Accounts module — permission keys.
// Namespaced `finance.<entity>.<action>` (seeded by migration 084). RLS +
// has_perm() in the DB are authoritative; these keys drive UI affordance via
// useCan() across the finance surface.
export const FINANCE_PERMISSIONS = [
  // Invoices
  'finance.invoice.view',
  'finance.invoice.manage',
  'finance.invoice.cancel',
  // Credit notes
  'finance.creditnote.manage',
  // Payments
  'finance.payment.view',
  'finance.payment.record',
  // Government (pass-through) fees
  'finance.govtfee.manage',
  // Reporting
  'finance.report.view',
  'finance.report.export',
  // Billing provider sync
  'finance.billing.sync',
  // Settings & period lock
  'finance.setting.manage',
  'finance.period.close',
] as const

export type FinancePermission = (typeof FINANCE_PERMISSIONS)[number]
