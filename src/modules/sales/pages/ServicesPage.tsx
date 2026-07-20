// Sales — Service catalogue (/sales/services).
// Lists sales_services; super_admin/director/manager (via sales.service.manage)
// may add or edit a service. Fees are stored as bigint paise, shown via formatRupees.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { cn, formatRupees } from '@/lib/utils'
import { useCan } from '@/core/access/useCan'
import { useServices, useCreateService, useUpdateService } from '../hooks/useServices'
import type { SalesService, ServiceInput } from '../api/services'

export default function ServicesPage() {
  const canManage = useCan('sales.service.manage')
  const servicesQ = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()

  const [editing, setEditing] = useState<SalesService | null>(null)
  const [showForm, setShowForm] = useState(false)

  const services = servicesQ.data ?? []

  const openCreate = () => { setEditing(null); setShowForm(true) }
  const openEdit = (s: SalesService) => { setEditing(s); setShowForm(true) }

  return (
    <div>
      <TopBar title="Service Catalogue" subtitle="Consulting services, pricing & GST" />
      <div className="p-6 space-y-6 animate-fade-up">

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {servicesQ.isFetching ? 'Loading…' : `${services.length} services`}
          </p>
          {canManage && (
            <button onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              <Sym name="add" size={14} /> Add Service
            </button>
          )}
        </div>

        {servicesQ.error ? (
          <ErrorPanel message={(servicesQ.error as Error).message} />
        ) : servicesQ.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 glass-panel rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] border-b border-border"><tr>
                {['Code', 'Name', 'Category', 'Default Fee', 'HSN/SAC', 'GST %', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {services.map(s => (
                  <tr key={s.id} className="hover:bg-[#F8FAFC]">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{s.code ?? '—'}</td>
                    <td className="px-5 py-3 text-brand-950 font-medium">{s.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.category ?? '—'}</td>
                    <td className="px-5 py-3 tabular-nums">{formatRupees(s.default_fee)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{s.hsn_sac ?? '—'}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{s.gst_rate}%</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full',
                        s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canManage && (
                        <button onClick={() => openEdit(s)}
                          className="text-muted-foreground hover:text-brand-600" title="Edit service">
                          <Sym name="edit" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {services.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">No services defined yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ServiceForm
          service={editing}
          pending={createService.isPending || updateService.isPending}
          onClose={() => setShowForm(false)}
          onSubmit={async (input) => {
            if (editing) await updateService.mutateAsync({ id: editing.id, input })
            else await createService.mutateAsync(input)
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 text-sm text-white">
      <div className="flex items-start gap-2">
        <Sym name="error" size={16} className="mt-0.5 shrink-0 text-red-300" />
        <div>
          <p className="font-medium mb-1">Couldn't load the catalogue</p>
          <p className="text-xs text-white/70">{message}</p>
        </div>
      </div>
    </div>
  )
}

function ServiceForm({
  service, pending, onClose, onSubmit,
}: {
  service: SalesService | null
  pending: boolean
  onClose: () => void
  onSubmit: (input: ServiceInput) => void
}) {
  const [code, setCode] = useState(service?.code ?? '')
  const [name, setName] = useState(service?.name ?? '')
  const [category, setCategory] = useState(service?.category ?? '')
  const [feeRupees, setFeeRupees] = useState(service ? String(service.default_fee / 100) : '')
  const [hsnSac, setHsnSac] = useState(service?.hsn_sac ?? '')
  const [gstRate, setGstRate] = useState(service ? String(service.gst_rate) : '18')
  const [isActive, setIsActive] = useState(service?.is_active ?? true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      code: code.trim() || null,
      name: name.trim(),
      category: category.trim() || null,
      default_fee: Math.round((parseFloat(feeRupees) || 0) * 100),
      hsn_sac: hsnSac.trim() || null,
      gst_rate: parseFloat(gstRate) || 0,
      is_active: isActive,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-semibold text-brand-950">{service ? 'Edit Service' : 'Add Service'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-brand-950">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Code</label>
              <input value={code} onChange={e => setCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="e.g. FSSAI_NEW" />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="e.g. FSSAI" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-950 mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              placeholder="Service name" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">Default Fee (₹)</label>
              <input type="number" min="0" step="0.01" value={feeRupees} onChange={e => setFeeRupees(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">HSN/SAC</label>
              <input value={hsnSac} onChange={e => setHsnSac(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="998311" />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-950 mb-1">GST %</label>
              <input type="number" min="0" step="0.01" value={gstRate} onChange={e => setGstRate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="18" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-950">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
            <button type="submit" disabled={pending || !name.trim()}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {pending ? 'Saving…' : service ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
