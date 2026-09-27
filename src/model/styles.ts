/**
 * Whole-home styles. One click restyles every room by what the room is for,
 * plus trim, doors, window frames, outside walls, roof, cabinets and the wood
 * and fabric on furniture. Layout is never touched, and it is one undo step.
 */
import type { Level, Project, RoofMaterial, WallFinish } from './types'
import { catalogEntry } from './catalog'
import { floorMaterial } from './materials'
import { paintExterior, paintRoomWalls } from './ops'

export type RoomKind = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'utility' | 'garage'

export interface HomeStyle {
  id: string
  name: string
  blurb: string
  walls: Record<RoomKind, string>
  floors: Record<RoomKind, string>
  trim: string
  door: string
  frame: string
  exterior: { finish: WallFinish; color: string }
  roof: { material: RoofMaterial; color: string }
  wood: string
  fabric: string
  cabinet: string
  island: string
  counter: string
}

export const HOME_STYLES: HomeStyle[] = [
  {
    id: 'farmhouse',
    name: 'Modern farmhouse',
    blurb: 'White walls, oak floors, black windows, metal roof',
    walls: { living: '#F4F2EC', bedroom: '#EDE6D8', kitchen: '#F4F2EC', bath: '#FAFAF7', utility: '#F4F2EC', garage: '#E4E1DA' },
    floors: { living: 'oak', bedroom: 'oak', kitchen: 'oak', bath: 'hex', utility: 'tile-grey', garage: 'concrete' },
    trim: '#F7F7F4',
    door: '#F4F2EC',
    frame: '#2A2B2D',
    exterior: { finish: 'siding', color: '#F4F2EC' },
    roof: { material: 'metal', color: '#232427' },
    wood: '#C29A6B',
    fabric: '#D9CFBE',
    cabinet: '#F1F0EC',
    island: '#27394F',
    counter: '#E4E1DA',
  },
  {
    id: 'scandi',
    name: 'Scandinavian',
    blurb: 'Pale ash, soft whites, light fabrics, calm blues',
    walls: { living: '#FAFAF7', bedroom: '#C9D6DE', kitchen: '#FAFAF7', bath: '#FAFAF7', utility: '#FAFAF7', garage: '#E4E1DA' },
    floors: { living: 'ash', bedroom: 'ash', kitchen: 'ash', bath: 'tile-white', utility: 'tile-white', garage: 'concrete' },
    trim: '#FAFAF7',
    door: '#FAFAF7',
    frame: '#FAFAF7',
    exterior: { finish: 'wood', color: '#C8B79A' },
    roof: { material: 'slate', color: '#5B6168' },
    wood: '#DCC9A8',
    fabric: '#CFC8BB',
    cabinet: '#FAFAF7',
    island: '#DCC9A8',
    counter: '#F1F0EC',
  },
  {
    id: 'midcentury',
    name: 'Mid-century modern',
    blurb: 'Walnut, warm linen walls, mustard and olive accents',
    walls: { living: '#EDE6D8', bedroom: '#B3BFA6', kitchen: '#EDE6D8', bath: '#F1E3A9', utility: '#EDE6D8', garage: '#E4E1DA' },
    floors: { living: 'walnut', bedroom: 'walnut', kitchen: 'terrazzo', bath: 'terrazzo', utility: 'terrazzo', garage: 'concrete' },
    trim: '#EDE6D8',
    door: '#6A4630',
    frame: '#2A2B2D',
    exterior: { finish: 'wood', color: '#6A4630' },
    roof: { material: 'shingle', color: '#3E4246' },
    wood: '#6A4630',
    fabric: '#C99A2E',
    cabinet: '#6A4630',
    island: '#7D7F57',
    counter: '#F1F0EC',
  },
  {
    id: 'industrial',
    name: 'Industrial loft',
    blurb: 'Concrete floors, brick, black steel, leather',
    walls: { living: '#8D8F8C', bedroom: '#B4AEA3', kitchen: '#CFC8BB', bath: '#4A4E52', utility: '#B4AEA3', garage: '#B4AEA3' },
    floors: { living: 'concrete', bedroom: 'greywood', kitchen: 'concrete', bath: 'tile-black', utility: 'concrete', garage: 'concrete' },
    trim: '#2A2B2D',
    door: '#2A2B2D',
    frame: '#2A2B2D',
    exterior: { finish: 'brick', color: '#8E3B2E' },
    roof: { material: 'metal', color: '#232427' },
    wood: '#6A4630',
    fabric: '#8A5A36',
    cabinet: '#2A2B2D',
    island: '#6A4630',
    counter: '#B4B2AD',
  },
  {
    id: 'coastal',
    name: 'Coastal',
    blurb: 'Airy blues, whitewashed wood, sandy tones',
    walls: { living: '#FAFAF7', bedroom: '#C9D6DE', kitchen: '#FAFAF7', bath: '#C9D6DE', utility: '#FAFAF7', garage: '#E4E1DA' },
    floors: { living: 'greywood', bedroom: 'carpet-oat', kitchen: 'greywood', bath: 'hex', utility: 'tile-white', garage: 'concrete' },
    trim: '#FAFAF7',
    door: '#FAFAF7',
    frame: '#FAFAF7',
    exterior: { finish: 'shingle', color: '#B4AEA3' },
    roof: { material: 'shingle', color: '#8C8173' },
    wood: '#DCC9A8',
    fabric: '#F1F0EC',
    cabinet: '#FAFAF7',
    island: '#6F8FA6',
    counter: '#F1F0EC',
  },
  {
    id: 'traditional',
    name: 'Classic traditional',
    blurb: 'Greige walls, parquet and marble, deep blue velvet',
    walls: { living: '#CFC8BB', bedroom: '#E9D2C9', kitchen: '#EDE6D8', bath: '#FAFAF7', utility: '#EDE6D8', garage: '#E4E1DA' },
    floors: { living: 'parquet', bedroom: 'carpet-oat', kitchen: 'tile-white', bath: 'marble', utility: 'tile-white', garage: 'concrete' },
    trim: '#F7F7F4',
    door: '#F7F7F4',
    frame: '#F7F7F4',
    exterior: { finish: 'brick', color: '#A45B44' },
    roof: { material: 'shingle', color: '#3E4246' },
    wood: '#6A4630',
    fabric: '#2E4A6B',
    cabinet: '#F1F0EC',
    island: '#2F4A3A',
    counter: '#EEEDEA',
  },
]

export function roomKind(name: string): RoomKind {
  const n = name.toLowerCase()
  if (/bath|powder|wc|toilet|ensuite|en-suite|shower/.test(n)) return 'bath'
  if (/garage|carport|workshop/.test(n)) return 'garage'
  if (/laundry|utility|mud|closet|storage|mechanical|pantry|wardrobe/.test(n)) return 'utility'
  if (/kitchen|dining|breakfast/.test(n)) return 'kitchen'
  if (/bed|nursery|guest|kid/.test(n)) return 'bedroom'
  return 'living'
}

// Which catalog colour slots are wood and which are fabric, by their default value.
const WOODS = new Set(['#C29A6B', '#6A4630'])
const FABRICS = new Set(['#D9CFBE', '#4D5055', '#8A5A36'])
const CABINETS = new Set(['base-cabinet', 'wall-cabinet', 'tall-cabinet'])

function styleLevel(level: Level, s: HomeStyle): Level {
  let l = level
  for (const r of level.rooms) {
    if (floorMaterial(r.floor).outdoor) continue
    const kind = roomKind(r.name)
    l = paintRoomWalls(l, r.id, s.walls[kind], 'paint')
  }
  l = {
    ...l,
    rooms: l.rooms.map((r) => (floorMaterial(r.floor).outdoor ? r : { ...r, floor: s.floors[roomKind(r.name)], floorColor: undefined })),
  }
  if (l.walls.length) l = paintExterior(l, s.exterior.color, undefined, s.exterior.finish)
  if (l.roof.style !== 'none') {
    const material = l.roof.style === 'flat' && s.roof.material !== 'metal' ? 'membrane' : s.roof.material
    l = { ...l, roof: { ...l.roof, material, color: s.roof.color } }
  }
  l = {
    ...l,
    openings: l.openings.map((o) => {
      if (o.kind === 'garage') return o
      if (o.kind === 'window' || o.kind === 'slider') return { ...o, frameColor: s.frame }
      return { ...o, frameColor: s.trim, leafColor: s.door }
    }),
    items: l.items.map((i) => {
      const c = catalogEntry(i.type)
      if (CABINETS.has(c.shape)) return { ...i, color: s.cabinet, ...(c.shape === 'base-cabinet' ? { color2: s.counter } : {}) }
      if (c.shape === 'island') return { ...i, color: s.island, color2: s.counter }
      const pick = (def: string, cur: string) => (WOODS.has(def) ? s.wood : FABRICS.has(def) ? s.fabric : cur)
      return { ...i, color: pick(c.color, i.color), color2: pick(c.color2, i.color2) }
    }),
  }
  return l
}

export function applyHomeStyle(p: Project, styleId: string): Project {
  const s = HOME_STYLES.find((x) => x.id === styleId)
  if (!s) return p
  return {
    ...p,
    levels: p.levels.map((l) => styleLevel(l, s)),
    defaults: { ...p.defaults, trimColor: s.trim, exteriorColor: s.exterior.color, wallColor: s.walls.living },
  }
}
