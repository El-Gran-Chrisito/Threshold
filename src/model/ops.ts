/**
 * Pure editing operations. Every function takes a Level (or Project) and
 * returns a new one; inputs are never mutated.
 */
import type { Item, Level, Opening, Room, Vec2, Wall, WallFinish } from './types'
import {
  add,
  bounds,
  closestOnSegment,
  dist,
  distToSegment,
  labelPoint,
  lerp,
  normalOf,
  pointInPolygon,
  polygonArea,
  projectT,
  samePoint,
  scale,
  segmentIntersection,
  sideOf,
  signedArea,
  simplifyPolygon,
  sub,
  subtractCovered,
} from './geometry'
import { makeRoom, makeWall } from './factory'

export const wallLength = (w: Wall): number => dist(w.a, w.b)

export function openingsOn(level: Level, wallId: string): Opening[] {
  return level.openings.filter((o) => o.wallId === wallId)
}

/** Keep an opening fully on its wall. */
export function clampOpening(o: Opening, w: Wall): Opening {
  const L = wallLength(w)
  const width = Math.min(o.width, Math.max(10, L - 2))
  const offset = Math.min(Math.max(o.offset, width / 2), L - width / 2)
  return width === o.width && offset === o.offset ? o : { ...o, width, offset }
}

// ---------------------------------------------------------------------------
// Walls

/**
 * Add wall segments, skipping any stretch already covered by a collinear wall
 * so rooms drawn side by side share one wall instead of doubling it.
 */
export function addWalls(level: Level, segments: Array<[Vec2, Vec2]>, opts: Partial<Wall> = {}): { level: Level; added: Wall[] } {
  const walls = [...level.walls]
  const added: Wall[] = []
  for (const [a, b] of segments) {
    if (dist(a, b) < 2) continue
    const pieces = subtractCovered(
      a,
      b,
      walls.map((w) => [w.a, w.b] as [Vec2, Vec2]),
    )
    for (const [t0, t1] of pieces) {
      const w = makeWall(lerp(a, b, t0), lerp(a, b, t1), opts)
      walls.push(w)
      added.push(w)
    }
  }
  return { level: { ...level, walls }, added }
}

export function updateWall(level: Level, id: string, patch: Partial<Wall>): Level {
  const walls = level.walls.map((w) => (w.id === id ? { ...w, ...patch } : w))
  const wall = walls.find((w) => w.id === id)
  const openings = wall ? level.openings.map((o) => (o.wallId === id ? clampOpening(o, wall) : o)) : level.openings
  return { ...level, walls, openings }
}

export function deleteWalls(level: Level, ids: string[]): Level {
  const set = new Set(ids)
  return {
    ...level,
    walls: level.walls.filter((w) => !set.has(w.id)),
    openings: level.openings.filter((o) => !set.has(o.wallId)),
  }
}

/** Split a wall at the point nearest `p`; openings go to whichever half holds their centre. */
export function splitWall(level: Level, id: string, p: Vec2): Level {
  const w = level.walls.find((x) => x.id === id)
  if (!w) return level
  const { t, point } = closestOnSegment(p, w.a, w.b)
  const L = wallLength(w)
  if (t * L < 5 || (1 - t) * L < 5) return level
  const w1 = { ...makeWall(w.a, point), thickness: w.thickness, height: w.height, colorA: w.colorA, colorB: w.colorB }
  const w2 = { ...makeWall(point, w.b), thickness: w.thickness, height: w.height, colorA: w.colorA, colorB: w.colorB }
  const cut = t * L
  const openings = level.openings.map((o) => {
    if (o.wallId !== id) return o
    return o.offset <= cut ? clampOpening({ ...o, wallId: w1.id }, w1) : clampOpening({ ...o, wallId: w2.id, offset: o.offset - cut }, w2)
  })
  return { ...level, walls: level.walls.flatMap((x) => (x.id === id ? [w1, w2] : [x])), openings }
}

/**
 * Move every wall endpoint and room vertex located at `from` to `to`.
 * `base` is the level as it was when the drag started, so repeated calls
 * during a drag do not accumulate error or pick up other joints.
 */
export function moveVertex(base: Level, from: Vec2, to: Vec2): Level {
  const walls = base.walls.map((w) => {
    const a = samePoint(w.a, from) ? { ...to } : w.a
    const b = samePoint(w.b, from) ? { ...to } : w.b
    return a === w.a && b === w.b ? w : { ...w, a, b }
  })
  const rooms = base.rooms.map((r) => {
    let changed = false
    const points = r.points.map((p) => {
      if (samePoint(p, from)) {
        changed = true
        return { ...to }
      }
      return p
    })
    return changed ? { ...r, points } : r
  })
  return reclampOpenings({ ...base, walls, rooms })
}

/** Move a whole wall by `delta`, dragging joined walls and room corners with it. */
export function moveWall(base: Level, id: string, delta: Vec2): Level {
  const w = base.walls.find((x) => x.id === id)
  if (!w) return base
  let next = moveVertex(base, w.a, add(w.a, delta))
  // moveVertex on the moved level: the second endpoint is still at its old place.
  next = moveVertex(next, w.b, add(w.b, delta))
  return next
}

function reclampOpenings(level: Level): Level {
  const byId = new Map(level.walls.map((w) => [w.id, w]))
  let changed = false
  const openings = level.openings.map((o) => {
    const w = byId.get(o.wallId)
    if (!w) return o
    const c = clampOpening(o, w)
    if (c !== o) changed = true
    return c
  })
  return changed ? { ...level, openings } : level
}

export function findWallAt(level: Level, p: Vec2, tol = 8): Wall | null {
  let best: Wall | null = null
  let bestD = Infinity
  for (const w of level.walls) {
    const d = distToSegment(p, w.a, w.b)
    if (d <= w.thickness / 2 + tol && d < bestD) {
      best = w
      bestD = d
    }
  }
  return best
}

/** Is segment [a,b] lying along the polygon's boundary? */
function onBoundary(a: Vec2, b: Vec2, pts: Vec2[], tol = 2): boolean {
  const mid = lerp(a, b, 0.5)
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    if (distToSegment(a, p, q) <= tol && distToSegment(b, p, q) <= tol && distToSegment(mid, p, q) <= tol) return true
  }
  return false
}

/** Walls that bound a room, with the side facing into it. */
export function roomWallSides(level: Level, room: Room): Array<{ wall: Wall; side: 'A' | 'B' }> {
  const out: Array<{ wall: Wall; side: 'A' | 'B' }> = []
  for (const w of level.walls) {
    const L = wallLength(w)
    if (L < 1) continue
    // Sample several points along the wall so partially-bounding walls count.
    const n = normalOf(w.a, w.b)
    const probe = w.thickness / 2 + 6
    let aHits = 0
    let bHits = 0
    for (const t of [0.2, 0.5, 0.8]) {
      const m = lerp(w.a, w.b, t)
      const nearEdge = room.points.some((p, i) => distToSegment(m, p, room.points[(i + 1) % room.points.length]) <= w.thickness / 2 + 4)
      if (!nearEdge) continue
      if (pointInPolygon(add(m, scale(n, probe)), room.points)) aHits++
      if (pointInPolygon(add(m, scale(n, -probe)), room.points)) bHits++
    }
    if (aHits > bHits) out.push({ wall: w, side: 'A' })
    else if (bHits > aHits) out.push({ wall: w, side: 'B' })
  }
  return out
}

export function paintRoomWalls(level: Level, roomId: string, color: string, finish?: WallFinish): Level {
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room) return level
  const sides = new Map(roomWallSides(level, room).map((s) => [s.wall.id, s.side]))
  return {
    ...level,
    walls: level.walls.map((w) => {
      const s = sides.get(w.id)
      if (!s) return w
      if (s === 'A') return { ...w, colorA: color, ...(finish ? { finishA: finish } : {}) }
      return { ...w, colorB: color, ...(finish ? { finishB: finish } : {}) }
    }),
  }
}

/** Sides of walls that face outdoors (not inside any room). */
export function exteriorSides(level: Level): Array<{ wall: Wall; side: 'A' | 'B' }> {
  const out: Array<{ wall: Wall; side: 'A' | 'B' }> = []
  for (const w of level.walls) {
    const m = lerp(w.a, w.b, 0.5)
    const n = normalOf(w.a, w.b)
    const probe = w.thickness / 2 + 6
    const inA = level.rooms.some((r) => pointInPolygon(add(m, scale(n, probe)), r.points))
    const inB = level.rooms.some((r) => pointInPolygon(add(m, scale(n, -probe)), r.points))
    if (inA && !inB) out.push({ wall: w, side: 'B' })
    else if (inB && !inA) out.push({ wall: w, side: 'A' })
  }
  return out
}

export function paintExterior(level: Level, color: string, thickness?: number, finish?: WallFinish): Level {
  const sides = new Map(exteriorSides(level).map((s) => [s.wall.id, s.side]))
  return {
    ...level,
    walls: level.walls.map((w) => {
      const s = sides.get(w.id)
      if (!s) return w
      const t = thickness ?? w.thickness
      if (s === 'A') return { ...w, colorA: color, thickness: t, ...(finish ? { finishA: finish } : {}) }
      return { ...w, colorB: color, thickness: t, ...(finish ? { finishB: finish } : {}) }
    }),
  }
}

// ---------------------------------------------------------------------------
// Rooms

export function rectPoints(a: Vec2, b: Vec2): Vec2[] {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

/** Create a room from a polygon and wall its perimeter (sharing any existing walls). */
export function addRoom(level: Level, points: Vec2[], opts: Partial<Room> = {}, wallOpts: Partial<Wall> = {}, withWalls = true): { level: Level; room: Room } {
  let pts = simplifyPolygon(points)
  if (signedArea(pts) < 0) pts = [...pts].reverse()
  const room = makeRoom(pts, { name: opts.name ?? nextRoomName(level), ...opts })
  let next: Level = { ...level, rooms: [...level.rooms, room] }
  if (withWalls) {
    const segs: Array<[Vec2, Vec2]> = pts.map((p, i) => [p, pts[(i + 1) % pts.length]])
    next = addWalls(next, segs, wallOpts).level
  }
  return { level: next, room }
}

export function nextRoomName(level: Level): string {
  let n = level.rooms.length + 1
  const names = new Set(level.rooms.map((r) => r.name))
  while (names.has(`Room ${n}`)) n++
  return `Room ${n}`
}

export function roomArea(r: Room): number {
  return polygonArea(r.points)
}

/** Walls lying on this room's boundary and on no other room's boundary. */
export function exclusiveWalls(level: Level, room: Room): Wall[] {
  return level.walls.filter(
    (w) => onBoundary(w.a, w.b, room.points) && !level.rooms.some((r) => r.id !== room.id && onBoundary(w.a, w.b, r.points)),
  )
}

/** Move a room with its own walls and the furniture standing in it. */
export function moveRoom(base: Level, roomId: string, delta: Vec2): Level {
  const room = base.rooms.find((r) => r.id === roomId)
  if (!room) return base
  const own = new Set(exclusiveWalls(base, room).map((w) => w.id))
  const inside = (p: Vec2) => pointInPolygon(p, room.points)
  return {
    ...base,
    rooms: base.rooms.map((r) => (r.id === roomId ? { ...r, points: r.points.map((p) => add(p, delta)) } : r)),
    walls: base.walls.map((w) => (own.has(w.id) ? { ...w, a: add(w.a, delta), b: add(w.b, delta) } : w)),
    items: base.items.map((i) => (inside(i) ? { ...i, x: i.x + delta.x, y: i.y + delta.y } : i)),
    labels: base.labels.map((l) => (inside(l) ? { ...l, x: l.x + delta.x, y: l.y + delta.y } : l)),
  }
}

export function deleteRoom(level: Level, roomId: string, withWalls: boolean): Level {
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room) return level
  let next: Level = { ...level, rooms: level.rooms.filter((r) => r.id !== roomId) }
  if (withWalls) next = deleteWalls(next, exclusiveWalls(level, room).map((w) => w.id))
  return next
}

/** Resize a rectangular-ish room by moving one edge: points on that edge shift by `delta` along its normal. */
export function moveRoomEdge(base: Level, roomId: string, edgeIndex: number, distance: number): Level {
  const room = base.rooms.find((r) => r.id === roomId)
  if (!room) return base
  const p = room.points[edgeIndex]
  const q = room.points[(edgeIndex + 1) % room.points.length]
  const n = normalOf(p, q)
  // Outward normal: for positive signed area (clockwise on screen) the left normal points inward.
  const outward = signedArea(room.points) > 0 ? scale(n, -1) : n
  const d = scale(outward, distance)
  let next = moveVertex(base, p, add(p, d))
  next = moveVertex(next, q, add(q, d))
  return next
}

/** Side lengths of a room that is a rectangle (any rotation), in point order; null for other shapes. */
export function rectSides(room: Room): { a: number; b: number } | null {
  const p = room.points
  if (p.length !== 4) return null
  for (let i = 0; i < 4; i++) {
    const u = sub(p[(i + 1) % 4], p[i])
    const v = sub(p[(i + 2) % 4], p[(i + 1) % 4])
    const lu = Math.hypot(u.x, u.y)
    const lv = Math.hypot(v.x, v.y)
    if (lu < 1 || lv < 1 || Math.abs((u.x * v.x + u.y * v.y) / (lu * lv)) > 0.02) return null
  }
  return { a: dist(p[0], p[1]), b: dist(p[1], p[2]) }
}

/**
 * Set a rectangular room's side lengths. The second and third edges move
 * outward (east and south for a room drawn from its top-left corner), taking
 * their walls with them, exactly like dragging those edges.
 */
export function setRoomSides(level: Level, roomId: string, a: number, b: number): Level {
  const room = level.rooms.find((r) => r.id === roomId)
  const cur = room && rectSides(room)
  if (!room || !cur) return level
  let next = Math.abs(a - cur.a) > 0.05 ? moveRoomEdge(level, roomId, 1, a - cur.a) : level
  if (Math.abs(b - cur.b) > 0.05) next = moveRoomEdge(next, roomId, 2, b - cur.b)
  return next
}

/**
 * Set a room's floor area, keeping its shape. Rectangles keep their
 * proportions and grow east and south; other shapes scale from the top-left
 * corner of their bounds. Walls and shared corners move with the room.
 */
export function setRoomArea(level: Level, roomId: string, cm2: number): Level {
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room || cm2 <= 0) return level
  const k = Math.sqrt(cm2 / roomArea(room))
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-4) return level
  const sides = rectSides(room)
  if (sides) return setRoomSides(level, roomId, sides.a * k, sides.b * k)
  const b = bounds(room.points)
  const o = { x: b.minX, y: b.minY }
  // Move far points first when growing (near first when shrinking) so a
  // moved corner never lands on one that has not moved yet.
  const order = [...room.points].sort((p, q) => (dist(q, o) - dist(p, o)) * (k > 1 ? 1 : -1))
  let next = level
  for (const p of order) next = moveVertex(next, p, { x: o.x + (p.x - o.x) * k, y: o.y + (p.y - o.y) * k })
  return next
}

/**
 * Add a corner in the middle of a room edge so the edge can bend (a
 * rectangle becomes an L-shape). Walls running through that point are split
 * there, so dragging the new corner moves them too.
 */
export function insertRoomVertex(level: Level, roomId: string, edgeIndex: number): { level: Level; point: Vec2 } | null {
  const room = level.rooms.find((r) => r.id === roomId)
  if (!room) return null
  const a = room.points[edgeIndex]
  const b = room.points[(edgeIndex + 1) % room.points.length]
  if (!a || !b || dist(a, b) < 20) return null
  const m = lerp(a, b, 0.5)
  let next: Level = {
    ...level,
    rooms: level.rooms.map((r) => (r.id === roomId ? { ...r, points: [...r.points.slice(0, edgeIndex + 1), m, ...r.points.slice(edgeIndex + 1)] } : r)),
  }
  for (const w of level.walls) {
    const c = closestOnSegment(m, w.a, w.b)
    if (c.d < 1 && c.t > 0.01 && c.t < 0.99) next = splitWall(next, w.id, m)
  }
  return { level: next, point: m }
}

/** Index of the room edge lying on a side of its bounding box (N/E/S/W), or -1. */
export function edgeOnSide(room: Room, side: 'N' | 'E' | 'S' | 'W'): number {
  const b = bounds(room.points)
  let best = -1
  let bestLen = 0
  room.points.forEach((p, i) => {
    const q = room.points[(i + 1) % room.points.length]
    const on =
      side === 'N' ? Math.abs(p.y - b.minY) < 1 && Math.abs(q.y - b.minY) < 1 : side === 'S' ? Math.abs(p.y - b.maxY) < 1 && Math.abs(q.y - b.maxY) < 1 : side === 'W' ? Math.abs(p.x - b.minX) < 1 && Math.abs(q.x - b.minX) < 1 : Math.abs(p.x - b.maxX) < 1 && Math.abs(q.x - b.maxX) < 1
    const len = dist(p, q)
    if (on && len > bestLen) {
      best = i
      bestLen = len
    }
  })
  return best
}

// ---------------------------------------------------------------------------
// Room detection from free-drawn walls

interface Node {
  p: Vec2
  adj: number[]
}

/** Find closed areas bounded by walls and return their polygons (positive signed area). */
export function detectFaces(walls: Wall[], minArea = 4000): Vec2[][] {
  const segs = walls.map((w) => [w.a, w.b] as [Vec2, Vec2])
  // Split every segment at intersections and at endpoints of other segments.
  const cuts: number[][] = segs.map(() => [0, 1])
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i]
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue
      const [c, d] = segs[j]
      const hit = segmentIntersection(a, b, c, d)
      if (hit) cuts[i].push(hit.t)
      for (const e of [c, d]) {
        if (distToSegment(e, a, b) <= 2) cuts[i].push(projectT(e, a, b))
      }
    }
  }
  const nodes: Node[] = []
  const nodeIndex = (p: Vec2): number => {
    for (let k = 0; k < nodes.length; k++) if (dist(nodes[k].p, p) <= 2) return k
    nodes.push({ p, adj: [] })
    return nodes.length - 1
  }
  const edgeSet = new Set<string>()
  segs.forEach(([a, b], i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.round(Math.min(1, Math.max(0, t)) * 1e6) / 1e6))].sort((x, y) => x - y)
    for (let k = 0; k + 1 < ts.length; k++) {
      const u = nodeIndex(lerp(a, b, ts[k]))
      const v = nodeIndex(lerp(a, b, ts[k + 1]))
      if (u === v) continue
      const key = u < v ? `${u}-${v}` : `${v}-${u}`
      if (edgeSet.has(key)) continue
      edgeSet.add(key)
      nodes[u].adj.push(v)
      nodes[v].adj.push(u)
    }
  })
  const ang = (u: number, v: number) => Math.atan2(nodes[v].p.y - nodes[u].p.y, nodes[v].p.x - nodes[u].p.x)
  for (let u = 0; u < nodes.length; u++) nodes[u].adj.sort((x, y) => ang(u, x) - ang(u, y))

  const visited = new Set<string>()
  const faces: Vec2[][] = []
  for (let u = 0; u < nodes.length; u++) {
    for (const v0 of nodes[u].adj) {
      if (visited.has(`${u}>${v0}`)) continue
      const cycle: number[] = []
      let a = u
      let b = v0
      let guard = 0
      while (!visited.has(`${a}>${b}`) && guard++ < 10000) {
        visited.add(`${a}>${b}`)
        cycle.push(a)
        // At b, take the neighbour with the next smaller angle than the way back to a.
        const adj = nodes[b].adj
        const back = ang(b, a)
        let next = -1
        for (let k = adj.length - 1; k >= 0; k--) {
          if (ang(b, adj[k]) < back - 1e-9) {
            next = adj[k]
            break
          }
        }
        if (next === -1) next = adj[adj.length - 1]
        a = b
        b = next
      }
      if (cycle.length < 3) continue
      let poly = removeSpikes(cycle.map((k) => nodes[k].p))
      poly = simplifyPolygon(poly)
      if (poly.length >= 3 && signedArea(poly) > minArea) faces.push(poly)
    }
  }
  return faces
}

function removeSpikes(pts: Vec2[]): Vec2[] {
  let out = [...pts]
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length]
      const next = out[(i + 1) % out.length]
      if (samePoint(prev, next, 1)) {
        // prev → cur → prev: drop cur and the duplicate.
        const j = (i + 1) % out.length
        out = out.filter((_, k) => k !== i && k !== j)
        changed = true
        break
      }
    }
  }
  return out
}

/** Add rooms for every enclosed area not already covered by a room. */
export function autoRooms(level: Level): { level: Level; count: number } {
  const faces = detectFaces(level.walls)
  let next = level
  let count = 0
  for (const f of faces) {
    const lp = labelPoint(f)
    if (next.rooms.some((r) => pointInPolygon(lp, r.points))) continue
    next = addRoom(next, f, {}, {}, false).level
    count++
  }
  return { level: next, count }
}

// ---------------------------------------------------------------------------
// Items

/**
 * If an item is near a wall, back it onto the wall face and turn it to face
 * the room. Returns null when no wall is close enough.
 */
export function snapItemToWall(level: Level, item: Item, at: Vec2, reach = 40): { x: number; y: number; rotation: number } | null {
  let best: { x: number; y: number; rotation: number; gap: number } | null = null
  for (const w of level.walls) {
    const { point, t } = closestOnSegment(at, w.a, w.b)
    if (t <= 0.001 || t >= 0.999) continue
    const n0 = normalOf(w.a, w.b)
    const side = sideOf(at, w.a, w.b) >= 0 ? 1 : -1
    const n = scale(n0, side)
    const offset = w.thickness / 2 + item.depth / 2 + 0.5
    const d = dist(at, point)
    const gap = Math.abs(d - offset)
    if (gap > reach) continue
    if (!best || gap < best.gap) {
      const c = add(point, scale(n, offset))
      const rotation = Math.round(((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360)
      best = { x: c.x, y: c.y, rotation, gap }
    }
  }
  return best ? { x: best.x, y: best.y, rotation: best.rotation } : null
}

// ---------------------------------------------------------------------------
// Bounds

export function levelPoints(level: Level): Vec2[] {
  const pts: Vec2[] = []
  for (const w of level.walls) pts.push(w.a, w.b)
  for (const r of level.rooms) pts.push(...r.points)
  for (const i of level.items) pts.push({ x: i.x - i.width / 2, y: i.y - i.depth / 2 }, { x: i.x + i.width / 2, y: i.y + i.depth / 2 })
  return pts
}

export function levelBounds(level: Level) {
  const pts = levelPoints(level)
  if (!pts.length) return null
  return bounds(pts)
}

