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
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
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
      await (supabase as any).from(entityTable).update({ drive_folder_id: folderId }).eq('id', entityId)
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

export function useCreateSubfolder(parentFolderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => driveOp('create-folder', { name, parentId: parentFolderId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive-files', parentFolderId] }),
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
