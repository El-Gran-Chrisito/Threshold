/**
 * License keys: a small signed token the app can check offline.
 *
 *   THR1.<base64url JSON payload>.<base64url ECDSA P-256 / SHA-256 signature>
 *
 * The seller keeps the private key (on the license server or in a local
 * file); the app carries only the public key. Works in browsers and in
 * Node 20+ / edge runtimes through the standard WebCrypto API.
 */
import type { PlanId } from './plans'

export interface LicensePayload {
  v: 1
  plan: Exclude<PlanId, 'free'>
  /** Who bought it, shown in the app. */
  email?: string
  name?: string
  /** Payment reference (Stripe subscription or checkout session), used to renew. */
  ref?: string
  /** Issued and expires, ms since epoch. `exp: null` never expires (lifetime or manual keys). */
  iat: number
  exp: number | null
}

export type VerifyResult = { ok: true; payload: LicensePayload } | { ok: false; reason: 'unconfigured' | 'format' | 'signature' | 'expired' }

const PREFIX = 'THR1'
const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const enc = (s: string) => new TextEncoder().encode(s)

export async function generateKeyPair(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  return { publicJwk: await crypto.subtle.exportKey('jwk', kp.publicKey), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) }
}

export async function signLicense(payload: LicensePayload, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, ALG, false, ['sign'])
  const body = b64url(enc(JSON.stringify(payload)))
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, enc(`${PREFIX}.${body}`)))
  return `${PREFIX}.${body}.${b64url(sig)}`
}

/** Read the payload without checking the signature (for display only). */
export function peekLicense(key: string): LicensePayload | null {
  try {
    const [prefix, body] = key.trim().split('.')
    if (prefix !== PREFIX || !body) return null
    return JSON.parse(new TextDecoder().decode(unb64url(body))) as LicensePayload
  } catch {
    return null
  }
}

export async function verifyLicense(key: string, publicJwk: JsonWebKey | null, now = Date.now()): Promise<VerifyResult> {
  if (!publicJwk) return { ok: false, reason: 'unconfigured' }
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) return { ok: false, reason: 'format' }
  const payload = peekLicense(key)
  if (!payload || payload.v !== 1 || (payload.plan !== 'pro' && payload.plan !== 'studio')) return { ok: false, reason: 'format' }
  try {
    const pub = await crypto.subtle.importKey('jwk', publicJwk, ALG, false, ['verify'])
    const good = await crypto.subtle.verify(SIGN, pub, unb64url(parts[2]), enc(`${parts[0]}.${parts[1]}`))
    if (!good) return { ok: false, reason: 'signature' }
  } catch {
    return { ok: false, reason: 'signature' }
  }
  if (payload.exp !== null && payload.exp < now) return { ok: false, reason: 'expired' }
  return { ok: true, payload }
}
