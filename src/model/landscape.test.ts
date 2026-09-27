import { describe, expect, it } from 'vitest'
import { buildLandscape, groundLevel } from './landscape'
import { buildTemplate } from './templates'
import { planFromBrief } from './brief'
import { levelBounds } from './ops'

describe('surroundings', () => {
  const projects = [buildTemplate('family'), buildTemplate('ranch'), planFromBrief({ bedrooms: 3, bathrooms: 2, storeys: 1, garage: 2, office: false, openPlan: true })]

  it('lays a street, a driveway to each street-facing garage door and a front path', () => {
    const p = projects[2]
    const L = buildLandscape(p)!
    expect(L.street).not.toBeNull()
    const g = groundLevel(p)!
    const garage = g.openings.filter((o) => o.kind === 'garage')
    expect(garage.length).toBe(1)
    const own = L.driveways.filter((d) => d.maxY === L.street!.road[0] && d.minY < L.front)
    expect(own.length).toBeGreaterThanOrEqual(1)
    expect(L.paths.length).toBeGreaterThanOrEqual(1)
    expect(L.mailbox).not.toBeNull()
  })

  it('keeps trees and shrubs out of the house and off the drive and paths', () => {
    for (const p of projects) {
      const L = buildLandscape(p)!
      const b = levelBounds(groundLevel(p)!)!
      for (const t of L.trees) expect(t.x > b.minX - 100 && t.x < b.maxX + 100 && t.y > b.minY - 100 && t.y < b.maxY + 100).toBe(false)
      for (const s of L.shrubs) {
        for (const d of [...L.driveways, ...L.paths]) expect(s.x > d.minX && s.x < d.maxX && s.y > d.minY && s.y < d.maxY).toBe(false)
      }
      expect(L.shrubs.length).toBeGreaterThan(3)
      expect(L.farTrees.length).toBeGreaterThan(100)
    }
  })

  it('is the same every time for the same design', () => {
    const a = buildLandscape(projects[0])!
    const b = buildLandscape(projects[0])!
    expect(a.trees.map((t) => [t.x, t.y])).toEqual(b.trees.map((t) => [t.x, t.y]))
  })

  it('has neighbours only on a suburban street, and nothing for plain ground', () => {
    const p = projects[1]
    expect(buildLandscape(p)!.neighbours.length).toBeGreaterThan(4)
    expect(buildLandscape({ ...p, site: { ...p.site, surroundings: 'garden' } })!.neighbours).toEqual([])
    expect(buildLandscape({ ...p, site: { ...p.site, surroundings: 'country' } })!.lane).not.toBeNull()
    expect(buildLandscape({ ...p, site: { ...p.site, surroundings: 'plain' } })).toBeNull()
  })
})
