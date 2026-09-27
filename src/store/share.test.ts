import { describe, expect, it } from 'vitest'
import { decodeDesign, encodeDesign, sharedCode } from './share'
import { buildTemplate } from '../model/templates'

describe('share links', () => {
  it('round-trips a design through a compact code', async () => {
    const p = buildTemplate('family')
    const code = await encodeDesign(p)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code.length).toBeLessThan(JSON.stringify(p).length / 3)
    const q = await decodeDesign(code)
    expect(q.levels.map((l) => l.rooms.length)).toEqual(p.levels.map((l) => l.rooms.length))
    expect(q.name).toBe(p.name)
  })

  it('finds the code in an address', () => {
    expect(sharedCode('#design=abc')).toBe('abc')
    expect(sharedCode('#other')).toBeNull()
  })
})
