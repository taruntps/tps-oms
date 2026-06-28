import { useState, useRef, useEffect } from 'react'
import { Sym } from '@/components/shared/Sym'
import { toast } from '@/components/shared/Toast'
import { cn } from '@/lib/utils'
import {
  useDriveFiles, useCreateDriveFolder, useCreateSubfolder,
  useTrashDriveItem, useUploadDriveFile, useMainFolderId,
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
  if (mimeType === 'application/pdf')                              return { icon: 'picture_as_pdf',   color: 'text-red-500'    }
  if (mimeType.startsWith('image/'))                               return { icon: 'image',            color: 'text-blue-500'   }
  if (mimeType.startsWith('video/'))                               return { icon: 'movie',            color: 'text-purple-500' }
  if (mimeType.startsWith('audio/'))                               return { icon: 'audio_file',       color: 'text-pink-500'   }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))   return { icon: 'table_chart', color: 'text-green-600'  }
  if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return { icon: 'description', color: 'text-blue-600' }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { icon: 'slideshow',   color: 'text-orange-500'}
  if (mimeType.includes('zip') || mimeType.includes('archive'))   return { icon: 'folder_zip',       color: 'text-gray-500'   }
  if (mimeType === 'text/plain')                                   return { icon: 'article',          color: 'text-gray-500'   }
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

export function DriveTab({ folderId: initialFolderId, entityId, entityTable, entityName, parentFolderId, readOnly }: Props) {
  const { data: mainFolderId } = useMainFolderId()

  const [currentId, setCurrentId]   = useState<string | null>(initialFolderId ?? null)
  const [history,   setHistory]     = useState<{ id: string }[]>([])
  const [newFolderPrompt, setNewFolderPrompt] = useState(false)
  const [newFolderName,   setNewFolderName]   = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync currentId when the prop changes (e.g. after folder creation)
  useEffect(() => {
    if (initialFolderId && !currentId) setCurrentId(initialFolderId)
  }, [initialFolderId, currentId])

  const { data: files = [], isLoading, refetch } = useDriveFiles(currentId)
  const createFolder = useCreateDriveFolder()
  const createSub    = useCreateSubfolder(currentId ?? '')
  const trash        = useTrashDriveItem(currentId ?? '')
  const upload       = useUploadDriveFile(currentId ?? '')

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
      setNewFolderName('')
      setNewFolderPrompt(false)
      toast.success('Subfolder created')
    } catch (e: any) { toast.error('Could not create subfolder', e.message) }
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
        <div className="flex items-center gap-1.5">
          <button onClick={() => refetch()} title="Refresh"
            className="p-1.5 text-muted-foreground hover:text-brand-600 rounded">
            <Sym name="refresh" size={14} />
          </button>
          {!readOnly && currentId && (
            <>
              <button onClick={() => setNewFolderPrompt(true)}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC] text-muted-foreground hover:text-brand-950">
                <Sym name="create_new_folder" size={12} /> New Folder
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <Sym name="upload" size={12} />
                {upload.isPending ? 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
          <a href={`https://drive.google.com/drive/folders/${currentId ?? initialFolderId}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-0.5 text-[11px] text-brand-600 hover:text-brand-700 font-medium px-1.5 py-1.5">
            Drive <Sym name="open_in_new" size={11} />
          </a>
        </div>
      </div>

      {/* New folder inline input */}
      {newFolderPrompt && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-brand-50 border border-brand-100 rounded-lg">
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
                  isFolder && 'cursor-pointer'
                )}
                onClick={() => isFolder && handleOpenFolder(f)}
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
                    <a href={f.webViewLink} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 text-brand-600 hover:text-brand-700 rounded hover:bg-brand-50" title="Open in Drive">
                      <Sym name="open_in_new" size={12} />
                    </a>
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
    </div>
  )
}
