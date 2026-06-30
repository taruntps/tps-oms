import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePayments, useCreatePayment, useMarkPaymentComplete } from '@/hooks/usePayments'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'

const GOVT_FEE_MODES = ['Client-paid', 'TPS-paid']
const PAYMENT_MODES  = ['Cash', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'RTGS', 'Other']

const schema = z.object({
  amount:       z.coerce.number().min(1, 'Amount required'),
  payment_date: z.string().min(1, 'Date required'),
  payment_mode: z.string().min(1, 'Mode required'),
  invoice_no:   z.string().optional(),
  reference_no: z.string().optional(),
  notes:        z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  projectId:     string
  clientId:      string
  quotedAmount?: number
  paymentStatus?: string
}

export function PaymentsTab({ projectId, clientId, quotedAmount = 0, paymentStatus = 'pending' }: Props) {
  const { profile } = useAuth()
  const { data: payments = [], isLoading } = usePayments(projectId)
  const createPayment  = useCreatePayment()
  const markComplete   = useMarkPaymentComplete()
  const [showForm, setShowForm]               = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)

  // Consulting fees only — govt pass-through fees excluded from Received total
  const consultingPayments = payments.filter(p => !GOVT_FEE_MODES.includes(p.payment_mode ?? ''))
  const govtPayments       = payments.filter(p =>  GOVT_FEE_MODES.includes(p.payment_mode ?? ''))
  const totalReceived      = consultingPayments.reduce((s, p) => s + p.amount, 0)
  const isComplete         = paymentStatus === 'paid'

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { payment_mode: 'NEFT', payment_date: new Date().toISOString().split('T')[0] },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createPayment.mutateAsync({
        ...data,
        amount:       Math.round(data.amount * 100),
        project_id:   projectId,
        client_id:    clientId,
        recorded_by:  profile!.id,
        invoice_no:   data.invoice_no   || null,
        reference_no: data.reference_no || null,
        notes:        data.notes        || null,
      })
      toast.success('Payment recorded')
      reset()
      setShowForm(false)
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  const handleMarkComplete = async () => {
    try {
      await markComplete.mutateAsync(projectId)
      toast.success('Payment marked as complete')
      setConfirmComplete(false)
    } catch (e: any) {
      toast.error('Failed', e.message)
    }
  }

  return (
    <div className="space-y-4">

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Quoted"   amount={quotedAmount}   color="text-brand-700" />
        <SummaryCard label="Received" amount={totalReceived}  color="text-emerald-700"
          note={govtPayments.length > 0 ? 'excl. govt fees' : undefined} />
        <SummaryCard
          label={isComplete ? 'Status' : 'Pending'}
          amount={isComplete ? 0 : quotedAmount > 0 ? Math.max(0, quotedAmount - totalReceived) : 0}
          color={isComplete ? 'text-green-600' : 'text-muted-foreground'}
          badge={isComplete ? '✓ PAID' : undefined}
        />
      </div>

      {/* Action bar — all locked once payment is complete */}
      <div className="flex items-center justify-end flex-wrap gap-3">
        {isComplete ? (
          <span className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
            <Sym name="verified" size={14} /> Payment Complete — section locked
          </span>
        ) : (
          <>
            <RoleGuard roles={['super_admin', 'director', 'manager', 'executive']}>
              <button
                onClick={() => setConfirmComplete(true)}
                className="flex items-center gap-1.5 text-sm text-green-700 font-medium border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Sym name="check_circle" size={14} />
                Mark Payment Complete
              </button>
            </RoleGuard>
            <RoleGuard roles={['super_admin', 'director', 'manager', 'executive', 'accounts', 'hr']}>
              <button
                onClick={() => setShowForm(s => !s)}
                className="flex items-center gap-1.5 text-sm text-white font-medium bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Sym name="add" size={13} />
                Record Payment
              </button>
            </RoleGuard>
          </>
        )}
      </div>

      {/* Add payment form — hidden once complete */}
      {showForm && !isComplete && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5">
          <h4 className="text-xs font-semibold text-brand-950 mb-4">New Payment Entry</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *" error={errors.amount?.message}>
              <input type="number" step="0.01" {...register('amount')} className={ic(!!errors.amount)} placeholder="0.00" />
            </Field>
            <Field label="Date *" error={errors.payment_date?.message}>
              <input type="date" {...register('payment_date')} className={ic(!!errors.payment_date)} />
            </Field>
            <Field label="Mode *" error={errors.payment_mode?.message}>
              <select {...register('payment_mode')} className={ic(!!errors.payment_mode)}>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Invoice No.">
              <input {...register('invoice_no')} className={ic(false)} placeholder="INV-001" />
            </Field>
            <Field label="Reference / UTR" className="col-span-2">
              <input {...register('reference_no')} className={ic(false)} placeholder="Transaction reference" />
            </Field>
            <Field label="Notes" className="col-span-2">
              <textarea {...register('notes')} rows={2} className={ic(false)} />
            </Field>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}
              className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-1.5 border border-border text-sm rounded-lg hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payments list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-14 glass-panel rounded-xl" />)}</div>
      ) : payments.length === 0 ? (
        <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
          <p className="text-xs text-white/60">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Consulting fee payments */}
          {consultingPayments.map(p => (
            <PaymentRow key={p.id} payment={p} />
          ))}

          {/* Govt / pass-through fees — visually separated */}
          {govtPayments.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 border-t border-dashed border-border" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Govt fees (pass-through — not counted in Received)</span>
                <div className="flex-1 border-t border-dashed border-border" />
              </div>
              {govtPayments.map(p => (
                <PaymentRow key={p.id} payment={p} isGovt />
              ))}
            </>
          )}
        </div>
      )}

      {/* Confirm mark complete modal */}
      {confirmComplete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h2 className="font-display font-semibold text-brand-950 mb-1">Mark Payment as Complete?</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Once confirmed, the payment section will be <strong>locked</strong> and no further payments can be added or edited.
            </p>
            {quotedAmount > 0 && totalReceived < quotedAmount && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Received ({formatRupees(totalReceived)}) is less than quoted ({formatRupees(quotedAmount)}).
                Proceed only if the balance is waived or settled offline.
              </p>
            )}
            {quotedAmount > 0 && totalReceived > quotedAmount && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                Received ({formatRupees(totalReceived)}) exceeds quoted ({formatRupees(quotedAmount)}).
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmComplete(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={handleMarkComplete} disabled={markComplete.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                {markComplete.isPending ? 'Saving…' : 'Yes, Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentRow({ payment: p, isGovt = false }: { payment: any; isGovt?: boolean }) {
  return (
    <div className={cn(
      'bg-white rounded-xl border px-5 py-3 flex items-center justify-between',
      isGovt ? 'border-dashed border-border opacity-70' : 'border-border'
    )}>
      <div>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-semibold', isGovt ? 'text-muted-foreground' : 'text-green-700')}>
            {formatRupees(p.amount)}
          </span>
          <span className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded text-muted-foreground">
            {p.payment_mode}
          </span>
          {isGovt && (
            <span className="text-[10px] bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-amber-700">
              Govt fee
            </span>
          )}
          {p.invoice_no && <span className="text-[10px] text-muted-foreground">#{p.invoice_no}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
          <span>{formatDate(p.payment_date)}</span>
          {p.reference_no && <span className="font-mono">Ref: {p.reference_no}</span>}
          {p.profiles?.name && <span>by {p.profiles.name}</span>}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, amount, color, badge, note }: {
  label: string; amount: number; color: string; badge?: string; note?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-border px-4 py-3">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-base font-bold font-mono mt-1', color)}>{badge ?? formatRupees(amount)}</p>
      {note && <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>}
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
