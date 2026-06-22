import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { useCreateClient, useUpdateClient, type Client } from '@/hooks/useClients'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'

const schema = z.object({
  company_name:  z.string().min(2, 'Required'),
  trade_name:    z.string().optional(),
  contact_person: z.string().min(2, 'Required'),
  contact_phone: z.string().min(10, 'Enter valid phone'),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  address:       z.string().optional(),
  city:          z.string().optional(),
  state:         z.string().min(1, 'Required'),
  gstin:         z.string().optional(),
  pan:           z.string().optional(),
  notes:         z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  client?: Client
  onClose: () => void
}

const STATES = ['Punjab','Haryana','Himachal Pradesh','Uttarakhand','Delhi','Uttar Pradesh','Rajasthan','Maharashtra','Karnataka','Tamil Nadu','Gujarat','West Bengal','Telangana','Andhra Pradesh','Kerala','Madhya Pradesh','Bihar','Odisha','Jharkhand','Assam','Other']

export function ClientForm({ client, onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateClient()
  const update = useUpdateClient()
  const isEdit = !!client

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name:   client?.company_name ?? '',
      trade_name:     client?.trade_name ?? '',
      contact_person: client?.contact_person ?? '',
      contact_phone:  client?.contact_phone ?? '',
      contact_email:  client?.contact_email ?? '',
      address:        client?.address ?? '',
      city:           client?.city ?? '',
      state:          client?.state ?? 'Punjab',
      gstin:          client?.gstin ?? '',
      pan:            client?.pan ?? '',
      notes:          client?.notes ?? '',
    },
  })

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit) {
        await update.mutateAsync({ id: client.id, ...data })
        toast.success('Client updated')
      } else {
        await create.mutateAsync({ ...data, created_by: profile?.id })
        toast.success('Client added')
      }
      onClose()
    } catch (err: any) {
      toast.error('Failed to save client', err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name *" error={errors.company_name?.message} className="col-span-2">
              <input {...register('company_name')} className={inputCls(!!errors.company_name)} placeholder="e.g. Chimak Healthcare Pvt Ltd" />
            </Field>
            <Field label="Trade Name" error={errors.trade_name?.message}>
              <input {...register('trade_name')} className={inputCls(false)} placeholder="Brand / trading name" />
            </Field>
            <Field label="State *" error={errors.state?.message}>
              <select {...register('state')} className={inputCls(!!errors.state)}>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Contact Person *" error={errors.contact_person?.message}>
              <input {...register('contact_person')} className={inputCls(!!errors.contact_person)} placeholder="Full name" />
            </Field>
            <Field label="Phone *" error={errors.contact_phone?.message}>
              <input {...register('contact_phone')} className={inputCls(!!errors.contact_phone)} placeholder="10-digit mobile" />
            </Field>
            <Field label="Email" error={errors.contact_email?.message} className="col-span-2">
              <input {...register('contact_email')} className={inputCls(!!errors.contact_email)} placeholder="optional" />
            </Field>
            <Field label="City" error={errors.city?.message}>
              <input {...register('city')} className={inputCls(false)} />
            </Field>
            <Field label="GSTIN" error={errors.gstin?.message}>
              <input {...register('gstin')} className={inputCls(false)} placeholder="15-digit GSTIN" />
            </Field>
            <Field label="PAN" error={errors.pan?.message}>
              <input {...register('pan')} className={inputCls(false)} placeholder="10-char PAN" />
            </Field>
            <Field label="Address" error={errors.address?.message} className="col-span-2">
              <textarea {...register('address')} rows={2} className={inputCls(false)} />
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
              <textarea {...register('notes')} rows={2} className={inputCls(false)} />
            </Field>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-brand-950 mb-1">{label}</label>
      {children}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean) {
  return `w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 ${hasError ? 'border-red-400' : 'border-border'}`
}
