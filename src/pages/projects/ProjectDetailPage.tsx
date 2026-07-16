import { useState, lazy, Suspense } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Sym }             from '@/components/shared/Sym'
import { TopBar }          from '@/components/layout/TopBar'
import { RoleGuard }       from '@/components/shared/ProtectedRoute'
import { ClockBadge }      from '@/components/shared/ClockBadge'
// V2 perf: tabs are lazy-loaded so each becomes its own chunk. This keeps the heavy
// SoiTab (which pulls in the ~400KB `xlsx` library) out of the ProjectDetailPage
// bundle — xlsx now loads only when a user actually opens the SOI Archive tab.
const StagesTab   = lazy(() => import('./tabs/StagesTab').then(m => ({ default: m.StagesTab })))
const PaymentsTab = lazy(() => import('./tabs/PaymentsTab').then(m => ({ default: m.PaymentsTab })))
const QueriesTab  = lazy(() => import('./tabs/QueriesTab').then(m => ({ default: m.QueriesTab })))
const SoiTab      = lazy(() => import('./tabs/SoiTab').then(m => ({ default: m.SoiTab })))
const DriveTab    = lazy(() => import('@/components/shared/DriveTab').then(m => ({ default: m.DriveTab })))
const ActivityTab = lazy(() => import('./tabs/ActivityTab').then(m => ({ default: m.ActivityTab })))
const RemarksTab  = lazy(() => import('./tabs/RemarksTab').then(m => ({ default: m.RemarksTab })))
import { BlockRequestForm } from './BlockRequestForm'
import { TransferProjectButton } from './ProjectTransfer'
import { EditProjectModal } from './EditProjectModal'
import {
  useProject, useUpdateProject, useApproveBlockRequest,
  useUnblockProject, usePendingBlockRequests, useDeleteProject,
  useSubmitBlockRequest, useSubmitCancelRequest,
  usePendingCancelRequests, useApproveCancelRequest,
} from '@/hooks/useProjects'
import { useLicenses, useRevealCredential } from '@/hooks/useLicenses'
import { useAuth }   from '@/contexts/AuthContext'
import { supabase }  from '@/lib/supabase'
import { toast }     from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type ClockType = Database['public']['Enums']['clock_type']

const TABS = [
  { key: 'overview',   label: 'Overview'    },
  { key: 'stages',     label: 'Stages'      },
  { key: 'payments',   label: 'Payments'    },
  { key: 'queries',    label: 'Queries'     },
  { key: 'soi',        label: 'SOI Archive' },
  { key: 'drive',      label: 'Drive'       },
  { key: 'activity',   label: 'Activity'    },
  { key: 'remarks',    label: 'Remarks'     },
] as const
type TabKey = (typeof TABS)[number]['key']

const PROJECT_TYPE_BADGE: Record<string, string> = {
  'New Application': 'bg-blue-50 text-blue-700 border-blue-200',
  'Renewal':         'bg-green-50 text-green-700 border-green-200',
  'Modification':    'bg-amber-50 text-amber-700 border-amber-200',
  'Annual Return':   'bg-purple-50 text-purple-700 border-purple-200',
  'Form II':         'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Artwork':         'bg-pink-50 text-pink-700 border-pink-200',
  'Claim Check':     'bg-teal-50 text-teal-700 border-teal-200',
}
const projectTypeBadge = (t?: string | null) => PROJECT_TYPE_BADGE[t ?? ''] ?? 'bg-gray-50 text-gray-600 border-gray-200'

export default function ProjectDetailPage() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const location    = useLocation()
  const { profile } = useAuth()
  const { data: project, isLoading } = useProject(id!)
  const updateProject  = useUpdateProject()
  const approveBlock   = useApproveBlockRequest()
  const unblock        = useUnblockProject()
  const deleteProject  = useDeleteProject()
  const submitRequest  = useSubmitBlockRequest()
  const submitCancel   = useSubmitCancelRequest()
  const approveCancel  = useApproveCancelRequest()
  const { data: pendingRequests = [] } = usePendingBlockRequests()
  const { data: pendingCancels = [] }  = usePendingCancelRequests()
  // Must be called before any early return to satisfy React Rules of Hooks
  const { data: licenses = [] } = useLicenses(project?.client_id ?? '')

  const [showBlockForm,    setShowBlockForm]    = useState(false)
  const [showEditProject,  setShowEditProject]  = useState(false)
  const [showCancelModal,  setShowCancelModal]  = useState(false)
  const [showUnblockModal, setShowUnblockModal] = useState(false)
  const [showAppRefEdit,   setShowAppRefEdit]   = useState(false)
  const [cancelReason,     setCancelReason]     = useState('')
  const [unblockReason,    setUnblockReason]    = useState('')
  const [appRefDraft,      setAppRefDraft]      = useState('')
  const [searchParams] = useSearchParams()
  const [activeTab,       setActiveTab]       = useState<TabKey>((searchParams.get('tab') as TabKey) || 'overview')

  // Where "Back to Projects" should land — the exact filtered view we came from.
  const backToProjects = () => navigate('/projects' + ((location.state as any)?.fromSearch ?? ''))

  if (isLoading) {
    return (
      <div>
        <TopBar title="Project" />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-40 glass-panel rounded-xl" />
          <div className="h-64 glass-panel rounded-xl" />
        </div>
      </div>
    )
  }
  if (!project) return null

  const myPendingRequest = pendingRequests.find(r => r.project_id === id && ((r as any).request_kind ?? 'block') === 'block')
  const myPendingUnblock = pendingRequests.find(r => r.project_id === id && (r as any).request_kind === 'unblock')
  const myPendingCancel  = (pendingCancels as any[]).find(r => r.project_id === id)
  const stages           = (project as any).stages ?? []
  const clientId         = project.client_id
  // Header clock reflects the CURRENT (first not-done) stage's own clock — per-stage now.
  const currentStage     = [...stages].sort((a: any, b: any) => a.stage_order - b.stage_order)
                             .find((s: any) => !['completed','skipped','not_required'].includes(s.status))
  // Doc Collection stays with the employee until the document list is sent to the client.
  const activeClock      = (((currentStage as any)?.stage_kind === 'doc_collection' && !((currentStage as any)?.meta?.doc_request_sent))
                             ? 'employee'
                             : ((currentStage as any)?.active_clock ?? project.active_clock ?? 'employee')) as ClockType
  const appRefNo         = (project as any).app_ref_no as string | null | undefined
  const executiveName    = (project as any).profiles_assigned?.name as string | undefined
  const fssaiLicense     = licenses.find((l: any) => l.credential_username)
  const execFirstName    = executiveName?.trim().split(/\s+/)[0]

  // Tab visibility by project type. Annual Return / Claim Check / Renewal don't
  // use Documents, Queries or SOI Archive; Form II doesn't use SOI Archive.
  const st = project.service_type ?? ''
  const noExtra = ['Annual Return', 'Claim Check', 'Renewal'].includes(st)
  const visibleTabs = TABS.filter(t => {
    if (noExtra && ['queries', 'soi'].includes(t.key)) return false
    if (t.key === 'soi' && (st === 'Form II' || st === 'Artwork' || noExtra)) return false
    return true
  })
  const effectiveTab = visibleTabs.some(t => t.key === activeTab) ? activeTab : 'overview'

  const canBlock   = ['executive','manager','director','super_admin'].includes(profile?.role ?? '')
  const canApprove = ['manager','director','super_admin'].includes(profile?.role ?? '')
  const canCancel  = ['manager','director','super_admin'].includes(profile?.role ?? '')
  const isAdmin    = profile?.role === 'super_admin' || profile?.role === 'director'
  const isCancelled = project.status === 'cancelled'
  const isCompleted = project.status === 'completed'
  // Transfer: assignee of this project, an Assigner, or admin.
  const canTransfer = profile?.role === 'super_admin'
    || (project as any).assigned_to === profile?.id
    || (profile as any)?.can_assign === true

  // (Per-stage clock is now managed inside StageCard; no project-level clock handler.)

  // ── Block / Unblock ──────────────────────────────────────────────────────
  const handleApprove = async (requestId: string, approved: boolean) => {
    try {
      await approveBlock.mutateAsync({ requestId, approved, projectId: id! })
      toast.success(approved ? 'Block approved' : 'Request rejected')
    } catch (err: any) { toast.error('Failed', err.message) }
  }
  const handleUnblock = async () => {
    try {
      await unblock.mutateAsync(id!)
      toast.success('Unblocked', 'Project back to employee clock.')
    } catch (err: any) { toast.error('Failed', err.message) }
  }
  // Executive raises an unblock request → admin approves via the same inbox.
  const handleRequestUnblock = async () => {
    if (!unblockReason.trim()) { toast.error('Reason is mandatory'); return }
    try {
      await submitRequest.mutateAsync({
        project_id: id!, block_type: (project as any)?.block_type ?? 'other',
        reason: unblockReason.trim(), requested_by: profile!.id,
        request_kind: 'unblock',
      } as any)
      toast.success('Unblock request submitted', 'Manager will review and approve.')
      setShowUnblockModal(false); setUnblockReason('')
    } catch (err: any) { toast.error('Failed to submit', err.message) }
  }

  // ── Delete project (admin, permanent) ────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`Permanently DELETE project ${project.project_code} "${project.project_name}"? This removes all its stages, payments, documents and queries and cannot be undone. (To keep the record, use Cancel Project instead.)`)) return
    try {
      await deleteProject.mutateAsync(id!)
      toast.success('Project deleted')
      backToProjects()
    } catch (err: any) { toast.error('Could not delete', err.message) }
  }

  // ── Cancel project ───────────────────────────────────────────────────────
  // Admins cancel directly; executives raise a request that admins approve.
  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Reason is mandatory'); return }
    try {
      if (canCancel) {
        // Direct cancel (audit trail row is pre-approved, trigger skips admin notify)
        await (supabase as any).from('cancel_requests').insert({
          project_id:    id,
          requested_by:  profile!.id,
          reason:        cancelReason,
          status:        'approved',
          approved_by:   profile!.id,
          approved_at:   new Date().toISOString(),
        })
        await updateProject.mutateAsync({
          id:            project.id,
          status:        'cancelled' as any,
          ...({ cancel_reason: cancelReason, cancelled_at: new Date().toISOString(), cancelled_by: profile!.id } as any),
        })
        toast.success('Project cancelled')
      } else {
        await submitCancel.mutateAsync({ projectId: id!, reason: cancelReason.trim(), requestedBy: profile!.id })
        toast.success('Cancellation request submitted', 'Admin will review and approve.')
      }
      setShowCancelModal(false)
      setCancelReason('')
    } catch (err: any) { toast.error('Failed', err.message) }
  }

  const handleApproveCancel = async (approved: boolean) => {
    if (!myPendingCancel) return
    try {
      await approveCancel.mutateAsync({ requestId: myPendingCancel.id, approved, projectId: id! })
      toast.success(approved ? 'Cancellation approved' : 'Request rejected')
    } catch (err: any) { toast.error('Failed', err.message) }
  }

  // ── Save App Ref No ──────────────────────────────────────────────────────
  const saveAppRef = async () => {
    if (!appRefDraft.trim()) { toast.error('Enter a valid App Ref No.'); return }
    try {
      await updateProject.mutateAsync({ id: project.id, app_ref_no: appRefDraft } as any)
      toast.success('App Ref No. saved')
      setShowAppRefEdit(false)
    } catch (err: any) { toast.error('Failed', err.message) }
  }

  return (
    <div>
      <TopBar title={project.project_code ?? 'Project'} subtitle={project.project_name || (project.service_type ?? undefined)} />
      <div className="p-6 animate-fade-up space-y-4">

        {/* Back + actions row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={backToProjects} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <Sym name="arrow_back" size={14} /> Back to Projects
          </button>
          <div className="flex items-center gap-2">
            {/* Transfer (shows pending badge if a transfer is awaiting acceptance) */}
            {!isCancelled && (
              <TransferProjectButton
                projectId={id!}
                assignedTo={(project as any).assigned_to ?? null}
                canTransfer={canTransfer}
              />
            )}
            {/* Edit */}
            <RoleGuard roles={['super_admin','director','manager']}>
              <button onClick={() => setShowEditProject(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-white/20 text-white rounded-lg hover:bg-white/10">
                <Sym name="edit" size={12} /> Edit
              </button>
            </RoleGuard>
            {/* Cancel — admins direct; executives raise a request */}
            {!isCancelled && !isCompleted && (canCancel ? (
              <button onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-400/40 text-red-200 rounded-lg hover:bg-red-500/10">
                <Sym name="cancel" size={12} /> Cancel Project
              </button>
            ) : profile?.role === 'executive' && !myPendingCancel ? (
              <button onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-400/40 text-red-200 rounded-lg hover:bg-red-500/10">
                <Sym name="cancel" size={12} /> Request Cancellation
              </button>
            ) : null)}
            {/* Delete (admin, permanent) */}
            {isAdmin && (
              <button onClick={handleDelete} disabled={deleteProject.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-500/50 text-red-300 rounded-lg hover:bg-red-600/20 disabled:opacity-50">
                <Sym name="delete" size={12} /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3 !bg-red-500/15 !border-red-400/30">
            <Sym name="cancel" size={15} className="text-red-300 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">Project Cancelled</p>
              {(project as any).cancel_reason && <p className="text-xs text-white/70">{(project as any).cancel_reason}</p>}
            </div>
          </div>
        )}

        {/* Pending cancellation — approval card for admins, status banner for requester */}
        {myPendingCancel && (canApprove ? (
          <div className="glass-panel rounded-xl p-4 flex items-start gap-3 !bg-red-500/15 !border-red-400/30">
            <Sym name="cancel" size={16} className="text-red-300 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Cancellation Request Pending Approval</p>
              <p className="text-xs text-white/70 mt-0.5">
                <strong>{myPendingCancel.profiles?.name}</strong> — {myPendingCancel.reason}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApproveCancel(true)} disabled={approveCancel.isPending}
                className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                Approve Cancellation
              </button>
              <button onClick={() => handleApproveCancel(false)} disabled={approveCancel.isPending}
                className="px-3 py-1 border border-white/20 text-white text-xs rounded-lg hover:bg-white/10">
                Reject
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-xl px-5 py-3 !bg-red-500/15 !border-red-400/30">
            <p className="text-xs text-white/80">⏳ Cancellation request pending admin approval — {myPendingCancel.reason}</p>
          </div>
        ))}

        {/* Pending unblock request — approval card for admins */}
        {myPendingUnblock && (canApprove ? (
          <div className="glass-panel rounded-xl p-4 flex items-start gap-3 !bg-blue-500/15 !border-blue-400/30">
            <Sym name="lock_open" size={16} className="text-blue-300 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Unblock Request Pending Approval</p>
              <p className="text-xs text-white/70 mt-0.5">
                <strong>{(myPendingUnblock as any).profiles?.name}</strong> — {myPendingUnblock.reason}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(myPendingUnblock.id, true)} disabled={approveBlock.isPending}
                className="px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                Approve Unblock
              </button>
              <button onClick={() => handleApprove(myPendingUnblock.id, false)} disabled={approveBlock.isPending}
                className="px-3 py-1 border border-white/20 text-white text-xs rounded-lg hover:bg-white/10">
                Reject
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-panel rounded-xl px-5 py-3 !bg-blue-500/15 !border-blue-400/30">
            <p className="text-xs text-white/80">⏳ Unblock request pending admin approval — {myPendingUnblock.reason}</p>
          </div>
        ))}

        {/* Block approval card */}
        {canApprove && myPendingRequest && (
          <div className="glass-panel rounded-xl p-4 flex items-start gap-3 !bg-amber-500/15 !border-amber-400/30">
            <Sym name="warning" size={16} className="text-warning-amber mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Block Request Pending Approval</p>
              <p className="text-xs text-white/70 mt-0.5">
                <strong>{(myPendingRequest as any).profiles?.name}</strong> —{' '}
                {myPendingRequest.block_type.replace(/_/g, ' ')}: {myPendingRequest.reason}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(myPendingRequest.id, true)} disabled={approveBlock.isPending}
                className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                Approve Block
              </button>
              <button onClick={() => handleApprove(myPendingRequest.id, false)} disabled={approveBlock.isPending}
                className="px-3 py-1 border border-white/20 text-white text-xs rounded-lg hover:bg-white/10">
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Blocked banner */}
        {project.is_blocked && (
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-2 !bg-red-500/15 !border-red-400/30">
            <div className="flex items-center gap-2">
              <Sym name="warning" size={15} className="text-red-300" />
              <div>
                <p className="text-sm font-semibold text-white">Project Blocked — clock stopped ⏸</p>
                {project.block_reason && <p className="text-xs text-white/70">{project.block_reason}</p>}
                {(project as any).block_started_at && (
                  <p className="text-[11px] text-white/55">Blocked since {formatDate((project as any).block_started_at)} — this time is excluded from the project clock</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Executive raises an unblock request */}
              {profile?.role === 'executive' && !myPendingUnblock && (
                <button onClick={() => setShowUnblockModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-green-400/40 text-green-200 text-xs font-medium rounded-lg hover:bg-green-500/10">
                  <Sym name="lock_open" size={11} /> Request Unblock
                </button>
              )}
              <RoleGuard roles={['super_admin','director','manager']}>
                <button onClick={handleUnblock} disabled={unblock.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400/40 text-red-200 text-xs font-medium rounded-lg hover:bg-red-500/10 disabled:opacity-50">
                  <Sym name="refresh" size={11} /> Unblock
                </button>
              </RoleGuard>
            </div>
          </div>
        )}

        {/* Project header card */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{project.project_code}</span>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-medium capitalize',
                  project.status === 'active'     ? 'bg-green-100 text-green-700' :
                  project.status === 'on_hold'    ? 'bg-amber-100 text-amber-700' :
                  project.status === 'completed'  ? 'bg-blue-100 text-blue-700'  :
                  project.status === 'cancelled'  ? 'bg-red-100 text-red-700'    :
                  'bg-gray-100 text-gray-600'
                )}>{project.status?.replace('_', ' ')}</span>
                {project.service_type && (
                  <span className={cn('text-[10px] border px-2 py-0.5 rounded font-medium', projectTypeBadge(project.service_type))}>{project.service_type}</span>
                )}
                {(project as any).clients?.client_code && (
                  <button
                    onClick={() => navigate(`/clients/${project.client_id}`)}
                    className="text-[10px] font-mono text-brand-600 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded hover:bg-brand-100 transition-colors"
                    title="Open client master"
                  >
                    #{(project as any).clients.client_code}
                  </button>
                )}
                {(project as any).awaiting_client_flag && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    🟡 Awaiting Client
                  </span>
                )}
              </div>
              <h2 className="text-lg font-display font-bold text-brand-950 mt-1">
                {project.service_type && (project as any).clients?.company_name
                  ? `${project.service_type} — ${(project as any).clients.company_name}`
                  : project.project_name || project.service_type}
              </h2>
            </div>
            {/* Header badge uses the CURRENT stage's clock (matches the status bar below). */}
            <ClockBadge
              clock={activeClock}
              since={(currentStage as any)?.started_at ?? project.clock_switched_at ?? project.created_at}
              isBlocked={project.is_blocked ?? false}
              personName={executiveName}
              pausedMinutes={(project as any).blocked_minutes_total ?? 0}
              blockStartedAt={(project as any).block_started_at}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
            <Detail icon="call"          label="Phone"      value={(project as any).clients?.contact_phone} />
            <Detail icon="groups"        label="Executive"  value={(project as any).profiles_assigned?.name} />
            <Detail icon="groups"        label="Manager"    value={(project as any).profiles_manager?.name} />
            <Detail icon="calendar_today" label="Target"    value={formatDate(project.target_date)} />
            <Detail icon="schedule"      label="Created"    value={formatDate(project.created_at)} />
            {(() => {
              const c = (project as any).clients
              const loc = [c?.city, c?.state].filter(Boolean).join(', ')
              return loc ? <Detail icon="location_on" label="Location" value={loc} /> : null
            })()}
          </div>

          {/* App Ref No field — only for types that file with FSSAI */}
          {['New Application','Renewal','Modification','Form II'].includes(project.service_type ?? '') && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Sym name="tag" size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">App Ref No.</span>
              {appRefNo ? (
                <span
                  onClick={() => { navigator.clipboard.writeText(appRefNo); toast.success('Copied!', appRefNo) }}
                  onDoubleClick={() => window.open('https://foscos.fssai.gov.in/view-application', '_blank')}
                  className="font-mono text-sm text-brand-950 font-medium cursor-pointer hover:text-brand-600 select-none"
                  title="Click to copy · Double-click to open FSSAI"
                >{appRefNo}</span>
              ) : (
                <span className="text-xs text-muted-foreground/60 italic">Not set</span>
              )}
            </div>
            <RoleGuard roles={['super_admin','director','manager','executive']}>
              {!showAppRefEdit ? (
                <button onClick={() => { setAppRefDraft(appRefNo ?? ''); setShowAppRefEdit(true) }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                  {appRefNo ? 'Edit' : '+ Add'}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={appRefDraft}
                    onChange={e => setAppRefDraft(e.target.value)}
                    placeholder="FSSAI App Ref / Login ID"
                    className="px-2 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 w-44"
                  />
                  <button onClick={saveAppRef} className="px-2 py-1 bg-brand-600 text-white text-xs rounded-lg">Save</button>
                  <button onClick={() => setShowAppRefEdit(false)} className="text-xs text-muted-foreground hover:text-brand-950">✕</button>
                </div>
              )}
            </RoleGuard>
          </div>
          )}

          {/* FSSAI Portal Password — from client's license credentials */}
          {fssaiLicense && (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <Sym name="lock" size={12} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">FSSAI Password</span>
                <span className="text-[11px] text-muted-foreground/60">({fssaiLicense.credential_username})</span>
              </div>
              <FssaiReveal licenseId={fssaiLicense.id} />
            </div>
          )}

          {project.notes && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">{project.notes}</p>
          )}
        </div>

        {/* Current clock status bar — info only, changed by stage actions */}
        <div className={cn(
          'glass-panel rounded-xl px-5 py-3 flex items-center justify-between flex-wrap gap-3',
          isCompleted                 ? '!bg-green-500/15 !border-green-400/30' :
          isCancelled                 ? '!bg-red-500/15 !border-red-400/30' :
          activeClock === 'employee'  ? '!bg-green-500/15 !border-green-400/30' :
          activeClock === 'client'    ? '!bg-amber-500/15 !border-amber-400/30' :
          '!bg-blue-500/15 !border-blue-400/30'
        )}>
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {isCompleted ? '✅' : isCancelled ? '⛔' : activeClock === 'employee' ? '🟢' : activeClock === 'client' ? '🟡' : '🔵'}
            </span>
            <div>
              <p className="text-xs font-semibold text-white">
                {isCompleted ? 'Project completed — all stages done' :
                 isCancelled ? 'Project cancelled' :
                 activeClock === 'employee' ? `Currently with ${execFirstName ?? 'Employee'}` :
                 activeClock === 'client'   ? 'Currently with Client' : 'Currently with FSSAI Authority'}
              </p>
              {!isCompleted && !isCancelled && (
                <p className="text-[11px] text-white/70">Clock changes via stage action buttons in the Stages tab</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canBlock && !project.is_blocked && !myPendingRequest && !isCancelled && !isCompleted && (
              <button onClick={() => setShowBlockForm(true)}
                className="px-3 py-1.5 text-xs rounded-lg border border-amber-400/40 text-amber-200 hover:bg-amber-500/10 font-medium">
                Request Block
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 bg-white/10 p-1 rounded-xl border border-white/15 overflow-x-auto">
          {visibleTabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all',
                activeTab === t.key ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
              )}
            >{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        <Suspense fallback={<div className="bg-white rounded-xl border border-border p-8 text-center text-sm text-brand-400">Loading…</div>}>
        {effectiveTab === 'overview' && (
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="font-display font-semibold text-brand-950 text-sm mb-4">Project Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Stages Total"   value={stages.length} />
              <Stat label="Completed"      value={stages.filter((s: any) => s.status === 'completed').length} />
              <Stat label="In Progress"    value={stages.filter((s: any) => s.status === 'in_progress').length} />
              <Stat label="Payment Status" value={project.payment_status?.replace('_', ' ') ?? '—'} capitalize />
              <Stat label="Paid"           value={project.paid_amount   > 0 ? formatRupees(project.paid_amount)   : '—'} />
            </div>
          </div>
        )}
        {effectiveTab === 'stages' && (
          <StagesTab
            stages={stages}
            projectId={id!}
            isBlocked={project.is_blocked ?? false}
            serviceType={project.service_type ?? undefined}
            appRefNo={appRefNo}
            clientId={clientId}
            assigneeName={executiveName}
          />
        )}
        {/* Once a project is completed/cancelled, only Payments stays editable. */}
        {effectiveTab === 'payments'  && <PaymentsTab  projectId={id!} clientId={clientId} quotedAmount={(project as any).quoted_amount ?? 0} paymentStatus={(project as any).payment_status ?? 'pending'} />}
        {effectiveTab === 'queries'   && <QueriesTab   projectId={id!} projectCode={project.project_code ?? ''} closed={isCompleted || isCancelled} />}
        {effectiveTab === 'soi'       && <SoiTab       projectId={id!} clientId={clientId} clientName={(project as any).clients?.company_name} closed={isCompleted || isCancelled} />}
        {effectiveTab === 'drive' && (
          <DriveTab
            folderId={(project as any).drive_folder_id}
            entityId={id!}
            entityTable="projects"
            entityName={`${project.project_code} - ${project.project_name ?? project.service_type ?? 'Project'}`}
            parentFolderId={(project as any).clients?.drive_folder_id}
            clientId={clientId}
            clientName={`${(project as any).clients?.company_name ?? 'Client'}${(project as any).clients?.client_code ? ` - ${(project as any).clients.client_code}` : ''}`}
          />
        )}
        {effectiveTab === 'activity' && <ActivityTab projectId={id!} />}
        {effectiveTab === 'remarks'  && <RemarksTab  projectId={id!} />}
        </Suspense>
      </div>

      {/* Modals */}
      {showBlockForm && (
        <BlockRequestForm projectId={id!} projectCode={project.project_code ?? ''} onClose={() => setShowBlockForm(false)} />
      )}

      {showEditProject && (
        <EditProjectModal
          project={project}
          stages={stages}
          onClose={() => setShowEditProject(false)}
        />
      )}

      {/* Unblock Request modal (executive) */}
      {showUnblockModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Sym name="lock_open" size={18} className="text-green-600" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-brand-950">Request Unblock</h2>
                <p className="text-xs text-muted-foreground">{project.project_code} · {project.project_name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">Explain why this project can resume — an admin will review and approve. The clock restarts on approval.</p>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason for unblock *</label>
            <textarea
              value={unblockReason}
              onChange={e => setUnblockReason(e.target.value)}
              rows={3}
              placeholder="e.g. Client submitted the pending documents, payment received, etc."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowUnblockModal(false); setUnblockReason('') }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={handleRequestUnblock} disabled={!unblockReason.trim() || submitRequest.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {submitRequest.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Project modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Sym name="cancel" size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-brand-950">{canCancel ? 'Cancel Project' : 'Request Cancellation'}</h2>
                <p className="text-xs text-muted-foreground">{project.project_code} · {project.project_name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {canCancel
                ? 'This will mark the project as cancelled. A reason is mandatory for audit trail.'
                : 'This sends a cancellation request to the admin for approval. A reason is mandatory.'}
            </p>
            <label className="block text-xs font-medium text-brand-950 mb-1">Reason for cancellation *</label>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="e.g. Client withdrew application, business closed, etc."
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowCancelModal(false); setCancelReason('') }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={handleCancel} disabled={!cancelReason.trim() || updateProject.isPending || submitCancel.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {(updateProject.isPending || submitCancel.isPending) ? 'Submitting…' : canCancel ? 'Confirm Cancel' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FssaiReveal({ licenseId }: { licenseId: string }) {
  const [password,     setPassword]     = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const reveal = useRevealCredential()

  const handleReveal = async () => {
    try {
      const pwd = await reveal.mutateAsync({ licenseId, reason: 'Accessed via project detail page' })
      setPassword(pwd)
      setShowPassword(false)
      setTimeout(() => { setPassword(null); setShowPassword(false) }, 30000)
    } catch (err: any) {
      toast.error('Cannot reveal password', err.message)
    }
  }

  if (password) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
          <span className="font-mono text-sm text-amber-900">
            {showPassword ? password : '•'.repeat(password.length)}
          </span>
          <button onClick={() => setShowPassword(v => !v)} className="text-amber-600 hover:text-amber-800">
            <Sym name={showPassword ? 'visibility_off' : 'visibility'} size={12} />
          </button>
        </div>
        <span className="text-[10px] text-amber-600">Auto-hides in 30s</span>
      </div>
    )
  }

  return (
    <button
      onClick={handleReveal}
      disabled={reveal.isPending}
      className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
    >
      {reveal.isPending
        ? <Sym name="progress_activity" size={11} className="animate-spin" />
        : <Sym name="visibility" size={11} />}
      Reveal Password
    </button>
  )
}

function Detail({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-medium text-brand-950 flex items-center gap-1">
        <Sym name={icon} size={10} className="text-muted-foreground shrink-0" />
        {value}
      </p>
    </div>
  )
}

function Stat({ label, value, capitalize }: { label: string; value: string | number; capitalize?: boolean }) {
  return (
    <div className="bg-[#F8FAFC] rounded-lg border border-border px-4 py-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-semibold text-brand-950 mt-0.5', capitalize && 'capitalize')}>{value}</p>
    </div>
  )
}
