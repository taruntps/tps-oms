import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { clockBucket } from '@/lib/projectClock'

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
          clients(company_name),
          profiles_assigned:profiles!projects_assigned_to_fkey(name),
          stages(active_clock, status, started_at)
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

// ── Pending payments: all projects not yet manually marked as paid ──────────
export function usePendingPayments() {
  return useQuery({
    queryKey: ['pending-payments-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, quoted_amount, paid_amount,
          payment_status, completed_date, target_date,
          clients(company_name, city, state)
        `)
        .neq('payment_status', 'paid')
        .order('completed_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
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
          profiles_manager:profiles!projects_manager_id_fkey(name),
          stages(active_clock, status, started_at)
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
        supabase.from('projects').select('status, active_clock, is_blocked, quoted_amount, paid_amount, payment_status, stages(active_clock, status, started_at)'),
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
      // Clock buckets derived from actual stage state (not the stale project column).
      const activeProj  = projects.filter(p => p.status === 'active')
      const onEmployee  = activeProj.filter(p => clockBucket(p as any) === 'employee').length
      const onClient    = activeProj.filter(p => clockBucket(p as any) === 'client').length
      const onAuthority = activeProj.filter(p => clockBucket(p as any) === 'authority').length

      const totalRevenue   = (paymentsRes.data ?? []).reduce((s, p) => s + p.amount, 0)
      const quotedTotal    = projects.reduce((s, p) => s + (p.quoted_amount ?? 0), 0)
      const paidTotal      = projects.reduce((s, p) => s + (p.paid_amount ?? 0), 0)
      // Only count unpaid/partial projects — exclude payment_status='paid' to match Reports tab logic
      const pendingPayment = projects
        .filter(p => (p as any).payment_status !== 'paid')
        .reduce((s, p) => s + Math.max(0, (p.quoted_amount ?? 0) - (p.paid_amount ?? 0)), 0)

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

// ── Director: overdue active projects (target_date < today) ────────────────
export function useOverdueProjects() {
  return useQuery({
    queryKey: ['overdue-projects'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, project_name, service_type, target_date,
          clients(company_name),
          profiles_assigned:profiles!projects_assigned_to_fkey(name)
        `)
        .eq('status', 'active')
        .not('target_date', 'is', null)
        .lt('target_date', today)
        .order('target_date', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Director: employee workload (active projects per assignee) ──────────────
export function useEmployeeWorkload() {
  return useQuery({
    queryKey: ['employee-workload'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          assigned_to,
          profiles_assigned:profiles!projects_assigned_to_fkey(id, name, role)
        `)
        .eq('status', 'active')
        .not('assigned_to', 'is', null)
      if (error) throw error

      const map: Record<string, { name: string; role: string; count: number }> = {}
      for (const p of data ?? []) {
        const pr = (p as any).profiles_assigned
        if (!pr) continue
        if (!map[pr.id]) map[pr.id] = { name: pr.name, role: pr.role, count: 0 }
        map[pr.id].count++
      }
      return Object.values(map).sort((a, b) => b.count - a.count)
    },
  })
}

// ── Director: on-time delivery rate (completed projects) ────────────────────
export function useOnTimeRate() {
  return useQuery({
    queryKey: ['ontime-rate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('target_date, completed_date')
        .eq('status', 'completed')
        .not('target_date', 'is', null)
        .not('completed_date', 'is', null)
      if (error) throw error
      const rows = data ?? []
      const onTime = rows.filter(p => p.completed_date! <= p.target_date!).length
      return {
        total: rows.length,
        onTime,
        rate: rows.length > 0 ? Math.round((onTime / rows.length) * 100) : null,
      }
    },
  })
}
