/**
 * Before going live: checks the settings that selling depends on.
 *
 *   bun run launch-check          settings in .env.local / .env and the environment
 *   bun run launch-check --live   also calls the license server
 *
 * Prints one line per check (ok, warn or fail) and exits with 1 when a
 * required setting is missing or wrong. See docs/MONETIZATION.md.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { signLicense, verifyLicense } from '../src/product/license'

export type Level = 'ok' | 'warn' | 'fail'
export interface Check {
  level: Level
  text: string
}

type Env = Record<string, string | undefined>

const isHttps = (u: string | undefined) => {
  try {
    return !!u && new URL(u).protocol === 'https:'
  } catch {
    return false
  }
}

function jwk(raw: string | undefined): JsonWebKey | null {
  try {
    return raw ? (JSON.parse(raw) as JsonWebKey) : null
  } catch {
    return null
  }
}

/** Checks that need no network. `privateJwk` is the local signing key, when there is one. */
export async function checkSettings(env: Env, files: { privateJwk?: JsonWebKey | null; legal?: Record<string, string>; gitignore?: string } = {}): Promise<Check[]> {
  const out: Check[] = []
  const add = (level: Level, text: string) => out.push({ level, text })

  const pub = jwk(env.VITE_LICENSE_PUBLIC_KEY)
  if (!pub) add('fail', 'VITE_LICENSE_PUBLIC_KEY is missing or not JSON. Run `bun run license init` and copy the printed value.')
  else if (pub.kty !== 'EC' || pub.crv !== 'P-256' || !pub.x || !pub.y || 'd' in pub) add('fail', 'VITE_LICENSE_PUBLIC_KEY is not the public P-256 key (did you paste the private one?).')
  else if (files.privateJwk) {
    const probe = await signLicense({ v: 1, plan: 'pro', iat: Date.now(), exp: null }, files.privateJwk)
    const v = await verifyLicense(probe, pub)
    add(v.ok ? 'ok' : 'fail', v.ok ? 'License public key matches .license/private.jwk.' : 'VITE_LICENSE_PUBLIC_KEY does not match .license/private.jwk: keys from your server would be rejected.')
  } else add('ok', 'License public key is set.')

  const api = env.VITE_LICENSE_API
  if (!api) add('fail', 'VITE_LICENSE_API is not set: buyers cannot get their key after checkout.')
  else if (!isHttps(api) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(api)) add('fail', 'VITE_LICENSE_API must be an https address.')
  else add('ok', `License server: ${api}`)

  for (const [name, label, required] of [
    ['VITE_CHECKOUT_PRO_MONTHLY', 'Pro monthly', true],
    ['VITE_CHECKOUT_PRO_YEARLY', 'Pro yearly', true],
    ['VITE_CHECKOUT_STUDIO_MONTHLY', 'Studio monthly', false],
    ['VITE_CHECKOUT_STUDIO_YEARLY', 'Studio yearly', false],
    ['VITE_CHECKOUT_PRO_PASS', 'Build Pass', false],
  ] as const) {
    const u = env[name]
    if (!u) add(required ? 'fail' : 'warn', `${name} is not set: "${label}" shows "Checkout is not connected".`)
    else if (!isHttps(u)) add('fail', `${name} is not an https link.`)
    else if (/\/test_/.test(u)) add('warn', `${name} is a Stripe test-mode link. Switch to the live link before launch.`)
    else add('ok', `${label} checkout link is set.`)
  }

  if (!env.VITE_SITE_URL) add('warn', 'VITE_SITE_URL is not set: link previews use relative images and there is no sitemap.')
  else if (!isHttps(env.VITE_SITE_URL)) add('fail', 'VITE_SITE_URL must be an https address.')
  else add('ok', `Site: ${env.VITE_SITE_URL}`)
  if (!env.VITE_SUPPORT_EMAIL) add('warn', 'VITE_SUPPORT_EMAIL is not set: customers see no contact address.')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.VITE_SUPPORT_EMAIL)) add('fail', 'VITE_SUPPORT_EMAIL is not an email address.')
  if (!env.VITE_BILLING_PORTAL_URL) add('warn', 'VITE_BILLING_PORTAL_URL is not set: subscribers cannot manage billing from the app.')
  if (env.VITE_APP_PATH !== '/app') add('warn', 'VITE_APP_PATH is not /app: the marketing page links to ./index.html instead of the clean address.')
  if (env.VITE_SHOP_URL && !env.VITE_SHOP_URL.includes('{q}')) add('fail', 'VITE_SHOP_URL has no {q} for the search words.')
  if (!!env.VITE_INVITE_PROMO_CODE !== !!env.VITE_INVITE_OFFER) add('warn', 'Set both VITE_INVITE_PROMO_CODE and VITE_INVITE_OFFER, or neither: one without the other confuses invited friends.')

  for (const [file, text] of Object.entries(files.legal ?? {})) {
    const holes = [...new Set(text.match(/\[[^\]\n]{2,80}\]/g) ?? [])]
    if (holes.length) add('warn', `${file}: fill in ${holes.slice(0, 4).join(', ')}${holes.length > 4 ? ` and ${holes.length - 4} more` : ''}.`)
  }
  if (files.gitignore !== undefined && !(files.gitignore.includes('.license') && files.gitignore.includes('.env.local')))
    add('fail', '.gitignore must list .license/ and .env.local so the signing key is never committed.')
  return out
}

/** Asks the license server whether it is up and allows the site. */
export async function checkServer(env: Env, fetchImpl: typeof fetch = fetch): Promise<Check[]> {
  const api = env.VITE_LICENSE_API?.replace(/\/$/, '')
  if (!api) return []
  const out: Check[] = []
  try {
    const res = await fetchImpl(`${api}/activate`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.VITE_SITE_URL ? { origin: env.VITE_SITE_URL } : {}) }, body: '{"sessionId":"cs_launch_check"}' })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    out.push(res.status === 404 && body.error ? { level: 'ok', text: 'License server answers and reaches Stripe.' } : { level: 'fail', text: `License server answered ${res.status}: ${body.error ?? 'unexpected reply'}.` })
    const allow = res.headers.get('access-control-allow-origin')
    if (env.VITE_SITE_URL && allow !== '*' && allow !== env.VITE_SITE_URL.replace(/\/$/, '')) out.push({ level: 'fail', text: `License server allows ${allow ?? 'no site'}, not ${env.VITE_SITE_URL}. Set ALLOWED_ORIGIN.` })
    else if (allow === '*') out.push({ level: 'warn', text: 'License server allows any site. Set ALLOWED_ORIGIN to your address.' })
    const health = await fetchImpl(`${api}/health`, { method: 'POST', body: '{}' })
    if (health.ok) {
      const { features = {} } = (await health.json()) as { features?: Record<string, boolean> }
      const names: Record<string, string> = {
        keyEmails: 'Key emails (RESEND_API_KEY, EMAIL_FROM)',
        designSync: 'Design sync store (DESIGNS)',
        assistant: 'Hosted assistant (ANTHROPIC_API_KEY)',
        trials: 'Signed trials (DESIGNS)',
        invites: 'Invites (DESIGNS)',
        designEmails: 'Email me this design (email, DESIGNS, ALLOWED_ORIGIN)',
        refunds: 'Refund webhook (STRIPE_WEBHOOK_SECRET)',
        ownerTools: 'Stats and tips list (ADMIN_TOKEN)',
      }
      for (const [k, label] of Object.entries(names)) out.push({ level: features[k] ? 'ok' : 'warn', text: `${label}: ${features[k] ? 'on' : 'off'}` })
    }
  } catch {
    out.push({ level: 'fail', text: `Could not reach ${api}.` })
  }
  return out
}

function readEnvFiles(): Env {
  const env: Env = {}
  for (const f of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    if (!existsSync(f)) continue
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('VITE_') && v) env[k] = v
  return env
}

async function main() {
  const env = readEnvFiles()
  const legal = Object.fromEntries(readdirSync('public/legal').filter((f) => f.endsWith('.html')).map((f) => [`public/legal/${f}`, readFileSync(`public/legal/${f}`, 'utf8')]))
  const privateJwk = existsSync('.license/private.jwk') ? (JSON.parse(readFileSync('.license/private.jwk', 'utf8')) as JsonWebKey) : null
  const checks = [...(await checkSettings(env, { privateJwk, legal, gitignore: readFileSync('.gitignore', 'utf8') })), ...(process.argv.includes('--live') ? await checkServer(env) : [])]
  const mark = { ok: '✓', warn: '!', fail: '✗' }
  for (const c of checks) console.log(`${mark[c.level]} ${c.text}`)
  const fails = checks.filter((c) => c.level === 'fail').length
  const warns = checks.filter((c) => c.level === 'warn').length
  console.log(`\n${fails ? `${fails} to fix` : 'Ready to sell'}${warns ? `, ${warns} to review` : ''}.`)
  if (fails) process.exit(1)
}

if (process.argv[1]?.endsWith('launch-check.ts')) await main()
