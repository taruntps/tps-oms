import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime: string
  webViewLink: string
}

async function driveOp(action: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('drive-ops', {
    body: { action, ...params },
  })
  if (error) {
    let msg = error.message
    try {
      const body = await (error as any).context?.json?.()
      if (body?.error) msg = body.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function driveDownload(fileId: string, mimeType: string): Promise<{ base64: string; contentType: string }> {
  return driveOp('download', { fileId, mimeType })
}

export function useMainFolderId() {
  return useQuery({
    queryKey: ['app_settings', 'drive_main_folder_id'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'drive_main_folder_id')
        .single()
      if (error) throw error
      return data.value as string
    },
    staleTime: Infinity,
  })
}

export function useDriveFiles(folderId: string | null | undefined) {
  return useQuery({
    queryKey: ['drive-files', folderId],
    queryFn: async () => {
      const d = await driveOp('list-files', { folderId })
      return d.files as DriveFile[]
    },
    enabled: !!folderId,
  })
}

export function useCreateDriveFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name, parentId, entityId, entityTable,
    }: { name: string; parentId: string; entityId: string; entityTable: 'clients' | 'projects' }) => {
      const d = await driveOp('create-folder', { name, parentId })
      const folderId = d.folderId as string
      // Link via narrow RPC (all-staff-except-auditor) — avoids a broad UPDATE grant.
      const { error } = await (supabase as any).rpc('set_entity_drive_folder', {
        p_table: entityTable, p_id: entityId, p_folder_id: folderId,
      })
      if (error) throw error
      return folderId
    },
    onSuccess: (_fid, vars) => {
      qc.invalidateQueries({ queryKey: ['clients', vars.entityId] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['projects', vars.entityId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUnlinkDriveFolder(entityId: string, entityTable: 'clients' | 'projects') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc('set_entity_drive_folder', {
        p_table: entityTable, p_id: entityId, p_folder_id: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients', entityId] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['projects', entityId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useCreateSubfolder(parentFolderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => driveOp('create-folder', { name, parentId: parentFolderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', parentFolderId] }),
  })
}

export function useCreateGDoc(currentFolderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => driveOp('create-gdoc', { name, folderId: currentFolderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', currentFolderId] }),
  })
}

export function useCreateGSheet(currentFolderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => driveOp('create-gsheet', { name, folderId: currentFolderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', currentFolderId] }),
  })
}

export function useTrashDriveItem(currentFolderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => driveOp('trash', { fileId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', currentFolderId] }),
  })
}

export function useUploadDriveFile(folderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const b64 = await fileToBase64(file)
      return driveOp('upload', {
        folderId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        content: b64,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', folderId] }),
  })
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
