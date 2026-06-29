import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Currency ────────────────────────────────────────────────────────────────
// Singleton formatters — Intl constructors are expensive; reuse across calls.
const _rupeeFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})
export function formatRupees(paise: number): string {
  return _rupeeFmt.format(paise / 100)
}

// ── Dates ────────────────────────────────────────────────────────────────────
const _dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const _dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return _dateFmt.format(new Date(date))
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  return _dateTimeFmt.format(new Date(date))
}

// ── Time elapsed ─────────────────────────────────────────────────────────────
export function formatTimeElapsed(minutes: number): string {
  if (minutes < 1) return '< 1m'
  if (minutes < 60) return `${minutes}m`
  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0 && days === 0) parts.push(`${mins}m`)
  return parts.join(' ')
}

export function minutesSince(date: Date | string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
}

// ── License expiry ───────────────────────────────────────────────────────────
export function getExpiryStatus(expiryDate: Date | string | null): 'safe' | 'warn' | 'urgent' | 'none' {
  if (!expiryDate) return 'none'
  const days = Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000)
  if (days > 90) return 'safe'
  if (days > 30) return 'warn'
  return 'urgent'
}

export function daysUntil(date: Date | string | null): number | null {
  if (!date) return null
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
}

// ── Project code ─────────────────────────────────────────────────────────────
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Clock type helpers ────────────────────────────────────────────────────────
export const CLOCK_CONFIG = {
  EMPLOYEE:  { color: 'text-clock-employee',  dot: 'clock-dot-employee',  label: 'TPS',             bg: 'bg-green-50',  border: 'border-green-200' },
  CLIENT:    { color: 'text-clock-client',    dot: 'clock-dot-client',    label: 'Pending: Client',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  AUTHORITY: { color: 'text-clock-authority', dot: 'clock-dot-authority', label: 'Pending: FSSAI',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
} as const
