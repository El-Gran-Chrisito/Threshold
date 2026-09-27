/**
 * The setting around the house, worked out from the design: a street along
 * the front of the lot, a driveway from each garage door, a path from the
 * front door, planting beds along the walls, trees in the yard and beyond,
 * and neighbouring houses. Everything is in plan centimetres (y grows
 * towards the street) and is deterministic, so the same design always gets
 * the same garden.
 */
import type { Level, Lot, Opening, Project, Vec2, Wall } from './types'
import { add, lerp, norm, normalOf, pointInPolygon, scale, sub } from './geometry'
import { floorMaterial } from './materials'
import { levelBounds, wallLength } from './ops'
import { defaultLot } from './site'

export type Surroundings = 'suburb' | 'garden' | 'country' | 'plain'

export const SURROUNDINGS: Array<{ id: Surroundings; name: string; blurb: string }> = [
  { id: 'suburb', name: 'Suburban street', blurb: 'Street, sidewalk, neighbours, street trees' },
  { id: 'garden', name: 'Private garden', blurb: 'Hedges, lawn and trees, no street' },
  { id: 'country', name: 'Countryside', blurb: 'Fields, a gravel lane, woods and hills' },
  { id: 'plain', name: 'Plain ground', blurb: 'Just the house on flat ground' },
]

export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Tree {
  x: number
  y: number
  /** Height and crown radius, cm. */
  h: number
  r: number
  kind: 'round' | 'conifer'
  /** 0–1, for colour and shape variation. */
  v: number
  shadow: boolean
}

export interface Shrub {
  x: number
  y: number
  r: number
  h: number
  flower: string | null
  v: number
}

export interface Neighbour {
  x: number
  y: number
  w: number
  d: number
  storeys: 1 | 2
  /** Degrees: 0 faces +y (towards the street when across it, 180). */
  rotation: number
  wall: string
  roof: string
  trim: string
}

export interface Landscape {
  kind: Surroundings
  lot: Lot
  /** Plan y of the lot's front line; the street lies beyond it. */
  front: number
  street: { sidewalk: [number, number]; strip: [number, number]; road: [number, number]; far: [number, number, number, number] } | null
  lane: [number, number] | null
  driveways: Rect[]
  paths: Rect[]
  beds: Array<{ a: Vec2; b: Vec2; n: Vec2 }>
  shrubs: Shrub[]
  trees: Tree[]
  farTrees: Tree[]
  neighbours: Neighbour[]
  lamps: Vec2[]
  mailbox: Vec2 | null
  fences: Array<[Vec2, Vec2]>
  /** Parked cars: centre, rotation (degrees, 0 = nose towards +y) and colour. */
  cars: Array<{ x: number; y: number; rotation: number; color: string }>
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const inRect = (p: Vec2, r: Rect, pad = 0) => p.x >= r.minX - pad && p.x <= r.maxX + pad && p.y >= r.minY - pad && p.y <= r.maxY + pad

/** The level that meets the ground: elevation closest to zero, basements skipped. */
export function groundLevel(p: Project): Level | null {
  const cands = p.levels.filter((l) => l.elevation > -100 && l.walls.length)
  if (!cands.length) return null
  return cands.reduce((a, b) => (Math.abs(b.elevation) < Math.abs(a.elevation) ? b : a))
}

/** Wall faces that look outdoors (outdoor floor areas such as patios count as outdoors). */
export function outsideFaces(level: Level): Array<{ wall: Wall; out: Vec2 }> {
  const indoor = level.rooms.filter((r) => !floorMaterial(r.floor).outdoor)
  const res: Array<{ wall: Wall; out: Vec2 }> = []
  for (const w of level.walls) {
    if (wallLength(w) < 1) continue
    const n = normalOf(w.a, w.b)
    const probe = w.thickness / 2 + 8
    let inA = 0
    let inB = 0
    for (const t of [0.25, 0.5, 0.75]) {
      const m = lerp(w.a, w.b, t)
      if (indoor.some((r) => pointInPolygon(add(m, scale(n, probe)), r.points))) inA++
      if (indoor.some((r) => pointInPolygon(add(m, scale(n, -probe)), r.points))) inB++
    }
    if (inA === 0 && inB > 0) res.push({ wall: w, out: n })
    else if (inB === 0 && inA > 0) res.push({ wall: w, out: scale(n, -1) })
  }
  return res
}

function openingFace(w: Wall, o: Opening, out: Vec2): Vec2 {
  const d = norm(sub(w.b, w.a))
  return add(add(w.a, scale(d, o.offset)), scale(out, w.thickness / 2))
}

const FLOWERS = ['#E86A92', '#F4F1EA', '#F2C14E', '#B784D8', '#E8554E']
const WALLS = ['#E9E4D8', '#D9D2C3', '#C8CFD2', '#EDE6D8', '#B9A58C', '#D6C7B1', '#A9B7A0', '#F2EEE6', '#9EAAB5']
const CARS = ['#8E3B2E', '#2E4A6B', '#D9D6CF', '#3A3D40', '#7B8A96', '#A8ABAD', '#5B6E4F', '#1F2226']
const ROOFS = ['#3E4246', '#5B6168', '#6E6557', '#4A3F37', '#2F3438', '#7E4A3A']

export function buildLandscape(p: Project): Landscape | null {
  const kind: Surroundings = p.site.surroundings ?? 'suburb'
  if (kind === 'plain' || !p.site.showGround) return null
  const g = groundLevel(p)
  const lot = p.site.lot ?? defaultLot(p)
  const front = lot.y + lot.d
  const house = (g && levelBounds(g)) || { minX: lot.x + lot.w / 2 - 500, maxX: lot.x + lot.w / 2 + 500, minY: lot.y + lot.d / 2 - 500, maxY: lot.y + lot.d / 2 + 500 }
  const seed = Math.round(lot.w * 7 + lot.d * 13 + house.minX * 3 + house.maxY)
  const rand = rng(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length]

  // Street cross-section, from the lot's front line outward.
  const street =
    kind === 'suburb'
      ? {
          sidewalk: [front, front + 150] as [number, number],
          strip: [front + 150, front + 300] as [number, number],
          road: [front + 315, front + 1035] as [number, number],
          far: [front + 1050, front + 1200, front + 1350, front + 1500] as [number, number, number, number],
        }
      : null
  const lane: [number, number] | null = kind === 'country' ? [front + 150, front + 550] : null
  const reachY = street ? street.road[0] : lane ? lane[0] : front

  // Driveways from garage doors, paths from street-facing entry doors.
  const driveways: Rect[] = []
  const paths: Rect[] = []
  const faces = g ? outsideFaces(g) : []
  const doorGaps: Array<{ wall: Wall; lo: number; hi: number }> = []
  let entry: { at: Vec2; w: number } | null = null
  for (const { wall, out } of faces) {
    for (const o of g!.openings.filter((x) => x.wallId === wall.id)) {
      if (o.kind === 'window') continue
      doorGaps.push({ wall, lo: o.offset - o.width / 2 - 60, hi: o.offset + o.width / 2 + 60 })
      const at = openingFace(wall, o, out)
      if (o.kind === 'garage') {
        if (out.y > 0.7) driveways.push({ minX: at.x - o.width / 2 - 40, maxX: at.x + o.width / 2 + 40, minY: at.y, maxY: reachY })
        else if (out.y < -0.7) driveways.push({ minX: at.x - o.width / 2 - 40, maxX: at.x + o.width / 2 + 40, minY: at.y - 600, maxY: at.y })
        else if (out.x > 0.7) driveways.push({ minX: at.x, maxX: at.x + 600, minY: at.y - o.width / 2 - 40, maxY: at.y + o.width / 2 + 40 })
        else if (out.x < -0.7) driveways.push({ minX: at.x - 600, maxX: at.x, minY: at.y - o.width / 2 - 40, maxY: at.y + o.width / 2 + 40 })
      } else if ((o.kind === 'door' || o.kind === 'double-door') && out.y > 0.7) {
        const cx = (house.minX + house.maxX) / 2
        if (!entry || Math.abs(at.x - cx) < Math.abs(entry.at.x - cx)) entry = { at, w: o.width }
      }
    }
  }
  if (entry) paths.push({ minX: entry.at.x - 65, maxX: entry.at.x + 65, minY: entry.at.y, maxY: street ? street.sidewalk[0] + 1 : lane ? lane[0] : front })
  // Patio doors onto the garden get a small landing.
  for (const { wall, out } of faces) {
    for (const o of g!.openings.filter((x) => x.wallId === wall.id && (x.kind === 'slider' || x.kind === 'double-door') && out.y < -0.7)) {
      const at = openingFace(wall, o, out)
      paths.push({ minX: at.x - o.width / 2 - 40, maxX: at.x + o.width / 2 + 40, minY: at.y - 220, maxY: at.y })
    }
  }

  // Planting beds along outside walls that face the street or the sides, clear of doors.
  const beds: Landscape['beds'] = []
  const shrubs: Shrub[] = []
  const blocked = (q: Vec2) => driveways.some((r) => inRect(q, r, 30)) || paths.some((r) => inRect(q, r, 30))
  for (const { wall, out } of faces) {
    if (out.y < 0.5 && Math.abs(out.x) < 0.7) continue
    const L = wallLength(wall)
    const d = norm(sub(wall.b, wall.a))
    const gaps = doorGaps.filter((x) => x.wall.id === wall.id).sort((a, b) => a.lo - b.lo)
    let cur = 0
    const spans: Array<[number, number]> = []
    for (const gp of gaps) {
      if (gp.lo - cur > 120) spans.push([cur, gp.lo])
      cur = Math.max(cur, gp.hi)
    }
    if (L - cur > 120) spans.push([cur, L])
    const front = out.y > 0.5
    for (const [s0, s1] of spans) {
      const a = add(add(wall.a, scale(d, s0)), scale(out, wall.thickness / 2))
      const b = add(add(wall.a, scale(d, s1)), scale(out, wall.thickness / 2))
      if (blocked(lerp(a, b, 0.5))) continue
      beds.push({ a, b, n: out })
      const n = Math.max(1, Math.floor((s1 - s0) / 110))
      for (let k = 0; k < n; k++) {
        const t = s0 + ((s1 - s0) * (k + 0.5)) / n
        const at = add(add(wall.a, scale(d, t)), scale(out, wall.thickness / 2 + 45))
        if (blocked(at)) continue
        const big = k % 3 === 1
        shrubs.push({ x: at.x, y: at.y, r: big ? 42 + rand() * 12 : 30 + rand() * 10, h: big ? 80 + rand() * 30 : 50 + rand() * 20, flower: front && rand() < 0.45 ? pick(FLOWERS) : null, v: rand() })
      }
    }
  }

  // Trees in the yard: well clear of the house, driveways, paths and the lot edge.
  const trees: Tree[] = []
  const clearOf = (q: Vec2, r: number) =>
    !inRect(q, house, 450 + r * 0.4) && !driveways.some((d) => inRect(q, d, 250)) && !paths.some((d) => inRect(q, d, 220)) && trees.every((t) => Math.hypot(t.x - q.x, t.y - q.y) > 550)
  const yardTarget = Math.max(2, Math.min(9, Math.round((lot.w * lot.d) / 1_800_000)))
  for (let tries = 0; tries < 400 && trees.length < yardTarget; tries++) {
    const q = { x: lot.x + 200 + rand() * (lot.w - 400), y: lot.y + 200 + rand() * (lot.d - 400) }
    if (!clearOf(q, 250)) continue
    // Leave the middle of the front yard open so the house can be seen from the street.
    if (q.y > house.maxY && Math.abs(q.x - (house.minX + house.maxX) / 2) < (house.maxX - house.minX) * 0.3 + 250) continue
    const conifer = rand() < 0.3
    trees.push({ x: q.x, y: q.y, h: conifer ? 700 + rand() * 500 : 550 + rand() * 450, r: conifer ? 160 + rand() * 60 : 220 + rand() * 120, kind: conifer ? 'conifer' : 'round', v: rand(), shadow: true })
  }

  // Street trees, lamps and a mailbox.
  const lamps: Vec2[] = []
  let mailbox: Vec2 | null = null
  const cx = lot.x + lot.w / 2
  const span = 12000
  if (street) {
    const sy = (street.strip[0] + street.strip[1]) / 2
    const fy = (street.far[0] + street.far[1]) / 2
    for (let x = cx - span; x <= cx + span; x += 1100) {
      for (const y of [sy, fy]) {
        const q = { x: x + (y === fy ? 550 : 0), y }
        if (driveways.some((d) => q.x > d.minX - 250 && q.x < d.maxX + 250) && y === sy) continue
        if (paths.some((d) => q.x > d.minX - 200 && q.x < d.maxX + 200) && y === sy) continue
        // Keep the view of the house from across the street open.
        if (y === sy && Math.abs(q.x - (house.minX + house.maxX) / 2) < (house.maxX - house.minX) * 0.3 + 200) continue
        trees.push({ x: q.x, y: q.y, h: 650 + rand() * 250, r: 200 + rand() * 60, kind: 'round', v: rand(), shadow: Math.abs(q.x - cx) < lot.w })
      }
    }
    for (let x = cx - span + 300; x <= cx + span; x += 2800) lamps.push({ x, y: sy }, { x: x + 1400, y: fy })
    const dw = driveways.find((d) => d.maxY >= street.sidewalk[0] - 1)
    mailbox = dw ? { x: dw.maxX + 60, y: street.strip[0] + 40 } : entry ? { x: entry.at.x + 140, y: street.strip[0] + 40 } : null
  } else if (lane) {
    const dw = driveways.find((d) => d.maxY >= front - 1)
    mailbox = dw ? { x: dw.maxX + 60, y: lane[0] - 60 } : null
  }

  // Garden hedges or country fences along the sides and back of the lot.
  const fences: Array<[Vec2, Vec2]> = []
  const corners = { a: { x: lot.x, y: lot.y }, b: { x: lot.x + lot.w, y: lot.y }, c: { x: lot.x + lot.w, y: front }, d: { x: lot.x, y: front } }
  if (kind === 'garden') {
    for (const [a, b] of [
      [corners.d, corners.a],
      [corners.a, corners.b],
      [corners.b, corners.c],
    ] as Array<[Vec2, Vec2]>) {
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      for (let t = 40; t < L - 40; t += 85) {
        const q = lerp(a, b, t / L)
        if (driveways.some((d) => inRect(q, d, 40))) continue
        shrubs.push({ x: q.x, y: q.y, r: 60 + rand() * 10, h: 170 + rand() * 25, flower: null, v: 0.5 + rand() * 0.2 })
      }
    }
  }
  if (kind === 'country') fences.push([corners.d, corners.a], [corners.a, corners.b], [corners.b, corners.c])

  // Neighbours on either side and across the street.
  const neighbours: Neighbour[] = []
  const cars: Landscape['cars'] = []
  if (kind === 'suburb' && street) {
    const hw = house.maxX - house.minX
    const hd = house.maxY - house.minY
    const setback = front - house.maxY
    const mk = (x: number, y: number, rotation: number): Neighbour => {
      const w = Math.min(lot.w - 500, Math.max(900, hw * (0.75 + rand() * 0.4)))
      const d = Math.max(800, hd * (0.75 + rand() * 0.35))
      return { x, y, w, d, storeys: rand() < 0.5 ? 1 : 2, rotation, wall: pick(WALLS), roof: pick(ROOFS), trim: '#F4F2EC' }
    }
    for (const k of [-2, -1, 1, 2]) {
      const n = mk(cx + k * lot.w, 0, 0)
      n.y = front - Math.max(600, setback * (0.8 + rand() * 0.4)) - n.d / 2
      neighbours.push(n)
    }
    for (const k of [-2, -1, 0, 1, 2]) {
      const n = mk(cx + k * lot.w + lot.w * 0.15, 0, 180)
      n.y = street.far[3] + Math.max(600, setback) + n.d / 2
      neighbours.push(n)
    }
    // Their drives, and a tree or two in each front yard.
    for (const n of neighbours) {
      const facing = n.rotation === 0 ? 1 : -1
      const edge = n.y + (facing * n.d) / 2
      const dx = n.x + (rand() < 0.5 ? -1 : 1) * (n.w / 2 - 350)
      driveways.push(facing > 0 ? { minX: dx - 290, maxX: dx + 290, minY: edge, maxY: street.road[0] } : { minX: dx - 290, maxX: dx + 290, minY: street.road[1], maxY: edge })
      if (rand() < 0.65) cars.push({ x: dx, y: edge + facing * 380, rotation: facing > 0 ? 180 : 0, color: pick(CARS) })
      const ty = facing > 0 ? (edge + front) / 2 : (edge + street.far[3]) / 2
      trees.push({ x: n.x - facing * n.w * 0.2, y: ty, h: 600 + rand() * 300, r: 220 + rand() * 80, kind: rand() < 0.25 ? 'conifer' : 'round', v: rand(), shadow: false })
      trees.push({ x: n.x + (rand() - 0.5) * n.w, y: n.y - facing * (n.d / 2 + 700 + rand() * 500), h: 700 + rand() * 400, r: 250 + rand() * 100, kind: rand() < 0.4 ? 'conifer' : 'round', v: rand(), shadow: false })
    }
  }

  // A couple of cars parked along the far kerb, away from the front of the house.
  if (street) {
    for (const side of [-1, 1]) {
      const x = cx + side * (lot.w * 0.9 + rand() * lot.w * 0.8)
      if (driveways.some((d) => x > d.minX - 300 && x < d.maxX + 300)) continue
      cars.push({ x, y: street.road[1] - 125, rotation: side > 0 ? 90 : 270, color: pick(CARS) })
    }
  }

  // A distant tree line, thicker in the countryside, kept off the street.
  const farTrees: Tree[] = []
  const centre = { x: cx, y: lot.y + lot.d / 2 }
  const count = kind === 'country' ? 700 : kind === 'garden' ? 450 : 380
  const inner = kind === 'suburb' ? 4500 : 3000
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const r = inner + Math.pow(rand(), 0.7) * 22000
    const q = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r }
    if (street && q.y > street.sidewalk[0] - 300 && q.y < street.far[3] + 300) continue
    if (lane && q.y > lane[0] - 300 && q.y < lane[1] + 300) continue
    if (neighbours.some((n) => Math.abs(q.x - n.x) < n.w / 2 + 600 && Math.abs(q.y - n.y) < n.d / 2 + 600)) continue
    const conifer = rand() < (kind === 'country' ? 0.45 : 0.3)
    farTrees.push({ x: q.x, y: q.y, h: 800 + rand() * 900, r: conifer ? 220 + rand() * 120 : 320 + rand() * 250, kind: conifer ? 'conifer' : 'round', v: rand(), shadow: false })
  }

  return { kind, lot, front, street, lane, driveways, paths, beds, shrubs, trees, farTrees, neighbours, lamps, mailbox, fences, cars }
}
