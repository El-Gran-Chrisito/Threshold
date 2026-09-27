import type { Level, Opening, Vec2, Wall } from '../model/types'
import { add, dist, norm, normalOf, scale, sub } from '../model/geometry'

/** Solid stretches of a wall (distances from wall.a) once openings are cut out. */
export function wallSpans(w: Wall, openings: Opening[]): Array<[number, number]> {
  const L = dist(w.a, w.b)
  const cuts = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => [Math.max(0, o.offset - o.width / 2), Math.min(L, o.offset + o.width / 2)] as [number, number])
    .sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  let cursor = 0
  for (const [s0, s1] of cuts) {
    if (s0 > cursor + 0.1) out.push([cursor, s0])
    cursor = Math.max(cursor, s1)
  }
  if (L > cursor + 0.1) out.push([cursor, L])
  return out
}

/** Set of endpoint keys shared by 2+ walls (joints get extended to fill corners). */
export function jointKeys(level: Level): Set<string> {
  const count = new Map<string, number>()
  const k = (p: Vec2) => `${Math.round(p.x)},${Math.round(p.y)}`
  for (const w of level.walls) {
    count.set(k(w.a), (count.get(k(w.a)) ?? 0) + 1)
    count.set(k(w.b), (count.get(k(w.b)) ?? 0) + 1)
  }
  const out = new Set<string>()
  for (const [key, c] of count) if (c > 1) out.add(key)
  return out
}

export const pointKey = (p: Vec2) => `${Math.round(p.x)},${Math.round(p.y)}`

/** Polygon (4 points) for a wall stretch [s0, s1], extended at joined ends. */
export function spanPolygon(w: Wall, s0: number, s1: number, joints: Set<string>): Vec2[] {
  const L = dist(w.a, w.b)
  const d = norm(sub(w.b, w.a))
  const n = normalOf(w.a, w.b)
  const ht = w.thickness / 2
  const e0 = s0 <= 0.01 && joints.has(pointKey(w.a)) ? ht : 0
  const e1 = s1 >= L - 0.01 && joints.has(pointKey(w.b)) ? ht : 0
  const p0 = add(w.a, scale(d, s0 - e0))
  const p1 = add(w.a, scale(d, s1 + e1))
  return [add(p0, scale(n, ht)), add(p1, scale(n, ht)), add(p1, scale(n, -ht)), add(p0, scale(n, -ht))]
}

export function polyPath(pts: Vec2[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z'
}
