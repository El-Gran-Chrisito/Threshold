/**
 * Invites: a subscriber gets a short code for a link. When someone pays
 * through a checkout that carries the code (as Stripe's client_reference_id),
 * the subscriber's Stripe balance is credited one month of their plan, once
 * per purchase, and never for inviting themselves.
 *
 *   POST /referral   Authorization: License THR1...   -> { code, count }
 */
import type { LicensePayload } from '../src/product/license'
import { planInfo } from '../src/product/plans'
import type { KV } from './license-server'

type Fetch = typeof fetch

export interface ReferralEnv {
  STRIPE_SECRET_KEY: string
  /** Credit per paid invite in cents; default one month of the inviter's plan. */
  REFERRAL_CREDIT_CENTS?: string
}

async function sha(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const inviteCodeFor = async (ref: string) => (await sha(`invite:${ref}`)).slice(0, 10)
export const isInviteCode = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{10}$/.test(s)

/** The subscriber's code, remembered so a purchase can find them; and how many paid invites so far. */
export async function referralFor(kv: KV, p: LicensePayload): Promise<{ code: string; count: number }> {
  const code = await inviteCodeFor(p.ref!)
  await kv.put(`m:ref:${code}`, JSON.stringify({ ref: p.ref, email: p.email ?? null, plan: p.plan }))
  return { code, count: Number(await kv.get(`m:refcount:${code}`)) || 0 }
}

/** Credit the inviter for a completed checkout. Returns true when a credit was made. */
export async function creditInviter(env: ReferralEnv, kv: KV, code: string, purchase: { sessionId: string; email: string | null }, fetchImpl: Fetch): Promise<boolean> {
  if (!isInviteCode(code)) return false
  const done = `m:refpaid:${purchase.sessionId}`
  if (await kv.get(done)) return false
  const who = JSON.parse((await kv.get(`m:ref:${code}`)) ?? 'null') as { ref?: string; email?: string | null; plan?: 'pro' | 'studio' } | null
  if (!who?.ref?.startsWith('sub_')) return false
  if (who.email && purchase.email && who.email.toLowerCase() === purchase.email.toLowerCase()) return false
  const auth = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
  try {
    const subRes = await fetchImpl(`https://api.stripe.com/v1/subscriptions/${who.ref}`, { headers: auth })
    if (!subRes.ok) return false
    const sub = (await subRes.json()) as { status: string; customer?: string | { id: string } }
    const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    if (!customer || !['active', 'trialing', 'past_due'].includes(sub.status)) return false
    const cents = Number(env.REFERRAL_CREDIT_CENTS) || planInfo(who.plan ?? 'pro').monthly * 100
    const body = new URLSearchParams({ amount: String(-cents), currency: 'usd', description: 'Threshold invite credit', 'metadata[checkout_session]': purchase.sessionId })
    const res = await fetchImpl(`https://api.stripe.com/v1/customers/${customer}/balance_transactions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `invite-${purchase.sessionId}` },
      body,
    })
    if (!res.ok) return false
  } catch {
    return false
  }
  await kv.put(done, '1')
  await kv.put(`m:refcount:${code}`, String((Number(await kv.get(`m:refcount:${code}`)) || 0) + 1))
  return true
}
