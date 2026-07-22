// HRMS — Assets (M8): asset register + issue/return allocations (/hrms/assets).
// View gated hrms.asset.manage (register is HR-facing); write gated hrms.asset.manage.
import { useState } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'
import { useCan } from '@/core/access/useCan'
import { useEmployees } from '../hooks/useEmployees'
import {
  useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset,
  useAllocations, useIssueAsset, useReturnAsset,
} from '../hooks/useAssets'
import type { Asset, AssetInput, AssetStatus, AssetCategory } from '../api/assets'
import { AssetStatusPill, inputCls } from './assetsShared'
import { fmtPaise } from './payrollShared'

const CATEGORIES: AssetCategory[] = ['laptop', 'desktop', 'phone', 'sim', 'access_card', 'vehicle', 'other']
const STATUSES: AssetStatus[] = ['in_stock', 'issued', 'repair', 'retired']

export default function AssetsPage() {
  const canManage = useCan('hrms.asset.manage')
  const { data: assets = [], isLoading } = useAssets()
  const create = useCreateAsset()
  const update = useUpdateAsset()
  const del = useDeleteAsset()

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<{ category: string; asset_tag: string; description: string; serial_no: string; purchase_date: string; cost_rupees: string; status: AssetStatus; license_expiry: string }>({
    category: 'laptop', asset_tag: '', description: '', serial_no: '', purchase_date: '', cost_rupees: '', status: 'in_stock', license_expiry: '',
  })
  const [selected, setSelected] = useState<Asset | null>(null)

  const startCreate = () => { setEditId(null); setForm({ category: 'laptop', asset_tag: '', description: '', serial_no: '', purchase_date: '', cost_rupees: '', status: 'in_stock', license_expiry: '' }); setOpen(true) }
  const startEdit = (a: Asset) => { setEditId(a.id); setForm({ category: a.category, asset_tag: a.asset_tag ?? '', description: a.description ?? '', serial_no: a.serial_no ?? '', purchase_date: a.purchase_date ?? '', cost_rupees: a.cost ? String(a.cost / 100) : '', status: a.status, license_expiry: a.license_expiry ?? '' }); setOpen(true) }
  const submit = async () => {
    const payload: AssetInput = {
      category: form.category, asset_tag: form.asset_tag.trim() || null, description: form.description.trim() || null,
      serial_no: form.serial_no.trim() || null, purchase_date: form.purchase_date || null,
      cost: Math.round((Number(form.cost_rupees) || 0) * 100), status: form.status, license_expiry: form.license_expiry || null,
    }
    if (editId) await update.mutateAsync({ id: editId, input: payload }); else await create.mutateAsync(payload)
    setOpen(false)
  }

  return (
    <div>
      <TopBar title="Asset Register" subtitle="Hardware, licenses & allocations">
        {canManage && <button onClick={startCreate} className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"><Sym name="add" size={15} /> New Asset</button>}
      </TopBar>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border rounded-xl bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-semibold">Asset</th><th className="px-4 py-2 text-left font-semibold">Cost</th><th className="px-4 py-2 text-left font-semibold">Status</th>{canManage && <th className="px-2 py-2" />}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && assets.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No assets.</td></tr>}
              {assets.map((a) => (
                <tr key={a.id} className={`hover:bg-[#F8FAFC] cursor-pointer ${selected?.id === a.id ? 'bg-[#F8FAFC]' : ''}`} onClick={() => setSelected(a)}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-brand-950">{a.asset_tag || a.description || a.serial_no || a.category}</div>
                    <div className="text-[11px] text-muted-foreground">{a.category}{a.serial_no ? ` · ${a.serial_no}` : ''}</div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtPaise(a.cost)}</td>
                  <td className="px-4 py-2.5"><AssetStatusPill status={a.status} /></td>
                  {canManage && <td className="px-2 py-2.5 text-right whitespace-nowrap"><button onClick={(e) => { e.stopPropagation(); startEdit(a) }} className="text-muted-foreground hover:text-brand-700 mr-2"><Sym name="edit" size={15} /></button><button onClick={(e) => { e.stopPropagation(); del.mutate(a.id) }} className="text-muted-foreground hover:text-red-600"><Sym name="delete" size={15} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <AllocationPanel asset={selected} canManage={canManage} />}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-3">
            <h2 className="font-display font-semibold text-brand-950">{editId ? 'Edit' : 'New'} Asset</h2>
            <div className="grid grid-cols-2 gap-3">
              <select className={inputCls} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as AssetStatus }))}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
              <input className={inputCls} placeholder="Asset tag" value={form.asset_tag} onChange={(e) => setForm((f) => ({ ...f, asset_tag: e.target.value }))} />
              <input className={inputCls} placeholder="Serial no" value={form.serial_no} onChange={(e) => setForm((f) => ({ ...f, serial_no: e.target.value }))} />
            </div>
            <input className={inputCls} placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-[11px] text-muted-foreground">Purchased</label><input type="date" className={inputCls} value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} /></div>
              <div><label className="text-[11px] text-muted-foreground">Cost ₹</label><input type="number" className={inputCls} value={form.cost_rupees} onChange={(e) => setForm((f) => ({ ...f, cost_rupees: e.target.value }))} /></div>
              <div><label className="text-[11px] text-muted-foreground">Lic. expiry</label><input type="date" className={inputCls} value={form.license_expiry} onChange={(e) => setForm((f) => ({ ...f, license_expiry: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-[#F8FAFC]">Cancel</button>
              <button onClick={submit} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AllocationPanel({ asset, canManage }: { asset: Asset; canManage: boolean }) {
  const { data: employees = [] } = useEmployees()
  const { data: allocations = [] } = useAllocations(asset.id)
  const issue = useIssueAsset()
  const ret = useReturnAsset()
  const [pick, setPick] = useState('')
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? id.slice(0, 8)
  const activeAlloc = (allocations as any[]).find((a) => !a.returned_on)

  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-brand-950 flex items-center justify-between">
        <span>Allocations — {asset.asset_tag || asset.category}</span>
        <AssetStatusPill status={asset.status} />
      </div>
      {canManage && (
        activeAlloc ? (
          <div className="px-4 py-2 flex items-center justify-between border-b border-border text-sm">
            <span>Issued to <span className="font-medium">{nameOf(activeAlloc.employee_id)}</span></span>
            <button onClick={() => ret.mutate({ allocation_id: activeAlloc.id, asset_id: asset.id, condition_in: prompt('Condition on return (optional)') || null })} className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg">Return</button>
          </div>
        ) : asset.status !== 'retired' && (
          <div className="px-4 py-2 flex gap-2 border-b border-border">
            <select className={`${inputCls} flex-1`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Issue to employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button onClick={() => { if (pick) { issue.mutate({ asset_id: asset.id, employee_id: pick, condition_out: null }); setPick('') } }} disabled={!pick} className="px-3 py-1.5 bg-brand-600 text-white text-xs rounded-lg disabled:opacity-50">Issue</button>
          </div>
        )
      )}
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {allocations.length === 0 && <tr><td className="px-4 py-4 text-muted-foreground text-center">No allocation history.</td></tr>}
          {(allocations as any[]).map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2">{nameOf(a.employee_id)}</td>
              <td className="px-2 py-2 text-muted-foreground text-[12px]">{a.issued_on}{a.returned_on ? ` → ${a.returned_on}` : ''}</td>
              <td className="px-2 py-2 text-right">{a.returned_on ? <span className="text-[11px] text-muted-foreground">returned</span> : <span className="text-[11px] text-blue-700">active</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
