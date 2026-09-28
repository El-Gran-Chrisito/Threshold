import { describe, expect, it } from 'vitest'
import { buildTemplate } from '../model/templates'
import { DXF_LAYERS, dxfText, planDxf } from './dxf'

/** Group code / value pairs of a DXF file. */
function pairs(dxf: string): Array<[number, string]> {
  const lines = dxf.split('\r\n')
  if (lines[lines.length - 1] === '') lines.pop()
  expect(lines.length % 2).toBe(0)
  const out: Array<[number, string]> = []
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i])
    expect(Number.isInteger(code)).toBe(true)
    out.push([code, lines[i + 1]])
  }
  return out
}

/** Entities in the ENTITIES section as { type, layer }. */
function entities(dxf: string) {
  const ps = pairs(dxf)
  const start = ps.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && ps[i - 1][1] === 'SECTION')
  const out: Array<{ type: string; layer: string }> = []
  for (let i = start + 1; i < ps.length; i++) {
    const [c, v] = ps[i]
    if (c === 0 && v === 'ENDSEC') break
    if (c === 0) out.push({ type: v, layer: '' })
    else if (c === 8 && out.length && !out[out.length - 1].layer) out[out.length - 1].layer = v
  }
  return out
}

describe('DXF export', () => {
  const p = buildTemplate('family')
  const dxf = planDxf(p)

  it('is a well-formed R12 file with sections, layers and an end', () => {
    const ps = pairs(dxf)
    const values = ps.filter(([c]) => c === 2).map(([, v]) => v)
    for (const s of ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']) expect(values).toContain(s)
    expect(ps[ps.length - 1]).toEqual([0, 'EOF'])
    expect(dxf).toContain('AC1009')
    for (const [name] of DXF_LAYERS) expect(values).toContain(name)
    // Every POLYLINE closes with a SEQEND.
    const types = ps.filter(([c]) => c === 0).map(([, v]) => v)
    expect(types.filter((t) => t === 'POLYLINE').length).toBe(types.filter((t) => t === 'SEQEND').length)
  })

  it('draws walls, doors with swings, windows, rooms, furniture and stairs', () => {
    const e = entities(dxf).filter((x) => x.type !== 'VERTEX' && x.type !== 'SEQEND')
    const on = (layer: string, type?: string) => e.filter((x) => x.layer === layer && (!type || x.type === type)).length
    expect(on('A-WALL', 'POLYLINE')).toBeGreaterThan(20)
    expect(on('A-DOOR', 'ARC')).toBeGreaterThan(5)
    expect(on('A-GLAZ', 'POLYLINE')).toBeGreaterThan(5)
    const rooms = p.levels.reduce((n, l) => n + l.rooms.length, 0)
    expect(on('A-AREA', 'POLYLINE')).toBe(rooms)
    expect(on('A-FURN', 'POLYLINE')).toBeGreaterThan(10)
    expect(on('A-FLOR-STRS', 'POLYLINE')).toBeGreaterThan(0)
    // Two texts per room (name and area) plus one title per floor.
    expect(on('A-ANNO-TEXT', 'TEXT')).toBeGreaterThanOrEqual(rooms * 2 + p.levels.length)
  })

  it('uses inches for imperial designs and millimetres for metric ones', () => {
    const header = (s: string) => s.slice(0, s.indexOf('ENDSEC'))
    expect(header(dxf)).toMatch(/\$INSUNITS\r\n70\r\n1\r\n/)
    const m = planDxf({ ...p, units: 'metric' })
    expect(header(m)).toMatch(/\$INSUNITS\r\n70\r\n4\r\n/)
    // Every x coordinate is 25.4 times larger in millimetres than in inches.
    const xs = (s: string) => pairs(s).filter(([c]) => c === 10).reduce((sum, [, v]) => sum + Math.abs(Number(v)), 0)
    expect(xs(m) / xs(dxf)).toBeCloseTo(25.4, 2)
  })

  it('escapes characters outside ASCII', () => {
    expect(dxfText('Café 8¼"')).toBe('Caf\\U+00E9 8\\U+00BC"')
    const q = buildTemplate('studio')
    q.levels[0].rooms[0].name = 'Salle à manger'
    expect(planDxf(q)).toContain('Salle \\U+00E0 manger')
  })

  it('handles an empty design', () => {
    const blank = planDxf(buildTemplate('blank'))
    expect(pairs(blank).at(-1)).toEqual([0, 'EOF'])
  })
})
