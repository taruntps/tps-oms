import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ── Employee: my assigned projects (all statuses) ──────────────────────────
export function useMyProjects() {
  const { profile } = useAuth()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  return useQuery({
    queryKey: ['my-projects', profile?.id, isAdmin],
    enabled: !!profile?.id,
    queryFn: async () => {
      let q = supabase
        .from('projects')
        .select(`
          id, project_code, project_name, service_type, status,
          active_clock, clock_switched_at, is_blocked, target_date,
          clients(company_name)
        `)
        .order('target_date', { ascending: true, nullsFirst: false })

      if (!isAdmin) {
        q = q.eq('assigned_to', profile!.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

// ── Today's attendance punches ──────────────────────────────────────────────
export function useTodayPunches() {
  const { profile } = useAuth()
  const isAdmin = ['super_admin', 'director'].includes(profile?.role ?? '')
  return useQuery({
    queryKey: ['today-punches', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      let q = supabase
        .from('attendance_punches')
        .select(`
          id, punch_time, punch_type, office_name,
          profiles!attendance_punches_user_id_fkey(name, role)
        `)
        .gte('punch_time', `${today}T00:00:00`)
        .lte('punch_time', `${today}T23:59:59`)
        .order('punch_time', { ascending: true }) as any

      if (!isAdmin) {
        q = q.eq('user_id', profile!.id)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as any[]
    },
  })
}

// ── Pending payments (projects with quoted > paid and payment_status != paid) ─
export function usePendingPayments() {
  return useQuery({
    queryKey: ['pending-payments-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, quoted_amount, paid_amount,
          payment_status, completed_date, target_date,
          clients(company_name)
        `)
        .neq('payment_status', 'paid')
        .gt('quoted_amount', 0)
        .order('completed_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []).filter((p: any) => (p.quoted_amount ?? 0) > (p.paid_amount ?? 0))
    },
  })
}

// ── Employee: recent notifications ─────────────────────────────────────────
export function useRecentNotifications() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notifications', 'recent', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data
    },
  })
}

// ── Operations: all active projects with clock summary ──────────────────────
export function useActiveProjects() {
  return useQuery({
    queryKey: ['projects', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, status, active_clock, clock_switched_at,
          is_blocked, target_date, service_type,
          clients(company_name),
          profiles_assigned:profiles!projects_assigned_to_fkey(name),
          profiles_manager:profiles!projects_manager_id_fkey(name)
        `)
        .eq('status', 'active')
        .order('target_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
  })
}

// ── Operations: pending block requests (for manager inbox) ──────────────────
export function useBlockRequestInbox() {
  return useQuery({
    queryKey: ['block-requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('block_requests')
        .select(`
          *,
          projects(project_code, project_name, id),
          profiles!block_requests_requested_by_fkey(name)
        `)
        .is('approved', null)
        .order('requested_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

// ── Director: summary counts ────────────────────────────────────────────────
export function useDirectorStats() {
  return useQuery({
    queryKey: ['director-stats'],
    queryFn: async () => {
      const [projectsRes, paymentsRes, clientsRes, blockRes] = await Promise.all([
        supabase.from('projects').select('status, active_clock, is_blocked, quoted_amount, paid_amount'),
        // Exclude govt-fee payments (Client-paid / TPS-paid) — those are pass-through costs,
        // not consulting revenue. Only count client payments: NEFT, UPI, Cash, Cheque.
        supabase.from('payments').select('amount').not('payment_mode', 'in', '(Client-paid,TPS-paid)'),
        supabase.from('clients').select('id, is_active'),
        supabase.from('block_requests').select('id').is('approved', null),
      ])

      if (projectsRes.error) throw projectsRes.error
      const projects = projectsRes.data ?? []

      const total       = projects.length
      const active      = projects.filter(p => p.status === 'active').length
      const completed   = projects.filter(p => p.status === 'completed').length
      const blocked     = projects.filter(p => p.is_blocked).length
      const onEmployee  = projects.filter(p => p.active_clock === 'employee' && p.status === 'active').length
      const onClient    = projects.filter(p => p.active_clock === 'client'   && p.status === 'active').length
      const onAuthority = projects.filter(p => p.active_clock === 'authority' && p.status === 'active').length

      const totalRevenue   = (paymentsRes.data ?? []).reduce((s, p) => s + p.amount, 0)
      const quotedTotal    = projects.reduce((s, p) => s + (p.quoted_amount ?? 0), 0)
      const paidTotal      = projects.reduce((s, p) => s + (p.paid_amount ?? 0), 0)
      const pendingPayment = quotedTotal - paidTotal

      const activeClients = (clientsRes.data ?? []).filter(c => c.is_active).length
      const pendingBlocks = blockRes.data?.length ?? 0

      return {
        total, active, completed, blocked,
        onEmployee, onClient, onAuthority,
        totalRevenue, quotedTotal, paidTotal, pendingPayment,
        activeClients, pendingBlocks,
      }
    },
  })
}

// ── Director: recent projects pipeline ─────────────────────────────────────
export function useProjectPipeline() {
  return useQuery({
    queryKey: ['project-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, status, service_type,
          quoted_amount, paid_amount, payment_status, created_at, target_date,
          clients(company_name),
          profiles_assigned:profiles!projects_assigned_to_fkey(name)
        `)
        .order('created_at', { ascending: false })
        .limit(15)
      if (error) throw error
      return data
    },
  })
}
