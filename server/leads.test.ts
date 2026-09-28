import { describe, expect, it } from 'vitest'
import { handle, type Env, type KV } from './license-server'
import { validDesignLink } from './leads'
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

const LINK = 'https://threshold.example/app#design=H4sIAAAA'
const TOKEN = 'x'.repeat(32)

async function setup() {
  const { privateJwk } = await generateKeyPair()
  const env: Env = { STRIPE_SECRET_KEY: '', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: memoryKV(), RESEND_API_KEY: 're', EMAIL_FROM: 'T <t@t.example>', ALLOWED_ORIGIN: 'https://threshold.example', ADMIN_TOKEN: TOKEN }
  const mails: Array<{ to: string[]; text: string }> = []
  const fetchImpl = (async (_u: string | URL | Request, init?: RequestInit) => {
    mails.push(JSON.parse(String(init?.body)))
    return new Response('{}')
  }) as typeof fetch
  const post = (path: string, body: unknown, ip = '203.0.113.9', auth?: string) =>
    handle(new Request(`https://lic.example${path}`, { method: 'POST', headers: { 'cf-connecting-ip': ip, ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }), env, fetchImpl)
  return { post, mails }
}

describe('email me this design', () => {
  it('sends the link and keeps the address only when asked', async () => {
    const { post, mails } = await setup()
    expect((await post('/send-design', { email: 'Ann@Example.com', link: LINK, name: 'Cabin', tips: true })).status).toBe(200)
    expect((await post('/send-design', { email: 'bob@example.com', link: LINK })).status).toBe(200)
    expect(mails.map((m) => m.to[0])).toEqual(['ann@example.com', 'bob@example.com'])
    expect(mails[0].text).toContain(LINK)
    expect(mails[0].text).toContain('unsubscribe')
    const csv = await (await post('/leads', {}, undefined, `Bearer ${TOKEN}`)).text()
    expect(csv.split('\n')[0]).toBe('email,signed_up,source')
    expect(csv).toContain('ann@example.com,')
    expect(csv).not.toContain('bob@example.com')
    expect((await post('/leads', {}, undefined, 'Bearer wrong')).status).toBe(401)
  })

  it('needs the site address, and keeps spreadsheet formulas out of the list', async () => {
    const { privateJwk } = await generateKeyPair()
    const kv = memoryKV()
    const env: Env = { STRIPE_SECRET_KEY: '', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), DESIGNS: kv, RESEND_API_KEY: 're', EMAIL_FROM: 'T <t@t.example>', ADMIN_TOKEN: TOKEN }
    const ok = (async () => new Response('{}')) as unknown as typeof fetch
    const send = (e: Env, email: string) => handle(new Request('https://lic.example/send-design', { method: 'POST', body: JSON.stringify({ email, link: LINK, tips: true }) }), e, ok)
    expect((await send(env, 'a@example.com')).status).toBe(501)
    const withSite = { ...env, ALLOWED_ORIGIN: 'https://threshold.example' }
    expect((await send(withSite, '=cmd@example.com')).status).toBe(200)
    const csv = await (await handle(new Request('https://lic.example/leads', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: '{}' }), withSite, ok)).text()
    expect(csv).toContain("'=cmd@example.com")
  })

  it('refuses other sites and limits sending', async () => {
    const { post, mails } = await setup()
    expect((await post('/send-design', { email: 'a@example.com', link: 'https://evil.example/#design=x' })).status).toBe(400)
    expect((await post('/send-design', { email: 'a@example.com', link: 'https://threshold.example/app' })).status).toBe(400)
    for (let i = 0; i < 4; i++) await post('/send-design', { email: 'same@example.com', link: LINK }, `198.51.100.${i}`)
    expect(mails).toHaveLength(3)
    for (let i = 0; i < 6; i++) await post('/send-design', { email: `p${i}@example.com`, link: LINK }, '192.0.2.1')
    expect(mails).toHaveLength(8)
    expect(validDesignLink('http://localhost:5173/#design=a', 'http://localhost:5173')).toBe(true)
    expect(validDesignLink('https://threshold.example.evil.example/#design=a', 'https://threshold.example')).toBe(false)
  })
})
