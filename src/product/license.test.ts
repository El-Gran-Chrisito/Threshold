import { beforeEach, describe, expect, it } from 'vitest'
import { generateKeyPair, peekLicense, signLicense, verifyLicense } from './license'
import { productConfig } from './config'
import { can, requireFeature, resetEntitlements, trialState, useEntitlements } from './entitlements'
import { allows, PLANS } from './plans'

describe('license keys', () => {
  it('signs and verifies, and rejects tampering, other keys and expiry', async () => {
    const { publicJwk, privateJwk } = await generateKeyPair()
    const other = await generateKeyPair()
    const now = Date.now()
    const key = await signLicense({ v: 1, plan: 'pro', email: 'a@b.co', iat: now, exp: now + 1000 }, privateJwk)
    expect(key.startsWith('THR1.')).toBe(true)
    expect(await verifyLicense(key, publicJwk)).toMatchObject({ ok: true, payload: { plan: 'pro', email: 'a@b.co' } })
    expect(await verifyLicense(key, other.publicJwk)).toEqual({ ok: false, reason: 'signature' })
    const [p, body, sig] = key.split('.')
    const forged = `${p}.${btoa(JSON.stringify({ v: 1, plan: 'studio', iat: now, exp: null })).replace(/=+$/, '')}.${sig}`
    expect((await verifyLicense(forged, publicJwk)).ok).toBe(false)
    expect(await verifyLicense(key, publicJwk, now + 5000)).toEqual({ ok: false, reason: 'expired' })
    expect(await verifyLicense('nonsense', publicJwk)).toEqual({ ok: false, reason: 'format' })
    expect(await verifyLicense(key, null)).toEqual({ ok: false, reason: 'unconfigured' })
    expect(peekLicense(`${p}.${body}.${sig}`)?.plan).toBe('pro')
  })
})

describe('plans and entitlements', () => {
  beforeEach(() => resetEntitlements())

  it('lets higher plans do everything lower plans can', () => {
    expect(allows('free', 'model-export')).toBe(false)
    expect(allows('pro', 'model-export')).toBe(true)
    expect(allows('pro', 'branding')).toBe(false)
    expect(allows('studio', 'branding')).toBe(true)
    expect(PLANS.map((x) => x.id)).toEqual(['free', 'pro', 'studio'])
    expect(PLANS[1].yearly).toBeLessThan(PLANS[1].monthly * 12)
  })

  it('opens the upgrade sheet for a locked feature', () => {
    expect(requireFeature('electrical')).toBe(false)
    expect(useEntitlements.getState().paywall).toEqual({ open: true, feature: 'electrical' })
  })

  it('runs a one-time Pro trial', () => {
    expect(useEntitlements.getState().startTrial()).toBe(true)
    expect(can('assistant')).toBe(true)
    expect(useEntitlements.getState().source).toBe('trial')
    expect(useEntitlements.getState().startTrial()).toBe(false)
    const t = trialState(Date.now() - 8 * 86_400_000)
    expect(t).toEqual({ active: false, used: true, daysLeft: 0 })
  })

  it('activates a Studio license', async () => {
    const { publicJwk, privateJwk } = await generateKeyPair()
    productConfig.licensePublicKey = publicJwk
    const key = await signLicense({ v: 1, plan: 'studio', iat: Date.now(), exp: null }, privateJwk)
    expect((await useEntitlements.getState().activate('garbage')).ok).toBe(false)
    const r = await useEntitlements.getState().activate(key)
    expect(r.ok).toBe(true)
    expect(can('presentation')).toBe(true)
    productConfig.licensePublicKey = null
  })
})
