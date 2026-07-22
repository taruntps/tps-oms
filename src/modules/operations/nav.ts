// Operations module — sidebar nav entries.
// Icons and role gates mirror the current src/components/layout/Sidebar.tsx
// entries so behavior is unchanged when the sidebar is registry-driven.
import type { NavEntry } from '@/core/moduleTypes'

export const operationsNav: NavEntry[] = [
  {
    to: '/projects',
    label: 'Projects',
    icon: 'assignment',
    roles: ['super_admin', 'director', 'manager', 'executive'],
    group: 'Business',
    order: 3,
  },
  {
    to: '/operations',
    label: 'Operations',
    icon: 'shield',
    roles: ['super_admin', 'director', 'manager', 'executive', 'accounts', 'hr', 'auditor'],
    group: 'Business',
    order: 5,
  },
]
