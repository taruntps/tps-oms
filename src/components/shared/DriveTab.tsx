import { useState, useRef, useEffect } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import {
  useDriveFiles, useCreateDriveFolder, useCreateSubfolder,
  useTrashDriveItem, useUploadDriveFile, useMainFolderId,
  useCreateGDoc, useCreateGSheet, useUnlinkDriveFolder, driveDownload,
  type DriveFile,
} from '@/hooks/useDrive'

interface Props {
  folderId: string | null | undefined
  entityId: string
  entityTable: 'clients' | 'projects'
  entityName: string
  parentFolderId?: string | null
  readOnly?: boolean
}

function fileIcon(mimeType: string): { icon: string; color: string } {
  if (mimeType === 'application/vnd.google-apps.folder')          return { icon: 'folder',           color: 'text-amber-500'  }
  if (mimeType === 'application/vnd.google-apps.document')        return { icon: 'article',          color: 'text-blue-600'   }
  if (mimeType === 'application/vnd.google-apps.spreadsheet')     return { icon: 'table_chart',      color: 'text-green-600'  }
  if (mimeType === 'application/vnd.google-apps.presentation')    return { icon: 'slideshow',        color: 'text-orange-500' }
  if (mimeType === 'application/pdf')                             return { icon: 'picture_as_pdf',   color: 'text-red-500'    }
  if (mimeType.startsWith('image/'))                              return { icon: 'image',            color: 'text-blue-500'   }
  if (mimeType.startsWith('video/'))                              return { icon: 'movie',            color: 'text-purple-500' }
  if (mimeType.startsWith('audio/'))                              return { icon: 'audio_file',       color: 'text-pink-500'   }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))  return { icon: 'table_chart', color: 'text-green-600' }
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return { icon: 'description', color: 'text-blue-600' }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { icon: 'slideshow', color: 'text-orange-500' }
  if (mimeType.includes('zip') || mimeType.includes('archive'))  return { icon: 'folder_zip',       color: 'text-gray-500'   }
  if (mimeType === 'text/plain')                                  return { icon: 'article',          color: 'text-gray-500'   }
  return { icon: 'insert_drive_file', color: 'text-gray-400' }
}

function fmtSize(bytes?: string): string {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (n < 1024)    return `${n} B`
  if (n < 1048576) return `${Math.round(n / 1024)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── File Viewer Modal ─────────────────────────────────────────────────────────
function FileViewer({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [loading,     setLoading]     = useState(true)
  const [blobUrl,     setBlobUrl]     = useState<string | null>(null)
  const [contentType, setContentType] = useState('')
  const blobRef = useRef<string | null>(null)

  useEffect(() => {
    driveDownload(file.id, file.mimeType)
      .then(({ base64, contentType: ct }) => {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: ct })
        const url = URL.createObjectURL(blob)
        blobRef.current = url
        setBlobUrl(url)
        setContentType(ct)
      })
      .catch(e => { toast.error('Preview failed', e.message); onClose() })
      .finally(() => setLoading(false))

    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current) }
  }, [file.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fi = fileIcon(file.mimeType)

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[#F8FAFC] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sym name={fi.icon} size={16} className={cn('shrink-0', fi.color)} />
            <span className="text-sm font-semibold text-brand-950 truncate max-w-xs">{file.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href={file.webViewLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50">
              <Sym name="open_in_new" size={11} /> Drive
            </a>
            {blobUrl && (
              <a href={blobUrl} download={file.name}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-brand-600 px-2 py-1 rounded hover:bg-[#F0F0F0]">
                <Sym name="download" size={11} /> Save
              </a>
            )}
            <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-[#F0F0F0]">
              <Sym name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-[#F8FAFC]" style={{ minHeight: '55vh' }}>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <Sym name="progress_activity" size={28} className="text-brand-600 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading preview…</p>
            </div>
          ) : blobUrl && contentType.startsWith('image/') ? (
            <div className="flex items-center justify-center h-full p-6 overflow-auto">
              <img src={blobUrl} alt={file.name} className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : blobUrl && (contentType === 'application/pdf' || contentType.startsWith('text/')) ? (
            <iframe src={blobUrl} className="w-full border-0" style={{ height: '70vh' }} title={file.name} />
          ) : blobUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
              <Sym name={fi.icon} size={40} className={fi.color} />
              <p className="text-sm text-brand-950 font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">This file type cannot be previewed in the portal.</p>
              <a href={blobUrl} download={file.name}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">
                <Sym name="download" size={14} /> Download File
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── DriveTab ──────────────────────────────────────────────────────────────────
export function DriveTab({ folderId: initialFolderId, entityId, entityTable, entityName, parentFolderId, readOnly }: Props) {
  const { data: mainFolderId } = useMainFolderId()

  const [currentId,       setCurrentId]       = useState<string | null>(initialFolderId ?? null)
  const [history,         setHistory]         = useState<{ id: string }[]>([])
  const [newFolderPrompt, setNewFolderPrompt] = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')
  const [newDocPrompt,    setNewDocPrompt]    = useState<'doc' | 'sheet' | null>(null)
  const [newDocName,      setNewDocName]      = useState('')
  const [previewFile,     setPreviewFile]     = useState<DriveFile | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialFolderId && !currentId) setCurrentId(initialFolderId)
  }, [initialFolderId, currentId])

  const { data: files = [], isLoading, isError, error, refetch } = useDriveFiles(currentId)
  const createFolder = useCreateDriveFolder()
  const createSub    = useCreateSubfolder(currentId ?? '')
  const createDoc    = useCreateGDoc(currentId ?? '')
  const createSheet  = useCreateGSheet(currentId ?? '')
  const trash        = useTrashDriveItem(currentId ?? '')
  const upload       = useUploadDriveFile(currentId ?? '')
  const unlink       = useUnlinkDriveFolder(entityId, entityTable)

  const handleCreateRootFolder = async () => {
    const parentId = entityTable === 'clients' ? mainFolderId : parentFolderId
    if (!parentId) {
      toast.error(entityTable === 'projects' ? 'Create the client Drive folder first' : 'Main folder not configured')
      return
    }
    try {
      const newId = await createFolder.mutateAsync({ name: entityName, parentId, entityId, entityTable })
      setCurrentId(newId)
      toast.success('Drive folder created')
    } catch (e: any) { toast.error('Could not create folder', e.message) }
  }

  const handleOpenFolder = (file: DriveFile) => {
    if (file.mimeType !== 'application/vnd.google-apps.folder') return
    setHistory(h => [...h, { id: currentId! }])
    setCurrentId(file.id)
  }

  const handleBack = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory(h => h.slice(0, -1))
    setCurrentId(prev.id)
  }

  const handleCreateSubfolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await createSub.mutateAsync(newFolderName.trim())
      setNewFolderName(''); setNewFolderPrompt(false)
      toast.success('Subfolder created')
    } catch (e: any) { toast.error('Could not create subfolder', e.message) }
  }

  const handleCreateGoogleDoc = async () => {
    if (!newDocName.trim() || !newDocPrompt) return
    try {
      if (newDocPrompt === 'doc') await createDoc.mutateAsync(newDocName.trim())
      else                        await createSheet.mutateAsync(newDocName.trim())
      toast.success(`${newDocPrompt === 'doc' ? 'Document' : 'Spreadsheet'} created`)
      setNewDocName(''); setNewDocPrompt(null)
    } catch (e: any) { toast.error('Could not create file', e.message) }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentId) return
    try {
      await upload.mutateAsync({ file })
      toast.success(`${file.name} uploaded`)
    } catch (e: any) { toast.error('Upload failed', e.message) }
    e.target.value = ''
  }

  const handleTrash = async (file: DriveFile) => {
    if (!confirm(`Move "${file.name}" to Drive Trash?`)) return
    try {
      await trash.mutateAsync(file.id)
      toast.success('Moved to Drive Trash')
    } catch (e: any) { toast.error('Could not trash item', e.message) }
  }

  const openNewDocPrompt = (type: 'doc' | 'sheet') => {
    setNewFolderPrompt(false)
    setNewDocPrompt(type)
    setNewDocName('')
  }

  const handleUnlink = async () => {
    if (!confirm('Unlink this Drive folder from the portal? The folder will NOT be deleted from Google Drive. You can then create a new linked folder.')) return
    try {
      await unlink.mutateAsync()
      setCurrentId(null)
      setHistory([])
      toast.success('Drive folder unlinked')
    } catch (e: any) { toast.error('Could not unlink', e.message) }
  }

  // ── No folder yet ──────────────────────────────────────────────
  if (!initialFolderId && !currentId) {
    const canCreate = entityTable === 'projects' ? !!parentFolderId : !!mainFolderId
    return (
      <div className="text-center py-10">
        <Sym name="folder_open" size={36} className="mx-auto text-muted-foreground/30 mb-3" />
        <p className="font-semibold text-sm text-brand-950 mb-1">No Drive folder yet</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
          {entityTable === 'projects' && !parentFolderId
            ? 'Create the client Drive folder first, then come back here.'
            : `Create a Google Drive folder for this ${entityTable === 'clients' ? 'client' : 'project'} to store all documents.`}
        </p>
        {canCreate && !readOnly && (
          <button
            onClick={handleCreateRootFolder}
            disabled={createFolder.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            <Sym name="add" size={14} />
            {createFolder.isPending ? 'Creating…' : 'Create Drive Folder'}
          </button>
        )}
      </div>
    )
  }

  const isAtRoot = history.length === 0

  // Stale folder — deleted from Drive but still linked in DB
  if (isError && isAtRoot) {
    const errMsg = (error as Error)?.message ?? ''
    return (
      <div className="text-center py-10">
        <Sym name="folder_off" size={36} className="mx-auto text-red-400/60 mb-3" />
        <p className="font-semibold text-sm text-brand-950 mb-1">Drive folder not found</p>
        <p className="text-xs text-muted-foreground mb-1 max-w-xs mx-auto">
          The linked folder no longer exists in Google Drive (it may have been renamed or deleted).
        </p>
        {errMsg && <p className="text-[10px] text-red-500 mb-4 font-mono">{errMsg}</p>}
        {!readOnly && (
          <button
            onClick={handleUnlink}
            disabled={unlink.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Sym name="link_off" size={14} />
            {unlink.isPending ? 'Unlinking…' : 'Unlink & Recreate'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!isAtRoot && (
            <button onClick={handleBack}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Sym name="arrow_back" size={12} /> Back
            </button>
          )}
          <Sym name="folder" size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-brand-950">
            {isAtRoot ? entityName : 'Subfolder'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button onClick={() => refetch()} title="Refresh"
            className="p-1.5 text-muted-foreground hover:text-brand-600 rounded">
            <Sym name="refresh" size={14} />
          </button>
          {!readOnly && currentId && (
            <>
              <button onClick={() => { setNewDocPrompt(null); setNewFolderPrompt(true) }}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC] text-muted-foreground hover:text-brand-950">
                <Sym name="create_new_folder" size={12} /> Folder
              </button>
              <button onClick={() => openNewDocPrompt('doc')}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC] text-muted-foreground hover:text-brand-950">
                <Sym name="article" size={12} /> Doc
              </button>
              <button onClick={() => openNewDocPrompt('sheet')}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC] text-muted-foreground hover:text-brand-950">
                <Sym name="table_chart" size={12} /> Sheet
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <Sym name="upload" size={12} />
                {upload.isPending ? 'Uploading…' : 'Upload'}
              </button>
              {isAtRoot && (
                <button onClick={handleUnlink} disabled={unlink.isPending} title="Unlink Drive folder"
                  className="p-1.5 text-muted-foreground/50 hover:text-red-600 rounded hover:bg-red-50 transition-colors">
                  <Sym name="link_off" size={13} />
                </button>
              )}
            </>
          )}
          <a href={`https://drive.google.com/drive/folders/${currentId ?? initialFolderId}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-0.5 text-[11px] text-brand-600 hover:text-brand-700 font-medium px-1.5 py-1.5">
            Drive <Sym name="open_in_new" size={11} />
          </a>
        </div>
      </div>

      {/* New subfolder inline input */}
      {newFolderPrompt && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-brand-50 border border-brand-100 rounded-lg">
          <Sym name="create_new_folder" size={14} className="text-brand-600 shrink-0" />
          <input
            autoFocus
            className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateSubfolder()
              if (e.key === 'Escape') { setNewFolderPrompt(false); setNewFolderName('') }
            }}
          />
          <button onClick={handleCreateSubfolder} disabled={createSub.isPending || !newFolderName.trim()}
            className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {createSub.isPending ? 'Creating…' : 'Create'}
          </button>
          <button onClick={() => { setNewFolderPrompt(false); setNewFolderName('') }}
            className="p-1.5 text-muted-foreground hover:text-brand-950 rounded">
            <Sym name="close" size={13} />
          </button>
        </div>
      )}

      {/* New Google Doc / Sheet inline input */}
      {newDocPrompt && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-brand-50 border border-brand-100 rounded-lg">
          <Sym name={newDocPrompt === 'doc' ? 'article' : 'table_chart'} size={14} className="text-brand-600 shrink-0" />
          <input
            autoFocus
            className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            placeholder={newDocPrompt === 'doc' ? 'Document name' : 'Spreadsheet name'}
            value={newDocName}
            onChange={e => setNewDocName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateGoogleDoc()
              if (e.key === 'Escape') { setNewDocPrompt(null); setNewDocName('') }
            }}
          />
          <button onClick={handleCreateGoogleDoc}
            disabled={(newDocPrompt === 'doc' ? createDoc : createSheet).isPending || !newDocName.trim()}
            className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {(newDocPrompt === 'doc' ? createDoc : createSheet).isPending ? 'Creating…' : 'Create'}
          </button>
          <button onClick={() => { setNewDocPrompt(null); setNewDocName('') }}
            className="p-1.5 text-muted-foreground hover:text-brand-950 rounded">
            <Sym name="close" size={13} />
          </button>
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map(i => <div key={i} className="h-11 bg-[#F8FAFC] rounded-lg" />)}
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-8">
          <Sym name="folder_open" size={24} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">This folder is empty</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {files.map(f => {
            const { icon, color } = fileIcon(f.mimeType)
            const isFolder = f.mimeType === 'application/vnd.google-apps.folder'
            return (
              <div key={f.id}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#F8FAFC] group transition-colors',
                  isFolder ? 'cursor-pointer' : 'cursor-pointer'
                )}
                onClick={() => isFolder ? handleOpenFolder(f) : setPreviewFile(f)}
              >
                <Sym name={icon} size={16} className={cn('shrink-0', color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-brand-950 truncate">{f.name}</p>
                  {(f.size || f.modifiedTime) && (
                    <p className="text-[10px] text-muted-foreground">
                      {fmtSize(f.size)}{f.size && f.modifiedTime ? ' · ' : ''}{fmtDate(f.modifiedTime)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isFolder && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setPreviewFile(f) }}
                        className="p-1.5 text-muted-foreground hover:text-brand-600 rounded hover:bg-brand-50" title="Preview">
                        <Sym name="visibility" size={12} />
                      </button>
                      <a href={f.webViewLink} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 text-brand-600 hover:text-brand-700 rounded hover:bg-brand-50" title="Open in Drive">
                        <Sym name="open_in_new" size={12} />
                      </a>
                    </>
                  )}
                  {!readOnly && (
                    <button onClick={e => { e.stopPropagation(); handleTrash(f) }}
                      disabled={trash.isPending}
                      className="p-1.5 text-muted-foreground hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50" title="Move to Trash">
                      <Sym name="delete" size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* In-portal file viewer */}
      {previewFile && (
        <FileViewer file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  )
}
