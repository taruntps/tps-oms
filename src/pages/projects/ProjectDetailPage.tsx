import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Sym }             from '@/components/shared/Sym'
import { TopBar }          from '@/components/layout/TopBar'
import { RoleGuard }       from '@/components/shared/ProtectedRoute'
import { ClockBadge }      from '@/components/shared/ClockBadge'
import { StagesTab }       from './tabs/StagesTab'
import { PaymentsTab }     from './tabs/PaymentsTab'
import { QueriesTab }      from './tabs/QueriesTab'
import { SoiTab }          from './tabs/SoiTab'
import { DriveTab }        from '@/components/shared/DriveTab'
import { BlockRequestForm } from './BlockRequestForm'
import { TransferProjectButton } from './ProjectTransfer'
import { EditProjectModal } from './EditProjectModal'
import {
  useProject, useUpdateProject, useApproveBlockRequest,
  useUnblockProject, usePendingBlockRequests, useDeleteProject,
} from '@/hooks/useProjects'
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
  const { profile } = useAuth()
  const { data: project, isLoading } = useProject(id!)
  const updateProject  = useUpdateProject()
  const approveBlock   = useApproveBlockRequest()
  const unblock        = useUnblockProject()
  const deleteProject  = useDeleteProject()
  const { data: pendingRequests = [] } = usePendingBlockRequests()

  const [showBlockForm,   setShowBlockForm]   = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showAppRefEdit,  setShowAppRefEdit]  = useState(false)
  const [cancelReason,    setCancelReason]    = useState('')
  const [appRefDraft,     setAppRefDraft]     = useState('')
  const [searchParams] = useSearchParams()
  const [activeTab,       setActiveTab]       = useState<TabKey>((searchParams.get('tab') as TabKey) || 'overview')

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

  const myPendingRequest = pendingRequests.find(r => r.project_id === id)
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

  // ── Delete project (admin, permanent) ────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`Permanently DELETE project ${project.project_code} "${project.project_name}"? This removes all its stages, payments, documents and queries and cannot be undone. (To keep the record, use Cancel Project instead.)`)) return
    try {
      await deleteProject.mutateAsync(id!)
      toast.success('Project deleted')
      navigate('/projects')
    } catch (err: any) { toast.error('Could not delete', err.message) }
  }

  // ── Cancel project ───────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Reason is mandatory'); return }
    try {
      // Save to cancel_requests table for audit trail (cast as any — new table not in generated types)
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
      setShowCancelModal(false)
      setCancelReason('')
    } catch (err: any) { toast.error('Failed to cancel', err.message) }
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
          <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-sm text-white/70 hover:text-white">
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
            {/* Cancel */}
            {canCancel && !isCancelled && (
              <button onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-400/40 text-red-200 rounded-lg hover:bg-red-500/10">
                <Sym name="cancel" size={12} /> Cancel Project
              </button>
            )}
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
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center justify-between !bg-red-500/15 !border-red-400/30">
            <div className="flex items-center gap-2">
              <Sym name="warning" size={15} className="text-red-300" />
              <div>
                <p className="text-sm font-semibold text-white">Project Blocked</p>
                {project.block_reason && <p className="text-xs text-white/70">{project.block_reason}</p>}
              </div>
            </div>
            <RoleGuard roles={['super_admin','director','manager']}>
              <button onClick={handleUnblock} disabled={unblock.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-400/40 text-red-200 text-xs font-medium rounded-lg hover:bg-red-500/10 disabled:opacity-50">
                <Sym name="refresh" size={11} /> Unblock
              </button>
            </RoleGuard>
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
                <span className="font-mono text-sm text-brand-950 font-medium">{appRefNo}</span>
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

      {/* Cancel Project modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Sym name="cancel" size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="font-display font-semibold text-brand-950">Cancel Project</h2>
                <p className="text-xs text-muted-foreground">{project.project_code} · {project.project_name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">This will mark the project as cancelled. A reason is mandatory for audit trail.</p>
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
              <button onClick={handleCancel} disabled={!cancelReason.trim() || updateProject.isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {updateProject.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
