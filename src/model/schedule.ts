/**
 * Plain-language facts about a design for printed sheets and presentations:
 * a one-line summary and the room schedule.
 */
import type { Project } from './types'
import { roomArea } from './ops'
import { floorMaterial } from './materials'
import { formatArea, formatLength } from './units'
import { roomDaylight } from './daylight'

const OUTDOOR = /garage|patio|deck|lawn|outdoor|porch|terrace/i

/** "2,816 sq ft · 3 bedrooms · 2.5 bath · 2 floors" (living area leaves out garages and outdoor areas). */
export function homeSummary(p: Project): string {
  const rooms = p.levels.flatMap((l) => l.rooms)
  const area = rooms.filter((r) => !OUTDOOR.test(r.name)).reduce((s, r) => s + roomArea(r), 0)
  const beds = rooms.filter((r) => /bed/i.test(r.name)).length
  const full = rooms.filter((r) => /bath/i.test(r.name) && !/powder|half bath/i.test(r.name)).length
  const half = rooms.filter((r) => /powder|half bath|\bwc\b/i.test(r.name)).length
  const floors = p.levels.filter((l) => l.rooms.length).length
  return [
    formatArea(area, p.units),
    beds ? `${beds} bedroom${beds > 1 ? 's' : ''}` : '',
    full || half ? `${full + half / 2} bath` : '',
    `${floors} floor${floors === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface ScheduleRow {
  floor: string
  room: string
  area: string
  /** Outside width × depth of the room's footprint. */
  size: string
  finish: string
  ceiling: string
  /** Compass points the outside windows face, e.g. "S, W"; "–" without windows. */
  windows: string
  /** Hours of direct sun at midwinter, e.g. "6½ h" (the most possible). */
  winterSun: string
}

/** "6½ h" from hours, to the nearest half hour. */
export function hoursLabel(h: number): string {
  const r = Math.round(h * 2) / 2
  return `${Math.floor(r)}${r % 1 ? '½' : ''} h`
}

export function roomSchedule(p: Project): ScheduleRow[] {
  return p.levels.flatMap((l) =>
    l.rooms.map((r) => {
      const xs = r.points.map((q) => q.x)
      const ys = r.points.map((q) => q.y)
      const w = Math.max(...xs) - Math.min(...xs)
      const d = Math.max(...ys) - Math.min(...ys)
      return {
        floor: l.name,
        room: r.name,
        area: formatArea(roomArea(r), p.units),
        size: `${formatLength(w, p.units)} × ${formatLength(d, p.units)}`,
        finish: floorMaterial(r.floor).name,
        ceiling: formatLength(l.height, p.units),
        ...(() => {
          if (floorMaterial(r.floor).outdoor) return { windows: '–', winterSun: '–' }
          const d = roomDaylight(l, r, p.site)
          return { windows: d.faces.length ? d.faces.join(', ') : '–', winterSun: d.windows ? hoursLabel(d.winter.hours) : '–' }
        })(),
      }
    }),
  )
}
