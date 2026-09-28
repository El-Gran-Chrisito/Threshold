import { describe, expect, it } from 'vitest'
import { handle, type Env, type KV } from './license-server'
import { stripeSignature, verifyStripeSignature } from './webhook'
import { generateKeyPair, signLicense } from '../src/product/license'

function memoryKV(): KV {
  const m = new Map<string, string>()
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async () => ({ keys: [] }) }
}

const SECRET = 'whsec_test_secret'

async function setup() {
  const { privateJwk } = await generateKeyPair()
  const env: Env = { STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: SECRET, LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: memoryKV(), ANTHROPIC_API_KEY: 'x' }
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('checkout/sessions?payment_intent=pi_pass')) return new Response(JSON.stringify({ data: [{ id: 'cs_pass', subscription: null }] }))
    if (u.includes('checkout/sessions/cs_pass'))
      return new Response(JSON.stringify({ id: 'cs_pass', status: 'complete', payment_status: 'paid', mode: 'payment', customer_details: { email: 'a@example.com' }, line_items: { data: [{ price: { id: 'p', lookup_key: 'pro_pass' } }] } }))
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const hook = async (event: unknown, sig?: string) => {
    const body = JSON.stringify(event)
    const t = Math.floor(Date.now() / 1000)
    const header = sig ?? `t=${t},v1=${await stripeSignature(SECRET, t, body)}`
    return handle(new Request('https://lic.example/stripe-webhook', { method: 'POST', headers: { 'stripe-signature': header }, body }), env, fetchImpl)
  }
  const post = (path: string, body: unknown, key?: string) => handle(new Request(`https://lic.example${path}`, { method: 'POST', headers: key ? { authorization: `License ${key}` } : {}, body: JSON.stringify(body) }), env, fetchImpl)
  const passKey = await signLicense({ v: 1, plan: 'pro', ref: 'cs_pass', iat: Date.now(), exp: Date.now() + 86_400_000 }, privateJwk)
  return { hook, post, passKey }
}

describe('stripe webhook', () => {
  it('checks the signature', async () => {
    const t = 1_790_000_000
    const sig = await stripeSignature(SECRET, t, '{"a":1}')
    expect(await verifyStripeSignature(SECRET, `t=${t},v1=${sig}`, '{"a":1}', t + 10)).toBe(true)
    expect(await verifyStripeSignature(SECRET, `t=${t},v1=${sig}`, '{"a":2}', t + 10)).toBe(false)
    expect(await verifyStripeSignature(SECRET, `t=${t},v1=${sig}`, '{"a":1}', t + 1000)).toBe(false)
    const { hook } = await setup()
    expect((await hook({ type: 'charge.refunded', data: { object: {} } }, 't=1,v1=00')).status).toBe(400)
  })

  it('revokes a fully refunded purchase everywhere on the server', async () => {
    const { hook, post, passKey } = await setup()
    expect((await post('/activate', { sessionId: 'cs_pass' })).status).toBe(200)
    // A partial refund keeps the purchase.
    await hook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_pass', amount: 4900, amount_refunded: 1000, refunded: false } } })
    expect((await post('/activate', { sessionId: 'cs_pass' })).status).toBe(200)
    const full = await hook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_pass', amount: 4900, amount_refunded: 4900, refunded: true } } })
    expect(await full.json()).toEqual({ received: true, revoked: 1 })
    expect((await post('/activate', { sessionId: 'cs_pass' })).status).toBe(403)
    expect((await post('/assistant', { prompt: 'x' }, passKey)).status).toBe(403)
  })

  it('ignores other events', async () => {
    const { hook } = await setup()
    expect(await (await hook({ type: 'invoice.paid', data: { object: {} } })).json()).toEqual({ received: true })
  })
})
