import { StageCard } from '../StageCard'
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
  if (stages.length === 0) {
    return (
      <div className="glass-panel rounded-xl border-dashed !border-white/20 p-8 text-center">
        <p className="text-sm text-white/60">No stages generated yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {[...stages]
        .sort((a, b) => a.stage_order - b.stage_order)
        .map(stage => (
          <StageCard
            key={stage.id}
            stage={stage}
            projectId={projectId}
            isBlocked={isBlocked}
            serviceType={serviceType}
            appRefNo={appRefNo}
            clientId={clientId}
            assigneeName={assigneeName}
          />
        ))}
    </div>
  )
}
