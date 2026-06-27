import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sym } from '@/components/shared/Sym'
import { useCreateProject } from '@/hooks/useProjects'
import { useClients } from '@/hooks/useClients'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from '@/components/shared/Toast'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { SERVICE_TYPES } from '@/data/india'

const schema = z.object({
  client_id:    z.string().min(1, 'Select a client'),
  service_type: z.string().min(1, 'Required'),
  assigned_to:  z.string().min(1, 'Assign an executive'),
  manager_id:   z.string().min(1, 'Assign a manager'),
  quoted_amount: z.coerce.number().min(0),
  target_date:  z.string().optional(),
  notes:        z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Props { onClose: () => void }

export function ProjectForm({ onClose }: Props) {
  const { profile } = useAuth()
  const create = useCreateProject()
  const { data: clients = [] } = useClients()

  const { data: staff = [] } = useQuery({
    queryKey: ['profiles', 'staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('id, name, role').eq('is_active', true).order('name')
      if (error) throw error
      return data
    },
  })

  const executives = staff.filter(s => ['executive', 'manager', 'director', 'super_admin'].includes(s.role))
  const managers   = staff.filter(s => ['manager', 'director', 'super_admin'].includes(s.role))

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { service_type: 'New Application', quoted_amount: 0 },
  })

  // Default the manager to the admin (super_admin) once staff loads, so creation
  // isn't blocked waiting for a manual pick. Editable afterwards.
  const managerValue = watch('manager_id')
  useEffect(() => {
    if (!managerValue && managers.length) {
      const admin = managers.find(m => m.role === 'super_admin') ?? managers[0]
      if (admin) setValue('manager_id', admin.id)
    }
  }, [managers, managerValue])

  // Artwork can hold multiple products, each with its own parallel stage track.
  const serviceType = watch('service_type')
  const isArtwork = serviceType === 'Artwork'
  const [products, setProducts] = useState<string[]>([''])

  const onSubmit = async (data: FormData) => {
    if (isArtwork && products.filter(p => p.trim()).length === 0) {
      toast.error('Add at least one product name'); return
    }
    try {
      const proj = await create.mutateAsync({
        ...data,
        project_name:  '',
        target_date:   data.target_date  || null,
        notes:         data.notes        || null,
        quoted_amount: Math.round(data.quoted_amount * 100),
        created_by:    profile?.id,
      })
      if (isArtwork && proj?.id) {
        const names = products.map(p => p.trim()).filter(Boolean)
        await supabase.from('project_products').insert(names.map((nm, i) => ({ project_id: proj.id, product_no: i + 1, product_name: nm })) as any)
        await (supabase.rpc as any)('generate_artwork_product_stages', { p_project_id: proj.id })
      }
      toast.success('Project created', isArtwork ? `${products.filter(p => p.trim()).length} product track(s) created` : 'Stages auto-generated from template')
      onClose()
    } catch (err: any) {
      toast.error('Failed to create project', err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><Sym name="close" size={16} /></button>
        </div>

        <form className="overflow-y-auto flex-1 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">

            <Field label="Client *" error={errors.client_id?.message} className="col-span-2">
              <select {...register('client_id')} className={ic(!!errors.client_id)}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </Field>

            <Field label="Project Type *" error={errors.service_type?.message}>
              <select {...register('service_type')} className={ic(!!errors.service_type)}>
                {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>

            <Field label="Quoted Amount (₹)" error={errors.quoted_amount?.message}>
              <input type="number" {...register('quoted_amount')} className={ic(false)} placeholder="0" />
            </Field>

            <Field label="Assigned Executive *" error={errors.assigned_to?.message}>
              <select {...register('assigned_to')} className={ic(!!errors.assigned_to)}>
                <option value="">Select executive…</option>
                {executives.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>

            <Field label="Manager *" error={errors.manager_id?.message}>
              <select {...register('manager_id')} className={ic(!!errors.manager_id)}>
                <option value="">Select manager…</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>

            <Field label="Target Date" error={errors.target_date?.message} className="col-span-2">
              <input type="date" {...register('target_date')} className={ic(false)} />
            </Field>

            <Field label="Notes" error={errors.notes?.message} className="col-span-2">
              <textarea {...register('notes')} rows={2} className={ic(false)} />
            </Field>

            {isArtwork && (
              <div className="col-span-2 border-t border-border pt-3">
                <label className="block text-xs font-medium text-brand-950 mb-1">Products ({products.length}) — each runs its own artwork track</label>
                <div className="space-y-2">
                  {products.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="w-6 text-xs text-muted-foreground text-center">{i + 1}</span>
                      <input className={ic(false)} value={p} onChange={e => setProducts(products.map((x, j) => j === i ? e.target.value : x))} placeholder={`Product ${i + 1} name`} />
                      {products.length > 1 && <button type="button" onClick={() => setProducts(products.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600"><Sym name="close" size={14} /></button>}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setProducts([...products, ''])} className="mt-2 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"><Sym name="add" size={13} /> Add product</button>
              </div>
            )}

          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
          <button onClick={handleSubmit(onSubmit)} disabled={isSubmitting}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {isSubmitting ? 'Creating…' : 'Create Project'}
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
