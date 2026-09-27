import type { Item, Level, Opening, OpeningKind, Room, Wall } from '../model/types'
import { activeLevel, useStore } from '../store/store'
import { ConfirmButton, Field, FinishChips, LengthInput, NumberInput, Swatches, Toggle } from './controls'
import { FINISHES, FLOORS, PAINTS, floorMaterial } from '../model/materials'
import { CATALOG, catalogEntry } from '../model/catalog'
import { add, bounds, lerp, norm, normalOf, pointInPolygon, polygonPerimeter, scale, sub } from '../model/geometry'
import {
  autoRooms,
  clampOpening,
  deleteRoom,
  deleteWalls,
  edgeOnSide,
  exteriorSides,
  moveRoomEdge,
  moveVertex,
  paintExterior,
  paintRoomWalls,
  roomArea,
  roomWallSides,
  splitWall,
  updateWall,
  wallLength,
} from '../model/ops'
import { makeOpening, OPENING_PRESETS, uid } from '../model/factory'
import { formatArea, formatLength, formatMoney } from '../model/units'
import { Icon } from './Icon'

const applyLevel = (fn: (l: Level) => Level) => useStore.getState().applyLevel(fn)

export function Inspector() {
  const project = useStore((s) => s.project)
  const levelId = useStore((s) => s.levelId)
  const selection = useStore((s) => s.selection)
  const level = activeLevel({ project, levelId })
  const units = project.units
  const multi = useStore((s) => s.multi)

  if (multi.length > 1) return <MultiInspector ids={multi} />
  if (!selection) return <LevelSummary level={level} />
  switch (selection.kind) {
    case 'wall': {
      const w = level.walls.find((x) => x.id === selection.id)
      return w ? <WallInspector w={w} level={level} units={units} /> : <LevelSummary level={level} />
    }
    case 'room': {
      const r = level.rooms.find((x) => x.id === selection.id)
      return r ? <RoomInspector r={r} level={level} units={units} /> : <LevelSummary level={level} />
    }
    case 'opening': {
      const o = level.openings.find((x) => x.id === selection.id)
      const w = o && level.walls.find((x) => x.id === o.wallId)
      return o && w ? <OpeningInspector o={o} w={w} units={units} /> : <LevelSummary level={level} />
    }
    case 'item': {
      const i = level.items.find((x) => x.id === selection.id)
      return i ? <ItemInspector item={i} units={units} /> : <LevelSummary level={level} />
    }
    case 'label': {
      const l = level.labels.find((x) => x.id === selection.id)
      if (!l) return <LevelSummary level={level} />
      return (
        <section className="inspector">
          <InspectorHead kind="Text label" title={l.text} />
          <Field label="Text">
            <input id="label-text" autoFocus value={l.text} onChange={(e) => applyLevel((lv) => ({ ...lv, labels: lv.labels.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)) }))} />
          </Field>
          <Field label="Size">
            <NumberInput id="label-size" value={l.size} min={8} max={60} onChange={(v) => applyLevel((lv) => ({ ...lv, labels: lv.labels.map((x) => (x.id === l.id ? { ...x, size: v } : x)) }))} suffix="px" />
          </Field>
          <div className="btn-row">
            <button type="button" className="btn btn-danger" onClick={() => deleteSelection()}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </div>
        </section>
      )
    }
  }
}

function InspectorHead({ kind, title }: { kind: string; title: string }) {
  return (
    <header className="insp-head">
      <span className="eyebrow">{kind}</span>
      <h2>{title}</h2>
    </header>
  )
}

export function deleteSelection() {
  const s = useStore.getState()
  const sel = s.selection
  if (!sel) return
  s.applyLevel((l) => {
    switch (sel.kind) {
      case 'wall':
        return deleteWalls(l, [sel.id])
      case 'room':
        return deleteRoom(l, sel.id, false)
      case 'opening':
        return { ...l, openings: l.openings.filter((o) => o.id !== sel.id) }
      case 'item':
        return { ...l, items: l.items.filter((o) => o.id !== sel.id) }
      case 'label':
        return { ...l, labels: l.labels.filter((o) => o.id !== sel.id) }
    }
  })
  s.select(null)
  s.notify('Deleted')
}

// ---------------------------------------------------------------------------

function sideName(level: Level, w: Wall, side: 'A' | 'B'): string {
  const n = normalOf(w.a, w.b)
  const m = lerp(w.a, w.b, 0.5)
  const probe = add(m, scale(n, (side === 'A' ? 1 : -1) * (w.thickness / 2 + 6)))
  const room = level.rooms.find((r) => pointInPolygon(probe, r.points))
  return room ? room.name : 'Outside'
}

function WallInspector({ w, level, units }: { w: Wall; level: Level; units: 'imperial' | 'metric' }) {
  const L = wallLength(w)
  const setLength = (newL: number) => {
    const dir = norm(sub(w.b, w.a))
    applyLevel((l) => moveVertex(l, w.b, add(w.a, scale(dir, newL))))
  }
  const addOpening = (kind: OpeningKind) => {
    const o = clampOpening(makeOpening(w.id, kind, L / 2), w)
    if (o.width > L) return useStore.getState().notify('This wall is too short for that')
    applyLevel((l) => ({ ...l, openings: [...l.openings, o] }))
    useStore.getState().select({ kind: 'opening', id: o.id })
  }
  return (
    <section className="inspector">
      <InspectorHead kind="Wall" title={`${formatLength(L, units)} wall`} />
      <div className="grid-2">
        <Field label="Length">
          <LengthInput id="wall-length" value={L} units={units} onChange={setLength} min={5} />
        </Field>
        <Field label="Height">
          <LengthInput id="wall-height" value={w.height} units={units} onChange={(v) => applyLevel((l) => updateWall(l, w.id, { height: v }))} min={10} />
        </Field>
        <Field label="Thickness">
          <LengthInput id="wall-thick" value={w.thickness} units={units} bare={units === 'imperial' ? 'in' : 'cm'} onChange={(v) => applyLevel((l) => updateWall(l, w.id, { thickness: v }))} min={2} />
        </Field>
      </div>
      <Field label={`Side facing ${sideName(level, w, 'A')}`}>
        <FinishChips label="Side A finish" value={w.finishA} onChange={(f, c) => applyLevel((l) => updateWall(l, w.id, { finishA: f, colorA: f === 'paint' ? w.colorA : c }))} />
        <Swatches label="Side A colour" swatches={PAINTS} value={w.colorA} onChange={(c) => applyLevel((l) => updateWall(l, w.id, { colorA: c }))} />
      </Field>
      <Field label={`Side facing ${sideName(level, w, 'B')}`}>
        <FinishChips label="Side B finish" value={w.finishB} onChange={(f, c) => applyLevel((l) => updateWall(l, w.id, { finishB: f, colorB: f === 'paint' ? w.colorB : c }))} />
        <Swatches label="Side B colour" swatches={PAINTS} value={w.colorB} onChange={(c) => applyLevel((l) => updateWall(l, w.id, { colorB: c }))} />
      </Field>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => addOpening('door')}>
          <Icon name="door" size={16} /> Add door
        </button>
        <button type="button" className="btn" onClick={() => addOpening('window')}>
          <Icon name="window" size={16} /> Add window
        </button>
        <button type="button" className="btn" onClick={() => applyLevel((l) => splitWall(l, w.id, lerp(w.a, w.b, 0.5)))}>
          Split in half
        </button>
        <button type="button" className="btn btn-danger" onClick={deleteSelection}>
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
      <p className="tip">Drag the wall to move it. Drag its end dots to reshape. Joined walls and rooms follow.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

function isAxisRect(r: Room) {
  if (r.points.length !== 4) return false
  const [a, b, c, d] = r.points
  return Math.abs(a.y - b.y) < 0.5 && Math.abs(b.x - c.x) < 0.5 && Math.abs(c.y - d.y) < 0.5 && Math.abs(d.x - a.x) < 0.5
}

function RoomInspector({ r, level, units }: { r: Room; level: Level; units: 'imperial' | 'metric' }) {
  const upd = (patch: Partial<Room>) => applyLevel((l) => ({ ...l, rooms: l.rooms.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }))
  const rect = isAxisRect(r)
  const rb = bounds(r.points)
  const width = rect ? rb.maxX - rb.minX : 0
  const depth = rect ? rb.maxY - rb.minY : 0
  const sides = roomWallSides(level, r)
  const wallColor = sides.length ? (sides[0].side === 'A' ? sides[0].wall.colorA : sides[0].wall.colorB) : '#F4F2EC'
  const wallFinish = sides.length ? (sides[0].side === 'A' ? sides[0].wall.finishA : sides[0].wall.finishB) : 'paint'
  const fm = floorMaterial(r.floor)
  return (
    <section className="inspector">
      <InspectorHead kind="Room" title={r.name} />
      <Field label="Name">
        <input id="room-name" value={r.name} onChange={(e) => upd({ name: e.target.value })} />
      </Field>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-v">{formatArea(roomArea(r), units)}</span>
          <span className="stat-k">Floor area</span>
        </div>
        <div className="stat">
          <span className="stat-v">{formatLength(polygonPerimeter(r.points), units)}</span>
          <span className="stat-k">Perimeter</span>
        </div>
      </div>
      {rect && (
        <div className="grid-2">
          <Field label="Width (east edge moves)">
            <LengthInput id="room-w" value={width} units={units} min={30} onChange={(v) => applyLevel((l) => moveRoomEdge(l, r.id, edgeOnSide(r, 'E'), v - width))} />
          </Field>
          <Field label="Depth (south edge moves)">
            <LengthInput id="room-d" value={depth} units={units} min={30} onChange={(v) => applyLevel((l) => moveRoomEdge(l, r.id, edgeOnSide(r, 'S'), v - depth))} />
          </Field>
        </div>
      )}
      <Field label={`Floor · ${fm.name}`}>
        <div className="floor-grid" role="radiogroup" aria-label="Floor finish">
          {FLOORS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={r.floor === f.id} className="floor-chip" onClick={() => upd({ floor: f.id, floorColor: undefined })} title={f.name}>
              <span className={`floor-swatch pat-${f.pattern}`} style={{ background: f.base, color: f.accent }} />
              <span className="floor-name">{f.name}</span>
            </button>
          ))}
        </div>
      </Field>
      {fm.pattern === 'solid' || fm.pattern === 'carpet' || fm.pattern === 'concrete' ? (
        <Field label="Floor colour">
          <Swatches label="Floor colour" swatches={PAINTS} value={r.floorColor ?? fm.base} onChange={(c) => upd({ floorColor: c })} />
        </Field>
      ) : null}
      <Field label="All walls in this room">
        <FinishChips label="Room wall finish" value={wallFinish} onChange={(f, c) => applyLevel((l) => paintRoomWalls(l, r.id, f === 'paint' ? wallColor : c, f))} />
        <Swatches label="Room wall colour" swatches={PAINTS} value={wallColor} onChange={(c) => applyLevel((l) => paintRoomWalls(l, r.id, c, wallFinish ?? 'paint'))} />
      </Field>
      <Field label="Ceiling colour">
        <Swatches label="Ceiling colour" swatches={PAINTS.slice(0, 10)} value={r.ceilingColor} onChange={(c) => upd({ ceilingColor: c })} />
      </Field>
      <div className="btn-row">
        <ConfirmButton className="btn btn-danger" onConfirm={() => deleteSelection()} confirmText="Confirm: delete room">
          <Icon name="trash" size={16} /> Delete room
        </ConfirmButton>
        <ConfirmButton
          className="btn btn-danger"
          confirmText="Confirm: delete room + walls"
          onConfirm={() => {
            applyLevel((l) => deleteRoom(l, r.id, true))
            useStore.getState().select(null)
          }}
        >
          Delete with its walls
        </ConfirmButton>
      </div>
      <p className="tip">Click a selected room again and drag to move it with its furniture. Drag edge pills to resize. Drag corner dots to reshape.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

const OPENING_KINDS: Array<{ value: OpeningKind; label: string }> = [
  { value: 'door', label: 'Door' },
  { value: 'double-door', label: 'Double' },
  { value: 'slider', label: 'Sliding' },
  { value: 'opening', label: 'Archway' },
  { value: 'window', label: 'Window' },
  { value: 'garage', label: 'Garage' },
]

function OpeningInspector({ o, w, units }: { o: Opening; w: Wall; units: 'imperial' | 'metric' }) {
  const upd = (patch: Partial<Opening>) => applyLevel((l) => ({ ...l, openings: l.openings.map((x) => (x.id === o.id ? clampOpening({ ...x, ...patch }, w) : x)) }))
  const isDoor = o.kind === 'door' || o.kind === 'double-door'
  const name = OPENING_PRESETS[o.kind].label
  return (
    <section className="inspector">
      <InspectorHead kind="Opening" title={`${name}, ${formatLength(o.width, units)}`} />
      <Field label="Type">
        <div className="chip-wrap">
          {OPENING_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className={`chip${o.kind === k.value ? ' is-on' : ''}`}
              onClick={() => {
                const p = OPENING_PRESETS[k.value]
                upd({ kind: k.value, width: p.width, height: p.height, sill: p.sill })
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Width">
          <LengthInput id="op-width" value={o.width} units={units} bare={units === 'imperial' ? 'in' : 'cm'} min={20} onChange={(v) => upd({ width: v })} />
        </Field>
        <Field label="Height">
          <LengthInput id="op-height" value={o.height} units={units} bare={units === 'imperial' ? 'in' : 'cm'} min={20} onChange={(v) => upd({ height: v })} />
        </Field>
        {o.kind === 'window' && (
          <Field label="Sill height">
            <LengthInput id="op-sill" value={o.sill} units={units} bare={units === 'imperial' ? 'in' : 'cm'} onChange={(v) => upd({ sill: v })} />
          </Field>
        )}
        <Field label="From wall start">
          <LengthInput id="op-offset" value={o.offset - o.width / 2} units={units} bare={units === 'imperial' ? 'in' : 'cm'} onChange={(v) => upd({ offset: v + o.width / 2 })} />
        </Field>
      </div>
      {isDoor && (
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => upd({ hinge: o.hinge === 'start' ? 'end' : 'start' })}>
            <Icon name="mirror" size={16} /> Flip hinge
          </button>
          <button type="button" className="btn" onClick={() => upd({ swing: o.swing === 'A' ? 'B' : 'A' })}>
            <Icon name="rotate" size={16} /> Swing other way
          </button>
        </div>
      )}
      {(isDoor || o.kind === 'window') && (
        <Field label={isDoor ? 'Door style' : 'Window style'}>
          <div className="chip-wrap">
            {(isDoor
              ? [
                  ['panel', 'Panel'],
                  ['flush', 'Flush'],
                  ['glass', 'Glass'],
                  ...(o.kind === 'door' ? [['barn', 'Sliding barn']] : []),
                ]
              : [
                  ['casement', 'Casement'],
                  ['picture', 'Picture'],
                  ['grid', 'Grid'],
                  ['awning', 'Awning'],
                ]
            ).map(([v, label]) => (
              <button key={v} type="button" className={`chip${(o.style ?? (isDoor ? 'panel' : 'casement')) === v ? ' is-on' : ''}`} onClick={() => upd({ style: v as Opening['style'] })}>
                {label}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Frame colour">
        <Swatches label="Frame colour" swatches={[...PAINTS.slice(0, 8), ...FINISHES.slice(0, 6)]} value={o.frameColor} onChange={(c) => upd({ frameColor: c })} />
      </Field>
      {isDoor && (
        <Field label="Door colour">
          <Swatches label="Door colour" swatches={[...FINISHES.slice(0, 6), ...PAINTS.slice(6, 18)]} value={o.leafColor ?? o.frameColor} onChange={(c) => upd({ leafColor: c })} />
        </Field>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-danger" onClick={deleteSelection}>
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
      <p className="tip">Drag it along the wall, or onto another wall. Drag the end pills to resize.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function duplicateItem(item: Item) {
  duplicateItems([item])
}

export function duplicateItems(items: Item[]) {
  const s = useStore.getState()
  const copies: Item[] = items.map((item) => ({ ...item, id: uid('i'), x: item.x + 30, y: item.y + 30, locked: false }))
  s.applyLevel((l) => ({ ...l, items: [...l.items, ...copies] }))
  if (copies.length === 1) s.select({ kind: 'item', id: copies[0].id })
  else useStore.setState({ selection: { kind: 'item', id: copies[0].id }, multi: copies.map((c) => c.id) })
}

export function deleteItems(ids: string[]) {
  const s = useStore.getState()
  s.applyLevel((l) => ({ ...l, items: l.items.filter((i) => !ids.includes(i.id)) }))
  s.select(null)
  s.notify(`Deleted ${ids.length} items`)
}

type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hspace' | 'vspace'

function alignItems(ids: string[], how: Align) {
  useStore.getState().applyLevel((l) => {
    const sel = l.items.filter((i) => ids.includes(i.id))
    if (sel.length < 2) return l
    const minX = Math.min(...sel.map((i) => i.x))
    const maxX = Math.max(...sel.map((i) => i.x))
    const minY = Math.min(...sel.map((i) => i.y))
    const maxY = Math.max(...sel.map((i) => i.y))
    const pos = new Map<string, { x: number; y: number }>()
    if (how === 'hspace' || how === 'vspace') {
      const key = how === 'hspace' ? 'x' : 'y'
      const sorted = [...sel].sort((a, b) => a[key] - b[key])
      const lo = sorted[0][key]
      const step = (sorted[sorted.length - 1][key] - lo) / (sorted.length - 1)
      sorted.forEach((i, k) => pos.set(i.id, key === 'x' ? { x: lo + k * step, y: i.y } : { x: i.x, y: lo + k * step }))
    } else {
      for (const i of sel) {
        const x = how === 'left' ? minX : how === 'right' ? maxX : how === 'hcenter' ? (minX + maxX) / 2 : i.x
        const y = how === 'top' ? minY : how === 'bottom' ? maxY : how === 'vcenter' ? (minY + maxY) / 2 : i.y
        pos.set(i.id, { x, y })
      }
    }
    return { ...l, items: l.items.map((i) => (pos.has(i.id) && !i.locked ? { ...i, ...pos.get(i.id)! } : i)) }
  })
}

function MultiInspector({ ids }: { ids: string[] }) {
  const level = useStore((s) => activeLevel(s))
  const items = level.items.filter((i) => ids.includes(i.id))
  const prices = useStore((s) => s.project.prices)
  const total = items.reduce((sum, i) => sum + (prices[i.type] ?? catalogEntry(i.type).price), 0)
  const recolor = (patch: Partial<Item>) => applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)) }))
  const btn = (how: Align, label: string) => (
    <button type="button" className="btn" onClick={() => alignItems(ids, how)}>
      {label}
    </button>
  )
  return (
    <section className="inspector">
      <InspectorHead kind="Several items" title={`${items.length} items selected`} />
      <p className="muted">{items.map((i) => i.name || catalogEntry(i.type).name).join(', ')}</p>
      <Field label="Line up">
        <div className="btn-row">
          {btn('left', 'Left edges')}
          {btn('hcenter', 'Centres ↔')}
          {btn('right', 'Right edges')}
          {btn('top', 'Tops')}
          {btn('vcenter', 'Centres ↕')}
          {btn('bottom', 'Bottoms')}
        </div>
      </Field>
      <Field label="Space evenly">
        <div className="btn-row">
          {btn('hspace', 'Left to right')}
          {btn('vspace', 'Top to bottom')}
        </div>
      </Field>
      <Field label="Main colour for all">
        <Swatches label="Main colour for all" swatches={[...FINISHES, ...PAINTS.slice(8)]} value={items[0]?.color ?? '#ffffff'} onChange={(c) => recolor({ color: c })} />
      </Field>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => duplicateItems(items)}>
          <Icon name="copy" size={16} /> Duplicate all
        </button>
        <button type="button" className="btn btn-danger" onClick={() => deleteItems(ids)}>
          <Icon name="trash" size={16} /> Delete all
        </button>
      </div>
      <p className="tip">Drag any selected item to move them together. Q / E rotate each one. Combined estimate: {formatMoney(total)}.</p>
    </section>
  )
}

function ItemInspector({ item, units }: { item: Item; units: 'imperial' | 'metric' }) {
  const c = catalogEntry(item.type)
  const prices = useStore((s) => s.project.prices)
  const upd = (patch: Partial<Item>) => applyLevel((l) => ({ ...l, items: l.items.map((x) => (x.id === item.id ? { ...x, ...patch } : x)) }))
  const bare = units === 'imperial' ? 'in' : 'cm'
  const alternatives = CATALOG.filter((x) => x.category === c.category && x.id !== c.id)
  const price = prices[item.type] ?? c.price
  return (
    <section className="inspector">
      <InspectorHead kind={c.category} title={item.name || c.name} />
      <Field label="Label">
        <input id="item-name" value={item.name ?? ''} placeholder={c.name} onChange={(e) => upd({ name: e.target.value || undefined })} />
      </Field>
      <div className="grid-3">
        <Field label="Width">
          <LengthInput id="item-w" value={item.width} units={units} bare={bare} min={1} onChange={(v) => upd({ width: v })} />
        </Field>
        <Field label="Depth">
          <LengthInput id="item-d" value={item.depth} units={units} bare={bare} min={1} onChange={(v) => upd({ depth: v })} />
        </Field>
        <Field label="Height">
          <LengthInput id="item-h" value={item.height} units={units} bare={bare} min={1} onChange={(v) => upd({ height: v })} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Raised above floor">
          <LengthInput id="item-elev" value={item.elevation} units={units} bare={bare} onChange={(v) => upd({ elevation: v })} />
        </Field>
        <Field label="Rotation">
          <div className="rot-row">
            <button type="button" className="icon-btn" aria-label="Rotate left 90°" onClick={() => upd({ rotation: (item.rotation + 270) % 360 })}>
              ⟲
            </button>
            <NumberInput id="item-rot" value={item.rotation} step={15} onChange={(v) => upd({ rotation: ((v % 360) + 360) % 360 })} suffix="°" />
            <button type="button" className="icon-btn" aria-label="Rotate right 90°" onClick={() => upd({ rotation: (item.rotation + 90) % 360 })}>
              ⟳
            </button>
          </div>
        </Field>
      </div>
      <Field label="Main colour">
        <Swatches label="Main colour" swatches={[...FINISHES, ...PAINTS.slice(8)]} value={item.color} onChange={(v) => upd({ color: v })} />
      </Field>
      <Field label="Accent colour">
        <Swatches label="Accent colour" swatches={FINISHES} value={item.color2} onChange={(v) => upd({ color2: v })} />
      </Field>
      <div className="toggle-row">
        <Toggle id="item-mirror" checked={!!item.mirrored} onChange={(v) => upd({ mirrored: v })} label="Mirror" />
        <Toggle id="item-lock" checked={!!item.locked} onChange={(v) => upd({ locked: v })} label="Lock in place" />
      </div>
      {alternatives.length > 0 && (
        <Field label="Swap for">
          <select
            id="item-swap"
            value=""
            onChange={(e) => {
              const n = catalogEntry(e.target.value)
              upd({ type: n.id, width: n.w, depth: n.d, height: n.h, color: n.color, color2: n.color2, elevation: n.elevation ?? item.elevation })
            }}
          >
            <option value="" disabled>
              Choose another {c.category.toLowerCase()} item…
            </option>
            {alternatives.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Estimated price">
        <NumberInput
          id="item-price"
          value={price}
          min={0}
          step={50}
          suffix="USD"
          onChange={(v) => useStore.getState().apply((p) => ({ ...p, prices: { ...p.prices, [item.type]: v } }))}
        />
      </Field>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => duplicateItem(item)}>
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <button type="button" className="btn btn-danger" onClick={deleteSelection}>
          <Icon name="trash" size={16} /> Delete
        </button>
      </div>
      <p className="tip">Drag to move · it backs onto walls automatically (hold Alt to stop that) · drag the round handle to rotate · drag edge pills to resize. {formatMoney(price)} each.</p>
    </section>
  )
}

// ---------------------------------------------------------------------------

function exteriorFinish(level: Level) {
  const s = exteriorSides(level)[0]
  return s ? (s.side === 'A' ? s.wall.finishA : s.wall.finishB) ?? 'paint' : 'paint'
}

function exteriorColor(level: Level) {
  const s = exteriorSides(level)[0]
  return s ? (s.side === 'A' ? s.wall.colorA : s.wall.colorB) : undefined
}

function LevelSummary({ level }: { level: Level }) {
  const project = useStore((s) => s.project)
  const units = project.units
  const area = level.rooms.reduce((s, r) => s + roomArea(r), 0)
  const total = project.levels.reduce((s, l) => s + l.rooms.reduce((a, r) => a + roomArea(r), 0), 0)
  return (
    <section className="inspector">
      <InspectorHead kind="Nothing selected" title={level.name} />
      <div className="stat-row">
        <div className="stat">
          <span className="stat-v">{formatArea(area, units)}</span>
          <span className="stat-k">This floor</span>
        </div>
        <div className="stat">
          <span className="stat-v">{formatArea(total, units)}</span>
          <span className="stat-k">Whole home</span>
        </div>
        <div className="stat">
          <span className="stat-v">{level.rooms.length}</span>
          <span className="stat-k">Rooms</span>
        </div>
      </div>
      {level.rooms.length > 0 && (
        <Field label="Rooms on this floor">
          <ul className="room-list">
            {[...level.rooms]
              .sort((a, b) => roomArea(b) - roomArea(a))
              .map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => useStore.getState().select({ kind: 'room', id: r.id })}>
                    <span className="room-dot" style={{ background: floorMaterial(r.floor).base }} />
                    <span>{r.name}</span>
                    <span className="muted">{formatArea(roomArea(r), units)}</span>
                  </button>
                </li>
              ))}
          </ul>
        </Field>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            let n = 0
            applyLevel((l) => {
              const r = autoRooms(l)
              n = r.count
              return r.level
            })
            useStore.getState().notify(n ? `Found ${n} new room${n > 1 ? 's' : ''}` : 'No new enclosed areas found')
          }}
        >
          <Icon name="magic" size={16} /> Find rooms from walls
        </button>
      </div>
      <Field label="Outside of the house (this floor)">
        <FinishChips label="Exterior finish" value={exteriorFinish(level)} onChange={(f, c) => useStore.getState().applyLevel((l) => paintExterior(l, c, undefined, f))} />
        <Swatches label="Exterior colour" swatches={PAINTS} value={exteriorColor(level) ?? project.defaults.exteriorColor} onChange={(c) => useStore.getState().applyLevel((l) => paintExterior(l, c, undefined, exteriorFinish(l)))} />
      </Field>
      <p className="tip">Select anything in the plan or 3D view to edit it here.</p>
    </section>
  )
}

export { lerp }
