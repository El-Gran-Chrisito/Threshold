/**
 * "Email me this design": sends a share link to the address a visitor gives,
 * and, only if they tick the box, keeps the address for occasional tips.
 * The site owner downloads that list as CSV.
 *
 *   POST /send-design  { email, link, name?, tips? }       -> { ok }
 *   POST /leads        Authorization: Bearer ADMIN_TOKEN  -> text/csv
 *
 * Limits: 5 emails a day from one network, 3 a day to one address.
 */
import type { KV } from './license-server'
import { count } from './stats'

type Fetch = typeof fetch

export interface LeadsEnv {
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  SUPPORT_EMAIL?: string
  ALLOWED_ORIGIN?: string
  /** Long random secret for downloading the tips list. */
  ADMIN_TOKEN?: string
}

export type LeadResult = { status: number; body: Record<string, unknown> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function sha(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  return Array.from(d.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Only links to this site that carry a design. */
export function validDesignLink(link: string, allowedOrigin?: string): boolean {
  if (link.length > 200_000) return false
  try {
    const u = new URL(link)
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return false
    if (allowedOrigin && allowedOrigin !== '*' && u.origin !== new URL(allowedOrigin).origin) return false
    return u.hash.startsWith('#design=')
  } catch {
    return false
  }
}

async function bump(kv: KV, key: string, max: number): Promise<boolean> {
  const n = Number(await kv.get(key)) || 0
  if (n >= max) return false
  await kv.put(key, String(n + 1))
  return true
}

export async function sendDesign(env: LeadsEnv, kv: KV | undefined, body: Record<string, unknown>, ip: string, now: number, fetchImpl: Fetch): Promise<LeadResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !kv) return { status: 501, body: { error: 'Email is not set up on this site' } }
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase()
  const link = String(body.link ?? '')
  const name = String(body.name ?? 'Your home').slice(0, 120)
  if (email.length > 200 || !EMAIL.test(email)) return { status: 400, body: { error: 'Enter an email address' } }
  if (!validDesignLink(link, env.ALLOWED_ORIGIN)) return { status: 400, body: { error: 'That is not a design link from this site' } }
  const day = Math.floor(now / 86_400_000)
  if (!(await bump(kv, `m:send:ip:${await sha(ip || 'unknown')}:${day}`, 5)) || !(await bump(kv, `m:send:to:${await sha(email)}:${day}`, 3)))
    return { status: 429, body: { error: 'Too many emails today. Try again tomorrow.' } }
  const tips = body.tips === true
  const text = [
    `Here is your Threshold design, "${name}". Open it on any device:`,
    link,
    'The link holds the whole design. Opening it makes your own copy that you can change; nothing is stored on our servers.',
    tips ? 'You asked for occasional home-design tips. Reply "stop" to any email to unsubscribe.' : 'You get this email because someone asked for it on the Threshold site. We will not email you again unless you ask.',
  ].join('\n\n')
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: `Your Threshold design: ${name}`, text, ...(env.SUPPORT_EMAIL ? { reply_to: env.SUPPORT_EMAIL } : {}) }),
    })
    if (!res.ok) return { status: 502, body: { error: 'Could not send the email. Try again later.' } }
  } catch {
    return { status: 502, body: { error: 'Could not send the email. Try again later.' } }
  }
  await count(kv, 'design_email', now)
  if (tips) {
    if (!(await kv.get(`lead:${email}`))) await count(kv, 'tips_signup', now)
    await kv.put(`lead:${email}`, '1', { metadata: { at: now, source: 'send-design' } })
  }
  return { status: 200, body: { ok: true } }
}

/** The tips list as CSV, for the site owner only. */
export async function leadsCsv(env: LeadsEnv, kv: KV | undefined, auth: string): Promise<{ status: number; csv?: string }> {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24 || auth !== `Bearer ${env.ADMIN_TOKEN}`) return { status: 401 }
  if (!kv) return { status: 501 }
  const { keys } = await kv.list({ prefix: 'lead:', limit: 1000 })
  const rows = keys.map((k) => {
    const m = (k.metadata ?? {}) as { at?: number; source?: string }
    return [k.name.slice(5), m.at ? new Date(m.at).toISOString() : '', m.source ?? ''].join(',')
  })
  return { status: 200, csv: ['email,signed_up,source', ...rows].join('\n') + '\n' }
}
