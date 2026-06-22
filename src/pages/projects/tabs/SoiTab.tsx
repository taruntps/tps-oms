import { useState } from 'react'
import { Plus, Archive } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSoiArchive, useCreateSoi } from '@/hooks/useAuthorityQueries'
import { RoleGuard } from '@/components/shared/ProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { formatDate, cn } from '@/lib/utils'

const schema = z.object({
  soi_date:         z.string().min(1, 'Date required'),
  product_category: z.string().optional(),
  description:      z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props { projectId: string; clientId: string }

export function SoiTab({ projectId, clientId }: Props) {
  const { profile } = useAuth()
  const { data: sois = [], isLoading } = useSoiArchive(clientId)
  const createSoi = useCreateSoi()
  const [showForm, setShowForm] = useState(false)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { soi_date: new Date().toISOString().split('T')[0] },
  })

  const onSubmit = async (data: FormData) => {
    try {
      await createSoi.mutateAsync({
        client_id:        clientId,
        project_id:       projectId,
        created_by:       profile!.id,
        soi_date:         data.soi_date,
        product_category: data.product_category || null,
        description:      data.description      || null,
      })
      toast.success('SOI entry added')
      reset()
      setShowForm(false)
    } catch (err: any) {
      toast.error('Failed', err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Statement of Ingredients archive for this client</p>
        <RoleGuard roles={['super_admin','director','manager','executive']}>
          <button onClick={() => setShowForm(s => !s)} className="flex items-center gap-1.5 text-sm text-brand-600 font-medium hover:text-brand-700">
            <Plus size={13} />
            Add SOI Entry
          </button>
        </RoleGuard>
      </div>

      {showForm && (
        <div className="bg-[#F8FAFC] rounded-xl border border-border p-5">
          <h4 className="text-xs font-semibold text-brand-950 mb-4">New SOI Record</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SOI Date *" error={errors.soi_date?.message}>
              <input type="date" {...register('soi_date')} className={ic(!!errors.soi_date)} />
            </Field>
            <Field label="Product Category" error={errors.product_category?.message}>
              <input {...register('product_category')} className={ic(false)} placeholder="e.g. Nutraceuticals – Capsules" />
            </Field>
            <Field label="Description / Notes" error={errors.description?.message} className="col-span-2">
              <textarea {...register('description')} rows={2} className={ic(false)} placeholder="Products, formulation notes, scope…" />
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
        <div className="space-y-2 animate-pulse">{[1,2].map(i => <div key={i} className="h-14 bg-white rounded-xl border border-border" />)}</div>
      ) : sois.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
          <Archive size={28} className="mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No SOI entries for this client yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sois.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-border px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-brand-950">{formatDate(s.soi_date)}</span>
                    {s.product_category && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                        {s.product_category}
                      </span>
                    )}
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    Added {formatDate(s.created_at)}
                    {(s as any).profiles?.name && ` by ${(s as any).profiles.name}`}
                  </p>
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
