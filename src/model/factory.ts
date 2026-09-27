import type { Item, Label, Level, Opening, OpeningKind, Project, Room, Roof, Vec2, Wall } from './types'
import { catalogEntry } from './catalog'

let counter = 0
export function uid(prefix = 'x'): string {
  counter = (counter + 1) % 1e6
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`
}

export const DEFAULTS = {
  wallThickness: 12,
  exteriorThickness: 20,
  wallHeight: 270,
  wallColor: '#F4F2EC',
  exteriorColor: '#CFC8BB',
}

export function defaultRoof(): Roof {
  return { style: 'none', pitch: 0.5, overhang: 40, color: '#4A4E52', ridgeAlongLong: true }
}

export function makeLevel(name: string, elevation: number, height = DEFAULTS.wallHeight): Level {
  return {
    id: uid('lvl'),
    name,
    elevation,
    height,
    slab: 25,
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    labels: [],
    roof: defaultRoof(),
  }
}

export function makeProject(name = 'My home', units: Project['units'] = 'imperial'): Project {
  const now = Date.now()
  return {
    version: 1,
    id: uid('prj'),
    name,
    units,
    levels: [makeLevel('Ground floor', 0)],
    site: { showGround: true, groundColor: '#8DA870', northAngle: 0 },
    defaults: {
      wallThickness: DEFAULTS.wallThickness,
      wallHeight: DEFAULTS.wallHeight,
      wallColor: DEFAULTS.wallColor,
      exteriorColor: DEFAULTS.exteriorColor,
    },
    prices: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function makeWall(a: Vec2, b: Vec2, opts: Partial<Wall> = {}): Wall {
  return {
    id: uid('w'),
    a: { ...a },
    b: { ...b },
    thickness: DEFAULTS.wallThickness,
    height: DEFAULTS.wallHeight,
    colorA: DEFAULTS.wallColor,
    colorB: DEFAULTS.wallColor,
    ...opts,
  }
}

export const OPENING_PRESETS: Record<OpeningKind, { width: number; height: number; sill: number; label: string }> = {
  door: { width: 81, height: 203, sill: 0, label: 'Door' },
  'double-door': { width: 152, height: 203, sill: 0, label: 'Double door' },
  slider: { width: 183, height: 203, sill: 0, label: 'Sliding door' },
  opening: { width: 91, height: 213, sill: 0, label: 'Open archway' },
  garage: { width: 488, height: 213, sill: 0, label: 'Garage door' },
  window: { width: 91, height: 122, sill: 91, label: 'Window' },
}

export function makeOpening(wallId: string, kind: OpeningKind, offset: number, opts: Partial<Opening> = {}): Opening {
  const p = OPENING_PRESETS[kind]
  return {
    id: uid('o'),
    wallId,
    kind,
    offset,
    width: p.width,
    height: p.height,
    sill: p.sill,
    hinge: 'start',
    swing: 'A',
    frameColor: kind === 'garage' ? '#E9E7E2' : '#FFFFFF',
    ...opts,
  }
}

export function makeRoom(points: Vec2[], opts: Partial<Room> = {}): Room {
  return {
    id: uid('r'),
    name: 'Room',
    points: points.map((p) => ({ ...p })),
    floor: 'oak',
    ceilingColor: '#FAFAF7',
    showCeiling: true,
    ...opts,
  }
}

export function makeItem(type: string, at: Vec2, opts: Partial<Item> = {}): Item {
  const c = catalogEntry(type)
  return {
    id: uid('i'),
    type,
    x: at.x,
    y: at.y,
    rotation: 0,
    width: c.w,
    depth: c.d,
    height: c.h,
    elevation: c.elevation ?? 0,
    color: c.color,
    color2: c.color2,
    ...opts,
  }
}

export function makeLabel(text: string, at: Vec2): Label {
  return { id: uid('t'), text, x: at.x, y: at.y, size: 16 }
}
