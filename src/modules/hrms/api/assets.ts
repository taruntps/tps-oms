// HRMS — Assets (M8): asset register + issue/return allocations.
// Money (cost) is bigint paise. `const db = supabase as any` — tables not in generated types.
import { supabase } from '@/lib/supabase'

const db = supabase as any

export type AssetCategory = 'laptop' | 'desktop' | 'phone' | 'sim' | 'access_card' | 'vehicle' | 'other'
export type AssetStatus = 'in_stock' | 'issued' | 'repair' | 'retired'

export type Asset = {
  id: string
  category: string
  asset_tag: string | null
  description: string | null
  serial_no: string | null
  purchase_date: string | null
  cost: number
  status: AssetStatus
  license_expiry: string | null
  created_at: string
}

export type AssetInput = {
  category: string
  asset_tag: string | null
  description: string | null
  serial_no: string | null
  purchase_date: string | null
  cost: number
  status: AssetStatus
  license_expiry: string | null
}

export type Allocation = {
  id: string
  asset_id: string
  employee_id: string
  issued_on: string
  returned_on: string | null
  condition_out: string | null
  condition_in: string | null
  ack_document_id: string | null
}

export async function fetchAssets(): Promise<Asset[]> {
  const { data, error } = await db.from('hr_assets').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  const { data, error } = await db.from('hr_assets').insert(input).select('*').single()
  if (error) throw error
  return data
}

export async function updateAsset(id: string, input: Partial<AssetInput>): Promise<Asset> {
  const { data, error } = await db.from('hr_assets').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error) throw error
  return data
}

export async function setAssetStatus(id: string, status: AssetStatus): Promise<void> {
  const { error } = await db.from('hr_assets').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await db.from('hr_assets').delete().eq('id', id)
  if (error) throw error
}

export async function fetchAllocations(assetId: string): Promise<Allocation[]> {
  const { data, error } = await db.from('hr_asset_allocations').select('*').eq('asset_id', assetId).order('issued_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Active (not-yet-returned) assets currently assigned to an employee, with the asset joined.
export async function fetchMyAssets(employeeId: string): Promise<(Allocation & { asset: Asset })[]> {
  const { data, error } = await db
    .from('hr_asset_allocations')
    .select('*, asset:hr_assets(*)')
    .eq('employee_id', employeeId)
    .is('returned_on', null)
    .order('issued_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Issue: create an allocation and flip the asset to `issued`.
export async function issueAsset(input: { asset_id: string; employee_id: string; condition_out: string | null }): Promise<void> {
  const { error } = await db.from('hr_asset_allocations').insert({ asset_id: input.asset_id, employee_id: input.employee_id, condition_out: input.condition_out })
  if (error) throw error
  const { error: e2 } = await db.from('hr_assets').update({ status: 'issued', updated_at: new Date().toISOString() }).eq('id', input.asset_id)
  if (e2) throw e2
}

// Return: close the allocation and flip the asset back to `in_stock`.
export async function returnAsset(input: { allocation_id: string; asset_id: string; condition_in: string | null }): Promise<void> {
  const { error } = await db.from('hr_asset_allocations').update({ returned_on: new Date().toISOString().slice(0, 10), condition_in: input.condition_in }).eq('id', input.allocation_id)
  if (error) throw error
  const { error: e2 } = await db.from('hr_assets').update({ status: 'in_stock', updated_at: new Date().toISOString() }).eq('id', input.asset_id)
  if (e2) throw e2
}
