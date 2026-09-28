/**
 * License server: turns a completed Stripe Checkout into a signed license
 * key, and renews subscription keys while the subscription is paid.
 *
 *   POST /activate  { "sessionId": "cs_..." }  ->  { key, plan, email }
 *                   Subscriptions get keys that renew; one-time payments get
 *                   keys that last `days` (price metadata) or forever.
 *   POST /refresh   { "key": "THR1...." }     ->  { key }
 *   POST /trial     { plan? }                   ->  { key } a 7-day Pro (or Studio) trial key, one per
 *                   network per 30 days (needs DESIGNS for the count)
 *   POST /referral  (license)                   ->  { code, count } invite code (see referral.ts)
 *   POST /send-design, /leads                   ->  email a design link; tips list (leads.ts)
 *   POST /stripe-webhook                        ->  refunds and disputes revoke (webhook.ts)
 *   POST /stats     (ADMIN_TOKEN)               ->  daily counts for the owner (stats.ts)
 *   POST /health                                ->  which optional features are switched on
 *   POST /recover   { "email": "..." }          ->  { ok } and, if that email
 *                   bought a plan or pass, an email with the key
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
 *   RESEND_API_KEY        optional; emails each buyer their key (resend.com)
 *   EMAIL_FROM            sender for those emails, e.g. "Threshold <keys@your-site>"
 *   SUPPORT_EMAIL         optional reply-to address for those emails
 *   ANTHROPIC_API_KEY     optional; runs the design assistant for paying
 *                         customers outside Claude (see assistant.ts)
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
import { allows, PASS } from '../src/product/plans'
import { askClaude, checkRequest, type AssistantEnv } from './assistant'
import { creditInviter, referralFor, type ReferralEnv } from './referral'
import { leadsCsv, sendDesign, type LeadsEnv } from './leads'
import { handleWebhook, isRevoked, type WebhookEnv } from './webhook'
import { count, statsReport } from './stats'

/** The part of a Cloudflare KV namespace this server uses. */
export interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { metadata?: unknown }): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string; limit?: number }): Promise<{ keys: Array<{ name: string; metadata?: unknown }> }>
}

export interface Env extends AssistantEnv, ReferralEnv, LeadsEnv, WebhookEnv {
  STRIPE_SECRET_KEY: string
  LICENSE_PRIVATE_KEY: string
  PRICE_PLANS?: string
  ALLOWED_ORIGIN?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  SUPPORT_EMAIL?: string
  /** Assistant requests per trial per day (default 10). */
  TRIAL_ASSISTANT_DAILY_LIMIT?: string
  DESIGNS?: KV
}

const TRIAL_DAYS = 7

const MAX_DESIGN_BYTES = 2_000_000
const MAX_DESIGNS = 300

type Fetch = typeof fetch
type Plan = LicensePayload['plan']

/** Days a subscription key keeps working after the paid period, to cover renewal retries. */
const GRACE_MS = 3 * 86_400_000

interface StripePrice {
  id: string
  lookup_key?: string | null
  recurring?: { interval?: string } | null
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
  client_reference_id?: string | null
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

/** Monthly or yearly, from the price's billing interval. */
export function billingOf(price: StripePrice | undefined): 'monthly' | 'yearly' | undefined {
  const i = price?.recurring?.interval
  return i === 'year' ? 'yearly' : i === 'month' ? 'monthly' : undefined
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
  if (path.endsWith('/health')) {
    const email = !!(env.RESEND_API_KEY && env.EMAIL_FROM)
    const store = !!env.DESIGNS
    return json(env, {
      ok: true,
      features: {
        keyEmails: email,
        designSync: store,
        assistant: !!env.ANTHROPIC_API_KEY,
        trials: store,
        invites: store,
        designEmails: email && store && !!env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*',
        refunds: store && !!env.STRIPE_WEBHOOK_SECRET,
        ownerTools: store && (env.ADMIN_TOKEN?.length ?? 0) >= 24,
      },
    })
  }
  if (path.endsWith('/stripe-webhook')) {
    const r = await handleWebhook(env, env.DESIGNS, request, fetchImpl)
    return json(env, r.body, r.status)
  }
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
    const r = await keyForSession(env, id, privateJwk, now, fetchImpl)
    if (!r.ok) return json(env, { error: r.error }, r.status)
    if (env.DESIGNS && !(await env.DESIGNS.get(`m:seen:${id}`))) {
      await env.DESIGNS.put(`m:seen:${id}`, '1')
      await count(env.DESIGNS, 'purchase', now)
    }
    let emailed = false
    if (r.issued.email && canEmail(env)) {
      // Once per purchase: a repeated claim of the same checkout does not email again.
      const mark = `m:sent:${id}`
      if (!(await env.DESIGNS?.get(mark))) {
        emailed = await sendKeys(env, r.issued.email, [r.issued], fetchImpl)
        if (emailed) {
          await env.DESIGNS?.put(mark, '1')
          await count(env.DESIGNS, 'key_email', now)
        }
      }
    }
    if (r.issued.invite && env.DESIGNS && (await creditInviter(env, env.DESIGNS, r.issued.invite, { sessionId: id, email: r.issued.email }, fetchImpl))) await count(env.DESIGNS, 'invite_credit', now)
    return json(env, { key: r.issued.key, plan: r.issued.plan, email: r.issued.email, emailed })
  }

  if (path.endsWith('/referral')) {
    if (!env.DESIGNS) return json(env, { error: 'Invites are not set up here' }, 501)
    const v = await verifyLicense((request.headers.get('authorization') ?? '').replace(/^License\s+/i, ''), publicFromPrivate(privateJwk))
    if (!v.ok) return json(env, { error: 'License required' }, 401)
    if (!v.payload.ref?.startsWith('sub_') || (await isRevoked(env.DESIGNS, v.payload.ref))) return json(env, { error: 'Invites are for subscribers' }, 403)
    return json(env, await referralFor(env.DESIGNS, v.payload))
  }

  if (path.endsWith('/trial')) {
    if (!env.DESIGNS) return json(env, { error: 'Trials are kept in the browser on this site' }, 501)
    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const mark = `m:trial:${await hash(ip || 'unknown')}`
    const last = Number(await env.DESIGNS.get(mark)) || 0
    if (last && now - last < 30 * 86_400_000) return json(env, { error: 'This network has already had a trial recently' }, 429)
    await env.DESIGNS.put(mark, String(now))
    const ref = `trial_${Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('')}`
    const plan: Plan = body.plan === 'studio' ? 'studio' : 'pro'
    const key = await signLicense({ v: 1, plan, ref, iat: now, exp: now + TRIAL_DAYS * 86_400_000, trial: true }, privateJwk)
    await count(env.DESIGNS, 'trial', now)
    return json(env, { key })
  }

  if (path.endsWith('/send-design')) {
    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const r = await sendDesign(env, env.DESIGNS, body, ip, now, fetchImpl)
    return json(env, r.body, r.status)
  }

  if (path.endsWith('/stats')) {
    const r = await statsReport(env.DESIGNS, env.ADMIN_TOKEN, request.headers.get('authorization') ?? '', Number(body.days) || 30, now)
    return json(env, r.body, r.status)
  }

  if (path.endsWith('/leads')) {
    const r = await leadsCsv(env, env.DESIGNS, request.headers.get('authorization') ?? '')
    return r.csv ? new Response(r.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', ...cors(env) } }) : json(env, { error: 'Not allowed' }, r.status)
  }

  if (path.endsWith('/recover')) {
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase()
    if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(env, { error: 'Enter the email address you paid with' }, 400)
    if (!canEmail(env)) return json(env, { error: 'Key recovery by email is not set up here. Please write to support.' }, 501)
    // At most 3 requests per address per hour when a store is available.
    if (env.DESIGNS) {
      const rl = `m:rl:${await hash(email)}:${Math.floor(now / 3_600_000)}`
      const n = Number(await env.DESIGNS.get(rl)) || 0
      if (n >= 3) return json(env, { ok: true })
      await env.DESIGNS.put(rl, String(n + 1))
    }
    let sessions: Array<{ id: string; created?: number }> = []
    try {
      const list = await stripe<{ data: Array<{ id: string; created?: number }> }>(env, `checkout/sessions?status=complete&limit=10&customer_details%5Bemail%5D=${encodeURIComponent(email)}`, fetchImpl)
      sessions = [...list.data].sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, 5)
    } catch {
      sessions = []
    }
    const keys: Issued[] = []
    for (const cs of sessions) {
      const r = await keyForSession(env, cs.id, privateJwk, now, fetchImpl)
      if (r.ok && (r.issued.exp === null || r.issued.exp > now) && !keys.some((k) => k.ref === r.issued.ref)) keys.push(r.issued)
    }
    if (keys.length && (await sendKeys(env, email, keys, fetchImpl))) await count(env.DESIGNS, 'recover', now)
    // The same answer whether or not the address bought anything.
    return json(env, { ok: true })
  }

  if (path.endsWith('/refresh')) {
    const key = String(body.key ?? '')
    // Expired keys may renew; the signature must still be ours.
    const v = await verifyLicense(key, publicFromPrivate(privateJwk), 0)
    if (!v.ok) return json(env, { error: 'Not a valid license key' }, 400)
    const ref = v.payload.ref ?? ''
    if (!ref.startsWith('sub_')) return json(env, { error: 'This license does not renew' }, 400)
    if (await isRevoked(env.DESIGNS, ref)) return json(env, { error: 'This purchase was refunded' }, 403)
    let sub: StripeSubscription
    try {
      sub = await stripe<StripeSubscription>(env, `subscriptions/${ref}`, fetchImpl)
    } catch {
      return json(env, { error: 'Subscription not found' }, 404)
    }
    if (!['active', 'trialing', 'past_due'].includes(sub.status)) return json(env, { error: 'The subscription has ended' }, 403)
    const end = periodEnd(sub) ?? now + 32 * 86_400_000
    // The customer may have switched between monthly and yearly in the billing portal.
    const billing = billingOf(sub.items?.data?.[0]?.price) ?? v.payload.billing
    return json(env, { key: await signLicense({ ...v.payload, iat: now, exp: end + GRACE_MS, ...(billing ? { billing } : {}) }, privateJwk) })
  }

  if (path.includes('/designs/')) return designs(request, path, body, env, publicFromPrivate(privateJwk))

  if (path.endsWith('/assistant')) {
    const v = await verifyLicense((request.headers.get('authorization') ?? '').replace(/^License\s+/i, ''), publicFromPrivate(privateJwk))
    if (!v.ok) return json(env, { code: 'not_granted', message: v.reason === 'expired' ? 'License expired' : 'License required' }, 401)
    if (!allows(v.payload.plan, 'assistant')) return json(env, { code: 'not_granted', message: 'The assistant is part of Pro' }, 403)
    if (await isRevoked(env.DESIGNS, v.payload.ref)) return json(env, { code: 'not_granted', message: 'This purchase was refunded' }, 403)
    const req = checkRequest(body)
    if ('ok' in req) return json(env, { code: req.code, message: req.message }, req.status)
    if (env.DESIGNS) {
      const limit = v.payload.trial ? Number(env.TRIAL_ASSISTANT_DAILY_LIMIT) || 10 : Number(env.ASSISTANT_DAILY_LIMIT) || 60
      const k = `m:ai:${await ownerKey(v.payload)}:${Math.floor(now / 86_400_000)}`
      const used = Number(await env.DESIGNS.get(k)) || 0
      if (used >= limit) return json(env, { code: 'daily_limit', message: `You have used today's ${limit} assistant requests. They reset at midnight UTC.` }, 429)
      await env.DESIGNS.put(k, String(used + 1))
    }
    const r = await askClaude(env, req, fetchImpl)
    if (r.ok) await count(env.DESIGNS, 'assistant', now)
    return r.ok ? json(env, { json: r.json }) : json(env, { code: r.code, message: r.message }, r.status)
  }

  return json(env, { error: 'Not found' }, 404)
}

interface Issued {
  /** The invite code the checkout carried, if any. */
  invite: string | null
  key: string
  plan: Plan
  email: string | null
  ref: string
  exp: number | null
}

type KeyResult = { ok: true; issued: Issued } | { ok: false; status: number; error: string }

/** The signed key a completed checkout session pays for. */
async function keyForSession(env: Env, id: string, privateJwk: JsonWebKey, now: number, fetchImpl: Fetch): Promise<KeyResult> {
  let s: StripeSession
  try {
    s = await stripe<StripeSession>(env, `checkout/sessions/${id}?expand[]=line_items.data.price.product&expand[]=subscription`, fetchImpl)
  } catch {
    return { ok: false, status: 404, error: 'Checkout session not found' }
  }
  if (s.status !== 'complete' || (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required')) return { ok: false, status: 402, error: 'Payment is not complete yet' }
  const plan = (s.metadata?.plan === 'studio' || s.metadata?.plan === 'pro' ? (s.metadata.plan as Plan) : null) ?? planForPrice(s.line_items?.data?.[0]?.price, env)
  if (!plan) return { ok: false, status: 422, error: 'This purchase is not linked to a plan' }
  const sub = typeof s.subscription === 'object' && s.subscription ? s.subscription : null
  if (sub && !['active', 'trialing', 'past_due'].includes(sub.status)) return { ok: false, status: 403, error: 'The subscription has ended' }
  if (await isRevoked(env.DESIGNS, s.id, sub?.id)) return { ok: false, status: 403, error: 'This purchase was refunded' }
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
    ...(s.mode === 'subscription' && billingOf(s.line_items?.data?.[0]?.price) ? { billing: billingOf(s.line_items?.data?.[0]?.price) } : {}),
  }
  return { ok: true, issued: { key: await signLicense(payload, privateJwk), plan, email: payload.email ?? null, ref: payload.ref!, exp: payload.exp, invite: s.client_reference_id ?? null } }
}

const canEmail = (env: Env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM)

/** The email a buyer keeps: each key, how to use it, and when it ends. */
export function keyEmail(keys: Array<Pick<Issued, 'key' | 'plan' | 'exp' | 'ref'>>): { subject: string; text: string } {
  const name = (p: Plan) => (p === 'studio' ? 'Studio' : 'Pro')
  const parts = keys.map((k) => {
    const ends = k.ref.startsWith('sub_') ? 'It renews while your subscription is active.' : k.exp ? `It works until ${new Date(k.exp).toUTCString().slice(5, 16)}.` : 'It does not expire.'
    return `Threshold ${name(k.plan)} license key:\n\n${k.key}\n\n${ends}`
  })
  return {
    subject: keys.length > 1 ? 'Your Threshold license keys' : `Your Threshold ${name(keys[0].plan)} license key`,
    text: [
      'Thank you for choosing Threshold.',
      ...parts,
      'To use a key on any device: open Threshold, press Upgrade (or your plan name) at the top, choose "I have a license key", and paste the key.',
      'Keep this email. If you lose it, choose "Email me my key" in the same place.',
    ].join('\n\n'),
  }
}

async function sendKeys(env: Env, to: string, keys: Issued[], fetchImpl: Fetch): Promise<boolean> {
  const { subject, text } = keyEmail(keys)
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, ...(env.SUPPORT_EMAIL ? { reply_to: env.SUPPORT_EMAIL } : {}) }),
    })
    return res.ok
  } catch {
    return false
  }
}

async function hash(s: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

const ownerKey = (payload: LicensePayload) => hash(payload.ref || payload.email || '')

async function designs(request: Request, path: string, body: Record<string, unknown>, env: Env, publicJwk: JsonWebKey): Promise<Response> {
  if (!env.DESIGNS) return json(env, { error: 'Design sync is not set up' }, 501)
  const key = (request.headers.get('authorization') ?? '').replace(/^License\s+/i, '')
  const v = await verifyLicense(key, publicJwk)
  if (!v.ok) return json(env, { error: v.reason === 'expired' ? 'License expired' : 'License required' }, 401)
  if (!v.payload.ref && !v.payload.email) return json(env, { error: 'This license cannot sync' }, 403)
  if (v.payload.trial) return json(env, { error: 'Design sync starts when you buy a plan' }, 403)
  if (await isRevoked(env.DESIGNS, v.payload.ref)) return json(env, { error: 'This purchase was refunded' }, 403)
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
