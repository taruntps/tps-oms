// HRMS — Training (M7): Employee self-service (/hrms/training/me). My enrolments + my certifications.
import { useMemo } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { useAuth } from '@/contexts/AuthContext'
import { useMyEnrolments, useMyCertifications, useTrainings } from '../hooks/useTraining'
import { StatusPill, ExpiryPill, expiryRowCls } from './trainingShared'

export default function MyTrainingPage() {
  const { user } = useAuth()
  const uid = user?.id
  const { data: enrolments = [] } = useMyEnrolments(uid ?? '')
  const { data: certs = [] } = useMyCertifications(uid ?? '')
  const { data: trainings = [] } = useTrainings()
  const titleOf = useMemo(() => new Map(trainings.map((t) => [t.id, t.title])), [trainings])

  return (
    <div>
      <TopBar title="My Training" subtitle="Enrolments & certifications" />
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-brand-950">My Trainings</div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {(enrolments as any[]).length === 0 && <tr><td className="px-4 py-4 text-center text-muted-foreground">No enrolments.</td></tr>}
              {(enrolments as any[]).map((en) => (
                <tr key={en.id}>
                  <td className="px-4 py-2.5">{titleOf.get(en.training_id) ?? en.training_id.slice(0, 8)}</td>
                  <td className="px-2 py-2.5"><StatusPill status={en.status} /></td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{en.score != null ? `Score ${en.score}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="border border-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-brand-950">My Certifications</div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {(certs as any[]).length === 0 && <tr><td className="px-4 py-4 text-center text-muted-foreground">No certifications.</td></tr>}
              {(certs as any[]).map((c) => (
                <tr key={c.id} className={expiryRowCls(c.expires_on)}>
                  <td className="px-4 py-2.5"><div className="font-medium text-brand-950">{c.name}</div><div className="text-[11px] text-muted-foreground">{c.authority}</div></td>
                  <td className="px-4 py-2.5 text-right"><ExpiryPill expiresOn={c.expires_on} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  )
}
