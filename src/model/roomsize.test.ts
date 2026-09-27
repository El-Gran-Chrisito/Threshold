import { describe, expect, it } from 'vitest'
import { CM2_PER_FT2, CM_PER_FT, CM_PER_IN, parseArea, parseSize } from './units'
import { addRoom, rectPoints, rectSides, roomArea, setRoomArea, setRoomSides } from './ops'
import { makeLevel } from './factory'
import { buildTemplate } from './templates'

const ft = (n: number) => n * CM_PER_FT

describe('typed room sizes', () => {
  it('reads sizes in many forms', () => {
    expect(parseSize(`31'6" × 69'`, 'imperial')).toEqual({ a: ft(31) + 6 * CM_PER_IN, b: ft(69) })
    expect(parseSize('12x14', 'imperial')).toEqual({ a: ft(12), b: ft(14) })
    expect(parseSize(`12' by 14' 6"`, 'imperial')).toEqual({ a: ft(12), b: ft(14) + 6 * CM_PER_IN })
    expect(parseSize('3.6 x 4.2 m', 'metric')).toEqual({ a: 360, b: 420 })
    expect(parseSize('3,6 × 4,2', 'metric')).toEqual({ a: 360, b: 420 })
    expect(parseSize('360 x 420 cm', 'metric')).toEqual({ a: 360, b: 420 })
    expect(parseSize('12', 'imperial')).toBeNull()
    expect(parseSize('abc x 12', 'imperial')).toBeNull()
  })

  it('reads areas in many forms', () => {
    expect(parseArea('2,174 sq ft', 'imperial')).toBeCloseTo(2174 * CM2_PER_FT2)
    expect(parseArea('2174', 'imperial')).toBeCloseTo(2174 * CM2_PER_FT2)
    expect(parseArea('180 m²', 'imperial')).toBeCloseTo(180 * 10000)
    expect(parseArea('20,5', 'metric')).toBeCloseTo(20.5 * 10000)
    expect(parseArea('big', 'imperial')).toBeNull()
  })
})

describe('resizing a room from its label', () => {
  const room = () => {
    const { level, room } = addRoom(makeLevel('L', 0), rectPoints({ x: 0, y: 0 }, { x: ft(12), y: ft(10) }), { name: 'Den' })
    return { level, id: room.id }
  }

  it('sets both sides and moves the walls with them', () => {
    const { level, id } = room()
    const next = setRoomSides(level, id, ft(15), ft(11))
    const r = next.rooms.find((x) => x.id === id)!
    const s = rectSides(r)!
    expect(s.a).toBeCloseTo(ft(15))
    expect(s.b).toBeCloseTo(ft(11))
    const xs = next.walls.flatMap((w) => [w.a.x, w.b.x])
    expect(Math.max(...xs)).toBeCloseTo(ft(15))
  })

  it('sets the area and keeps the proportions', () => {
    const { level, id } = room()
    const next = setRoomArea(level, id, 480 * CM2_PER_FT2)
    const r = next.rooms.find((x) => x.id === id)!
    expect(roomArea(r) / CM2_PER_FT2).toBeCloseTo(480, 3)
    const s = rectSides(r)!
    expect(s.a / s.b).toBeCloseTo(1.2, 5)
  })

  it('scales an L-shaped room to a new area', () => {
    const p = buildTemplate('blank')
    const pts = [
      { x: 0, y: 0 },
      { x: ft(20), y: 0 },
      { x: ft(20), y: ft(10) },
      { x: ft(10), y: ft(10) },
      { x: ft(10), y: ft(20) },
      { x: 0, y: ft(20) },
    ]
    const { level, room: r0 } = addRoom(p.levels[0], pts, { name: 'L room' })
    const next = setRoomArea(level, r0.id, 600 * CM2_PER_FT2)
    const r = next.rooms.find((x) => x.id === r0.id)!
    expect(r.points).toHaveLength(6)
    expect(roomArea(r) / CM2_PER_FT2).toBeCloseTo(600, 2)
  })
})
