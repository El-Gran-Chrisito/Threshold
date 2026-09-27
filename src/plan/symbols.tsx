/**
 * Plan-view (top-down) symbols for catalog shapes. Drawn in the item's local
 * frame: centred on the origin, width along x, depth along y, front at +y.
 */
import type { ReactNode } from 'react'

interface P {
  w: number
  d: number
  color: string
  color2: string
  shape: string
  /** Stroke width in plan units (cm) for 1 screen px. */
  px: number
}

const r = (x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} {...extra} />

export function ItemSymbol({ w, d, color, color2, shape, px }: P): ReactNode {
  const hw = w / 2
  const hd = d / 2
  const body = { className: 'sym-body', style: { fill: color }, strokeWidth: px }
  const line = { className: 'sym-line', strokeWidth: px * 0.9, fill: 'none' }
  const accent = { className: 'sym-body', style: { fill: color2 }, strokeWidth: px }
  const dashed = { ...line, strokeDasharray: `${px * 4} ${px * 3}` }

  switch (shape) {
    case 'bed':
    case 'bunk': {
      const pillowH = Math.min(d * 0.14, 30)
      const n = w > 120 ? 2 : 1
      const pw = (w - 16 - (n - 1) * 6) / n
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw, -hd, w, 8, accent)}
          {Array.from({ length: n }, (_, i) => r(-hw + 8 + i * (pw + 6), -hd + 12, pw, pillowH, { ...line, className: 'sym-soft', rx: 6 }))}
          <path d={`M ${-hw} ${-hd + d * 0.36} L ${hw} ${-hd + d * 0.36}`} {...line} />
          <path d={`M ${-hw} ${-hd + d * 0.36} L ${-hw + w * 0.18} ${-hd + d * 0.46} L ${hw - w * 0.18} ${-hd + d * 0.46} L ${hw} ${-hd + d * 0.36}`} {...line} />
          {shape === 'bunk' && <path d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} {...dashed} />}
        </g>
      )
    }
    case 'crib':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw + 5, -hd + 5, w - 10, d - 10, line)}
        </g>
      )
    case 'sofa':
    case 'armchair': {
      const back = d * 0.24
      const arm = Math.min(w * 0.12, 22)
      const seats = shape === 'armchair' ? 1 : w > 180 ? 3 : 2
      const sw = (w - arm * 2) / seats
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: 6 })}
          {r(-hw + arm, -hd, w - arm * 2, back, line)}
          {Array.from({ length: seats }, (_, i) => r(-hw + arm + i * sw, -hd + back, sw, d - back, { ...line, rx: 4 }))}
        </g>
      )
    }
    case 'sectional': {
      const back = 24
      const seat = Math.min(d, 95)
      const chaise = Math.min(w * 0.33, 95)
      return (
        <g>
          <path d={`M ${-hw} ${-hd} H ${hw} V ${-hd + seat} H ${-hw + chaise} V ${hd} H ${-hw} Z`} {...body} />
          <path d={`M ${-hw + back} ${hd} V ${-hd + back} H ${hw}`} {...line} />
          <path d={`M ${-hw + chaise} ${-hd + back} V ${-hd + seat} M ${-hw + back} ${-hd + seat} H ${-hw + chaise}`} {...line} />
          <path d={`M ${(-hw + chaise + hw) / 2} ${-hd + back} V ${-hd + seat}`} {...line} />
        </g>
      )
    }
    case 'ottoman':
      return r(-hw, -hd, w, d, { ...body, rx: Math.min(w, d) * 0.2 })
    case 'table':
    case 'table-low':
    case 'desk':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: 2 })}
          {r(-hw + 4, -hd + 4, w - 8, d - 8, { ...line, opacity: 0.5 })}
        </g>
      )
    case 'desk-l': {
      const dd = Math.min(70, d * 0.45)
      return <path d={`M ${-hw} ${-hd} H ${hw} V ${hd} H ${hw - dd} V ${-hd + dd} H ${-hw} Z`} {...body} />
    }
    case 'round-table':
      return <ellipse cx={0} cy={0} rx={hw} ry={hd} {...body} />
    case 'side-table':
    case 'nightstand':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          <circle cx={0} cy={0} r={Math.min(w, d) * 0.22} {...line} />
        </g>
      )
    case 'chair':
      return (
        <g>
          {r(-hw, -hd + d * 0.12, w, d * 0.88, { ...body, rx: 4 })}
          {r(-hw, -hd, w, d * 0.14, accent)}
        </g>
      )
    case 'stool':
      return <circle cx={0} cy={0} r={Math.min(hw, hd)} {...body} />
    case 'office-chair':
      return (
        <g>
          <circle cx={0} cy={d * 0.06} r={Math.min(hw, hd) * 0.8} {...body} />
          <path d={`M ${-hw * 0.8} ${-hd * 0.55} Q 0 ${-hd * 1.05} ${hw * 0.8} ${-hd * 0.55}`} {...line} strokeWidth={px * 3} />
        </g>
      )
    case 'cabinet-low':
    case 'dresser':
    case 'wardrobe': {
      const n = Math.max(2, Math.round(w / 45))
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {Array.from({ length: n - 1 }, (_, i) => (
            <path key={i} d={`M ${-hw + ((i + 1) * w) / n} ${-hd} V ${hd}`} {...line} opacity={0.6} />
          ))}
          {shape === 'wardrobe' && <path d={`M ${-hw + 6} 0 H ${hw - 6}`} {...dashed} />}
        </g>
      )
    }
    case 'tv':
    case 'mirror':
    case 'art':
      return r(-hw, -hd, w, d, accent)
    case 'curtain': {
      const n = Math.max(3, Math.round(w / 15))
      let dpath = `M ${-hw} 0`
      for (let i = 0; i < n; i++) dpath += ` q ${w / n / 2} ${(i % 2 ? -1 : 1) * hd} ${w / n} 0`
      return <path d={dpath} {...line} style={{ stroke: color }} strokeWidth={px * 2.5} />
    }
    case 'bookshelf': {
      const n = Math.max(3, Math.round(w / 6))
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {Array.from({ length: n }, (_, i) => (
            <path key={i} d={`M ${-hw + ((i + 0.5) * w) / n} ${-hd + 3} V ${-hd + d * (0.55 + 0.35 * ((i * 7) % 5) / 5)}`} {...line} opacity={0.55} />
          ))}
        </g>
      )
    }
    case 'rug':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, opacity: 0.75 })}
          {r(-hw + 10, -hd + 10, w - 20, d - 20, { ...line, style: { stroke: color2 }, strokeWidth: px * 2 })}
        </g>
      )
    case 'fireplace':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          <path d={`M ${-hw * 0.55} ${-hd + 4} H ${hw * 0.55} L ${hw * 0.4} ${hd} H ${-hw * 0.4} Z`} {...accent} />
        </g>
      )
    case 'piano':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw + 6, hd - d * 0.28, w - 12, d * 0.28, { className: 'sym-body', style: { fill: color2 }, strokeWidth: px })}
        </g>
      )
    case 'base-cabinet':
    case 'island':
      return (
        <g>
          {r(-hw, -hd, w, d, accent)}
          <path d={`M ${-hw} ${hd - 4} H ${hw}`} {...line} />
          {shape === 'island' && <path d={`M ${-hw} ${-hd + 4} H ${hw}`} {...line} />}
          {w > 70 &&
            Array.from({ length: Math.round(w / 61) - 1 }, (_, i) => (
              <path key={i} d={`M ${-hw + ((i + 1) * w) / Math.round(w / 61)} ${-hd} V ${hd}`} {...line} opacity={0.35} />
            ))}
        </g>
      )
    case 'wall-cabinet':
    case 'hood':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...dashed })}
          <path d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} {...dashed} opacity={0.5} />
        </g>
      )
    case 'tall-cabinet':
    case 'appliance-box':
    case 'box':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          <path d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} {...line} opacity={0.5} />
        </g>
      )
    case 'sink-cabinet':
      return (
        <g>
          {r(-hw, -hd, w, d, accent)}
          {r(-hw * 0.6, -hd * 0.55, w * 0.6, d * 0.7, { ...line, rx: 8, className: 'sym-soft' })}
          <circle cx={0} cy={-hd * 0.7} r={2.5} {...line} />
        </g>
      )
    case 'range': {
      const cx = w * 0.22
      const cy = d * 0.2
      const br = Math.min(w, d) * 0.13
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {[
            [-cx, -cy],
            [cx, -cy],
            [-cx, cy],
            [cx, cy],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={br} {...line} />
          ))}
        </g>
      )
    }
    case 'fridge':
    case 'dishwasher':
    case 'washer':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          <path d={`M ${-hw} ${hd - 5} H ${hw}`} {...line} />
          {shape === 'washer' ? (
            <circle cx={0} cy={-2} r={Math.min(w, d) * 0.3} {...line} />
          ) : (
            <text x={0} y={0} className="sym-text" fontSize={Math.min(w, d) * 0.24} textAnchor="middle" dominantBaseline="middle">
              {shape === 'fridge' ? 'REF' : 'DW'}
            </text>
          )}
          {shape === 'fridge' && w > 80 && <path d={`M 0 ${hd - 5} V ${hd - 20}`} {...line} />}
        </g>
      )
    case 'cylinder':
      return <circle cx={0} cy={0} r={Math.min(hw, hd)} {...body} />
    case 'toilet':
      return (
        <g>
          {r(-hw, -hd, w, d * 0.28, { ...body, rx: 3 })}
          <ellipse cx={0} cy={-hd + d * 0.28 + d * 0.33} rx={hw * 0.9} ry={d * 0.36} {...body} />
          <ellipse cx={0} cy={-hd + d * 0.28 + d * 0.36} rx={hw * 0.55} ry={d * 0.24} {...line} />
        </g>
      )
    case 'vanity': {
      const n = w > 120 ? 2 : 1
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {Array.from({ length: n }, (_, i) => (
            <ellipse key={i} cx={-hw + ((i + 0.5) * w) / n} cy={2} rx={Math.min(w / n, 60) * 0.3} ry={d * 0.28} className="sym-soft" strokeWidth={px} style={{ fill: color2 }} />
          ))}
        </g>
      )
    }
    case 'bathtub':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw + 7, -hd + 7, w - 14, d - 14, { ...line, rx: Math.min(w, d) * 0.3, className: 'sym-soft', style: { fill: color2 } })}
          <circle cx={-hw + 22} cy={0} r={2.5} {...line} />
        </g>
      )
    case 'tub-free':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: Math.min(w, d) * 0.48 })}
          {r(-hw + 8, -hd + 8, w - 16, d - 16, { ...line, rx: Math.min(w, d) * 0.4 })}
        </g>
      )
    case 'shower':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, opacity: 0.8 })}
          <path d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} {...line} opacity={0.45} />
          <circle cx={0} cy={0} r={4} {...line} />
          <path d={`M ${-hw} ${hd} H ${hw}`} {...line} strokeWidth={px * 2.5} style={{ stroke: color2 }} />
        </g>
      )
    case 'floor-lamp':
    case 'table-lamp':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} {...body} />
          <path d={`M ${-hw * 0.6} 0 H ${hw * 0.6} M 0 ${-hd * 0.6} V ${hd * 0.6}`} {...line} />
        </g>
      )
    case 'pendant':
    case 'chandelier':
    case 'ceiling-light':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} {...dashed} />
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.35} {...line} />
          {[0, 45, 90, 135].map((a) => (
            <path key={a} d={`M ${-hw * 0.7} 0 H ${hw * 0.7}`} transform={`rotate(${a})`} {...line} opacity={0.4} />
          ))}
        </g>
      )
    case 'plant':
    case 'shrub':
    case 'tree': {
      const R = Math.min(hw, hd)
      const lobes = shape === 'tree' ? 11 : 8
      let dpath = ''
      for (let i = 0; i < lobes; i++) {
        const a0 = (i / lobes) * Math.PI * 2
        const a1 = ((i + 1) / lobes) * Math.PI * 2
        const x0 = Math.cos(a0) * R * 0.82
        const y0 = Math.sin(a0) * R * 0.82
        const x1 = Math.cos(a1) * R * 0.82
        const y1 = Math.sin(a1) * R * 0.82
        const am = (a0 + a1) / 2
        dpath += `${i === 0 ? `M ${x0} ${y0}` : ''} Q ${Math.cos(am) * R * 1.12} ${Math.sin(am) * R * 1.12} ${x1} ${y1} `
      }
      return (
        <g>
          <path d={dpath + 'Z'} {...body} opacity={shape === 'tree' ? 0.7 : 1} />
          {shape !== 'shrub' && <circle cx={0} cy={0} r={R * (shape === 'tree' ? 0.08 : 0.3)} {...line} style={{ fill: color2 }} />}
        </g>
      )
    }
    case 'car':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: w * 0.25 })}
          {r(-hw + 12, -hd + d * 0.3, w - 24, d * 0.42, { ...line, rx: 12 })}
          <path d={`M ${-hw + 14} ${-hd + d * 0.3} Q 0 ${-hd + d * 0.24} ${hw - 14} ${-hd + d * 0.3}`} {...line} />
        </g>
      )
    case 'lounger':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: 6 })}
          <path d={`M ${-hw} ${-hd + d * 0.3} H ${hw}`} {...line} />
        </g>
      )
    case 'grill':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw * 0.45, -hd + 5, w * 0.45, d - 10, { ...line })}
          {[-0.3, -0.15, 0].map((f) => (
            <path key={f} d={`M ${-hw * 0.4} ${hd * f * 2} H ${-hw * 0.05 + hw * 0.4}`} {...line} opacity={0.5} />
          ))}
        </g>
      )
    case 'hot-tub':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: 20 })}
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.72} className="sym-soft" strokeWidth={px} style={{ fill: color2 }} />
        </g>
      )
    case 'pool':
      return (
        <g>
          {r(-hw, -hd, w, d, { ...body, rx: 10 })}
          {r(-hw + 30, -hd + 30, w - 60, d - 60, { className: 'sym-soft', strokeWidth: px, style: { fill: color2 }, rx: 6 })}
        </g>
      )
    case 'stairs': {
      const steps = Math.max(3, Math.round(d / 26))
      const sd = d / steps
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {Array.from({ length: steps - 1 }, (_, i) => (
            <path key={i} d={`M ${-hw} ${-hd + (i + 1) * sd} H ${hw}`} {...line} />
          ))}
          <path d={`M 0 ${hd - sd * 0.5} V ${-hd + sd * 0.8} M ${-w * 0.14} ${-hd + sd * 1.8} L 0 ${-hd + sd * 0.8} L ${w * 0.14} ${-hd + sd * 1.8}`} {...line} strokeWidth={px * 1.8} />
          <text x={0} y={hd - sd * 1.6} className="sym-text" fontSize={Math.min(w * 0.18, 20)} textAnchor="middle" dominantBaseline="middle" transform={`rotate(0)`}>
            UP
          </text>
        </g>
      )
    }
    case 'column':
      return r(-hw, -hd, w, d, { ...body, className: 'sym-solid' })
    case 'plate':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.max(Math.max(hw, hd) * 1.6, 5 * px)} {...body} />
          <path d={`M ${-Math.max(hw, 3 * px)} 0 H ${Math.max(hw, 3 * px)}`} {...line} />
        </g>
      )
    case 'fan':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.15} {...body} />
          {Array.from({ length: 5 }, (_, i) => (
            <ellipse key={i} cx={Math.min(hw, hd) * 0.55} cy={0} rx={Math.min(hw, hd) * 0.42} ry={Math.min(hw, hd) * 0.08} transform={`rotate(${i * 72})`} {...dashed} />
          ))}
        </g>
      )
    case 'bench':
    case 'shelf':
    case 'towel-rack':
      return r(-hw, -hd, w, d, { ...body, rx: 2 })
    case 'sconce':
      return (
        <g>
          <path d={`M ${-hw} ${-hd} H ${hw} L ${hw * 0.6} ${hd} H ${-hw * 0.6} Z`} {...body} />
        </g>
      )
    case 'fence':
    case 'railing': {
      const n = Math.max(2, Math.round(w / (shape === 'fence' ? 12 : 12)))
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {Array.from({ length: n - 1 }, (_, i) => (
            <path key={i} d={`M ${-hw + ((i + 1) * w) / n} ${-hd} V ${hd}`} {...line} opacity={0.5} />
          ))}
        </g>
      )
    }
    case 'pergola': {
      const n = Math.max(4, Math.round(w / 40))
      return (
        <g>
          {r(-hw, -hd, w, d, { ...dashed })}
          {Array.from({ length: n + 1 }, (_, i) => (
            <path key={i} d={`M ${-hw + (i * w) / n} ${-hd - 20} V ${hd + 20}`} {...line} style={{ stroke: color2 }} strokeWidth={px * 2} />
          ))}
          {[
            [-hw, -hd],
            [hw - 15, -hd],
            [-hw, hd - 15],
            [hw - 15, hd - 15],
          ].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={15} height={15} className="sym-solid" />
          ))}
        </g>
      )
    }
    case 'fire-pit':
      return (
        <g>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} {...body} />
          <circle cx={0} cy={0} r={Math.min(hw, hd) * 0.7} className="sym-soft" strokeWidth={px} style={{ fill: color2 }} />
        </g>
      )
    case 'garden-bed':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          {r(-hw + 5, -hd + 5, w - 10, d - 10, { className: 'sym-soft', strokeWidth: px, style: { fill: color2 } })}
        </g>
      )
    case 'shed':
      return (
        <g>
          {r(-hw, -hd, w, d, body)}
          <path d={`M ${-hw} 0 H ${hw}`} {...line} />
          <path d={`M ${-w * 0.15} ${hd} H ${w * 0.15}`} {...line} strokeWidth={px * 3} />
        </g>
      )
    case 'umbrella': {
      const R = Math.min(hw, hd)
      return (
        <g>
          <polygon points={Array.from({ length: 8 }, (_, i) => `${Math.cos((i * Math.PI) / 4) * R},${Math.sin((i * Math.PI) / 4) * R}`).join(' ')} {...body} opacity={0.7} />
          {Array.from({ length: 4 }, (_, i) => (
            <path key={i} d={`M ${-Math.cos((i * Math.PI) / 4) * R} ${-Math.sin((i * Math.PI) / 4) * R} L ${Math.cos((i * Math.PI) / 4) * R} ${Math.sin((i * Math.PI) / 4) * R}`} {...line} opacity={0.5} />
          ))}
        </g>
      )
    }
    default:
      return r(-hw, -hd, w, d, body)
  }
}
