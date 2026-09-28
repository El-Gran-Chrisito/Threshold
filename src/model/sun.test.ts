import { describe, expect, it } from 'vitest'
import { afternoonHour, clockLabel, dateLabel, dayOfYear, eveningHour, monthOfDay, nightAmount, sceneDirection, sunPosition, sunTimes } from './sun'

describe('sun', () => {
  it('stands due south at noon, at 90° minus latitude on the equinox', () => {
    const p = sunPosition(12, dayOfYear(3, 21), 40)
    expect(p.azimuth).toBeCloseTo(180, 0)
    expect(p.elevation).toBeGreaterThan(49)
    expect(p.elevation).toBeLessThan(51)
  })

  it('is higher at midsummer than midwinter in the north, and the other way round in the south', () => {
    const jun = dayOfYear(6, 21)
    const dec = dayOfYear(12, 21)
    expect(sunPosition(12, jun, 40).elevation).toBeCloseTo(73.4, 0)
    expect(sunPosition(12, dec, 40).elevation).toBeCloseTo(26.6, 0)
    expect(sunPosition(12, dec, -34).elevation).toBeGreaterThan(sunPosition(12, jun, -34).elevation)
    // South of the equator the noon sun is due north.
    expect(sunPosition(12, dec, -34).azimuth % 360).toBeLessThan(1)
  })

  it('rises in the east and sets in the west', () => {
    const d = dayOfYear(3, 21)
    expect(sunPosition(7, d, 40).azimuth).toBeGreaterThan(80)
    expect(sunPosition(7, d, 40).azimuth).toBeLessThan(120)
    expect(sunPosition(17, d, 40).azimuth).toBeGreaterThan(240)
    expect(sunPosition(17, d, 40).azimuth).toBeLessThan(280)
  })

  it('gives long summer days and short winter days', () => {
    const jun = sunTimes(dayOfYear(6, 21), 40)!
    const dec = sunTimes(dayOfYear(12, 21), 40)!
    expect(jun.set - jun.rise).toBeGreaterThan(14.5)
    expect(dec.set - dec.rise).toBeLessThan(9.6)
    expect(sunTimes(dayOfYear(6, 21), 75)).toBeNull()
  })

  it('points the 3D sun with the plan north arrow', () => {
    // Plan up is north: south is towards the viewer (+z), east is +x.
    const [sx, , sz] = sceneDirection(180, 0, 0)
    expect(sz).toBeCloseTo(1)
    expect(sx).toBeCloseTo(0)
    expect(sceneDirection(90, 0, 0)[0]).toBeCloseTo(1)
    // Plan up is east: north is to the left, so the south sun is to the right.
    expect(sceneDirection(180, 0, 90)[0]).toBeCloseTo(1)
    expect(sceneDirection(0, 0, 90)[0]).toBeCloseTo(-1)
  })

  it('turns to night through twilight', () => {
    expect(nightAmount(20)).toBe(0)
    expect(nightAmount(-10)).toBe(1)
    expect(nightAmount(-1)).toBeGreaterThan(0)
    expect(nightAmount(-1)).toBeLessThan(1)
  })

  it('picks evening and afternoon hours that suit the day', () => {
    const dec = dayOfYear(12, 21)
    const t = sunTimes(dec, 55)!
    expect(eveningHour(dec, 55)).toBeGreaterThan(t.set)
    expect(afternoonHour(dec, 55)).toBeLessThan(t.set)
    expect(afternoonHour(dayOfYear(6, 21), 40)).toBe(15)
  })

  it('labels hours and dates', () => {
    expect(clockLabel(6.0833)).toBe('6:05 am')
    expect(clockLabel(12)).toBe('12:00 pm')
    expect(clockLabel(19.9999)).toBe('8:00 pm')
    expect(dateLabel(dayOfYear(6, 21))).toBe('Jun 21')
    expect(monthOfDay(dayOfYear(12, 31))).toBe(12)
    expect(monthOfDay(1)).toBe(1)
  })
})
