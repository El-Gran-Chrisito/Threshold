/**
 * Plan library: ready-made homes to start from, each a furnished plan from
 * a brief with a whole-home style applied. The first few are free; the rest
 * are part of Pro.
 */
import type { Project } from './types'
import { planFromBrief, type Brief } from './brief'
import { applyHomeStyle } from './styles'
import { uid } from './factory'

export interface LibraryPlan {
  id: string
  name: string
  /** Who it suits, in a few words. */
  for: string
  brief: Brief
  style: string
  pro: boolean
}

export const LIBRARY: LibraryPlan[] = [
  { id: 'cottage', name: 'Scandinavian cottage', for: 'A couple or a first home', brief: { bedrooms: 2, bathrooms: 1, storeys: 1, garage: 0, office: false, openPlan: true }, style: 'scandi', pro: false },
  { id: 'starter', name: 'Starter ranch', for: 'A young family on a budget', brief: { bedrooms: 3, bathrooms: 2, storeys: 1, garage: 1, office: false, openPlan: true }, style: 'traditional', pro: false },
  { id: 'farmhouse', name: 'Modern farmhouse', for: 'A family that works from home', brief: { bedrooms: 4, bathrooms: 2.5, storeys: 2, garage: 2, office: true, openPlan: true }, style: 'farmhouse', pro: true },
  { id: 'midcentury', name: 'Mid-century ranch', for: 'Single-level living', brief: { bedrooms: 3, bathrooms: 2, storeys: 1, garage: 2, office: false, openPlan: true }, style: 'midcentury', pro: true },
  { id: 'coastal', name: 'Coastal two-storey', for: 'A holiday or beach home', brief: { bedrooms: 3, bathrooms: 2.5, storeys: 2, garage: 0, office: false, openPlan: true }, style: 'coastal', pro: true },
  { id: 'loft', name: 'Urban loft house', for: 'City living with a studio', brief: { bedrooms: 2, bathrooms: 1.5, storeys: 2, garage: 1, office: true, openPlan: true }, style: 'industrial', pro: true },
  { id: 'bungalow', name: 'Work-from-home bungalow', for: 'Two people who both need an office', brief: { bedrooms: 2, bathrooms: 2, storeys: 1, garage: 1, office: true, openPlan: false }, style: 'scandi', pro: true },
  { id: 'large-family', name: 'Large family home', for: 'Five bedrooms and room to grow', brief: { bedrooms: 5, bathrooms: 3.5, storeys: 2, garage: 2, office: true, openPlan: true }, style: 'traditional', pro: true },
]

export function libraryBlurb(l: LibraryPlan): string {
  const b = l.brief
  return [`${b.bedrooms} bed`, `${b.bathrooms} bath`, b.storeys === 2 ? '2 storeys' : '1 storey', b.garage ? `${b.garage}-car garage` : '', b.office ? 'office' : ''].filter(Boolean).join(' · ')
}

export function buildLibraryPlan(id: string): Project {
  const l = LIBRARY.find((x) => x.id === id) ?? LIBRARY[0]
  const p = applyHomeStyle(planFromBrief(l.brief), l.style)
  return { ...p, id: uid('prj'), name: l.name, updatedAt: Date.now() }
}
