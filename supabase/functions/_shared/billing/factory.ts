// Edge (Deno) — Billing framework: provider factory.
//
// Picks the concrete BillingProvider from server env. Defaults to InternalProvider
// (safe on staging with no creds). Only returns GetSwipeAdapter when
// BILLING_PROVIDER='getswipe' AND GETSWIPE_API_KEY is present — otherwise it falls
// back to internal so the worker never makes external calls without a key.

import { BillingProvider } from './interface.ts'
import { InternalProvider } from './internalProvider.ts'
import { GetSwipeAdapter } from './getswipeAdapter.ts'
import { BillingEnv, isGetSwipeConfigured, readBillingEnv } from './config.ts'

export function getProvider(env: BillingEnv = readBillingEnv()): BillingProvider {
  if (isGetSwipeConfigured(env)) {
    return new GetSwipeAdapter(env)
  }
  return new InternalProvider()
}
