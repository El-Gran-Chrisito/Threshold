/**
 * Selling setup, read from build-time environment variables so the same code
 * ships to any host. See docs/MONETIZATION.md. Anything left unset simply
 * turns that path off (for example, no checkout links means the upgrade
 * buttons explain that checkout is not connected yet).
 */
import type { PlanId } from './plans'

const env = import.meta.env as Record<string, string | undefined>

function jwk(raw: string | undefined): JsonWebKey | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonWebKey
  } catch {
    return null
  }
}

export type Billing = 'monthly' | 'yearly'

export const productConfig = {
  name: 'Threshold',
  siteUrl: env.VITE_SITE_URL || '',
  supportEmail: env.VITE_SUPPORT_EMAIL || '',
  /** Public half of the license signing key (JWK JSON). */
  licensePublicKey: jwk(env.VITE_LICENSE_PUBLIC_KEY),
  /** Base URL of the license server (for activation after checkout and renewals). */
  licenseApi: (env.VITE_LICENSE_API || '').replace(/\/$/, ''),
  /** Hosted checkout pages (Stripe Payment Links, Lemon Squeezy, Paddle...). */
  checkout: {
    pro: { monthly: env.VITE_CHECKOUT_PRO_MONTHLY || '', yearly: env.VITE_CHECKOUT_PRO_YEARLY || '' },
    studio: { monthly: env.VITE_CHECKOUT_STUDIO_MONTHLY || '', yearly: env.VITE_CHECKOUT_STUDIO_YEARLY || '' },
  } as Record<Exclude<PlanId, 'free'>, Record<Billing, string>>,
  trialDays: 7,
}

export function checkoutUrl(plan: Exclude<PlanId, 'free'>, billing: Billing, email?: string): string | null {
  const base = productConfig.checkout[plan][billing]
  if (!base) return null
  try {
    const u = new URL(base)
    if (email) u.searchParams.set('prefilled_email', email)
    return u.toString()
  } catch {
    return null
  }
}
