// CRM module — permission keys.
// Namespaced `crm.<entity>.<action>`; RLS + has_perm() in the DB are authoritative,
// these keys drive UI affordance (useCan) for the CRM surface.
export const CRM_PERMISSIONS = [
  // Leads pipeline
  'crm.lead.view',
  'crm.lead.manage',
  'crm.lead.convert',
  // Clients (CRM view over existing clients)
  'crm.client.view',
  'crm.client.manage',
  // Contacts
  'crm.contact.manage',
  // Activity timeline
  'crm.activity.log',
  // Referrals / sources
  'crm.referral.manage',
] as const

export type CrmPermission = (typeof CRM_PERMISSIONS)[number]
