import { describe, expect, it } from 'vitest'
import { accessIssues, clearWidth, narrowOpenings, turningCircleFits, widenDoors } from './access'
import { buildTemplate } from './templates'
import { makeLevel, makeOpening } from './factory'
import { addRoom } from './ops'
import { normalizeProject } from '../store/persistence'

describe('accessibility check', () => {
  it('estimates the clear width through each kind of opening', () => {
    const at = (kind: 'door' | 'double-door' | 'slider' | 'opening', width: number) => clearWidth(makeOpening('w', kind, 100, { width }))
    expect(at('door', 91.4)).toBeCloseTo(86.4)
    expect(at('opening', 80)).toBe(80)
    expect(at('slider', 180)).toBeCloseTo(85)
    expect(clearWidth(makeOpening('w', 'window', 100))).toBeNull()
  })

  it('flags narrow doors between the two rooms they join, but not reach-in closets', () => {
    const p = buildTemplate('family')
    const texts = accessIssues(p, p.levels[0]).map((i) => i.text)
    expect(texts.some((t) => /^Kitchen & dining to Den door is about 30 in clear/.test(t))).toBe(true)
    expect(texts.some((t) => /Closet/.test(t))).toBe(false)
  })

  it('asks for a bedroom and a full bath on the entry floor of a multi-storey home', () => {
    const p = buildTemplate('family')
    const texts = accessIssues(p, p.levels[0]).map((i) => i.text)
    expect(texts).toContain('No bedroom on the entry floor, so living on one level is not possible')
    expect(texts).toContain('No full bathroom (shower or bath) on the entry floor')
    // The upper floor is not the entry floor.
    expect(accessIssues(p, p.levels[1]).some((i) => /entry floor/.test(i.text))).toBe(false)
  })

  it('finds a 5 ft turning circle only where one fits', () => {
    const big = addRoom(makeLevel('G', 0), [
      { x: 0, y: 0 },
      { x: 250, y: 0 },
      { x: 250, y: 250 },
      { x: 0, y: 250 },
    ], { name: 'Bath' })
    expect(turningCircleFits(big.level, big.room)).toBe(true)
    const small = addRoom(makeLevel('G', 0), [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 250 },
      { x: 0, y: 250 },
    ], { name: 'Bath' })
    expect(turningCircleFits(small.level, small.room)).toBe(false)
  })

  it('widens flagged doors where the wall has room, and the check then passes', () => {
    const p = buildTemplate('ranch')
    const level = p.levels[0]
    const narrow = narrowOpenings(p, level)
    expect(narrow.length).toBeGreaterThan(3)
    const r = widenDoors(level, new Set(narrow.map((o) => o.id)))
    expect(r.widened).toBeGreaterThan(3)
    const after = { ...p, levels: [r.level] }
    expect(narrowOpenings(after, r.level).length).toBeLessThan(narrow.length)
    // No two openings on a wall overlap afterwards.
    for (const w of r.level.walls) {
      const spans = r.level.openings.filter((o) => o.wallId === w.id).map((o) => [o.offset - o.width / 2, o.offset + o.width / 2]).sort((a, b) => a[0] - b[0])
      for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1])
    }
  })

  it('keeps the switch when a design is saved and opened again', () => {
    const p = { ...buildTemplate('studio'), accessible: true }
    expect(normalizeProject(JSON.parse(JSON.stringify(p))).accessible).toBe(true)
    expect(normalizeProject(JSON.parse(JSON.stringify(buildTemplate('studio')))).accessible).toBeUndefined()
  })
})
