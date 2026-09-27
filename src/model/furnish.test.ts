import { describe, expect, it } from 'vitest'
import { furnishRoom } from './furnish'
import { checkLevel } from './checks'
import { buildTemplate } from './templates'

describe('furnish a room', () => {
  it('fills every room of the example homes without overlaps or blocked doors', () => {
    for (const id of ['family', 'ranch', 'studio']) {
      const p = buildTemplate(id)
      for (const lv of p.levels) {
        let level = { ...lv, items: [] as typeof lv.items }
        const counts: Record<string, number> = {}
        for (const r of level.rooms) {
          const items = furnishRoom(level, r)
          counts[r.name] = items.length
          level = { ...level, items: [...level.items, ...items] }
        }
        const problems = checkLevel(level)
          .filter((i) => i.level === 'problem' && /overlaps|in the way/.test(i.text))
          .map((i) => `${id}/${lv.name}: ${i.text}`)
        expect(problems).toEqual([])
        for (const [name, n] of Object.entries(counts)) {
          if (/bed|living|dining|kitchen|bath|office|closet|laundry|mud|den/i.test(name)) expect(n, `${id}/${name}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
