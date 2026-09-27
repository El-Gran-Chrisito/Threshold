import { describe, expect, it } from 'vitest'
import { formatArea, formatLength, parseLength, CM_PER_FT, CM_PER_IN } from './units'
import { polygonArea, signedArea, subtractCovered, pointInPolygon, snapAngle } from './geometry'
import { addRoom, addWalls, autoRooms, detectFaces, insertRoomVertex, moveRoomEdge, moveVertex, rectPoints, roomWallSides, snapItemToWall, splitWall, wallLength } from './ops'
import { makeItem, makeLevel, makeOpening } from './factory'
import { TEMPLATES } from './templates'

describe('units', () => {
  it('formats feet and inches', () => {
    expect(formatLength(CM_PER_FT * 12 + CM_PER_IN * 6, 'imperial')).toBe(`12' 6"`)
    expect(formatLength(CM_PER_FT * 10, 'imperial')).toBe(`10'`)
    expect(formatLength(CM_PER_IN * 3.5, 'imperial')).toBe(`3½"`)
    expect(formatLength(CM_PER_IN * 0.5, 'imperial')).toBe(`½"`)
  })
  it('formats metric', () => {
    expect(formatLength(345, 'metric')).toBe('3.45 m')
    expect(formatLength(85, 'metric')).toBe('85 cm')
  })
  it('parses many length notations', () => {
    const near = (v: number | null, want: number) => {
      expect(v).not.toBeNull()
      expect(Math.abs((v as number) - want)).toBeLessThan(0.01)
    }
    near(parseLength(`12' 6"`, 'imperial'), CM_PER_FT * 12.5)
    near(parseLength(`12'6`, 'imperial'), CM_PER_FT * 12.5)
    near(parseLength('12ft 6in', 'imperial'), CM_PER_FT * 12.5)
    near(parseLength('12-6', 'imperial'), CM_PER_FT * 12.5)
    near(parseLength('6"', 'imperial'), CM_PER_IN * 6)
    near(parseLength('6 1/2"', 'imperial'), CM_PER_IN * 6.5)
    near(parseLength('3.5m', 'imperial'), 350)
    near(parseLength('350', 'metric'), 350)
    near(parseLength('12', 'imperial'), CM_PER_FT * 12)
    near(parseLength('30', 'imperial', 'in'), CM_PER_IN * 30)
    expect(parseLength('abc', 'imperial')).toBeNull()
    expect(parseLength('', 'imperial')).toBeNull()
  })
  it('formats area', () => {
    expect(formatArea(CM_PER_FT * CM_PER_FT * 100, 'imperial')).toBe('100 sq ft')
    expect(formatArea(10000 * 12.5, 'metric')).toBe('12.5 m²')
  })
})

describe('geometry', () => {
  it('computes polygon area and orientation', () => {
    const sq = rectPoints({ x: 0, y: 0 }, { x: 100, y: 200 })
    expect(polygonArea(sq)).toBe(20000)
    expect(signedArea(sq)).toBeGreaterThan(0)
    expect(pointInPolygon({ x: 50, y: 50 }, sq)).toBe(true)
    expect(pointInPolygon({ x: 150, y: 50 }, sq)).toBe(false)
  })
  it('subtracts covered collinear stretches', () => {
    const pieces = subtractCovered({ x: 0, y: 0 }, { x: 100, y: 0 }, [[{ x: 20, y: 0 }, { x: 50, y: 0 }]])
    expect(pieces).toEqual([
      [0, 0.2],
      [0.5, 1],
    ])
    expect(subtractCovered({ x: 0, y: 0 }, { x: 100, y: 0 }, [[{ x: 100, y: 0 }, { x: -5, y: 0 }]])).toEqual([])
    // Parallel but offset walls do not cover each other.
    expect(subtractCovered({ x: 0, y: 0 }, { x: 100, y: 0 }, [[{ x: 0, y: 30 }, { x: 100, y: 30 }]])).toEqual([[0, 1]])
  })
  it('snaps angles to 45°', () => {
    const b = snapAngle({ x: 0, y: 0 }, { x: 100, y: 7 })
    expect(Math.round(b.y)).toBe(0)
  })
})

describe('rooms and walls', () => {
  it('shares walls between adjacent rooms', () => {
    let level = makeLevel('L', 0)
    level = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 300, y: 300 })).level
    level = addRoom(level, rectPoints({ x: 300, y: 0 }, { x: 600, y: 300 })).level
    expect(level.rooms).toHaveLength(2)
    expect(level.walls).toHaveLength(7)
  })
  it('finds the wall sides that face into a room', () => {
    let level = makeLevel('L', 0)
    const r = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 300, y: 300 }))
    level = r.level
    const sides = roomWallSides(level, r.room)
    expect(sides).toHaveLength(4)
  })
  it('moves joined corners together', () => {
    let level = makeLevel('L', 0)
    level = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 300, y: 300 })).level
    const moved = moveVertex(level, { x: 300, y: 300 }, { x: 400, y: 350 })
    const touching = moved.walls.filter((w) => (w.a.x === 400 && w.a.y === 350) || (w.b.x === 400 && w.b.y === 350))
    expect(touching).toHaveLength(2)
    expect(moved.rooms[0].points.some((p) => p.x === 400 && p.y === 350)).toBe(true)
  })
  it('pushes a room edge outward', () => {
    let level = makeLevel('L', 0)
    const r = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 300, y: 300 }))
    level = r.level
    // Edge 1 is the east edge (300,0)→(300,300).
    const next = moveRoomEdge(level, r.room.id, 1, 50)
    expect(polygonArea(next.rooms[0].points)).toBe(350 * 300)
  })
  it('adds a corner to a room edge and splits the wall under it', () => {
    let level = makeLevel('L', 0)
    const r = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 400, y: 300 }))
    level = r.level
    const res = insertRoomVertex(level, r.room.id, 1)!
    expect(res.point).toEqual({ x: 400, y: 150 })
    expect(res.level.rooms[0].points).toHaveLength(5)
    expect(res.level.walls).toHaveLength(5)
    // Dragging the new corner outward makes an L-shaped room with more area.
    const moved = moveVertex(res.level, res.point, { x: 500, y: 150 })
    expect(polygonArea(moved.rooms[0].points)).toBeGreaterThan(400 * 300)
  })
  it('splits a wall and keeps openings on the right half', () => {
    let level = makeLevel('L', 0)
    level = addWalls(level, [[{ x: 0, y: 0 }, { x: 400, y: 0 }]]).level
    const w = level.walls[0]
    level = { ...level, openings: [makeOpening(w.id, 'door', 300)] }
    const split = splitWall(level, w.id, { x: 200, y: 5 })
    expect(split.walls).toHaveLength(2)
    const o = split.openings[0]
    const host = split.walls.find((x) => x.id === o.wallId)!
    expect(host.a.x).toBe(200)
    expect(o.offset).toBe(100)
    expect(wallLength(host)).toBe(200)
  })
  it('detects enclosed rooms from free walls', () => {
    let level = makeLevel('L', 0)
    // A 600x300 box with a partition at x=300 and a dangling stub.
    level = addWalls(level, [
      [{ x: 0, y: 0 }, { x: 600, y: 0 }],
      [{ x: 600, y: 0 }, { x: 600, y: 300 }],
      [{ x: 600, y: 300 }, { x: 0, y: 300 }],
      [{ x: 0, y: 300 }, { x: 0, y: 0 }],
      [{ x: 300, y: 0 }, { x: 300, y: 300 }],
      [{ x: 450, y: 300 }, { x: 450, y: 200 }],
    ]).level
    const faces = detectFaces(level.walls)
    expect(faces).toHaveLength(2)
    const areas = faces.map(polygonArea).sort((a, b) => a - b)
    expect(areas[0]).toBeCloseTo(90000)
    expect(areas[1]).toBeCloseTo(90000)
    const { count } = autoRooms(level)
    expect(count).toBe(2)
  })
  it('backs furniture onto the nearest wall', () => {
    let level = makeLevel('L', 0)
    level = addRoom(level, rectPoints({ x: 0, y: 0 }, { x: 400, y: 400 })).level
    const bed = makeItem('bed-queen', { x: 200, y: 120 })
    const s = snapItemToWall(level, bed, { x: 200, y: 120 }, 60)!
    expect(s).not.toBeNull()
    // Backed onto the north wall, facing south (rotation 0).
    expect(s.rotation).toBe(0)
    expect(s.y).toBeCloseTo(6 + bed.depth / 2 + 0.5)
  })
})

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s builds', (_, t) => {
    const p = t.build()
    expect(p.levels.length).toBeGreaterThan(0)
    if (t.id !== 'blank') {
      const l = p.levels[0]
      expect(l.rooms.length).toBeGreaterThan(2)
      expect(l.openings.length).toBeGreaterThan(3)
      expect(l.items.length).toBeGreaterThan(5)
      // Every opening sits on an existing wall and fits it.
      for (const lv of p.levels) {
        for (const o of lv.openings) {
          const w = lv.walls.find((x) => x.id === o.wallId)
          expect(w).toBeTruthy()
          expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(-0.01)
          expect(o.offset + o.width / 2).toBeLessThanOrEqual(wallLength(w!) + 0.01)
        }
      }
    }
  })
})
