/**
 * The selection's action row (see SelectionActions), floating just above what
 * is selected on the plan, clear of its handles, dimension lines and door
 * swing.
 */
import { useStore } from '../store/store'
import { add, bounds, norm, normalOf, rectCorners, scale, sub } from '../model/geometry'
import { roomLabelLayout, rotateVec } from './PlanLayers'
import { SelectionActions, actionCount, useSelectionTarget } from '../ui/SelectionActions'
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
  const units = useStore((s) => s.project.units)
  const showDims = useStore((s) => s.showDims)
  const target = useSelectionTarget()
  if (!target) return null
  const { level, items, opening, wall, room } = target

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
  const buttons = actionCount(target)
  const half = (buttons * btn + (buttons > 1 ? 7 : 0) + 10) / 2 + 8
  const x = Math.max(half, Math.min(width - half, cx))
  if (y < 0 || y > height) return null

  return (
    <div className={`selection-bar${above ? '' : ' is-below'}`} style={{ left: x, top: y }} role="toolbar" aria-label="Actions for the selection" onPointerDown={(e) => e.stopPropagation()}>
      <SelectionActions target={target} onRename={onRename} />
    </div>
  )
}
