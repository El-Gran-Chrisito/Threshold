/**
 * The most used actions for what is selected, as a row of icon buttons:
 * rotate, mirror, duplicate and delete for furniture; flip, swing and delete
 * for a door or window; add a door or window and delete for a wall; furnish,
 * rename and delete for a room. The plan and the 3D view float this row just
 * above the selection, so the actions are where the eye is.
 */
import { activeLevel, selectedItemIds, useStore } from '../store/store'
import { deleteWalls, freeOffset } from '../model/ops'
import { makeOpening } from '../model/factory'
import { deleteItems, deleteSelection, duplicateItems, furnish } from './Inspector'
import { Icon } from './Icon'
import type { Item, Level, Opening, Room, Wall } from '../model/types'

export interface SelectionTarget {
  level: Level
  ids: string[]
  items: Item[]
  opening?: Opening
  wall?: Wall
  room?: Room
}

/** What the action row acts on, or null when nothing it knows is selected. */
export function useSelectionTarget(): SelectionTarget | null {
  const selection = useStore((s) => s.selection)
  const level = useStore(activeLevel)
  useStore((s) => s.multi)
  const ids = selectedItemIds(useStore.getState())
  const items = level.items.filter((i) => ids.includes(i.id))
  if (items.length) return { level, ids, items }
  if (selection?.kind === 'opening') {
    const opening = level.openings.find((o) => o.id === selection.id)
    return opening ? { level, ids, items, opening } : null
  }
  if (selection?.kind === 'wall') {
    const wall = level.walls.find((w) => w.id === selection.id)
    return wall ? { level, ids, items, wall } : null
  }
  if (selection?.kind === 'room') {
    const room = level.rooms.find((r) => r.id === selection.id)
    return room ? { level, ids, items, room } : null
  }
  return null
}

const isDoor = (o?: Opening) => o?.kind === 'door' || o?.kind === 'double-door'

/** How many buttons the row shows, for fitting it on screen. */
export function actionCount(t: SelectionTarget): number {
  return t.items.length ? 4 : t.wall || t.room || isDoor(t.opening) ? 3 : 1
}

export function SelectionActions({ target, onRename }: { target: SelectionTarget; onRename: (roomId: string) => void }) {
  const s = useStore.getState()
  const { level, ids, items, opening, wall, room } = target
  const many = items.length > 1
  const applyItems = (fn: (i: Item) => Partial<Item>) => s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, ...fn(i) } : i)) }))
  const applyOpening = (fn: (o: Opening) => Partial<Opening>) => s.applyLevel((l) => ({ ...l, openings: l.openings.map((o) => (o.id === opening?.id ? { ...o, ...fn(o) } : o)) }))
  const addOpening = (kind: 'door' | 'window') => {
    if (!wall) return
    const o = makeOpening(wall.id, kind, 0)
    const at = freeOffset(level, wall, o.width)
    if (at === null) return s.notify(`No free space on this wall for a ${kind}`)
    s.applyLevel((l) => ({ ...l, openings: [...l.openings, { ...o, offset: at }] }))
    s.select({ kind: 'opening', id: o.id })
  }
  const sep = <span className="selection-bar-sep" aria-hidden />

  if (items.length)
    return (
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
        {sep}
        <button type="button" className="is-danger" onClick={() => (many ? deleteItems(ids) : deleteSelection())} data-tip={many ? `Delete ${items.length} items` : 'Delete'} data-tip-key="Del" aria-label="Delete">
          <Icon name="trash" size={17} />
        </button>
      </>
    )
  if (room)
    return (
      <>
        <button type="button" onClick={() => furnish([room])} data-tip="Furnish this room" aria-label="Furnish this room">
          <Icon name="item" size={17} />
        </button>
        <button type="button" onClick={() => onRename(room.id)} data-tip="Rename" aria-label="Rename">
          <Icon name="label" size={17} />
        </button>
        {sep}
        <button type="button" className="is-danger" onClick={() => deleteSelection()} data-tip="Delete room (keeps its walls)" data-tip-key="Del" aria-label="Delete room">
          <Icon name="trash" size={17} />
        </button>
      </>
    )
  if (wall)
    return (
      <>
        <button type="button" onClick={() => addOpening('door')} data-tip="Add a door" aria-label="Add a door">
          <Icon name="door" size={17} />
        </button>
        <button type="button" onClick={() => addOpening('window')} data-tip="Add a window" aria-label="Add a window">
          <Icon name="window" size={17} />
        </button>
        {sep}
        <button type="button" className="is-danger" onClick={() => (s.applyLevel((l) => deleteWalls(l, [wall.id])), s.select(null))} data-tip="Delete wall" data-tip-key="Del" aria-label="Delete wall">
          <Icon name="trash" size={17} />
        </button>
      </>
    )
  return (
    <>
      {isDoor(opening) && (
        <>
          <button type="button" onClick={() => applyOpening((o) => ({ hinge: o.hinge === 'start' ? 'end' : 'start' }))} data-tip="Flip the hinge side" aria-label="Flip hinge">
            <Icon name="mirror" size={17} />
          </button>
          <button type="button" onClick={() => applyOpening((o) => ({ swing: o.swing === 'A' ? 'B' : 'A' }))} data-tip="Open the other way" aria-label="Swing the other way">
            <Icon name="rotate" size={17} />
          </button>
          {sep}
        </>
      )}
      <button type="button" className="is-danger" onClick={() => deleteSelection()} data-tip="Delete" data-tip-key="Del" aria-label="Delete">
        <Icon name="trash" size={17} />
      </button>
    </>
  )
}
