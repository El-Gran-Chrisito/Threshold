import { describe, expect, it } from 'vitest'
import { daysForPurchase, handle, keyEmail, planForPrice, type Env, type KV } from './license-server'
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

  it('gives a one-time Build Pass a fixed length, and lifetime deals none', async () => {
    const session = (id: string, price: Record<string, unknown>) => ({
      id,
      status: 'complete',
      payment_status: 'paid',
      mode: 'payment',
      customer_details: { email: 'one@example.com' },
      line_items: { data: [{ price }] },
    })
    const { publicJwk, post } = await setup({
      'checkout/sessions/cs_pass': session('cs_pass', { id: 'price_x', product: { name: 'Threshold Pro Build Pass', metadata: { days: '183' } } }),
      'checkout/sessions/cs_life': session('cs_life', { id: 'price_y', metadata: { plan: 'studio' } }),
    })
    const pass = await verifyLicense(((await (await post('/activate', { sessionId: 'cs_pass' })).json()) as { key: string }).key, publicJwk)
    expect(pass.ok && pass.payload.plan).toBe('pro')
    const days = pass.ok ? (pass.payload.exp! - Date.now()) / 86_400_000 : 0
    expect(days).toBeGreaterThan(182.9)
    expect(days).toBeLessThan(183.1)
    const life = await verifyLicense(((await (await post('/activate', { sessionId: 'cs_life' })).json()) as { key: string }).key, publicJwk)
    expect(life.ok && life.payload.plan).toBe('studio')
    expect(life.ok && life.payload.exp).toBeNull()
    expect(daysForPurchase({}, { id: 'p', lookup_key: 'pro_pass' })).toBe(183)
    expect(daysForPurchase({ metadata: { days: '30' } }, undefined)).toBe(30)
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

describe('key delivery and recovery', () => {
  function memoryKV(): KV & { m: Map<string, string> } {
    const m = new Map<string, string>()
    return {
      m,
      get: async (k) => m.get(k) ?? null,
      put: async (k, v) => void m.set(k, v),
      delete: async (k) => void m.delete(k),
      list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
    }
  }
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400
  const paid = (id: string, email: string) => ({
    id,
    status: 'complete',
    payment_status: 'paid',
    mode: 'subscription',
    customer_details: { email },
    subscription: { id: `sub_${id}`, status: 'active', current_period_end: periodEnd },
    line_items: { data: [{ price: { id: 'p', lookup_key: 'pro_yearly' } }] },
  })

  async function setup(emailOn = true) {
    const { publicJwk, privateJwk } = await generateKeyPair()
    const kv = memoryKV()
    const env: Env = { STRIPE_SECRET_KEY: 'sk', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: kv, ...(emailOn ? { RESEND_API_KEY: 're_x', EMAIL_FROM: 'Threshold <keys@t.example>' } : {}) }
    const mails: Array<{ to: string[]; subject: string; text: string }> = []
    const stripeUrls: string[] = []
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('https://api.resend.com/')) {
        expect((init?.headers as Record<string, string>).authorization).toBe('Bearer re_x')
        mails.push(JSON.parse(String(init?.body)))
        return new Response('{"id":"e1"}')
      }
      stripeUrls.push(u)
      if (u.includes('checkout/sessions?')) return new Response(JSON.stringify({ data: u.includes('ann%40example.com') ? [{ id: 'cs_ann', created: 1 }] : [] }))
      if (u.includes('checkout/sessions/cs_ann')) return new Response(JSON.stringify(paid('cs_ann', 'ann@example.com')))
      return new Response('{}', { status: 404 })
    }) as typeof fetch
    const post = (path: string, body: unknown) => handle(new Request(`https://lic.example${path}`, { method: 'POST', body: JSON.stringify(body) }), env, fetchImpl)
    return { publicJwk, post, mails, stripeUrls, kv }
  }

  it('emails the key once after checkout', async () => {
    const { publicJwk, post, mails } = await setup()
    const first = (await (await post('/activate', { sessionId: 'cs_ann' })).json()) as { key: string; emailed: boolean }
    expect(first.emailed).toBe(true)
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toEqual(['ann@example.com'])
    expect(mails[0].text).toContain(first.key)
    expect((await verifyLicense(first.key, publicJwk)).ok).toBe(true)
    const again = (await (await post('/activate', { sessionId: 'cs_ann' })).json()) as { emailed: boolean }
    expect(again.emailed).toBe(false)
    expect(mails).toHaveLength(1)
  })

  it('sends a lost key to the buyer only, with the same answer for anyone', async () => {
    const { post, mails, stripeUrls } = await setup()
    const known = await post('/recover', { email: ' Ann@Example.com ' })
    expect(await known.json()).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toEqual(['ann@example.com'])
    expect(stripeUrls[0]).toContain('customer_details%5Bemail%5D=ann%40example.com')
    const unknown = await post('/recover', { email: 'someone@else.example' })
    expect(await unknown.json()).toEqual({ ok: true })
    expect(mails).toHaveLength(1)
    expect((await post('/recover', { email: 'not an email' })).status).toBe(400)
  })

  it('limits recovery requests and needs email set up', async () => {
    const { post, mails } = await setup()
    for (let i = 0; i < 5; i++) await post('/recover', { email: 'ann@example.com' })
    expect(mails).toHaveLength(3)
    const off = await setup(false)
    expect((await off.post('/recover', { email: 'ann@example.com' })).status).toBe(501)
    const plain = (await (await off.post('/activate', { sessionId: 'cs_ann' })).json()) as { emailed: boolean }
    expect(plain.emailed).toBe(false)
  })

  it('writes an email that says how to use each key and when it ends', () => {
    const m = keyEmail([
      { key: 'THR1.a.b', plan: 'pro', exp: Date.UTC(2027, 2, 30), ref: 'cs_1' },
      { key: 'THR1.c.d', plan: 'studio', exp: null, ref: 'cs_2' },
    ])
    expect(m.subject).toBe('Your Threshold license keys')
    expect(m.text).toContain('It works until 30 Mar 2027.')
    expect(m.text).toContain('It does not expire.')
    expect(m.text).toContain('I have a license key')
  })
})
