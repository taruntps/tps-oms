// HRMS — org masters + HR policy settings React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchDepartments,
  fetchDesignations,
  fetchGrades,
  fetchEmploymentTypes,
  fetchOfficeLocations,
  upsertMaster,
  deleteMaster,
  fetchPolicySettings,
  upsertPolicySetting,
  type MasterTable,
  type PolicySettingInput,
} from '../api/masters'

const DEPTS_KEY = ['hrms', 'departments']
const DESIGS_KEY = ['hrms', 'designations']
const GRADES_KEY = ['hrms', 'grades']
const EMPTYPES_KEY = ['hrms', 'employment_types']
const BRANCHES_KEY = ['hrms', 'office_locations']
const POLICIES_KEY = ['hrms', 'policy_settings']

const TABLE_KEYS: Record<MasterTable, readonly string[]> = {
  hr_departments: DEPTS_KEY,
  hr_designations: DESIGS_KEY,
  hr_grades: GRADES_KEY,
  hr_employment_types: EMPTYPES_KEY,
}

export function useDepartments() {
  return useQuery({ queryKey: DEPTS_KEY, queryFn: fetchDepartments, staleTime: 5 * 60_000 })
}
export function useDesignations() {
  return useQuery({ queryKey: DESIGS_KEY, queryFn: fetchDesignations, staleTime: 5 * 60_000 })
}
export function useGrades() {
  return useQuery({ queryKey: GRADES_KEY, queryFn: fetchGrades, staleTime: 5 * 60_000 })
}
export function useEmploymentTypes() {
  return useQuery({ queryKey: EMPTYPES_KEY, queryFn: fetchEmploymentTypes, staleTime: 5 * 60_000 })
}
export function useOfficeLocations() {
  return useQuery({ queryKey: BRANCHES_KEY, queryFn: fetchOfficeLocations, staleTime: 10 * 60_000 })
}

export function useUpsertMaster(table: MasterTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Record<string, unknown> & { id?: string }) => upsertMaster(table, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: TABLE_KEYS[table] })
      toast.success(v.id ? 'Updated' : 'Added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

export function useDeactivateMaster(table: MasterTable) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMaster(table, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TABLE_KEYS[table] })
      toast.success('Deactivated')
    },
    onError: (e: Error) => toast.error('Failed', e.message),
  })
}

export function usePolicySettings() {
  return useQuery({ queryKey: POLICIES_KEY, queryFn: fetchPolicySettings })
}

export function useUpsertPolicySetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PolicySettingInput & { id?: string }) => upsertPolicySetting(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: POLICIES_KEY })
      toast.success(v.id ? 'Policy updated' : 'Policy added')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}
