import { describe, expect, it } from 'vitest'
import { handle, type Env, type KV } from './license-server'
import { generateKeyPair, signLicense } from '../src/product/license'

function memoryKV(): KV {
  const m = new Map<string, string>()
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async () => ({ keys: [] }) }
}

const end = Math.floor(Date.now() / 1000) + 30 * 86400
const session = (id: string, email: string, invite: string | null) => ({
  id,
  status: 'complete',
  payment_status: 'paid',
  mode: 'subscription',
  customer_details: { email },
  client_reference_id: invite,
  subscription: { id: `sub_${id}`, status: 'active', current_period_end: end },
  line_items: { data: [{ price: { id: 'p', lookup_key: 'pro_monthly' } }] },
})

async function setup() {
  const { privateJwk } = await generateKeyPair()
  const env: Env = { STRIPE_SECRET_KEY: 'sk', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: memoryKV() }
  const credits: Array<{ customer: string; body: string; idem: string }> = []
  const sessions: Record<string, unknown> = {}
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const m = u.match(/customers\/(cus_\w+)\/balance_transactions/)
    if (m) {
      credits.push({ customer: m[1], body: String(init?.body), idem: (init?.headers as Record<string, string>)['idempotency-key'] })
      return new Response('{"id":"cbtxn_1"}')
    }
    if (u.includes('subscriptions/sub_inviter')) return new Response(JSON.stringify({ id: 'sub_inviter', status: 'active', customer: 'cus_ann' }))
    const s = Object.entries(sessions).find(([k]) => u.includes(`checkout/sessions/${k}?`))
    return s ? new Response(JSON.stringify(s[1])) : new Response('{}', { status: 404 })
  }) as typeof fetch
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => handle(new Request(`https://lic.example${path}`, { method: 'POST', headers, body: JSON.stringify(body) }), env, fetchImpl)
  const inviter = await signLicense({ v: 1, plan: 'pro', email: 'ann@example.com', ref: 'sub_inviter', iat: Date.now(), exp: Date.now() + 86_400_000 }, privateJwk)
  const pass = await signLicense({ v: 1, plan: 'pro', ref: 'cs_pass', iat: Date.now(), exp: Date.now() + 86_400_000 }, privateJwk)
  return { post, credits, sessions, inviter, pass }
}

describe('invites', () => {
  it('credits the inviter one month when a friend pays, once', async () => {
    const { post, credits, sessions, inviter } = await setup()
    const first = (await (await post('/referral', {}, { authorization: `License ${inviter}` })).json()) as { code: string; count: number }
    expect(first.code).toMatch(/^[a-f0-9]{10}$/)
    expect(first.count).toBe(0)
    sessions.cs_bob = session('cs_bob', 'bob@example.com', first.code)
    expect((await post('/activate', { sessionId: 'cs_bob' })).status).toBe(200)
    await post('/activate', { sessionId: 'cs_bob' })
    expect(credits).toHaveLength(1)
    expect(credits[0].customer).toBe('cus_ann')
    expect(new URLSearchParams(credits[0].body).get('amount')).toBe('-1200')
    expect(credits[0].idem).toBe('invite-cs_bob')
    const again = (await (await post('/referral', {}, { authorization: `License ${inviter}` })).json()) as { count: number }
    expect(again.count).toBe(1)
  })

  it('does not credit self-invites, unknown codes or non-subscribers', async () => {
    const { post, credits, sessions, inviter, pass } = await setup()
    const { code } = (await (await post('/referral', {}, { authorization: `License ${inviter}` })).json()) as { code: string }
    sessions.cs_self = session('cs_self', 'ANN@example.com', code)
    sessions.cs_odd = session('cs_odd', 'carl@example.com', 'ffffffffff')
    await post('/activate', { sessionId: 'cs_self' })
    await post('/activate', { sessionId: 'cs_odd' })
    expect(credits).toHaveLength(0)
    expect((await post('/referral', {}, { authorization: `License ${pass}` })).status).toBe(403)
    expect((await post('/referral', {})).status).toBe(401)
  })
})
