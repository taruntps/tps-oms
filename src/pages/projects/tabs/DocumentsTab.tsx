import { useRef, useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useDocuments, useUploadDocument, useDocumentUrl } from '@/hooks/useDocuments'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate } from '@/lib/utils'
import type { Database } from '@/types/database'

type DocType = Database['public']['Enums']['document_type']

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'client_upload',     label: 'Client Document' },
  { value: 'tps_prepared',      label: 'TPS Prepared' },
  { value: 'authority_issued',  label: 'Authority Issued' },
  { value: 'invoice',           label: 'Invoice' },
  { value: 'soi',               label: 'SOI' },
  { value: 'other',             label: 'Other' },
]

const DOC_TYPE_BADGE: Record<DocType, string> = {
  client_upload:    'bg-blue-50 text-blue-700 border-blue-200',
  tps_prepared:     'bg-brand-50 text-brand-700 border-brand-200',
  authority_issued: 'bg-green-50 text-green-700 border-green-200',
  invoice:          'bg-amber-50 text-amber-700 border-amber-200',
  soi:              'bg-purple-50 text-purple-700 border-purple-200',
  other:            'bg-gray-50 text-gray-600 border-gray-200',
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

interface Props { projectId: string; clientId: string; closed?: boolean }

export function DocumentsTab({ projectId, clientId, closed }: Props) {
  const { profile } = useAuth()
  const { data: documents = [], isLoading } = useDocuments(projectId)
  const upload = useUploadDocument()
  const getUrl = useDocumentUrl()

  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocType>('client_upload')
  const [downloading, setDownloading] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync({ file, projectId, clientId, docType, uploadedBy: profile!.id })
      toast.success('Document uploaded', file.name)
    } catch (err: any) {
      toast.error('Upload failed', err.message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDownload = async (storagePath: string, fileName: string) => {
    setDownloading(storagePath)
    try {
      const url = await getUrl(storagePath)
      if (url) {
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
      } else {
        toast.error('Could not get download link')
      }
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-white/70">{documents.length} document{documents.length !== 1 ? 's' : ''}{closed ? ' · project closed (locked)' : ''}</span>
        {!closed && (
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <div className="flex items-center gap-2">
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocType)}
              className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            >
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="flex items-center gap-1.5 text-sm text-white font-medium hover:text-white/80 disabled:opacity-50"
            >
              {upload.isPending ? <Sym name="upload" size={13} className="animate-bounce" /> : <Sym name="add" size={13} />}
              Upload File
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
          </div>
        </RoleGuard>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-14 glass-panel rounded-xl" />)}</div>
      ) : documents.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
          <Sym name="description" size={28} className="mx-auto text-white/60 mb-2" />
          <p className="text-xs text-white/60">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div key={doc.id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-3">
              <Sym name="description" size={18} className="text-muted-foreground/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-950 truncate">{doc.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${DOC_TYPE_BADGE[doc.doc_type]}`}>
                    {DOC_TYPES.find(d => d.value === doc.doc_type)?.label ?? doc.doc_type}
                  </span>
                  {doc.file_size_bytes && <span className="text-[11px] text-muted-foreground">{formatBytes(doc.file_size_bytes)}</span>}
                  <span className="text-[11px] text-muted-foreground">{formatDate(doc.created_at)}</span>
                  {(doc as any).profiles?.name && <span className="text-[11px] text-muted-foreground">by {(doc as any).profiles.name}</span>}
                </div>
              </div>
              <button
                onClick={() => handleDownload(doc.storage_path, doc.file_name)}
                disabled={downloading === doc.storage_path}
                className="text-muted-foreground hover:text-brand-600 shrink-0 disabled:opacity-50"
                title="Download"
              >
                <Sym name="download" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
