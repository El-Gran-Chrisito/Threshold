/**
 * Shopping list: the quantities a person takes to a store or hands to a
 * contractor. Paint in cans, flooring and wall finishes with cutting waste,
 * baseboard in running length, and every door, window and piece of furniture.
 */
import type { Level, Opening, Project, Room, UnitSystem } from './types'
import { catalogEntry } from './catalog'
import { FINISHES, floorMaterial, PAINTS, WALL_FINISH_BY_ID } from './materials'
import { exteriorSides, roomArea, roomWallSides, wallLength } from './ops'
import { pointInPolygon, polygonPerimeter } from './geometry'
import { CM2_PER_FT2, CM_PER_FT, formatLength } from './units'

export type TakeoffGroup = 'Paint' | 'Wall finishes' | 'Flooring' | 'Trim' | 'Doors & windows' | 'Furniture & fixtures'

export const TAKEOFF_GROUPS: TakeoffGroup[] = ['Paint', 'Flooring', 'Wall finishes', 'Trim', 'Doors & windows', 'Furniture & fixtures']

export interface TakeoffLine {
  group: TakeoffGroup
  item: string
  /** Amount to buy, in the project's units. */
  qty: string
  /** Size, colour or how the amount was worked out. */
  detail: string
  /** Rooms or floors it is for. */
  where: string
}

const SWATCH_NAMES = new Map([...PAINTS, ...FINISHES].map((s) => [s.hex.toUpperCase(), s.name]))

export function colorName(hex: string): string {
  return SWATCH_NAMES.get(hex.toUpperCase()) ?? hex.toUpperCase()
}

/** Two coats. About 350 sq ft per US gallon, or 10 m² per litre, per coat. */
export function paintAmount(cm2: number, units: UnitSystem): string {
  if (units === 'metric') {
    const litres = Math.max(1, Math.ceil(((cm2 / 10000) * 2) / 10))
    return `${litres} L`
  }
  const gallons = ((cm2 / CM2_PER_FT2) * 2) / 350
  if (gallons <= 0.25) return '1 quart'
  return `${Math.ceil(gallons)} gal`
}

function area(cm2: number, units: UnitSystem): string {
  if (units === 'metric') return `${Math.ceil(cm2 / 10000)} m²`
  return `${Math.ceil(cm2 / CM2_PER_FT2).toLocaleString()} sq ft`
}

function list(names: Iterable<string>): string {
  const u = [...new Set(names)]
  return u.length > 4 ? `${u.slice(0, 4).join(', ')} +${u.length - 4} more` : u.join(', ')
}

/** Tiles and patterned floors waste more in cutting than planks or carpet. */
function floorWaste(pattern: string): number {
  return pattern === 'tiles' || pattern === 'hex' || pattern === 'marble' || pattern === 'parquet' || pattern === 'terrazzo' ? 0.15 : 0.1
}

const isIndoor = (r: Room) => !floorMaterial(r.floor).outdoor

function openingArea(level: Level, wallId: string): number {
  return level.openings.filter((o) => o.wallId === wallId).reduce((s, o) => s + o.width * o.height, 0)
}

function openingLabel(o: Opening, units: UnitSystem): string {
  const kind = { door: 'Door', 'double-door': 'Double door', slider: 'Sliding door', opening: 'Archway', window: 'Window', garage: 'Garage door' }[o.kind]
  const style = o.style ? ` · ${o.style}` : ''
  return `${kind}${style}|${formatLength(o.width, units)} × ${formatLength(o.height, units)}`
}

export function takeoff(p: Project): TakeoffLine[] {
  const units = p.units
  const lines: TakeoffLine[] = []

  // Paint and other wall finishes, per side, grouped by colour.
  const paint = new Map<string, { cm2: number; where: string[] }>()
  const finishes = new Map<string, { cm2: number; where: string[] }>()
  const addTo = (m: Map<string, { cm2: number; where: string[] }>, key: string, cm2: number, where: string) => {
    const e = m.get(key) ?? { cm2: 0, where: [] }
    e.cm2 += cm2
    e.where.push(where)
    m.set(key, e)
  }
  for (const l of p.levels) {
    const seen = new Set<string>()
    const side = (wallId: string, s: 'A' | 'B', where: string, outside: boolean) => {
      const k = `${wallId}:${s}`
      if (seen.has(k)) return
      seen.add(k)
      const w = l.walls.find((x) => x.id === wallId)!
      const net = Math.max(0, wallLength(w) * w.height - openingArea(l, w.id))
      if (net <= 0) return
      const finish = (s === 'A' ? w.finishA : w.finishB) ?? 'paint'
      const color = s === 'A' ? w.colorA : w.colorB
      const place = outside ? 'Exterior' : 'Interior'
      if (finish === 'paint') addTo(paint, `${place} walls|${color}`, net, where)
      else addTo(finishes, `${finish}|${color}`, net, where)
    }
    for (const r of l.rooms) {
      if (!isIndoor(r)) continue
      for (const s of roomWallSides(l, r)) side(s.wall.id, s.side, r.name, false)
      if (r.showCeiling !== false) addTo(paint, `Ceilings|${r.ceilingColor}`, roomArea(r), r.name)
    }
    for (const s of exteriorSides(l)) side(s.wall.id, s.side, `${l.name} outside`, true)
  }
  for (const [key, e] of paint) {
    const [surface, color] = key.split('|')
    lines.push({ group: 'Paint', item: colorName(color), qty: paintAmount(e.cm2, units), detail: `${surface} · ${area(e.cm2, units)}, 2 coats`, where: list(e.where) })
  }
  for (const [key, e] of finishes) {
    const [finish, color] = key.split('|')
    const info = WALL_FINISH_BY_ID[finish]
    const buy = e.cm2 * 1.1
    let qty = area(buy, units)
    if (finish === 'wallpaper') {
      // A US double roll covers about 56 sq ft; a European roll about 5 m².
      qty = units === 'metric' ? `${Math.ceil(buy / 10000 / 5)} rolls` : `${Math.ceil(buy / CM2_PER_FT2 / 56)} double rolls`
    }
    lines.push({ group: 'Wall finishes', item: info?.name ?? finish, qty, detail: `${colorName(color)} · ${area(e.cm2, units)} + 10% waste`, where: list(e.where) })
  }

  // Flooring by material.
  const floors = new Map<string, { cm2: number; where: string[] }>()
  for (const l of p.levels) for (const r of l.rooms) addTo(floors, r.floor, roomArea(r), r.name)
  for (const [id, e] of floors) {
    const fm = floorMaterial(id)
    const waste = fm.outdoor ? 0.05 : floorWaste(fm.pattern)
    lines.push({ group: 'Flooring', item: fm.name, qty: area(e.cm2 * (1 + waste), units), detail: `${area(e.cm2, units)} + ${Math.round(waste * 100)}% waste`, where: list(e.where) })
  }

  // Baseboard: indoor room edges, less door and archway widths.
  if (p.defaults.baseboards !== false) {
    let run = 0
    const where: string[] = []
    for (const l of p.levels) {
      for (const r of l.rooms) {
        if (!isIndoor(r)) continue
        const walls = new Set(roomWallSides(l, r).map((s) => s.wall.id))
        const gaps = l.openings.filter((o) => walls.has(o.wallId) && o.kind !== 'window').reduce((s, o) => s + o.width, 0)
        run += Math.max(0, polygonPerimeter(r.points) - gaps)
        where.push(r.name)
      }
    }
    if (run > 0) {
      const buy = run * 1.1
      const board = units === 'metric' ? 240 : 16 * CM_PER_FT
      const count = Math.ceil(buy / board)
      lines.push({
        group: 'Trim',
        item: 'Baseboard',
        qty: units === 'metric' ? `${count} × 2.4 m` : `${count} × 16'`,
        detail: `${colorName(p.defaults.trimColor ?? '#F7F7F4')} · ${formatLength(run, units)} + 10% waste`,
        where: list(where),
      })
    }
  }

  // Doors and windows by type and size.
  const ops = new Map<string, { n: number; where: string[] }>()
  for (const l of p.levels) {
    for (const o of l.openings) {
      const k = openingLabel(o, units)
      const e = ops.get(k) ?? { n: 0, where: [] }
      e.n++
      e.where.push(l.name)
      ops.set(k, e)
    }
  }
  for (const [k, e] of [...ops].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [item, size] = k.split('|')
    lines.push({ group: 'Doors & windows', item, qty: `${e.n}`, detail: size, where: list(e.where) })
  }

  // Furniture and fixtures by type, size and colour.
  const items = new Map<string, { n: number; where: string[]; name: string; size: string; color: string }>()
  for (const l of p.levels) {
    for (const i of l.items) {
      const c = catalogEntry(i.type)
      const name = i.name || c.name
      const size = `${formatLength(i.width, units, { compact: true })} × ${formatLength(i.depth, units, { compact: true })} × ${formatLength(i.height, units, { compact: true })}`
      const k = `${name}|${size}|${i.color}`
      const room = l.rooms.find((r) => pointInPolygon(i, r.points))
      const e = items.get(k) ?? { n: 0, where: [], name, size, color: i.color }
      e.n++
      e.where.push(room?.name ?? l.name)
      items.set(k, e)
    }
  }
  for (const e of [...items.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push({ group: 'Furniture & fixtures', item: e.name, qty: `${e.n}`, detail: `${e.size} · ${colorName(e.color)}`, where: list(e.where) })
  }

  return lines
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function takeoffCsv(lines: TakeoffLine[]): string {
  const rows = [['Group', 'Item', 'Buy', 'Details', 'For'], ...lines.map((l) => [l.group, l.item, l.qty, l.detail, l.where])]
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}

export function takeoffText(title: string, lines: TakeoffLine[]): string {
  const out = [`${title} — shopping list`, '']
  for (const g of TAKEOFF_GROUPS) {
    const ls = lines.filter((l) => l.group === g)
    if (!ls.length) continue
    out.push(g.toUpperCase())
    for (const l of ls) out.push(`- ${l.item}: ${l.qty} (${l.detail}) — ${l.where}`)
    out.push('')
  }
  return out.join('\n')
}
