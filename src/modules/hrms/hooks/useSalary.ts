// HRMS — Payroll (M4): salary master/structures/assignment + statutory config React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchComponents,
  createComponent,
  updateComponent,
  fetchStructures,
  fetchStructureComponents,
  createStructure,
  updateStructure,
  setStructureComponents,
  fetchEmployeeSalaries,
  fetchCurrentSalary,
  fetchSalaryComponents,
  assignSalary,
  fetchRevisions,
  fetchOrganizations,
  type ComponentInput,
  type SalaryStructureInput,
  type StructureComponentInput,
  type AssignSalaryInput,
} from '../api/salaryStructures'
import {
  fetchStatutoryConfigRows,
  amendStatutoryConfig,
  type StatutoryConfigInput,
} from '../api/statutoryConfig'

const SAL = ['hrms', 'salary'] as const

// ── Component master ──────────────────────────────────────────────────────────
export function useComponents() {
  return useQuery({ queryKey: [...SAL, 'components'], queryFn: fetchComponents, staleTime: 60_000 })
}

export function useCreateComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ComponentInput) => createComponent(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SAL, 'components'] })
      toast.success('Component created')
    },
    onError: (e: Error) => toast.error('Create failed', e.message),
  })
}

export function useUpdateComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<ComponentInput> }) => updateComponent(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SAL, 'components'] })
      toast.success('Component updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Structures ────────────────────────────────────────────────────────────────
export function useStructures() {
  return useQuery({ queryKey: [...SAL, 'structures'], queryFn: fetchStructures, staleTime: 60_000 })
}

export function useStructureComponents(structureId?: string) {
  return useQuery({
    queryKey: [...SAL, 'structure-components', structureId],
    enabled: !!structureId,
    queryFn: () => fetchStructureComponents(structureId!),
  })
}

export function useCreateStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SalaryStructureInput) => createStructure(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SAL, 'structures'] })
      toast.success('Structure created')
    },
    onError: (e: Error) => toast.error('Create failed', e.message),
  })
}

export function useUpdateStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<SalaryStructureInput> }) => updateStructure(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SAL, 'structures'] })
      toast.success('Structure updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetStructureComponents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { structureId: string; lines: StructureComponentInput[] }) =>
      setStructureComponents(args.structureId, args.lines),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...SAL, 'structure-components', v.structureId] })
      toast.success('Structure lines saved')
    },
    onError: (e: Error) => toast.error('Save failed', e.message),
  })
}

// ── Employee salary (effective-dated) ─────────────────────────────────────────
export function useEmployeeSalaries(employeeId?: string) {
  return useQuery({
    queryKey: [...SAL, 'employee-salaries', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchEmployeeSalaries(employeeId!),
  })
}

export function useCurrentSalary(employeeId?: string) {
  return useQuery({
    queryKey: [...SAL, 'current-salary', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchCurrentSalary(employeeId!),
  })
}

export function useSalaryComponents(employeeSalaryId?: string) {
  return useQuery({
    queryKey: [...SAL, 'salary-components', employeeSalaryId],
    enabled: !!employeeSalaryId,
    queryFn: () => fetchSalaryComponents(employeeSalaryId!),
  })
}

export function useRevisions(employeeId?: string) {
  return useQuery({
    queryKey: [...SAL, 'revisions', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchRevisions(employeeId!),
  })
}

export function useAssignSalary(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AssignSalaryInput) => assignSalary(input, actorId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...SAL, 'employee-salaries', v.employee_id] })
      qc.invalidateQueries({ queryKey: [...SAL, 'current-salary', v.employee_id] })
      qc.invalidateQueries({ queryKey: [...SAL, 'revisions', v.employee_id] })
      toast.success('Salary assigned (effective-dated)')
    },
    onError: (e: Error) => toast.error('Assignment failed', e.message),
  })
}

// ── Organizations (run scope) ─────────────────────────────────────────────────
export function useOrganizations() {
  return useQuery({ queryKey: ['hrms', 'organizations'], queryFn: fetchOrganizations, staleTime: 5 * 60_000 })
}

// ── Statutory config ──────────────────────────────────────────────────────────
export function useStatutoryConfig() {
  return useQuery({ queryKey: [...SAL, 'statutory'], queryFn: fetchStatutoryConfigRows, staleTime: 60_000 })
}

export function useAmendStatutoryConfig(actorId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StatutoryConfigInput) => amendStatutoryConfig(input, actorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...SAL, 'statutory'] })
      toast.success('Statutory config amended (effective-dated)')
    },
    onError: (e: Error) => toast.error('Amendment failed', e.message),
  })
}
