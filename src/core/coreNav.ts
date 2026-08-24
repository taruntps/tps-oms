// Core Platform — cross-cutting nav entries not owned by a feature module (PR1).
// These pages are mounted directly in App.tsx (legacy) rather than via a module
// registry entry: Dashboard (role-adaptive home), Clients, Tasks, Reports.
// Surfacing them here lets the registry-driven Sidebar render one unified nav.
// Reuse-before-create: points at EXISTING routes; no new pages.
import type { NavEntry } from './moduleTypes'

const ALL_ROLES = ['super_admin', 'director', 'manager', 'executive', 'accounts', 'hr', 'auditor']

export const coreNav: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ALL_ROLES, group: 'Dashboard', order: 0 },
  { to: '/clients', label: 'Clients', icon: 'apartment', roles: ['super_admin', 'director', 'manager', 'executive', 'accounts', 'auditor'], permission: 'core.clients.view', group: 'Business', order: 1 },
  { to: '/tasks', label: 'Tasks', icon: 'task_alt', roles: ALL_ROLES, permission: 'core.tasks.view', group: 'Business', order: 4 },
  { to: '/marketing/whatsapp', label: 'WhatsApp Campaigns', icon: 'campaign', roles: ['super_admin', 'director', 'hr'], permission: 'core.whatsapp.campaigns.view', group: 'Business', order: 6 },
  { to: '/marketing/whatsapp-inbox', label: 'WhatsApp Inbox', icon: 'forum', roles: ['super_admin', 'director', 'hr'], permission: 'core.whatsapp.inbox.view', group: 'Business', order: 7 },
  { to: '/reports/performance', label: 'Reports', icon: 'bar_chart', roles: ['super_admin', 'director', 'manager'], permission: 'reports.view', group: 'Reports', order: 0 },
]
