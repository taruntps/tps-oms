import { useMemo, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { TopBar } from '@/components/layout/TopBar'
import { toast } from '@/components/shared/Toast'
import { formatDate } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useAllDocuments, useDocumentDownload, type AllDocumentRow } from '../hooks/useAllDocuments'

const fmtSize = (b?: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

// Human labels for the unified `source` column.
const SOURCE_LABEL: Record<string, string> = {
  documents:        'Project',
  client_documents: 'Client',
  stage_documents:  'Stage',
}
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s

export default function DocumentsHubPage() {
  const canView = useCan('documents.doc.view')

  const [search, setSearch]         = useState('')
  const [source, setSource]         = useState('')
  const [entityType, setEntityType] = useState('')
  const [docType, setDocType]       = useState('')
  const [busyId, setBusyId]         = useState<string | null>(null)

  const { data: docs = [], isLoading, isError } = useAllDocuments(
    canView ? { search, source, entityType, docType } : {}
  )
  const download = useDocumentDownload()

  // Filter option lists derived from the current result set (keeps them honest
  // against what the view actually returns for this user under RLS).
  const sources = useMemo(() => [...new Set(docs.map(d => d.source).filter(Boolean))].sort(), [docs])
  const entityTypes = useMemo(
    () => [...new Set(docs.map(d => d.entity_type).filter(Boolean))].sort() as string[],
    [docs]
  )
  const docTypes = useMemo(
    () => [...new Set(docs.map(d => d.doc_type).filter(Boolean))].sort() as string[],
    [docs]
  )

  const onDownload = async (doc: AllDocumentRow) => {
    if (!doc.storage_path) {
      toast.error('No downloadable file', 'This document is not stored in Supabase Storage.')
      return
    }
    try {
      setBusyId(doc.id)
      const url = await download(doc.storage_path, true)
      if (url) window.open(url, '_blank')
    } catch (err: any) {
      toast.error('Download failed', err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!canView) {
    return (
      <div>
        <TopBar title="Documents" />
        <div className="p-6">
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="lock" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">You do not have access to the document library.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title="Documents" subtitle={`${docs.length} document${docs.length === 1 ? '' : 's'}`} />

      <div className="p-6 animate-fade-up space-y-5">
        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Sym name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by file name…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
            />
          </div>

          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          >
            <option value="">All sources</option>
            {sources.map(s => <option key={s} value={s}>{sourceLabel(s)}</option>)}
          </select>

          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          >
            <option value="">All entities</option>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={docType}
            onChange={e => setDocType(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
          >
            <option value="">All types</option>
            {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="h-16 glass-panel rounded-xl" />)}
          </div>
        ) : isError ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="error" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">Could not load documents. Please try again.</p>
          </div>
        ) : docs.length === 0 ? (
          <div className="glass-panel rounded-xl border-dashed !border-white/20 p-12 text-center">
            <Sym name="folder_open" size={34} className="mx-auto text-white/40 mb-3" />
            <p className="text-sm text-white/60">No documents found.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            {docs.map(doc => {
              const busy = busyId === doc.id
              const isPdf = /\.pdf$/i.test(doc.file_name)
              return (
                <div key={`${doc.source}:${doc.id}`} className="flex items-center gap-3 p-3">
                  <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-brand-100 text-brand-800 shrink-0 w-16 justify-center">
                    {sourceLabel(doc.source)}
                  </span>
                  <Sym name={isPdf ? 'description' : 'insert_drive_file'} size={16} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">{doc.file_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {doc.doc_type ? `${doc.doc_type} · ` : ''}
                      {fmtSize(doc.file_size_bytes)}
                      {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                      {` · ${formatDate(doc.created_at)}`}
                      {doc.version && doc.version > 1 ? ` · v${doc.version}` : ''}
                    </p>
                  </div>
                  {doc.storage_path && (
                    <button
                      onClick={() => onDownload(doc)}
                      disabled={busy}
                      title="Download"
                      className="p-1.5 text-muted-foreground hover:text-brand-600 disabled:opacity-40 shrink-0"
                    >
                      {busy
                        ? <Sym name="progress_activity" size={14} className="animate-spin" />
                        : <Sym name="download" size={14} />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
