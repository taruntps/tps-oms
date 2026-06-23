import { useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Clock, PlayCircle, XCircle, ArrowRightLeft, Send, Inbox } from 'lucide-react'
import { useUpdateStage, useUpdateProject } from '@/hooks/useProjects'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { toast } from '@/components/shared/Toast'
import { cn, formatDateTime } from '@/lib/utils'
import type { Tables } from '@/types/database'
import type { Database } from '@/types/database'

type Stage = Tables<'stages'>
type ClockType = Database['public']['Enums']['clock_type']

interface Props {
  stage: Stage
  projectId: string
  isBlocked: boolean
  activeClock: ClockType
  serviceType?: string
  appRefNo?: string | null
  clientId?: string
  onClockChange: (clock: ClockType, extra?: Record<string, any>) => Promise<void>
}

const STATUS_CONFIG = {
  pending:     { icon: Clock,        cls: 'text-muted-foreground', bg: 'bg-gray-50 border-gray-200' },
  in_progress: { icon: PlayCircle,   cls: 'text-brand-600',        bg: 'bg-brand-50 border-brand-200' },
  completed:   { icon: CheckCircle2, cls: 'text-green-600',        bg: 'bg-green-50 border-green-200' },
  blocked:     { icon: XCircle,      cls: 'text-red-600',          bg: 'bg-red-50 border-red-200' },
  skipped:     { icon: XCircle,      cls: 'text-gray-400',         bg: 'bg-gray-50 border-gray-200' },
}

// Stages that submit to FSSAI (require app_ref_no for licence activities)
const FSSAI_SUBMIT_STAGES  = ['Application Submitted', 'Application Submission', 'Form Submission']
const LICENCE_ISSUED_STAGES = ['License Issued', 'Licence Issued', 'License Issuance']
const CLIENT_PENDING_STAGES = ['Document Collection', 'Client Review', 'Client Confirmation', 'Artwork Review']

// Does this service type require an App Ref No when submitting to FSSAI?
const needsAppRef = (serviceType?: string) =>
  !!serviceType && ['New Application','Modification','Renewal','Form II'].includes(serviceType)

export function StageCard({ stage, projectId, isBlocked, activeClock, serviceType, appRefNo, clientId, onClockChange }: Props) {
  const [open, setOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [showSkipInput, setShowSkipInput] = useState(false)
  const [showLicencePopup, setShowLicencePopup] = useState(false)
  const [showAppRefPopup, setShowAppRefPopup] = useState(false)
  const [licenceNumber, setLicenceNumber] = useState('')
  const [appRefInput, setAppRefInput] = useState(appRefNo ?? '')
  const updateStage   = useUpdateStage()
  const updateProject = useUpdateProject()
  const qc            = useQueryClient()

  const cfg  = STATUS_CONFIG[stage.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending
  const Icon = cfg.icon
  const isDone = stage.status === 'completed' || stage.status === 'skipped'

  // --- Derived action flags ---
  const isFssaiSubmit  = FSSAI_SUBMIT_STAGES.some(s  => stage.stage_name.includes(s))
  const isLicenceIssued= LICENCE_ISSUED_STAGES.some(s => stage.stage_name.includes(s))
  const isClientStage  = CLIENT_PENDING_STAGES.some(s => stage.stage_name.includes(s))

  const changeStatus = async (next: Stage['status'], extra?: Record<string, any>) => {
    try {
      await updateStage.mutateAsync({ id: stage.id, projectId, status: next, ...extra })
      toast.success('Stage updated')
    } catch (err: any) { toast.error('Update failed', err.message) }
  }

  // Move clock to CLIENT and mark stage awaiting_client
  const moveToClient = async () => {
    await changeStatus('in_progress', { awaiting_client_flag: true } as any)
    await onClockChange('client')
  }

  // Received from client → back to employee
  const receivedFromClient = async () => {
    await changeStatus('in_progress', { awaiting_client_flag: false } as any)
    await onClockChange('employee')
  }

  // Submit to FSSAI — check app_ref_no first
  const submitToFSSAI = async (refNo?: string) => {
    const ref = refNo ?? appRefInput
    if (needsAppRef(serviceType) && !ref) {
      setShowAppRefPopup(true)
      return
    }
    await changeStatus('in_progress', { clock_action: 'authority' as any })
    await onClockChange('authority', ref ? { app_ref_no: ref } : {})
    setShowAppRefPopup(false)
  }

  // Received from FSSAI
  const receivedFromFSSAI = async () => {
    await changeStatus('in_progress', { clock_action: 'employee' as any })
    await onClockChange('employee')
  }

  // Mark complete — special handling for Licence Issued
  const markComplete = async () => {
    if (isLicenceIssued) { setShowLicencePopup(true); return }
    await changeStatus('completed', { completed_at: new Date().toISOString() })
  }

  // Confirm licence number, update licence record, mark stage done
  const confirmLicenceNumber = async () => {
    if (!licenceNumber.trim()) { toast.error('Enter licence number'); return }
    try {
      await changeStatus('completed', { completed_at: new Date().toISOString() })
      // Update the licence record for this client project
      if (clientId) {
        await supabase
          .from('licenses')
          .update({ license_number: licenceNumber, status: 'active' } as any)
          .eq('client_id', clientId)
          .is('license_number', null)
      }
      // Also update project status to completed
      await updateProject.mutateAsync({ id: projectId, status: 'completed' })
      qc.invalidateQueries({ queryKey: ['projects', projectId] })
      qc.invalidateQueries({ queryKey: ['licenses', clientId] })
      toast.success('Licence issued!', `Number ${licenceNumber} saved to client record`)
      setShowLicencePopup(false)
    } catch (err: any) { toast.error('Failed', err.message) }
  }

  // Skip with reason
  const submitSkip = async () => {
    if (!skipReason.trim()) { toast.error('Skip reason is required'); return }
    await changeStatus('skipped', { skip_reason: skipReason, skipped_at: new Date().toISOString() })
    setShowSkipInput(false)
    setSkipReason('')
  }

  return (
    <div className={cn('rounded-xl border p-4 transition-all', cfg.bg)}>
      <div className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center text-[11px] font-mono text-muted-foreground shrink-0">
          {stage.stage_order}
        </span>
        <Icon size={15} className={cn(cfg.cls, 'shrink-0')} />
        <span className="flex-1 text-sm font-medium text-brand-950 truncate">{stage.stage_name}</span>

        {/* Clock location badge */}
        {!isDone && (
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border font-medium hidden sm:inline-flex items-center gap-1',
            activeClock === 'employee'  ? 'bg-green-50 text-green-700 border-green-200' :
            activeClock === 'client'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-blue-50 text-blue-700 border-blue-200'
          )}>
            {activeClock === 'employee' ? '🟢' : activeClock === 'client' ? '🟡' : '🔵'}
            {activeClock === 'employee' ? 'Employee' : activeClock === 'client' ? 'With Client' : 'FSSAI'}
          </span>
        )}

        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize',
          stage.status === 'completed'  ? 'bg-green-100 text-green-700 border-green-200' :
          stage.status === 'in_progress'? 'bg-brand-100 text-brand-700 border-brand-200' :
          stage.status === 'blocked'    ? 'bg-red-100 text-red-700 border-red-200' :
          stage.status === 'skipped'    ? 'bg-gray-100 text-gray-400 border-gray-200' :
          'bg-gray-100 text-gray-600 border-gray-200'
        )}>
          {stage.status.replace('_', ' ')}
        </span>

        <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-brand-950">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-white/60 space-y-3">
          {/* Timing rows */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <TimeRow label="Started"   value={stage.started_at} />
            <TimeRow label="Completed" value={stage.completed_at} />
            <TimeRow label="Due"       value={stage.due_date} />
            {stage.stage_code && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Stage Code</p>
                <p className="font-mono text-brand-950">{stage.stage_code}</p>
              </div>
            )}
          </div>

          {(stage as any).skip_reason && (
            <p className="text-xs text-muted-foreground italic">Skipped: {(stage as any).skip_reason}</p>
          )}
          {stage.notes && (
            <p className="text-xs text-muted-foreground italic">{stage.notes}</p>
          )}

          {/* --- Action buttons --- */}
          <RoleGuard roles={['super_admin','director','manager','executive']}>
            {!isDone && !isBlocked && (
              <div className="flex flex-wrap gap-2 pt-1">

                {/* Start stage (pending → in_progress) */}
                {stage.status === 'pending' && (
                  <ActionBtn
                    label="Start"
                    icon={<PlayCircle size={12} />}
                    color="brand"
                    onClick={() => changeStatus('in_progress', { started_at: new Date().toISOString() })}
                    loading={updateStage.isPending}
                  />
                )}

                {stage.status === 'in_progress' && (
                  <>
                    {/* Clock actions based on current clock */}
                    {activeClock === 'employee' && !isClientStage && (
                      <ActionBtn
                        label="Move to Client"
                        icon={<ArrowRightLeft size={12} />}
                        color="amber"
                        onClick={moveToClient}
                        loading={updateStage.isPending}
                      />
                    )}
                    {activeClock === 'employee' && (isFssaiSubmit || !isClientStage) && (
                      <ActionBtn
                        label="Submit to FSSAI"
                        icon={<Send size={12} />}
                        color="blue"
                        onClick={() => submitToFSSAI()}
                        loading={updateStage.isPending}
                      />
                    )}
                    {activeClock === 'client' && (
                      <ActionBtn
                        label="Received from Client"
                        icon={<Inbox size={12} />}
                        color="green"
                        onClick={receivedFromClient}
                        loading={updateStage.isPending}
                      />
                    )}
                    {activeClock === 'authority' && (
                      <ActionBtn
                        label="Received from FSSAI"
                        icon={<Inbox size={12} />}
                        color="green"
                        onClick={receivedFromFSSAI}
                        loading={updateStage.isPending}
                      />
                    )}

                    {/* Mark complete */}
                    {activeClock === 'employee' && (
                      <ActionBtn
                        label={isLicenceIssued ? 'Licence Issued ✓' : 'Mark Complete'}
                        icon={<CheckCircle2 size={12} />}
                        color="green"
                        onClick={markComplete}
                        loading={updateStage.isPending}
                      />
                    )}

                    {/* Skip */}
                    {(stage as any).is_skippable && !showSkipInput && (
                      <ActionBtn label="Skip" icon={<XCircle size={12} />} color="gray"
                        onClick={() => setShowSkipInput(true)} loading={false} />
                    )}
                  </>
                )}

                {stage.status === 'blocked' && (
                  <ActionBtn label="Resume" icon={<PlayCircle size={12} />} color="brand"
                    onClick={() => changeStatus('in_progress')} loading={updateStage.isPending} />
                )}
              </div>
            )}

            {/* Skip reason input */}
            {showSkipInput && (
              <div className="mt-2 space-y-2">
                <input
                  value={skipReason}
                  onChange={e => setSkipReason(e.target.value)}
                  placeholder="Reason for skipping (required)…"
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                />
                <div className="flex gap-2">
                  <button onClick={submitSkip} className="px-3 py-1 bg-gray-600 text-white text-xs rounded-lg hover:bg-gray-700">Confirm Skip</button>
                  <button onClick={() => setShowSkipInput(false)} className="px-3 py-1 border border-border text-xs rounded-lg hover:bg-white">Cancel</button>
                </div>
              </div>
            )}
          </RoleGuard>
        </div>
      )}

      {/* Licence Number popup */}
      {showLicencePopup && (
        <Modal title="🎉 Licence Issued — Enter Licence Number" onClose={() => setShowLicencePopup(false)}>
          <p className="text-xs text-muted-foreground mb-3">Enter the FSSAI licence number. It will be saved to the client's licence record and the licence will be marked Active.</p>
          <input
            value={licenceNumber}
            onChange={e => setLicenceNumber(e.target.value)}
            placeholder="e.g. 11225099000123"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 mb-3"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowLicencePopup(false)} className="px-4 py-2 text-sm border border-border rounded-lg">Cancel</button>
            <button onClick={confirmLicenceNumber} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              Confirm & Complete
            </button>
          </div>
        </Modal>
      )}

      {/* App Ref No popup */}
      {showAppRefPopup && (
        <Modal title="App Ref No. Required" onClose={() => setShowAppRefPopup(false)}>
          <p className="text-xs text-muted-foreground mb-3">Enter the FSSAI Application Reference Number before submitting. This is required for licence activities.</p>
          <input
            value={appRefInput}
            onChange={e => setAppRefInput(e.target.value)}
            placeholder="e.g. 23456789012345"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 mb-3"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAppRefPopup(false)} className="px-4 py-2 text-sm border border-border rounded-lg">Cancel</button>
            <button onClick={() => submitToFSSAI(appRefInput)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Submit to FSSAI
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ActionBtn({ label, icon, color, onClick, loading }: {
  label: string; icon: React.ReactNode; color: 'brand' | 'green' | 'amber' | 'blue' | 'gray'; onClick: () => void; loading: boolean
}) {
  const cls = {
    brand: 'bg-brand-600 text-white hover:bg-brand-700',
    green: 'bg-green-600 text-white hover:bg-green-700',
    amber: 'bg-amber-500 text-white hover:bg-amber-600',
    blue:  'bg-blue-600 text-white hover:bg-blue-700',
    gray:  'bg-gray-500 text-white hover:bg-gray-600',
  }[color]
  return (
    <button
      disabled={loading}
      onClick={onClick}
      className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50', cls)}
    >
      {icon}{label}
    </button>
  )
}

function Modal({ title, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h3 className="font-display font-semibold text-brand-950 text-sm mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function TimeRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-brand-950">{formatDateTime(value)}</p>
    </div>
  )
}
