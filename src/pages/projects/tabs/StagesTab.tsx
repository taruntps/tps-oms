import { useQuery } from '@tanstack/react-query'
import { StageCard } from '../StageCard'
import { supabase } from '@/lib/supabase'
import { Sym } from '@/components/shared/Sym'
import type { Tables } from '@/types/database'

type Stage = Tables<'stages'>

interface Props {
  stages: Stage[]
  projectId: string
  isBlocked: boolean
  serviceType?: string
  appRefNo?: string | null
  clientId?: string
  assigneeName?: string
}

export function StagesTab({ stages, projectId, isBlocked, serviceType, appRefNo, clientId, assigneeName }: Props) {
  const hasProducts = stages.some(s => (s as any).product_id)
  const { data: products = [] } = useQuery({
    queryKey: ['project_products', projectId],
    enabled: hasProducts,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('project_products').select('*').eq('project_id', projectId).order('product_no')
      if (error) throw error
      return data as { id: string; product_no: number; product_name: string }[]
    },
  })

  if (stages.length === 0) {
    return (
      <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
        <p className="text-sm text-white/60">No stages generated yet.</p>
      </div>
    )
  }

  const renderList = (list: Stage[]) => (
    <div className="space-y-2">
      {[...list].sort((a, b) => a.stage_order - b.stage_order).map(stage => (
        <StageCard key={stage.id} stage={stage} projectId={projectId} isBlocked={isBlocked}
          serviceType={serviceType} appRefNo={appRefNo} clientId={clientId} assigneeName={assigneeName} />
      ))}
    </div>
  )

  // Multi-product (Artwork): group stages by product into parallel tracks.
  if (hasProducts && products.length) {
    return (
      <div className="space-y-4">
        {products.map(p => {
          const ps = stages.filter(s => (s as any).product_id === p.id)
          const done = ps.filter(s => ['completed', 'skipped', 'not_required'].includes(s.status)).length
          return (
            <div key={p.id} className="glass-panel rounded-xl p-3">
              <div className="flex items-center gap-2 px-1 pb-2 mb-2 border-b border-white/10">
                <Sym name="inventory_2" size={15} className="text-white/80" />
                <span className="text-sm font-semibold text-white">{p.product_name}</span>
                <span className="text-[11px] text-white/60">· {done}/{ps.length} stages</span>
              </div>
              {renderList(ps)}
            </div>
          )
        })}
      </div>
    )
  }

  return renderList(stages)
}
