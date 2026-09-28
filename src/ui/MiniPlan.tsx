/** A small drawing of a design's floors: rooms filled with their floor colour, side by side. */
import { useMemo } from 'react'
import type { Project } from '../model/types'
import { miniPlanLayout } from '../model/miniplan'

export function MiniPlan({ project, height = 56 }: { project: Project; height?: number }) {
  const layout = useMemo(() => miniPlanLayout(project), [project])
  if (!layout) return null
  return (
    <svg className="mini-plan" viewBox={layout.viewBox} height={height} aria-hidden preserveAspectRatio="xMidYMid meet">
      {layout.floors.map((f) => (
        <g key={f.id} transform={`translate(${f.dx} ${f.dy})`}>
          {f.rooms.map((r) => (
            <polygon key={r.id} points={r.points} fill={r.fill} stroke="var(--ink)" strokeWidth={12} strokeLinejoin="round" />
          ))}
        </g>
      ))}
    </svg>
  )
}
