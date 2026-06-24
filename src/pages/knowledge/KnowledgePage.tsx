import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '@/components/layout/TopBar'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { cn, formatDate } from '@/lib/utils'
import { Sym } from '@/components/shared/Sym'
import type { Tables } from '@/types/database'

type Article = Tables<'knowledge_base'>

const CATEGORIES = [
  'All',
  'FSSAI Process',
  'Forms & Documents',
  'Regulations',
  'Internal SOPs',
  'FAQs',
  'Client Communication',
]

const CATEGORY_COLOR: Record<string, string> = {
  'FSSAI Process':       'bg-blue-100 text-blue-700',
  'Forms & Documents':   'bg-purple-100 text-purple-700',
  'Regulations':         'bg-red-100 text-red-700',
  'Internal SOPs':       'bg-green-100 text-green-700',
  'FAQs':                'bg-amber-100 text-amber-700',
  'Client Communication':'bg-pink-100 text-pink-700',
}

function ArticleForm({ initial, onSave, onCancel }: {
  initial?: Partial<Article>
  onSave: (data: Partial<Article>) => void
  onCancel: () => void
}) {
  const [title, setTitle]       = useState(initial?.title ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'FSSAI Process')
  const [content, setContent]   = useState(initial?.content ?? '')
  const [tags, setTags]         = useState<string[]>(initial?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [published, setPublished] = useState(initial?.is_published ?? false)

  function addTag() {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="Article title"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</label>
          <div className="flex gap-1.5 mt-1">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              placeholder="Add tag + Enter"
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-[10px] bg-brand-50 border border-brand-200 text-brand-700 px-1.5 py-0.5 rounded">
                  {t}
                  <button onClick={() => setTags(prev => prev.filter(x => x !== t))}>
                    <Sym name="close" size={8} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content (Markdown supported)</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={10}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 resize-y"
            placeholder="Write article content here…"
          />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={published}
            onChange={e => setPublished(e.target.checked)}
            className="w-4 h-4 accent-brand-600"
          />
          <span className="text-sm text-brand-950">Publish (visible to all staff)</span>
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button
            onClick={() => onSave({ title, category, content, tags, is_published: published })}
            disabled={!title.trim() || !content.trim()}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            Save Article
          </button>
        </div>
      </div>
    </div>
  )
}

function ArticleCard({ article, onEdit }: { article: Article; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const canEdit = true // enforced by RoleGuard on parent

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-[#F8FAFC] transition-colors"
      >
        <Sym name="menu_book" size={14} className="text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', CATEGORY_COLOR[article.category] ?? 'bg-gray-100 text-gray-600')}>
              {article.category}
            </span>
            {!article.is_published && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Draft</span>
            )}
          </div>
          <p className="text-sm font-semibold text-brand-950 mt-1">{article.title}</p>
          {article.tags?.length ? (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {article.tags.map(t => (
                <span key={t} className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Sym name="tag" size={8} />{t}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-[10px] text-muted-foreground mt-1">{formatDate(article.updated_at)}</p>
        </div>
        {expanded ? <Sym name="expand_less" size={14} className="text-muted-foreground shrink-0 mt-0.5" /> : <Sym name="expand_more" size={14} className="text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <pre className="text-xs text-brand-950 whitespace-pre-wrap font-sans leading-relaxed">{article.content}</pre>
          {canEdit && (
            <div className="mt-4 flex justify-end">
              <RoleGuard roles={['super_admin','director','manager']}>
                <button onClick={onEdit} className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg">
                  Edit
                </button>
              </RoleGuard>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function KnowledgePage() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [category, setCategory] = useState('All')
  const [search, setSearch]     = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing]   = useState<Article | null>(null)

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['knowledge_base'],
    queryFn: async () => {
      const { data } = await supabase
        .from('knowledge_base')
        .select('*')
        .order('updated_at', { ascending: false })
      return (data ?? []) as Article[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Partial<Article>) => {
      const { error } = await supabase.from('knowledge_base').insert({
        title:        payload.title!,
        category:     payload.category!,
        content:      payload.content!,
        tags:         payload.tags ?? [],
        is_published: payload.is_published ?? false,
        created_by:   profile!.id,
      })
      if (error) throw error
    },
    onSuccess: () => { toast.success('Article created'); qc.invalidateQueries({ queryKey: ['knowledge_base'] }); setCreating(false) },
    onError: (e: Error) => toast.error('Failed', e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Article> & { id: string }) => {
      const { error } = await supabase.from('knowledge_base').update({
        title:        payload.title,
        category:     payload.category,
        content:      payload.content,
        tags:         payload.tags,
        is_published: payload.is_published,
        updated_at:   new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Article updated'); qc.invalidateQueries({ queryKey: ['knowledge_base'] }); setEditing(null) },
    onError: (e: Error) => toast.error('Failed', e.message),
  })

  const visible = articles.filter(a => {
    if (category !== 'All' && a.category !== category) return false
    if (search) {
      const q = search.toLowerCase()
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.tags?.some(t => t.includes(q))
    }
    return true
  })

  return (
    <div>
      <TopBar title="Knowledge Base" subtitle="FSSAI process guides, SOPs, and FAQs" />

      <div className="p-6 space-y-5 animate-fade-up">

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
          <RoleGuard roles={['super_admin','director','manager']}>
            <button
              onClick={() => { setCreating(true); setEditing(null) }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
            >
              <Sym name="add" size={13} /> New Article
            </button>
          </RoleGuard>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                category === c
                  ? 'bg-brand-600 text-white border-brand-700'
                  : 'border border-white/20 text-white hover:bg-white/10'
              )}
            >{c}</button>
          ))}
        </div>

        {/* Create form */}
        {creating && (
          <ArticleForm
            onSave={d => createMutation.mutate(d)}
            onCancel={() => setCreating(false)}
          />
        )}

        {/* Edit form */}
        {editing && (
          <ArticleForm
            initial={editing}
            onSave={d => updateMutation.mutate({ ...d, id: editing.id })}
            onCancel={() => setEditing(null)}
          />
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
              {search ? 'No articles match your search' : 'No articles yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(a => (
              <ArticleCard key={a.id} article={a} onEdit={() => { setEditing(a); setCreating(false) }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
