// HRMS — Assets (M8) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchAssets, createAsset, updateAsset, setAssetStatus, deleteAsset,
  fetchAllocations, fetchMyAssets, issueAsset, returnAsset,
  type AssetInput, type AssetStatus,
} from '../api/assets'

const KEY = ['hrms', 'assets']

export function useAssets() {
  return useQuery({ queryKey: KEY, queryFn: fetchAssets })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AssetInput) => createAsset(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Asset added') },
    onError: (e: any) => toast.error(e.message ?? 'Failed to add asset'),
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetInput> }) => updateAsset(id, input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Asset updated') },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update asset'),
  })
}

export function useSetAssetStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AssetStatus }) => setAssetStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) => toast.error(e.message ?? 'Failed to update status'),
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Asset deleted') },
    onError: (e: any) => toast.error(e.message ?? 'Failed to delete asset'),
  })
}

export function useAllocations(assetId: string) {
  return useQuery({ queryKey: [...KEY, 'alloc', assetId], queryFn: () => fetchAllocations(assetId), enabled: !!assetId })
}

export function useMyAssets(employeeId: string) {
  return useQuery({ queryKey: [...KEY, 'mine', employeeId], queryFn: () => fetchMyAssets(employeeId), enabled: !!employeeId })
}

export function useIssueAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { asset_id: string; employee_id: string; condition_out: string | null }) => issueAsset(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Asset issued') },
    onError: (e: any) => toast.error(e.message ?? 'Failed to issue asset'),
  })
}

export function useReturnAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { allocation_id: string; asset_id: string; condition_in: string | null }) => returnAsset(input),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); toast.success('Asset returned') },
    onError: (e: any) => toast.error(e.message ?? 'Failed to return asset'),
  })
}
