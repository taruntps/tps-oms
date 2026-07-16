// Documents module — permission keys.
// Namespaced `documents.<entity>.<action>`. RLS in the DB is authoritative;
// these keys drive UI affordance (useCan). Mirrors migration 079 grants.
export const DOCUMENTS_PERMISSIONS = [
  // Unified document access
  'documents.doc.view',
  'documents.doc.upload',
  'documents.doc.delete',
  'documents.doc.export',
  // Templates
  'documents.template.manage',
] as const

export type DocumentsPermission = (typeof DOCUMENTS_PERMISSIONS)[number]
