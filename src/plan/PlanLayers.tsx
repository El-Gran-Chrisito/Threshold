import { memo, type ReactNode } from 'react'
import type { Dimension, Item, Label, Level, Opening, Room, Selection, UnitSystem, Vec2, Wall } from '../model/types'
import { add, angleDeg, bounds, dist, labelPoint, lerp, norm, normalOf, rectCorners, scale, sub } from '../model/geometry'
import { exteriorSides, roomArea } from '../model/ops'
import { formatArea, formatLength } from '../model/units'
import { floorMaterial } from '../model/materials'
import { catalogEntry } from '../model/catalog'
import { ItemSymbol } from './symbols'
import { jointKeys, polyPath, spanPolygon, wallSpans } from './wallGeometry'

// ---------------------------------------------------------------------------
// Rooms

export const RoomsLayer = memo(function RoomsLayer({ level, px, selection }: { level: Level; px: number; selection: Selection | null }) {
  return (
    <g>
      {level.rooms.map((r) => (
        <path
          key={r.id}
          d={polyPath(r.points)}
          data-hit={`room:${r.id}`}
          className={`room-fill${selection?.kind === 'room' && selection.id === r.id ? ' is-selected' : ''}`}
          style={{ fill: r.floorColor ?? floorMaterial(r.floor).base }}
          strokeWidth={px * 2}
        />
      ))}
    </g>
  )
})

/** Room names and areas, drawn above furniture so they stay readable. */
export const RoomLabelsLayer = memo(function RoomLabelsLayer({ level, px, units, showDims }: { level: Level; px: number; units: UnitSystem; showDims: boolean }) {
  return (
    <g pointerEvents="none">
      {level.rooms.map((r) => (
        <RoomLabel key={r.id} room={r} px={px} units={units} showDims={showDims} />
      ))}
    </g>
  )
})

const RoomLabel = memo(function RoomLabel({ room, px, units, showDims }: { room: Room; px: number; units: UnitSystem; showDims: boolean }) {
  const p = labelPoint(room.points)
  const b = bounds(room.points)
  const minSidePx = Math.min(b.maxX - b.minX, b.maxY - b.minY) / px
  const widthPx = (b.maxX - b.minX) / px
  if (minSidePx < 26) return null
  const fs = Math.min(12.5, Math.max(9, widthPx / Math.max(6, room.name.length) / 0.62)) * px
  const compact = minSidePx < 64
  let dims: string | null = null
  if (room.points.length === 4 && showDims && !compact) {
    const w = dist(room.points[0], room.points[1])
    const h = dist(room.points[1], room.points[2])
    dims = `${formatLength(w, units, { compact: true })} × ${formatLength(h, units, { compact: true })}`
  }
  return (
    <g className="room-label" transform={`translate(${p.x} ${p.y})`} pointerEvents="none">
      <text y={dims ? -fs * 0.9 : compact ? fs * 0.35 : -fs * 0.3} fontSize={fs} className="room-name" textAnchor="middle" strokeWidth={px * 3}>
        {room.name}
      </text>
      {!compact && (
        <text y={dims ? fs * 0.35 : fs * 0.95} fontSize={fs * 0.85} className="room-area" textAnchor="middle" strokeWidth={px * 3}>
          {formatArea(roomArea(room), units)}
        </text>
      )}
      {dims && (
        <text y={fs * 1.45} fontSize={fs * 0.8} className="room-area" textAnchor="middle" strokeWidth={px * 3}>
          {dims}
        </text>
      )}
    </g>
  )
})

// ---------------------------------------------------------------------------
// Walls and openings

export const WallsLayer = memo(function WallsLayer({ level, px, selection, ghost }: { level: Level; px: number; selection: Selection | null; ghost?: boolean }) {
  const joints = jointKeys(level)
  return (
    <g className={ghost ? 'walls ghost' : 'walls'}>
      {level.walls.map((w) => {
        const spans = wallSpans(w, level.openings)
        const selected = selection?.kind === 'wall' && selection.id === w.id
        return (
          <g key={w.id} data-hit={ghost ? undefined : `wall:${w.id}`} className={selected ? 'wall is-selected' : 'wall'}>
            {spans.map(([s0, s1], i) => (
              <path key={i} d={polyPath(spanPolygon(w, s0, s1, joints))} strokeWidth={px} />
            ))}
            {/* Wide invisible hit target so thin walls are easy to grab. */}
            {!ghost && <path d={`M ${w.a.x} ${w.a.y} L ${w.b.x} ${w.b.y}`} className="hit-line" strokeWidth={Math.max(w.thickness, 14 * px)} />}
          </g>
        )
      })}
    </g>
  )
})

export const OpeningsLayer = memo(function OpeningsLayer({ level, px, selection }: { level: Level; px: number; selection: Selection | null }) {
  const byId = new Map(level.walls.map((w) => [w.id, w]))
  return (
    <g>
      {level.openings.map((o) => {
        const w = byId.get(o.wallId)
        if (!w) return null
        return <OpeningSymbol key={o.id} o={o} w={w} px={px} selected={selection?.kind === 'opening' && selection.id === o.id} />
      })}
    </g>
  )
})

export const OpeningSymbol = memo(function OpeningSymbol({ o, w, px, selected, preview }: { o: Opening; w: Wall; px: number; selected?: boolean; preview?: boolean }): ReactNode {
  const d = norm(sub(w.b, w.a))
  const n = normalOf(w.a, w.b)
  const t = w.thickness
  const s0 = o.offset - o.width / 2
  const s1 = o.offset + o.width / 2
  const at = (s: number, side = 0) => add(add(w.a, scale(d, s)), scale(n, side))
  const cls = `opening${selected ? ' is-selected' : ''}${preview ? ' is-preview' : ''}`
  const sw = px * 1.2
  const jamb = (s: number) => {
    const p = at(s, t / 2)
    const q = at(s, -t / 2)
    return <path d={`M ${p.x} ${p.y} L ${q.x} ${q.y}`} className="op-line" strokeWidth={sw * 1.4} />
  }
  const body: ReactNode[] = []
  // Gap fill covers the room floor under the opening so the cut reads clearly.
  const gap = [at(s0, t / 2), at(s1, t / 2), at(s1, -t / 2), at(s0, -t / 2)]
  body.push(<path key="gap" d={polyPath(gap)} className="op-gap" />)

  const leaf = (hingeS: number, closedS: number, width: number, sideSign: number, key: string) => {
    const hinge = at(hingeS, (sideSign * t) / 2)
    const closed = at(closedS, (sideSign * t) / 2)
    const open = add(hinge, scale(n, sideSign * width))
    const c = (open.x - hinge.x) * (closed.y - hinge.y) - (open.y - hinge.y) * (closed.x - hinge.x)
    const sweep = c > 0 ? 1 : 0
    return (
      <g key={key}>
        <path d={`M ${hinge.x} ${hinge.y} L ${open.x} ${open.y}`} className="op-leaf" strokeWidth={sw * 2} />
        <path d={`M ${open.x} ${open.y} A ${width} ${width} 0 0 ${sweep} ${closed.x} ${closed.y}`} className="op-arc" strokeWidth={sw} />
      </g>
    )
  }
  const sideSign = o.swing === 'A' ? 1 : -1
  switch (o.kind) {
    case 'door':
      if (o.style === 'barn') {
        const lw = o.width + 10
        const xs = o.hinge === 'start' ? s0 - lw + 12 : s1 - 12
        const off = sideSign * (t / 2 + 4)
        const p1 = at(xs, off)
        const p2 = at(xs + lw, off)
        const r1 = at(Math.min(xs, s0) - 5, off + sideSign * 3)
        const r2 = at(Math.max(xs + lw, s1) + 5, off + sideSign * 3)
        body.push(
          <path key="rail" d={`M ${r1.x} ${r1.y} L ${r2.x} ${r2.y}`} className="op-arc" strokeWidth={sw} />,
          <path key="leaf" d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} className="op-leaf" strokeWidth={sw * 3} />,
        )
        body.push(<g key="j">{jamb(s0)}{jamb(s1)}</g>)
        break
      }
      body.push(o.hinge === 'start' ? leaf(s0, s1, o.width, sideSign, 'l') : leaf(s1, s0, o.width, sideSign, 'l'))
      body.push(<g key="j">{jamb(s0)}{jamb(s1)}</g>)
      break
    case 'double-door':
      body.push(leaf(s0, o.offset, o.width / 2, sideSign, 'l1'), leaf(s1, o.offset, o.width / 2, sideSign, 'l2'))
      body.push(<g key="j">{jamb(s0)}{jamb(s1)}</g>)
      break
    case 'slider': {
      const m = o.offset
      const a1 = at(s0, t * 0.12)
      const b1 = at(m + o.width * 0.05, t * 0.12)
      const a2 = at(m - o.width * 0.05, -t * 0.12)
      const b2 = at(s1, -t * 0.12)
      body.push(
        <path key="p1" d={`M ${a1.x} ${a1.y} L ${b1.x} ${b1.y}`} className="op-leaf" strokeWidth={sw * 2.2} />,
        <path key="p2" d={`M ${a2.x} ${a2.y} L ${b2.x} ${b2.y}`} className="op-leaf" strokeWidth={sw * 2.2} />,
        <g key="j">{jamb(s0)}{jamb(s1)}</g>,
      )
      break
    }
    case 'window': {
      const frame = [at(s0, t / 2), at(s1, t / 2), at(s1, -t / 2), at(s0, -t / 2)]
      const g1a = at(s0, t * 0.1)
      const g1b = at(s1, t * 0.1)
      const g2a = at(s0, -t * 0.1)
      const g2b = at(s1, -t * 0.1)
      body.push(
        <path key="f" d={polyPath(frame)} className="op-window" strokeWidth={sw} />,
        <path key="g" d={`M ${g1a.x} ${g1a.y} L ${g1b.x} ${g1b.y} M ${g2a.x} ${g2a.y} L ${g2b.x} ${g2b.y}`} className="op-line" strokeWidth={sw} />,
      )
      break
    }
    case 'garage': {
      const a = at(s0, -t * 0.3)
      const b = at(s1, -t * 0.3)
      body.push(<path key="g" d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} className="op-line" strokeWidth={sw * 2} strokeDasharray={`${px * 8} ${px * 5}`} />, <g key="j">{jamb(s0)}{jamb(s1)}</g>)
      break
    }
    default:
      body.push(<g key="j">{jamb(s0)}{jamb(s1)}</g>)
  }
  // Hit target spanning the gap.
  const hitA = at(s0)
  const hitB = at(s1)
  return (
    <g className={cls} data-hit={preview ? undefined : `opening:${o.id}`}>
      {body}
      <path d={`M ${hitA.x} ${hitA.y} L ${hitB.x} ${hitB.y}`} className="hit-line" strokeWidth={Math.max(t + 10, 16 * px)} />
    </g>
  )
})

// ---------------------------------------------------------------------------
// Items

export const ItemsLayer = memo(function ItemsLayer({ items, px, selection, filter }: { items: Item[]; px: number; selection: Selection | null; filter: (i: Item) => boolean }) {
  return (
    <g>
      {items.filter(filter).map((i) => (
        <ItemGlyph key={i.id} item={i} px={px} selected={selection?.kind === 'item' && selection.id === i.id} />
      ))}
    </g>
  )
})

export const ItemGlyph = memo(function ItemGlyph({ item, px, selected, ghost }: { item: Item; px: number; selected?: boolean; ghost?: boolean }) {
  const c = catalogEntry(item.type)
  return (
    <g
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})${item.mirrored ? ' scale(-1 1)' : ''}`}
      data-hit={ghost ? undefined : `item:${item.id}`}
      className={`item${selected ? ' is-selected' : ''}${ghost ? ' is-ghost' : ''}${c.mount === 'ceiling' ? ' is-ceiling' : ''}`}
    >
      <ItemSymbol w={item.width} d={item.depth} color={item.color} color2={item.color2} shape={c.shape} px={px} />
      {selected && <rect x={-item.width / 2 - 3 * px} y={-item.depth / 2 - 3 * px} width={item.width + 6 * px} height={item.depth + 6 * px} className="sel-box" strokeWidth={px * 1.5} />}
    </g>
  )
})

// ---------------------------------------------------------------------------
// Labels

export const LabelsLayer = memo(function LabelsLayer({ labels, px, selection }: { labels: Label[]; px: number; selection: Selection | null }) {
  return (
    <g>
      {labels.map((l) => (
        <text
          key={l.id}
          x={l.x}
          y={l.y}
          fontSize={l.size * px * 1.1}
          textAnchor="middle"
          dominantBaseline="middle"
          className={`free-label${selection?.kind === 'label' && selection.id === l.id ? ' is-selected' : ''}`}
          data-hit={`label:${l.id}`}
          strokeWidth={px * 3}
        >
          {l.text}
        </text>
      ))}
    </g>
  )
})

// ---------------------------------------------------------------------------
// Dimensions

export const KeptDims = memo(function KeptDims({ dims, px, units, selection }: { dims: Dimension[]; px: number; units: UnitSystem; selection: Selection | null }) {
  return (
    <g>
      {dims.map((d) => (
        <g key={d.id} data-hit={`ann:${d.id}`} className={selection?.kind === 'dim' && selection.id === d.id ? 'kept-dim is-selected' : 'kept-dim'}>
          <DimLine a={d.a} b={d.b} px={px} units={units} />
          <path d={`M ${d.a.x} ${d.a.y} L ${d.b.x} ${d.b.y}`} className="hit-line" strokeWidth={14 * px} />
        </g>
      ))}
    </g>
  )
})

export const WallDims = memo(function WallDims({ level, px, units, interactive = false }: { level: Level; px: number; units: UnitSystem; interactive?: boolean }) {
  const ext = new Map(exteriorSides(level).map((s) => [s.wall.id, s.side]))
  return (
    <g pointerEvents={interactive ? undefined : 'none'}>
      {level.walls.map((w) => {
        const L = dist(w.a, w.b)
        if (L < 40 * px) return null
        const side = ext.get(w.id) ?? 'A'
        const n = normalOf(w.a, w.b)
        const sign = side === 'A' ? 1 : -1
        const off = w.thickness / 2 + 9 * px
        const m = add(lerp(w.a, w.b, 0.5), scale(n, sign * off))
        let ang = angleDeg(w.a, w.b)
        if (ang > 90) ang -= 180
        if (ang <= -90) ang += 180
        return (
          <text key={w.id} x={m.x} y={m.y} fontSize={10.5 * px} className={`dim-text${interactive ? ' is-editable' : ''}`} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${m.x} ${m.y})`} strokeWidth={px * 3} data-hit={interactive ? `dim:${w.id}` : undefined}>
            {formatLength(L, units)}
          </text>
        )
      })}
    </g>
  )
})

/** Dimension line with end ticks and a centred label. */
export function DimLine({ a, b, px, units, offset = 0, label }: { a: Vec2; b: Vec2; px: number; units: UnitSystem; offset?: number; label?: string }) {
  const n = normalOf(a, b)
  const A = add(a, scale(n, offset))
  const B = add(b, scale(n, offset))
  const m = lerp(A, B, 0.5)
  const tick = 5 * px
  const d = norm(sub(B, A))
  const t1 = add(scale(n, tick), scale(d, tick))
  let ang = angleDeg(a, b)
  if (ang > 90) ang -= 180
  if (ang <= -90) ang += 180
  const text = label ?? formatLength(dist(a, b), units)
  return (
    <g className="dimline" pointerEvents="none">
      <path d={`M ${A.x} ${A.y} L ${B.x} ${B.y}`} strokeWidth={px} />
      <path d={`M ${A.x - t1.x} ${A.y - t1.y} L ${A.x + t1.x} ${A.y + t1.y} M ${B.x - t1.x} ${B.y - t1.y} L ${B.x + t1.x} ${B.y + t1.y}`} strokeWidth={px * 1.4} />
      {offset !== 0 && <path d={`M ${a.x} ${a.y} L ${A.x} ${A.y} M ${b.x} ${b.y} L ${B.x} ${B.y}`} strokeWidth={px * 0.7} opacity={0.6} />}
      <text x={m.x} y={m.y} fontSize={11 * px} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${m.x} ${m.y})`} strokeWidth={px * 3.5} className="dimline-text">
        {text}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Selection handles

export function SelectionHandles({ level, selection, px, units }: { level: Level; selection: Selection | null; px: number; units: UnitSystem }) {
  if (!selection) return null
  const R = 6 * px
  if (selection.kind === 'wall') {
    const w = level.walls.find((x) => x.id === selection.id)
    if (!w) return null
    return (
      <g>
        <DimLine a={w.a} b={w.b} px={px} units={units} offset={w.thickness / 2 + 26 * px} />
        <g className="handle" data-hit={`h:wall-a:${w.id}`}>
          <circle cx={w.a.x} cy={w.a.y} r={R} strokeWidth={px * 1.5} />
        </g>
        <g className="handle" data-hit={`h:wall-b:${w.id}`}>
          <circle cx={w.b.x} cy={w.b.y} r={R} strokeWidth={px * 1.5} />
        </g>
        <g className="handle is-move" data-hit={`wall:${w.id}`} transform={`translate(${(w.a.x + w.b.x) / 2} ${(w.a.y + w.b.y) / 2})`}>
          <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={R * 0.3} strokeWidth={px * 1.5} />
        </g>
      </g>
    )
  }
  if (selection.kind === 'room') {
    const r = level.rooms.find((x) => x.id === selection.id)
    if (!r) return null
    return (
      <g>
        {r.points.map((p, i) => {
          const q = r.points[(i + 1) % r.points.length]
          const m = lerp(p, q, 0.5)
          const ang = angleDeg(p, q)
          return (
            <g key={`e${i}`} className="handle is-edge" data-hit={`h:room-e:${r.id}:${i}`} transform={`translate(${m.x} ${m.y}) rotate(${ang})`}>
              <rect x={-R * 1.6} y={-R * 0.7} width={R * 3.2} height={R * 1.4} rx={R * 0.7} strokeWidth={px * 1.5} />
            </g>
          )
        })}
        {r.points.map((p, i) => (
          <g key={`v${i}`} className="handle" data-hit={`h:room-v:${r.id}:${i}`}>
            <circle cx={p.x} cy={p.y} r={R} strokeWidth={px * 1.5} />
          </g>
        ))}
      </g>
    )
  }
  if (selection.kind === 'item') {
    const it = level.items.find((x) => x.id === selection.id)
    if (!it) return null
    const corners = rectCorners(it, it.width, it.depth, it.rotation)
    const rotArm = add(it, rotateVec({ x: 0, y: -(it.depth / 2 + 26 * px) }, it.rotation))
    const top = add(it, rotateVec({ x: 0, y: -it.depth / 2 }, it.rotation))
    const edge = (lx: number, ly: number) => add(it, rotateVec({ x: lx, y: ly }, it.rotation))
    const eR = edge(it.width / 2, 0)
    const eL = edge(-it.width / 2, 0)
    const eF = edge(0, it.depth / 2)
    const eB = edge(0, -it.depth / 2)
    return (
      <g>
        <DimLine a={corners[3]} b={corners[2]} px={px} units={units} offset={-(16 * px)} />
        <DimLine a={corners[1]} b={corners[2]} px={px} units={units} offset={16 * px} />
        <path d={`M ${top.x} ${top.y} L ${rotArm.x} ${rotArm.y}`} className="handle-arm" strokeWidth={px * 1.2} />
        <g className="handle is-rotate" data-hit={`h:item-rot:${it.id}`}>
          <circle cx={rotArm.x} cy={rotArm.y} r={R * 1.1} strokeWidth={px * 1.5} />
          <path d={`M ${rotArm.x - R * 0.5} ${rotArm.y + R * 0.1} a ${R * 0.5} ${R * 0.5} 0 1 1 ${R * 0.5} ${R * 0.5}`} strokeWidth={px * 1.3} fill="none" />
        </g>
        {[
          ['w', '1', eR],
          ['w', '-1', eL],
          ['d', '1', eF],
          ['d', '-1', eB],
        ].map(([axis, sign, p]) => (
          <g key={`${axis}${sign}`} className="handle is-edge" data-hit={`h:item-${axis}:${it.id}:${sign}`} transform={`translate(${(p as Vec2).x} ${(p as Vec2).y}) rotate(${it.rotation + (axis === 'w' ? 90 : 0)})`}>
            <rect x={-R * 1.3} y={-R * 0.6} width={R * 2.6} height={R * 1.2} rx={R * 0.6} strokeWidth={px * 1.5} />
          </g>
        ))}
      </g>
    )
  }
  if (selection.kind === 'opening') {
    const o = level.openings.find((x) => x.id === selection.id)
    const w = o && level.walls.find((x) => x.id === o.wallId)
    if (!o || !w) return null
    const d = norm(sub(w.b, w.a))
    const a = add(w.a, scale(d, o.offset - o.width / 2))
    const b = add(w.a, scale(d, o.offset + o.width / 2))
    const toA = o.offset - o.width / 2
    const toB = dist(w.a, w.b) - (o.offset + o.width / 2)
    return (
      <g>
        <DimLine a={a} b={b} px={px} units={units} offset={-(w.thickness / 2 + 22 * px)} />
        {toA > 1 && <DimLine a={w.a} b={a} px={px} units={units} offset={w.thickness / 2 + 22 * px} />}
        {toB > 1 && <DimLine a={b} b={w.b} px={px} units={units} offset={w.thickness / 2 + 22 * px} />}
        <g className="handle is-edge" data-hit={`h:op-w:${o.id}:-1`} transform={`translate(${a.x} ${a.y}) rotate(${angleDeg(w.a, w.b) + 90})`}>
          <rect x={-R * 1.3} y={-R * 0.6} width={R * 2.6} height={R * 1.2} rx={R * 0.6} strokeWidth={px * 1.5} />
        </g>
        <g className="handle is-edge" data-hit={`h:op-w:${o.id}:1`} transform={`translate(${b.x} ${b.y}) rotate(${angleDeg(w.a, w.b) + 90})`}>
          <rect x={-R * 1.3} y={-R * 0.6} width={R * 2.6} height={R * 1.2} rx={R * 0.6} strokeWidth={px * 1.5} />
        </g>
      </g>
    )
  }
  return null
}

export function rotateVec(p: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180
  return { x: p.x * Math.cos(r) - p.y * Math.sin(r), y: p.x * Math.sin(r) + p.y * Math.cos(r) }
}
