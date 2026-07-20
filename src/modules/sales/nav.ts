// Sales module — sidebar nav entries.
// A "Sales" group surfacing the Deals pipeline and the Service catalogue.
// Gated to the roles that own the sales surface; the registry filters entries by
// the current user's role (see core/registry.ts).
import type { NavEntry } from '@/core/moduleTypes'

const SALES_ROLES = ['super_admin', 'director', 'manager', 'executive']

export const salesNav: NavEntry[] = [
  {
    to: '/sales/deals',
    label: 'Deals',
    icon: 'trending_up',
    roles: SALES_ROLES,
    permission: 'sales.deal.view',
  },
  {
    to: '/sales/services',
    label: 'Services',
    icon: 'sell',
    roles: SALES_ROLES,
    permission: 'sales.service.manage',
  },
]
