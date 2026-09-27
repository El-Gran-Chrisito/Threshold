/**
 * A first electrical layout for a room: ceiling lights on a grid, a switch
 * on the latch side of each doorway, wall outlets no more than 12 ft apart,
 * and a smoke alarm in bedrooms and halls. Nothing is added twice: a room
 * that already has lights, switches, outlets or an alarm keeps its own.
 */
import type { Item, Level, Room, Vec2 } from './types'
import { catalogEntry } from './catalog'
import { add, bounds, labelPoint, norm, normalOf, pointInPolygon, scale, sub } from './geometry'
import { roomWallSides, wallLength } from './ops'
import { makeItem } from './factory'
import { floorMaterial } from './materials'

/** Outlet spacing: no point along a wall more than 6 ft from an outlet. */
const OUTLET_GAP = 365
const LIGHT_GRID = 200

const isCeilingLight = (i: Item) => {
  const c = catalogEntry(i.type)
  return c.mount === 'ceiling' && (c.category === 'Lighting' || c.shape === 'fan')
}

export function wireRoom(level: Level, room: Room): Item[] {
  if (floorMaterial(room.floor).outdoor) return []
  const inside = level.items.filter((i) => pointInPolygon(i, room.points))
  const has = (pred: (i: Item) => boolean) => inside.some(pred)
  const out: Item[] = []
  const b = bounds(room.points)
  const ceiling = (type: string, at: Vec2) => {
    const c = catalogEntry(type)
    out.push(makeItem(type, at, { elevation: level.height - c.h, height: c.h }))
  }

  // Ceiling lights on an even grid, kept inside the room's outline.
  if (!has(isCeilingLight)) {
    const w = b.maxX - b.minX
    const d = b.maxY - b.minY
    // Garages and utility rooms need a few bright fixtures, not a living-room grid.
    const grid = /garage|workshop|laundry|utility|storage|mechanical/i.test(room.name) ? LIGHT_GRID * 2 : LIGHT_GRID
    const nx = Math.max(1, Math.min(4, Math.round(w / grid)))
    const ny = Math.max(1, Math.min(4, Math.round(d / grid)))
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const p = { x: b.minX + ((i + 0.5) * w) / nx, y: b.minY + ((j + 0.5) * d) / ny }
        if (pointInPolygon(p, room.points)) ceiling('recessed', p)
      }
    if (!out.length) ceiling('recessed', labelPoint(room.points))
  }

  // Smoke alarm where people sleep and on the way out.
  if (/bed|hall|landing|nursery|guest|foyer|entry/i.test(room.name) && !has((i) => i.type === 'smoke-alarm')) {
    const c = labelPoint(room.points)
    const clear = out.every((l) => Math.hypot(l.x - c.x, l.y - c.y) > 45)
    ceiling('smoke-alarm', clear ? c : { x: c.x + 60, y: c.y })
  }

  const wantSwitch = !has((i) => i.type === 'switch')
  const wantOutlets = !has((i) => i.type === 'outlet')
  let switches = 0
  for (const { wall, side } of roomWallSides(level, room)) {
    const L = wallLength(wall)
    const dir = norm(sub(wall.b, wall.a))
    const n = scale(normalOf(wall.a, wall.b), side === 'A' ? 1 : -1)
    const rotation = Math.round(((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360)
    const face = (along: number, type: string) => {
      const c = catalogEntry(type)
      return makeItem(type, add(add(wall.a, scale(dir, along)), scale(n, wall.thickness / 2 + c.d / 2 + 0.5)), { rotation })
    }
    const openings = level.openings.filter((o) => o.wallId === wall.id)
    const inRoom = (along: number) => pointInPolygon(add(add(wall.a, scale(dir, along)), scale(n, wall.thickness / 2 + 12)), room.points)

    // A switch beside each doorway, on the side away from the hinge.
    if (wantSwitch) {
      for (const o of openings) {
        if (o.kind === 'window' || o.kind === 'garage' || switches >= 2) continue
        const latchEnd = o.hinge === 'start' ? 1 : -1
        const along = o.offset + latchEnd * (o.width / 2 + 12)
        if (along < 10 || along > L - 10 || !inRoom(along)) continue
        out.push(face(along, 'switch'))
        switches++
      }
    }

    // Outlets along the stretch of this wall that bounds the room.
    if (wantOutlets) {
      const blocked = (along: number) => openings.some((o) => o.kind !== 'window' && Math.abs(along - o.offset) < o.width / 2 + 15)
      let start = -1
      const spans: Array<[number, number]> = []
      for (let t = 15; t <= L - 15; t += 15) {
        const ok = inRoom(t)
        if (ok && start < 0) start = t
        if ((!ok || t + 15 > L - 15) && start >= 0) {
          spans.push([start, ok ? t : t - 15])
          start = -1
        }
      }
      for (const [s0, s1] of spans) {
        const len = s1 - s0
        if (len < 60) continue
        const count = Math.max(1, Math.ceil(len / OUTLET_GAP))
        for (let k = 0; k < count; k++) {
          let along = s0 + (len * (k + 0.5)) / count
          // Slide off a doorway if needed.
          for (let tries = 0; tries < 8 && blocked(along); tries++) along += 20
          if (along > s1 || blocked(along)) continue
          out.push(face(along, 'outlet'))
        }
      }
    }
  }
  return out
}

/** Electrical counts for a summary line. */
export function wiringSummary(items: Item[]): string {
  const n = (t: string) => items.filter((i) => i.type === t).length
  const kinds: Array<[string, string, string]> = [
    ['recessed', 'light', 'lights'],
    ['switch', 'switch', 'switches'],
    ['outlet', 'outlet', 'outlets'],
    ['smoke-alarm', 'smoke alarm', 'smoke alarms'],
  ]
  return kinds
    .map(([t, one, many]) => [n(t), one, many] as const)
    .filter(([k]) => k > 0)
    .map(([k, one, many]) => `${k} ${k === 1 ? one : many}`)
    .join(', ')
}
