import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type Employee = Tables<'profiles'>
export type EmployeeDetails = Tables<'employee_details'>

const LIST_COLS =
  'id, name, email, phone, role, avatar_url, is_active, employee_code, designation, department, hod_email, is_field_staff'

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(LIST_COLS)
        .order('employee_code', { ascending: true, nullsFirst: false })
        .order('name')
      if (error) throw error
      return data as Employee[]
    },
  })
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employees', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select(LIST_COLS).eq('id', id).single()
      if (error) throw error
      return data as Employee
    },
  })
}

// Sensitive HR details — RLS restricts to the employee or HR/admin.
export function useEmployeeDetails(userId: string) {
  return useQuery({
    queryKey: ['employee_details', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_details').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw error
      return data as EmployeeDetails | null
    },
  })
}

export function useUpsertEmployeeDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TablesInsert<'employee_details'>) => {
      const { error } = await supabase
        .from('employee_details')
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['employee_details', v.user_id] }),
  })
}

// Operational profile fields (admin-managed): Emp ID, Position, Dept, HOD email, field-staff.
export function useUpdateEmployeeProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: {
      id: string
      employee_code?: string | null
      designation?: string | null
      department?: string | null
      hod_email?: string | null
      is_field_staff?: boolean
    }) => {
      const { error } = await supabase.from('profiles').update(fields as any).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['employees', v.id] })
    },
  })
}
