import { useState } from 'react'
import { Plus, MessageSquareWarning, CheckCircle2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthorityQueries, useCreateAuthorityQuery, useRespondToQuery } from '@/hooks/useAuthorityQueries'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, cn } from '@/lib/utils'
import type { Database } from '@/types/database'

type QueryType = Database['public']['Enums']['query_type']

const QUERY_TYPES: { value: QueryType; label: string; color: string }[] = [
  { value: 'deficiency_letter',  label: 'Deficiency Letter',  color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'additional_info',    label: 'Additional Info',    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'inspection_notice',  label: 'Inspection Notice',  color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'show_cause',         label: 'Show Cause Notice',  color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'other',              label: 'Other',              color: 'bg-gray-50 text-gray-600 border-gray-200' },
]

const schema = z.object({
  query_type:    z.enum(['deficiency_letter','additional_info','inspection_notice','show_cause','other']),
  subject:       z.string().min(2, 'Subject required'),
  received_date: z.string().min(1, 'Date required'),
  response_due:  z.string().optional(),
  description:   z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props { projectId: string }

export function QueriesTab({ projectId }: Props) {
  const { profile } = useAuth()
  const { data: queries = [], isLoading } = useAuthorityQueries(projectId)
  const createQuery = useCreateAuthorityQuery()
  const respond = useRespondToQuery()
  const [showForm, setShowForm] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [responseNote, setResponseNote] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { query_type: 'deficiency_letter', received_date: new Date().toISOString().split('T')[0] },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createQuery.mutateAsync({
        ...data,
        project_id:   projectId,
        created_by:   profile!.id,
        response_due: data.response_due || null,
        description:  data.description  || null,
      })
      toast.success('Query recorded')
      reset()
      setShowForm(false)
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const submitResponse = async (queryId: string) => {
    if (!responseNote.trim()) return
    try {
      await respond.mutateAsync({ id: queryId, projectId, response_note: responseNote, responded_by: profile!.id })
      toast.success('Response recorded')
      setRespondingId(null)
      setResponseNote('')
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const pending   = queries.filter(q => !q.responded_at)
  const responded = queries.filter(q => !!q.responded_at)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="text-[11px] bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
              {pending.length} pending response{pending.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700">
            <Plus size={13} />
            Record Query
          </button>
        </RoleGuard>
      </div>

      {showForm && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5">
          <h4 className="text-xs font-semibold text-brand-950 mb-4">New Authority Query</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Query Type *" error={errors.query_type?.message}>
              <select {...register('query_type')} className={ic(!!errors.query_type)}>
                {QUERY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Received Date *" error={errors.received_date?.message}>
              <input type="date" {...register('received_date')} className={ic(!!errors.received_date)} />
            </Field>
            <Field label="Subject *" error={errors.subject?.message} className="col-span-2">
              <input {...register('subject')} className={ic(!!errors.subject)} placeholder="Query subject / reference number" />
            </Field>
            <Field label="Response Due" error={errors.response_due?.message}>
              <input type="date" {...register('response_due')} className={ic(false)} />
            </Field>
            <Field label="Description" error={errors.description?.message} className="col-span-2">
              <textarea {...register('description')} rows={2} className={ic(false)} placeholder="Details about the query…" />
            </Field>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}
              className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-border text-sm rounded-lg hover:bg-white">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-border" />)}</div>
      ) : queries.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
          <MessageSquareWarning size={28} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No authority queries recorded.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...pending, ...responded].map(q => {
            const typeInfo = QUERY_TYPES.find(t => t.value === q.query_type)
            const isOverdue = !q.responded_at && q.response_due && new Date(q.response_due) < new Date()
            return (
              <div key={q.id} className={cn('bg-white rounded-xl border p-4', isOverdue ? 'border-red-300' : 'border-border')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded border font-medium', typeInfo?.color)}>
                        {typeInfo?.label}
                      </span>
                      {q.responded_at ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-600"><CheckCircle2 size={10} />Responded</span>
                      ) : isOverdue ? (
                        <span className="text-[10px] text-red-600 font-medium">⚠ Response Overdue</span>
                      ) : q.response_due ? (
                        <span className="text-[10px] text-amber-600">Due {formatDate(q.response_due)}</span>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-brand-950 mt-1">{q.subject}</p>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">Received {formatDate(q.received_date)}</p>
                    {q.responded_at && q.response_note && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-[11px] text-green-700 font-medium">Response: {q.response_note}</p>
                      </div>
                    )}
                  </div>
                  {!q.responded_at && (
                    <RoleGuard roles={['super_admin','director','manager','executive']}>
                      <button
                        onClick={() => setRespondingId(q.id)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
                      >
                        Mark Responded
                      </button>
                    </RoleGuard>
                  )}
                </div>

                {/* Inline response form */}
                {respondingId === q.id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <textarea
                      value={responseNote}
                      onChange={e => setResponseNote(e.target.value)}
                      rows={2}
                      placeholder="Brief note on how the query was responded to…"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => submitResponse(q.id)} disabled={respond.isPending}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                        {respond.isPending ? 'Saving…' : 'Save Response'}
                      </button>
                      <button onClick={() => { setRespondingId(null); setResponseNote('') }}
                        className="px-3 py-1.5 border border-border text-xs rounded-lg hover:bg-[#F8FAFC]">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-brand-950 mb-1">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
    </div>
  )
}

const ic = (err: boolean) =>
  cn('w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600', err ? 'border-red-400' : 'border-border')
