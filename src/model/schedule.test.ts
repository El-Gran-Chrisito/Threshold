import { describe, expect, it } from 'vitest'
import { homeSummary, roomSchedule } from './schedule'
import { buildTemplate } from './templates'

describe('room schedule and summary', () => {
  it('lists every room with its size and finish', () => {
    const p = buildTemplate('family')
    const rows = roomSchedule(p)
    expect(rows.length).toBe(p.levels.reduce((s, l) => s + l.rooms.length, 0))
    expect(rows.every((r) => r.area && r.size.includes('×') && r.finish && r.ceiling)).toBe(true)
  })

  it('sums living area and counts bedrooms, baths and floors', () => {
    const s = homeSummary(buildTemplate('family'))
    expect(s).toMatch(/sq ft · \d bedrooms? · [\d.]+ bath · \d floors?$/)
  })
})
