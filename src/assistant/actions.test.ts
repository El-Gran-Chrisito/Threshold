import { describe, expect, it } from 'vitest'
import { buildPrompt, describeLevel, runActions, type Action } from './actions'
import { buildTemplate } from '../model/templates'
import { makeProject } from '../model/factory'
import { polygonArea } from '../model/geometry'
import { CM_PER_FT } from '../model/units'

describe('assistant actions', () => {
  it('builds a small home from scratch', () => {
    const p = makeProject('t')
    const lvl = p.levels[0].id
    const actions: Action[] = [
      { op: 'add_room', name: 'Living', x: 0, y: 0, w: 16, d: 14, floor: 'oak' },
      { op: 'add_room', name: 'Bedroom', x: 16, y: 0, w: 12, d: 14, floor: 'carpet' },
      { op: 'add_room', name: 'Bath', x: 16, y: 14, w: 8, d: 6, floor: 'hex' },
      { op: 'add_door', room: 'Living', to: 'outside', side: 'S' },
      { op: 'add_door', room: 'Bedroom', to: 'Living' },
      { op: 'add_door', room: 'Bath', to: 'Bedroom' },
      { op: 'add_window', room: 'Bedroom', side: 'E', count: 2 },
      { op: 'add_item', type: 'bed-queen', room: 'Bedroom', place: 'E', along: 0.5 },
      { op: 'add_item', type: 'sofa', room: 'Living', place: 'S' },
      { op: 'paint_walls', room: 'Bedroom', color: '#C9D6DE' },
      { op: 'set_floor', room: 'Living', floor: 'walnut' },
      { op: 'resize_room', room: 'Living', w: 18 },
      { op: 'set_roof', style: 'gable', pitch: 6, material: 'metal', color: '#35506B' },
    ]
    const r = runActions(p, lvl, actions)
    const l = r.project.levels[0]
    expect(r.skipped).toEqual([])
    expect(l.rooms.map((x) => x.name)).toEqual(['Living', 'Bedroom', 'Bath'])
    expect(l.rooms[1].floor).toBe('carpet-oat')
    expect(l.rooms[0].floor).toBe('walnut')
    expect(l.openings.filter((o) => o.kind === 'door')).toHaveLength(3)
    expect(l.openings.filter((o) => o.kind === 'window')).toHaveLength(2)
    expect(l.items.map((i) => i.type).sort()).toEqual(['bed-queen', 'sofa-3'])
    expect(l.roof.style).toBe('gable')
    expect(l.roof.material).toBe('metal')
    expect(l.roof.color).toBe('#35506B')
    expect(Math.round(polygonArea(l.rooms[0].points) / (CM_PER_FT * CM_PER_FT))).toBe(18 * 14)
    // Bed backed onto the east wall, facing west.
    expect(l.items.find((i) => i.type === 'bed-queen')!.rotation).toBe(90)
  })

  it('applies a whole-home style, then specific changes on top', () => {
    const p = buildTemplate('family')
    const lvl = p.levels[0].id
    const r = runActions(p, lvl, [
      { op: 'apply_style', style: 'industrial' },
      { op: 'set_floor', room: 'Den', floor: 'walnut' },
      { op: 'wire_rooms', room: 'Den' },
    ])
    expect(r.skipped).toEqual([])
    const g = r.project.levels[0]
    expect(g.rooms.find((x) => x.name === 'Den')!.floor).toBe('walnut')
    expect(g.rooms.find((x) => x.name === 'Kitchen & dining')!.floor).toBe('concrete')
    expect(r.project.levels[1].roof.material).toBe('metal')
    expect(r.applied.some((x) => x.startsWith('Electrical:') && x.includes('outlet'))).toBe(true)
  })

  it('reports actions it cannot do instead of failing', () => {
    const p = buildTemplate('studio')
    const r = runActions(p, p.levels[0].id, [
      { op: 'add_item', type: 'spaceship', room: 'Living' },
      { op: 'paint_walls', room: 'Garage', color: '#000000' },
      { op: 'rename_room', room: 'living', name: 'Main room' },
    ])
    expect(r.skipped).toHaveLength(2)
    expect(r.project.levels[0].rooms.some((x) => x.name === 'Main room')).toBe(true)
  })

  it('writes a prompt that fits the size limit', () => {
    const p = buildTemplate('family')
    const prompt = buildPrompt(p, p.levels[0], 'Add a sunroom off the kitchen', false)
    expect(new TextEncoder().encode(prompt).length).toBeLessThan(40000)
    expect(prompt).toContain('Kitchen & dining')
  })
})

describe('describeLevel daylight', () => {
  it('tells the assistant which way windows face and how much sun each room gets', () => {
    const p = buildTemplate('family')
    const d = JSON.parse(describeLevel(p, p.levels[0]))
    expect(d.plan_top_faces_compass_bearing).toBe(0)
    expect(d.latitude).toBe(40)
    const den = d.rooms.find((r: { name: string }) => r.name === 'Den')
    expect(den.window_faces).toEqual(['S'])
    expect(den.winter_sun_h).toBeGreaterThan(7)
    expect(den.winter_sun_times).toMatch(/^0\d:\d\d-1\d:\d\d$/)
    const garage = d.rooms.find((r: { name: string }) => r.name === 'Garage')
    expect(garage).toBeTruthy()
  })

  it('asks for answers to questions in the summary', () => {
    const p = buildTemplate('family')
    const prompt = buildPrompt(p, p.levels[0], 'Which room gets morning sun?', false)
    expect(prompt).toContain('empty actions list')
    expect(prompt).toContain('window_faces')
  })
})
