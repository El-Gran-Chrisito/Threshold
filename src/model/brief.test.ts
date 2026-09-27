import { describe, expect, it } from 'vitest'
import { planFromBrief, type Brief } from './brief'
import { checkLevel } from './checks'
import { roomWallSides } from './ops'

const briefs: Brief[] = []
for (const storeys of [1, 2] as const)
  for (const bedrooms of [1, 2, 3, 4, 5])
    for (const bathrooms of [1, 1.5, 2, 2.5, 3])
      for (const garage of [0, 2] as const) briefs.push({ bedrooms, bathrooms, storeys, garage, office: bedrooms % 2 === 0, openPlan: bathrooms !== 1.5 })

describe('plan from a brief', () => {
  it('passes the design check for every combination', () => {
    const failures: string[] = []
    for (const b of briefs) {
      const p = planFromBrief(b)
      for (const l of p.levels) {
        for (const i of checkLevel(l)) if (i.level === 'problem') failures.push(`${JSON.stringify(b)} ${l.name}: ${i.text}`)
      }
    }
    expect(failures.slice(0, 12)).toEqual([])
  })

  it('has the rooms asked for', () => {
    const p = planFromBrief({ bedrooms: 4, bathrooms: 2.5, storeys: 2, garage: 2, office: true, openPlan: true })
    const names = p.levels.flatMap((l) => l.rooms.map((r) => r.name))
    expect(names.filter((n) => /bedroom/i.test(n))).toHaveLength(4)
    expect(names).toContain('Primary bath')
    expect(names).toContain('Powder room')
    expect(names).toContain('Office')
    expect(names).toContain('Garage')
    expect(p.levels).toHaveLength(2)
    // Stairs on the ground floor sit under the landing above.
    const stairs = p.levels[0].items.find((i) => i.type === 'stairs')!
    const landing = p.levels[1].rooms.find((r) => r.name === 'Landing')!
    const xs = landing.points.map((q) => q.x)
    expect(stairs.x).toBeGreaterThan(Math.min(...xs))
    expect(stairs.x).toBeLessThan(Math.max(...xs))
  })

  it('gives every bedroom a window and furniture', () => {
    const p = planFromBrief({ bedrooms: 3, bathrooms: 2, storeys: 1, garage: 2, office: false, openPlan: true })
    const l = p.levels[0]
    for (const r of l.rooms.filter((x) => /bedroom/i.test(x.name))) {
      const walls = new Set(roomWallSides(l, r).map((s) => s.wall.id))
      expect(l.openings.some((o) => walls.has(o.wallId) && o.kind === 'window')).toBe(true)
    }
    expect(l.items.some((i) => i.type.startsWith('bed-'))).toBe(true)
    expect(l.items.some((i) => i.type === 'range' || i.type === 'fridge')).toBe(true)
  })
})
