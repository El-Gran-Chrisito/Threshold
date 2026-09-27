import { describe, expect, it } from 'vitest'
import { applyHomeStyle, HOME_STYLES, roomKind } from './styles'
import { buildTemplate } from './templates'
import { floorMaterial } from './materials'
import { roomWallSides } from './ops'
import { catalogEntry } from './catalog'
import { checkLevel } from './checks'

describe('whole-home styles', () => {
  it('classifies rooms by name', () => {
    expect(roomKind('Primary bedroom')).toBe('bedroom')
    expect(roomKind('Powder room')).toBe('bath')
    expect(roomKind('Kitchen & dining')).toBe('kitchen')
    expect(roomKind('Mudroom')).toBe('utility')
    expect(roomKind('Garage')).toBe('garage')
    expect(roomKind('Den')).toBe('living')
  })

  it('restyles finishes without moving anything', () => {
    const p = buildTemplate('family')
    for (const s of HOME_STYLES) {
      const q = applyHomeStyle(p, s.id)
      for (let k = 0; k < p.levels.length; k++) {
        const a = p.levels[k]
        const b = q.levels[k]
        expect(b.walls.map((w) => [w.a, w.b])).toEqual(a.walls.map((w) => [w.a, w.b]))
        expect(b.items.map((i) => [i.x, i.y, i.rotation])).toEqual(a.items.map((i) => [i.x, i.y, i.rotation]))
        expect(checkLevel(b)).toEqual(checkLevel(a))
        for (const r of b.rooms) {
          if (floorMaterial(r.floor).outdoor) continue
          expect(r.floor).toBe(s.floors[roomKind(r.name)])
          for (const side of roomWallSides(b, r)) {
            const color = side.side === 'A' ? side.wall.colorA : side.wall.colorB
            // Shared walls take the colour of whichever room was styled last; it is always one of the style's colours.
            expect(Object.values(s.walls)).toContain(color)
          }
        }
        for (const i of b.items) if (catalogEntry(i.type).shape === 'island') expect(i.color).toBe(s.island)
        if (b.roof.style !== 'none') expect(b.roof.color).toBe(s.roof.color)
      }
      expect(q.defaults.trimColor).toBe(s.trim)
    }
  })
})
