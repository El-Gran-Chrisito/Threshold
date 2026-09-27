import { describe, expect, it } from 'vitest'
import { cabinetsAlongWall, checkLevel } from './checks'
import { buildTemplate } from './templates'
import { addRoom, rectPoints } from './ops'
import { makeItem, makeLevel, makeOpening } from './factory'

describe('design checks', () => {
  it('reports the example homes as clean', () => {
    for (const id of ['family', 'studio', 'ranch']) {
      const p = buildTemplate(id)
      for (const l of p.levels) {
        const problems = checkLevel(l).filter((i) => i.level === 'problem')
        expect(problems.map((x) => `${l.name}: ${x.text}`)).toEqual([])
      }
    }
  })
  it('finds a doorless room, a windowless bedroom, overlaps and a blocked door', () => {
    let l = makeLevel('L', 0)
    const bed = addRoom(l, rectPoints({ x: 0, y: 0 }, { x: 400, y: 400 }), { name: 'Bedroom' })
    l = bed.level
    const wall = l.walls[0]
    l = { ...l, openings: [makeOpening(wall.id, 'door', 100, { swing: 'A' })] }
    l = { ...l, items: [makeItem('bed-queen', { x: 200, y: 200 }), makeItem('dresser', { x: 200, y: 220 }), makeItem('armchair', { x: 100, y: 50 })] }
    l = addRoom(l, rectPoints({ x: 400, y: 0 }, { x: 700, y: 300 }), { name: 'Store' }).level
    const texts = checkLevel(l).map((i) => i.text)
    expect(texts).toContain('Bedroom has no window (bedrooms need one to escape a fire)')
    expect(texts.some((t) => t.includes('overlaps'))).toBe(true)
    expect(texts.some((t) => t.includes('in the way of a door'))).toBe(true)
    expect(texts).toContain('Store has no door or opening')
  })
  it('lines a wall with cabinets and leaves the door clear', () => {
    let l = makeLevel('L', 0)
    l = addRoom(l, rectPoints({ x: 0, y: 0 }, { x: 500, y: 300 }), { name: 'Kitchen' }).level
    const top = l.walls.find((w) => w.a.y === 0 && w.b.y === 0)!
    l = { ...l, openings: [makeOpening(top.id, 'door', 100)] }
    const cabs = cabinetsAlongWall(l, top.id, 'A', true, makeItem)
    const bases = cabs.filter((c) => c.type === 'base-60')
    expect(bases.length).toBeGreaterThan(3)
    // None of them sits in front of the door (door spans 59.5–140.5 cm along the wall).
    expect(bases.every((c) => c.x - c.width / 2 >= 140 || c.x + c.width / 2 <= 60)).toBe(true)
    expect(bases.every((c) => c.rotation === 0)).toBe(true)
  })
})
