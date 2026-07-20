// Edge (Deno) — Billing framework config. Reads ALL secrets from Deno.env ONLY.
// NEVER logs or returns secret VALUES. `redact()` produces safe log strings.
//
// Expected environment (set as Supabase secrets in prod/staging — never in code):
//   BILLING_PROVIDER        internal | getswipe   (default: internal)
//   GETSWIPE_BASE_URL       e.g. https://app.getswipe.in/api/partner
//   GETSWIPE_API_KEY        Bearer JWT from the Swipe dashboard
//   GETSWIPE_BUSINESS_ID    Swipe business/company id
//   GETSWIPE_WEBHOOK_SECRET HMAC-SHA256 secret for X-Signature verification
//
// On staging without creds, BILLING_PROVIDER stays 'internal' and no external
// calls are made. The GetSwipe adapter fails safe (throws) if selected without a key.

export type BillingProviderName = 'internal' | 'getswipe'

export interface BillingEnv {
  provider: BillingProviderName
  getswipe: {
    baseUrl: string
    apiKey: string
    businessId: string
    webhookSecret: string
  }
}

/** Read typed billing config from Deno.env. Missing values become empty strings. */
export function readBillingEnv(): BillingEnv {
  const rawProvider = (Deno.env.get('BILLING_PROVIDER') ?? 'internal').trim().toLowerCase()
  const provider: BillingProviderName = rawProvider === 'getswipe' ? 'getswipe' : 'internal'

  return {
    provider,
    getswipe: {
      baseUrl: (Deno.env.get('GETSWIPE_BASE_URL') ?? 'https://app.getswipe.in/api/partner').trim(),
      apiKey: (Deno.env.get('GETSWIPE_API_KEY') ?? '').trim(),
      businessId: (Deno.env.get('GETSWIPE_BUSINESS_ID') ?? '').trim(),
      webhookSecret: (Deno.env.get('GETSWIPE_WEBHOOK_SECRET') ?? '').trim(),
    },
  }
}

/** True only when GetSwipe is selected AND an API key is present. */
export function isGetSwipeConfigured(env: BillingEnv = readBillingEnv()): boolean {
  return env.provider === 'getswipe' && env.getswipe.apiKey.length > 0
}

/**
 * Redact a value for logs — NEVER prints the actual secret. Returns a short,
 * non-reversible descriptor (present/absent + length) so logs are useful but safe.
 */
export function redact(value: string | null | undefined): string {
  if (!value) return '<absent>'
  return `<present:len=${value.length}>`
}

/** A one-line, secret-free summary of the current billing config for logs. */
export function describeBillingEnv(env: BillingEnv = readBillingEnv()): string {
  return [
    `provider=${env.provider}`,
    `getswipe.baseUrl=${env.getswipe.baseUrl || '<absent>'}`,
    `getswipe.apiKey=${redact(env.getswipe.apiKey)}`,
    `getswipe.businessId=${redact(env.getswipe.businessId)}`,
    `getswipe.webhookSecret=${redact(env.getswipe.webhookSecret)}`,
  ].join(' ')
}
