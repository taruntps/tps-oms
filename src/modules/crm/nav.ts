// CRM module — sidebar nav entries.
// A "CRM" group surfacing Leads (pipeline) and Referrals. Gated to the
// customer-facing roles; the registry filters entries by the current user's role.
import type { NavEntry } from '@/core/moduleTypes'

const CRM_ROLES = ['super_admin', 'director', 'manager', 'executive']

export const crmNav: NavEntry[] = [
  {
    to: '/crm/leads',
    label: 'Leads',
    icon: 'contact_phone',
    roles: CRM_ROLES,
    permission: 'crm.lead.view',
  },
  {
    to: '/crm/referrals',
    label: 'Referrals',
    icon: 'handshake',
    roles: CRM_ROLES,
    permission: 'crm.referral.manage',
  },
]
