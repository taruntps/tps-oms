import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useArticles, useCategories } from '../hooks/useKnowledge'
import type { KbArticle, KbCategory } from '../api/kb'

const CATEGORY_COLOR: Record<string, string> = {
  'FSSAI Process':        'bg-blue-100 text-blue-700',
  'Forms & Documents':    'bg-purple-100 text-purple-700',
  'Regulations':          'bg-red-100 text-red-700',
  'Internal SOPs':        'bg-green-100 text-green-700',
  'FAQs':                 'bg-amber-100 text-amber-700',
  'Client Communication': 'bg-pink-100 text-pink-700',
}

/** Article's category id (new column) with a fallback to its legacy label. */
function matchesCategory(a: KbArticle, cat: KbCategory): boolean {
  if (a.category_id) return a.category_id === cat.id
  // Legacy rows without category_id: fall back to name/slug match.
  return a.category === cat.name || a.category === cat.slug
}

export default function KnowledgeHubPage() {
  const canAuthor = useCan('knowledge.article.author')
  const { data: articles = [], isLoading } = useArticles(canAuthor)
  const { data: categories = [] } = useCategories()

  const [selectedCat, setSelectedCat] = useState<string | null>(null) // category id | null = All
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // All distinct tags across the visible article set.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const a of articles) for (const t of a.tags ?? []) set.add(t)
    return Array.from(set).sort()
  }, [articles])

  const visible = useMemo(() => {
    const cat = categories.find(c => c.id === selectedCat) ?? null
    return articles.filter(a => {
      if (cat && !matchesCategory(a, cat)) return false
      if (selectedTag && !(a.tags ?? []).includes(selectedTag)) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !a.title.toLowerCase().includes(q) &&
          !a.content.toLowerCase().includes(q) &&
          !(a.tags ?? []).some(t => t.toLowerCase().includes(q))
        )
          return false
      }
      return true
    })
  }, [articles, categories, selectedCat, selectedTag, search])

  return (
    <div>
      <TopBar title="Knowledge Hub" subtitle="Browse guides, SOPs, and FAQs by category" />

      <div className="p-6 animate-fade-up">
        <div className="flex gap-5">
          {/* Category sidebar */}
          <aside className="w-52 shrink-0 hidden md:block">
            <div className="glass-panel rounded-xl p-3">
              <p className="text-[10px] font-semibold text-white/60 uppercase tracking-wide px-2 mb-1">
                Categories
              </p>
              <button
                onClick={() => setSelectedCat(null)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors',
                  selectedCat === null ? 'bg-brand-600 text-white' : 'text-white/80 hover:bg-white/10'
                )}
              >
                All articles
              </button>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCat(c.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5',
                    selectedCat === c.id ? 'bg-brand-600 text-white' : 'text-white/80 hover:bg-white/10'
                  )}
                  style={c.parent_id ? { paddingLeft: 20 } : undefined}
                >
                  <Sym name="folder" size={12} />
                  {c.name}
                </button>
              ))}
              {categories.length === 0 && (
                <p className="text-[10px] text-white/40 px-2.5 py-1.5">No categories yet</p>
              )}
            </div>
          </aside>

          {/* Main column */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Sym name="search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search articles…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>
              <Link
                to="/knowledge"
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                <Sym name="edit" size={13} /> Author / Edit
              </Link>
            </div>

            {/* Mobile category chips */}
            <div className="flex gap-1 flex-wrap md:hidden">
              <button
                onClick={() => setSelectedCat(null)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                  selectedCat === null ? 'bg-brand-600 text-white border-brand-700' : 'border-white/20 text-white hover:bg-white/10'
                )}
              >All</button>
              {categories.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCat(c.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                    selectedCat === c.id ? 'bg-brand-600 text-white border-brand-700' : 'border-white/20 text-white hover:bg-white/10'
                  )}
                >{c.name}</button>
              ))}
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[10px] text-white/50 uppercase tracking-wide">Tags</span>
                {allTags.map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTag(prev => (prev === t ? null : t))}
                    className={cn(
                      'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                      selectedTag === t
                        ? 'bg-brand-600 text-white border-brand-700'
                        : 'bg-white/5 text-white/70 border-white/15 hover:bg-white/10'
                    )}
                  >
                    <Sym name="tag" size={8} />{t}
                  </button>
                ))}
              </div>
            )}

            {/* Article list */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 glass-panel rounded-xl animate-pulse" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
                <Sym name="menu_book" size={24} className="text-white/60 mx-auto mb-2" />
                <p className="text-sm text-white/60">
                  {search || selectedTag || selectedCat ? 'No articles match your filters' : 'No articles yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map(a => (
                  <Link
                    key={a.id}
                    to={`/knowledge/article/${a.id}`}
                    className="block bg-white rounded-xl border border-border px-5 py-4 hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Sym name="menu_book" size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', CATEGORY_COLOR[a.category] ?? 'bg-gray-100 text-gray-600')}>
                            {a.category}
                          </span>
                          {!a.is_published && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Draft</span>
                          )}
                          {a.client_visible && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Client-visible</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-brand-950 mt-1">{a.title}</p>
                        {a.tags?.length ? (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {a.tags.map(t => (
                              <span key={t} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Sym name="tag" size={8} />{t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="text-[10px] text-muted-foreground mt-1">{formatDate(a.updated_at)}</p>
                      </div>
                      <Sym name="chevron_right" size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
