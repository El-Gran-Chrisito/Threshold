/**
 * Sales at a glance, from the license server's daily counts.
 *
 *   ADMIN_TOKEN=... bun run stats [days]
 *
 * Reads VITE_LICENSE_API from .env.local / .env or the environment.
 */
import { existsSync, readFileSync } from 'node:fs'

const COLUMNS: Array<[string, string]> = [
  ['trial', 'Trials'],
  ['purchase', 'Purchases'],
  ['invite_credit', 'Invites paid'],
  ['assistant', 'Assistant'],
  ['key_email', 'Key emails'],
  ['recover', 'Lost keys'],
  ['design_email', 'Designs sent'],
  ['tips_signup', 'Tips sign-ups'],
  ['revoked', 'Refunds'],
]

function setting(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue
    const m = readFileSync(f, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm'))
    if (m?.[1]) return m[1].trim().replace(/^['"](.*)['"]$/, '$1')
  }
  return undefined
}

const api = setting('VITE_LICENSE_API')?.replace(/\/$/, '')
const token = process.env.ADMIN_TOKEN
if (!api || !token) {
  console.error('Set VITE_LICENSE_API (in .env.local) and ADMIN_TOKEN (in the environment).')
  process.exit(1)
}
const days = Number(process.argv[2]) || 14
const res = await fetch(`${api}/stats`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ days }) })
if (!res.ok) {
  console.error(`The license server answered ${res.status}. Check ADMIN_TOKEN.`)
  process.exit(1)
}
const { days: rows } = (await res.json()) as { days: Array<Record<string, number | string>> }
const widths = COLUMNS.map(([, label]) => Math.max(label.length, 3))
console.log(['Day       ', ...COLUMNS.map(([, label], i) => label.padStart(widths[i]))].join('  '))
for (const r of rows) console.log([String(r.day), ...COLUMNS.map(([k], i) => String(r[k] ?? 0).padStart(widths[i]))].join('  '))
const total = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0)
console.log(['Total     ', ...COLUMNS.map(([k], i) => String(total(k)).padStart(widths[i]))].join('  '))
const trials = total('trial')
if (trials) console.log(`\nPurchases per trial: ${(total('purchase') / trials).toFixed(2)} (over ${rows.length} days; purchases also come without trials)`)
