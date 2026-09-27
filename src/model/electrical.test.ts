import { describe, expect, it } from 'vitest'
import { wireRoom } from './electrical'
import { buildTemplate } from './templates'
import { planFromBrief } from './brief'
import { checkLevel } from './checks'
import { pointInPolygon } from './geometry'
import { floorMaterial } from './materials'
import { catalogEntry } from './catalog'
import type { Level } from './types'

const wireAll = (l: Level): Level => {
  let level = l
  for (const r of l.rooms) level = { ...level, items: [...level.items, ...wireRoom(level, r)] }
  return level
}

describe('electrical layout', () => {
  it('lights every indoor room and adds alarms to bedrooms, without new design problems', () => {
    const p = planFromBrief({ bedrooms: 3, bathrooms: 2, storeys: 1, garage: 2, office: true, openPlan: true })
    const before = checkLevel(p.levels[0]).filter((i) => i.level === 'problem')
    const l = wireAll(p.levels[0])
    expect(checkLevel(l).filter((i) => i.level === 'problem')).toEqual(before)
    for (const r of l.rooms) {
      if (floorMaterial(r.floor).outdoor) continue
      const inside = l.items.filter((i) => pointInPolygon(i, r.points))
      expect(inside.some((i) => catalogEntry(i.type).mount === 'ceiling' && catalogEntry(i.type).category === 'Lighting'), r.name).toBe(true)
      if (/bed/i.test(r.name)) expect(inside.some((i) => i.type === 'smoke-alarm'), r.name).toBe(true)
      if (!/hall/i.test(r.name)) expect(inside.some((i) => i.type === 'outlet'), r.name).toBe(true)
    }
    expect(l.items.filter((i) => i.type === 'switch').length).toBeGreaterThanOrEqual(l.rooms.length - 1)
  })

  it('does not add a second set to a room that is already wired', () => {
    const p = buildTemplate('ranch')
    const once = wireAll(p.levels[0])
    const twice = wireAll(once)
    expect(twice.items.length).toBe(once.items.length)
  })

  it('keeps outlets out of doorways', () => {
    const p = buildTemplate('family')
    for (const lv of p.levels) {
      const l = wireAll(lv)
      for (const i of l.items.filter((x) => x.type === 'outlet')) {
        for (const o of l.openings.filter((x) => x.kind !== 'window')) {
          const w = l.walls.find((x) => x.id === o.wallId)!
          const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
          const c = { x: w.a.x + ((w.b.x - w.a.x) * o.offset) / L, y: w.a.y + ((w.b.y - w.a.y) * o.offset) / L }
          expect(Math.hypot(i.x - c.x, i.y - c.y)).toBeGreaterThan(o.width / 2)
        }
      }
    }
  })
})
