import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Phone, User, Users, Calendar, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { ClockBadge } from '@/components/shared/ClockBadge'
import { StagesTab }   from './tabs/StagesTab'
import { PaymentsTab } from './tabs/PaymentsTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { QueriesTab }  from './tabs/QueriesTab'
import { SoiTab }      from './tabs/SoiTab'
import { BlockRequestForm } from './BlockRequestForm'
import { useProject, useUpdateProject, useApproveBlockRequest, useUnblockProject, usePendingBlockRequests } from '@/hooks/useProjects'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type ClockType = Database['public']['Enums']['clock_type']

const CLOCK_OPTIONS: { value: ClockType; label: string }[] = [
  { value: 'employee',  label: '🟢 Employee' },
  { value: 'client',    label: '🟡 Client' },
  { value: 'authority', label: '🔵 FSSAI' },
]

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'stages',     label: 'Stages' },
  { key: 'payments',   label: 'Payments' },
  { key: 'documents',  label: 'Documents' },
  { key: 'queries',    label: 'Queries' },
  { key: 'soi',        label: 'SOI Archive' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: project, isLoading } = useProject(id!)
  const updateProject = useUpdateProject()
  const approveBlock  = useApproveBlockRequest()
  const unblock       = useUnblockProject()
  const { data: pendingRequests = [] } = usePendingBlockRequests()
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  if (isLoading) {
    return (
      <div>
        <TopBar title="Project" />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-40 bg-white rounded-xl border border-border" />
          <div className="h-64 bg-white rounded-xl border border-border" />
        </div>
      </div>
    )
  }

  if (!project) return null

  const myPendingRequest = pendingRequests.find(r => r.project_id === id)
  const stages = (project as any).stages ?? []
  const clientId = project.client_id

  const canBlock   = ['executive','manager','director','super_admin'].includes(profile?.role ?? '')
  const canApprove = ['manager','director','super_admin'].includes(profile?.role ?? '')

  const switchClock = async (clock: ClockType) => {
    if (clock === project.active_clock) return
    try {
      await updateProject.mutateAsync({ id: project.id, active_clock: clock, clock_switched_at: new Date().toISOString() })
      toast.success('Clock switched', `Now on ${clock.toUpperCase()} time`)
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const handleApprove = async (requestId: string, approved: boolean) => {
    try {
      await approveBlock.mutateAsync({ requestId, approved, projectId: id! })
      toast.success(approved ? 'Block approved' : 'Request rejected')
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const handleUnblock = async () => {
    try {
      await unblock.mutateAsync(id!)
      toast.success('Unblocked', 'Project back to employee clock.')
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  return (
    <div>
      <TopBar title={project.project_code ?? 'Project'} subtitle={project.project_name} />

      <div className="p-6 animate-fade-up space-y-4">

        {/* Back + edit */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/projects')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-950">
            <ArrowLeft size={14} /> Back to Projects
          </button>
          <RoleGuard roles={['super_admin','director','manager']}>
            <button className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
              <Pencil size={12} /> Edit
            </button>
          </RoleGuard>
        </div>

        {/* Manager block approval card */}
        {canApprove && myPendingRequest && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Block Request Pending Your Approval</p>
              <p className="text-xs text-amber-700 mt-0.5">
                <strong>{(myPendingRequest as any).profiles?.name}</strong> — {myPendingRequest.block_type.replace(/_/g, ' ')}: {myPendingRequest.reason}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(myPendingRequest.id, true)} disabled={approveBlock.isPending}
                className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                Approve Block
              </button>
              <button onClick={() => handleApprove(myPendingRequest.id, false)} disabled={approveBlock.isPending}
                className="px-3 py-1 border border-border text-xs rounded-lg hover:bg-white">
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Blocked banner */}
        {project.is_blocked && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <div>
                <p className="text-sm font-semibold text-red-900">Project Blocked</p>
                {project.block_reason && <p className="text-xs text-red-700">{project.block_reason}</p>}
              </div>
            </div>
            <RoleGuard roles={['super_admin','director','manager']}>
              <button onClick={handleUnblock} disabled={unblock.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-700 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50">
                <RefreshCw size={11} /> Unblock
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
                  project.status === 'active'    ? 'bg-green-100 text-green-700' :
                  project.status === 'on_hold'   ? 'bg-amber-100 text-amber-700' :
                  project.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                )}>{project.status?.replace('_', ' ')}</span>
                {project.service_type && (
                  <span className="text-[10px] bg-[#F8FAFC] border border-border px-2 py-0.5 rounded">{project.service_type}</span>
                )}
              </div>
              <h2 className="text-lg font-display font-bold text-brand-950 mt-1">{project.project_name}</h2>
            </div>
            {project.active_clock && project.clock_switched_at && (
              <ClockBadge clock={project.active_clock} since={project.clock_switched_at} isBlocked={project.is_blocked ?? false} />
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
            <Detail icon={User}      label="Client"     value={(project as any).clients?.company_name} />
            <Detail icon={Phone}     label="Phone"      value={(project as any).clients?.contact_phone} />
            <Detail icon={Users}     label="Executive"  value={(project as any).profiles_assigned?.name} />
            <Detail icon={Users}     label="Manager"    value={(project as any).profiles_manager?.name} />
            <Detail icon={Calendar}  label="Target Date" value={formatDate(project.target_date)} />
            <Detail icon={Clock}     label="Created"    value={formatDate(project.created_at)} />
            {project.quoted_amount > 0 && (
              <Detail icon={CheckCircle} label="Quoted" value={formatRupees(project.quoted_amount)} />
            )}
            {project.paid_amount > 0 && (
              <Detail icon={CheckCircle} label="Paid" value={formatRupees(project.paid_amount)} />
            )}
          </div>

          {project.notes && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">{project.notes}</p>
          )}
        </div>

        {/* Clock control bar */}
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <div className="bg-white rounded-xl border border-border px-5 py-4 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground mr-1">Clock:</span>
            {CLOCK_OPTIONS.map(opt => (
              <button
                key={opt.value}
                disabled={project.is_blocked || updateProject.isPending}
                onClick={() => switchClock(opt.value)}
                className={cn(
                  'px-4 py-1.5 text-sm rounded-lg border font-medium transition-all',
                  project.active_clock === opt.value
                    ? 'bg-brand-600 text-white border-brand-700'
                    : 'bg-white text-muted-foreground border-border hover:border-brand-300',
                  (project.is_blocked || updateProject.isPending) && 'opacity-50 cursor-not-allowed'
                )}
              >{opt.label}</button>
            ))}
            {canBlock && !project.is_blocked && !myPendingRequest && (
              <button onClick={() => setShowBlockForm(true)}
                className="ml-auto px-4 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-medium">
                Request Block
              </button>
            )}
            {myPendingRequest && (
              <span className="ml-auto px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                Block request pending
              </span>
            )}
          </div>
        </RoleGuard>

        {/* Tab bar */}
        <div className="flex gap-0.5 bg-[#F8FAFC] p-1 rounded-xl border border-border overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all',
                activeTab === t.key
                  ? 'bg-white text-brand-950 shadow-sm'
                  : 'text-muted-foreground hover:text-brand-950'
              )}
            >{t.label}</button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="font-display font-semibold text-brand-950 text-sm mb-4">Project Summary</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Stages Total"    value={stages.length} />
              <Stat label="Completed"       value={stages.filter((s: any) => s.status === 'completed').length} />
              <Stat label="In Progress"     value={stages.filter((s: any) => s.status === 'in_progress').length} />
              <Stat label="Payment Status"  value={project.payment_status?.replace('_', ' ') ?? '—'} capitalize />
              <Stat label="Quoted"          value={project.quoted_amount > 0 ? formatRupees(project.quoted_amount) : '—'} />
              <Stat label="Paid"            value={project.paid_amount > 0 ? formatRupees(project.paid_amount) : '—'} />
            </div>
          </div>
        )}
        {activeTab === 'stages'    && <StagesTab   stages={stages} projectId={id!} isBlocked={project.is_blocked ?? false} />}
        {activeTab === 'payments'  && <PaymentsTab  projectId={id!} clientId={clientId} />}
        {activeTab === 'documents' && <DocumentsTab projectId={id!} clientId={clientId} />}
        {activeTab === 'queries'   && <QueriesTab   projectId={id!} />}
        {activeTab === 'soi'       && <SoiTab       projectId={id!} clientId={clientId} />}
      </div>

      {showBlockForm && (
        <BlockRequestForm projectId={id!} projectCode={project.project_code ?? ''} onClose={() => setShowBlockForm(false)} />
      )}
    </div>
  )
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-medium text-brand-950 flex items-center gap-1">
        <Icon size={10} className="text-muted-foreground shrink-0" />
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
