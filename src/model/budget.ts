import type { OpeningKind, Project } from './types'
import { catalogEntry } from './catalog'
import { floorMaterial, PAINT_PRICE_PER_SQFT, WALL_BUILD_PRICE_PER_SQFT } from './materials'
import { roomArea, wallLength } from './ops'
import { CM2_PER_FT2 } from './units'

export const OPENING_PRICES: Record<OpeningKind, number> = {
  door: 450,
  'double-door': 1400,
  slider: 2400,
  opening: 250,
  window: 700,
  garage: 2200,
}

export interface BudgetLine {
  group: 'Flooring' | 'Walls & paint' | 'Doors & windows' | 'Furniture & fixtures'
  label: string
  qty: string
  cost: number
}

export function budget(p: Project): { lines: BudgetLine[]; total: number; byGroup: Record<string, number> } {
  const lines: BudgetLine[] = []
  for (const l of p.levels) {
    for (const r of l.rooms) {
      const fm = floorMaterial(r.floor)
      const sqft = roomArea(r) / CM2_PER_FT2
      const price = p.prices[fm.id] ?? fm.pricePerSqFt
      lines.push({ group: 'Flooring', label: `${r.name} · ${fm.name}`, qty: `${Math.round(sqft)} sq ft × $${price}`, cost: sqft * price })
    }
    let wallSqft = 0
    for (const w of l.walls) {
      const a = (wallLength(w) * w.height) / CM2_PER_FT2
      const holes = l.openings.filter((o) => o.wallId === w.id).reduce((s, o) => s + (o.width * o.height) / CM2_PER_FT2, 0)
      wallSqft += Math.max(0, a - holes)
    }
    if (wallSqft > 0) {
      const build = p.prices['wall-build'] ?? WALL_BUILD_PRICE_PER_SQFT
      const paint = p.prices['paint'] ?? PAINT_PRICE_PER_SQFT
      lines.push({ group: 'Walls & paint', label: `${l.name} · framing & drywall`, qty: `${Math.round(wallSqft)} sq ft × $${build}`, cost: wallSqft * build })
      lines.push({ group: 'Walls & paint', label: `${l.name} · paint, both sides`, qty: `${Math.round(wallSqft * 2)} sq ft × $${paint}`, cost: wallSqft * 2 * paint })
    }
    const openingCounts = new Map<OpeningKind, number>()
    for (const o of l.openings) openingCounts.set(o.kind, (openingCounts.get(o.kind) ?? 0) + 1)
    for (const [kind, n] of openingCounts) {
      const price = p.prices[`opening-${kind}`] ?? OPENING_PRICES[kind]
      lines.push({ group: 'Doors & windows', label: `${l.name} · ${kind.replace('-', ' ')}`, qty: `${n} × $${price}`, cost: n * price })
    }
    const itemCounts = new Map<string, number>()
    for (const i of l.items) itemCounts.set(i.type, (itemCounts.get(i.type) ?? 0) + 1)
    for (const [type, n] of itemCounts) {
      const c = catalogEntry(type)
      const price = p.prices[type] ?? c.price
      if (price <= 0) continue
      lines.push({ group: 'Furniture & fixtures', label: `${l.name} · ${c.name}`, qty: `${n} × $${price.toLocaleString()}`, cost: n * price })
    }
  }
  const byGroup: Record<string, number> = {}
  for (const line of lines) byGroup[line.group] = (byGroup[line.group] ?? 0) + line.cost
  return { lines, total: lines.reduce((s, x) => s + x.cost, 0), byGroup }
}
