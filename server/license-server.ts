/**
 * License server: turns a completed Stripe Checkout into a signed license
 * key, and renews subscription keys while the subscription is paid.
 *
 *   POST /activate  { "sessionId": "cs_..." }  ->  { key, plan, email }
 *                   Subscriptions get keys that renew; one-time payments get
 *                   keys that last `days` (price metadata) or forever.
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
 *   DESIGNS               optional key-value store (Cloudflare KV) for syncing
 *                         paid customers' designs across devices:
 *
 *   POST /designs/list    -> { designs: [{ id, name, updatedAt }] }
 *   POST /designs/get     { id }                        -> { json }
 *   POST /designs/put     { id, name, updatedAt, json }  -> { ok }
 *   POST /designs/delete  { id }                         -> { ok }
 *
 * Design routes take the customer's license key as `Authorization: License THR1...`.
 */
import { signLicense, verifyLicense, type LicensePayload } from '../src/product/license'
import { PASS } from '../src/product/plans'

/** The part of a Cloudflare KV namespace this server uses. */
export interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string; limit?: number }): Promise<{ keys: Array<{ name: string; metadata?: unknown }> }>
}

export interface Env {
  STRIPE_SECRET_KEY: string
  LICENSE_PRIVATE_KEY: string
  PRICE_PLANS?: string
  ALLOWED_ORIGIN?: string
  DESIGNS?: KV
}

const MAX_DESIGN_BYTES = 2_000_000
const MAX_DESIGNS = 300

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
    'access-control-allow-headers': 'content-type, authorization',
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

/**
 * How long a one-time purchase lasts: a `days` metadata value on the session,
 * price or product, else PASS.days when the price is named as a pass, else
 * forever (a lifetime deal).
 */
export function daysForPurchase(session: Pick<StripeSession, 'metadata'>, price: StripePrice | undefined): number | null {
  const product = price && typeof price.product === 'object' ? price.product : undefined
  for (const raw of [session.metadata?.days, price?.metadata?.days, product?.metadata?.days]) {
    const n = Number(raw)
    if (raw && Number.isFinite(n) && n > 0) return Math.round(n)
  }
  const hint = [price?.lookup_key, product?.name, price?.metadata?.plan, product?.metadata?.plan].filter(Boolean).join(' ').toLowerCase()
  return hint.includes('pass') ? PASS.days : null
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
    const days = s.mode === 'subscription' ? null : daysForPurchase(s, s.line_items?.data?.[0]?.price)
    const payload: LicensePayload = {
      v: 1,
      plan,
      email: s.customer_details?.email ?? undefined,
      name: s.customer_details?.name ?? undefined,
      ref: sub?.id ?? (typeof s.subscription === 'string' ? s.subscription : s.id),
      iat: now,
      exp: s.mode === 'subscription' ? (end ?? now + 32 * 86_400_000) + GRACE_MS : days ? now + days * 86_400_000 : null,
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

  if (path.includes('/designs/')) return designs(request, path, body, env, publicFromPrivate(privateJwk))

  return json(env, { error: 'Not found' }, 404)
}

async function ownerKey(payload: LicensePayload): Promise<string> {
  const who = payload.ref || payload.email || ''
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(who)))
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function designs(request: Request, path: string, body: Record<string, unknown>, env: Env, publicJwk: JsonWebKey): Promise<Response> {
  if (!env.DESIGNS) return json(env, { error: 'Design sync is not set up' }, 501)
  const key = (request.headers.get('authorization') ?? '').replace(/^License\s+/i, '')
  const v = await verifyLicense(key, publicJwk)
  if (!v.ok) return json(env, { error: v.reason === 'expired' ? 'License expired' : 'License required' }, 401)
  if (!v.payload.ref && !v.payload.email) return json(env, { error: 'This license cannot sync' }, 403)
  const prefix = `d:${await ownerKey(v.payload)}:`
  const kv = env.DESIGNS
  const id = String(body.id ?? '')
  const validId = /^prj_[A-Za-z0-9_-]{1,64}$/.test(id)

  if (path.endsWith('/designs/list')) {
    const { keys } = await kv.list({ prefix, limit: MAX_DESIGNS })
    const list = keys.map((k) => ({ id: k.name.slice(prefix.length), ...(k.metadata as { name?: string; updatedAt?: number }) }))
    return json(env, { designs: list })
  }
  if (!validId) return json(env, { error: 'Missing design id' }, 400)
  if (path.endsWith('/designs/get')) {
    const value = await kv.get(prefix + id)
    return value === null ? json(env, { error: 'Not found' }, 404) : json(env, { json: value })
  }
  if (path.endsWith('/designs/put')) {
    const text = String(body.json ?? '')
    if (!text || text.length > MAX_DESIGN_BYTES) return json(env, { error: 'Design too large' }, 413)
    const { keys } = await kv.list({ prefix, limit: MAX_DESIGNS + 1 })
    if (keys.length >= MAX_DESIGNS && !keys.some((k) => k.name === prefix + id)) return json(env, { error: 'Too many designs' }, 409)
    await kv.put(prefix + id, text, { metadata: { name: String(body.name ?? 'Home').slice(0, 120), updatedAt: Number(body.updatedAt) || Date.now() } })
    return json(env, { ok: true })
  }
  if (path.endsWith('/designs/delete')) {
    await kv.delete(prefix + id)
    return json(env, { ok: true })
  }
  return json(env, { error: 'Not found' }, 404)
}
