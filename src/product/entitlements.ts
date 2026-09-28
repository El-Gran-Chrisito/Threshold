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
  startTrial: (plan?: 'pro' | 'studio') => boolean
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

const TRIAL_PLAN_KEY = 'threshold:trial-plan'
let trialPlanMem: 'pro' | 'studio' | null = null

/** Which plan the free trial unlocks: Pro, or Studio for people who design for clients. */
export function trialPlan(): 'pro' | 'studio' {
  return (trialPlanMem ?? read(TRIAL_PLAN_KEY)) === 'studio' ? 'studio' : 'pro'
}

function derive(license: LicensePayload | null, trialStartedAt: number | null): Pick<Entitlements, 'plan' | 'source'> {
  if (license) return { plan: license.plan, source: license.trial ? 'trial' : 'license' }
  if (trialState(trialStartedAt).active) return { plan: trialPlan(), source: 'trial' }
  return { plan: 'free', source: 'free' }
}

const REASONS: Record<string, string> = {
  unconfigured: 'License keys are not set up in this copy of the app yet.',
  format: 'That does not look like a Threshold license key. Paste the whole key, starting with THR1.',
  signature: 'That key is not valid. Check that it was copied in full.',
  expired: 'That key has expired. Renew your plan to get a new one.',
}

/** A signed 7-day trial key from the license server, if it gives one. */
async function trialKey(plan: 'pro' | 'studio'): Promise<string | null> {
  if (!productConfig.licenseApi || !productConfig.licensePublicKey) return null
  try {
    const res = await fetch(`${productConfig.licenseApi}/trial`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan }) })
    if (!res.ok) return null
    return ((await res.json()) as { key?: string }).key ?? null
  } catch {
    return null
  }
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
      else if (v.reason === 'expired' && !peekLicense(key)?.trial) lapsed = peekLicense(key)
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
      const data = (await res.json()) as { key?: string; error?: string; emailed?: boolean; email?: string | null }
      if (!res.ok || !data.key) return { ok: false, message: data.error ?? 'Could not confirm the payment yet. Try reloading in a minute.' }
      const r = await get().activate(data.key)
      return r.ok && data.emailed ? { ...r, message: `${r.message} Your license key is also in your email${data.email ? ` (${data.email})` : ''}.` } : r
    } catch {
      return { ok: false, message: 'Could not reach the license server. Try reloading in a minute.' }
    }
  },

  startTrial: (plan = 'pro') => {
    if (get().trialStartedAt || get().license) return false
    const now = Date.now()
    trialPlanMem = plan
    write(TRIAL_PLAN_KEY, plan)
    write(TRIAL_KEY, String(now))
    set({ trialStartedAt: now, ...derive(null, now), paywall: { open: false, feature: null } })
    track('trial_started', { plan })
    // The trial starts at once; a signed trial key from the server, when it comes, adds the hosted assistant.
    void (async () => {
      const key = await trialKey(plan)
      if (!key) return
      const v = await verifyLicense(key, productConfig.licensePublicKey)
      if (!v.ok || !v.payload.trial || get().license) return
      write(LICENSE_KEY, key)
      set({ key, license: v.payload, ...derive(v.payload, get().trialStartedAt) })
    })()
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

/** Ask the license server to email the keys bought with this address. */
export async function requestKeyEmail(email: string): Promise<{ ok: boolean; message: string }> {
  if (!productConfig.licenseApi) return { ok: false, message: 'Key recovery is not set up in this copy of the app.' }
  try {
    const res = await fetch(`${productConfig.licenseApi}/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const data = (await res.json()) as { ok?: boolean; error?: string }
    if (!res.ok) return { ok: false, message: data.error ?? 'Could not send the email. Try again in a minute.' }
    return { ok: true, message: `If ${email.trim()} bought Threshold, the key is on its way. Check your inbox and spam folder.` }
  } catch {
    return { ok: false, message: 'Could not reach the license server. Try again in a minute.' }
  }
}

/** Delete every design stored with this license on the server. Designs in this browser stay. */
export async function deleteSyncedDesigns(key: string): Promise<{ ok: boolean; message: string }> {
  if (!productConfig.licenseApi) return { ok: false, message: 'Design sync is not set up here.' }
  try {
    const res = await fetch(`${productConfig.licenseApi}/designs/delete-all`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `License ${key}` }, body: '{}' })
    const data = (await res.json()) as { deleted?: number; error?: string }
    if (!res.ok) return { ok: false, message: data.error ?? 'Could not delete. Try again later.' }
    const n = data.deleted ?? 0
    return { ok: true, message: `Deleted ${n} design${n === 1 ? '' : 's'} from your account. Designs in this browser stay; remove the license from this device to stop syncing.` }
  } catch {
    return { ok: false, message: 'Could not reach the server. Try again later.' }
  }
}

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

const TRIAL_NOTICE_KEY = 'threshold:trial-ended-seen'
let trialNoticeShown = false

/** Once, after a trial runs out without a purchase: open the plans sheet to say so. */
export function showTrialEndedOnce(): boolean {
  const s = useEntitlements.getState()
  const t = trialState(s.trialStartedAt)
  if (!t.used || t.active || s.source !== 'free' || trialNoticeShown || read(TRIAL_NOTICE_KEY)) return false
  trialNoticeShown = true
  write(TRIAL_NOTICE_KEY, '1')
  s.openPaywall(null)
  track('trial_ended_shown')
  return true
}

/** For tests: reset to a fresh free state. */
export function resetEntitlements() {
  trialPlanMem = null
  useEntitlements.setState({ plan: 'free', source: 'free', license: null, lapsed: null, key: null, trialStartedAt: null, paywall: { open: false, feature: null }, ready: false })
}

// Design sync for licensed customers outside Claude (see server/license-server.ts).
setLicenseSync(() => {
  const s = useEntitlements.getState()
  if (!productConfig.licenseApi || s.source !== 'license' || !s.key || !allows(s.plan, 'sync')) return null
  return { api: productConfig.licenseApi, key: s.key }
})
