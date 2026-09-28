/** A small drawing of a design's floors: rooms filled with their floor colour, side by side. */
import { useMemo } from 'react'
import type { Project } from '../model/types'
import { floorMaterial } from '../model/materials'

export function MiniPlan({ project, height = 56 }: { project: Project; height?: number }) {
  const floors = useMemo(() => {
    const levels = [...project.levels].filter((l) => l.rooms.length).sort((a, b) => a.elevation - b.elevation)
    return levels.map((l) => {
      const pts = l.rooms.flatMap((r) => r.points)
      const minX = Math.min(...pts.map((p) => p.x))
      const minY = Math.min(...pts.map((p) => p.y))
      const w = Math.max(...pts.map((p) => p.x)) - minX
      const h = Math.max(...pts.map((p) => p.y)) - minY
      return { l, minX, minY, w, h }
    })
  }, [project])
  if (!floors.length) return null
  const gap = 120
  const total = floors.reduce((s, f) => s + f.w, 0) + gap * (floors.length - 1)
  const tall = Math.max(...floors.map((f) => f.h))
  let x = 0
  return (
    <svg className="mini-plan" viewBox={`-30 -30 ${total + 60} ${tall + 60}`} height={height} aria-hidden preserveAspectRatio="xMidYMid meet">
      {floors.map((f) => {
        const ox = x - f.minX
        const oy = (tall - f.h) / 2 - f.minY
        x += f.w + gap
        return (
          <g key={f.l.id} transform={`translate(${ox} ${oy})`}>
            {f.l.rooms.map((r) => (
              <polygon key={r.id} points={r.points.map((p) => `${p.x},${p.y}`).join(' ')} fill={r.floorColor ?? floorMaterial(r.floor).base} stroke="var(--ink)" strokeWidth={12} strokeLinejoin="round" />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
