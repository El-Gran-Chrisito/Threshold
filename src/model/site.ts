/** The lot: property lines, setbacks and the checks that go with them. */
import type { Level, Lot, Project } from './types'
import type { Issue } from './checks'
import { catalogEntry } from './catalog'
import { levelBounds } from './ops'
import { CM_PER_FT } from './units'

const FT5 = 5 * CM_PER_FT

/** A lot around the current house: room on every side, rounded to 5 ft. */
export function defaultLot(p: Project): Lot {
  const all = p.levels.map(levelBounds).filter(Boolean) as NonNullable<ReturnType<typeof levelBounds>>[]
  const b = all.length
    ? { minX: Math.min(...all.map((x) => x.minX)), minY: Math.min(...all.map((x) => x.minY)), maxX: Math.max(...all.map((x) => x.maxX)), maxY: Math.max(...all.map((x) => x.maxY)) }
    : { minX: 0, minY: 0, maxX: 40 * CM_PER_FT, maxY: 30 * CM_PER_FT }
  const side = 10 * CM_PER_FT
  const front = 30 * CM_PER_FT
  const rear = 30 * CM_PER_FT
  const w = Math.ceil((b.maxX - b.minX + side * 2) / FT5) * FT5
  const d = Math.ceil((b.maxY - b.minY + front + rear) / FT5) * FT5
  return {
    x: Math.round((b.minX + b.maxX) / 2 - w / 2),
    y: Math.round(b.minY - rear - (d - (b.maxY - b.minY + front + rear)) / 2),
    w,
    d,
    front: 20 * CM_PER_FT,
    side: 5 * CM_PER_FT,
    rear: 15 * CM_PER_FT,
  }
}

/** The area the house must stay inside. */
export function buildable(lot: Lot) {
  return { minX: lot.x + lot.side, maxX: lot.x + lot.w - lot.side, minY: lot.y + lot.rear, maxY: lot.y + lot.d - lot.front }
}

export function lotIssues(lot: Lot | undefined, level: Level): Issue[] {
  if (!lot) return []
  const issues: Issue[] = []
  const pts = level.walls.flatMap((w) => [w.a, w.b])
  const inLot = (p: { x: number; y: number }) => p.x >= lot.x - 0.5 && p.x <= lot.x + lot.w + 0.5 && p.y >= lot.y - 0.5 && p.y <= lot.y + lot.d + 0.5
  const outside = level.walls.find((w) => !inLot(w.a) || !inLot(w.b))
  if (outside) {
    issues.push({ level: 'problem', text: 'The house goes past the property line', select: { kind: 'wall', id: outside.id } })
  } else if (pts.length) {
    const b = buildable(lot)
    const tol = 0.5
    const edges: Array<[string, (p: { x: number; y: number }) => boolean]> = [
      ['front', (p) => p.y > b.maxY + tol],
      ['rear', (p) => p.y < b.minY - tol],
      ['side', (p) => p.x < b.minX - tol || p.x > b.maxX + tol],
    ]
    for (const [name, bad] of edges) {
      const w = level.walls.find((x) => bad(x.a) || bad(x.b))
      if (w) issues.push({ level: 'problem', text: `Walls are inside the ${name} setback`, select: { kind: 'wall', id: w.id } })
    }
  }
  for (const i of level.items) {
    if (catalogEntry(i.type).category !== 'Outdoor') continue
    if (!inLot(i)) issues.push({ level: 'tip', text: `${i.name || catalogEntry(i.type).name} is outside the lot`, select: { kind: 'item', id: i.id } })
  }
  return issues
}
