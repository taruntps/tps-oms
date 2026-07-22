// HRMS — Assets (M8): Employee self-service (/hrms/assets/me). My currently-assigned assets.
import { TopBar } from '@/components/layout/TopBar'
import { useAuth } from '@/contexts/AuthContext'
import { useMyAssets } from '../hooks/useAssets'
import { fmtPaise } from './payrollShared'

export default function MyAssetsPage() {
  const { user } = useAuth()
  const { data: allocations = [] } = useMyAssets(user?.id ?? '')

  return (
    <div>
      <TopBar title="My Assets" subtitle="Company assets assigned to you" />
      <div className="p-6">
        <div className="border border-border rounded-xl bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-2 text-left font-semibold">Asset</th><th className="px-4 py-2 text-left font-semibold">Category</th><th className="px-4 py-2 text-left font-semibold">Issued</th><th className="px-4 py-2 text-left font-semibold">Value</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(allocations as any[]).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No assets assigned to you.</td></tr>}
              {(allocations as any[]).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 font-medium text-brand-950">{a.asset?.asset_tag || a.asset?.description || a.asset?.serial_no || a.asset?.category || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.asset?.category}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.issued_on}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{fmtPaise(a.asset?.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
