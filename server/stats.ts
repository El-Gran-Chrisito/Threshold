/**
 * Daily counts for the site owner: how many trials, purchases, key emails,
 * assistant requests, invite credits, tips sign-ups and refunds. Counts are
 * approximate (the store is not transactional) and kept per UTC day.
 *
 *   POST /stats { days? }   Authorization: Bearer ADMIN_TOKEN
 *     -> { days: [{ day: "2026-09-28", trial: 3, purchase: 1, ... }] }
 */
import type { KV } from './license-server'

export const STATS = ['trial', 'purchase', 'key_email', 'recover', 'assistant', 'invite_credit', 'tips_signup', 'design_email', 'revoked'] as const
export type Stat = (typeof STATS)[number]

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Add one to today's count. Never throws: counting must not break a sale. */
export async function count(kv: KV | undefined, stat: Stat, now = Date.now()): Promise<void> {
  if (!kv) return
  try {
    const key = `m:stat:${dayOf(now)}:${stat}`
    const n = (Number(await kv.get(key)) || 0) + 1
    await kv.put(key, String(n), { metadata: { n } })
  } catch {
    /* counting is best effort */
  }
}

export async function statsReport(kv: KV | undefined, token: string | undefined, auth: string, days: number, now = Date.now()): Promise<{ status: number; body: unknown }> {
  if (!token || token.length < 24 || auth !== `Bearer ${token}`) return { status: 401, body: { error: 'Not allowed' } }
  if (!kv) return { status: 501, body: { error: 'Needs the design-sync store' } }
  const n = Math.min(Math.max(Math.round(days) || 30, 1), 90)
  const wanted = Array.from({ length: n }, (_, i) => dayOf(now - i * 86_400_000))
  const table = new Map<string, Record<string, number>>()
  // One small listing per day, so old days never crowd out recent ones.
  for (const day of wanted) {
    const { keys } = await kv.list({ prefix: `m:stat:${day}:`, limit: 50 })
    table.set(day, Object.fromEntries(keys.map((k) => [k.name.split(':')[3], Number((k.metadata as { n?: number } | undefined)?.n) || 0])))
  }
  return { status: 200, body: { days: wanted.map((day) => ({ day, ...Object.fromEntries(STATS.map((s) => [s, table.get(day)?.[s] ?? 0])) })) } }
}
