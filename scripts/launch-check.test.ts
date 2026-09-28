import { describe, expect, it } from 'vitest'
import { checkServer, checkSettings } from './launch-check'
import { generateKeyPair } from '../src/product/license'

const levels = (cs: Array<{ level: string; text: string }>, word: string) => cs.filter((c) => c.text.includes(word)).map((c) => c.level)

describe('launch check', () => {
  it('passes a complete live setup and flags the rest', async () => {
    const a = await generateKeyPair()
    const b = await generateKeyPair()
    const good = {
      VITE_LICENSE_PUBLIC_KEY: JSON.stringify(a.publicJwk),
      VITE_LICENSE_API: 'https://lic.example',
      VITE_CHECKOUT_PRO_MONTHLY: 'https://buy.stripe.com/abc',
      VITE_CHECKOUT_PRO_YEARLY: 'https://buy.stripe.com/test_def',
      VITE_SITE_URL: 'https://threshold.example',
      VITE_SUPPORT_EMAIL: 'help@threshold.example',
      VITE_APP_PATH: '/app',
    }
    const ok = await checkSettings(good, { privateJwk: a.privateJwk, legal: { 'terms.html': '<p>[Company name] at [address]</p>' }, gitignore: '.license/\n.env.local\n' })
    expect(ok.filter((c) => c.level === 'fail')).toEqual([])
    expect(levels(ok, 'matches')).toEqual(['ok'])
    expect(levels(ok, 'test-mode')).toEqual(['warn'])
    expect(levels(ok, 'terms.html')).toEqual(['warn'])

    const bad = await checkSettings({ ...good, VITE_LICENSE_API: 'http://lic.example', VITE_CHECKOUT_PRO_MONTHLY: '' }, { privateJwk: b.privateJwk, gitignore: 'node_modules' })
    expect(levels(bad, 'does not match')).toEqual(['fail'])
    expect(levels(bad, 'https address')).toEqual(['fail'])
    expect(levels(bad, 'PRO_MONTHLY')).toEqual(['fail'])
    expect(levels(bad, '.gitignore')).toEqual(['fail'])
    const priv = await checkSettings({ VITE_LICENSE_PUBLIC_KEY: JSON.stringify(a.privateJwk) })
    expect(levels(priv, 'private one')).toEqual(['fail'])
  })

  it('reads the license server answer and its allowed site', async () => {
    const reply = (allow: string) => (async () => new Response('{"error":"Checkout session not found"}', { status: 404, headers: { 'access-control-allow-origin': allow } })) as unknown as typeof fetch
    const env = { VITE_LICENSE_API: 'https://lic.example', VITE_SITE_URL: 'https://threshold.example' }
    expect((await checkServer(env, reply('https://threshold.example'))).map((c) => c.level)).toEqual(['ok'])
    expect((await checkServer(env, reply('*'))).map((c) => c.level)).toEqual(['ok', 'warn'])
    expect((await checkServer(env, reply('https://other.example'))).map((c) => c.level)).toEqual(['ok', 'fail'])
  })
})
