/** Roof coverings and the plain arithmetic behind roof area. */
import type { Level, RoofMaterial } from './types'
import { CM2_PER_FT2 } from './units'

export interface RoofMaterialInfo {
  id: RoofMaterial
  name: string
  /** Installed US ballpark, per square foot of roof surface. */
  pricePerSqFt: number
}

export const ROOF_MATERIALS: RoofMaterialInfo[] = [
  { id: 'shingle', name: 'Asphalt shingle', pricePerSqFt: 5 },
  { id: 'metal', name: 'Standing-seam metal', pricePerSqFt: 11 },
  { id: 'tile', name: 'Clay tile', pricePerSqFt: 15 },
  { id: 'slate', name: 'Slate', pricePerSqFt: 20 },
  { id: 'membrane', name: 'Flat membrane', pricePerSqFt: 7 },
]

export const ROOF_MATERIAL_BY_ID = Object.fromEntries(ROOF_MATERIALS.map((m) => [m.id, m])) as Record<RoofMaterial, RoofMaterialInfo>

export function roofMaterialOf(level: Level): RoofMaterial {
  return level.roof.material ?? (level.roof.style === 'flat' ? 'membrane' : 'shingle')
}

/** The rectangle the roof covers: the walls' bounding box plus the overhang. */
export function roofFootprint(level: Level): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (level.roof.style === 'none' || level.walls.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const w of level.walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  const o = level.roof.overhang
  return { minX: minX - o, minY: minY - o, maxX: maxX + o, maxY: maxY + o }
}

/**
 * Sloped surface area in cm². Every plane of a gable, hip or shed roof here
 * has the same pitch, so the surface is the footprint times sqrt(1 + pitch²).
 */
export function roofArea(level: Level): number {
  const f = roofFootprint(level)
  if (!f) return 0
  const plan = (f.maxX - f.minX) * (f.maxY - f.minY)
  return level.roof.style === 'flat' ? plan : plan * Math.sqrt(1 + level.roof.pitch * level.roof.pitch)
}

/** Roofing is sold in "squares" of 100 sq ft. */
export function roofSquares(cm2: number): number {
  return cm2 / CM2_PER_FT2 / 100
}
