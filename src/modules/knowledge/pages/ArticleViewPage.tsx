import { Link, useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { cn, formatDate } from '@/lib/utils'
import {
  useArticle,
  useMyFeedback,
  useSubmitFeedback,
  useVersionCount,
} from '../hooks/useKnowledge'

const CATEGORY_COLOR: Record<string, string> = {
  'FSSAI Process':        'bg-blue-100 text-blue-700',
  'Forms & Documents':    'bg-purple-100 text-purple-700',
  'Regulations':          'bg-red-100 text-red-700',
  'Internal SOPs':        'bg-green-100 text-green-700',
  'FAQs':                 'bg-amber-100 text-amber-700',
  'Client Communication': 'bg-pink-100 text-pink-700',
}

export default function ArticleViewPage() {
  const { id } = useParams<{ id: string }>()
  const { data: article, isLoading, isError } = useArticle(id)
  const { data: versionCount = 0 } = useVersionCount(id)
  const { data: myFeedback } = useMyFeedback(id)
  const submitFeedback = useSubmitFeedback(id ?? '')

  function vote(helpful: boolean) {
    submitFeedback.mutate(
      { helpful },
      {
        onSuccess: () => toast.success(helpful ? 'Marked as helpful' : 'Thanks for the feedback'),
        onError: (e: unknown) =>
          toast.error('Could not save feedback', e instanceof Error ? e.message : undefined),
      }
    )
  }

  return (
    <div>
      <TopBar title="Article" subtitle="Knowledge Hub" />

      <div className="p-6 animate-fade-up max-w-3xl">
        <Link
          to="/knowledge/browse"
          className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white mb-4"
        >
          <Sym name="arrow_back" size={13} /> Back to Knowledge Hub
        </Link>

        {isLoading ? (
          <div className="h-64 glass-panel rounded-xl animate-pulse" />
        ) : isError || !article ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="error" size={24} className="text-white/60 mx-auto mb-2" />
            <p className="text-sm text-white/60">Article not found or unavailable.</p>
          </div>
        ) : (
          <article className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', CATEGORY_COLOR[article.category] ?? 'bg-gray-100 text-gray-600')}>
                  {article.category}
                </span>
                {!article.is_published && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Draft</span>
                )}
                {article.client_visible && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Client-visible</span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-brand-950 mt-2">{article.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Sym name="schedule" size={11} /> Updated {formatDate(article.updated_at)}
                </span>
                <span className="flex items-center gap-1">
                  <Sym name="history" size={11} /> {versionCount} {versionCount === 1 ? 'revision' : 'revisions'}
                </span>
                {article.tags?.length ? (
                  <span className="flex items-center gap-1 flex-wrap">
                    {article.tags.map(t => (
                      <span key={t} className="flex items-center gap-0.5">
                        <Sym name="tag" size={9} />{t}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="px-6 py-5">
              <pre className="text-sm text-brand-950 whitespace-pre-wrap font-sans leading-relaxed">{article.content}</pre>
            </div>

            {/* Feedback */}
            <div className="px-6 py-4 border-t border-border bg-[#F8FAFC]">
              <p className="text-xs font-medium text-brand-950 mb-2">Was this article helpful?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => vote(true)}
                  disabled={submitFeedback.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50',
                    myFeedback?.helpful === true
                      ? 'bg-emerald-600 text-white border-emerald-700'
                      : 'border-border hover:bg-white'
                  )}
                >
                  <Sym name="thumb_up" size={13} /> Helpful
                </button>
                <button
                  onClick={() => vote(false)}
                  disabled={submitFeedback.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50',
                    myFeedback?.helpful === false
                      ? 'bg-red-600 text-white border-red-700'
                      : 'border-border hover:bg-white'
                  )}
                >
                  <Sym name="thumb_down" size={13} /> Not helpful
                </button>
                {myFeedback && (
                  <span className="text-[10px] text-muted-foreground ml-1">Your feedback is recorded</span>
                )}
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  )
}
