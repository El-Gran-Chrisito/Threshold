import type { Level, Vec2 } from '../model/types'
import { closestOnSegment, dist, snapAngle, snapToGrid } from '../model/geometry'

export interface Guide {
  axis: 'x' | 'y'
  value: number
  from: Vec2
}

export interface SnapResult {
  p: Vec2
  kind: 'vertex' | 'edge' | 'grid' | 'free' | 'angle'
  guides: Guide[]
}

export interface SnapOptions {
  level: Level
  enabled: boolean
  grid: number
  /** Plan units per screen pixel. */
  pxToCm: number
  /** Previous point in a chain: enables angle snapping. */
  from?: Vec2
  /** Points to ignore (e.g., the vertex being dragged). */
  ignore?: Vec2[]
  edges?: boolean
}

function candidates(level: Level, ignore: Vec2[] = []): Vec2[] {
  const out: Vec2[] = []
  const skip = (p: Vec2) => ignore.some((q) => dist(p, q) < 0.5)
  for (const w of level.walls) {
    if (!skip(w.a)) out.push(w.a)
    if (!skip(w.b)) out.push(w.b)
  }
  for (const r of level.rooms) for (const p of r.points) if (!skip(p)) out.push(p)
  return out
}

export function snapPoint(raw: Vec2, o: SnapOptions): SnapResult {
  if (!o.enabled) return { p: raw, kind: 'free', guides: [] }
  const pts = candidates(o.level, o.ignore)
  const vertexTol = 12 * o.pxToCm
  let best: Vec2 | null = null
  let bestD = vertexTol
  for (const p of pts) {
    const d = dist(p, raw)
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  if (best) return { p: { ...best }, kind: 'vertex', guides: [] }

  // Angle snap from the previous chain point.
  let p = raw
  let kind: SnapResult['kind'] = 'grid'
  if (o.from) {
    p = snapAngle(o.from, raw, 15)
    kind = 'angle'
  }

  // Wall edge snap (point on an existing wall's centreline).
  if (o.edges !== false) {
    const edgeTol = 8 * o.pxToCm
    for (const w of o.level.walls) {
      const c = closestOnSegment(p, w.a, w.b)
      if (c.d < edgeTol && c.t > 0 && c.t < 1) return { p: c.point, kind: 'edge', guides: [] }
    }
  }

  // Alignment guides with existing vertices.
  const guides: Guide[] = []
  const alignTol = 7 * o.pxToCm
  let ax: Vec2 | null = null
  let ay: Vec2 | null = null
  for (const q of pts) {
    if (Math.abs(q.x - p.x) < alignTol && (!ax || Math.abs(q.x - p.x) < Math.abs(ax.x - p.x))) ax = q
    if (Math.abs(q.y - p.y) < alignTol && (!ay || Math.abs(q.y - p.y) < Math.abs(ay.y - p.y))) ay = q
  }
  if (kind !== 'angle') {
    const g = snapToGrid(p, o.grid)
    p = { x: ax ? ax.x : g.x, y: ay ? ay.y : g.y }
  } else {
    // Keep the angle but align along it when a guide is near.
    if (ax && o.from && Math.abs(p.x - o.from.x) > 1) p = { x: ax.x, y: p.y + ((ax.x - p.x) * (p.y - o.from.y)) / (p.x - o.from.x || 1) }
    else if (ay && o.from && Math.abs(p.y - o.from.y) > 1) p = { x: p.x + ((ay.y - p.y) * (p.x - o.from.x)) / (p.y - o.from.y || 1), y: ay.y }
    else if (o.from) {
      // Round the length to the grid along the snapped direction.
      const L = dist(o.from, p)
      const Lr = Math.round(L / o.grid) * o.grid
      if (L > 0) p = { x: o.from.x + ((p.x - o.from.x) * Lr) / L, y: o.from.y + ((p.y - o.from.y) * Lr) / L }
    }
  }
  if (ax && Math.abs(ax.x - p.x) < 0.5) guides.push({ axis: 'x', value: ax.x, from: ax })
  if (ay && Math.abs(ay.y - p.y) < 0.5) guides.push({ axis: 'y', value: ay.y, from: ay })
  return { p, kind, guides }
}
