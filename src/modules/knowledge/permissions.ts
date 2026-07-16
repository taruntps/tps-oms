// Knowledge module — permission keys.
// Namespaced `knowledge.<entity>.<action>`; RLS in the DB is authoritative,
// these keys drive UI affordance (useCan). Mirrors the grants added in
// migration 080 (knowledge.article.view/author/publish, knowledge.category.manage).
export const KNOWLEDGE_PERMISSIONS = [
  // Articles
  'knowledge.article.view',
  'knowledge.article.author',
  'knowledge.article.publish',
  // Categories
  'knowledge.category.manage',
] as const

export type KnowledgePermission = (typeof KNOWLEDGE_PERMISSIONS)[number]
