// Sales module — permission keys.
// Namespaced `sales.<entity>.<action>`; RLS + has_perm() in the DB (migration 083)
// are authoritative — these keys drive UI affordance (useCan) for the sales surface.
export const SALES_PERMISSIONS = [
  // Deals pipeline
  'sales.deal.view',
  'sales.deal.manage',
  'sales.deal.close',
  // Quotations
  'sales.quotation.manage',
  'sales.quotation.approve',
  // Orders / handoff
  'sales.order.manage',
  // Service catalogue
  'sales.service.manage',
] as const

export type SalesPermission = (typeof SALES_PERMISSIONS)[number]
