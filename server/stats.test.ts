import { describe, expect, it } from 'vitest'
import { handle, type Env, type KV } from './license-server'
import { generateKeyPair } from '../src/product/license'

function memoryKV(): KV {
  const m = new Map<string, { v: string; meta?: unknown }>()
  return {
    get: async (k) => m.get(k)?.v ?? null,
    put: async (k, v, o) => void m.set(k, { v, meta: o?.metadata }),
    delete: async (k) => void m.delete(k),
    list: async ({ prefix }) => ({ keys: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.meta })) }),
  }
}

const TOKEN = 'y'.repeat(30)

describe('owner stats', () => {
  it('counts trials and purchases per day, for the owner only', async () => {
    const { privateJwk } = await generateKeyPair()
    const env: Env = { STRIPE_SECRET_KEY: 'sk', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: memoryKV(), ADMIN_TOKEN: TOKEN }
    const end = Math.floor(Date.now() / 1000) + 30 * 86400
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ id: 'cs_1', status: 'complete', payment_status: 'paid', mode: 'subscription', subscription: { id: 'sub_1', status: 'active', current_period_end: end }, line_items: { data: [{ price: { id: 'p', lookup_key: 'pro_yearly' } }] } }),
      )) as unknown as typeof fetch
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) => handle(new Request(`https://lic.example${path}`, { method: 'POST', headers, body: JSON.stringify(body) }), env, fetchImpl)
    await post('/trial', {}, { 'cf-connecting-ip': '1.1.1.1' })
    await post('/trial', {}, { 'cf-connecting-ip': '2.2.2.2' })
    await post('/activate', { sessionId: 'cs_1' })
    await post('/activate', { sessionId: 'cs_1' })
    expect((await post('/stats', {}, { authorization: 'Bearer nope' })).status).toBe(401)
    const r = (await (await post('/stats', { days: 7 }, { authorization: `Bearer ${TOKEN}` })).json()) as { days: Array<Record<string, number | string>> }
    expect(r.days).toHaveLength(7)
    expect(r.days[0].day).toBe(new Date().toISOString().slice(0, 10))
    expect(r.days[0].trial).toBe(2)
    expect(r.days[0].purchase).toBe(1)
    expect(r.days[1].trial).toBe(0)
  })
})
