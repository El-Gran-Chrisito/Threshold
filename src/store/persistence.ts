import type { Project } from '../model/types'
import { defaultRoof } from '../model/factory'

const INDEX = 'threshold:index'
const LAST = 'threshold:last'
const key = (id: string) => `threshold:p:${id}`

export interface SavedMeta {
  id: string
  name: string
  updatedAt: number
}

function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v))
    return true
  } catch {
    return false
  }
}

export function listSaved(): SavedMeta[] {
  return (read<SavedMeta[]>(INDEX) ?? []).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveProject(p: Project): boolean {
  if (!write(key(p.id), p)) return false
  const idx = listSaved().filter((m) => m.id !== p.id)
  idx.unshift({ id: p.id, name: p.name, updatedAt: p.updatedAt })
  write(INDEX, idx)
  write(LAST, p.id)
  return true
}

export function loadSaved(id: string): Project | null {
  const p = read<unknown>(key(id))
  return p ? normalizeProject(p) : null
}

export function deleteSaved(id: string) {
  try {
    localStorage.removeItem(key(id))
  } catch {
    /* storage unavailable */
  }
  write(
    INDEX,
    listSaved().filter((m) => m.id !== id),
  )
}

export function loadLastProject(): Project | null {
  const id = read<string>(LAST)
  return id ? loadSaved(id) : null
}

/** Validate and fill defaults for a project loaded from storage or a file. Throws on garbage. */
export function normalizeProject(raw: unknown): Project {
  const p = raw as Partial<Project>
  if (!p || typeof p !== 'object' || !Array.isArray(p.levels) || p.levels.length === 0) {
    throw new Error('This file is not a Threshold home design.')
  }
  return {
    version: 1,
    id: typeof p.id === 'string' ? p.id : `prj_${Date.now().toString(36)}`,
    name: typeof p.name === 'string' ? p.name : 'Imported home',
    units: p.units === 'metric' ? 'metric' : 'imperial',
    site: { showGround: true, groundColor: '#8DA870', northAngle: 0, ...(p.site ?? {}) },
    defaults: { wallThickness: 12, wallHeight: 270, wallColor: '#F4F2EC', exteriorColor: '#CFC8BB', ...(p.defaults ?? {}) },
    prices: p.prices ?? {},
    ...(typeof p.client === 'string' && p.client.trim() ? { client: p.client.slice(0, 120) } : {}),
    createdAt: p.createdAt ?? Date.now(),
    updatedAt: p.updatedAt ?? Date.now(),
    levels: p.levels.map((l) => ({
      ...l,
      slab: l.slab ?? 25,
      labels: l.labels ?? [],
      walls: l.walls ?? [],
      openings: l.openings ?? [],
      rooms: l.rooms ?? [],
      items: l.items ?? [],
      roof: { ...defaultRoof(), ...(l.roof ?? {}) },
    })),
  }
}
