import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sym } from '@/components/shared/Sym'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import {
  useInitiateTransfer,
  useRespondTransfer,
  useCancelTransfer,
  useIncomingTransfers,
  useProjectPendingTransfer,
} from '@/hooks/useProjectTransfers'

function useActiveStaff() {
  return useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, name, role').eq('is_active', true).order('name')
      if (error) throw error
      return data
    },
  })
}

// ── Transfer button + modal (shown on a project) ────────────────────────────────
export function TransferProjectButton({
  projectId, assignedTo, canTransfer,
}: { projectId: string; assignedTo: string | null; canTransfer: boolean }) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [toUser, setToUser] = useState('')
  const [reason, setReason] = useState('')
  const { data: staff = [] } = useActiveStaff()
  const { data: pending } = useProjectPendingTransfer(projectId)
  const initiate = useInitiateTransfer()
  const cancel = useCancelTransfer()
  const isAdmin = profile?.role === 'super_admin'

  // Pending badge takes priority over the transfer action.
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border bg-amber-50 border-amber-200 text-amber-700">
        <Sym name="schedule" size={11} />
        Transfer pending → {(pending as any).to_profile?.name ?? 'user'}
        {(pending.initiated_by === profile?.id || isAdmin) && (
          <button
            onClick={async () => {
              try { await cancel.mutateAsync(pending.id); toast.success('Transfer cancelled') }
              catch (e: any) { toast.error('Could not cancel', e.message) }
            }}
            className="ml-1 hover:text-red-600 underline"
          >cancel</button>
        )}
      </span>
    )
  }

  if (!canTransfer) return null

  const submit = async () => {
    if (!toUser) { toast.error('Pick someone to transfer to'); return }
    try {
      const result = await initiate.mutateAsync({ projectId, toUser, reason })
      toast.success(result === 'forced' ? 'Project reassigned' : 'Transfer request sent — awaiting acceptance')
      setOpen(false); setToUser(''); setReason('')
    } catch (e: any) {
      toast.error('Transfer failed', e.message)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-white/20 text-white rounded-lg hover:bg-white/10"
      >
        <Sym name="swap_horiz" size={12} />
        Transfer
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-brand-950">Transfer Project</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Transfer to *</label>
                <select value={toUser} onChange={e => setToUser(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20">
                  <option value="">Select staff…</option>
                  {staff.filter(s => s.id !== assignedTo).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-950 mb-1">Reason</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                  placeholder="e.g. Going on leave" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isAdmin
                  ? 'As admin, this reassigns the project immediately (no acceptance needed).'
                  : 'The recipient must accept before the project moves to them.'}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} disabled={initiate.isPending}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1.5">
                {initiate.isPending && <Sym name="progress_activity" size={13} className="animate-spin" />}
                {isAdmin ? 'Reassign' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Incoming transfer requests panel (shown on dashboard) ───────────────────────
export function IncomingTransfers() {
  const { data: transfers = [] } = useIncomingTransfers()
  const respond = useRespondTransfer()

  if (transfers.length === 0) return null

  const act = async (transferId: string, accept: boolean) => {
    try {
      await respond.mutateAsync({ transferId, accept })
      toast.success(accept ? 'Transfer accepted — project is now yours' : 'Transfer rejected')
    } catch (e: any) {
      toast.error('Could not respond', e.message)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
        <Sym name="swap_horiz" size={14} className="text-amber-600" />
        <h3 className="font-display font-semibold text-amber-800 text-sm">
          Incoming Transfer Requests ({transfers.length})
        </h3>
      </div>
      <div className="divide-y divide-border">
        {transfers.map((t: any) => (
          <div key={t.id} className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-950">
                <span className="font-mono text-xs text-muted-foreground">{t.projects?.project_code}</span>
                {' · '}{t.projects?.project_name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                From {t.from_profile?.name ?? 'unassigned'} · requested by {t.initiator?.name}
                {t.reason ? ` — “${t.reason}”` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => act(t.id, true)} disabled={respond.isPending}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <Sym name="check" size={12} /> Accept
              </button>
              <button onClick={() => act(t.id, false)} disabled={respond.isPending}
                className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
