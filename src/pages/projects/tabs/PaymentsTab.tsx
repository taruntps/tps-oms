import { useState } from 'react'
import { Sym } from '@/components/shared/Sym'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePayments, useCreatePayment } from '@/hooks/usePayments'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, formatRupees, cn } from '@/lib/utils'

const PAYMENT_MODES = ['Cash', 'NEFT', 'IMPS', 'UPI', 'Cheque', 'RTGS', 'Other']

const schema = z.object({
  amount:       z.coerce.number().min(1, 'Amount required'),
  payment_date: z.string().min(1, 'Date required'),
  payment_mode: z.string().min(1, 'Mode required'),
  invoice_no:   z.string().optional(),
  reference_no: z.string().optional(),
  notes:        z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props { projectId: string; clientId: string }

export function PaymentsTab({ projectId, clientId }: Props) {
  const { profile } = useAuth()
  const { data: payments = [], isLoading } = usePayments(projectId)
  const createPayment = useCreatePayment()
  const [showForm, setShowForm] = useState(false)

  const total = payments.reduce((s, p) => s + p.amount, 0)

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sym name="currency_rupee" size={15} className="text-emerald-300" />
          <span className="text-sm font-semibold text-white">Total Received: {formatRupees(total)}</span>
        </div>
        <RoleGuard roles={['super_admin','director','manager','accounts']}>
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 text-sm text-white font-medium hover:text-white/80"
          >
            <Sym name="add" size={13} />
            Record Payment
          </button>
        </RoleGuard>
      </div>

      {/* Add form */}
      {showForm && (
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
            <Field label="Invoice No." error={errors.invoice_no?.message}>
              <input {...register('invoice_no')} className={ic(false)} placeholder="INV-001" />
            </Field>
            <Field label="Reference / UTR" error={errors.reference_no?.message} className="col-span-2">
              <input {...register('reference_no')} className={ic(false)} placeholder="Transaction reference" />
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
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
          {payments.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-border px-5 py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-700">{formatRupees(p.amount)}</span>
                  <span className="text-[10px] bg-[#F8FAFC] border border-border px-1.5 py-0.5 rounded text-muted-foreground">{p.payment_mode}</span>
                  {p.invoice_no && <span className="text-[10px] text-muted-foreground">#{p.invoice_no}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{formatDate(p.payment_date)}</span>
                  {p.reference_no && <span className="font-mono">Ref: {p.reference_no}</span>}
                  {(p as any).profiles?.name && <span>by {(p as any).profiles.name}</span>}
                </div>
              </div>
            </div>
          ))}
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
