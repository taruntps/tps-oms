import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sym } from '@/components/shared/Sym'
import { useCreateLicense, useUpdateLicense, useStoreCredential, type License } from '@/hooks/useLicenses'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { STATE_NAMES, getCitiesForState, FBO_CATEGORIES } from '@/data/india'

const schema = z.object({
  license_type:        z.string().min(1, 'Required'),
  license_number: z.string().optional().refine(
    val => !val || val.length === 0 || /^\d{14}$/.test(val),
    { message: 'FSSAI number must be exactly 14 digits (numbers only)' }
  ),
  status:              z.string().min(1, 'Required'),
  state_name:          z.string().min(1, 'Select state'),
  city:                z.string().min(1, 'Enter city/district'),
  authorised_premises: z.string().optional(),
  issue_date:          z.string().optional(),
  expiry_date:         z.string().optional(),
  credential_username: z.string().optional(),
  notes:               z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  clientId: string
  license?: License
  onClose: () => void
}

const LICENSE_TYPES = ['Central Licence', 'State Licence', 'Registration Certificate']
const LICENSE_STATUSES = [
  { value: 'active',            label: 'Active' },
  { value: 'pending_approval',  label: 'Pending Approval' },
  { value: 'expired',           label: 'Expired' },
  { value: 'suspended',         label: 'Suspended' },
  { value: 'cancelled',         label: 'Cancelled' },
]

export function LicenseForm({ clientId, license, onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateLicense()
  const update = useUpdateLicense()
  const storeCredential = useStoreCredential()
  const isEdit = !!license
  const [credentialPassword, setCredentialPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Multi-select FBO categories
  const [categories, setCategories] = useState<string[]>(
    (license as any)?.categories?.length ? (license as any).categories : license?.category ? [license.category] : []
  )
  const [catInput, setCatInput] = useState('')
  const [cities, setCities] = useState<string[]>([])

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      license_type:        license?.license_type ?? 'Central Licence',
      license_number:      license?.license_number ?? '',
      status:              (license as any)?.status ?? 'active',
      state_name:          (license as any)?.state_name ?? license?.state_code ?? '',
      city:                (license as any)?.city ?? license?.authority_office ?? '',
      authorised_premises: (license as any)?.authorised_premises ?? '',
      issue_date:          license?.issue_date ?? '',
      expiry_date:         license?.expiry_date ?? '',
      credential_username: license?.credential_username ?? '',
      notes:               license?.notes ?? '',
    },
  })

  const selectedState = watch('state_name')

  useEffect(() => {
    const list = getCitiesForState(selectedState)
    setCities(list)
  }, [selectedState])

  useEffect(() => {
    setCities(getCitiesForState(selectedState))
  }, [])

  const addCategory = (cat: string) => {
    if (cat && !categories.includes(cat)) setCategories([...categories, cat])
    setCatInput('')
  }
  const removeCategory = (cat: string) => setCategories(categories.filter(c => c !== cat))

  const onSubmit = async (data: FormData) => {
    if (categories.length === 0) { toast.error('Add at least one FBO Category'); return }
    // When a password is provided, fall back to the licence number as username
    // so CredentialReveal always has a non-null username to display.
    const effectiveUsername = data.credential_username || (credentialPassword ? (data.license_number || null) : null)
    const payload = {
      ...data,
      categories,
      category: categories[0], // backward compat
      issue_date:  data.issue_date  || null,
      expiry_date: data.expiry_date || null,
      credential_username: effectiveUsername,
    }
    try {
      let savedId = license?.id
      if (isEdit) {
        await update.mutateAsync({ id: license.id, ...payload })
      } else {
        const saved = await create.mutateAsync({ client_id: clientId, created_by: profile?.id, ...payload })
        savedId = saved.id
      }
      if (credentialPassword && savedId) {
        await storeCredential.mutateAsync({
          licenseId: savedId,
          username:  effectiveUsername ?? '',
          password:  credentialPassword,
        })
      }
      toast.success(isEdit ? 'Licence updated' : 'Licence added')
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">

            <Field label="Licence Type *" error={errors.license_type?.message}>
              <select {...register('license_type')} className={ic(!!errors.license_type)}>
                {LICENSE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Status *" error={errors.status?.message}>
              <select {...register('status')} className={ic(!!errors.status)}>
                {LICENSE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>

            <Field label="Licence Number" error={undefined}>
              <input {...register('license_number')} className={ic(false)} placeholder="Leave blank if pending approval" />
            </Field>

            <Field label="FSSAI Portal Username" error={undefined}>
              <input {...register('credential_username')} className={ic(false)} placeholder="App Ref No. or Licence No." />
            </Field>

            <Field label={isEdit ? 'Portal Password (leave blank to keep)' : 'FSSAI Portal Password'} error={undefined}>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={credentialPassword}
                  onChange={e => setCredentialPassword(e.target.value)}
                  className={ic(false) + ' pr-10'}
                  placeholder={isEdit ? '••••••••' : 'Enter portal password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-brand-600"
                >
                  {showPassword ? <Sym name="visibility_off" size={13} /> : <Sym name="visibility" size={13} />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">🔒 Encrypted and stored in Vault — never visible in plain text.</p>
            </Field>

            {/* FBO Categories — multi-select */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-brand-950 mb-1">FBO Categories *</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {categories.map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-brand-100 text-brand-800 rounded-full">
                    {cat}
                    <button type="button" onClick={() => removeCategory(cat)} className="text-brand-600 hover:text-red-600 ml-0.5">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <select
                  value={catInput}
                  onChange={e => setCatInput(e.target.value)}
                  className={ic(false)}
                >
                  <option value="">Select category…</option>
                  {FBO_CATEGORIES.filter(c => !categories.includes(c)).map(c => <option key={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => addCategory(catInput)}
                  disabled={!catInput}
                  className="px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-40 flex items-center gap-1"
                >
                  <Sym name="add" size={13} />
                </button>
              </div>
              {categories.length === 0 && <p className="text-[11px] text-red-600 mt-1">Add at least one category</p>}
            </div>

            {/* State + City */}
            <Field label="State *" error={errors.state_name?.message}>
              <select {...register('state_name')} className={ic(!!errors.state_name)}>
                <option value="">Select state…</option>
                {STATE_NAMES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="City / District *" error={errors.city?.message}>
              <select {...register('city')} className={ic(!!errors.city)}>
                <option value="">Select city…</option>
                {cities.map(c => <option key={c}>{c}</option>)}
                <option value="__other">Other (type below)</option>
              </select>
            </Field>

            <Field label="Authorised Premises Address" error={errors.authorised_premises?.message} className="col-span-2">
              <textarea {...register('authorised_premises')} rows={2} className={ic(false)} placeholder="Full address of licensed premises" />
            </Field>

            <Field label="Issue Date" error={errors.issue_date?.message}>
              <input type="date" {...register('issue_date')} className={ic(false)} />
            </Field>

            <Field label="Expiry Date" error={errors.expiry_date?.message}>
              <input type="date" {...register('expiry_date')} className={ic(false)} />
            </Field>

            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
              <textarea {...register('notes')} rows={2} className={ic(false)} />
            </Field>

          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
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

const ic = (err: boolean) =>
  `w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 ${err ? 'border-red-400' : 'border-border'}`
