/** Where each floor's rooms go in a small side-by-side drawing of a design (app thumbnails and plan pages). */
import type { Project } from './types'
import { floorMaterial } from './materials'

export interface MiniPlanLayout {
  viewBox: string
  floors: Array<{ id: string; name: string; dx: number; dy: number; rooms: Array<{ id: string; name: string; points: string; fill: string; cx: number; cy: number; w: number }> }>
}

export function miniPlanLayout(project: Project, gap = 120, pad = 30): MiniPlanLayout | null {
  const levels = [...project.levels].filter((l) => l.rooms.length).sort((a, b) => a.elevation - b.elevation)
  if (!levels.length) return null
  const boxes = levels.map((l) => {
    const pts = l.rooms.flatMap((r) => r.points)
    const minX = Math.min(...pts.map((p) => p.x))
    const minY = Math.min(...pts.map((p) => p.y))
    return { l, minX, minY, w: Math.max(...pts.map((p) => p.x)) - minX, h: Math.max(...pts.map((p) => p.y)) - minY }
  })
  const total = boxes.reduce((s, b) => s + b.w, 0) + gap * (boxes.length - 1)
  const tall = Math.max(...boxes.map((b) => b.h))
  let x = 0
  const floors = boxes.map((b) => {
    const f = {
      id: b.l.id,
      name: b.l.name,
      dx: x - b.minX,
      dy: (tall - b.h) / 2 - b.minY,
      rooms: b.l.rooms.map((r) => {
        const xs = r.points.map((p) => p.x)
        const ys = r.points.map((p) => p.y)
        return {
          id: r.id,
          name: r.name,
          points: r.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' '),
          fill: r.floorColor ?? floorMaterial(r.floor).base,
          // Centre and width of the room's box, for a label.
          cx: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
          cy: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
          w: Math.max(...xs) - Math.min(...xs),
        }
      }),
    }
    x += b.w + gap
    return f
  })
  return { viewBox: `${-pad} ${-pad} ${Math.round(total + 2 * pad)} ${Math.round(tall + 2 * pad)}`, floors }
}
