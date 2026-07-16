// Knowledge module — React Query hooks.
// Wrap the api/kb.ts data layer with caching + invalidation, matching the
// query patterns used across the app (@tanstack/react-query + supabase).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  createCategory,
  deleteCategory,
  fetchArticle,
  fetchArticles,
  fetchCategories,
  fetchMyFeedback,
  fetchVersionCount,
  submitFeedback,
  updateCategory,
  type CategoryInput,
} from '../api/kb'

const KEYS = {
  articles: (publishedOnly: boolean) => ['kb', 'articles', { publishedOnly }] as const,
  article: (id: string | undefined) => ['kb', 'article', id] as const,
  categories: () => ['kb', 'categories'] as const,
  feedback: (articleId: string | undefined, userId: string | undefined) =>
    ['kb', 'feedback', articleId, userId] as const,
  versionCount: (articleId: string | undefined) => ['kb', 'versions', articleId] as const,
}

/** List articles. Authors see drafts too; everyone else only published. */
export function useArticles(canAuthor: boolean) {
  return useQuery({
    queryKey: KEYS.articles(!canAuthor),
    queryFn: () => fetchArticles(!canAuthor),
  })
}

/** Single article by id. */
export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.article(id),
    enabled: !!id,
    queryFn: () => fetchArticle(id!),
  })
}

/** All categories (for the sidebar / admin). */
export function useCategories() {
  return useQuery({
    queryKey: KEYS.categories(),
    queryFn: fetchCategories,
  })
}

/** Number of stored revisions for an article. */
export function useVersionCount(articleId: string | undefined) {
  return useQuery({
    queryKey: KEYS.versionCount(articleId),
    enabled: !!articleId,
    queryFn: () => fetchVersionCount(articleId!),
  })
}

/** Current user's existing feedback for an article. */
export function useMyFeedback(articleId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: KEYS.feedback(articleId, user?.id),
    enabled: !!articleId && !!user?.id,
    queryFn: () => fetchMyFeedback(articleId!, user!.id),
  })
}

/** Submit / update the current user's helpful vote. */
export function useSubmitFeedback(articleId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: { helpful: boolean; comment?: string | null }) =>
      submitFeedback({
        articleId,
        userId: user!.id,
        helpful: params.helpful,
        comment: params.comment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.feedback(articleId, user?.id) })
    },
  })
}

// ── Category mutations ────────────────────────────────────────────────────────
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories() }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) =>
      updateCategory(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories() }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.categories() }),
  })
}
