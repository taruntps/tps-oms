import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { TopBar } from '@/components/layout/TopBar'
import { toast } from '@/components/shared/Toast'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useCan } from '@/core/access/useCan'
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  type DocumentTemplate,
  type TemplateInput,
} from '../hooks/useTemplates'

// Serialise the `merge_fields` JSON for the textarea; tolerate arrays/objects.
const mergeFieldsToText = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch { return '' }
}

// Parse the textarea back to JSON; blank → null, invalid → throw for the caller.
const textToMergeFields = (text: string): unknown => {
  const t = text.trim()
  if (!t) return null
  return JSON.parse(t)
}

interface EditorState {
  id: string | null
  name: string
  category: string
  body: string
  mergeFields: string
}

const EMPTY_EDITOR: EditorState = { id: null, name: '', category: '', body: '', mergeFields: '' }

export default function TemplatesPage() {
  const canManage = useCan('documents.template.manage')
  const { profile } = useAuth()
  const { data: templates = [], isLoading } = useTemplates()
  const create = useCreateTemplate()
  const update = useUpdateTemplate()

  const [editor, setEditor] = useState<EditorState | null>(null)

  const openCreate = () => setEditor({ ...EMPTY_EDITOR })
  const openEdit = (t: DocumentTemplate) =>
    setEditor({
      id: t.id,
      name: t.name,
      category: t.category ?? '',
      body: t.body ?? '',
      mergeFields: mergeFieldsToText(t.merge_fields),
    })

  const save = async () => {
    if (!editor) return
    if (!editor.name.trim()) { toast.error('Template name is required'); return }

    let merge_fields: unknown
    try {
      merge_fields = textToMergeFields(editor.mergeFields)
    } catch {
      toast.error('Merge fields must be valid JSON')
      return
    }

    const input: TemplateInput = {
      name: editor.name.trim(),
      category: editor.category.trim() || null,
      body: editor.body || null,
      merge_fields,
    }

    try {
      if (editor.id) {
        await update.mutateAsync({ id: editor.id, input })
        toast.success('Template updated')
      } else {
        await create.mutateAsync({ input, createdBy: profile?.id })
        toast.success('Template created')
      }
      setEditor(null)
    } catch (err: any) {
      toast.error('Save failed', err.message)
    }
  }

  const saving = create.isPending || update.isPending

  if (!canManage) {
    return (
      <div>
        <TopBar title="Templates" />
        <div className="p-6">
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="lock" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">You do not have access to document templates.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title="Templates" subtitle={`${templates.length} template${templates.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up space-y-5">
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 shrink-0"
          >
            <Sym name="add" size={16} />
            New Template
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="description" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No templates yet. Create your first one.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            {templates.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <Sym name="description" size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-950 truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {t.category ? `${t.category} · ` : ''}
                    {`Updated ${formatDate(t.updated_at ?? t.created_at)}`}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(t)}
                  title="Edit"
                  className="p-1.5 text-muted-foreground hover:text-brand-600 shrink-0"
                >
                  <Sym name="edit" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor modal */}
      {editor && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => !saving && setEditor(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <p className="text-sm font-semibold text-brand-950">
                {editor.id ? 'Edit template' : 'New template'}
              </p>
              <button onClick={() => !saving && setEditor(null)} className="text-muted-foreground hover:text-foreground">
                <Sym name="close" size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
                <input
                  value={editor.name}
                  onChange={e => setEditor({ ...editor, name: e.target.value })}
                  placeholder="e.g. FSSAI Renewal Cover Letter"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                <input
                  value={editor.category}
                  onChange={e => setEditor({ ...editor, category: e.target.value })}
                  placeholder="e.g. Letters, Certificates"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
                <textarea
                  value={editor.body}
                  onChange={e => setEditor({ ...editor, body: e.target.value })}
                  rows={8}
                  placeholder="Template body. Use {{merge_field}} placeholders where needed."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Merge fields <span className="font-normal">(JSON — optional)</span>
                </label>
                <textarea
                  value={editor.mergeFields}
                  onChange={e => setEditor({ ...editor, mergeFields: e.target.value })}
                  rows={4}
                  placeholder='e.g. ["client_name", "license_no"]'
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button
                onClick={() => setEditor(null)}
                disabled={saving}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving && <Sym name="progress_activity" size={13} className="animate-spin" />}
                {editor.id ? 'Save changes' : 'Create template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
