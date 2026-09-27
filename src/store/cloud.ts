/**
 * Account storage. Inside a claude.ai artifact each viewer's designs are kept
 * in their own private subtree of the artifact's database
 * (`data/users/<id>/<designId>`), so work survives cleared browser data and
 * follows the viewer across devices. Outside Claude this resolves to null and
 * the app keeps using browser storage alone.
 */
import type { Project } from '../model/types'
import { normalizeProject } from './persistence'

interface DocSnap {
  id: string
  exists: boolean
  data(): Record<string, unknown> | undefined
}
interface DocRef {
  get(): Promise<DocSnap>
  set(data: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
}
interface Coll {
  doc(id: string): DocRef
  get(): Promise<{ docs: DocSnap[] }>
}
interface DB {
  collection(path: string): Coll
}
interface UserNS {
  id(): Promise<string | null>
}

export interface CloudMeta {
  id: string
  name: string
  updatedAt: number
}

let ready: Promise<{ coll: Coll } | null> | null = null

export function cloud(): Promise<{ coll: Coll } | null> {
  if (!ready) {
    ready = (async () => {
      if (typeof window === 'undefined' || !window.claude?.use) return null
      try {
        const [db, user] = (await Promise.all([window.claude.use('db'), window.claude.use('user')])) as [DB | null, UserNS | null]
        if (!db || !user) return null
        const uid = await user.id()
        if (!uid) return null
        return { coll: db.collection(`data/users/${uid}`) }
      } catch {
        return null
      }
    })()
  }
  return ready
}

export async function cloudList(): Promise<CloudMeta[]> {
  const c = await cloud()
  if (!c) return []
  try {
    const snap = await c.coll.get()
    return snap.docs
      .filter((d) => d.exists && d.id.startsWith('prj_'))
      .map((d) => {
        const v = d.data() ?? {}
        return { id: d.id, name: String(v.name ?? 'Home'), updatedAt: Number(v.updatedAt ?? 0) }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

export async function cloudLoad(id: string): Promise<Project | null> {
  const c = await cloud()
  if (!c) return null
  try {
    const snap = await c.coll.doc(id).get()
    if (!snap.exists) return null
    const v = snap.data() ?? {}
    return normalizeProject(JSON.parse(String(v.json)))
  } catch {
    return null
  }
}

export async function cloudDelete(id: string): Promise<void> {
  const c = await cloud()
  if (!c) return
  try {
    await c.coll.doc(id).delete()
  } catch {
    /* ignore */
  }
}

export type CloudStatus = 'off' | 'saving' | 'saved' | 'error'

// One write at a time; while a write runs, only the newest pending project is kept.
let inFlight = false
let pending: Project | null = null
let listener: ((s: CloudStatus) => void) | null = null

export function onCloudStatus(fn: (s: CloudStatus) => void) {
  listener = fn
}

export async function cloudSave(p: Project): Promise<void> {
  const c = await cloud()
  if (!c) {
    listener?.('off')
    return
  }
  pending = p
  if (inFlight) return
  inFlight = true
  listener?.('saving')
  try {
    while (pending) {
      const next = pending
      pending = null
      const json = JSON.stringify(next)
      if (json.length > 240_000) throw new Error('too large')
      await c.coll.doc(next.id).set({ name: next.name, updatedAt: next.updatedAt, json })
    }
    listener?.('saved')
  } catch {
    listener?.('error')
  } finally {
    inFlight = false
  }
}
