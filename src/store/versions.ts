/**
 * Versions of one design: named snapshots kept in this browser, so a person
 * can try an idea and go back. Restoring is an ordinary, undoable edit.
 */
import type { Project } from '../model/types'
import { normalizeProject } from './persistence'

export interface Version {
  id: string
  name: string
  at: number
  json: string
}

export const MAX_VERSIONS = 20
const key = (projectId: string) => `threshold:versions:${projectId}`

export function listVersions(projectId: string): Version[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(projectId)) ?? '[]') as Version[]
    return Array.isArray(v) ? v.sort((a, b) => b.at - a.at) : []
  } catch {
    return []
  }
}

function write(projectId: string, list: Version[]): boolean {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Keep a snapshot. The oldest goes when there are too many. Returns null when the browser is out of room. */
export function saveVersion(p: Project, name: string, now = Date.now()): Version | null {
  const v: Version = { id: `v_${now.toString(36)}`, name: name.trim().slice(0, 80) || 'Version', at: now, json: JSON.stringify(p) }
  const list = [v, ...listVersions(p.id)].slice(0, MAX_VERSIONS)
  return write(p.id, list) ? v : null
}

/** The design as it was, under the current design's id so it replaces the open design in place. */
export function versionProject(projectId: string, versionId: string): Project | null {
  const v = listVersions(projectId).find((x) => x.id === versionId)
  if (!v) return null
  try {
    return { ...normalizeProject(JSON.parse(v.json)), id: projectId, updatedAt: Date.now() }
  } catch {
    return null
  }
}

export function deleteVersion(projectId: string, versionId: string) {
  write(
    projectId,
    listVersions(projectId).filter((x) => x.id !== versionId),
  )
}
