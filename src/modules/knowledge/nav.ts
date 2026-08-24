// Knowledge module — sidebar nav entries.
// "Knowledge Base" points at the existing page (/knowledge, untouched). The
// enhanced surface adds "Browse" (the category hub) and a permission-gated
// "Categories" admin entry.
import type { NavEntry } from '@/core/moduleTypes'

export const knowledgeNav: NavEntry[] = [
  {
    to: '/knowledge',
    label: 'Knowledge Base',
    icon: 'library_books',
    permission: 'knowledge.kb.view',
  },
  {
    to: '/knowledge/browse',
    label: 'Browse',
    icon: 'menu_book',
    permission: 'knowledge.browse.view',
  },
  {
    to: '/knowledge/categories',
    label: 'Categories',
    icon: 'category',
    permission: 'knowledge.category.manage',
  },
]
