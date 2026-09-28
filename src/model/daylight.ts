/**
 * Daylight for a room: which compass directions its outside windows face,
 * how much glass it has for its floor area, and when direct sun can come in
 * on a given day. Sun is counted when it is above the horizon and in front
 * of a window; trees, neighbours and roof overhangs are not taken into
 * account, so the hours are the most the room can get.
 */
import { add, lerp, normalOf, pointInPolygon, scale } from './geometry'
import { floorMaterial } from './materials'
import { roomArea, roomWallSides, wallLength } from './ops'
import { DEFAULT_LATITUDE, sunPosition } from './sun'
import type { Level, Opening, Room, Site } from './types'

/** Openings that let sun in. */
function glazed(o: Opening): boolean {
  return o.kind === 'window' || o.kind === 'slider' || (o.kind === 'double-door' && o.style === 'glass') || (o.kind === 'door' && o.style === 'glass')
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export type CompassPoint = (typeof POINTS)[number]

export function compassPoint(bearing: number): CompassPoint {
  return POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
}

export interface RoomWindow {
  opening: Opening
  /** Compass bearing the glass faces, degrees clockwise from north. */
  bearing: number
}

/** Outside windows of a room and the way each faces. Windows between two indoor rooms are left out. */
export function roomWindows(level: Level, room: Room, north: number): RoomWindow[] {
  const out: RoomWindow[] = []
  const indoorOthers = level.rooms.filter((r) => r.id !== room.id && !floorMaterial(r.floor).outdoor)
  for (const { wall, side } of roomWallSides(level, room)) {
    const L = wallLength(wall)
    const n = normalOf(wall.a, wall.b)
    // The room is on side A (the normal's side), so the glass faces the other way.
    const outward = side === 'A' ? scale(n, -1) : n
    for (const o of level.openings) {
      if (o.wallId !== wall.id || !glazed(o)) continue
      const c = lerp(wall.a, wall.b, o.offset / L)
      const beyond = add(c, scale(outward, wall.thickness / 2 + 8))
      if (indoorOthers.some((r) => pointInPolygon(beyond, r.points))) continue
      // Plan up is -y; the plan angle is measured clockwise from plan up.
      const planAngle = (Math.atan2(outward.x, -outward.y) * 180) / Math.PI
      out.push({ opening: o, bearing: (((planAngle + north) % 360) + 360) % 360 })
    }
  }
  return out
}

export interface SunWindow {
  /** Hours of direct sun (the most possible). */
  hours: number
  /** First and last solar time with sun, or null when there is none. */
  from: number | null
  to: number | null
  /** Each unbroken spell of sun as [start, end] solar hours. */
  spans: Array<[number, number]>
}

/** When sun can shine straight in through any of these windows on one day. */
export function directSun(windows: Array<{ bearing: number }>, day: number, latitude = DEFAULT_LATITUDE): SunWindow {
  const step = 0.25
  let hours = 0
  let from: number | null = null
  let to: number | null = null
  const spans: Array<[number, number]> = []
  if (!windows.length) return { hours, from, to, spans }
  for (let h = step / 2; h < 24; h += step) {
    const s = sunPosition(h, day, latitude)
    if (s.elevation <= 2) continue
    // In front of the glass, not just grazing along the wall.
    const lit = windows.some((w) => Math.cos(((s.azimuth - w.bearing) * Math.PI) / 180) > 0.12)
    if (!lit) continue
    hours += step
    const start = h - step / 2
    if (from === null) from = start
    to = h + step / 2
    const last = spans[spans.length - 1]
    if (last && Math.abs(last[1] - start) < 1e-6) last[1] = to
    else spans.push([start, to])
  }
  return { hours, from, to, spans }
}

export interface RoomDaylight {
  /** Compass points the windows face, clockwise from north, without repeats. */
  faces: CompassPoint[]
  windows: number
  /** Glass area as a share of the floor area (0–1). */
  glassRatio: number
  summer: SunWindow
  winter: SunWindow
}

/** Midsummer and midwinter for the hemisphere the site is in. */
export function solsticeDays(latitude: number): { summer: number; winter: number } {
  return latitude >= 0 ? { summer: 172, winter: 355 } : { summer: 355, winter: 172 }
}

export function roomDaylight(level: Level, room: Room, site: Site): RoomDaylight {
  const lat = site.latitude ?? DEFAULT_LATITUDE
  const wins = roomWindows(level, room, site.northAngle)
  const faces = [...new Set(wins.map((w) => compassPoint(w.bearing)))].sort((a, b) => POINTS.indexOf(a) - POINTS.indexOf(b))
  const glass = wins.reduce((s, w) => s + w.opening.width * w.opening.height, 0)
  const area = roomArea(room)
  const days = solsticeDays(lat)
  return {
    faces,
    windows: wins.length,
    glassRatio: area > 0 ? glass / area : 0,
    summer: directSun(wins, days.summer, lat),
    winter: directSun(wins, days.winter, lat),
  }
}

/** "Morning", "all day" and so on, from when the sun comes in. */
export function sunPeriod(s: SunWindow): string {
  if (s.from === null || s.to === null || s.hours < 0.5) return 'no direct sun'
  if (s.spans.length > 1 && s.spans.every(([a, b]) => b <= 10.5 || a >= 15)) return 'early morning and evening'
  const morning = s.from < 10.5
  const afternoon = s.to > 14.5
  if (morning && afternoon) return s.spans.length === 1 && s.hours >= 8 ? 'most of the day' : 'morning and afternoon'
  if (morning) return 'morning'
  if (afternoon) return 'afternoon'
  return 'midday'
}
