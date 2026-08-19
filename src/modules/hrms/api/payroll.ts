// HRMS — Payroll (M4): deterministic calculation engine + run operations.
//
// Money is INTEGER PAISE as `bigint` end-to-end — no floating point for money. Percentages
// are computed on paise and rounded HALF-UP per component; statutory shares round to the
// nearest rupee; net rounds to the nearest ₹1 with a `round_off` carry so the net-affecting
// component lines reconcile exactly (Σ net-affecting lines = net + round_off, Calc-Spec §12).
//
// NOTHING is hardcoded: salary structures, the component master, statutory params (effective-
// dated `hr_statutory_config`) and payroll policy (`hr_policy_settings.payroll.*` via
// get_hr_policy) all come from the DB. Statutory placeholders are 0/empty → PF/ESI/PT/TDS
// compute to 0 until Administration configures them (expected — the engine invents no rates).
//
// Reads-only from frozen M2 `hr_attendance_days` (payable/LOP days) and M3 leave/encashment.
// Payroll NEVER writes attendance or leave. Determinism: identical inputs → identical output;
// recompute supersedes prior lines for a draft/computed run (delete + reinsert for that run).
//
// Migration 093 tables aren't in the generated Database types yet, so `from(...)`/`rpc(...)`
// are cast to `any` (`const db = supabase as any`), mirroring M1–M3.
import { supabase } from '@/lib/supabase'

const db = supabase as any

// ─────────────────────────────────────────────────────────────────────────────
// Pure money math (bigint paise) — exported for unit testing.
// ─────────────────────────────────────────────────────────────────────────────

export type Paise = bigint

/**
 * Integer division rounded HALF-UP (away from zero on the .5 boundary), on bigint.
 * Uses (2·|num| + |den|) / (2·|den|) so the exact half rounds up without float drift.
 */
export function divRoundHalfUp(num: Paise, den: Paise): Paise {
  if (den === 0n) return 0n
  const negative = num < 0n !== den < 0n
  const a = num < 0n ? -num : num
  const b = den < 0n ? -den : den
  const q = (2n * a + b) / (2n * b)
  return negative ? -q : q
}

/**
 * A percentage (e.g. 12, 0.75, 8.33) of a paise base, rounded half-up to paise.
 * The percent is turned into an exact rational num/den (den = 100·10^decimals) so no
 * binary-float rounding ever touches the money.
 */
export function percentOf(base: Paise, percent: number): Paise {
  if (!percent || !Number.isFinite(percent)) return 0n
  const s = Math.abs(percent).toString()
  const [intPart, fracPart = ''] = s.split('.')
  const decimals = fracPart.length
  const den = 100n * 10n ** BigInt(decimals)
  const num = BigInt(intPart + fracPart) * (percent < 0 ? -1n : 1n)
  return divRoundHalfUp(base * num, den)
}

/** Round paise to the nearest whole rupee (100 paise), half-up. */
export function roundToRupee(paise: Paise): Paise {
  return divRoundHalfUp(paise, 100n) * 100n
}

/**
 * Round a raw net (paise) to the nearest ₹1 and return the carry.
 * round_off = rawNet − net, so Σ(net-affecting component lines) = net + round_off.
 */
export function roundNet(rawNet: Paise): { net: Paise; roundOff: Paise } {
  const net = roundToRupee(rawNet)
  return { net, roundOff: rawNet - net }
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export type ComponentType = 'earning' | 'deduction' | 'employer_contribution' | 'reimbursement'
export type CalcType = 'fixed' | 'percent_of_base' | 'slab' | 'formula' | 'balancing'

export interface ComponentDef {
  code: string
  name: string
  type: ComponentType
  calc_type: CalcType
  base_code: string | null
  is_taxable: boolean
  is_pf_wage: boolean
  is_esi_wage: boolean
  is_part_of_gross: boolean
  prorate_on_lop: boolean
  sort_order: number
}

/** A salary line resolved for one employee (structure line + per-employee override). */
export interface EngineComponent {
  def: ComponentDef
  /** paise, when the value is an absolute amount (fixed components) */
  amount?: Paise | null
  /** the percentage value, when the component is percent-of-base */
  percent?: number | null
}

/** A single computed line on a payslip. */
export interface ComponentLine {
  component_code: string
  component_type: ComponentType
  amount: Paise
  is_statutory: boolean
}

export interface StatutoryLine {
  statute: 'PF' | 'ESI' | 'PT' | 'TDS'
  wage_base: Paise
  employee_share: Paise
  employer_share: Paise
  details: Record<string, unknown>
}

/** A period variable earning that maps to a real master component (FK-safe). */
export interface VariableEarning {
  component_code: string
  component_type: ComponentType
  amount: Paise
}

/** A recovery (loan/advance instalment or voluntary) mapped to a master deduction code. */
export interface Recovery {
  component_code: string
  amount: Paise
}

/** Resolved statutory config — value per (statute, param_key). Rates are percent numbers,
 *  ceilings are paise, PT slabs an array. Placeholders (0/[]/{}) yield zero statutory. */
export type StatutoryConfig = Record<string, Record<string, unknown>>

export interface PayrollPolicy {
  lopBasis: 'calendar' | number
  rounding: number
  otEnabled: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine — pure functions (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the salary earning components deterministically (Calc-Spec §11):
 * fixed → percent_of_base (base already computed) → balancing (Gross − Σ others).
 * `grossTarget` anchors the monthly gross; the balancing component absorbs the remainder.
 * Only `type='earning'` components are resolved here; deductions/employer-contributions are
 * computed in the statutory step. Returns a code→paise map in master sort order.
 */
export function computeComponents(components: EngineComponent[], grossTarget: Paise): Map<string, Paise> {
  const earnings = components
    .filter((c) => c.def.type === 'earning')
    .sort((a, b) => a.def.sort_order - b.def.sort_order)
  const resolved = new Map<string, Paise>()

  // Pass 1 — fixed + percent_of_base (balancing deferred).
  for (const c of earnings) {
    if (c.def.calc_type === 'balancing') continue
    if (c.def.calc_type === 'fixed') {
      resolved.set(c.def.code, BigInt(c.amount ?? 0n))
    } else if (c.def.calc_type === 'percent_of_base') {
      const base = c.def.base_code === 'GROSS' ? grossTarget : resolved.get(c.def.base_code ?? '') ?? 0n
      resolved.set(c.def.code, percentOf(base, c.percent ?? 0))
    } else {
      // slab/formula earnings are unusual; treat an explicit amount as the value, else 0.
      resolved.set(c.def.code, BigInt(c.amount ?? 0n))
    }
  }

  // Pass 2 — balancing = Gross target − Σ (part-of-gross earnings already resolved).
  for (const c of earnings) {
    if (c.def.calc_type !== 'balancing') continue
    let sum = 0n
    for (const e of earnings) {
      if (e.def.code === c.def.code) continue
      if (e.def.is_part_of_gross) sum += resolved.get(e.def.code) ?? 0n
    }
    const bal = grossTarget - sum
    resolved.set(c.def.code, bal > 0n ? bal : 0n)
  }

  return resolved
}

/**
 * Apply LOP proration to `prorate_on_lop` earning components (Calc-Spec §5).
 * Each flagged component is reduced by its own per-day share × LOP days:
 *   reduction = round( amount × lopDays ÷ basisDays ).
 * Days may be fractional (half-days) — scaled by 100 to stay in integer math.
 * Non-flagged components (fixed reimbursements etc.) are untouched.
 */
export function applyLop(
  earnings: Map<string, Paise>,
  defs: Map<string, ComponentDef>,
  lopDays: number,
  basisDays: number,
): Map<string, Paise> {
  if (lopDays <= 0 || basisDays <= 0) return new Map(earnings)
  const lopInt = BigInt(Math.round(lopDays * 100))
  const basisInt = BigInt(Math.round(basisDays * 100))
  const out = new Map<string, Paise>()
  for (const [code, amount] of earnings) {
    const def = defs.get(code)
    if (def?.prorate_on_lop) {
      const reduction = divRoundHalfUp(amount * lopInt, basisInt)
      const paid = amount - reduction
      out.set(code, paid > 0n ? paid : 0n)
    } else {
      out.set(code, amount)
    }
  }
  return out
}

/** Look up a PT (or generic) slab amount (paise) for a monthly wage. Supports both
 *  `{up_to, amount}` and `{min, max, amount}` slab shapes; empty slabs → 0. */
export function resolveSlab(slabs: unknown, wage: Paise): Paise {
  if (!Array.isArray(slabs)) return 0n
  for (const raw of slabs) {
    const s = raw as Record<string, unknown>
    const min = s.min != null ? BigInt(Math.round(Number(s.min))) : null
    const max = s.max != null ? BigInt(Math.round(Number(s.max))) : s.up_to != null ? BigInt(Math.round(Number(s.up_to))) : null
    const amount = s.amount != null ? BigInt(Math.round(Number(s.amount))) : 0n
    if ((min == null || wage >= min) && (max == null || wage <= max)) return amount
  }
  return 0n
}

function statParam(config: StatutoryConfig, statute: string, key: string): unknown {
  return config[statute]?.[key]
}
function statNumber(config: StatutoryConfig, statute: string, key: string): number {
  const v = statParam(config, statute, key)
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function statPaise(config: StatutoryConfig, statute: string, key: string): Paise {
  return BigInt(Math.round(statNumber(config, statute, key)))
}

/**
 * Compute statutory deductions + employer contributions in the fixed order PF → ESI → PT → TDS
 * (Calc-Spec §11 step 5). Wages come from the flagged, post-proration component amounts.
 * All rates/ceilings are read from the effective-dated config (0/empty → 0). Shares round to
 * the nearest rupee. Only statutes whose master component exists produce a line.
 */
export function computeStatutory(input: {
  earningAmounts: Map<string, Paise>
  defs: Map<string, ComponentDef>
  grossMonthly: Paise
  taxableTotal: Paise
  declaredTds: Paise
  config: StatutoryConfig
}): { lines: ComponentLine[]; statutory: StatutoryLine[] } {
  const { earningAmounts, defs, grossMonthly, taxableTotal, declaredTds, config } = input
  const lines: ComponentLine[] = []
  const statutory: StatutoryLine[] = []

  const wageBy = (pick: (d: ComponentDef) => boolean): Paise => {
    let sum = 0n
    for (const [code, amt] of earningAmounts) {
      const d = defs.get(code)
      if (d && pick(d)) sum += amt
    }
    return sum
  }
  const push = (code: string, amount: Paise) => {
    const d = defs.get(code)
    if (!d) return // component not in master → skip line (still recorded in statutory[])
    lines.push({ component_code: code, component_type: d.type, amount, is_statutory: true })
  }

  // ── PF ──
  const pfCeiling = statPaise(config, 'PF', 'wage_ceiling')
  let pfWage = wageBy((d) => d.is_pf_wage)
  if (pfCeiling > 0n && pfWage > pfCeiling) pfWage = pfCeiling
  const pfEe = roundToRupee(percentOf(pfWage, statNumber(config, 'PF', 'employee_rate')))
  const pfEr = roundToRupee(percentOf(pfWage, statNumber(config, 'PF', 'employer_rate')))
  push('PF_EE', pfEe)
  push('PF_ER', pfEr)
  statutory.push({
    statute: 'PF', wage_base: pfWage, employee_share: pfEe, employer_share: pfEr,
    details: { employee_rate: statNumber(config, 'PF', 'employee_rate'), employer_rate: statNumber(config, 'PF', 'employer_rate'), wage_ceiling: pfCeiling.toString() },
  })

  // ── ESI (eligibility by monthly gross; sticky period handled at input level) ──
  const esiCeiling = statPaise(config, 'ESI', 'eligibility_ceiling')
  const esiEligible = esiCeiling > 0n && grossMonthly <= esiCeiling
  const esiWage = wageBy((d) => d.is_esi_wage)
  const esiEe = esiEligible ? roundToRupee(percentOf(esiWage, statNumber(config, 'ESI', 'employee_rate'))) : 0n
  const esiEr = esiEligible ? roundToRupee(percentOf(esiWage, statNumber(config, 'ESI', 'employer_rate'))) : 0n
  push('ESI_EE', esiEe)
  push('ESI_ER', esiEr)
  statutory.push({
    statute: 'ESI', wage_base: esiEligible ? esiWage : 0n, employee_share: esiEe, employer_share: esiEr,
    details: { eligible: esiEligible, eligibility_ceiling: esiCeiling.toString(), employee_rate: statNumber(config, 'ESI', 'employee_rate'), employer_rate: statNumber(config, 'ESI', 'employer_rate') },
  })

  // ── PT (slab on monthly gross) ──
  const pt = resolveSlab(statParam(config, 'PT', 'slabs'), grossMonthly)
  push('PT', pt)
  statutory.push({ statute: 'PT', wage_base: grossMonthly, employee_share: pt, employer_share: 0n, details: { basis: 'gross' } })

  // ── TDS (Phase-1: declared monthly amount + YTD tracking at persist) ──
  push('TDS', declaredTds)
  statutory.push({ statute: 'TDS', wage_base: taxableTotal, employee_share: declaredTds, employer_share: 0n, details: { phase: 'declared' } })

  return { lines, statutory }
}

export interface ComputeLineInput {
  salaryComponents: EngineComponent[]
  grossTarget: Paise
  lopDays: number
  payableDays: number
  basisDays: number
  variableEarnings?: VariableEarning[]
  recoveries?: Recovery[]
  declaredTds?: Paise
  statutoryConfig: StatutoryConfig
}

export interface ComputeLineResult {
  componentLines: ComponentLine[]
  statutory: StatutoryLine[]
  gross: Paise
  totalEarnings: Paise
  totalDeductions: Paise
  totalStatutory: Paise
  net: Paise
  roundOff: Paise
}

/**
 * The engine core: compute one payroll line deterministically (Calc-Spec §11 precedence):
 * fixed → percent → balancing → LOP proration → variable earnings → statutory (PF→ESI→PT→TDS)
 * → recoveries → net → round. Money in/out is bigint paise. Pure — no I/O.
 */
export function computeLine(input: ComputeLineInput): ComputeLineResult {
  const defs = new Map<string, ComponentDef>()
  for (const c of input.salaryComponents) defs.set(c.def.code, c.def)

  // 1–3: earnings + LOP proration.
  const resolved = computeComponents(input.salaryComponents, input.grossTarget)
  const prorated = applyLop(resolved, defs, input.lopDays, input.basisDays)

  const componentLines: ComponentLine[] = []
  let gross = 0n
  for (const c of input.salaryComponents) {
    if (c.def.type !== 'earning') continue
    const amount = prorated.get(c.def.code) ?? 0n
    componentLines.push({ component_code: c.def.code, component_type: 'earning', amount, is_statutory: false })
    if (c.def.is_part_of_gross) gross += amount
  }

  // 4: variable earnings (OT, arrears, incentive/bonus, reimbursements, encashment).
  let variableTotal = 0n
  let taxableVariable = 0n
  for (const v of input.variableEarnings ?? []) {
    componentLines.push({ component_code: v.component_code, component_type: v.component_type, amount: v.amount, is_statutory: false })
    variableTotal += v.amount
    const d = defs.get(v.component_code)
    if (d?.is_taxable ?? true) taxableVariable += v.amount
  }

  // 5: statutory. Taxable total = taxable salary earnings (post-proration) + taxable variables.
  let taxableSalary = 0n
  for (const [code, amt] of prorated) if (defs.get(code)?.is_taxable) taxableSalary += amt
  const stat = computeStatutory({
    earningAmounts: prorated,
    defs,
    grossMonthly: gross,
    taxableTotal: taxableSalary + taxableVariable,
    declaredTds: input.declaredTds ?? 0n,
    config: input.statutoryConfig,
  })
  componentLines.push(...stat.lines)

  // 6: recoveries (loan/advance instalments, voluntary) as non-statutory deductions.
  for (const r of input.recoveries ?? []) {
    const d = defs.get(r.component_code)
    componentLines.push({ component_code: r.component_code, component_type: d?.type ?? 'deduction', amount: r.amount, is_statutory: false })
  }

  // 7: totals + net. Employer contributions are CTC/cost — excluded from net & totals.
  void variableTotal
  let totalStatutory = 0n // employee statutory shares only
  let totalDeductions = 0n // non-statutory employee deductions (recoveries/voluntary)
  let totalEarnings = 0n // all earning + reimbursement lines (salary + variable)
  for (const l of componentLines) {
    if (l.component_type === 'employer_contribution') continue
    if (l.component_type === 'earning' || l.component_type === 'reimbursement') {
      totalEarnings += l.amount
    } else if (l.component_type === 'deduction') {
      if (l.is_statutory) totalStatutory += l.amount
      else totalDeductions += l.amount
    }
  }
  const rawNet = totalEarnings - totalDeductions - totalStatutory
  const { net, roundOff } = roundNet(rawNet)

  return { componentLines, statutory: stat.statutory, gross, totalEarnings, totalDeductions, totalStatutory, net, roundOff }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers used by the run loader
// ─────────────────────────────────────────────────────────────────────────────

/** Calendar days in a month (month is 1-based). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Working days in a month = calendar days − weekly offs (Sat/Sun) − holidays.
 *  This is the LOP divisor so per-day rate = monthly salary ÷ working days. */
export function workingDaysInMonth(year: number, month: number, holidayDates: Set<string>): number {
  const total = daysInMonth(year, month)
  let wd = 0
  for (let d = 1; d <= total; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    const ds = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (holidayDates.has(ds)) continue
    wd++
  }
  return wd
}

/** Basis days for LOP proration from policy (`calendar` → month length, or a fixed number). */
export function basisDaysFor(policy: PayrollPolicy, year: number, month: number): number {
  return policy.lopBasis === 'calendar' ? daysInMonth(year, month) : Number(policy.lopBasis) || 30
}

/**
 * Classify LOP from the frozen M2 attendance rows for the period (read-only).
 * absent = 1 LOP day, half_day = 0.5. `on_leave` is treated as a paid day here (paid vs LWP
 * refinement follows M3 leave-type `is_paid`); Payroll never mutates attendance.
 */
export function lopDaysFromAttendance(rows: { status: string | null }[]): number {
  let lop = 0
  for (const r of rows) {
    if (r.status === 'absent') lop += 1
    else if (r.status === 'half_day') lop += 0.5
  }
  return lop
}

// ─────────────────────────────────────────────────────────────────────────────
// Config resolvers (effective-dated / policy — nothing hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchComponentMaster(activeOnly = false): Promise<ComponentDef[]> {
  let q = db.from('hr_component_master').select('*')
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q.order('sort_order')
  if (error) throw error
  return (data ?? []) as ComponentDef[]
}

/** Resolve the statutory config effective for a period end date into a {statute:{key:value}} map. */
export async function fetchStatutoryConfig(effectiveOn: string): Promise<StatutoryConfig> {
  const { data, error } = await db
    .from('hr_statutory_config')
    .select('statute, param_key, value, effective_from, effective_to')
    .lte('effective_from', effectiveOn)
  if (error) throw error
  const rows = ((data ?? []) as any[]).filter(
    (r) => !r.effective_to || r.effective_to >= effectiveOn,
  )
  const config: StatutoryConfig = {}
  for (const r of rows) {
    config[r.statute] = config[r.statute] ?? {}
    config[r.statute][r.param_key] = r.value
  }
  return config
}

export async function fetchPayrollPolicy(): Promise<PayrollPolicy> {
  const keys = ['payroll.lop_basis', 'payroll.rounding', 'payroll.ot_enabled']
  const [lopBasis, rounding, otEnabled] = await Promise.all(
    keys.map(async (k) => {
      const { data, error } = await db.rpc('get_hr_policy', { p_key: k, p_employee_id: null })
      if (error) throw error
      return data
    }),
  )
  return {
    lopBasis: lopBasis === 'calendar' || lopBasis == null ? 'calendar' : Number(lopBasis) || 30,
    rounding: Number(rounding) || 1,
    otEnabled: otEnabled === true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run operations (I/O) — create, compute, validate, approve, lock, payslips
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = 'draft' | 'computed' | 'approved' | 'locked' | 'paid' | 'cancelled'

export interface PayrollRun {
  id: string
  org_id: string
  period_month: number
  period_year: number
  version: number
  run_no: string | null
  status: RunStatus
  lop_basis: string | null
  is_adjustment: boolean
  original_run_id: string | null
  computed_at: string | null
  approved_by: string | null
  approved_at: string | null
  locked_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface PayrollLine {
  id: string
  run_id: string
  employee_id: string
  employee_salary_id: string | null
  payable_days: number
  lop_days: number
  gross: number
  total_earnings: number
  total_deductions: number
  total_statutory: number
  net_pay: number
  round_off: number
  remarks: string | null
}

export interface PayrollComponentLine {
  id: string
  payroll_line_id: string
  component_code: string
  component_type: string
  amount: number
  is_statutory: boolean
}

export async function fetchRuns(): Promise<PayrollRun[]> {
  const { data, error } = await db
    .from('hr_payroll_runs')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('version', { ascending: false })
  if (error) throw error
  return (data ?? []) as PayrollRun[]
}

export async function fetchRun(id: string): Promise<PayrollRun> {
  const { data, error } = await db.from('hr_payroll_runs').select('*').eq('id', id).single()
  if (error) throw error
  return data as PayrollRun
}

export async function fetchRunLines(runId: string): Promise<PayrollLine[]> {
  const { data, error } = await db.from('hr_payroll_lines').select('*').eq('run_id', runId).order('created_at')
  if (error) throw error
  return (data ?? []) as PayrollLine[]
}

export async function fetchComponentLines(lineIds: string[]): Promise<PayrollComponentLine[]> {
  if (lineIds.length === 0) return []
  const { data, error } = await db.from('hr_payroll_component_lines').select('*').in('payroll_line_id', lineIds)
  if (error) throw error
  return (data ?? []) as PayrollComponentLine[]
}

export interface CreateRunInput {
  org_id: string
  period_month: number
  period_year: number
  is_adjustment?: boolean
  original_run_id?: string | null
  notes?: string | null
}

/** Create a draft run. Version = next per (org, period); run_no is human-readable. */
export async function createRun(input: CreateRunInput, createdBy?: string | null): Promise<PayrollRun> {
  const { data: existing, error: exErr } = await db
    .from('hr_payroll_runs')
    .select('version')
    .eq('org_id', input.org_id)
    .eq('period_month', input.period_month)
    .eq('period_year', input.period_year)
    .order('version', { ascending: false })
    .limit(1)
  if (exErr) throw exErr
  const version = ((existing?.[0]?.version as number) ?? 0) + 1
  const mm = String(input.period_month).padStart(2, '0')
  const run_no = `PR-${input.period_year}-${mm}-v${version}`
  const { data, error } = await db
    .from('hr_payroll_runs')
    .insert({
      org_id: input.org_id,
      period_month: input.period_month,
      period_year: input.period_year,
      version,
      run_no,
      status: 'draft',
      is_adjustment: input.is_adjustment ?? false,
      original_run_id: input.original_run_id ?? null,
      notes: input.notes ?? null,
      created_by: createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as PayrollRun
}

/**
 * Load each employee's inputs and compute the whole run. Deterministic + idempotent:
 * a recompute deletes the run's prior lines (cascade removes component/statutory rows) and
 * reinserts, so identical inputs yield identical output. Only runs in draft/computed may
 * (re)compute. Returns the number of lines written.
 */
export async function computeRun(runId: string): Promise<number> {
  const run = await fetchRun(runId)
  if (run.status !== 'draft' && run.status !== 'computed') {
    throw new Error(`Run is ${run.status} — only draft/computed runs can be (re)computed.`)
  }

  const periodEnd = `${run.period_year}-${String(run.period_month).padStart(2, '0')}-${String(
    daysInMonth(run.period_year, run.period_month),
  ).padStart(2, '0')}`
  const periodStart = `${run.period_year}-${String(run.period_month).padStart(2, '0')}-01`

  const [master, config] = await Promise.all([
    fetchComponentMaster(true),
    fetchStatutoryConfig(periodEnd),
  ])
  const defByCode = new Map(master.map((m) => [m.code, m]))
  // Working-days basis: month − weekly offs (Sat/Sun) − holidays. Per-day rate = monthly ÷ working days.
  const { data: holRows } = await db
    .from('hr_holidays')
    .select('holiday_date')
    .eq('is_active', true)
    .gte('holiday_date', periodStart)
    .lte('holiday_date', periodEnd)
  const holidaySet = new Set(((holRows ?? []) as any[]).map((h) => h.holiday_date as string))
  const basisDays = workingDaysInMonth(run.period_year, run.period_month, holidaySet)

  // Active salary assignments effective for the period.
  const { data: salaries, error: sErr } = await db
    .from('hr_employee_salary')
    .select('*')
    .eq('status', 'active')
    .lte('effective_from', periodEnd)
  if (sErr) throw sErr
  const effective = ((salaries ?? []) as any[]).filter((s) => !s.effective_to || s.effective_to >= periodStart)

  // Supersede prior lines for this run (delete + reinsert).
  await db.from('hr_payroll_lines').delete().eq('run_id', runId)

  let written = 0
  for (const sal of effective) {
    // Resolved per-employee component values (snapshot with overrides).
    const { data: comps } = await db
      .from('hr_employee_salary_components')
      .select('*')
      .eq('employee_salary_id', sal.id)
    const salaryComponents: EngineComponent[] = ((comps ?? []) as any[])
      .map((c) => {
        const def = defByCode.get(c.component_code)
        if (!def) return null
        return {
          def,
          amount: c.amount != null ? BigInt(c.amount) : null,
          percent: c.percent != null ? Number(c.percent) : null,
        } as EngineComponent
      })
      .filter((c): c is EngineComponent => c !== null)

    // LOP from the rule-based evaluation (late/early/half/absent; short leave excused,
    // paid leave adjusted) — lop_units already nets out paid-leave-covered days.
    const { data: evalRows } = await db.rpc('evaluate_attendance', {
      p_employee: sal.employee_id, p_from: periodStart, p_to: periodEnd,
    })
    const lopDays = ((evalRows ?? []) as any[]).reduce((s, r) => s + Number(r.lop_units ?? 0), 0)
    const payableDays = Math.max(0, basisDays - lopDays)

    // Variable earnings mapped to real master components (FK-safe). Read pending/included.
    const { data: varRows } = await db
      .from('hr_variable_pay')
      .select('component_code, amount, status')
      .eq('employee_id', sal.employee_id)
      .eq('period_month', run.period_month)
      .eq('period_year', run.period_year)
      .in('status', ['pending', 'included'])
    const variableEarnings: VariableEarning[] = []
    let declaredTds = 0n
    for (const v of (varRows ?? []) as any[]) {
      const def = defByCode.get(v.component_code)
      if (!def) continue
      if (v.component_code === 'TDS') { declaredTds += BigInt(v.amount ?? 0); continue }
      if (def.type === 'earning' || def.type === 'reimbursement') {
        variableEarnings.push({ component_code: v.component_code, component_type: def.type, amount: BigInt(v.amount ?? 0) })
      }
    }

    // Loan/advance recoveries: a schedule instalment only produces a payroll line when a master
    // deduction component is configured to carry it (policy `payroll.loan_component`), preserving
    // the component-code FK + the Σ-lines-reconcile invariant. None configured → none applied.
    const recoveries: Recovery[] = []

    const grossTarget = sal.ctc != null ? BigInt(sal.ctc) / 12n : 0n
    const result = computeLine({
      salaryComponents,
      grossTarget,
      lopDays,
      payableDays,
      basisDays,
      variableEarnings,
      recoveries,
      declaredTds,
      statutoryConfig: config,
    })

    const { data: lineRow, error: lErr } = await db
      .from('hr_payroll_lines')
      .insert({
        run_id: runId,
        employee_id: sal.employee_id,
        employee_salary_id: sal.id,
        payable_days: payableDays,
        lop_days: lopDays,
        gross: result.gross.toString(),
        total_earnings: result.totalEarnings.toString(),
        total_deductions: result.totalDeductions.toString(),
        total_statutory: result.totalStatutory.toString(),
        net_pay: result.net.toString(),
        round_off: result.roundOff.toString(),
      })
      .select('id')
      .single()
    if (lErr) throw lErr
    const lineId = lineRow.id as string

    if (result.componentLines.length > 0) {
      const { error: clErr } = await db.from('hr_payroll_component_lines').insert(
        result.componentLines.map((cl) => ({
          payroll_line_id: lineId,
          component_code: cl.component_code,
          component_type: cl.component_type,
          amount: cl.amount.toString(),
          is_statutory: cl.is_statutory,
        })),
      )
      if (clErr) throw clErr
    }
    if (result.statutory.length > 0) {
      const { error: stErr } = await db.from('hr_payroll_statutory').insert(
        result.statutory.map((s) => ({
          payroll_line_id: lineId,
          statute: s.statute,
          wage_base: s.wage_base.toString(),
          employee_share: s.employee_share.toString(),
          employer_share: s.employer_share.toString(),
          details: s.details,
        })),
      )
      if (stErr) throw stErr
    }
    written += 1
  }

  await db.from('hr_payroll_runs').update({ status: 'computed', computed_at: new Date().toISOString() }).eq('id', runId)
  return written
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Run the pre-approval validation checkpoints (Process-Flow §7). Blocking failures (errors)
 * keep the run in `computed` (cannot approve); warnings are surfaced for HR review.
 */
export async function validateRun(runId: string): Promise<ValidationResult> {
  const run = await fetchRun(runId)
  const lines = await fetchRunLines(runId)
  const errors: string[] = []
  const warnings: string[] = []

  if (run.status !== 'computed') errors.push(`Run must be 'computed' to validate (is '${run.status}').`)
  if (lines.length === 0) warnings.push('No payroll lines — no active salary assignments in scope for this period.')

  const lineIds = lines.map((l) => l.id)
  const comps = await fetchComponentLines(lineIds)
  const compByLine = new Map<string, PayrollComponentLine[]>()
  for (const c of comps) {
    const arr = compByLine.get(c.payroll_line_id) ?? []
    arr.push(c)
    compByLine.set(c.payroll_line_id, arr)
  }

  for (const l of lines) {
    if (Number(l.net_pay) < 0) errors.push(`Negative net pay on a line (${l.id.slice(0, 8)}).`)
    if (Number(l.gross) < 0) errors.push(`Negative gross on a line (${l.id.slice(0, 8)}).`)
    if (!l.employee_salary_id) errors.push(`Line ${l.id.slice(0, 8)} has no salary assignment.`)
    // Σ(net-affecting component lines) must equal net + round_off.
    let sum = 0
    for (const c of compByLine.get(l.id) ?? []) {
      if (c.component_type === 'employer_contribution') continue
      sum += c.component_type === 'deduction' ? -Number(c.amount) : Number(c.amount)
    }
    if (sum !== Number(l.net_pay) + Number(l.round_off)) {
      errors.push(`Line ${l.id.slice(0, 8)}: component lines (${sum}) ≠ net + round_off (${Number(l.net_pay) + Number(l.round_off)}).`)
    }
  }

  // Duplicate active run for the same (org, period).
  const { data: dupes } = await db
    .from('hr_payroll_runs')
    .select('id, version, status')
    .eq('org_id', run.org_id)
    .eq('period_month', run.period_month)
    .eq('period_year', run.period_year)
    .in('status', ['computed', 'approved', 'locked'])
  if (((dupes ?? []) as any[]).length > 1) {
    warnings.push('Another computed/approved/locked run exists for this period — resolve before approving.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Approve a computed run (segregation of duties: the approver must differ from the creator).
 * Validation must pass first. Sets status=approved.
 */
export async function approveRun(runId: string, approverId: string): Promise<void> {
  const run = await fetchRun(runId)
  if (run.status !== 'computed') throw new Error(`Only a 'computed' run can be approved (is '${run.status}').`)
  if (run.created_by && run.created_by === approverId) {
    throw new Error('Segregation of duties: the run creator (processor) cannot approve it.')
  }
  const v = await validateRun(runId)
  if (!v.ok) throw new Error(`Validation failed: ${v.errors[0]}`)
  const { error } = await db
    .from('hr_payroll_runs')
    .update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw error
}

/** Send an approved run back to draft (rejection) for correction. */
export async function rejectRun(runId: string, note?: string | null): Promise<void> {
  const run = await fetchRun(runId)
  if (run.status !== 'computed' && run.status !== 'approved') {
    throw new Error(`Only a computed/approved run can be rejected (is '${run.status}').`)
  }
  const { error } = await db
    .from('hr_payroll_runs')
    .update({ status: 'draft', notes: note ?? run.notes, approved_by: null, approved_at: null })
    .eq('id', runId)
  if (error) throw error
}

/**
 * Lock an approved run (point of no return) and create the Finance handoff batch (status
 * 'pending'). Payroll writes ZERO Finance ledger/GL rows — Finance owns disbursement.
 */
export async function lockRun(runId: string): Promise<void> {
  const run = await fetchRun(runId)
  if (run.status !== 'approved') throw new Error(`Only an 'approved' run can be locked (is '${run.status}').`)
  const lines = await fetchRunLines(runId)
  const amountTotal = lines.reduce((acc, l) => acc + BigInt(l.net_pay), 0n)

  const { error } = await db.from('hr_payroll_runs').update({ status: 'locked', locked_at: new Date().toISOString() }).eq('id', runId)
  if (error) throw error

  // Finance handoff — the approved payroll batch (no auto-GL).
  const { data: existing } = await db.from('hr_payroll_finance_handoff').select('id').eq('run_id', runId).limit(1)
  if (((existing ?? []) as any[]).length === 0) {
    const { error: hErr } = await db.from('hr_payroll_finance_handoff').insert({
      run_id: runId,
      batch_ref: `${run.run_no ?? runId.slice(0, 8)}`,
      amount_total: amountTotal.toString(),
      status: 'pending',
    })
    if (hErr) throw hErr
  }
}

/**
 * Publish payslips for every line of a locked run (idempotent). Records one `hr_payslips`
 * row per line with a YTD snapshot; the PDF via Document Management is a stub for now
 * (`document_id` left null, generated later). Returns the number published.
 */
export async function generatePayslips(runId: string): Promise<number> {
  const run = await fetchRun(runId)
  if (run.status !== 'locked' && run.status !== 'paid') {
    throw new Error(`Payslips publish on a locked run (is '${run.status}').`)
  }
  const lines = await fetchRunLines(runId)
  const { data: existing } = await db.from('hr_payslips').select('payroll_line_id').eq('run_id', runId)
  const done = new Set(((existing ?? []) as any[]).map((r) => r.payroll_line_id))

  const toInsert = lines
    .filter((l) => !done.has(l.id))
    .map((l) => ({
      payroll_line_id: l.id,
      employee_id: l.employee_id,
      run_id: runId,
      document_id: null,
      published_at: new Date().toISOString(),
      ytd: { gross: Number(l.gross), net: Number(l.net_pay), tds: Number(l.total_statutory), period: `${run.period_year}-${run.period_month}` },
    }))
  if (toInsert.length > 0) {
    const { error } = await db.from('hr_payslips').insert(toInsert)
    if (error) throw error
  }
  return toInsert.length
}

export interface Payslip {
  id: string
  payroll_line_id: string
  employee_id: string
  run_id: string
  document_id: string | null
  published_at: string | null
  ytd: Record<string, unknown> | null
}

/** Payslips for the current user (ESS self-view) or, for HR, all / a run's payslips. */
export async function fetchPayslips(opts: { employeeId?: string | null; runId?: string | null }): Promise<Payslip[]> {
  let q = db.from('hr_payslips').select('*')
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId)
  if (opts.runId) q = q.eq('run_id', opts.runId)
  const { data, error } = await q.order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Payslip[]
}
