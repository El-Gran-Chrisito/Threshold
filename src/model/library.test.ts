import { describe, expect, it } from 'vitest'
import { LIBRARY, buildLibraryPlan, libraryBlurb } from './library'
import { checkLevel } from './checks'

describe('plan library', () => {
  it('builds every home with rooms on each floor and no design problems', () => {
    for (const l of LIBRARY) {
      const p = buildLibraryPlan(l.id)
      expect(p.name).toBe(l.name)
      const floors = p.levels.filter((x) => x.rooms.length)
      expect(floors.length).toBe(l.brief.storeys)
      const problems = floors.flatMap((x) => checkLevel(x)).filter((i) => i.level === 'problem')
      expect(problems.map((i) => `${l.id}: ${i.text}`)).toEqual([])
    }
  })

  it('keeps some homes free and says what each one is', () => {
    expect(LIBRARY.filter((l) => !l.pro).length).toBeGreaterThanOrEqual(2)
    expect(libraryBlurb(LIBRARY[0])).toBe('2 bed · 1 bath · 1 storey')
    expect(new Set(LIBRARY.map((l) => l.id)).size).toBe(LIBRARY.length)
  })
})
