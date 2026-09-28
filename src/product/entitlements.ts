/**
 * What this person has paid for: free, a Pro trial, or a license. Kept in
 * the browser (and, inside Claude, the account store) and checked offline
 * against the public key. Subscription licenses renew themselves through the
 * license server a few days before they lapse.
 */
import { create } from 'zustand'
import { allows, FEATURES, type Feature, type PlanId } from './plans'
import { peekLicense, verifyLicense, type LicensePayload } from './license'
import { productConfig } from './config'
import { track } from './analytics'
import { setLicenseSync } from '../store/cloud'

const LICENSE_KEY = 'threshold:license'
const TRIAL_KEY = 'threshold:trial'
const DAY = 86_400_000

export interface Entitlements {
  plan: PlanId
  source: 'free' | 'trial' | 'license'
  license: LicensePayload | null
  /** A stored license that has run out (a pass or a lapsed subscription). */
  lapsed: LicensePayload | null
  key: string | null
  trialStartedAt: number | null
  paywall: { open: boolean; feature: Feature | null }
  /** Set once the stored license has been checked. */
  ready: boolean
}

interface Actions {
  init: () => Promise<void>
  /** After a hosted checkout: trade the checkout session for a license key. */
  claimCheckout: (sessionId: string) => Promise<{ ok: boolean; message: string }>
  activate: (key: string) => Promise<{ ok: boolean; message: string }>
  startTrial: () => boolean
  signOut: () => void
  openPaywall: (feature?: Feature | null) => void
  closePaywall: () => void
}

function read(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* storage unavailable */
  }
}

/** A license that ends on a date and does not renew (a Build Pass or a key issued for a set time). */
export function isPass(l: LicensePayload | null): boolean {
  return !!l?.exp && !l.ref?.startsWith('sub_')
}

export function daysLeft(l: LicensePayload | null, now = Date.now()): number | null {
  return l?.exp ? Math.max(0, Math.ceil((l.exp - now) / DAY)) : null
}

export function trialState(startedAt: number | null, now = Date.now()) {
  if (!startedAt) return { active: false, used: false, daysLeft: 0 }
  const end = startedAt + productConfig.trialDays * DAY
  return { active: now < end, used: true, daysLeft: Math.max(0, Math.ceil((end - now) / DAY)) }
}

function derive(license: LicensePayload | null, trialStartedAt: number | null): Pick<Entitlements, 'plan' | 'source'> {
  if (license) return { plan: license.plan, source: 'license' }
  if (trialState(trialStartedAt).active) return { plan: 'pro', source: 'trial' }
  return { plan: 'free', source: 'free' }
}

const REASONS: Record<string, string> = {
  unconfigured: 'License keys are not set up in this copy of the app yet.',
  format: 'That does not look like a Threshold license key. Paste the whole key, starting with THR1.',
  signature: 'That key is not valid. Check that it was copied in full.',
  expired: 'That key has expired. Renew your plan to get a new one.',
}

/** Ask the license server for a fresh key when a subscription key is close to lapsing. */
async function renew(key: string): Promise<string | null> {
  if (!productConfig.licenseApi) return null
  try {
    const res = await fetch(`${productConfig.licenseApi}/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) })
    if (!res.ok) return null
    const data = (await res.json()) as { key?: string }
    return data.key ?? null
  } catch {
    return null
  }
}

export const useEntitlements = create<Entitlements & Actions>((set, get) => ({
  plan: 'free',
  source: 'free',
  license: null,
  lapsed: null,
  key: null,
  trialStartedAt: null,
  paywall: { open: false, feature: null },
  ready: false,

  init: async () => {
    const trial = Number(read(TRIAL_KEY)) || null
    let key = read(LICENSE_KEY)
    let license: LicensePayload | null = null
    let lapsed: LicensePayload | null = null
    if (key) {
      const peek = peekLicense(key)
      if (peek?.exp && peek.ref?.startsWith('sub_') && peek.exp - Date.now() < 3 * DAY) {
        const fresh = await renew(key)
        if (fresh) {
          key = fresh
          write(LICENSE_KEY, fresh)
        }
      }
      const v = await verifyLicense(key, productConfig.licensePublicKey)
      if (v.ok) license = v.payload
      else if (v.reason === 'expired') lapsed = peekLicense(key)
    }
    set({ key, license, lapsed, trialStartedAt: trial, ...derive(license, trial), ready: true })
  },

  activate: async (raw) => {
    const key = raw.trim()
    const v = await verifyLicense(key, productConfig.licensePublicKey)
    if (!v.ok) {
      track('license_failed', { reason: v.reason })
      return { ok: false, message: REASONS[v.reason] }
    }
    write(LICENSE_KEY, key)
    set({ key, license: v.payload, lapsed: null, ...derive(v.payload, get().trialStartedAt), paywall: { open: false, feature: null } })
    track('license_activated', { plan: v.payload.plan })
    return { ok: true, message: `${v.payload.plan === 'studio' ? 'Studio' : 'Pro'} is active. Thank you!` }
  },

  claimCheckout: async (sessionId) => {
    if (!productConfig.licenseApi) return { ok: false, message: 'Payment received. Your license key will arrive by email.' }
    try {
      const res = await fetch(`${productConfig.licenseApi}/activate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      const data = (await res.json()) as { key?: string; error?: string }
      if (!res.ok || !data.key) return { ok: false, message: data.error ?? 'Could not confirm the payment yet. Try reloading in a minute.' }
      return await get().activate(data.key)
    } catch {
      return { ok: false, message: 'Could not reach the license server. Try reloading in a minute.' }
    }
  },

  startTrial: () => {
    if (get().trialStartedAt || get().license) return false
    const now = Date.now()
    write(TRIAL_KEY, String(now))
    set({ trialStartedAt: now, ...derive(null, now), paywall: { open: false, feature: null } })
    track('trial_started')
    return true
  },

  signOut: () => {
    write(LICENSE_KEY, null)
    set({ key: null, license: null, lapsed: null, ...derive(null, get().trialStartedAt) })
  },

  openPaywall: (feature = null) => {
    set({ paywall: { open: true, feature } })
    track('paywall_shown', feature ? { feature } : undefined)
  },
  closePaywall: () => set({ paywall: { open: false, feature: null } }),
}))

export const can = (feature: Feature) => allows(useEntitlements.getState().plan, feature)

/** True when allowed; otherwise opens the upgrade sheet for that feature. */
export function requireFeature(feature: Feature): boolean {
  if (can(feature)) return true
  useEntitlements.getState().openPaywall(feature)
  return false
}

export function featureName(f: Feature) {
  return FEATURES[f].name
}

/** For tests: reset to a fresh free state. */
export function resetEntitlements() {
  useEntitlements.setState({ plan: 'free', source: 'free', license: null, lapsed: null, key: null, trialStartedAt: null, paywall: { open: false, feature: null }, ready: false })
}

// Design sync for licensed customers outside Claude (see server/license-server.ts).
setLicenseSync(() => {
  const s = useEntitlements.getState()
  if (!productConfig.licenseApi || s.source !== 'license' || !s.key || !allows(s.plan, 'sync')) return null
  return { api: productConfig.licenseApi, key: s.key }
})
