/**
 * Stripe webhook: refunds and chargebacks revoke a purchase on the server.
 * A revoked purchase gets no new keys (activate, recover, renew) and no
 * server features (design sync, hosted assistant, invites). Keys already
 * handed out keep unlocking the app offline until they expire.
 *
 *   POST /stripe-webhook   (Stripe-Signature header, STRIPE_WEBHOOK_SECRET)
 *
 * Events: charge.refunded (full refunds only), charge.dispute.created.
 */
import type { KV } from './license-server'
import { count } from './stats'

type Fetch = typeof fetch

export interface WebhookEnv {
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET?: string
}

const TOLERANCE_S = 300

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Stripe's signature: HMAC-SHA256 of "timestamp.body" with the endpoint secret. */
export async function stripeSignature(secret: string, timestamp: number, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)))
}

export async function verifyStripeSignature(secret: string, header: string, payload: string, nowS: number): Promise<boolean> {
  const parts = header.split(',').map((p) => p.split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length || Math.abs(nowS - t) > TOLERANCE_S) return false
  const expected = await stripeSignature(secret, t, payload)
  // Compare without stopping at the first difference.
  return sigs.some((s) => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0)
}

export const revokedKey = (ref: string) => `m:revoked:${ref}`

export async function isRevoked(kv: KV | undefined, ...refs: Array<string | null | undefined>): Promise<boolean> {
  if (!kv) return false
  for (const r of refs) if (r && (await kv.get(revokedKey(r)))) return true
  return false
}

interface Charge {
  id: string
  payment_intent?: string | null
  amount?: number
  amount_refunded?: number
  refunded?: boolean
}

export async function handleWebhook(env: WebhookEnv, kv: KV | undefined, request: Request, fetchImpl: Fetch, nowS = Math.floor(Date.now() / 1000)): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!env.STRIPE_WEBHOOK_SECRET || !kv) return { status: 501, body: { error: 'Webhook not set up' } }
  const payload = await request.text()
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature') ?? '', payload, nowS))) return { status: 400, body: { error: 'Bad signature' } }
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } }
  let charge: Charge | null = null
  let reason = ''
  if (event.type === 'charge.refunded') {
    const c = event.data.object as unknown as Charge
    // Partial refunds (goodwill discounts) keep the purchase.
    if (c.refunded || (c.amount && c.amount_refunded && c.amount_refunded >= c.amount)) {
      charge = c
      reason = 'refunded'
    }
  } else if (event.type === 'charge.dispute.created') {
    const d = event.data.object as { charge?: string; payment_intent?: string | null }
    charge = { id: d.charge ?? '', payment_intent: d.payment_intent ?? null }
    reason = 'disputed'
  }
  if (!charge?.payment_intent) return { status: 200, body: { received: true } }
  const res = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(charge.payment_intent)}&limit=1`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })
  const sessions = res.ok ? ((await res.json()) as { data: Array<{ id: string; subscription?: string | null }> }).data : []
  const refs = sessions.flatMap((s) => [s.id, s.subscription ?? null]).filter((r): r is string => !!r)
  for (const r of refs) await kv.put(revokedKey(r), reason)
  if (refs.length) await count(kv, 'revoked')
  return { status: 200, body: { received: true, revoked: refs.length } }
}
