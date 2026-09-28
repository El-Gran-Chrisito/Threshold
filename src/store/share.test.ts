import { describe, expect, it } from 'vitest'
import { decodeDesign, decodeShared, encodeDesign, encodePresentation, sharedCode } from './share'
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

  it('carries the sender brand in a client presentation link', async () => {
    const p = buildTemplate('family')
    const brand = { company: 'Oak & Line Studio', contact: 'hello@oakline.example', logo: 'javascript:alert(1)' }
    const s = await decodeShared(await encodePresentation(p, brand))
    expect(s.present).toBe(true)
    expect(s.brand).toEqual({ company: 'Oak & Line Studio', contact: 'hello@oakline.example', logo: null })
    expect(s.project.name).toBe(p.name)
    const plain = await decodeShared(await encodeDesign(p))
    expect(plain.present).toBe(false)
    expect(plain.brand).toBeNull()
  })

  it('finds the code in an address', () => {
    expect(sharedCode('#design=abc')).toBe('abc')
    expect(sharedCode('#other')).toBeNull()
  })
})
