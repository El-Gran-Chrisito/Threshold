/**
 * Design checks: practical problems a person would want flagged, each tied to
 * the object to select so it can be fixed in one click.
 */
import type { Item, Level, Selection, Vec2 } from './types'
import { catalogEntry } from './catalog'
import { add, norm, normalOf, pointInPolygon, rectCorners, scale, sub } from './geometry'
import { roomWallSides, wallLength } from './ops'
import { floorMaterial } from './materials'

export interface Issue {
  level: 'problem' | 'tip'
  text: string
  select?: Selection
}

function project(poly: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of poly) {
    const d = p.x * axis.x + p.y * axis.y
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

/** Convex polygon overlap (separating axis), with a small tolerance so touching is fine. */
export function convexOverlap(a: Vec2[], b: Vec2[], tol = 2): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const axis = norm({ x: -(q.y - p.y), y: q.x - p.x })
      const [a0, a1] = project(a, axis)
      const [b0, b1] = project(b, axis)
      if (a1 <= b0 + tol || b1 <= a0 + tol) return false
    }
  }
  return true
}

const ignoreForOverlap = (i: Item) => {
  const c = catalogEntry(i.type)
  return c.mount === 'ceiling' || c.mount === 'wall' || c.shape === 'rug' || c.shape === 'table-lamp' || c.shape === 'tv' || c.shape === 'tree'
}

/** Pairs that belong together and may overlap in plan (chairs tucked under tables, stools at islands, lamps on tables). */
const tucks = (a: Item, b: Item) => {
  const sa = catalogEntry(a.type).shape
  const sb = catalogEntry(b.type).shape
  const under = ['chair', 'stool', 'office-chair', 'ottoman']
  const over = ['table', 'round-table', 'desk', 'desk-l', 'island', 'base-cabinet', 'table-low']
  return (under.includes(sa) && over.includes(sb)) || (under.includes(sb) && over.includes(sa)) || sa === 'pergola' || sb === 'pergola' || sa === 'umbrella' || sb === 'umbrella'
}

export function checkLevel(level: Level): Issue[] {
  const issues: Issue[] = []
  const footprints = new Map(level.items.map((i) => [i.id, rectCorners(i, i.width, i.depth, i.rotation)]))
  const names = (i: Item) => i.name || catalogEntry(i.type).name

  // Rooms: a way in, and windows for bedrooms.
  for (const r of level.rooms) {
    if (floorMaterial(r.floor).outdoor) continue
    const sides = roomWallSides(level, r)
    if (!sides.length) continue
    const wallIds = new Set(sides.map((s) => s.wall.id))
    const openings = level.openings.filter((o) => wallIds.has(o.wallId))
    const doors = openings.filter((o) => o.kind !== 'window')
    if (!doors.length) issues.push({ level: 'problem', text: `${r.name} has no door or opening`, select: { kind: 'room', id: r.id } })
    if (/bed/i.test(r.name) && !openings.some((o) => o.kind === 'window' || o.kind === 'slider')) {
      issues.push({ level: 'problem', text: `${r.name} has no window (bedrooms need one to escape a fire)`, select: { kind: 'room', id: r.id } })
    }
  }

  // Furniture overlapping furniture.
  const floorItems = level.items.filter((i) => !ignoreForOverlap(i))
  for (let x = 0; x < floorItems.length; x++) {
    for (let y = x + 1; y < floorItems.length; y++) {
      const a = floorItems[x]
      const b = floorItems[y]
      if (Math.abs(a.elevation - b.elevation) > Math.max(a.height, b.height)) continue
      if (tucks(a, b)) continue
      if (convexOverlap(footprints.get(a.id)!, footprints.get(b.id)!)) {
        issues.push({ level: 'problem', text: `${names(a)} overlaps ${names(b)}`, select: { kind: 'item', id: a.id } })
      }
    }
  }

  // Furniture in a door's swing.
  const wallById = new Map(level.walls.map((w) => [w.id, w]))
  for (const o of level.openings) {
    if (o.kind !== 'door' && o.kind !== 'double-door') continue
    if (o.style === 'barn') continue
    const w = wallById.get(o.wallId)
    if (!w) continue
    const d = norm(sub(w.b, w.a))
    const n = scale(normalOf(w.a, w.b), o.swing === 'A' ? 1 : -1)
    const s0 = add(w.a, scale(d, o.offset - o.width / 2))
    const s1 = add(w.a, scale(d, o.offset + o.width / 2))
    const reach = (o.kind === 'double-door' ? o.width / 2 : o.width) * 0.9
    const zone = [add(s0, scale(n, w.thickness / 2)), add(s1, scale(n, w.thickness / 2)), add(s1, scale(n, w.thickness / 2 + reach)), add(s0, scale(n, w.thickness / 2 + reach))]
    for (const i of level.items) {
      const c = catalogEntry(i.type)
      if (c.mount === 'ceiling' || c.shape === 'rug' || i.elevation > 150) continue
      if (convexOverlap(zone, footprints.get(i.id)!, 3)) {
        issues.push({ level: 'problem', text: `${names(i)} is in the way of a door`, select: { kind: 'item', id: i.id } })
        break
      }
    }
  }

  // Furniture standing outside every room.
  for (const i of level.items) {
    const c = catalogEntry(i.type)
    if (c.category === 'Outdoor' || c.shape === 'stairs') continue
    if (!level.rooms.some((r) => pointInPolygon(i, r.points))) issues.push({ level: 'tip', text: `${names(i)} is outside every room`, select: { kind: 'item', id: i.id } })
  }

  // Openings too wide for their walls or overlapping each other.
  for (const w of level.walls) {
    const ops = level.openings.filter((o) => o.wallId === w.id).sort((a, b) => a.offset - b.offset)
    for (let k = 0; k + 1 < ops.length; k++) {
      if (ops[k].offset + ops[k].width / 2 > ops[k + 1].offset - ops[k + 1].width / 2 + 1) issues.push({ level: 'problem', text: 'Two openings overlap on one wall', select: { kind: 'opening', id: ops[k + 1].id } })
    }
  }

  return issues
}

/** Place base (and optionally wall) cabinets along one side of a wall, leaving doors and low windows clear. */
export function cabinetsAlongWall(level: Level, wallId: string, side: 'A' | 'B', uppers: boolean, makeItem: (type: string, at: Vec2, opts: Partial<Item>) => Item): Item[] {
  const w = level.walls.find((x) => x.id === wallId)
  if (!w) return []
  const L = wallLength(w)
  const d = norm(sub(w.b, w.a))
  const n = scale(normalOf(w.a, w.b), side === 'A' ? 1 : -1)
  const rotation = Math.round(((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360)
  const margin = w.thickness / 2 + 2
  const openings = level.openings.filter((o) => o.wallId === wallId)
  const out: Item[] = []
  const run = (upper: boolean) => {
    // Base cabinets fit under windows set above counter height; wall cabinets never cover an opening.
    const cuts = openings
      .filter((o) => upper || o.kind !== 'window' || o.sill < 95)
      .map((o) => [o.offset - o.width / 2 - 3, o.offset + o.width / 2 + 3] as [number, number])
      .sort((a, b) => a[0] - b[0])
    let cur = margin
    const spans: Array<[number, number]> = []
    for (const [a, b] of cuts) {
      if (a - cur > 30) spans.push([cur, a])
      cur = Math.max(cur, b)
    }
    if (L - margin - cur > 30) spans.push([cur, L - margin])
    for (const [a, b] of spans) {
      const count = Math.max(1, Math.round((b - a) / 61))
      const cw = (b - a) / count
      const depth = upper ? 33 : 61
      for (let k = 0; k < count; k++) {
        const at = add(add(w.a, scale(d, a + cw * (k + 0.5))), scale(n, w.thickness / 2 + depth / 2 + 0.5))
        out.push(makeItem(upper ? 'wall-cab' : 'base-60', at, { width: cw - 0.5, depth, rotation }))
      }
    }
  }
  run(false)
  if (uppers) run(true)
  return out
}
