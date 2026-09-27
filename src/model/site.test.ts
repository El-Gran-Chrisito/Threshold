import { describe, expect, it } from 'vitest'
import { buildable, defaultLot, lotIssues } from './site'
import { buildTemplate } from './templates'
import { CM_PER_FT } from './units'

describe('lot and setbacks', () => {
  it('fits a default lot around the house with no issues', () => {
    const p = buildTemplate('ranch')
    const lot = defaultLot(p)
    expect(Math.round(lot.w / (5 * CM_PER_FT)) * 5 * CM_PER_FT).toBeCloseTo(lot.w, 6)
    for (const l of p.levels) expect(lotIssues(lot, l)).toEqual([])
  })

  it('flags walls inside a setback and past the property line', () => {
    const p = buildTemplate('ranch')
    const l = p.levels[0]
    const lot = defaultLot(p)
    const b = buildable(lot)
    const minY = Math.min(...l.walls.flatMap((w) => [w.a.y, w.b.y]))
    // Push the rear setback past the back wall.
    const tight = { ...lot, rear: minY - lot.y + 50 }
    expect(buildable(tight).minY).toBeGreaterThan(b.minY)
    expect(lotIssues(tight, l).map((i) => i.text)).toContain('Walls are inside the rear setback')
    // Shrink the lot so the house crosses the line.
    const small = { ...lot, w: 300, x: l.walls[0].a.x }
    expect(lotIssues(small, l)[0].text).toBe('The house goes past the property line')
  })
})
