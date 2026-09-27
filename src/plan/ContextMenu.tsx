/** Right-click (or long-press) menu with the common actions for the object under the pointer. */
import { useEffect, useRef } from 'react'
import type { Vec2 } from '../model/types'
import { activeLevel, selectedItemIds, useStore } from '../store/store'
import { clampOpening, deleteRoom, deleteWalls, splitWall, wallLength } from '../model/ops'
import { closestOnSegment } from '../model/geometry'
import { makeOpening, uid } from '../model/factory'
import { deleteItems, deleteSelection, duplicateItems } from '../ui/Inspector'

export interface MenuState {
  x: number
  y: number
  hit: string | null
  at: Vec2
}

interface Entry {
  label: string
  run: () => void
  danger?: boolean
}

function entriesFor(m: MenuState): Entry[] {
  const s = useStore.getState()
  const level = activeLevel(s)
  const [kind, id] = (m.hit ?? '').split(':')
  const applyLevel = s.applyLevel
  switch (kind) {
    case 'item': {
      const ids = selectedItemIds(s).includes(id) ? selectedItemIds(s) : [id]
      const items = level.items.filter((i) => ids.includes(i.id))
      const one = items[0]
      if (!one) return []
      const many = items.length > 1
      return [
        { label: many ? `Duplicate ${items.length} items` : 'Duplicate', run: () => duplicateItems(items) },
        { label: 'Rotate 90°', run: () => applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, rotation: (i.rotation + 90) % 360 } : i)) })) },
        { label: 'Mirror', run: () => applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, mirrored: !i.mirrored } : i)) })) },
        { label: one.locked ? 'Unlock' : 'Lock in place', run: () => applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, locked: !one.locked } : i)) })) },
        { label: 'Copy', run: () => useStore.setState({ clipboard: items }) },
        { label: many ? `Delete ${items.length} items` : 'Delete', danger: true, run: () => (many ? deleteItems(ids) : deleteSelection()) },
      ]
    }
    case 'wall': {
      const w = level.walls.find((x) => x.id === id)
      if (!w) return []
      const addAt = (k: 'door' | 'window') => {
        const { t } = closestOnSegment(m.at, w.a, w.b)
        const o = clampOpening(makeOpening(w.id, k, t * wallLength(w)), w)
        if (o.width > wallLength(w)) return s.notify('This wall is too short for that')
        applyLevel((l) => ({ ...l, openings: [...l.openings, o] }))
        s.select({ kind: 'opening', id: o.id })
      }
      return [
        { label: 'Add door here', run: () => addAt('door') },
        { label: 'Add window here', run: () => addAt('window') },
        { label: 'Split wall here', run: () => applyLevel((l) => splitWall(l, w.id, m.at)) },
        { label: 'Delete wall', danger: true, run: () => (applyLevel((l) => deleteWalls(l, [w.id])), s.select(null)) },
      ]
    }
    case 'opening': {
      const o = level.openings.find((x) => x.id === id)
      if (!o) return []
      const upd = (patch: Partial<typeof o>) => applyLevel((l) => ({ ...l, openings: l.openings.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) }))
      const door = o.kind === 'door' || o.kind === 'double-door'
      return [
        ...(door
          ? [
              { label: 'Flip hinge', run: () => upd({ hinge: o.hinge === 'start' ? 'end' : 'start' }) },
              { label: 'Swing the other way', run: () => upd({ swing: o.swing === 'A' ? 'B' : 'A' }) },
            ]
          : []),
        { label: 'Delete', danger: true, run: () => deleteSelection() },
      ]
    }
    case 'room': {
      const r = level.rooms.find((x) => x.id === id)
      if (!r) return []
      return [
        {
          label: 'Rename',
          run: () => {
            s.set({ panel: 'inspector' })
            setTimeout(() => (document.getElementById('room-name') as HTMLInputElement | null)?.select(), 60)
          },
        },
        {
          label: 'Duplicate room with furniture',
          run: () => {
            const b = r.points.reduce((acc, p) => Math.max(acc, p.x), -Infinity) - r.points.reduce((acc, p) => Math.min(acc, p.x), Infinity)
            const dx = b + 60
            const inside = level.items.filter((i) => r.points.length && pointIn(i, r.points))
            applyLevel((l) => {
              const room = { ...r, id: uid('r'), name: `${r.name} copy`, points: r.points.map((p) => ({ x: p.x + dx, y: p.y })) }
              const items = inside.map((i) => ({ ...i, id: uid('i'), x: i.x + dx }))
              return { ...l, rooms: [...l.rooms, room], items: [...l.items, ...items] }
            })
            s.notify('Copy placed to the right. It has no walls yet: use Find rooms or draw walls around it.')
          },
        },
        { label: 'Delete room', danger: true, run: () => (applyLevel((l) => deleteRoom(l, r.id, false)), s.select(null)) },
        { label: 'Delete room and its walls', danger: true, run: () => (applyLevel((l) => deleteRoom(l, r.id, true)), s.select(null)) },
      ]
    }
    default:
      return s.clipboard?.length
        ? [
            {
              label: `Paste ${s.clipboard.length > 1 ? `${s.clipboard.length} items` : 'item'} here`,
              run: () => {
                const clip = s.clipboard!
                const cx = clip.reduce((a, i) => a + i.x, 0) / clip.length
                const cy = clip.reduce((a, i) => a + i.y, 0) / clip.length
                const copies = clip.map((i) => ({ ...i, id: uid('i'), x: i.x - cx + m.at.x, y: i.y - cy + m.at.y, locked: false }))
                applyLevel((l) => ({ ...l, items: [...l.items, ...copies] }))
              },
            },
          ]
        : []
  }
}

function pointIn(p: Vec2, pts: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const entries = entriesFor(menu)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    ref.current?.querySelector('button')?.focus()
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  if (!entries.length) return null
  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      {entries.map((e) => (
        <button
          key={e.label}
          type="button"
          role="menuitem"
          className={e.danger ? 'is-danger' : ''}
          onClick={() => {
            e.run()
            onClose()
          }}
        >
          {e.label}
        </button>
      ))}
    </div>
  )
}
