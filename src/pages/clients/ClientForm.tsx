import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, AlertTriangle } from 'lucide-react'
import { useCreateClient, useUpdateClient, useClients, type Client } from '@/hooks/useClients'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { STATE_NAMES, getCitiesForState } from '@/data/india'

// ── Utilities ────────────────────────────────────────────────────────────────

function generatePlaceholderGstin(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 9; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return 'NOGSTN' + suffix // 6 + 9 = 15 chars total
}

// A 15-char GSTIN embeds the 10-char PAN at positions 3–12 (0-indexed 2–11).
// e.g. 03GJRPS5249K1ZF → PAN GJRPS5249K. Returns '' if not a full 15-char GSTIN.
function panFromGstin(gstin: string): string {
  const g = (gstin ?? '').toUpperCase()
  return /^[0-9A-Z]{15}$/.test(g) ? g.slice(2, 12) : ''
}

function findSimilarClient(newName: string, clients: Client[], skipId?: string): Client | undefined {
  const newWords = newName.trim().toUpperCase().split(/\s+/)
  if (newWords.length < 2) return undefined // single-word names are too vague to match

  return clients.find(c => {
    if (skipId && c.id === skipId) return false
    const existingWords = c.company_name.trim().toUpperCase().split(/\s+/)
    if (existingWords.length < 2) return false
    // Compare using the first N words where N = min of both names' word counts (min 2)
    const compareLen = Math.min(newWords.length, existingWords.length)
    return newWords.slice(0, compareLen).join(' ') === existingWords.slice(0, compareLen).join(' ')
  })
}

// ── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  company_name:    z.string().min(2, 'Required'),
  contact_person:  z.string().min(2, 'Required'),
  contact_phone:   z.string().min(10, 'Enter valid phone'),
  contact_email:   z.string().email('Invalid email'),
  city:            z.string().min(1, 'Select city'),
  state:           z.string().min(1, 'Select state'),
  gstin:           z.string().optional(),
  pan:             z.string().optional(),
  whatsapp_number: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props {
  client?: Client
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ClientForm({ client, onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateClient()
  const update = useUpdateClient()
  const { data: allClients = [] } = useClients()
  const isEdit = !!client

  // GSTIN toggle: default true (Yes) for new; for edit, infer from gstin_is_placeholder
  const [gstinAvailable, setGstinAvailable] = useState<boolean>(
    isEdit ? !(client as any).gstin_is_placeholder : true
  )
  const [showDupWarning, setShowDupWarning] = useState(false)
  const [dupClientName, setDupClientName] = useState('')
  const pendingData = useRef<FormData | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name:    client?.company_name ?? '',
      contact_person:  client?.contact_person ?? '',
      contact_phone:   (client?.contact_phone ?? '').replace(/^\+91/, ''),
      contact_email:   client?.contact_email ?? '',
      city:            client?.city ?? '',
      state:           client?.state ?? 'Punjab',
      // Show blank in GSTIN field when editing a placeholder client
      gstin:           (client as any)?.gstin_is_placeholder ? '' : (client?.gstin ?? ''),
      pan:             client?.pan ?? '',
      whatsapp_number: ((client as any)?.whatsapp_number ?? '').replace(/^\+91/, ''),
    },
  })

  const selectedState = watch('state')
  const [cities, setCities] = useState<string[]>([])

  // PAN is derived-and-locked when a full GSTIN is present (it lives inside the GSTIN).
  const gstinWatch = watch('gstin') ?? ''
  const panLocked = gstinAvailable && panFromGstin(gstinWatch) !== ''

  useEffect(() => {
    const list = getCitiesForState(selectedState)
    setCities(list)
    const currentCity = watch('city')
    if (currentCity && !list.includes(currentCity)) setValue('city', '')
  }, [selectedState])

  useEffect(() => {
    setCities(getCitiesForState(selectedState))
  }, [])

  // Keep PAN authoritative when a full GSTIN is present (covers editing an
  // existing client whose stored PAN might differ from the GSTIN-embedded one).
  useEffect(() => {
    if (panLocked) setValue('pan', panFromGstin(gstinWatch), { shouldValidate: false })
  }, [panLocked, gstinWatch])

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = async (data: FormData) => {
    const finalGstin = gstinAvailable
      ? (data.gstin ?? '').toUpperCase()
      : generatePlaceholderGstin()

    const payload = {
      company_name:         data.company_name.toUpperCase(),
      contact_person:       data.contact_person,
      contact_phone:        '+91' + data.contact_phone.replace(/^\+91/, '').replace(/^0/, ''),
      contact_email:        data.contact_email,
      city:                 data.city,
      state:                data.state,
      gstin:                finalGstin,
      gstin_is_placeholder: !gstinAvailable,
      pan:                  data.pan || null,
      whatsapp_number:      data.whatsapp_number
        ? '+91' + data.whatsapp_number.replace(/^\+91/, '').replace(/^0/, '')
        : null,
    }

    try {
      if (isEdit) {
        await update.mutateAsync({ id: client.id, ...(payload as any) })
        toast.success('Client updated')
      } else {
        await create.mutateAsync({ ...(payload as any), created_by: profile?.id })
        toast.success('Client added')
      }
      onClose()
    } catch (err: any) {
      if (err.message?.includes('idx_clients_gstin')) {
        toast.error('GSTIN already exists', 'This GSTIN is already registered with another client')
      } else {
        toast.error('Failed to save client', err.message)
      }
    }
  }

  const onSubmit = async (data: FormData) => {
    // Validate GSTIN when available
    if (gstinAvailable) {
      const g = (data.gstin ?? '').toUpperCase()
      if (!/^[A-Z0-9]{15}$/.test(g)) {
        toast.error('Invalid GSTIN', 'GSTIN must be exactly 15 uppercase letters/digits')
        return
      }
    }

    // Duplicate name check — only for no-GSTIN new clients
    if (!gstinAvailable && !isEdit) {
      const similar = findSimilarClient(data.company_name, allClients)
      if (similar) {
        pendingData.current = data
        setDupClientName(similar.company_name)
        setShowDupWarning(true)
        return
      }
    }

    await doSave(data)
  }

  const handleDupConfirm = async () => {
    setShowDupWarning(false)
    if (pendingData.current) {
      await doSave(pendingData.current)
      pendingData.current = null
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{isEdit ? 'Edit Client' : 'Add Client'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">

            {/* Company Name — ALL CAPS enforced in real time */}
            <Field label="Company Name *" error={errors.company_name?.message} className="col-span-2">
              <input
                {...register('company_name')}
                onChange={e => setValue('company_name', e.target.value.toUpperCase(), { shouldValidate: true })}
                className={ic(!!errors.company_name)}
                placeholder="e.g. WALPAR NUTRITIONS LIMITED"
                style={{ textTransform: 'uppercase' }}
              />
            </Field>

            {/* State + City */}
            <Field label="State *" error={errors.state?.message}>
              <select {...register('state')} className={ic(!!errors.state)}>
                <option value="">Select state…</option>
                {STATE_NAMES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="City *" error={errors.city?.message}>
              <select {...register('city')} className={ic(!!errors.city)} disabled={!selectedState}>
                <option value="">Select city…</option>
                {cities.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>

            {/* Contact person — Title Case via CSS */}
            <Field label="Contact Person *" error={errors.contact_person?.message}>
              <input
                {...register('contact_person')}
                className={ic(!!errors.contact_person)}
                placeholder="Full name"
                style={{ textTransform: 'capitalize' }}
              />
            </Field>

            <Field label="Phone *" error={errors.contact_phone?.message}>
              <PhoneInput register={register('contact_phone')} error={!!errors.contact_phone} placeholder="10-digit number" />
            </Field>

            <Field label="Email *" error={errors.contact_email?.message} className="col-span-2">
              <input {...register('contact_email')} className={ic(!!errors.contact_email)} placeholder="client@company.com" />
            </Field>

            {/* GSTIN Yes / No toggle */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-brand-950 mb-2">GSTIN Available? *</label>
              <div className="flex rounded-lg border border-border overflow-hidden text-sm mb-2">
                <button
                  type="button"
                  onClick={() => setGstinAvailable(true)}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    gstinAvailable
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-muted-foreground hover:bg-[#F8FAFC]'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setGstinAvailable(false)}
                  className={`flex-1 py-2 font-medium transition-colors ${
                    !gstinAvailable
                      ? 'bg-amber-500 text-white'
                      : 'bg-white text-muted-foreground hover:bg-[#F8FAFC]'
                  }`}
                >
                  No
                </button>
              </div>

              {gstinAvailable ? (
                <input
                  {...register('gstin')}
                  onChange={e => {
                    const g = e.target.value.toUpperCase()
                    setValue('gstin', g, { shouldValidate: false })
                    // Auto-derive PAN from a complete GSTIN; clear it again if GSTIN
                    // is shortened/edited so a stale PAN never lingers.
                    setValue('pan', panFromGstin(g), { shouldValidate: false })
                  }}
                  className={ic(!!errors.gstin)}
                  placeholder="15-character GSTIN (auto-uppercased)"
                  maxLength={15}
                  style={{ textTransform: 'uppercase' }}
                />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <AlertTriangle size={12} />
                  A placeholder ID (NOGSTN…) will be auto-assigned. You can update the real GSTIN later.
                </div>
              )}
              {errors.gstin && <p className="text-[11px] text-red-600 mt-1">{errors.gstin.message}</p>}
            </div>

            <Field label="PAN" error={errors.pan?.message}>
              <input
                {...register('pan')}
                readOnly={panLocked}
                className={ic(false) + (panLocked ? ' bg-[#F8FAFC] text-muted-foreground cursor-not-allowed' : '')}
                placeholder="10-char PAN"
                style={{ textTransform: 'uppercase' }}
              />
              {panLocked && (
                <p className="text-[10px] text-muted-foreground mt-1">🔒 Auto-filled from GSTIN — locked</p>
              )}
            </Field>

            <Field label="WhatsApp Number" error={errors.whatsapp_number?.message}>
              <PhoneInput register={register('whatsapp_number')} error={false} placeholder="10-digit number" />
            </Field>

          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? 'Saving…' : isEdit ? 'Update Client' : 'Add Client'}
          </button>
        </div>
      </div>

      {/* Duplicate name warning dialog */}
      {showDupWarning && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-brand-950 mb-1">Possible Duplicate</h3>
                <p className="text-sm text-muted-foreground">
                  A client named <strong>"{dupClientName}"</strong> already exists. Are you sure this is a different company?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDupWarning(false); pendingData.current = null }}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                onClick={handleDupConfirm}
                className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600"
              >
                Yes, add anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PhoneInput({ register, error, placeholder }: { register: any; error: boolean; placeholder: string }) {
  return (
    <div className={`flex rounded-lg border overflow-hidden ${error ? 'border-red-400' : 'border-border'}`}>
      <span className="px-3 py-2 text-sm bg-[#F8FAFC] text-muted-foreground border-r border-border shrink-0 flex items-center">
        🇮🇳 +91
      </span>
      <input
        {...register}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
    </div>
  )
}

function Field({ label, error, children, className }: {
  label: string; error?: string; children: React.ReactNode; className?: string
}) {
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
