/**
 * Accessibility check (switched on per design): what someone using a
 * wheelchair, or planning to live in the home as they get older, would want
 * flagged. Based on common universal-design guidance: 32 in (81 cm) clear
 * through doors, 36 in (91 cm) wide hallways, a 60 in (152 cm) turning
 * circle in a bathroom on the entry floor, and a bedroom and a full
 * bathroom on that floor. These are tips, not a code review.
 */
import type { Issue } from './checks'
import { catalogEntry } from './catalog'
import { add, bounds, distToSegment, lerp, normalOf, pointInPolygon, rectCorners, scale } from './geometry'
import { floorMaterial } from './materials'
import { wallLength } from './ops'
import type { Level, Opening, Project, Room, Vec2 } from './types'

export const CLEAR_DOOR = 81.3
export const HALL_WIDTH = 91.4
export const TURNING = 152.4

const SKIP_ROOM = /\b(closet|pantry|linen|wardrobe|storage)\b/i
const HALL = /\b(hall|hallway|corridor|landing|gallery)\b/i
const BATH = /\b(bath|bathroom|ensuite|en-suite|wc|toilet|powder|shower)\b/i
const HALF_BATH = /\b(powder|half|wc|toilet)\b/i
const BED = /\bbed(room)?\b/i

/** Clear width a wheelchair gets through an opening (a door leaf and stop take about 2 in). */
export function clearWidth(o: Opening): number | null {
  switch (o.kind) {
    case 'door':
      return o.width - 5
    case 'double-door':
      return o.width - 8
    case 'slider':
      return o.width / 2 - 5
    case 'opening':
      return o.width
    default:
      return null
  }
}

/** Rooms on either side of an opening. */
function roomsAt(level: Level, o: Opening): Room[] {
  const w = level.walls.find((x) => x.id === o.wallId)
  if (!w) return []
  const c = lerp(w.a, w.b, o.offset / Math.max(1, wallLength(w)))
  const n = normalOf(w.a, w.b)
  const probe = w.thickness / 2 + 8
  const sides = [add(c, scale(n, probe)), add(c, scale(n, -probe))]
  return sides.map((q) => level.rooms.find((r) => pointInPolygon(q, r.points))).filter((r): r is Room => !!r)
}

/** Distance from a point to a polygon's outline (0 when inside it). */
function distToPolygon(p: Vec2, pts: Vec2[]): number {
  if (pointInPolygon(p, pts)) return 0
  let d = Infinity
  for (let i = 0; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % pts.length]))
  return d
}

/** Whether a circle of this diameter fits on the room's open floor, clear of walls and floor-standing fixtures. */
export function turningCircleFits(level: Level, room: Room, diameter = TURNING): boolean {
  const r = diameter / 2
  const b = bounds(room.points)
  if (b.maxX - b.minX < diameter || b.maxY - b.minY < diameter) return false
  const half = Math.max(...level.walls.map((w) => w.thickness / 2), 0)
  const blocks = level.items
    .filter((i) => pointInPolygon(i, room.points))
    .filter((i) => {
      const c = catalogEntry(i.type)
      return c.mount !== 'wall' && c.mount !== 'ceiling' && c.shape !== 'rug'
    })
    .map((i) => rectCorners(i, i.width, i.depth, i.rotation))
  const step = 5
  for (let x = b.minX + r; x <= b.maxX - r; x += step) {
    for (let y = b.minY + r; y <= b.maxY - r; y += step) {
      const p = { x, y }
      if (!pointInPolygon(p, room.points)) continue
      let edge = Infinity
      for (let i = 0; i < room.points.length; i++) edge = Math.min(edge, distToSegment(p, room.points[i], room.points[(i + 1) % room.points.length]))
      // Room outlines run along wall centre lines; the usable floor stops at the wall face.
      if (edge - half < r) continue
      if (blocks.every((poly) => distToPolygon(p, poly) >= r)) return true
    }
  }
  return false
}

function isFullBath(level: Level, room: Room): boolean {
  if (!BATH.test(room.name) || HALF_BATH.test(room.name)) return false
  const fixtures = level.items.filter((i) => pointInPolygon(i, room.points)).map((i) => catalogEntry(i.type).shape)
  return fixtures.length === 0 || fixtures.includes('shower') || fixtures.includes('bathtub')
}

export function accessIssues(p: Project, level: Level): Issue[] {
  const issues: Issue[] = []
  // Door and hall widths read best in plain inches or centimetres.
  const len = (cm: number) => (p.units === 'metric' ? `${Math.round(cm)} cm` : `${Math.round(cm / 2.54)} in`)
  const indoor = level.rooms.filter((r) => !floorMaterial(r.floor).outdoor)

  for (const o of level.openings) {
    const clear = clearWidth(o)
    if (clear === null || clear >= CLEAR_DOOR - 0.5) continue
    const rooms = roomsAt(level, o).filter((r) => !floorMaterial(r.floor).outdoor)
    // Reach-in closets and pantries do not need wheelchair-width doors.
    if (rooms.some((r) => SKIP_ROOM.test(r.name) && !/walk-in/i.test(r.name))) continue
    const where = rooms.length === 1 ? `${rooms[0].name} to outside` : rooms.length ? `${rooms[0].name} to ${rooms[1].name}` : 'Outside'
    const kind = o.kind === 'opening' ? 'opening' : o.kind === 'slider' ? 'sliding door' : 'door'
    issues.push({ level: 'tip', text: `${where} ${kind} is about ${len(clear)} clear; wheelchairs need ${len(CLEAR_DOOR)}`, select: { kind: 'opening', id: o.id } })
  }

  for (const r of indoor) {
    if (!HALL.test(r.name)) continue
    const b = bounds(r.points)
    const width = Math.min(b.maxX - b.minX, b.maxY - b.minY)
    if (width < HALL_WIDTH - 0.5) issues.push({ level: 'tip', text: `${r.name} is ${len(width)} wide; ${len(HALL_WIDTH)} lets a wheelchair pass`, select: { kind: 'room', id: r.id } })
  }

  const entry = [...p.levels].sort((a, b) => a.elevation - b.elevation)[0]
  if (entry && entry.id === level.id) {
    const baths = indoor.filter((r) => BATH.test(r.name))
    if (baths.length && !baths.some((r) => turningCircleFits(level, r))) {
      issues.push({ level: 'tip', text: `No bathroom on this floor has room for a ${p.units === 'metric' ? '150 cm' : '5 ft'} turning circle`, select: { kind: 'room', id: baths[0].id } })
    }
    if (p.levels.length > 1) {
      if (!indoor.some((r) => BED.test(r.name))) issues.push({ level: 'tip', text: 'No bedroom on the entry floor, so living on one level is not possible' })
      if (!indoor.some((r) => isFullBath(level, r))) issues.push({ level: 'tip', text: 'No full bathroom (shower or bath) on the entry floor' })
    }
  }
  return issues
}

/** Openings the accessibility check flags as too narrow. */
export function narrowOpenings(p: Project, level: Level): Opening[] {
  const ids = new Set(accessIssues(p, level).flatMap((i) => (i.select?.kind === 'opening' ? [i.select.id] : [])))
  return level.openings.filter((o) => ids.has(o.id))
}

/**
 * Widen doors and openings to a 36 in (91 cm) width where the wall allows:
 * each stays clear of wall ends and of other openings on the same wall,
 * sliding along the wall if that makes room. Returns how many changed.
 */
export function widenDoors(level: Level, ids: Set<string>, target = HALL_WIDTH): { level: Level; widened: number } {
  let widened = 0
  const openings = level.openings.map((o) => {
    if (!ids.has(o.id) || (o.kind !== 'door' && o.kind !== 'opening' && o.kind !== 'double-door')) return o
    const w = level.walls.find((x) => x.id === o.wallId)
    if (!w) return o
    const L = wallLength(w)
    const margin = Math.max(10, w.thickness)
    let lo = margin
    let hi = L - margin
    for (const q of level.openings) {
      if (q.id === o.id || q.wallId !== o.wallId) continue
      const q0 = q.offset - q.width / 2
      const q1 = q.offset + q.width / 2
      if (q1 <= o.offset) lo = Math.max(lo, q1 + 5)
      else if (q0 >= o.offset) hi = Math.min(hi, q0 - 5)
    }
    const width = Math.min(target, hi - lo)
    if (width <= o.width + 0.5) return o
    const offset = Math.min(Math.max(o.offset, lo + width / 2), hi - width / 2)
    widened++
    return { ...o, width, offset }
  })
  return { level: widened ? { ...level, openings } : level, widened }
}
