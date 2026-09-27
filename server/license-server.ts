/**
 * License server: turns a completed Stripe Checkout into a signed license
 * key, and renews subscription keys while the subscription is paid.
 *
 *   POST /activate  { "sessionId": "cs_..." }  ->  { key, plan, email }
 *   POST /refresh   { "key": "THR1...." }     ->  { key }
 *
 * Written against the web-standard Request/Response API, so it runs on
 * Cloudflare Workers (see worker.ts), Vercel and Netlify edge functions,
 * Deno and Bun without changes. Settings come from `env`:
 *
 *   STRIPE_SECRET_KEY     sk_live_... (or sk_test_...)
 *   LICENSE_PRIVATE_KEY   the private JWK from `bun run license init`
 *   PRICE_PLANS           optional JSON map of Stripe price ids to plans,
 *                         e.g. {"price_123":"pro","price_456":"studio"}
 *   ALLOWED_ORIGIN        optional; the site allowed to call this (default *)
 */
import { signLicense, verifyLicense, type LicensePayload } from '../src/product/license'

export interface Env {
  STRIPE_SECRET_KEY: string
  LICENSE_PRIVATE_KEY: string
  PRICE_PLANS?: string
  ALLOWED_ORIGIN?: string
}

type Fetch = typeof fetch
type Plan = LicensePayload['plan']

/** Days a subscription key keeps working after the paid period, to cover renewal retries. */
const GRACE_MS = 3 * 86_400_000

interface StripePrice {
  id: string
  lookup_key?: string | null
  metadata?: Record<string, string>
  product?: string | { metadata?: Record<string, string>; name?: string }
}

interface StripeSubscription {
  id: string
  status: string
  current_period_end?: number
  items?: { data: Array<{ current_period_end?: number; price?: StripePrice }> }
}

interface StripeSession {
  id: string
  status: string
  payment_status: string
  mode: string
  customer_details?: { email?: string | null; name?: string | null } | null
  metadata?: Record<string, string>
  subscription?: string | StripeSubscription | null
  line_items?: { data: Array<{ price?: StripePrice }> }
}

function cors(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  }
}

function json(env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(env) } })
}

async function stripe<T>(env: Env, path: string, fetchImpl: Fetch): Promise<T> {
  const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } })
  if (!res.ok) throw new Error(`stripe ${res.status}`)
  return (await res.json()) as T
}

/** Which plan a price sells: the PRICE_PLANS map, then price or product metadata, then the lookup key or product name. */
export function planForPrice(price: StripePrice | undefined, env: Env): Plan | null {
  if (!price) return null
  try {
    const map = env.PRICE_PLANS ? (JSON.parse(env.PRICE_PLANS) as Record<string, string>) : {}
    const p = map[price.id]
    if (p === 'pro' || p === 'studio') return p
  } catch {
    /* ignore a malformed map */
  }
  const product = typeof price.product === 'object' ? price.product : undefined
  const hint = [price.metadata?.plan, product?.metadata?.plan, price.lookup_key, product?.name].filter(Boolean).join(' ').toLowerCase()
  if (hint.includes('studio')) return 'studio'
  if (hint.includes('pro')) return 'pro'
  return null
}

function periodEnd(sub: StripeSubscription): number | null {
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  return end ? end * 1000 : null
}

function publicFromPrivate(jwk: JsonWebKey): JsonWebKey {
  const { kty, crv, x, y } = jwk
  return { kty, crv, x, y }
}

export async function handle(request: Request, env: Env, fetchImpl: Fetch = fetch): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })
  if (request.method !== 'POST') return json(env, { error: 'Use POST' }, 405)
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json(env, { error: 'Send a JSON body' }, 400)
  }
  const privateJwk = JSON.parse(env.LICENSE_PRIVATE_KEY) as JsonWebKey
  const now = Date.now()

  if (path.endsWith('/activate')) {
    const id = String(body.sessionId ?? '')
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(env, { error: 'Missing checkout session' }, 400)
    let s: StripeSession
    try {
      s = await stripe<StripeSession>(env, `checkout/sessions/${id}?expand[]=line_items.data.price.product&expand[]=subscription`, fetchImpl)
    } catch {
      return json(env, { error: 'Checkout session not found' }, 404)
    }
    if (s.status !== 'complete' || (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required')) return json(env, { error: 'Payment is not complete yet' }, 402)
    const plan = (s.metadata?.plan === 'studio' || s.metadata?.plan === 'pro' ? (s.metadata.plan as Plan) : null) ?? planForPrice(s.line_items?.data?.[0]?.price, env)
    if (!plan) return json(env, { error: 'This purchase is not linked to a plan' }, 422)
    const sub = typeof s.subscription === 'object' && s.subscription ? s.subscription : null
    const end = sub ? periodEnd(sub) : null
    const payload: LicensePayload = {
      v: 1,
      plan,
      email: s.customer_details?.email ?? undefined,
      name: s.customer_details?.name ?? undefined,
      ref: sub?.id ?? (typeof s.subscription === 'string' ? s.subscription : s.id),
      iat: now,
      exp: s.mode === 'subscription' ? (end ?? now + 32 * 86_400_000) + GRACE_MS : null,
    }
    return json(env, { key: await signLicense(payload, privateJwk), plan, email: payload.email ?? null })
  }

  if (path.endsWith('/refresh')) {
    const key = String(body.key ?? '')
    // Expired keys may renew; the signature must still be ours.
    const v = await verifyLicense(key, publicFromPrivate(privateJwk), 0)
    if (!v.ok) return json(env, { error: 'Not a valid license key' }, 400)
    const ref = v.payload.ref ?? ''
    if (!ref.startsWith('sub_')) return json(env, { error: 'This license does not renew' }, 400)
    let sub: StripeSubscription
    try {
      sub = await stripe<StripeSubscription>(env, `subscriptions/${ref}`, fetchImpl)
    } catch {
      return json(env, { error: 'Subscription not found' }, 404)
    }
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return json(env, { error: 'The subscription has ended' }, 403)
    const end = periodEnd(sub) ?? now + 32 * 86_400_000
    return json(env, { key: await signLicense({ ...v.payload, iat: now, exp: end + GRACE_MS }, privateJwk) })
  }

  return json(env, { error: 'Not found' }, 404)
}
