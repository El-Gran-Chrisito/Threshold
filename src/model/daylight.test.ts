import { describe, expect, it } from 'vitest'
import { compassPoint, directSun, roomDaylight, roomWindows, sunPeriod } from './daylight'
import { makeLevel, makeOpening } from './factory'
import { addRoom } from './ops'
import { buildTemplate } from './templates'
import type { Level, Site } from './types'

const site = (northAngle = 0, latitude = 40): Site => ({ showGround: true, groundColor: '#8DA870', northAngle, latitude })

/** A 4 m square room with one window on the chosen side (plan up is north when northAngle is 0). */
function room(side: 'top' | 'bottom' | 'left' | 'right'): Level {
  const r = addRoom(makeLevel('Ground', 0), [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ])
  const level = r.level
  const mid = { top: { x: 200, y: 0 }, bottom: { x: 200, y: 400 }, left: { x: 0, y: 200 }, right: { x: 400, y: 200 } }[side]
  const wall = level.walls.find((w) => Math.abs((w.a.x + w.b.x) / 2 - mid.x) < 1 && Math.abs((w.a.y + w.b.y) / 2 - mid.y) < 1)!
  return { ...level, openings: [makeOpening(wall.id, 'window', 200, { width: 120, height: 120 })] }
}

describe('daylight', () => {
  it('finds which way each window faces', () => {
    for (const [side, point] of [['top', 'N'], ['bottom', 'S'], ['left', 'W'], ['right', 'E']] as const) {
      const level = room(side)
      const w = roomWindows(level, level.rooms[0], 0)
      expect(w).toHaveLength(1)
      expect(compassPoint(w[0].bearing)).toBe(point)
    }
    // Plan up faces east: the bottom wall then faces west.
    const turned = room('bottom')
    expect(compassPoint(roomWindows(turned, turned.rooms[0], 90)[0].bearing)).toBe('W')
  })

  it('gives a south window winter sun and a north window none (northern hemisphere)', () => {
    const south = roomDaylight(room('bottom'), room('bottom').rooms[0], site())
    const north = roomDaylight(room('top'), room('top').rooms[0], site())
    expect(south.faces).toEqual(['S'])
    expect(south.winter.hours).toBeGreaterThan(7)
    expect(north.winter.hours).toBe(0)
    expect(sunPeriod(north.winter)).toBe('no direct sun')
    // In summer a north window catches early and late sun.
    expect(north.summer.hours).toBeGreaterThan(1)
    expect(north.summer.from!).toBeLessThan(8)
    // Early and late, with no sun in the middle of the day.
    expect(north.summer.spans).toHaveLength(2)
    expect(north.summer.spans[0][1]).toBeLessThan(10)
    expect(north.summer.spans[1][0]).toBeGreaterThan(14)
    expect(south.winter.spans).toHaveLength(1)
    expect(sunPeriod(north.summer)).toBe('early morning and evening')
  })

  it('swaps north and south below the equator', () => {
    const level = room('top')
    const d = roomDaylight(level, level.rooms[0], site(0, -34))
    expect(d.winter.hours).toBeGreaterThan(6)
  })

  it('calls east windows morning and west windows afternoon', () => {
    expect(sunPeriod(directSun([{ bearing: 90 }], 172, 40))).toBe('morning')
    expect(sunPeriod(directSun([{ bearing: 270 }], 172, 40))).toBe('afternoon')
    expect(directSun([], 172, 40).hours).toBe(0)
  })

  it('works on a full house and ignores windows between two rooms', () => {
    const p = buildTemplate('family')
    const ground = p.levels[0]
    let lit = 0
    for (const r of ground.rooms) {
      const d = roomDaylight(ground, r, p.site)
      expect(d.glassRatio).toBeGreaterThanOrEqual(0)
      if (d.windows) lit++
    }
    expect(lit).toBeGreaterThan(2)
  })
})
