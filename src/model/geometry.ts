import type { Vec2 } from './types'

export const EPS = 0.5 // cm: tolerance for "same point" / "on segment"

export const v = (x: number, y: number): Vec2 => ({ x, y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const len = (a: Vec2): number => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const samePoint = (a: Vec2, b: Vec2, tol = EPS): boolean => dist(a, b) <= tol

export function norm(a: Vec2): Vec2 {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Left-hand normal of segment a→b in plan space: (-dy, dx), unit length. */
export function normalOf(a: Vec2, b: Vec2): Vec2 {
  const d = norm(sub(b, a))
  return { x: -d.y, y: d.x }
}

export function rotate(p: Vec2, deg: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}

/** Parameter t of the projection of p onto line a→b (unclamped). */
export function projectT(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  return l2 === 0 ? 0 : dot(sub(p, a), ab) / l2
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; d: number } {
  const t = Math.max(0, Math.min(1, projectT(p, a, b)))
  const point = lerp(a, b, t)
  return { point, t, d: dist(p, point) }
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return closestOnSegment(p, a, b).d
}

/** Signed side of p relative to a→b: >0 on the left-normal side. */
export function sideOf(p: Vec2, a: Vec2, b: Vec2): number {
  const n = normalOf(a, b)
  return dot(sub(p, a), n)
}

export function isCollinear(a: Vec2, b: Vec2, c: Vec2, d: Vec2, tol = EPS): boolean {
  const l = dist(a, b)
  if (l < tol) return false
  return Math.abs(sideOf(c, a, b)) <= tol && Math.abs(sideOf(d, a, b)) <= tol
}

/**
 * Subtract from segment [a,b] every interval covered by the given collinear
 * segments. Returns the remaining pieces as [t0,t1] parameter pairs on a→b.
 */
export function subtractCovered(a: Vec2, b: Vec2, others: Array<[Vec2, Vec2]>, tol = EPS): Array<[number, number]> {
  const L = dist(a, b)
  if (L < tol) return []
  const covered: Array<[number, number]> = []
  for (const [c, d] of others) {
    if (!isCollinear(a, b, c, d, tol)) continue
    let t0 = projectT(c, a, b)
    let t1 = projectT(d, a, b)
    if (t0 > t1) [t0, t1] = [t1, t0]
    const lo = Math.max(0, t0)
    const hi = Math.min(1, t1)
    if (hi - lo > tol / L) covered.push([lo, hi])
  }
  covered.sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  let cursor = 0
  for (const [lo, hi] of covered) {
    if (lo - cursor > tol / L) out.push([cursor, lo])
    cursor = Math.max(cursor, hi)
  }
  if (1 - cursor > tol / L) out.push([cursor, 1])
  // Drop slivers shorter than 2 cm.
  return out.filter(([t0, t1]) => (t1 - t0) * L >= 2)
}

/** Proper or touching intersection point of two segments, or null. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { point: Vec2; t: number; u: number } | null {
  const r = sub(p2, p1)
  const s = sub(p4, p3)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-9) return null
  const qp = sub(p3, p1)
  const t = cross(qp, s) / denom
  const u = cross(qp, r) / denom
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null
  return { point: lerp(p1, p2, t), t, u }
}

/** Signed area (shoelace). Positive when the points run clockwise in y-down plan space. */
export function signedArea(pts: Vec2[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

export function polygonArea(pts: Vec2[]): number {
  return Math.abs(signedArea(pts))
}

export function polygonPerimeter(pts: Vec2[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length])
  return s
}

export function centroid(pts: Vec2[]): Vec2 {
  const A = signedArea(pts)
  if (Math.abs(A) < 1e-6) {
    const n = pts.length || 1
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * A), y: cy / (6 * A) }
}

export function pointInPolygon(p: Vec2, pts: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** A point inside the polygon suitable for a label: centroid when inside, else a scanline midpoint. */
export function labelPoint(pts: Vec2[]): Vec2 {
  const c = centroid(pts)
  if (pointInPolygon(c, pts)) return c
  // Scan a horizontal line through the centroid and pick the widest interior span.
  const xs: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a.y <= c.y && b.y > c.y) || (b.y <= c.y && a.y > c.y)) {
      xs.push(a.x + ((c.y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
  }
  xs.sort((p, q) => p - q)
  let best = c
  let bestW = -1
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const w = xs[i + 1] - xs[i]
    if (w > bestW) {
      bestW = w
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y }
    }
  }
  return best
}

export function bounds(pts: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function snapToGrid(p: Vec2, step: number): Vec2 {
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
}

/** Constrain b so a→b is at a multiple of `stepDeg` degrees. */
export function snapAngle(a: Vec2, b: Vec2, stepDeg = 45): Vec2 {
  const d = sub(b, a)
  const l = len(d)
  if (l === 0) return b
  const ang = Math.atan2(d.y, d.x)
  const step = (stepDeg * Math.PI) / 180
  const snapped = Math.round(ang / step) * step
  return { x: a.x + Math.cos(snapped) * l, y: a.y + Math.sin(snapped) * l }
}

/** Corners of an oriented rectangle centred at c (rotation in degrees). */
export function rectCorners(c: Vec2, w: number, d: number, rotation: number): Vec2[] {
  const hw = w / 2
  const hd = d / 2
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => rotate(add(p, c), rotation, c))
}

/** Remove consecutive duplicate points and collinear middle points. */
export function simplifyPolygon(pts: Vec2[], tol = EPS): Vec2[] {
  let out = pts.filter((p, i) => !samePoint(p, pts[(i + 1) % pts.length], tol))
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]
      const cur = out[i]
      const next = out[(i + 1) % out.length]
      if (Math.abs(sideOf(cur, prev, next)) <= tol && dot(sub(cur, prev), sub(next, cur)) > 0) {
        out = out.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return out
}

export function angleDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function normalizeDeg(d: number): number {
  const r = d % 360
  return r < 0 ? r + 360 : r
}
