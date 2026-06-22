import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import { useCreateLicense, useUpdateLicense, type License } from '@/hooks/useLicenses'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'

const schema = z.object({
  license_type:     z.string().min(1, 'Required'),
  license_number:   z.string().optional(),
  category:         z.string().optional(),
  state_code:       z.string().optional(),
  authority_office: z.string().optional(),
  issue_date:       z.string().optional(),
  expiry_date:      z.string().optional(),
  credential_username: z.string().optional(),
  notes:            z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  clientId: string
  license?: License
  onClose: () => void
}

const LICENSE_TYPES = ['Central Licence', 'State Licence', 'Registration Certificate']

export function LicenseForm({ clientId, license, onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateLicense()
  const update = useUpdateLicense()
  const isEdit = !!license

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      license_type:     license?.license_type ?? 'Central Licence',
      license_number:   license?.license_number ?? '',
      category:         license?.category ?? '',
      state_code:       license?.state_code ?? '',
      authority_office: license?.authority_office ?? '',
      issue_date:       license?.issue_date ?? '',
      expiry_date:      license?.expiry_date ?? '',
      credential_username: license?.credential_username ?? '',
      notes:            license?.notes ?? '',
    },
  })

  const onSubmit = async (data: FormData) => {
    const clean = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
    ) as FormData

    try {
      if (isEdit) {
        await update.mutateAsync({ id: license.id, ...clean })
        toast.success('Licence updated')
      } else {
        await create.mutateAsync({ client_id: clientId, created_by: profile?.id, ...clean })
        toast.success('Licence added')
      }
      onClose()
    } catch (err: any) {
      toast.error('Failed to save licence', err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Licence' : 'Add FSSAI Licence'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Licence Type *" error={errors.license_type?.message} className="col-span-2">
              <select {...register('license_type')} className={inputCls(!!errors.license_type)}>
                {LICENSE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Licence Number" error={errors.license_number?.message}>
              <input {...register('license_number')} className={inputCls(false)} placeholder="Leave blank if pending" />
            </Field>
            <Field label="FBO Category" error={errors.category?.message}>
              <input {...register('category')} className={inputCls(false)} placeholder="e.g. Manufacturer" />
            </Field>
            <Field label="State Code" error={errors.state_code?.message}>
              <input {...register('state_code')} className={inputCls(false)} placeholder="e.g. PB" />
            </Field>
            <Field label="Authority Office" error={errors.authority_office?.message}>
              <input {...register('authority_office')} className={inputCls(false)} placeholder="e.g. DO Mohali" />
            </Field>
            <Field label="Issue Date" error={errors.issue_date?.message}>
              <input type="date" {...register('issue_date')} className={inputCls(false)} />
            </Field>
            <Field label="Expiry Date" error={errors.expiry_date?.message}>
              <input type="date" {...register('expiry_date')} className={inputCls(false)} />
            </Field>
            <Field label="FSSAI Portal Username" error={errors.credential_username?.message} className="col-span-2">
              <input {...register('credential_username')} className={inputCls(false)} placeholder="Login ID (not password)" />
              <p className="text-[10px] text-muted-foreground mt-1">Password is stored encrypted via Supabase Vault — set it separately after saving.</p>
            </Field>
            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
              <textarea {...register('notes')} rows={2} className={inputCls(false)} />
            </Field>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : isEdit ? 'Update Licence' : 'Add Licence'}
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
