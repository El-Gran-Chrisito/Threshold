/**
 * Floor plans as a DXF drawing (AutoCAD R12 text format), which every CAD
 * program opens: walls with their openings cut out, doors with swings,
 * windows, room outlines with names and areas, furniture, stairs, labels,
 * kept dimensions and the lot. Floors sit side by side. Layers follow the
 * US National CAD Standard names (A-WALL, A-DOOR and so on). Imperial
 * designs are drawn in inches, metric ones in millimetres.
 */
import { catalogEntry, isStairs, stairOutline } from '../model/catalog'
import { add, dist, labelPoint, norm, normalOf, rectCorners, rotate, scale, sub } from '../model/geometry'
import { levelBounds, roomArea } from '../model/ops'
import { formatArea, formatLength } from '../model/units'
import type { Level, Opening, Project, Vec2, Wall } from '../model/types'
import { jointKeys, spanPolygon, wallSpans } from './wallGeometry'

/** Layer names and colours; a negative colour means the layer starts switched off. */
export const DXF_LAYERS: Array<[name: string, color: number]> = [
  ['A-WALL', 7],
  ['A-DOOR', 3],
  ['A-GLAZ', 5],
  // Room outlines run along wall centre lines, so they start hidden.
  ['A-AREA', -8],
  ['A-FURN', 9],
  ['A-FLOR-STRS', 6],
  ['E-ELEC', 1],
  ['A-ANNO-TEXT', 7],
  ['A-ANNO-DIMS', 2],
  ['L-SITE', 4],
]

/** DXF group codes and values, one pair per two lines. */
class Writer {
  lines: string[] = []
  k: number
  constructor(k: number) {
    this.k = k
  }
  pair(code: number, value: string | number) {
    this.lines.push(String(code), typeof value === 'number' ? fmt(value) : value)
  }
  /** Plan point (cm, y down) to drawing units (y up). */
  xy(p: Vec2, base = 10) {
    this.pair(base, p.x * this.k)
    this.pair(base + 10, -p.y * this.k)
    this.pair(base + 20, 0)
  }
  line(layer: string, a: Vec2, b: Vec2) {
    this.pair(0, 'LINE')
    this.pair(8, layer)
    this.xy(a, 10)
    this.xy(b, 11)
  }
  poly(layer: string, pts: Vec2[], closed = true) {
    if (pts.length < 2) return
    this.pair(0, 'POLYLINE')
    this.pair(8, layer)
    this.pair(66, 1)
    this.pair(10, 0)
    this.pair(20, 0)
    this.pair(30, 0)
    this.pair(70, closed ? 1 : 0)
    for (const p of pts) {
      this.pair(0, 'VERTEX')
      this.pair(8, layer)
      this.xy(p)
    }
    this.pair(0, 'SEQEND')
    this.pair(8, layer)
  }
  /** Arc around c from a to b the short way round (plan points). */
  arc(layer: string, c: Vec2, a: Vec2, b: Vec2) {
    const ang = (p: Vec2) => (Math.atan2(-(p.y - c.y), p.x - c.x) * 180) / Math.PI
    let s = ang(a)
    let e = ang(b)
    if ((((e - s) % 360) + 360) % 360 > 180) [s, e] = [e, s]
    this.pair(0, 'ARC')
    this.pair(8, layer)
    this.xy(c)
    this.pair(40, dist(c, a) * this.k)
    this.pair(50, (s + 360) % 360)
    this.pair(51, (e + 360) % 360)
  }
  circle(layer: string, c: Vec2, r: number) {
    this.pair(0, 'CIRCLE')
    this.pair(8, layer)
    this.xy(c)
    this.pair(40, r * this.k)
  }
  /** Text centred on a plan point; height in cm. */
  text(layer: string, at: Vec2, height: number, value: string, rotation = 0) {
    const clean = dxfText(value.replace(/[\r\n]+/g, ' ').trim())
    if (!clean) return
    this.pair(0, 'TEXT')
    this.pair(8, layer)
    this.xy(at, 10)
    this.pair(40, height * this.k)
    this.pair(1, clean)
    if (rotation) this.pair(50, rotation)
    this.pair(72, 1)
    this.xy(at, 11)
    this.pair(73, 2)
  }
}

/** Characters outside plain ASCII as DXF \\U+XXXX escapes, which CAD programs read in any code page. */
export function dxfText(s: string): string {
  return [...s].map((ch) => {
    const c = ch.codePointAt(0)!
    return c < 32 ? ' ' : c < 127 ? ch : c <= 0xffff ? `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}` : '?'
  }).join('')
}

function fmt(n: number): string {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

function openingSymbols(o: Opening, w: Wall, out: Writer) {
  const d = norm(sub(w.b, w.a))
  const n = normalOf(w.a, w.b)
  const t = w.thickness
  const s0 = o.offset - o.width / 2
  const s1 = o.offset + o.width / 2
  const at = (s: number, side = 0) => add(add(w.a, scale(d, s)), scale(n, side))
  const jambs = (layer: string) => {
    out.line(layer, at(s0, t / 2), at(s0, -t / 2))
    out.line(layer, at(s1, t / 2), at(s1, -t / 2))
  }
  const side = o.swing === 'A' ? 1 : -1
  const leaf = (hingeS: number, closedS: number, width: number) => {
    const hinge = at(hingeS, (side * t) / 2)
    const closed = at(closedS, (side * t) / 2)
    const open = add(hinge, scale(n, side * width))
    out.line('A-DOOR', hinge, open)
    out.arc('A-DOOR', hinge, open, closed)
  }
  switch (o.kind) {
    case 'door':
      if (o.style === 'barn') {
        const off = side * (t / 2 + 4)
        const x = o.hinge === 'start' ? s0 - o.width + 2 : s1 - 12
        out.line('A-DOOR', at(x, off), at(x + o.width + 10, off))
      } else if (o.hinge === 'start') leaf(s0, s1, o.width)
      else leaf(s1, s0, o.width)
      jambs('A-DOOR')
      break
    case 'double-door':
      leaf(s0, o.offset, o.width / 2)
      leaf(s1, o.offset, o.width / 2)
      jambs('A-DOOR')
      break
    case 'slider':
      out.line('A-DOOR', at(s0, t * 0.12), at(o.offset + o.width * 0.05, t * 0.12))
      out.line('A-DOOR', at(o.offset - o.width * 0.05, -t * 0.12), at(s1, -t * 0.12))
      jambs('A-DOOR')
      break
    case 'window':
      out.poly('A-GLAZ', [at(s0, t / 2), at(s1, t / 2), at(s1, -t / 2), at(s0, -t / 2)])
      out.line('A-GLAZ', at(s0, t * 0.1), at(s1, t * 0.1))
      out.line('A-GLAZ', at(s0, -t * 0.1), at(s1, -t * 0.1))
      break
    case 'garage':
      out.line('A-DOOR', at(s0, -t * 0.3), at(s1, -t * 0.3))
      jambs('A-DOOR')
      break
    default:
      jambs('A-DOOR')
  }
}

function drawLevel(p: Project, level: Level, shift: Vec2, out: Writer) {
  const move = (q: Vec2) => add(q, shift)
  const joints = jointKeys(level)
  const byId = new Map(level.walls.map((w) => [w.id, w]))
  const moved = (w: Wall): Wall => ({ ...w, a: move(w.a), b: move(w.b) })

  for (const w of level.walls) {
    for (const [s0, s1] of wallSpans(w, level.openings)) out.poly('A-WALL', spanPolygon(w, s0, s1, joints).map(move))
  }
  for (const o of level.openings) {
    const w = byId.get(o.wallId)
    if (w) openingSymbols(o, moved(w), out)
  }
  for (const r of level.rooms) {
    out.poly('A-AREA', r.points.map(move))
    const c = move(labelPoint(r.points))
    out.text('A-ANNO-TEXT', add(c, { x: 0, y: -12 }), 22, r.name)
    out.text('A-ANNO-TEXT', add(c, { x: 0, y: 16 }), 15, formatArea(roomArea(r), p.units))
  }
  for (const i of level.items) {
    const c = catalogEntry(i.type)
    const centre = { x: i.x, y: i.y }
    if (isStairs(c.shape)) {
      const pts = stairOutline(c.shape, i.width, i.depth).map((q) => rotate(add(q, centre), i.rotation, centre))
      out.poly('A-FLOR-STRS', pts.map(move))
      out.text('A-ANNO-TEXT', move(centre), 15, 'UP', 0)
    } else if (c.category === 'Electrical' || c.category === 'Lighting') {
      out.circle('E-ELEC', move(centre), Math.max(8, Math.min(i.width, i.depth) / 2))
    } else {
      out.poly('A-FURN', rectCorners(centre, i.width, i.depth, i.rotation).map(move))
    }
  }
  for (const l of level.labels) out.text('A-ANNO-TEXT', move({ x: l.x, y: l.y }), Math.max(10, l.size), l.text)
  for (const dm of level.dims ?? []) {
    out.line('A-ANNO-DIMS', move(dm.a), move(dm.b))
    const n = normalOf(dm.a, dm.b)
    const mid = move(add(scale(add(dm.a, dm.b), 0.5), scale(n, -14)))
    const ang = (Math.atan2(-(dm.b.y - dm.a.y), dm.b.x - dm.a.x) * 180) / Math.PI
    const upright = ang > 90 || ang <= -90 ? ang + 180 : ang
    out.text('A-ANNO-DIMS', mid, 13, formatLength(dist(dm.a, dm.b), p.units), (upright + 360) % 360)
  }
}

export interface DxfOptions {
  /** Levels to draw (default: all with something on them). */
  levels?: Level[]
}

/** The whole drawing as DXF text. */
export function planDxf(p: Project, opts: DxfOptions = {}): string {
  const metric = p.units === 'metric'
  // Drawing units per centimetre: millimetres or inches.
  const k = metric ? 10 : 1 / 2.54
  const out = new Writer(k)
  const levels = (opts.levels ?? [...p.levels].sort((a, b) => a.elevation - b.elevation)).filter((l) => l.walls.length || l.rooms.length || l.items.length)
  const GAP = 400
  let cursor = 0
  let min = { x: Infinity, y: Infinity }
  let max = { x: -Infinity, y: -Infinity }
  const entities = new Writer(k)
  const placed: Array<{ level: Level; shift: Vec2 }> = []
  for (const level of levels) {
    const b = levelBounds(level)
    if (!b) continue
    const shift = { x: cursor - b.minX, y: 0 }
    placed.push({ level, shift })
    min = { x: Math.min(min.x, cursor), y: Math.min(min.y, b.minY) }
    max = { x: Math.max(max.x, cursor + b.maxX - b.minX), y: Math.max(max.y, b.maxY + 130) }
    cursor += b.maxX - b.minX + GAP
  }
  for (const { level, shift } of placed) {
    drawLevel(p, level, shift, entities)
    const b = levelBounds(level)!
    entities.text('A-ANNO-TEXT', { x: shift.x + (b.minX + b.maxX) / 2, y: b.maxY + 90 }, 36, level.name)
  }
  // The lot sits under the ground floor only.
  const lot = p.site.lot
  const ground = placed.find((x) => x.level.elevation === Math.min(...placed.map((q) => q.level.elevation)))
  if (lot && ground) {
    const s = ground.shift
    const r = (x: number, y: number, w: number, d: number) => [
      { x: x + s.x, y: y + s.y },
      { x: x + w + s.x, y: y + s.y },
      { x: x + w + s.x, y: y + d + s.y },
      { x: x + s.x, y: y + d + s.y },
    ]
    entities.poly('L-SITE', r(lot.x, lot.y, lot.w, lot.d))
    min = { x: Math.min(min.x, lot.x + s.x), y: Math.min(min.y, lot.y) }
    max = { x: Math.max(max.x, lot.x + lot.w + s.x), y: Math.max(max.y, lot.y + lot.d) }
  }
  if (!Number.isFinite(min.x)) {
    min = { x: 0, y: 0 }
    max = { x: 100, y: 100 }
  }

  out.pair(999, dxfText(`${p.name} - drawn with Threshold - units: ${metric ? 'millimetres' : 'inches'}`))
  out.pair(0, 'SECTION')
  out.pair(2, 'HEADER')
  out.pair(9, '$ACADVER')
  out.pair(1, 'AC1009')
  out.pair(9, '$INSUNITS')
  out.pair(70, metric ? 4 : 1)
  out.pair(9, '$MEASUREMENT')
  out.pair(70, metric ? 1 : 0)
  out.pair(9, '$EXTMIN')
  out.xy({ x: min.x, y: max.y })
  out.pair(9, '$EXTMAX')
  out.xy({ x: max.x, y: min.y })
  out.pair(0, 'ENDSEC')

  out.pair(0, 'SECTION')
  out.pair(2, 'TABLES')
  out.pair(0, 'TABLE')
  out.pair(2, 'LTYPE')
  out.pair(70, 1)
  out.pair(0, 'LTYPE')
  out.pair(2, 'CONTINUOUS')
  out.pair(70, 0)
  out.pair(3, 'Solid line')
  out.pair(72, 65)
  out.pair(73, 0)
  out.pair(40, 0)
  out.pair(0, 'ENDTAB')
  out.pair(0, 'TABLE')
  out.pair(2, 'LAYER')
  out.pair(70, DXF_LAYERS.length)
  for (const [name, color] of DXF_LAYERS) {
    out.pair(0, 'LAYER')
    out.pair(2, name)
    out.pair(70, 0)
    out.pair(62, color)
    out.pair(6, 'CONTINUOUS')
  }
  out.pair(0, 'ENDTAB')
  out.pair(0, 'ENDSEC')

  out.pair(0, 'SECTION')
  out.pair(2, 'BLOCKS')
  out.pair(0, 'ENDSEC')

  out.pair(0, 'SECTION')
  out.pair(2, 'ENTITIES')
  out.lines.push(...entities.lines)
  out.pair(0, 'ENDSEC')
  out.pair(0, 'EOF')
  return out.lines.join('\r\n') + '\r\n'
}
