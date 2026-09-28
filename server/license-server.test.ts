import { describe, expect, it } from 'vitest'
import { handle, planForPrice, type Env } from './license-server'
import { generateKeyPair, signLicense, verifyLicense } from '../src/product/license'

async function setup(stripeData: Record<string, unknown>) {
  const { publicJwk, privateJwk } = await generateKeyPair()
  const env: Env = { STRIPE_SECRET_KEY: 'sk_test_x', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), ALLOWED_ORIGIN: 'https://app.example' }
  const calls: string[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk_test_x')
    const hit = Object.entries(stripeData).find(([k]) => String(url).includes(k))
    return hit ? new Response(JSON.stringify(hit[1])) : new Response('{}', { status: 404 })
  }) as typeof fetch
  const post = (path: string, body: unknown) => handle(new Request(`https://lic.example${path}`, { method: 'POST', body: JSON.stringify(body) }), env, fetchImpl)
  return { publicJwk, privateJwk, env, post, calls }
}

const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400

describe('license server', () => {
  it('issues a renewing Pro key for a paid subscription checkout', async () => {
    const { publicJwk, post } = await setup({
      'checkout/sessions/cs_test_1': {
        id: 'cs_test_1',
        status: 'complete',
        payment_status: 'paid',
        mode: 'subscription',
        customer_details: { email: 'buyer@example.com', name: 'Ann Buyer' },
        subscription: { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: periodEnd }] } },
        line_items: { data: [{ price: { id: 'price_p', lookup_key: 'pro_monthly' } }] },
      },
    })
    const res = await post('/activate', { sessionId: 'cs_test_1' })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    const data = (await res.json()) as { key: string; plan: string }
    expect(data.plan).toBe('pro')
    const v = await verifyLicense(data.key, publicJwk)
    expect(v.ok && v.payload.ref).toBe('sub_1')
    expect(v.ok && v.payload.exp! > periodEnd * 1000).toBe(true)
  })

  it('refuses unpaid sessions and bad input', async () => {
    const { post } = await setup({ 'checkout/sessions/cs_open': { id: 'cs_open', status: 'open', payment_status: 'unpaid', mode: 'payment' } })
    expect((await post('/activate', { sessionId: 'cs_open' })).status).toBe(402)
    expect((await post('/activate', { sessionId: 'bad id' })).status).toBe(400)
    expect((await post('/nowhere', {})).status).toBe(404)
  })

  it('renews while the subscription is paid, and stops when it ends', async () => {
    const live = await setup({ 'subscriptions/sub_9': { id: 'sub_9', status: 'active', current_period_end: periodEnd } })
    const old = await signLicense({ v: 1, plan: 'studio', ref: 'sub_9', iat: 0, exp: Date.now() - 1000 }, live.privateJwk)
    const res = await live.post('/refresh', { key: old })
    expect(res.status).toBe(200)
    const v = await verifyLicense(((await res.json()) as { key: string }).key, live.publicJwk)
    expect(v.ok && v.payload.plan).toBe('studio')

    const ended = await setup({ 'subscriptions/sub_9': { id: 'sub_9', status: 'canceled' } })
    const k2 = await signLicense({ v: 1, plan: 'pro', ref: 'sub_9', iat: 0, exp: 1 }, ended.privateJwk)
    expect((await ended.post('/refresh', { key: k2 })).status).toBe(403)
  })

  it('maps prices to plans', () => {
    const env = { STRIPE_SECRET_KEY: '', LICENSE_PRIVATE_KEY: '', PRICE_PLANS: '{"price_s":"studio"}' }
    expect(planForPrice({ id: 'price_s' }, env)).toBe('studio')
    expect(planForPrice({ id: 'x', metadata: { plan: 'pro' } }, env)).toBe('pro')
    expect(planForPrice({ id: 'x', product: { name: 'Threshold Studio yearly' } }, env)).toBe('studio')
    expect(planForPrice({ id: 'x' }, env)).toBeNull()
  })
})

describe('design sync', () => {
  function memoryKV() {
    const m = new Map<string, { value: string; metadata?: unknown }>()
    return {
      m,
      get: async (k: string) => m.get(k)?.value ?? null,
      put: async (k: string, value: string, o?: { metadata?: unknown }) => void m.set(k, { value, metadata: o?.metadata }),
      delete: async (k: string) => void m.delete(k),
      list: async ({ prefix }: { prefix: string }) => ({ keys: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })) }),
    }
  }

  it('stores designs per customer and keeps customers apart', async () => {
    const { privateJwk } = await generateKeyPair()
    const kv = memoryKV()
    const env: Env = { STRIPE_SECRET_KEY: '', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: kv }
    const ann = await signLicense({ v: 1, plan: 'pro', ref: 'sub_ann', iat: Date.now(), exp: Date.now() + 86_400_000 }, privateJwk)
    const bob = await signLicense({ v: 1, plan: 'pro', ref: 'sub_bob', iat: Date.now(), exp: Date.now() + 86_400_000 }, privateJwk)
    const call = (path: string, key: string, body: unknown) =>
      handle(new Request(`https://lic.example${path}`, { method: 'POST', headers: { authorization: `License ${key}` }, body: JSON.stringify(body) }), env)
    expect((await call('/designs/put', ann, { id: 'prj_1', name: 'Cabin', updatedAt: 5, json: '{"a":1}' })).status).toBe(200)
    const list = (await (await call('/designs/list', ann, {})).json()) as { designs: Array<{ id: string; name: string }> }
    expect(list.designs).toEqual([{ id: 'prj_1', name: 'Cabin', updatedAt: 5 }])
    expect(((await (await call('/designs/list', bob, {})).json()) as { designs: unknown[] }).designs).toEqual([])
    expect(((await (await call('/designs/get', ann, { id: 'prj_1' })).json()) as { json: string }).json).toBe('{"a":1}')
    expect((await call('/designs/get', bob, { id: 'prj_1' })).status).toBe(404)
    expect((await call('/designs/list', 'nope', {})).status).toBe(401)
    expect((await call('/designs/put', ann, { id: '../x', json: '{}' })).status).toBe(400)
    await call('/designs/delete', ann, { id: 'prj_1' })
    expect(kv.m.size).toBe(0)
  })
})
