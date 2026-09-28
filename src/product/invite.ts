/**
 * Invite links: ?invite=<code> on the marketing page or the app. The code is
 * kept for 60 days and sent with checkout (as Stripe's client_reference_id),
 * with the owner's promotion code when one is set. See server/referral.ts.
 */
import { productConfig } from './config'

const KEY = 'threshold:invite'
const DAYS = 60

export const isInviteCode = (s: string | null | undefined): s is string => !!s && /^[a-f0-9]{10}$/.test(s)

/** Keep an invite code from the address and take it out of the address. Returns the code. */
export function captureInvite(): string | null {
  try {
    const u = new URL(window.location.href)
    const code = u.searchParams.get('invite')
    if (!isInviteCode(code)) return null
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
    u.searchParams.delete('invite')
    window.history.replaceState(null, '', u.pathname + u.search + u.hash)
    return code
  } catch {
    return null
  }
}

export function storedInvite(now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    return v && isInviteCode(v.code) && now - (v.at ?? 0) < DAYS * 86_400_000 ? v.code : null
  } catch {
    return null
  }
}

/** The link a subscriber shares: the marketing page when the site address is known. */
export function inviteLink(code: string): string {
  const base = productConfig.siteUrl ? productConfig.siteUrl.replace(/\/$/, '') + '/' : window.location.origin + window.location.pathname
  return `${base}?invite=${code}`
}

/** A subscriber's invite code and how many friends have paid, from the license server. */
export async function fetchInvite(key: string): Promise<{ code: string; count: number } | null> {
  if (!productConfig.licenseApi) return null
  try {
    const res = await fetch(`${productConfig.licenseApi}/referral`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `License ${key}` }, body: '{}' })
    if (!res.ok) return null
    return (await res.json()) as { code: string; count: number }
  } catch {
    return null
  }
}
