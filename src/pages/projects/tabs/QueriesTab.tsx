import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useAuthorityQueries, useCreateQueryRound, useSaveRoundResponse, addCalendarDays, type QueryRound } from '@/hooks/useAuthorityQueries'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type QueryType = Database['public']['Enums']['query_type']
const QUERY_TYPES: { value: QueryType; label: string }[] = [
  { value: 'deficiency_letter', label: 'Deficiency Letter' },
  { value: 'additional_info',   label: 'Technical Committee / Info' },
  { value: 'inspection_notice', label: 'Inspection Notice' },
  { value: 'show_cause',        label: 'Show Cause Notice' },
  { value: 'other',             label: 'Other' },
]
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

interface Props { projectId: string; projectCode: string }

export function QueriesTab({ projectId }: Props) {
  const { profile } = useAuth()
  const { data: rounds = [], isLoading } = useAuthorityQueries(projectId)
  const createRound = useCreateQueryRound()
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/70">{rounds.length} query round{rounds.length !== 1 ? 's' : ''} from FSSAI</p>
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
            <Sym name="add" size={14} /> Record Query
          </button>
        </RoleGuard>
      </div>

      {isLoading ? (
        <div className="glass-panel rounded-xl p-8 animate-pulse" />
      ) : rounds.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-10 text-center">
          <Sym name="forum" size={28} className="mx-auto text-white/40 mb-2" />
          <p className="text-sm text-white/60">No queries recorded. When FSSAI raises a deficiency letter, record it here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rounds.map(r => <RoundCard key={r.id} round={r} projectId={projectId} meId={profile?.id ?? ''} />)}
        </div>
      )}

      {adding && <AddRoundModal projectId={projectId} meId={profile?.id ?? ''} createRound={createRound} onClose={() => setAdding(false)} />}
    </div>
  )
}

function RoundCard({ round, projectId, meId }: { round: QueryRound; projectId: string; meId: string }) {
  const save = useSaveRoundResponse()
  const responded = !!(round as any).response_submitted_date
  const due = (round as any).response_due as string | null
  const overdue = !responded && due && due < todayISO()
  const [responding, setResponding] = useState(false)
  const [resp, setResp] = useState<Record<string, string>>(Object.fromEntries(round.points.map(p => [p.id, (p as any).response ?? ''])))
  const [respDate, setRespDate] = useState(todayISO())

  const submit = async () => {
    if (!respDate) { toast.error('Response submitted date is required'); return }
    try {
      await save.mutateAsync({ roundId: round.id, projectId, responses: resp, response_submitted_date: respDate, responded_by: meId })
      toast.success('Response saved'); setResponding(false)
    } catch (e: any) { toast.error('Save failed', e.message) }
  }

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-[#F8FAFC]">
        <span className="font-semibold text-sm text-brand-950">Round {(round as any).round_no ?? '—'}</span>
        <span className="text-xs text-muted-foreground">· {QUERY_TYPES.find(q => q.value === round.query_type)?.label ?? round.query_type}</span>
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Sym name="calendar_today" size={11} /> Received {formatDate(round.received_date)}</span>
        <span className="flex-1" />
        {responded ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Responded {formatDate((round as any).response_submitted_date)}</span>
        ) : (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', overdue ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
            {overdue ? 'Overdue · ' : 'Due '}{due ? formatDate(due) : ''}
          </span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-[10px] text-muted-foreground uppercase tracking-wide bg-white">
          <th className="text-left px-4 py-2 w-12">S.No</th>
          <th className="text-left px-4 py-2">Query</th>
          <th className="text-left px-4 py-2">Response</th>
        </tr></thead>
        <tbody>
          {round.points.length === 0 && <tr><td colSpan={3} className="px-4 py-3 text-xs text-muted-foreground">No points recorded.</td></tr>}
          {round.points.map(p => (
            <tr key={p.id} className="border-t border-border align-top">
              <td className="px-4 py-2.5 font-medium text-brand-950">{(p as any).point_order}</td>
              <td className="px-4 py-2.5 text-brand-950 whitespace-pre-wrap">{(p as any).description}</td>
              <td className="px-4 py-2.5">
                {responding ? (
                  <textarea rows={2} value={resp[p.id] ?? ''} onChange={e => setResp({ ...resp, [p.id]: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Response…" />
                ) : (
                  <span className={cn('whitespace-pre-wrap', (p as any).response ? 'text-brand-950' : 'text-muted-foreground')}>{(p as any).response ?? '— awaiting —'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <RoleGuard roles={['super_admin','director','manager','executive']}>
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-2">
          {!responding && !responded && (
            <button onClick={() => setResponding(true)} className="text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700">Add Response</button>
          )}
          {!responding && responded && (
            <button onClick={() => setResponding(true)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-[#F8FAFC]">Edit Response</button>
          )}
          {responding && (
            <>
              <label className="text-xs text-muted-foreground">Response submitted date
                <input type="date" value={respDate} onChange={e => setRespDate(e.target.value)} className="ml-2 px-2 py-1 text-xs border border-border rounded-lg" />
              </label>
              <button onClick={submit} disabled={save.isPending} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">Save Response</button>
              <button onClick={() => setResponding(false)} className="text-xs px-3 py-1.5 border border-border rounded-lg">Cancel</button>
            </>
          )}
        </div>
      </RoleGuard>
    </div>
  )
}

function AddRoundModal({ projectId, meId, createRound, onClose }: {
  projectId: string; meId: string; createRound: ReturnType<typeof useCreateQueryRound>; onClose: () => void
}) {
  const [receivedDate, setReceivedDate] = useState('')   // intentionally blank — must be ASKED (not today)
  const [queryType, setQueryType] = useState<QueryType>('deficiency_letter')
  const [points, setPoints] = useState<string[]>([''])
  const ic = 'w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20'

  const save = async () => {
    if (!receivedDate) { toast.error('Enter the date FSSAI raised the query', 'Use the actual FSSAI date, not today.'); return }
    const pts = points.filter(p => p.trim())
    if (pts.length === 0) { toast.error('Add at least one query point'); return }
    try {
      await createRound.mutateAsync({ projectId, received_date: receivedDate, query_type: queryType, subject: '', points: pts, created_by: meId })
      toast.success('Query round recorded'); onClose()
    } catch (e: any) { toast.error('Could not save', e.message) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 className="font-display font-semibold text-brand-950">Record Query (Deficiency Letter)</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Date received from FSSAI *</label>
            <input type="date" className={ic} value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
            {receivedDate && <p className="text-[11px] text-muted-foreground mt-1">Response due {formatDate(addCalendarDays(receivedDate, 30))} (30 days)</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Query Type</label>
            <select className={ic} value={queryType} onChange={e => setQueryType(e.target.value as QueryType)}>
              {QUERY_TYPES.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-brand-950 mb-1">Query points (S.No)</label>
          <div className="space-y-2">
            {points.map((p, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-6 h-9 flex items-center justify-center text-xs font-medium text-muted-foreground">{i + 1}</span>
                <textarea rows={2} className={ic} value={p} onChange={e => setPoints(points.map((x, j) => j === i ? e.target.value : x))} placeholder={`Query point ${i + 1}…`} />
                {points.length > 1 && <button onClick={() => setPoints(points.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600 mt-2"><Sym name="close" size={14} /></button>}
              </div>
            ))}
          </div>
          <button onClick={() => setPoints([...points, ''])} className="mt-2 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"><Sym name="add" size={13} /> Add point</button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg">Cancel</button>
          <button onClick={save} disabled={createRound.isPending} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{createRound.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
