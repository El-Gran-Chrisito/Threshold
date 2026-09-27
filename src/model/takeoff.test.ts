import { describe, expect, it } from 'vitest'
import { paintAmount, takeoff, takeoffCsv } from './takeoff'
import { buildTemplate } from './templates'
import { CM2_PER_FT2 } from './units'

describe('shopping list', () => {
  it('rounds paint up to cans for two coats', () => {
    expect(paintAmount(100 * CM2_PER_FT2, 'imperial')).toBe('1 gal')
    expect(paintAmount(20 * CM2_PER_FT2, 'imperial')).toBe('1 quart')
    expect(paintAmount(400 * CM2_PER_FT2, 'imperial')).toBe('3 gal')
    expect(paintAmount(50 * 10000, 'metric')).toBe('10 L')
  })

  it('lists paint, flooring, trim, openings and furniture for a template', () => {
    const p = buildTemplate('family')
    const lines = takeoff(p)
    const groups = new Set(lines.map((l) => l.group))
    for (const g of ['Paint', 'Flooring', 'Trim', 'Doors & windows', 'Furniture & fixtures']) expect(groups.has(g as never)).toBe(true)
    const doorCount = lines.filter((l) => l.group === 'Doors & windows').reduce((s, l) => s + Number(l.qty), 0)
    expect(doorCount).toBe(p.levels.reduce((s, l) => s + l.openings.length, 0))
    const itemCount = lines.filter((l) => l.group === 'Furniture & fixtures').reduce((s, l) => s + Number(l.qty), 0)
    expect(itemCount).toBe(p.levels.reduce((s, l) => s + l.items.length, 0))
    expect(takeoffCsv(lines).split('\n')[0]).toBe('Group,Item,Buy,Details,For')
  })
})

describe('roofing', () => {
  it('prices and lists a pitched roof by sloped area', async () => {
    const { roofArea } = await import('./roof')
    const p = buildTemplate('ranch')
    const l = p.levels[0]
    expect(l.roof.style).toBe('gable')
    const f = { w: 0, d: 0 }
    const xs = l.walls.flatMap((w) => [w.a.x, w.b.x])
    const ys = l.walls.flatMap((w) => [w.a.y, w.b.y])
    f.w = Math.max(...xs) - Math.min(...xs) + 2 * l.roof.overhang
    f.d = Math.max(...ys) - Math.min(...ys) + 2 * l.roof.overhang
    expect(roofArea(l)).toBeCloseTo(f.w * f.d * Math.sqrt(1 + l.roof.pitch ** 2), 3)
    const line = takeoff(p).find((x) => x.group === 'Roofing')!
    expect(line.item).toBe('Asphalt shingle')
    expect(line.qty).toMatch(/^\d+ bundles$/)
  })
})
