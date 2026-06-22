import { StageCard } from '../StageCard'
import type { Tables } from '@/types/database'

type Stage = Tables<'stages'>

interface Props {
  stages: Stage[]
  projectId: string
  isBlocked: boolean
}

export function StagesTab({ stages, projectId, isBlocked }: Props) {
  if (stages.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">No stages generated yet.</p>
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
          />
        ))}
    </div>
  )
}
