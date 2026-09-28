import { describe, expect, it } from 'vitest'
import { handle, type Env, type KV } from './license-server'
import { parseJsonReply } from './assistant'
import { generateKeyPair, signLicense } from '../src/product/license'

function memoryKV(): KV {
  const m = new Map<string, string>()
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k), list: async () => ({ keys: [] }) }
}

async function setup(reply: { status?: number; body: unknown }, extra: Partial<Env> = {}) {
  const { privateJwk } = await generateKeyPair()
  const env: Env = { STRIPE_SECRET_KEY: '', LICENSE_PRIVATE_KEY: JSON.stringify(privateJwk), ANTHROPIC_API_KEY: 'sk-ant-x', DESIGNS: memoryKV(), ...extra }
  const sent: Array<Record<string, unknown>> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    expect((init?.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x')
    sent.push(JSON.parse(String(init?.body)))
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200 })
  }) as typeof fetch
  const key = (plan: 'pro' | 'studio', trial = false) => signLicense({ v: 1, plan, ref: trial ? 'trial_1' : 'sub_1', iat: Date.now(), exp: Date.now() + 86_400_000, ...(trial ? { trial } : {}) }, privateJwk)
  const ask = async (body: unknown, license?: string) =>
    handle(new Request('https://lic.example/assistant', { method: 'POST', headers: license ? { authorization: `License ${license}` } : {}, body: JSON.stringify(body) }), env, fetchImpl)
  return { ask, key, sent }
}

const answer = (text: string, stop = 'end_turn') => ({ body: { stop_reason: stop, content: [{ type: 'text', text }] } })

describe('assistant route', () => {
  it('answers paying customers with the parsed JSON', async () => {
    const { ask, key, sent } = await setup(answer('```json\n{"summary":"Added an office","actions":[{"op":"add_room"}]}\n```'))
    const res = await ask({ prompt: 'Add an office', image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } }, await key('pro'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ json: { summary: 'Added an office', actions: [{ op: 'add_room' }] } })
    const content = (sent[0].messages as Array<{ content: Array<{ type: string }> }>)[0].content
    expect(content.map((c) => c.type)).toEqual(['image', 'text'])
    expect(sent[0].model).toBe('claude-sonnet-5')
  })

  it('needs a license and maps failures to the app codes', async () => {
    const ok = await setup(answer('{}'))
    expect((await ok.ask({ prompt: 'x' })).status).toBe(401)
    expect(((await (await ok.ask({ prompt: 'x', image: { mediaType: 'text/html', data: 'aa' } }, await ok.key('pro'))).json()) as { code: string }).code).toBe('image_rejected')
    const refused = await setup(answer('', 'refusal'))
    expect(((await (await refused.ask({ prompt: 'x' }, await refused.key('pro'))).json()) as { code: string }).code).toBe('refused')
    const busy = await setup({ status: 429, body: '{}' })
    expect(((await (await busy.ask({ prompt: 'x' }, await busy.key('studio'))).json()) as { code: string }).code).toBe('rate_limited')
    const prose = await setup(answer('Sorry, I cannot help with that.'))
    expect(((await (await prose.ask({ prompt: 'x' }, await prose.key('pro'))).json()) as { code: string }).code).toBe('invalid_json')
    const off = await setup(answer('{}'), { ANTHROPIC_API_KEY: undefined })
    expect((await off.ask({ prompt: 'x' }, await off.key('pro'))).status).toBe(501)
  })

  it('stops at the daily limit', async () => {
    const { ask, key, sent } = await setup(answer('{"actions":[]}'), { ASSISTANT_DAILY_LIMIT: '2' })
    const k = await key('pro')
    expect((await ask({ prompt: 'a' }, k)).status).toBe(200)
    expect((await ask({ prompt: 'b' }, k)).status).toBe(200)
    const third = await ask({ prompt: 'c' }, k)
    expect(third.status).toBe(429)
    expect(((await third.json()) as { code: string }).code).toBe('daily_limit')
    expect(sent).toHaveLength(2)
  })

  it('gives trials a smaller daily limit', async () => {
    const { ask, key } = await setup(answer('{"actions":[]}'), { TRIAL_ASSISTANT_DAILY_LIMIT: '1' })
    const k = await key('pro', true)
    expect((await ask({ prompt: 'a' }, k)).status).toBe(200)
    expect((await ask({ prompt: 'b' }, k)).status).toBe(429)
  })

  it('finds the JSON in a reply with extra text', () => {
    expect(parseJsonReply('Here you go: {"a":1} Hope that helps')).toEqual({ a: 1 })
    expect(() => parseJsonReply('no json here')).toThrow()
  })
})
