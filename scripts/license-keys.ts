/**
 * License key tool for the seller.
 *
 *   bun run license init                 create a signing key pair (once)
 *   bun run license issue --plan pro --email buyer@example.com [--days 365]
 *   bun run license verify <key>
 *
 * `init` writes the private key to .license/private.jwk (git-ignored) and
 * prints the two settings to copy: VITE_LICENSE_PUBLIC_KEY for the app build
 * and LICENSE_PRIVATE_KEY for the license server. Keep the private key
 * secret: anyone with it can make keys.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { generateKeyPair, signLicense, verifyLicense, type LicensePayload } from '../src/product/license'

const DIR = '.license'
const PRIVATE = `${DIR}/private.jwk`
const PUBLIC = `${DIR}/public.jwk`

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'init') {
    if (existsSync(PRIVATE) && !process.argv.includes('--force')) {
      console.error(`${PRIVATE} already exists. Keys made with it would stop working if it changed. Use --force to replace it.`)
      process.exit(1)
    }
    const { publicJwk, privateJwk } = await generateKeyPair()
    mkdirSync(DIR, { recursive: true })
    writeFileSync(PRIVATE, JSON.stringify(privateJwk))
    writeFileSync(PUBLIC, JSON.stringify(publicJwk))
    console.log('Signing keys created in .license/\n')
    console.log('App build setting (for .env or your host):')
    console.log(`VITE_LICENSE_PUBLIC_KEY='${JSON.stringify(publicJwk)}'\n`)
    console.log('License server secret:')
    console.log(`LICENSE_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`)
    return
  }
  if (cmd === 'issue') {
    const plan = arg('plan') ?? 'pro'
    if (plan !== 'pro' && plan !== 'studio') throw new Error('--plan must be pro or studio')
    const days = Number(arg('days') ?? '0')
    const privateJwk = JSON.parse(readFileSync(arg('key') ?? PRIVATE, 'utf8')) as JsonWebKey
    const now = Date.now()
    const payload: LicensePayload = { v: 1, plan, email: arg('email'), name: arg('name'), ref: arg('ref'), iat: now, exp: days > 0 ? now + days * 86_400_000 : null }
    console.log(await signLicense(payload, privateJwk))
    return
  }
  if (cmd === 'verify') {
    const key = process.argv[3]
    const publicJwk = JSON.parse(readFileSync(arg('pub') ?? PUBLIC, 'utf8')) as JsonWebKey
    console.log(JSON.stringify(await verifyLicense(key, publicJwk), null, 2))
    return
  }
  console.log('Usage: bun run license init | issue --plan pro|studio --email <email> [--days N] | verify <key>')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
