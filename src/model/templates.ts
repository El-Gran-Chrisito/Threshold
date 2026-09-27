/**
 * Starter homes. Built with the same operations the editor uses, so every
 * template is fully editable. Coordinates below are feet; converted to cm.
 */
import type { Item, Level, OpeningKind, Project, Room, Vec2, WallFinish } from './types'
import { CM_PER_FT } from './units'
import { addRoom, clampOpening, findWallAt, paintExterior, paintRoomWalls, wallLength } from './ops'
import { makeItem, makeLevel, makeOpening, makeProject } from './factory'
import { closestOnSegment } from './geometry'
import { catalogEntry } from './catalog'

const ft = (n: number) => n * CM_PER_FT
const P = (x: number, y: number): Vec2 => ({ x: ft(x), y: ft(y) })

type Side = 'N' | 'S' | 'E' | 'W'

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

class Builder {
  level: Level
  rects = new Map<string, Rect>()
  constructor(level: Level) {
    this.level = level
  }

  room(name: string, x0: number, y0: number, x1: number, y1: number, floor = 'oak', opts: Partial<Room> = {}): this {
    const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]
    const { level, room } = addRoom(this.level, pts, { name, floor, ...opts })
    this.level = level
    this.rects.set(name, { x0, y0, x1, y1 })
    void room
    return this
  }

  /** Put an opening on the wall passing through (x, y), centred there. */
  opening(kind: OpeningKind, x: number, y: number, opts: { width?: number; hinge?: 'start' | 'end'; swing?: 'A' | 'B'; height?: number; sill?: number } = {}): this {
    const at = P(x, y)
    const wall = findWallAt(this.level, at, 4)
    if (!wall) return this
    const { t } = closestOnSegment(at, wall.a, wall.b)
    const o = makeOpening(wall.id, kind, t * wallLength(wall), {
      ...(opts.width ? { width: ft(opts.width) } : {}),
      ...(opts.height ? { height: ft(opts.height) } : {}),
      ...(opts.sill !== undefined ? { sill: ft(opts.sill) } : {}),
      ...(opts.hinge ? { hinge: opts.hinge } : {}),
      ...(opts.swing ? { swing: opts.swing } : {}),
    })
    this.level = { ...this.level, openings: [...this.level.openings, clampOpening(o, wall)] }
    return this
  }

  /** Free-standing item centred at (x, y) feet. */
  put(type: string, x: number, y: number, rotation = 0, opts: Partial<Item> = {}): this {
    this.level = { ...this.level, items: [...this.level.items, makeItem(type, P(x, y), { rotation, ...opts })] }
    return this
  }

  /**
   * Item backed against one side of a named room, centred `along` feet from
   * that side's start (north/south: from x0; east/west: from y0).
   */
  against(roomName: string, side: Side, along: number, type: string, opts: Partial<Item> = {}): this {
    const r = this.rects.get(roomName)
    if (!r) return this
    const c = catalogEntry(type)
    const depth = opts.depth ?? c.d
    const lineMid =
      side === 'N' ? P((r.x0 + r.x1) / 2, r.y0) : side === 'S' ? P((r.x0 + r.x1) / 2, r.y1) : side === 'W' ? P(r.x0, (r.y0 + r.y1) / 2) : P(r.x1, (r.y0 + r.y1) / 2)
    const wall = findWallAt(this.level, lineMid, 4)
    const t = wall ? wall.thickness : 12
    const inset = t / 2 + depth / 2 + 1
    let pos: Vec2
    let rotation: number
    switch (side) {
      case 'N':
        pos = { x: ft(r.x0 + along), y: ft(r.y0) + inset }
        rotation = 0
        break
      case 'S':
        pos = { x: ft(r.x0 + along), y: ft(r.y1) - inset }
        rotation = 180
        break
      case 'W':
        pos = { x: ft(r.x0) + inset, y: ft(r.y0 + along) }
        rotation = 270
        break
      case 'E':
        pos = { x: ft(r.x1) - inset, y: ft(r.y0 + along) }
        rotation = 90
        break
    }
    this.level = { ...this.level, items: [...this.level.items, makeItem(type, pos, { rotation, ...opts })] }
    return this
  }

  paint(roomName: string, color: string): this {
    const room = this.level.rooms.find((r) => r.name === roomName)
    if (room) this.level = paintRoomWalls(this.level, room.id, color)
    return this
  }

  exterior(color: string, thickness = 20, finish?: WallFinish): this {
    this.level = paintExterior(this.level, color, thickness, finish)
    return this
  }

  finish(roomName: string, color: string, finish: WallFinish): this {
    const room = this.level.rooms.find((r) => r.name === roomName)
    if (room) this.level = paintRoomWalls(this.level, room.id, color, finish)
    return this
  }
}

function finish(p: Project, levels: Level[]): Project {
  return { ...p, levels }
}

// ---------------------------------------------------------------------------

function studio(): Project {
  const p = makeProject('Studio apartment')
  const b = new Builder({ ...p.levels[0], name: 'Apartment' })
  b.room('Bath', 0, 0, 8, 10, 'hex')
    .room('Kitchen', 0, 10, 8, 22, 'tile-grey')
    .room('Living', 8, 0, 30, 22, 'oak')
    .exterior('#B4B2AD', 20, 'concrete')
    .paint('Living', '#EDE6D8')
    .finish('Bath', '#F1F0EB', 'tile')
    .opening('door', 4, 22, { hinge: 'end' })
    .opening('door', 8, 5, { swing: 'B' })
    .opening('opening', 8, 16, { width: 8 })
    .opening('window', 14, 0, { width: 5 })
    .opening('window', 24, 0, { width: 5 })
    .opening('window', 30, 11, { width: 6 })
    .opening('window', 20, 22, { width: 5 })
    .opening('window', 0, 4, { width: 2.5, sill: 4, height: 2.5 })
    // Bath
    .against('Bath', 'N', 2, 'toilet')
    .against('Bath', 'W', 7, 'vanity')
    .against('Bath', 'E', 5, 'bathtub', { rotation: 90, width: ft(5), depth: ft(2.5) })
    // Kitchen
    .against('Kitchen', 'W', 1.7, 'fridge')
    .against('Kitchen', 'W', 4.2, 'base-60')
    .against('Kitchen', 'W', 6.45, 'range')
    .against('Kitchen', 'W', 9.2, 'sink-cab')
    .against('Kitchen', 'W', 4.2, 'wall-cab')
    .against('Kitchen', 'W', 6.45, 'hood')
    .against('Kitchen', 'W', 9.2, 'wall-cab-36')
    // Living / sleeping
    .against('Living', 'N', 18, 'bed-queen')
    .against('Living', 'N', 13.5, 'nightstand')
    .against('Living', 'E', 11, 'wardrobe')
    .against('Living', 'S', 6.5, 'sofa-3')
    .put('rug', 14.5, 15.5)
    .put('coffee-table', 14.5, 16.5)
    .against('Living', 'E', 17, 'bookshelf', { width: ft(3) })
    .put('table-round', 13, 5.5)
    .put('chair', 11.8, 5.5, 90)
    .put('chair', 14.2, 5.5, 270)
    .put('plant', 28.6, 20.6)
    .put('floor-lamp', 9.3, 20.7)
    .put('pendant', 13, 5.5, 0, { elevation: 200 })
  return finish(p, [b.level])
}

function familyHome(): Project {
  const p = makeProject('Two-storey family home')
  const g = new Builder({ ...makeLevel('Ground floor', 0), roof: { style: 'flat', pitch: 0.5, overhang: 20, color: '#5B5F63', ridgeAlongLong: true } })
  g.room('Living room', 0, 0, 20, 18, 'oak')
    .room('Kitchen & dining', 20, 0, 44, 18, 'oak')
    .room('Foyer', 0, 18, 14, 32, 'tile-black')
    .room('Powder room', 14, 18, 20, 25, 'hex')
    .room('Closet', 14, 25, 20, 32, 'oak')
    .room('Den', 20, 18, 36, 32, 'carpet-oat')
    .room('Mudroom', 36, 18, 44, 32, 'tile-grey')
    .room('Garage', 44, 6, 68, 32, 'concrete')
    .exterior('#9C5540', 20, 'brick')
    .paint('Living room', '#EDE6D8')
    .paint('Den', '#B3BFA6')
    .paint('Powder room', '#27394F')
    .finish('Den', '#8A6444', 'wood')
    .paint('Garage', '#E4E1DA')
    // Openings
    .opening('double-door', 9, 32)
    .opening('opening', 20, 9, { width: 10 })
    .opening('opening', 7, 18, { width: 7 })
    .opening('door', 14, 21.5, { swing: 'A' })
    .opening('door', 14, 28.5, { swing: 'A', width: 2.5 })
    .opening('door', 24, 18, { swing: 'B' })
    .opening('door', 40, 18, { swing: 'B' })
    .opening('door', 44, 30.2, { swing: 'A' })
    .opening('garage', 56, 32, { width: 16, height: 7 })
    .opening('slider', 32, 0, { width: 8 })
    .opening('window', 6, 0, { width: 5 })
    .opening('window', 14, 0, { width: 5 })
    .opening('window', 0, 9, { width: 6 })
    .opening('window', 44, 12, { width: 4 })
    .opening('window', 28, 32, { width: 5 })
    .opening('window', 3, 32, { width: 2.5 })
    .opening('window', 56, 6, { width: 5, sill: 5, height: 1.5 })
    // Living room
    .against('Living room', 'W', 9, 'fireplace')
    .against('Living room', 'E', 9, 'sofa-3', { rotation: 90 })
    .put('rug-large', 9.5, 9, 90)
    .put('coffee-table', 10, 9, 90)
    .put('armchair', 6, 3.6, 30)
    .put('armchair', 6, 14.4, 150)
    .put('floor-lamp', 15.6, 2.2)
    .against('Living room', 'N', 18.3, 'plant')
    // Kitchen & dining
    .against('Kitchen & dining', 'E', 2.5, 'fridge')
    .against('Kitchen & dining', 'E', 5.5, 'pantry')
    .against('Kitchen & dining', 'E', 8, 'base-60')
    .against('Kitchen & dining', 'E', 10.5, 'range')
    .against('Kitchen & dining', 'E', 10.5, 'hood')
    .against('Kitchen & dining', 'E', 13, 'base-60')
    .against('Kitchen & dining', 'E', 8, 'wall-cab')
    .against('Kitchen & dining', 'E', 13, 'wall-cab')
    .against('Kitchen & dining', 'N', 17, 'sink-cab')
    .against('Kitchen & dining', 'N', 14.5, 'dishwasher')
    .against('Kitchen & dining', 'N', 12.5, 'base-60')
    .put('island', 34, 9, 90)
    .put('stool', 31.9, 7.5, 90)
    .put('stool', 31.9, 9, 90)
    .put('stool', 31.9, 10.5, 90)
    .put('table-6', 26, 9, 90)
    .put('chair', 24.4, 7.2, 90)
    .put('chair', 24.4, 10.8, 90)
    .put('chair', 27.6, 7.2, 270)
    .put('chair', 27.6, 10.8, 270)
    .put('chair', 26, 5.6, 0)
    .put('chair', 26, 12.4, 180)
    .put('chandelier', 26, 9, 0, { elevation: 200 })
    .put('pendant', 34, 7, 0, { elevation: 200 })
    .put('pendant', 34, 11, 0, { elevation: 200 })
    // Foyer + stairs
    .put('stairs', 2.05, 24.6, 0, { height: 295 })
    .against('Foyer', 'E', 6, 'plant-small')
    .put('rug', 9, 28.5, 90, { width: ft(5), depth: ft(3), color: '#8C5A45', color2: '#5E3A2C' })
    // Powder room
    .against('Powder room', 'N', 3, 'vanity')
    .against('Powder room', 'N', 3, 'mirror')
    .against('Powder room', 'E', 5.3, 'toilet')
    // Closet
    .against('Closet', 'W', 3.5, 'closet', { width: ft(5.5), depth: ft(2) })
    // Den
    .against('Den', 'S', 8, 'sofa-2')
    .against('Den', 'N', 11, 'tv-stand')
    .against('Den', 'N', 11, 'tv')
    .against('Den', 'W', 3.5, 'desk')
    .against('Den', 'W', 3.5, 'office-chair', { rotation: 270, elevation: 0 })
    .against('Den', 'E', 7, 'bookshelf')
    // Mudroom
    .against('Mudroom', 'E', 2.5, 'washer')
    .against('Mudroom', 'E', 4.8, 'dryer')
    .against('Mudroom', 'E', 7.5, 'utility-sink')
    .against('Mudroom', 'W', 10, 'wardrobe', { width: ft(5), color: '#3F5A55' })
    // Garage
    .put('car', 51, 18, 0)
    .put('car', 61, 18, 0, { color: '#8E3B2E' })
    .against('Garage', 'N', 3, 'water-heater')
    .against('Garage', 'N', 6, 'furnace')

  const up = new Builder({ ...makeLevel('Upper floor', 270 + 25, 260), roof: { style: 'hip', pitch: 0.42, overhang: 45, color: '#3E4246', ridgeAlongLong: true } })
  up.room('Primary bedroom', 0, 0, 18, 16, 'carpet-oat')
    .room('Primary bath', 18, 0, 26, 9, 'marble')
    .room('Walk-in closet', 18, 9, 26, 16, 'oak')
    .room('Bedroom 2', 26, 0, 44, 16, 'carpet-grey')
    .room('Landing', 0, 16, 14, 32, 'oak')
    .room('Hall', 14, 16, 30, 22, 'oak')
    .room('Bath', 14, 22, 22, 32, 'hex')
    .room('Office', 22, 22, 30, 32, 'oak')
    .room('Bedroom 3', 30, 16, 44, 32, 'carpet-oat')
    .exterior('#DCE3E6', 20, 'siding')
    .finish('Primary bath', '#F1F0EB', 'tile')
    .finish('Bath', '#C9D6DE', 'tile')
    .paint('Primary bedroom', '#C9D6DE')
    .paint('Bedroom 2', '#E9D2C9')
    .paint('Bedroom 3', '#F1E3A9')
    .paint('Office', '#2F4A3A')
    .opening('door', 11, 16, { swing: 'A' })
    .opening('door', 18, 5, { swing: 'B' })
    .opening('door', 18, 12.5, { swing: 'B' })
    .opening('door', 28, 16, { swing: 'B', width: 2.6 })
    .opening('door', 30, 19, { swing: 'B' })
    .opening('door', 18, 22, { swing: 'B' })
    .opening('door', 26, 22, { swing: 'B' })
    .opening('opening', 14, 19, { width: 4 })
    .opening('window', 5, 0, { width: 5 })
    .opening('window', 12, 0, { width: 5 })
    .opening('window', 0, 8, { width: 4 })
    .opening('window', 22, 0, { width: 3, sill: 4, height: 3 })
    .opening('window', 31, 0, { width: 5 })
    .opening('window', 39, 0, { width: 5 })
    .opening('window', 44, 24, { width: 5 })
    .opening('window', 37, 32, { width: 5 })
    .opening('window', 26, 32, { width: 4 })
    .opening('window', 18, 32, { width: 2.5, sill: 4, height: 2.5 })
    .opening('window', 7, 32, { width: 4 })
    // Primary suite
    .against('Primary bedroom', 'W', 7, 'bed-king', { rotation: 270 })
    .against('Primary bedroom', 'W', 2.6, 'nightstand')
    .against('Primary bedroom', 'W', 11.4, 'nightstand')
    .against('Primary bedroom', 'E', 7, 'dresser')
    .against('Primary bedroom', 'N', 15.5, 'armchair')
    .put('rug', 6.5, 7, 90, { color: '#D9CFBE', color2: '#B9A58C' })
    .against('Primary bath', 'N', 4, 'tub-free', { rotation: 0 })
    .against('Primary bath', 'E', 7.2, 'shower')
    .against('Primary bath', 'S', 3.9, 'toilet')
    .against('Primary bath', 'S', 1.9, 'vanity')
    .against('Walk-in closet', 'E', 3.5, 'wardrobe', { width: ft(6), depth: ft(2) })
    .against('Walk-in closet', 'S', 3.6, 'wardrobe', { width: ft(3.5), depth: ft(2) })
    // Bedroom 2
    .against('Bedroom 2', 'E', 8, 'bed-queen', { rotation: 90 })
    .against('Bedroom 2', 'E', 3.5, 'nightstand')
    .against('Bedroom 2', 'W', 3.5, 'desk')
    .against('Bedroom 2', 'S', 12, 'dresser')
    // Bedroom 3
    .against('Bedroom 3', 'E', 8, 'bed-twin', { rotation: 90 })
    .against('Bedroom 3', 'E', 11.5, 'nightstand')
    .against('Bedroom 3', 'S', 4, 'bookshelf')
    .against('Bedroom 3', 'N', 10, 'wardrobe')
    .put('rug', 37, 24, 0, { width: ft(6), depth: ft(4), color: '#C2876A', color2: '#8E5A45' })
    // Bath
    .against('Bath', 'E', 6, 'bathtub', { rotation: 90, width: ft(5), depth: ft(2.5) })
    .against('Bath', 'W', 3.5, 'vanity')
    .against('Bath', 'S', 2, 'toilet')
    // Office
    .against('Office', 'E', 5, 'desk', { rotation: 90 })
    .against('Office', 'W', 5, 'bookshelf')
    // Landing
    .against('Landing', 'E', 12.5, 'plant')
    .against('Landing', 'S', 9.5, 'bookshelf')

  return finish(p, [g.level, up.level])
}

function blank(): Project {
  return makeProject('Untitled home')
}

export interface TemplateInfo {
  id: string
  name: string
  blurb: string
  build: () => Project
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'family', name: 'Two-storey family home', blurb: '3 bed · 2.5 bath · garage · 2,800 sq ft', build: familyHome },
  { id: 'studio', name: 'Studio apartment', blurb: '1 room · bath · galley kitchen · 660 sq ft', build: studio },
  { id: 'blank', name: 'Blank plot', blurb: 'Start from nothing', build: blank },
]

export function buildTemplate(id: string): Project {
  return (TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]).build()
}
