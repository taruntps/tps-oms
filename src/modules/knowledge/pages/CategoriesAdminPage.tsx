import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { useCan } from '@/core/access/useCan'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../hooks/useKnowledge'
import type { KbCategory, CategoryInput } from '../api/kb'

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function CategoryForm({
  initial,
  parents,
  onSave,
  onCancel,
  saving,
}: {
  initial?: KbCategory
  parents: KbCategory[]
  onSave: (input: CategoryInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(!!initial)
  const [parentId, setParentId] = useState<string>(initial?.parent_id ?? '')
  const [sortOrder, setSortOrder] = useState<string>(String(initial?.sort_order ?? 0))

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={e => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="Category name"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Slug</label>
          <input
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
            placeholder="category-slug"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent</label>
          <select
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">— None (top level) —</option>
            {parents
              .filter(p => p.id !== initial?.id)
              .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sort order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
        <button
          onClick={() => onSave({
            name: name.trim(),
            slug: slug.trim() || slugify(name),
            parent_id: parentId || null,
            sort_order: Number(sortOrder) || 0,
          })}
          disabled={!name.trim() || saving}
          className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {initial ? 'Save Changes' : 'Add Category'}
        </button>
      </div>
    </div>
  )
}

export default function CategoriesAdminPage() {
  const canManage = useCan('knowledge.category.manage')
  const { data: categories = [], isLoading } = useCategories()
  const createCat = useCreateCategory()
  const updateCat = useUpdateCategory()
  const deleteCat = useDeleteCategory()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<KbCategory | null>(null)

  if (!canManage) {
    return (
      <div>
        <TopBar title="Categories" subtitle="Knowledge Hub" />
        <div className="p-6 animate-fade-up">
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="lock" size={24} className="text-white/60 mx-auto mb-2" />
            <p className="text-sm text-white/60">You do not have permission to manage categories.</p>
          </div>
        </div>
      </div>
    )
  }

  function handleCreate(input: CategoryInput) {
    createCat.mutate(input, {
      onSuccess: () => { toast.success('Category added'); setCreating(false) },
      onError: (e: unknown) => toast.error('Failed', e instanceof Error ? e.message : undefined),
    })
  }

  function handleUpdate(id: string, input: CategoryInput) {
    updateCat.mutate({ id, input }, {
      onSuccess: () => { toast.success('Category updated'); setEditing(null) },
      onError: (e: unknown) => toast.error('Failed', e instanceof Error ? e.message : undefined),
    })
  }

  function handleDelete(cat: KbCategory) {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    deleteCat.mutate(cat.id, {
      onSuccess: () => toast.success('Category deleted'),
      onError: (e: unknown) => toast.error('Failed', e instanceof Error ? e.message : undefined),
    })
  }

  const nameById = new Map(categories.map(c => [c.id, c.name]))

  return (
    <div>
      <TopBar title="Categories" subtitle="Organize Knowledge Hub articles" />

      <div className="p-6 space-y-5 animate-fade-up max-w-3xl">
        <div className="flex justify-end">
          {!creating && !editing && (
            <button
              onClick={() => { setCreating(true); setEditing(null) }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
            >
              <Sym name="add" size={13} /> New Category
            </button>
          )}
        </div>

        {creating && (
          <CategoryForm
            parents={categories}
            onSave={handleCreate}
            onCancel={() => setCreating(false)}
            saving={createCat.isPending}
          />
        )}
        {editing && (
          <CategoryForm
            initial={editing}
            parents={categories}
            onSave={input => handleUpdate(editing.id, input)}
            onCancel={() => setEditing(null)}
            saving={updateCat.isPending}
          />
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : categories.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="category" size={24} className="text-white/60 mx-auto mb-2" />
            <p className="text-sm text-white/60">No categories yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-hidden divide-y divide-border">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <Sym name="folder" size={14} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-950">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {c.slug}
                    {c.parent_id ? ` · under ${nameById.get(c.parent_id) ?? 'unknown'}` : ''}
                    {` · order ${c.sort_order ?? 0}`}
                  </p>
                </div>
                <button
                  onClick={() => { setEditing(c); setCreating(false) }}
                  className="text-xs text-brand-600 hover:text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="text-xs text-red-600 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
