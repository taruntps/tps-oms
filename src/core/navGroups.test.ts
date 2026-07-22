// PR1 — navigation grouping + registry parity tests.
import { describe, it, expect } from 'vitest'
import { getNavFor } from './registry'
import { groupFor, groupNav, GROUP_ORDER } from './navGroups'
import type { NavEntry } from './moduleTypes'

const mk = (to: string, extra: Partial<NavEntry> = {}): NavEntry => ({ to, label: to, icon: 'x', ...extra })

describe('navGroups', () => {
  it('assigns groups by path prefix', () => {
    expect(groupFor(mk('/dashboard'))).toBe('Dashboard')
    expect(groupFor(mk('/hrms/payroll/runs'))).toBe('HRMS')
    expect(groupFor(mk('/finance/invoices'))).toBe('Finance')
    expect(groupFor(mk('/sales/deals'))).toBe('Finance')
    expect(groupFor(mk('/clients'))).toBe('Business')
    expect(groupFor(mk('/crm/leads'))).toBe('Business')
    expect(groupFor(mk('/reports/performance'))).toBe('Reports')
    expect(groupFor(mk('/knowledge'))).toBe('Documents')
    expect(groupFor(mk('/admin/users'))).toBe('Administration')
    expect(groupFor(mk('/settings'))).toBe('Administration')
  })

  it('an explicit group overrides the path prefix', () => {
    expect(groupFor(mk('/finance/payments', { group: 'Finance' }))).toBe('Finance')
  })

  it('orders groups per GROUP_ORDER and sorts by `order` within a group', () => {
    const entries = [mk('/finance', { order: 2 }), mk('/sales/deals', { group: 'Finance', order: 0 }), mk('/dashboard')]
    const grouped = groupNav(entries)
    expect(grouped.map((g) => g.group)).toEqual(['Dashboard', 'Finance'])
    expect(grouped[1].items.map((i) => i.to)).toEqual(['/sales/deals', '/finance'])
  })

  it('GROUP_ORDER leads with Dashboard/Business/Finance/HRMS', () => {
    expect(GROUP_ORDER.slice(0, 4)).toEqual(['Dashboard', 'Business', 'Finance', 'HRMS'])
  })
})

describe('getNavFor (registry parity)', () => {
  const nav = getNavFor('super_admin')
  const paths = nav.map((n) => n.to)

  it('surfaces the cross-cutting core + module entries', () => {
    for (const p of ['/dashboard', '/clients', '/tasks', '/reports/performance', '/crm/leads', '/finance/invoices', '/hrms/me'])
      expect(paths).toContain(p)
  })

  it('does NOT surface de-listed legacy duplicates', () => {
    for (const p of ['/attendance', '/employees', '/referrals', '/director'])
      expect(paths).not.toContain(p)
  })

  it('Finance group renders Sales → Billing → Finance → Collections in order', () => {
    const finance = groupNav(nav).find((g) => g.group === 'Finance')!
    const order = finance.items.map((i) => i.to)
    expect(order.indexOf('/sales/deals')).toBeLessThan(order.indexOf('/finance/invoices'))
    expect(order.indexOf('/finance/invoices')).toBeLessThan(order.indexOf('/finance'))
    expect(order.indexOf('/finance')).toBeLessThan(order.indexOf('/finance/payments'))
  })

  it('all HRMS entries land in the single HRMS group', () => {
    const hrms = groupNav(nav).find((g) => g.group === 'HRMS')!
    expect(hrms.items.every((i) => i.to.startsWith('/hrms'))).toBe(true)
    expect(hrms.items.length).toBeGreaterThanOrEqual(9)
  })
})
