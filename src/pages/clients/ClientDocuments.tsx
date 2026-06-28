import { useState, useRef } from 'react'
import { Sym } from '@/components/shared/Sym'
import {
  useClientDocuments,
  useUploadClientDocument,
  useDeleteClientDocument,
  useClientDocumentUrl,
  CLIENT_DOC_CATEGORIES,
  MAX_DOC_BYTES,
  type ClientDocCategory,
  type ClientDocument,
} from '@/hooks/useClientDocuments'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate } from '@/lib/utils'

const fmtSize = (b?: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

const CATEGORY_LABEL: Record<string, string> =
  Object.fromEntries(CLIENT_DOC_CATEGORIES.map(c => [c.value, c.label]))

interface Props {
  clientId: string
  canEdit: boolean
}

export function ClientDocuments({ clientId, canEdit }: Props) {
  const { profile } = useAuth()
  const { data: docs = [], isLoading } = useClientDocuments(clientId)
  const upload = useUploadClientDocument()
  const del = useDeleteClientDocument()
  const getUrl = useClientDocumentUrl()

  const [category, setCategory] = useState<ClientDocCategory>('gst')
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<{ url: string; doc: ClientDocument } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    try {
      await upload.mutateAsync({ file, clientId, category, uploadedBy: profile?.id })
      toast.success(`${CATEGORY_LABEL[category]} uploaded`)
    } catch (err: any) {
      toast.error('Upload failed', err.message)
    }
  }

  const openViewer = async (doc: ClientDocument) => {
    try {
      setBusyId(doc.id)
      const url = await getUrl(doc.storage_path)
      if (url) setViewing({ url, doc })
    } catch (err: any) {
      toast.error('Could not open document', err.message)
    } finally {
      setBusyId(null)
    }
  }

  const download = async (doc: ClientDocument) => {
    try {
      setBusyId(doc.id)
      const url = await getUrl(doc.storage_path, true)
      if (url) window.open(url, '_blank')
    } catch (err: any) {
      toast.error('Download failed', err.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (doc: ClientDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    try {
      await del.mutateAsync(doc)
      toast.success('Document deleted')
    } catch (err: any) {
      toast.error('Delete failed', err.message)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-white">Documents</h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ClientDocCategory)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            >
              {CLIENT_DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {upload.isPending ? <Sym name="progress_activity" size={13} className="animate-spin" /> : <Sym name="upload" size={13} />}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={onPick}
            />
          </div>
        )}
      </div>

      {canEdit && (
        <p className="text-[11px] text-muted-foreground mb-3">
          PDF, JPG or PNG · max {Math.round(MAX_DOC_BYTES / 1024 / 1024)} MB. Stored encrypted in Supabase Storage
          (<code className="text-[10px]">documents/clients/{clientId}/</code>).
        </p>
      )}

      {isLoading ? (
        <div className="h-20 glass-panel rounded-xl animate-pulse" />
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
          <Sym name="description" size={28} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border divide-y divide-border">
          {docs.map(doc => {
            const isPdf = doc.mime_type === 'application/pdf'
            const iconName = isPdf ? 'description' : 'image'
            const busy = busyId === doc.id
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-brand-100 text-brand-800 shrink-0 w-20 justify-center">
                  {CATEGORY_LABEL[doc.category]?.split(' ')[0] ?? doc.category}
                </span>
                <Sym name={iconName} size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-950 truncate">{doc.file_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtSize(doc.file_size_bytes)}
                    {doc.profiles?.name ? ` · ${doc.profiles.name}` : ''}
                    {` · ${formatDate(doc.created_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openViewer(doc)} disabled={busy} title="View"
                    className="p-1.5 text-muted-foreground hover:text-brand-600 disabled:opacity-40">
                    {busy ? <Sym name="progress_activity" size={14} className="animate-spin" /> : <Sym name="visibility" size={14} />}
                  </button>
                  <button onClick={() => download(doc)} disabled={busy} title="Download"
                    className="p-1.5 text-muted-foreground hover:text-brand-600 disabled:opacity-40">
                    <Sym name="download" size={14} />
                  </button>
                  {canEdit && (
                    <button onClick={() => remove(doc)} title="Delete"
                      className="p-1.5 text-muted-foreground hover:text-red-600">
                      <Sym name="delete" size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Embedded viewer modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setViewing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[88vh] shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <p className="text-sm font-medium text-brand-950 truncate">{viewing.doc.file_name}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => download(viewing.doc)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
                  <Sym name="download" size={12} /> Download
                </button>
                <button onClick={() => setViewing(null)} className="text-muted-foreground hover:text-foreground">
                  <Sym name="close" size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-[#525659] overflow-auto flex items-center justify-center">
              {viewing.doc.mime_type === 'application/pdf' ? (
                <iframe title={viewing.doc.file_name} src={viewing.url} className="w-full h-full border-0" />
              ) : (
                <img src={viewing.url} alt={viewing.doc.file_name} className="max-w-full max-h-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
