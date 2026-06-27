import { useRef } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'
import { useStageDocuments, useUploadStageDocument, useStageDocumentUrl } from '@/hooks/useStageDocuments'

// Versioned attachments for a stage (Artwork revisions, DTM). PDF/JPEG, 6MB.
export function StageAttachments({ stageId, projectId, docType = 'revision', label = 'Versions' }: {
  stageId: string; projectId: string; docType?: string; label?: string
}) {
  const { profile } = useAuth()
  const { data: docs = [] } = useStageDocuments(stageId)
  const upload = useUploadStageDocument()
  const getUrl = useStageDocumentUrl()
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try { await upload.mutateAsync({ file, stageId, projectId, docType, uploadedBy: profile?.id }); toast.success('Uploaded') }
    catch (err: any) { toast.error('Upload failed', err.message) }
    if (fileRef.current) fileRef.current.value = ''
  }
  const open = async (path: string) => {
    try { const url = await getUrl(path); if (url) window.open(url, '_blank') } catch (e: any) { toast.error('Could not open', e.message) }
  }

  return (
    <div className="border-t border-black/5 pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-brand-950 flex items-center gap-1"><Sym name="attach_file" size={12} /> {label}</p>
        <button onClick={() => fileRef.current?.click()} disabled={upload.isPending}
          className="text-[11px] text-brand-600 hover:text-brand-700 flex items-center gap-1 disabled:opacity-50">
          <Sym name="upload" size={12} /> {upload.isPending ? 'Uploading…' : 'Upload version'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={onPick} />
      </div>
      {docs.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No files yet. Upload the artwork/correction (PDF or JPEG, ≤6 MB).</p>
      ) : (
        <div className="space-y-1">
          {docs.map(d => (
            <button key={d.id} onClick={() => open(d.storage_path)}
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-[#F8FAFC] border border-border">
              <span className="text-[10px] font-mono font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-1.5 py-0.5 rounded">V{d.version_no}</span>
              <Sym name={d.mime_type?.includes('pdf') ? 'picture_as_pdf' : 'image'} size={13} className="text-muted-foreground shrink-0" />
              <span className="flex-1 text-xs text-brand-950 truncate">{d.file_name}</span>
              <span className="text-[10px] text-muted-foreground">{formatDate(d.created_at)}</span>
              <Sym name="open_in_new" size={12} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
