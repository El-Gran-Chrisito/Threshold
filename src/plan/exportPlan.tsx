/**
 * Render the active floor as a clean drawing sheet (no grid, handles or
 * selection) and rasterise it to PNG.
 */
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Level, Project } from '../model/types'
import { levelBounds, roomArea } from '../model/ops'
import { formatArea, formatLength, CM_PER_FT } from '../model/units'
import { catalogEntry } from '../model/catalog'
import { ItemsLayer, LabelsLayer, OpeningsLayer, RoomLabelsLayer, RoomsLayer, WallDims, WallsLayer } from './PlanLayers'

// Fixed light-theme colours: the sheet is a document, not a themed UI.
const SHEET_CSS = `
.plan-bg{fill:#ffffff}
.room-fill{fill-opacity:.42;stroke:transparent}
.room-label text{paint-order:stroke;stroke:#ffffff;stroke-linejoin:round}
.room-name{fill:#1c2226;font-weight:700}
.room-area{fill:#56626a}
.wall path{fill:#23292d;stroke:#23292d}
.hit-line{stroke:transparent;fill:none}
.op-gap{fill:#ffffff}
.op-line{stroke:#23292d;fill:none}
.op-leaf{stroke:#23292d;fill:none;stroke-linecap:round}
.op-arc{stroke:#56626a;stroke-dasharray:3 3;fill:none}
.op-window{fill:#ffffff;stroke:#23292d}
.sym-body{stroke:#23292d;stroke-opacity:.7;fill-opacity:.88}
.sym-soft{stroke:#23292d;stroke-opacity:.5;fill:rgba(255,255,255,.55)}
.sym-line{stroke:#23292d;stroke-opacity:.6}
.sym-solid{fill:#23292d}
.sym-text{fill:#23292d;fill-opacity:.7;font-weight:600}
.item.is-ceiling{opacity:.75}
.free-label{fill:#1c2226;font-weight:700;paint-order:stroke;stroke:#ffffff}
.dim-text{fill:#c2410c;paint-order:stroke;stroke:#ffffff;stroke-linejoin:round}
text{font-family:'Atkinson Hyperlegible Next',system-ui,-apple-system,'Segoe UI',Arial,sans-serif}
.sheet-title{fill:#1c2226;font-weight:700}
.sheet-sub{fill:#56626a}
.sheet-rule{stroke:#1c2226}
`

function PlanSheet({ project, level, width }: { project: Project; level: Level; width: number }) {
  const b = levelBounds(level) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 800 }
  const margin = Math.max(150, (b.maxX - b.minX) * 0.08)
  const x0 = b.minX - margin
  const y0 = b.minY - margin
  const w = b.maxX - b.minX + margin * 2
  const planH = b.maxY - b.minY + margin * 2
  const scale = width / w // px per cm
  const px = 1 / scale
  const titleH = 150 * px
  const h = planH + titleH
  const units = project.units
  const area = level.rooms.reduce((s, r) => s + roomArea(r), 0)
  const bar = units === 'imperial' ? CM_PER_FT * 10 : 300
  const tx = x0 + 40 * px
  const ty = y0 + planH + 20 * px
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={Math.round(h * scale)} viewBox={`${x0} ${y0} ${w} ${h}`}>
      <style>{SHEET_CSS}</style>
      <rect x={x0} y={y0} width={w} height={h} className="plan-bg" />
      <RoomsLayer level={level} px={px} selection={null} />
      <ItemsLayer items={level.items} px={px * 1.3} selection={null} filter={(i) => catalogEntry(i.type).mount !== 'ceiling'} />
      <WallsLayer level={level} px={px} selection={null} />
      <OpeningsLayer level={level} px={px * 1.4} selection={null} />
      <RoomLabelsLayer level={level} px={px * 1.9} units={units} showDims />
      <LabelsLayer labels={level.labels} px={px * 1.9} selection={null} />
      <WallDims level={level} px={px * 1.7} units={units} />
      {/* Title block */}
      <path d={`M ${x0 + 40 * px} ${ty - 6 * px} H ${x0 + w - 40 * px}`} className="sheet-rule" strokeWidth={px * 1.5} />
      <text x={tx} y={ty + 34 * px} fontSize={30 * px} className="sheet-title">
        {project.name}
      </text>
      <text x={tx} y={ty + 70 * px} fontSize={20 * px} className="sheet-sub">
        {level.name} · {formatArea(area, units)} · {level.rooms.length} rooms · ceiling {formatLength(level.height, units)}
      </text>
      <text x={tx} y={ty + 100 * px} fontSize={16 * px} className="sheet-sub">
        Drawn with Threshold · {new Date().toLocaleDateString()}
      </text>
      {/* Scale bar */}
      <g transform={`translate(${x0 + w - 40 * px - bar} ${ty + 30 * px})`}>
        <rect x={0} y={0} width={bar / 2} height={10 * px} fill="#1c2226" />
        <rect x={bar / 2} y={0} width={bar / 2} height={10 * px} fill="#ffffff" stroke="#1c2226" strokeWidth={px * 1.5} />
        <text x={0} y={34 * px} fontSize={16 * px} className="sheet-sub">
          0
        </text>
        <text x={bar} y={34 * px} fontSize={16 * px} className="sheet-sub" textAnchor="end">
          {formatLength(bar, units)}
        </text>
      </g>
      {/* North arrow */}
      <g transform={`translate(${x0 + w - 80 * px} ${y0 + 80 * px}) rotate(${-project.site.northAngle})`}>
        <circle r={34 * px} fill="#ffffff" stroke="#1c2226" strokeWidth={px * 1.5} />
        <path d={`M 0 ${-26 * px} L ${12 * px} ${14 * px} L 0 ${6 * px} L ${-12 * px} ${14 * px} Z`} fill="#1c2226" />
        <text y={-40 * px} fontSize={18 * px} textAnchor="middle" className="sheet-title">
          N
        </text>
      </g>
    </svg>
  )
}

export async function planPng(project: Project, level: Level, width = 2400): Promise<Blob> {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(<PlanSheet project={project} level={level} width={width} />))
  const svgText = host.innerHTML
  root.unmount()
  const svgEl = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement
  const height = Number(svgEl.getAttribute('height'))
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('render failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
