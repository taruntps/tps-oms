// HRMS — Leave & Attendance Policy (/hrms/policy), gate hrms.ess.view.
// Read-only company policy handbook for every employee. Content mirrors the
// live leave/attendance configuration (approved 2026-08-19).
import { TopBar } from '@/components/layout/TopBar'
import { Sym } from '@/components/shared/Sym'

const LEAVE_ROWS: [string, string, string, string, string][] = [
  ['Casual Leave (CL)', '7', 'Yes', 'No', 'Short/planned personal leave · maximum 2 consecutive days'],
  ['Sick Leave (SL)', '7', 'Yes', 'No', "Illness · doctor's prescription may be required (case-to-case); single day allowed"],
  ['Earned Leave (EL)', '15', 'Yes', 'Up to 45', 'Plan in advance'],
  ['Leave Without Pay (LWP)', '—', 'No', '—', 'On approval; unpaid'],
  ['OD / WFH', 'As needed', 'Yes', '—', 'Outdoor duty / work-from-home, on approval'],
  ['Comp Off', 'Earned', 'Yes', '—', 'Against approved extra working'],
]

export default function PolicyPage() {
  return (
    <div>
      <TopBar title="Leave & Attendance Policy" subtitle="Company policy · effective 1 January 2026" />
      <div className="p-6 animate-fade-up max-w-3xl">
        <div className="bg-white rounded-2xl border border-border p-6 space-y-6 text-sm leading-relaxed text-brand-950">

          <p className="text-muted-foreground">
            <strong className="text-brand-950">Working hours:</strong> 9:00 AM – 6:00 PM ·
            <strong className="text-brand-950"> Weekly off:</strong> Saturday &amp; Sunday ·
            <strong className="text-brand-950"> Leave year:</strong> January–December (calendar year) · Minimum unit: half day.
            <br /><strong className="text-brand-950">Lunch break:</strong> 30 minutes, taken anytime between 1:30 PM and 3:00 PM.
          </p>

          <Block icon="schedule" title="Attendance & punching">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Punch <strong className="text-brand-950">in and out</strong> daily; always punch out.</li>
              <li>All your punches are <strong className="text-brand-950">recorded and visible</strong> to you; attendance is counted from your <strong className="text-brand-950">first and last</strong> punch of the day.</li>
              <li><strong className="text-brand-950">Late:</strong> up to 9:10 fine · 9:11–9:30 allowed once/month, then half day · after 9:30 = half day.</li>
              <li><strong className="text-brand-950">Early going:</strong> by 17:50 fine · 17:30–17:50 once/month · before 17:30 = half day.</li>
              <li><strong className="text-brand-950">Half day</strong> also if worked under 4.5 hours. <strong className="text-brand-950">Absent</strong> (no punch, no leave) = Loss of Pay.</li>
              <li><strong className="text-brand-950">Miss-punch fix:</strong> self-correct 2×/month; beyond that only Admin/HR can regularise.</li>
            </ul>
          </Block>

          <Block icon="hourglass_bottom" title="Short leave">
            <p className="text-muted-foreground"><strong className="text-brand-950">2 hours per month</strong> (1 hour twice or 2 hours once), all employees, resets every month. Apply in advance → approval. An approved short leave excuses that day's late/early penalty.</p>
          </Block>

          <Block icon="event_available" title="Leave categories">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] border border-border rounded-lg overflow-hidden min-w-[560px]">
                <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>{['Type', 'Per year', 'Paid?', 'Carry forward', 'Notes'].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {LEAVE_ROWS.map(([t, q, p, c, n]) => (
                    <tr key={t}>
                      <td className="px-3 py-2 font-medium">{t}</td>
                      <td className="px-3 py-2 text-muted-foreground">{q}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c}</td>
                      <td className="px-3 py-2 text-muted-foreground">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

          <Block icon="trending_up" title="Leave accrual (pro-rata)">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Annual leave — <strong className="text-brand-950">CL 7, SL 7, EL 15</strong> — is credited on <strong className="text-brand-950">1 January</strong> each year, <strong className="text-brand-950">pro-rated to your working days in the previous calendar year</strong>.</li>
              <li>New joiners earn annual leave on a pro-rata basis; it is credited the following January based on days worked. <strong className="text-brand-950">Short leave</strong> is available from your <strong className="text-brand-950">date of joining</strong>.</li>
            </ul>
          </Block>

          <Block icon="date_range" title="Weekend clubbing (sandwich rule)">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>If leave is taken on <strong className="text-brand-950">both the Friday before and the Monday after</strong> a weekend, the Saturday and Sunday in between are <strong className="text-brand-950">clubbed as leave</strong> — the whole Friday–Monday = 4 days is counted.</li>
              <li>Deducted from the leave type applied: e.g. <strong className="text-brand-950">4 EL</strong> if EL, or <strong className="text-brand-950">4 days LWP</strong> if LWP.</li>
            </ul>
          </Block>

          <Block icon="how_to_reg" title="Applying & approval">
            <p className="text-muted-foreground">Apply via the portal (My Leave / Short Leave); give <strong className="text-brand-950">2 days' notice</strong> for planned leave. All requests go to your manager/HR for approval. Negative balances are not allowed (except LWP).</p>
          </Block>

          <Block icon="payments" title="How leave affects salary">
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong className="text-brand-950">Per-day pay = monthly salary ÷ working days</strong> (working days = month minus weekly-offs and holidays).</li>
              <li>A half-day/absence is deducted <strong className="text-brand-950">only if not covered by paid leave</strong>. With CL/SL/EL applied, it's leave-adjusted (paid) — no cut. Uncovered half = ½ day; uncovered absent = 1 day LOP.</li>
            </ul>
          </Block>

          <Block icon="celebration" title="Holidays">
            <p className="text-muted-foreground">The company holiday calendar is in the portal (HRMS → Holidays). Gazetted holidays are paid days off.</p>
          </Block>

          <p className="text-[12px] text-muted-foreground border-t border-border pt-4">
            Effective from 1 January 2026. TPS Xperts may revise these rules; changes will be posted in the portal.
          </p>
        </div>
      </div>
    </div>
  )
}

function Block({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 font-display font-semibold text-brand-950 mb-2">
        <Sym name={icon} size={17} className="text-brand-600" /> {title}
      </h3>
      {children}
    </div>
  )
}
