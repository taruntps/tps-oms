// HRMS — employee master React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchEmployees,
  fetchEmployee,
  fetchEmployeeDetails,
  fetchActiveProfiles,
  updateEmployeeProfile,
  upsertEmployeeDetails,
  createEmployee,
  type EmployeeProfileInput,
  type EmployeeDetailsInput,
  type EmployeeCreateInput,
} from '../api/employees'

const EMPLOYEES_KEY = ['hrms', 'employees']
const ACTIVE_PROFILES_KEY = ['hrms', 'active_profiles']

export function useEmployees() {
  return useQuery({ queryKey: EMPLOYEES_KEY, queryFn: fetchEmployees })
}

export function useActiveProfiles() {
  return useQuery({ queryKey: ACTIVE_PROFILES_KEY, queryFn: fetchActiveProfiles, staleTime: 5 * 60_000 })
}

export function useEmployee(id: string) {
  return useQuery({ queryKey: [...EMPLOYEES_KEY, id], queryFn: () => fetchEmployee(id), enabled: !!id })
}

export function useEmployeeDetails(id: string) {
  return useQuery({
    queryKey: [...EMPLOYEES_KEY, id, 'details'],
    queryFn: () => fetchEmployeeDetails(id),
    enabled: !!id,
  })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { create: EmployeeCreateInput; details: EmployeeDetailsInput }) => {
      const id = await createEmployee(args.create)
      if (Object.keys(args.details).length) await upsertEmployeeDetails(id, args.details)
      return id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EMPLOYEES_KEY })
      toast.success('Employee created')
    },
    onError: (e: Error) => toast.error('Failed to create employee', e.message),
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; profile: EmployeeProfileInput; details: EmployeeDetailsInput }) => {
      await updateEmployeeProfile(args.id, args.profile)
      await upsertEmployeeDetails(args.id, args.details)
      return args.id
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: EMPLOYEES_KEY })
      qc.invalidateQueries({ queryKey: [...EMPLOYEES_KEY, id] })
      qc.invalidateQueries({ queryKey: [...EMPLOYEES_KEY, id, 'details'] })
      toast.success('Employee updated')
    },
    onError: (e: Error) => toast.error('Failed to update employee', e.message),
  })
}
