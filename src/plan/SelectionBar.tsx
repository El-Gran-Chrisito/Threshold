/**
 * A small bar of the most used actions, floating just above what is
 * selected on the plan: rotate, mirror, duplicate and delete for furniture;
 * flip, swing and delete for a door or window; add a door or window and
 * delete for a wall; furnish, rename and delete for a room. The same actions
 * are in the side panel and the right-click menu; this puts them where the
 * eye is.
 */
import { activeLevel, selectedItemIds, useStore } from '../store/store'
import { add, bounds, norm, normalOf, rectCorners, scale, sub } from '../model/geometry'
import { roomLabelLayout, rotateVec } from './PlanLayers'
import { deleteWalls, freeOffset } from '../model/ops'
import { makeOpening } from '../model/factory'
import { deleteItems, deleteSelection, duplicateItems, furnish } from '../ui/Inspector'
import { Icon } from '../ui/Icon'
import type { Vec2 } from '../model/types'

interface Props {
  /** Plan point to screen point, relative to the plan's box. */
  toScreen: (p: Vec2) => Vec2
  /** Screen pixels per plan centimetre. */
  scale: number
  width: number
  height: number
  /** Open the room's name for typing, on the plan. */
  onRename: (roomId: string) => void
}

export function SelectionBar({ toScreen, scale: k, width, height, onRename }: Props) {
  const selection = useStore((s) => s.selection)
  const level = useStore(activeLevel)
  const multi = useStore((s) => s.multi)
  const units = useStore((s) => s.project.units)
  const showDims = useStore((s) => s.showDims)
  const s = useStore.getState()
  const ids = selectedItemIds(s)
  const items = level.items.filter((i) => ids.includes(i.id))
  const opening = selection?.kind === 'opening' ? level.openings.find((o) => o.id === selection.id) : null
  const wall = selection?.kind === 'wall' ? level.walls.find((w) => w.id === selection.id) : null
  const room = selection?.kind === 'room' ? level.rooms.find((r) => r.id === selection.id) : null
  if (!items.length && !opening && !wall && !room) return null

  // Everything the selection draws on screen (outline, handles, dimension
  // lines, a door's swing), so the bar never covers a handle.
  const px = 1 / k
  let pts: Vec2[] = []
  if (items.length) {
    pts = items.flatMap((i) => {
      const hd = i.depth / 2
      const pad = 30 * px
      const box = rectCorners(i, i.width + pad * 2, i.depth + pad * 2, i.rotation)
      if (items.length > 1) return box
      // The rotate handle sits past the back edge.
      return [...box, add(i, rotateVec({ x: 0, y: -(hd + 36 * px) }, i.rotation))]
    })
  } else if (room) {
    // Just above the room's name, where the eye already is.
    const L = roomLabelLayout(room, px, units, showDims)
    if (L) {
      const last = L.dims ?? L.area ?? L.name
      pts = [
        { x: L.p.x, y: L.p.y + L.name.y - L.name.size - 8 * px },
        { x: L.p.x, y: L.p.y + last.y + 8 * px },
      ]
    } else {
      const b = bounds(room.points)
      pts = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.maxY },
      ]
    }
  } else if (wall) {
    const d = norm(sub(wall.b, wall.a))
    const n = normalOf(wall.a, wall.b)
    const ext = wall.thickness / 2 + 34 * px
    for (const e of [add(wall.a, scale(d, -12 * px)), add(wall.b, scale(d, 12 * px))]) pts.push(add(e, scale(n, ext)), add(e, scale(n, -ext)))
  } else if (opening) {
    const w = level.walls.find((x) => x.id === opening.wallId)
    if (!w) return null
    const d = norm(sub(w.b, w.a))
    const n = normalOf(w.a, w.b)
    const a = add(w.a, scale(d, opening.offset - opening.width / 2 - 12 * px))
    const b = add(w.a, scale(d, opening.offset + opening.width / 2 + 12 * px))
    const dims = w.thickness / 2 + 34 * px
    const door = opening.kind === 'door' || opening.kind === 'double-door'
    const leaf = opening.kind === 'double-door' ? opening.width / 2 : opening.width
    const swingSide = opening.swing === 'A' ? 1 : -1
    for (const sgn of [1, -1]) {
      const ext = door && sgn === swingSide ? Math.max(dims, leaf) : dims
      pts.push(add(a, scale(n, sgn * ext)), add(b, scale(n, sgn * ext)))
    }
  }
  const sp = pts.map(toScreen)
  const top = Math.min(...sp.map((p) => p.y))
  const bottom = Math.max(...sp.map((p) => p.y))
  const cx = (Math.min(...sp.map((p) => p.x)) + Math.max(...sp.map((p) => p.x))) / 2
  // Above the selection, or below it when there is no room at the top.
  const above = top > 56
  const y = above ? top - 4 : Math.min(height - 12, bottom + 4)
  // Keep the whole bar on screen: a button is 36 px (46 on touch screens),
  // a separator 7 px.
  const btn = window.matchMedia?.('(pointer: coarse)').matches ? 46 : 36
  const isDoor = opening?.kind === 'door' || opening?.kind === 'double-door'
  const buttons = items.length ? 4 : wall || room || isDoor ? 3 : 1
  const half = (buttons * btn + (buttons > 1 ? 7 : 0) + 10) / 2 + 8
  const x = Math.max(half, Math.min(width - half, cx))
  if (y < 0 || y > height) return null

  const applyItems = (fn: (i: (typeof items)[number]) => Partial<(typeof items)[number]>) =>
    s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, ...fn(i) } : i)) }))
  const many = items.length > 1 || multi.length > 1
  const addOpening = (kind: 'door' | 'window') => {
    if (!wall) return
    const o = makeOpening(wall.id, kind, 0)
    const at = freeOffset(level, wall, o.width)
    if (at === null) return s.notify(`No free space on this wall for a ${kind}`)
    s.applyLevel((l) => ({ ...l, openings: [...l.openings, { ...o, offset: at }] }))
    s.select({ kind: 'opening', id: o.id })
  }

  return (
    <div className={`selection-bar${above ? '' : ' is-below'}`} style={{ left: x, top: y }} role="toolbar" aria-label="Actions for the selection" onPointerDown={(e) => e.stopPropagation()}>
      {items.length > 0 ? (
        <>
          <button type="button" onClick={() => applyItems((i) => ({ rotation: (i.rotation + 90) % 360 }))} data-tip="Rotate 90°" data-tip-key="Q E" aria-label="Rotate 90°">
            <Icon name="rotate" size={17} />
          </button>
          <button type="button" onClick={() => applyItems((i) => ({ mirrored: !i.mirrored }))} data-tip="Mirror" aria-label="Mirror">
            <Icon name="mirror" size={17} />
          </button>
          <button type="button" onClick={() => duplicateItems(items)} data-tip={many ? `Duplicate ${items.length} items` : 'Duplicate'} aria-label="Duplicate">
            <Icon name="copy" size={17} />
          </button>
          <span className="selection-bar-sep" aria-hidden />
          <button type="button" className="is-danger" onClick={() => (many ? deleteItems(ids) : deleteSelection())} data-tip={many ? `Delete ${items.length} items` : 'Delete'} data-tip-key="Del" aria-label="Delete">
            <Icon name="trash" size={17} />
          </button>
        </>
      ) : room ? (
        <>
          <button type="button" onClick={() => furnish([room])} data-tip="Furnish this room" aria-label="Furnish this room">
            <Icon name="item" size={17} />
          </button>
          <button type="button" onClick={() => onRename(room.id)} data-tip="Rename" aria-label="Rename">
            <Icon name="label" size={17} />
          </button>
          <span className="selection-bar-sep" aria-hidden />
          <button type="button" className="is-danger" onClick={() => deleteSelection()} data-tip="Delete room (keeps its walls)" data-tip-key="Del" aria-label="Delete room">
            <Icon name="trash" size={17} />
          </button>
        </>
      ) : wall ? (
        <>
          <button type="button" onClick={() => addOpening('door')} data-tip="Add a door" aria-label="Add a door">
            <Icon name="door" size={17} />
          </button>
          <button type="button" onClick={() => addOpening('window')} data-tip="Add a window" aria-label="Add a window">
            <Icon name="window" size={17} />
          </button>
          <span className="selection-bar-sep" aria-hidden />
          <button type="button" className="is-danger" onClick={() => (s.applyLevel((l) => deleteWalls(l, [wall.id])), s.select(null))} data-tip="Delete wall" data-tip-key="Del" aria-label="Delete wall">
            <Icon name="trash" size={17} />
          </button>
        </>
      ) : opening ? (
        <>
          {isDoor ? (
            <>
              <button type="button" onClick={() => s.applyLevel((l) => ({ ...l, openings: l.openings.map((o) => (o.id === opening.id ? { ...o, hinge: o.hinge === 'start' ? 'end' : 'start' } : o)) }))} data-tip="Flip the hinge side" aria-label="Flip hinge">
                <Icon name="mirror" size={17} />
              </button>
              <button type="button" onClick={() => s.applyLevel((l) => ({ ...l, openings: l.openings.map((o) => (o.id === opening.id ? { ...o, swing: o.swing === 'A' ? 'B' : 'A' } : o)) }))} data-tip="Open the other way" aria-label="Swing the other way">
                <Icon name="rotate" size={17} />
              </button>
              <span className="selection-bar-sep" aria-hidden />
            </>
          ) : null}
          <button type="button" className="is-danger" onClick={() => deleteSelection()} data-tip="Delete" data-tip-key="Del" aria-label="Delete">
            <Icon name="trash" size={17} />
          </button>
        </>
      ) : null}
    </div>
  )
}
