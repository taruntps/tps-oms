// Documents module — sidebar nav entries.
// Gated by granular permission keys (consumed by the access layer / useCan).
import type { NavEntry } from '@/core/moduleTypes'

export const documentsNav: NavEntry[] = [
  {
    to: '/documents',
    label: 'Documents',
    icon: 'folder_open',
    permission: 'documents.doc.view',
  },
  {
    to: '/documents/templates',
    label: 'Templates',
    icon: 'description',
    permission: 'documents.template.manage',
  },
]
