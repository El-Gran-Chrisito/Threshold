/**
 * Where the sun is: a standard solar-position approximation (declination
 * and hour angle) good to about a degree, which is plenty to see which
 * rooms get morning light and how far a shadow reaches in winter.
 * Hours are local solar time (noon = sun due south in the north).
 */

export const DEFAULT_LATITUDE = 40

const RAD = Math.PI / 180

/** Day of the year, 1–365. */
export function dayOfYear(month: number, date: number): number {
  const start = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  return start[Math.min(11, Math.max(0, month - 1))] + Math.min(31, Math.max(1, date))
}

/** Month (1–12) of a day of the year. */
export function monthOfDay(day: number): number {
  for (let m = 12; m >= 1; m--) if (day >= dayOfYear(m, 1)) return m
  return 1
}

export function todayOfYear(now = new Date()): number {
  return dayOfYear(now.getMonth() + 1, now.getDate())
}

/** Solar declination in degrees. */
export function declination(day: number): number {
  return 23.44 * Math.sin(((360 / 365) * (day - 81)) * RAD)
}

export interface SunPosition {
  /** Degrees above the horizon (negative below). */
  elevation: number
  /** Compass bearing, degrees clockwise from north. */
  azimuth: number
}

export function sunPosition(hour: number, day: number, latitude = DEFAULT_LATITUDE): SunPosition {
  const phi = Math.min(89.9, Math.max(-89.9, latitude)) * RAD
  const dec = declination(day) * RAD
  const h = (hour - 12) * 15 * RAD
  const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD
  // Measured from south, positive to the west; turned into a compass bearing.
  const fromSouth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD
  return { elevation, azimuth: (fromSouth + 180 + 360) % 360 }
}

/** Sunrise and sunset in solar hours; null when the sun never rises or never sets that day. */
export function sunTimes(day: number, latitude = DEFAULT_LATITUDE): { rise: number; set: number } | null {
  const phi = Math.min(89.9, Math.max(-89.9, latitude)) * RAD
  const dec = declination(day) * RAD
  // Upper limb and refraction: the sun shows at about -0.83°.
  const c = (Math.sin(-0.83 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))
  if (c <= -1 || c >= 1) return null
  const h = Math.acos(c) / RAD / 15
  return { rise: 12 - h, set: 12 + h }
}

/** 0 in daylight, 1 at full night; eases through twilight. */
export function nightAmount(elevation: number): number {
  return Math.min(1, Math.max(0, (3 - elevation) / 9))
}

/**
 * Unit direction towards a compass bearing and elevation in 3D scene
 * coordinates (x = plan right, y = up, z = plan down). `north` is the
 * compass bearing of plan up, as in Site.northAngle.
 */
export function sceneDirection(azimuth: number, elevation: number, north: number): [number, number, number] {
  const a = (azimuth - north) * RAD
  const e = elevation * RAD
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]
}

/** A good hour for an evening view: just after sunset, or late evening where the sun never sets. */
export function eveningHour(day: number, latitude = DEFAULT_LATITUDE): number {
  const t = sunTimes(day, latitude)
  return t ? Math.min(22.75, t.set + 0.6) : 21
}

/** An afternoon hour with the sun up: 3 pm, or earlier on short winter days. */
export function afternoonHour(day: number, latitude = DEFAULT_LATITUDE): number {
  const t = sunTimes(day, latitude)
  if (!t) return 13
  return Math.max(12, Math.min(15, t.set - 1.25))
}

/** "6:05 am" for a solar hour. */
export function clockLabel(hour: number): string {
  let h = Math.floor(hour)
  let m = Math.round((hour - h) * 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  h = ((h % 24) + 24) % 24
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jun 21" for a day of the year. */
export function dateLabel(day: number): string {
  const m = monthOfDay(day)
  return `${MONTHS[m - 1]} ${day - dayOfYear(m, 1) + 1}`
}
