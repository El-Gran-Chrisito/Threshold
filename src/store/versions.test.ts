import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_VERSIONS, deleteVersion, listVersions, saveVersion, versionProject } from './versions'
import { buildTemplate } from '../model/templates'

// A small in-memory localStorage for the node test run.
beforeEach(() => {
  const m = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
})

describe('design versions', () => {
  it('saves, lists newest first, restores in place and deletes', () => {
    const p = buildTemplate('family')
    saveVersion(p, 'Before the extension', 1000)
    const changed = { ...p, name: 'With extension', levels: p.levels.slice(0, 1) }
    saveVersion(changed, 'One floor', 2000)
    const list = listVersions(p.id)
    expect(list.map((v) => v.name)).toEqual(['One floor', 'Before the extension'])
    const back = versionProject(p.id, list[1].id)!
    expect(back.id).toBe(p.id)
    expect(back.levels.length).toBe(p.levels.length)
    deleteVersion(p.id, list[0].id)
    expect(listVersions(p.id).map((v) => v.name)).toEqual(['Before the extension'])
  })

  it(`keeps at most ${MAX_VERSIONS}`, () => {
    const p = buildTemplate('studio')
    for (let i = 0; i < MAX_VERSIONS + 3; i++) saveVersion(p, `v${i}`, 1000 + i)
    const list = listVersions(p.id)
    expect(list.length).toBe(MAX_VERSIONS)
    expect(list[0].name).toBe(`v${MAX_VERSIONS + 2}`)
  })
})
