/**
 * One-click furnishing: a sensible starting set for a room, chosen from its
 * name and size, placed against free walls and kept out of door swings.
 * Every piece is an ordinary item afterwards.
 */
import type { Item, Level, Room, Vec2 } from './types'
import { catalogEntry } from './catalog'
import { makeItem } from './factory'
import { bounds, dist, lerp, pointInPolygon, rectCorners } from './geometry'
import { roomArea, roomWallSides } from './ops'
import { cabinetsAlongWall, convexOverlap, doorZones } from './checks'
import { CM2_PER_FT2 } from './units'

type Side = 'N' | 'E' | 'S' | 'W'

interface SideInfo {
  side: Side
  /** Free stretches along the side, as [from, to] in cm along the side's axis. */
  free: Array<[number, number]>
  best: [number, number] | null
}

const ROT: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 }
const OPP: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' }

function sideInfo(level: Level, room: Room): SideInfo[] {
  const b = bounds(room.points)
  const sides = roomWallSides(level, room)
  const out: SideInfo[] = []
  for (const side of ['N', 'E', 'S', 'W'] as Side[]) {
    const horizontal = side === 'N' || side === 'S'
    const lo = horizontal ? b.minX : b.minY
    const hi = horizontal ? b.maxX : b.maxY
    const line = side === 'N' ? b.minY : side === 'S' ? b.maxY : side === 'W' ? b.minX : b.maxX
    // Blocked stretches: door openings (plus swing clearance) on walls along this side.
    const blocked: Array<[number, number]> = []
    let hasWall = false
    for (const { wall: w } of sides) {
      const m = lerp(w.a, w.b, 0.5)
      const on = horizontal ? Math.abs(m.y - line) < w.thickness + 4 : Math.abs(m.x - line) < w.thickness + 4
      if (!on) continue
      hasWall = true
      for (const o of level.openings.filter((x) => x.wallId === w.id && x.kind !== 'window')) {
        const L = dist(w.a, w.b)
        const c = lerp(w.a, w.b, o.offset / L)
        const along = horizontal ? c.x : c.y
        blocked.push([along - o.width / 2 - 25, along + o.width / 2 + 25])
      }
    }
    if (!hasWall) continue
    blocked.sort((p, q) => p[0] - q[0])
    const free: Array<[number, number]> = []
    let cur = lo + 8
    for (const [a, c] of blocked) {
      if (a - cur > 40) free.push([cur, a])
      cur = Math.max(cur, c)
    }
    if (hi - 8 - cur > 40) free.push([cur, hi - 8])
    const best = [...free].sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] ?? null
    out.push({ side, free, best })
  }
  return out.sort((p, q) => (q.best ? q.best[1] - q.best[0] : 0) - (p.best ? p.best[1] - p.best[0] : 0))
}

/** Position for an item of depth d backed onto `side`, centred at `along` (cm along that side's axis). */
function onSide(room: Room, side: Side, along: number, depth: number, gap = 7): Vec2 {
  const b = bounds(room.points)
  switch (side) {
    case 'N':
      return { x: along, y: b.minY + gap + depth / 2 }
    case 'S':
      return { x: along, y: b.maxY - gap - depth / 2 }
    case 'W':
      return { x: b.minX + gap + depth / 2, y: along }
    case 'E':
      return { x: b.maxX - gap - depth / 2, y: along }
  }
}

/** Offset a point into the room from a side by `d` cm. */
function inward(side: Side, p: Vec2, d: number): Vec2 {
  return side === 'N' ? { x: p.x, y: p.y + d } : side === 'S' ? { x: p.x, y: p.y - d } : side === 'W' ? { x: p.x + d, y: p.y } : { x: p.x - d, y: p.y }
}

function along(side: Side, p: Vec2): number {
  return side === 'N' || side === 'S' ? p.x : p.y
}

function withAlong(side: Side, p: Vec2, a: number): Vec2 {
  return side === 'N' || side === 'S' ? { x: a, y: p.y } : { x: p.x, y: a }
}

export function furnishRoom(level: Level, room: Room): Item[] {
  const name = room.name.toLowerCase()
  const sqft = roomArea(room) / CM2_PER_FT2
  const b = bounds(room.points)
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  const long = b.maxX - b.minX >= b.maxY - b.minY ? 'x' : 'y'
  const sides = sideInfo(level, room)
  const primary = sides[0]
  const placed: Item[] = []
  const existing = level.items
  const swings = doorZones(level)

  const fits = (it: Item) => {
    const poly = rectCorners(it, it.width, it.depth, it.rotation)
    if (!poly.every((p) => pointInPolygon(p, room.points))) return false
    const c = catalogEntry(it.type)
    if (c.shape === 'rug' || c.mount === 'wall' || c.mount === 'ceiling') return true
    if (it.elevation < 150 && swings.some((z) => convexOverlap(z, poly, 3))) return false
    return [...existing, ...placed].every((o) => {
      const oc = catalogEntry(o.type)
      if (oc.shape === 'rug' || oc.mount === 'wall' || oc.mount === 'ceiling') return true
      return !convexOverlap(poly, rectCorners(o, o.width, o.depth, o.rotation), 1)
    })
  }
  const put = (type: string, at: Vec2, rotation: number, opts: Partial<Item> = {}) => {
    const c = catalogEntry(type)
    const it = makeItem(type, at, { rotation, height: c.h, elevation: c.mount === 'ceiling' ? level.height - c.h : c.elevation ?? 0, ...opts })
    if (fits(it)) {
      placed.push(it)
      return it
    }
    return null
  }
  /** Back an item onto a side, trying the preferred spot first, then other spots along that side. */
  const againstBest = (type: string, s: SideInfo | undefined, opts: Partial<Item> = {}, pos = 0.5) => {
    if (!s) return null
    const c = catalogEntry(type)
    const w = opts.width ?? c.w
    for (const span of [s.best, ...s.free.filter((f) => f !== s.best)]) {
      if (!span || span[1] - span[0] < w) continue
      for (const t of [pos, 0.5, 0.15, 0.85, 0]) {
        const a = span[0] + w / 2 + (span[1] - span[0] - w) * t
        const it = put(type, onSide(room, s.side, a, opts.depth ?? c.d), ROT[s.side], opts)
        if (it) return it
      }
    }
    return null
  }
  /** Same, on any side (best first), optionally shrinking the width. */
  const anywhere = (type: string, widths: number[], opts: Partial<Item> = {}) => {
    for (const w of widths) for (const s of sides) {
      const it = againstBest(type, s, { ...opts, width: w })
      if (it) return it
    }
    return null
  }

  if (/bed|guest|nursery|kid/.test(name)) {
    const bedType = /nursery/.test(name) ? 'crib' : sqft >= 150 ? 'bed-king' : sqft >= 110 ? 'bed-queen' : sqft >= 80 ? 'bed-full' : 'bed-twin'
    const bed = againstBest(bedType, primary)
    if (bed && primary) {
      const a = along(primary.side, bed)
      const off = catalogEntry(bedType).w / 2 + 30
      for (const k of [-1, 1]) {
        const p = onSide(room, primary.side, a + k * off, catalogEntry('nightstand').d)
        put('nightstand', p, ROT[primary.side])
      }
      put('rug', inward(primary.side, withAlong(primary.side, bed, a), 30), ROT[primary.side], { width: catalogEntry(bedType).w + 90, depth: 180 })
    }
    againstBest('dresser', sides.find((s) => s.side === OPP[primary?.side ?? 'N'])) ?? againstBest('dresser', sides[1])
    if (sqft > 140) againstBest('armchair', sides[2] ?? sides[1], {}, 0.8)
  } else if (/living|family|lounge|great|den|sitting/.test(name)) {
    const sofa = againstBest(sqft > 200 ? 'sofa-3' : 'sofa-2', primary)
    if (sofa && primary) {
      const sd = catalogEntry(sofa.type).d
      const table = inward(primary.side, sofa, sd / 2 + 55)
      put('coffee-table', table, ROT[primary.side])
      put('rug', inward(primary.side, sofa, sd / 2 + 60), primary.side === 'N' || primary.side === 'S' ? 0 : 90, { width: 244, depth: 168 })
      const opp = sides.find((s) => s.side === OPP[primary.side])
      const tv = againstBest('tv-stand', opp)
      if (tv) put('tv', { x: tv.x, y: tv.y }, tv.rotation, { elevation: 55 })
      const across = catalogEntry('coffee-table').w / 2 + 70
      for (const k of [-1, 1]) {
        const p = withAlong(primary.side, table, along(primary.side, table) + k * across)
        put('armchair', p, ROT[primary.side] + k * 90 + 180)
      }
    }
    againstBest('floor-lamp', sides[1], {}, 0.05)
    againstBest('plant', sides[2] ?? sides[1], {}, 0.95)
  } else if (/dining/.test(name)) {
    const seats = sqft > 150 ? 6 : 4
    const type = seats === 6 ? 'table-6' : 'table-4'
    const rot = long === 'x' ? 0 : 90
    const t = put(type, center, rot)
    if (t) {
      const c = catalogEntry(type)
      const halfW = c.w / 2
      const halfD = c.d / 2
      const chairsLong = seats === 6 ? [-0.3, 0.3] : [0]
      for (const f of chairsLong) {
        const u = f * c.w
        if (rot === 0) {
          put('chair', { x: center.x + u, y: center.y - halfD - 22 }, 0)
          put('chair', { x: center.x + u, y: center.y + halfD + 22 }, 180)
        } else {
          put('chair', { x: center.x - halfD - 22, y: center.y + u }, 270)
          put('chair', { x: center.x + halfD + 22, y: center.y + u }, 90)
        }
      }
      if (rot === 0) {
        put('chair', { x: center.x - halfW - 22, y: center.y }, 270)
        put('chair', { x: center.x + halfW + 22, y: center.y }, 90)
      } else {
        put('chair', { x: center.x, y: center.y - halfW - 22 }, 0)
        put('chair', { x: center.x, y: center.y + halfW + 22 }, 180)
      }
      put('chandelier', center, 0)
      againstBest('sideboard', primary)
    }
  } else if (/kitchen/.test(name)) {
    const s = sides[0]
    if (s) {
      const w = [...roomWallSides(level, room)].sort((p, q) => dist(q.wall.a, q.wall.b) - dist(p.wall.a, p.wall.b))
      const target = w.find((x) => {
        const m = lerp(x.wall.a, x.wall.b, 0.5)
        return s.side === 'N' ? Math.abs(m.y - b.minY) < 30 : s.side === 'S' ? Math.abs(m.y - b.maxY) < 30 : s.side === 'W' ? Math.abs(m.x - b.minX) < 30 : Math.abs(m.x - b.maxX) < 30
      })
      if (target) {
        for (const cab of cabinetsAlongWall(level, target.wall.id, target.side, true, makeItem)) {
          if (fits(cab)) placed.push(cab)
        }
        // Swap the end cabinets for a fridge and a range when there is room.
        const bases = placed.filter((i) => i.type === 'base-60').sort((p, q) => along(s.side, p) - along(s.side, q))
        if (bases.length >= 4) {
          const f = bases[0]
          Object.assign(f, { type: 'fridge', depth: 76, height: 178, color: '#A8ABAD', color2: '#2A2B2D' })
          const r = bases[Math.floor(bases.length / 2)]
          Object.assign(r, { type: 'range', depth: 66, color: '#A8ABAD', color2: '#2A2B2D' })
          const sink = bases[bases.length - 1]
          Object.assign(sink, { type: 'sink-cab', color2: '#E4E1DA' })
        }
      }
    }
    if (sqft > 160) put('island', inward(s?.side ?? 'N', center, 0), long === 'x' ? 0 : 90)
  } else if (/bath|powder|wc|toilet/.test(name)) {
    againstBest('vanity', sides[0], {}, 0.5)
    againstBest('toilet', sides[1] ?? sides[0], {}, 0.8)
    if (sqft >= 40 && !/powder/.test(name)) {
      const tubSide = sides[2] ?? sides[1]
      if (!againstBest('bathtub', tubSide, { width: 152, depth: 76 })) againstBest('shower', tubSide)
    }
    againstBest('mirror', sides[0], {}, 0.5)
  } else if (/office|study|work/.test(name)) {
    const desk = againstBest('desk', primary)
    if (desk && primary) put('office-chair', inward(primary.side, desk, 60), ROT[primary.side] + 180)
    againstBest('bookshelf', sides.find((s) => s.side === OPP[primary?.side ?? 'N']) ?? sides[1])
    againstBest('floor-lamp', sides[1], {}, 0.1)
  } else if (/closet|wardrobe|dressing/.test(name)) {
    anywhere('wardrobe', [240, 180, 150, 120, 90], { depth: 60 })
  } else if (/laundry|utility|mud/.test(name)) {
    againstBest('washer', primary, {}, 0.1)
    againstBest('dryer', primary, {}, 0.45)
    againstBest('utility-sink', primary, {}, 0.9)
  } else if (/garage/.test(name)) {
    put('car', center, long === 'x' ? 90 : 0)
  } else {
    againstBest('bench', primary)
    againstBest('plant', sides[1], {}, 0.9)
  }
  return placed
}
