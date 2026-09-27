/**
 * Procedural 3D furniture. Every shape is built from a few unit primitives
 * scaled into place, so any item can be resized freely and stays in
 * proportion. Local frame (metres): x = width, y = up from the item's base,
 * z = depth with the front at +z.
 */

export type Prim = 'box' | 'cyl' | 'sph' | 'cone'

export interface Part {
  g: Prim
  p: [number, number, number]
  s: [number, number, number]
  c: string
  r?: [number, number, number]
  o?: number
  e?: number
  rough?: number
  metal?: number
}

import { stairFlight } from '../model/catalog'

type C = string

const DARK = '#1E1F21'
const METAL = '#9A9EA2'
const WHITE = '#F3F2EE'
const BULB = '#FFE7B0'

/** Box from min/max corners. */
function B(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: C, extra: Partial<Part> = {}): Part {
  return {
    g: 'box',
    p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    s: [Math.max(0.001, Math.abs(x1 - x0)), Math.max(0.001, Math.abs(y1 - y0)), Math.max(0.001, Math.abs(z1 - z0))],
    c,
    ...extra,
  }
}

/** Vertical cylinder centred at (x, z) spanning y0..y1 with diameters dx, dz. */
function Cy(x: number, z: number, y0: number, y1: number, dx: number, dz: number, c: C, extra: Partial<Part> = {}): Part {
  return { g: 'cyl', p: [x, (y0 + y1) / 2, z], s: [dx, Math.max(0.001, y1 - y0), dz], c, ...extra }
}

function S(x: number, y: number, z: number, dx: number, dy: number, dz: number, c: C, extra: Partial<Part> = {}): Part {
  return { g: 'sph', p: [x, y, z], s: [dx, dy, dz], c, ...extra }
}

function legs(W: number, D: number, h: number, c: C, inset = 0.04, t = 0.04): Part[] {
  const x = W / 2 - inset - t / 2
  const z = D / 2 - inset - t / 2
  return [
    B(-x - t / 2, 0, -z - t / 2, -x + t / 2, h, -z + t / 2, c),
    B(x - t / 2, 0, -z - t / 2, x + t / 2, h, -z + t / 2, c),
    B(-x - t / 2, 0, z - t / 2, -x + t / 2, h, z + t / 2, c),
    B(x - t / 2, 0, z - t / 2, x + t / 2, h, z + t / 2, c),
  ]
}

function seeded(n: number) {
  let s = n
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function shade(hex: string): string {
  const v = parseInt(hex.replace('#', ''), 16)
  const k = (c: number) => Math.round(c * 0.75)
  return `#${[k((v >> 16) & 255), k((v >> 8) & 255), k(v & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function buildParts(shape: string, W: number, D: number, H: number, c1: C, c2: C): Part[] {
  const hw = W / 2
  const hd = D / 2
  switch (shape) {
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(0.2, W * 0.14)
      const back = Math.min(0.22, D * 0.26)
      const seatTop = Math.min(0.45, H * 0.52)
      const seats = shape === 'armchair' ? 1 : W > 1.8 ? 3 : 2
      const sw = (W - arm * 2) / seats
      const parts: Part[] = [
        B(-hw, 0.06, -hd, hw, seatTop - 0.12, hd, c1),
        B(-hw, 0.06, -hd, -hw + arm, Math.min(H * 0.72, 0.64), hd, c1),
        B(hw - arm, 0.06, -hd, hw, Math.min(H * 0.72, 0.64), hd, c1),
        B(-hw + arm * 0.6, 0.06, -hd, hw - arm * 0.6, H, -hd + back, c1),
        ...legs(W, D, 0.06, c2, 0.05, 0.04),
      ]
      for (let i = 0; i < seats; i++) {
        const x0 = -hw + arm + i * sw
        parts.push(B(x0 + 0.01, seatTop - 0.12, -hd + back, x0 + sw - 0.01, seatTop, hd - 0.02, c1, { rough: 1 }))
        parts.push(B(x0 + 0.02, seatTop, -hd + back - 0.02, x0 + sw - 0.02, H - 0.04, -hd + back + 0.12, c1, { r: [-0.18, 0, 0] }))
      }
      return parts
    }
    case 'sectional': {
      const back = 0.22
      const seat = Math.min(D, 0.95)
      const chaise = Math.min(W * 0.34, 0.95)
      const arm = 0.18
      const st = 0.45
      return [
        B(-hw, 0.06, -hd, hw, st - 0.12, -hd + seat, c1),
        B(-hw, 0.06, -hd, -hw + chaise, st - 0.12, hd, c1),
        B(-hw, 0.06, -hd, hw, H, -hd + back, c1),
        B(-hw, 0.06, -hd, -hw + back, H * 0.75, hd, c1),
        B(hw - arm, 0.06, -hd, hw, 0.62, -hd + seat, c1),
        B(-hw + back, st - 0.12, -hd + back, hw - arm, st, -hd + seat, c1, { rough: 1 }),
        B(-hw + back, st - 0.12, -hd + seat, -hw + chaise, st, hd, c1, { rough: 1 }),
        B(-hw + back, 0, hd - 0.08, -hw + back + 0.04, 0.06, hd - 0.04, c2),
        B(hw - 0.08, 0, -hd + 0.04, hw - 0.04, 0.06, -hd + 0.08, c2),
      ]
    }
    case 'ottoman':
      return [B(-hw, 0.06, -hd, hw, H, hd, c1), ...legs(W, D, 0.06, c2, 0.04, 0.035)]
    case 'table':
    case 'table-low':
    case 'desk': {
      const top = 0.035
      const parts = [B(-hw, H - top, -hd, hw, H, hd, c1), ...legs(W, D, H - top, c2, 0.05, 0.05)]
      if (shape === 'table-low') parts.push(B(-hw + 0.08, 0.1, -hd + 0.08, hw - 0.08, 0.13, hd - 0.08, c1))
      if (shape === 'desk') parts.push(B(hw - 0.45, H - 0.18, -hd + 0.05, hw - 0.06, H - top, hd - 0.02, c1))
      return parts
    }
    case 'desk-l': {
      const d = Math.min(0.7, D * 0.45)
      return [
        B(-hw, H - 0.035, -hd, hw, H, -hd + d, c1),
        B(hw - d, H - 0.035, -hd + d, hw, H, hd, c1),
        B(-hw + 0.04, 0, -hd + 0.04, -hw + 0.08, H - 0.035, -hd + d - 0.04, c2),
        B(hw - d + 0.04, 0, hd - 0.08, hw - 0.04, H - 0.035, hd - 0.04, c2),
        B(hw - 0.08, 0, -hd + 0.04, hw - 0.04, H - 0.035, -hd + d, c2),
      ]
    }
    case 'round-table':
      return [Cy(0, 0, H - 0.035, H, W, D, c1), Cy(0, 0, 0.03, H - 0.035, 0.1, 0.1, c2), Cy(0, 0, 0, 0.03, W * 0.45, D * 0.45, c2)]
    case 'side-table':
      return [B(-hw, H - 0.03, -hd, hw, H, hd, c1), B(-hw + 0.04, 0.12, -hd + 0.04, hw - 0.04, 0.14, hd - 0.04, c1), ...legs(W, D, H - 0.03, c2, 0.02, 0.03)]
    case 'nightstand':
    case 'cabinet-low':
    case 'dresser': {
      const plinth = 0.08
      const parts: Part[] = [B(-hw, plinth, -hd, hw, H, hd, c1), ...legs(W, D, plinth, c2, 0.04, 0.04)]
      const rows = shape === 'cabinet-low' ? 1 : Math.max(2, Math.round((H - plinth) / 0.22))
      const cols = shape === 'dresser' && W > 1 ? 2 : shape === 'cabinet-low' ? Math.max(2, Math.round(W / 0.5)) : 1
      for (let r = 1; r < rows; r++) {
        const y = plinth + ((H - plinth) * r) / rows
        parts.push(B(-hw + 0.01, y - 0.004, hd, hw - 0.01, y + 0.004, hd + 0.004, DARK))
      }
      for (let c = 1; c < cols; c++) {
        const x = -hw + (W * c) / cols
        parts.push(B(x - 0.004, plinth + 0.01, hd, x + 0.004, H - 0.01, hd + 0.004, DARK))
      }
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const y = plinth + ((H - plinth) * (r + 0.5)) / rows
          const x = -hw + (W * (c + 0.5)) / cols
          parts.push(B(x - 0.06, y - 0.008, hd, x + 0.06, y + 0.008, hd + 0.02, c2, { metal: 0.6, rough: 0.4 }))
        }
      return parts
    }
    case 'wardrobe':
    case 'tall-cabinet': {
      const doors = Math.max(2, Math.round(W / 0.5))
      const parts: Part[] = [B(-hw, 0, -hd, hw, H, hd, c1)]
      for (let i = 1; i < doors; i++) {
        const x = -hw + (W * i) / doors
        parts.push(B(x - 0.004, 0.02, hd, x + 0.004, H - 0.02, hd + 0.004, DARK))
      }
      for (let i = 0; i < doors; i++) {
        const x = -hw + (W * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (W / doors) * 0.38
        parts.push(B(x - 0.01, H * 0.45, hd, x + 0.01, H * 0.6, hd + 0.025, c2, { metal: 0.6, rough: 0.4 }))
      }
      return parts
    }
    case 'tv':
      return [B(-hw, 0, -hd, hw, H, hd, c1, { rough: 0.3 }), B(-hw + 0.01, 0.01, hd, hw - 0.01, H - 0.01, hd + 0.002, c2, { rough: 0.15, metal: 0.2 })]
    case 'bookshelf': {
      const t = 0.025
      const shelves = Math.max(2, Math.round(H / 0.36))
      const parts: Part[] = [
        B(-hw, 0, -hd, -hw + t, H, hd, c1),
        B(hw - t, 0, -hd, hw, H, hd, c1),
        B(-hw, 0, -hd, hw, H, -hd + 0.012, c1),
      ]
      const rand = seeded(Math.round(W * 1000 + H * 100))
      const colors = ['#8E3B2E', '#27394F', '#C99A2E', '#2F4A3A', '#D9CFBE', '#4A4E52', '#B3BFA6', '#A5532F']
      for (let i = 0; i <= shelves; i++) {
        const y = (H * i) / shelves
        parts.push(B(-hw + t, Math.max(0, y - t), -hd, hw - t, Math.max(t, y), hd, c1))
        if (i < shelves) {
          let x = -hw + t + 0.01
          const top = (H * (i + 1)) / shelves - t
          while (x < hw - t - 0.04) {
            const bw = 0.02 + rand() * 0.035
            const bh = Math.min(top - y - 0.01, (0.18 + rand() * 0.12) * Math.min(1, (top - y) / 0.3))
            if (rand() > 0.12) parts.push(B(x, y, -hd + 0.03, x + bw, y + bh, hd - 0.03 - rand() * 0.05, colors[Math.floor(rand() * colors.length)]))
            x += bw + 0.003
          }
        }
      }
      return parts
    }
    case 'rug':
      return [B(-hw, 0, -hd, hw, 0.008, hd, c2, { rough: 1 }), B(-hw + 0.08, 0.008, -hd + 0.08, hw - 0.08, 0.012, hd - 0.08, c1, { rough: 1 })]
    case 'fireplace':
      return [
        B(-hw, 0, -hd, hw, H, hd, c1),
        B(-hw * 0.55, 0.12, hd - 0.01, hw * 0.55, H * 0.62, hd + 0.002, c2, { rough: 0.9 }),
        B(-hw - 0.05, H, -hd, hw + 0.05, H + 0.05, hd + 0.05, c1),
        B(-hw * 0.4, 0.14, hd - 0.05, hw * 0.4, 0.2, hd - 0.02, '#FF8A3D', { e: 1.2 }),
      ]
    case 'piano':
      return [
        B(-hw, 0.05, -hd, hw, H, -hd + D * 0.55, c1, { rough: 0.25 }),
        B(-hw, 0.62, -hd, hw, 0.72, hd, c1, { rough: 0.25 }),
        B(-hw + 0.06, 0.72, hd - 0.2, hw - 0.06, 0.74, hd - 0.02, c2),
        B(-hw, 0, -hd, -hw + 0.05, 0.72, hd, c1),
        B(hw - 0.05, 0, -hd, hw, 0.72, hd, c1),
      ]
    case 'bed':
    case 'bunk': {
      const parts: Part[] = []
      const tiers = shape === 'bunk' ? [0, H * 0.58] : [0]
      for (const y0 of tiers) {
        const frameTop = y0 + 0.32
        parts.push(B(-hw, y0 + 0.1, -hd, hw, frameTop, hd, c2))
        parts.push(B(-hw + 0.02, frameTop, -hd + 0.03, hw - 0.02, frameTop + 0.2, hd - 0.02, WHITE, { rough: 1 }))
        parts.push(B(-hw + 0.01, frameTop + 0.12, -hd + D * 0.3, hw - 0.01, frameTop + 0.23, hd + 0.01, c1, { rough: 1 }))
        const n = W > 1.2 ? 2 : 1
        const pw = (W - 0.16 - (n - 1) * 0.04) / n
        for (let i = 0; i < n; i++) {
          const x0 = -hw + 0.08 + i * (pw + 0.04)
          parts.push(B(x0, frameTop + 0.2, -hd + 0.08, x0 + pw, frameTop + 0.33, -hd + 0.08 + Math.min(0.5, D * 0.2), WHITE, { rough: 1 }))
        }
        parts.push(...legs(W, D, y0 + 0.1, c2, 0.02, 0.05))
      }
      parts.push(B(-hw, 0.1, -hd - 0.06, hw, H, -hd, c2))
      if (shape === 'bunk') {
        parts.push(B(-hw, 0, -hd - 0.06, -hw + 0.05, H, hd, c2), B(hw - 0.05, 0, hd - 0.05, hw, H, hd, c2))
        for (let i = 1; i < 6; i++) parts.push(B(hw - 0.05, (H * i) / 6 - 0.015, hd - 0.04, hw, (H * i) / 6 + 0.015, hd, c2))
      }
      return parts
    }
    case 'crib': {
      const parts: Part[] = [B(-hw, 0.25, -hd, hw, 0.37, hd, WHITE, { rough: 1 })]
      for (const [x, z] of [
        [-hw, -hd],
        [hw - 0.04, -hd],
        [-hw, hd - 0.04],
        [hw - 0.04, hd - 0.04],
      ])
        parts.push(B(x, 0, z, x + 0.04, H, z + 0.04, c1))
      for (const z of [-hd, hd - 0.03]) parts.push(B(-hw, H - 0.04, z, hw, H, z + 0.03, c1), B(-hw, 0.2, z, hw, 0.24, z + 0.03, c1))
      const n = Math.round(W / 0.07)
      for (let i = 1; i < n; i++) {
        const x = -hw + (W * i) / n
        for (const z of [-hd, hd - 0.02]) parts.push(B(x - 0.01, 0.24, z, x + 0.01, H - 0.04, z + 0.02, c1))
      }
      return parts
    }
    case 'chair': {
      const seatY = 0.45
      return [
        ...legs(W, D, seatY - 0.03, c1, 0.02, 0.035),
        B(-hw, seatY - 0.03, -hd, hw, seatY, hd, c1),
        B(-hw + 0.02, seatY, -hd + 0.06, hw - 0.02, seatY + 0.03, hd - 0.02, c2, { rough: 1 }),
        B(-hw, seatY, -hd, hw, H, -hd + 0.035, c1),
      ]
    }
    case 'stool':
      return [
        Cy(0, 0, H - 0.05, H, W, D, c2),
        ...legs(W * 0.85, D * 0.85, H - 0.05, c1, 0.02, 0.025),
        B(-W * 0.35, 0.26, D * 0.33, W * 0.35, 0.28, D * 0.36, c1),
      ]
    case 'office-chair':
      return [
        Cy(0, 0, 0.02, 0.07, W * 0.9, D * 0.9, c2, { metal: 0.6 }),
        Cy(0, 0, 0.07, 0.45, 0.05, 0.05, c2, { metal: 0.8 }),
        B(-hw * 0.8, 0.45, -hd * 0.7, hw * 0.8, 0.52, hd * 0.8, c1),
        B(-hw * 0.7, 0.55, -hd * 0.85, hw * 0.7, H, -hd * 0.72, c1, { r: [-0.08, 0, 0] }),
      ]
    case 'base-cabinet':
    case 'island':
    case 'sink-cabinet': {
      const kick = 0.1
      const top = 0.035
      const parts: Part[] = [
        B(-hw, 0, -hd, hw, kick, hd - 0.06, DARK),
        B(-hw, kick, -hd, hw, H - top, hd - 0.02, c1),
        B(-hw - 0.005, H - top, -hd - (shape === 'island' ? 0.25 : 0), hw + 0.005, H, hd + 0.01, c2, { rough: 0.35 }),
      ]
      const doors = Math.max(1, Math.round(W / 0.5))
      for (let i = 1; i < doors; i++) {
        const x = -hw + (W * i) / doors
        parts.push(B(x - 0.003, kick + 0.01, hd - 0.02, x + 0.003, H - top - 0.01, hd - 0.016, DARK))
      }
      parts.push(B(-hw + 0.01, H - top - 0.16, hd - 0.02, hw - 0.01, H - top - 0.154, hd - 0.016, DARK))
      for (let i = 0; i < doors; i++) {
        const x = -hw + (W * (i + 0.5)) / doors
        parts.push(B(x - 0.07, H - top - 0.09, hd - 0.02, x + 0.07, H - top - 0.075, hd + 0.005, METAL, { metal: 0.7, rough: 0.35 }))
      }
      if (shape === 'sink-cabinet') {
        parts.push(B(-W * 0.3, H - 0.004, -hd + 0.12, W * 0.3, H + 0.002, hd - 0.1, '#C8CCCF', { metal: 0.6, rough: 0.3 }))
        parts.push(Cy(0, -hd + 0.07, H, H + 0.28, 0.03, 0.03, METAL, { metal: 0.9, rough: 0.2 }))
        parts.push(B(-0.015, H + 0.26, -hd + 0.07, 0.015, H + 0.29, -hd + 0.25, METAL, { metal: 0.9, rough: 0.2 }))
      }
      return parts
    }
    case 'wall-cabinet': {
      const doors = Math.max(1, Math.round(W / 0.45))
      const parts: Part[] = [B(-hw, 0, -hd, hw, H, hd, c1)]
      for (let i = 1; i < doors; i++) {
        const x = -hw + (W * i) / doors
        parts.push(B(x - 0.003, 0.01, hd, x + 0.003, H - 0.01, hd + 0.004, DARK))
      }
      for (let i = 0; i < doors; i++) {
        const x = -hw + (W * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (W / doors) * 0.35
        parts.push(B(x - 0.008, 0.04, hd, x + 0.008, 0.16, hd + 0.02, c2, { metal: 0.7 }))
      }
      return parts
    }
    case 'range':
      return [
        B(-hw, 0, -hd, hw, H - 0.02, hd, c1, { metal: 0.6, rough: 0.35 }),
        B(-hw, H - 0.02, -hd, hw, H, hd, c2, { rough: 0.2 }),
        B(-hw + 0.06, 0.12, hd, hw - 0.06, H - 0.24, hd + 0.004, '#141516', { rough: 0.15 }),
        B(-hw + 0.08, H - 0.2, hd, hw - 0.08, H - 0.18, hd + 0.03, METAL, { metal: 0.9 }),
        B(-hw, H, -hd, hw, H + 0.12, -hd + 0.05, c1, { metal: 0.6 }),
        ...[
          [-0.18, -0.12],
          [0.18, -0.12],
          [-0.18, 0.14],
          [0.18, 0.14],
        ].map(([x, z]) => Cy(x * W, z * D, H, H + 0.012, 0.16, 0.16, '#2B2C2E')),
      ]
    case 'hood':
      return [B(-hw, 0, -hd, hw, H * 0.3, hd, c1, { metal: 0.7, rough: 0.3 }), B(-W * 0.18, H * 0.3, -hd, W * 0.18, H, -hd + D * 0.5, c1, { metal: 0.7, rough: 0.3 })]
    case 'fridge': {
      const split = W > 0.8
      return [
        B(-hw, 0, -hd, hw, H, hd, c1, { metal: 0.6, rough: 0.3 }),
        split ? B(-0.004, 0.02, hd, 0.004, H - 0.02, hd + 0.004, DARK) : B(-hw + 0.01, H * 0.62, hd, hw - 0.01, H * 0.62 + 0.008, hd + 0.004, DARK),
        B(-0.05, H * 0.35, hd, -0.03, H * 0.85, hd + 0.05, c2, { metal: 0.8 }),
        ...(split ? [B(0.03, H * 0.35, hd, 0.05, H * 0.85, hd + 0.05, c2, { metal: 0.8 })] : []),
      ]
    }
    case 'dishwasher':
      return [B(-hw, 0.1, -hd, hw, H, hd, c1, { metal: 0.6, rough: 0.3 }), B(-hw + 0.02, H - 0.1, hd, hw - 0.02, H - 0.08, hd + 0.03, c2, { metal: 0.8 }), B(-hw, 0, -hd, hw, 0.1, hd - 0.06, DARK)]
    case 'toilet':
      return [
        B(-hw, 0.4, -hd, hw, H, -hd + D * 0.26, c1, { rough: 0.2 }),
        S(0, 0.3, -hd + D * 0.58, W * 0.95, 0.4, D * 0.66, c1, { rough: 0.2 }),
        Cy(0, -hd + D * 0.5, 0, 0.26, W * 0.55, D * 0.45, c1, { rough: 0.2 }),
        Cy(0, -hd + D * 0.6, 0.4, 0.43, W * 0.92, D * 0.66, c2, { rough: 0.3 }),
      ]
    case 'vanity': {
      const n = W > 1.2 ? 2 : 1
      const parts: Part[] = [B(-hw, 0.12, -hd, hw, H - 0.03, hd, c1), B(-hw, 0, -hd, hw, 0.12, hd - 0.05, DARK), B(-hw - 0.01, H - 0.03, -hd, hw + 0.01, H, hd + 0.01, c2, { rough: 0.3 })]
      for (let i = 0; i < n; i++) {
        const x = -hw + (W * (i + 0.5)) / n
        parts.push(Cy(x, 0.02, H - 0.001, H + 0.004, Math.min(W / n, 0.6) * 0.62, D * 0.55, '#DADCDD', { rough: 0.25 }))
        parts.push(Cy(x, -hd + 0.06, H, H + 0.22, 0.03, 0.03, METAL, { metal: 0.9, rough: 0.2 }))
        parts.push(B(x - 0.012, H + 0.2, -hd + 0.06, x + 0.012, H + 0.225, -hd + 0.2, METAL, { metal: 0.9, rough: 0.2 }))
      }
      parts.push(B(-hw + 0.02, (H - 0.03) * 0.55, hd, hw - 0.02, (H - 0.03) * 0.55 + 0.006, hd + 0.004, DARK))
      return parts
    }
    case 'bathtub': {
      const t = 0.08
      return [
        B(-hw, 0, -hd, hw, 0.08, hd, c1),
        B(-hw, 0, -hd, hw, H, -hd + t, c1, { rough: 0.2 }),
        B(-hw, 0, hd - t, hw, H, hd, c1, { rough: 0.2 }),
        B(-hw, 0, -hd, -hw + t, H, hd, c1, { rough: 0.2 }),
        B(hw - t, 0, -hd, hw, H, hd, c1, { rough: 0.2 }),
        B(-hw + t, 0.08, -hd + t, hw - t, 0.1, hd - t, c2, { rough: 0.15 }),
        Cy(-hw + 0.12, -hd + t + 0.02, H - 0.1, H - 0.08, 0.05, 0.05, METAL, { metal: 0.9 }),
      ]
    }
    case 'tub-free':
      return [Cy(0, 0, 0.05, H, W, D, c1, { rough: 0.2 }), Cy(0, 0, H - 0.004, H + 0.002, W * 0.86, D * 0.76, '#DFE3E6', { rough: 0.1 }), Cy(0, 0, 0, 0.05, W * 0.8, D * 0.7, c2)]
    case 'shower':
      return [
        B(-hw, 0, -hd, hw, 0.06, hd, WHITE, { rough: 0.3 }),
        B(-hw, 0.06, hd - 0.01, hw * 0.1, H, hd, '#CFE3EA', { o: 0.25, rough: 0.05 }),
        B(hw * 0.1 - 0.02, 0.06, hd - 0.03, hw, H, hd - 0.02, '#CFE3EA', { o: 0.25, rough: 0.05 }),
        B(-hw, H - 0.02, hd - 0.02, hw, H, hd, c2, { metal: 0.8 }),
        Cy(0, -hd + 0.15, H - 0.12, H - 0.1, 0.22, 0.22, c2, { metal: 0.8 }),
        B(-0.01, H - 0.12, -hd, 0.01, H - 0.1, -hd + 0.15, c2, { metal: 0.8 }),
        B(-hw + 0.01, 0.06, -hd + 0.01, hw - 0.01, H, -hd + 0.02, c1, { rough: 0.3 }),
      ]
    case 'mirror':
      return [B(-hw, 0, -hd, hw, H, hd, c2), B(-hw + 0.02, 0.02, hd, hw - 0.02, H - 0.02, hd + 0.002, c1, { metal: 1, rough: 0.05 })]
    case 'washer':
      return [
        B(-hw, 0, -hd, hw, H, hd, c1, { rough: 0.3 }),
        { g: 'cyl', p: [0, H * 0.45, hd], s: [W * 0.62, 0.03, W * 0.62], c: c2, r: [Math.PI / 2, 0, 0], rough: 0.1 },
        B(-hw + 0.02, H - 0.14, hd, hw - 0.02, H - 0.02, hd + 0.004, '#D5D8DA'),
      ]
    case 'cylinder':
      return [Cy(0, 0, 0, H, W, D, c1, { rough: 0.4 }), Cy(0, 0, H, H + 0.03, W * 0.7, D * 0.7, c2, { metal: 0.7 }), Cy(0, 0, H, H + 0.25, 0.05, 0.05, c2, { metal: 0.7 })]
    case 'appliance-box':
      return [B(-hw, 0, -hd, hw, H, hd, c1, { metal: 0.3 }), ...Array.from({ length: 6 }, (_, i) => B(-hw + 0.05, H * 0.55 + i * 0.05, hd, hw - 0.05, H * 0.55 + i * 0.05 + 0.012, hd + 0.005, c2))]
    case 'floor-lamp':
      return [
        Cy(0, 0, 0, 0.03, W * 0.7, D * 0.7, c2, { metal: 0.7 }),
        Cy(0, 0, 0.03, H - 0.3, 0.025, 0.025, c2, { metal: 0.7 }),
        { g: 'cone', p: [0, H - 0.16, 0], s: [W, 0.3, D], c: c1, e: 0.5 },
        S(0, H - 0.2, 0, 0.08, 0.08, 0.08, BULB, { e: 2 }),
      ]
    case 'table-lamp':
      return [Cy(0, 0, 0, H * 0.5, W * 0.4, D * 0.4, c2, { metal: 0.5 }), { g: 'cone', p: [0, H * 0.72, 0], s: [W, H * 0.45, D], c: c1, e: 0.6 }]
    case 'pendant':
      return [Cy(0, 0, H * 0.35, H, 0.012, 0.012, DARK), { g: 'cone', p: [0, H * 0.2, 0], s: [W, H * 0.4, D], c: c1 }, S(0, 0.03, 0, 0.1, 0.1, 0.1, c2, { e: 3 })]
    case 'chandelier': {
      const parts: Part[] = [Cy(0, 0, H * 0.5, H, 0.02, 0.02, c1, { metal: 0.8 }), S(0, H * 0.45, 0, 0.12, 0.16, 0.12, c1, { metal: 0.8, rough: 0.3 })]
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        const x = (Math.cos(a) * W) / 2.3
        const z = (Math.sin(a) * D) / 2.3
        parts.push(B(Math.min(0, x), H * 0.4, Math.min(0, z) - 0.008, Math.max(0, x), H * 0.42, Math.max(0, z) + 0.008, c1, { metal: 0.8 }))
        parts.push(Cy(x, z, H * 0.4, H * 0.5, 0.03, 0.03, WHITE), S(x, H * 0.55, z, 0.05, 0.08, 0.05, c2, { e: 2.5 }))
      }
      return parts
    }
    case 'ceiling-light':
      return [Cy(0, 0, 0, H, W, D, c1, { e: 0.8 }), Cy(0, 0, -0.005, 0.002, W * 0.8, D * 0.8, c2, { e: 2 })]
    case 'plant': {
      const potH = Math.min(0.4, H * 0.3)
      const parts: Part[] = [Cy(0, 0, 0, potH, W * 0.55, D * 0.55, c2, { rough: 0.8 })]
      const rand = seeded(Math.round(H * 997))
      const n = 6
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand()
        const rr = 0.25 * W
        const y = potH + (H - potH) * (0.35 + rand() * 0.5)
        parts.push(S(Math.cos(a) * rr, y, Math.sin(a) * rr, W * 0.6, (H - potH) * 0.45, D * 0.6, c1, { rough: 0.9 }))
      }
      parts.push(S(0, H - (H - potH) * 0.2, 0, W * 0.55, (H - potH) * 0.4, D * 0.55, c1, { rough: 0.9 }))
      return parts
    }
    case 'art':
      return [B(-hw, 0, -hd, hw, H, hd, c2), B(-hw + 0.03, 0.03, hd, hw - 0.03, H - 0.03, hd + 0.003, c1, { rough: 0.8 }), B(-hw * 0.4, H * 0.3, hd + 0.003, hw * 0.1, H * 0.7, hd + 0.005, '#27394F')]
    case 'curtain': {
      const folds = Math.max(4, Math.round(W / 0.12))
      const parts: Part[] = [{ g: 'cyl', p: [0, H - 0.02, 0], s: [0.025, W + 0.1, 0.025], c: c2, r: [0, 0, Math.PI / 2], metal: 0.7 }]
      for (let i = 0; i < folds; i++) {
        const x = -hw + (W * (i + 0.5)) / folds
        parts.push(Cy(x, i % 2 ? 0.02 : -0.02, 0.02, H - 0.05, (W / folds) * 1.2, D * 0.5, c1, { rough: 1 }))
      }
      return parts
    }
    case 'tree': {
      const trunkH = H * 0.4
      return [
        Cy(0, 0, 0, trunkH + H * 0.2, W * 0.08, D * 0.08, c2, { rough: 1 }),
        S(0, trunkH + (H - trunkH) * 0.45, 0, W, (H - trunkH) * 0.9, D, c1, { rough: 1 }),
        S(W * 0.18, trunkH + (H - trunkH) * 0.7, -D * 0.1, W * 0.65, (H - trunkH) * 0.6, D * 0.65, c1, { rough: 1 }),
        S(-W * 0.2, trunkH + (H - trunkH) * 0.3, D * 0.12, W * 0.6, (H - trunkH) * 0.55, D * 0.6, c1, { rough: 1 }),
      ]
    }
    case 'shrub':
      return [S(0, H * 0.5, 0, W, H, D, c1, { rough: 1 }), S(W * 0.2, H * 0.6, 0, W * 0.6, H * 0.8, D * 0.6, c1, { rough: 1 })]
    case 'car': {
      const wheel = 0.66
      const parts: Part[] = [
        B(-hw, 0.2, -hd, hw, H * 0.5, hd, c1, { metal: 0.5, rough: 0.35 }),
        B(-hw + 0.08, H * 0.5, -hd + D * 0.26, hw - 0.08, H * 0.94, hd - D * 0.22, c2, { rough: 0.1, metal: 0.3 }),
        B(-hw + 0.1, H * 0.92, -hd + D * 0.3, hw - 0.1, H, hd - D * 0.26, c1, { metal: 0.5, rough: 0.35 }),
      ]
      for (const z of [-hd + D * 0.18, hd - D * 0.18])
        for (const x of [-hw + 0.1, hw - 0.1]) parts.push({ g: 'cyl', p: [x, wheel / 2, z], s: [wheel, 0.22, wheel], c: '#161718', r: [0, 0, Math.PI / 2] })
      parts.push(B(-hw + 0.1, H * 0.32, hd, -hw + 0.35, H * 0.4, hd + 0.01, '#FFF5D6', { e: 1 }), B(hw - 0.35, H * 0.32, hd, hw - 0.1, H * 0.4, hd + 0.01, '#FFF5D6', { e: 1 }))
      return parts
    }
    case 'lounger':
      return [
        ...legs(W, D, 0.2, c2, 0.03, 0.04),
        B(-hw, 0.2, -hd + D * 0.3, hw, 0.3, hd, c1, { rough: 1 }),
        { g: 'box', p: [0, 0.45, -hd + D * 0.15], s: [W, 0.08, D * 0.36], c: c1, r: [0.9, 0, 0], rough: 1 },
      ]
    case 'grill':
      return [
        ...legs(W * 0.6, D, 0.6, c2, 0.03, 0.04),
        B(-W * 0.3, 0.6, -hd, W * 0.3, 0.9, hd, c1, { metal: 0.4, rough: 0.4 }),
        { g: 'cyl', p: [0, 0.92, 0], s: [D, W * 0.6, D * 0.8], c: c1, r: [0, 0, Math.PI / 2], metal: 0.4, rough: 0.4 },
        B(-hw, 0.85, -hd, -W * 0.3, 0.88, hd, c2, { metal: 0.7 }),
        B(W * 0.3, 0.85, -hd, hw, 0.88, hd, c2, { metal: 0.7 }),
      ]
    case 'hot-tub':
      return [B(-hw, 0, -hd, hw, H, hd, c1, { rough: 0.8 }), B(-hw + 0.12, H - 0.08, -hd + 0.12, hw - 0.12, H - 0.06, hd - 0.12, c2, { rough: 0.05, o: 0.85 })]
    case 'pool':
      return [
        B(-hw, 0, -hd, hw, 0.04, -hd + 0.3, c1),
        B(-hw, 0, hd - 0.3, hw, 0.04, hd, c1),
        B(-hw, 0, -hd, -hw + 0.3, 0.04, hd, c1),
        B(hw - 0.3, 0, -hd, hw, 0.04, hd, c1),
        B(-hw + 0.3, 0, -hd + 0.3, hw - 0.3, 0.01, hd - 0.3, c2, { rough: 0.05, metal: 0.1 }),
      ]
    case 'stairs': {
      const n = Math.max(3, Math.round(H / 0.18))
      const rise = H / n
      const run = D / n
      const parts: Part[] = []
      for (let i = 0; i < n; i++) {
        const zFront = hd - i * run
        parts.push(B(-hw, 0, zFront - run, hw, (i + 1) * rise, zFront, c2, { rough: 0.8 }))
        parts.push(B(-hw, (i + 1) * rise - 0.025, zFront - run, hw, (i + 1) * rise + 0.005, zFront + 0.02, c1))
      }
      // Handrail along +x side.
      const railH = 0.9
      for (let i = 0; i <= n; i += Math.max(1, Math.floor(n / 5))) {
        const z = hd - i * run - run * 0.5
        const y = Math.min(n, i + 1) * rise
        parts.push(B(hw - 0.05, y, z - 0.02, hw - 0.01, y + railH, z + 0.02, c2))
      }
      const railLen = Math.hypot(D, H)
      const ang = Math.atan2(H, D)
      parts.push({ g: 'box', p: [hw - 0.03, H / 2 + railH + rise * 0.5, 0], s: [0.05, 0.05, railLen], c: c1, r: [ang, 0, 0] })
      return parts
    }
    case 'stairs-l':
    case 'stairs-u': {
      // Flight one rises along -z on the +x side to a landing at the back;
      // flight two turns left (L) or comes back along +z on the -x side (U).
      const u = shape === 'stairs-u'
      const n = Math.max(5, Math.round(H / 0.18))
      const rise = H / n
      const fw = stairFlight(shape, W * 100, D * 100) / 100
      const n1 = Math.floor((n - 1) / 2)
      const n2 = n - 1 - n1
      const parts: Part[] = []
      const step = (x0: number, z0: number, x1: number, z1: number, y: number) => {
        parts.push(B(x0, 0, z0, x1, y, z1, c2, { rough: 0.8 }))
        parts.push(B(x0, y - 0.025, z0, x1, y + 0.005, z1, c1))
      }
      const run1 = (D - fw) / n1
      for (let i = 0; i < n1; i++) step(hw - fw, hd - (i + 1) * run1, hw, hd - i * run1, (i + 1) * rise)
      const yl = (n1 + 1) * rise
      if (u) step(-hw, -hd, hw, -hd + fw, yl)
      else step(hw - fw, -hd, hw, -hd + fw, yl)
      if (u) {
        const run2 = (D - fw) / n2
        for (let j = 0; j < n2; j++) step(-hw, -hd + fw + j * run2, -hw + fw, -hd + fw + (j + 1) * run2, (n1 + 2 + j) * rise)
      } else {
        const run2 = (W - fw) / n2
        for (let j = 0; j < n2; j++) step(hw - fw - (j + 1) * run2, -hd, hw - fw - j * run2, -hd + fw, (n1 + 2 + j) * rise)
      }
      // Newel posts at the landing corners.
      parts.push(B(hw - fw - 0.03, 0, -hd + fw - 0.03, hw - fw + 0.03, yl + 0.95, -hd + fw + 0.03, c1))
      if (u) parts.push(B(-hw + fw - 0.03, 0, -hd + fw - 0.03, -hw + fw + 0.03, yl + 0.95, -hd + fw + 0.03, c1))
      return parts
    }
    case 'column':
      return [B(-hw, 0, -hd, hw, H, hd, c1)]
    case 'plate':
      return [B(-hw, 0, -hd, hw, H, hd, c1, { rough: 0.4 }), B(-hw * 0.4, H * 0.3, hd, hw * 0.4, H * 0.7, hd + 0.003, c2)]
    case 'fan': {
      const parts: Part[] = [Cy(0, 0, H * 0.6, H, 0.02, 0.02, c2, { metal: 0.6 }), Cy(0, 0, H * 0.35, H * 0.6, 0.18, 0.18, c2, { metal: 0.6 }), Cy(0, 0, H * 0.2, H * 0.35, 0.16, 0.16, '#FFE7B0', { e: 1 })]
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        parts.push({ g: 'box', p: [(Math.cos(a) * W) / 4, H * 0.45, (Math.sin(a) * D) / 4], s: [W / 2 - 0.1, 0.012, 0.13], c: c1, r: [0, -a, 0] })
      }
      return parts
    }
    case 'bench':
      return [B(-hw, H - 0.05, -hd, hw, H, hd, c1), B(-hw + 0.04, 0, -hd + 0.04, -hw + 0.08, H - 0.05, hd - 0.04, c2), B(hw - 0.08, 0, -hd + 0.04, hw - 0.04, H - 0.05, hd - 0.04, c2)]
    case 'towel-rack':
      return [
        { g: 'cyl', p: [0, H * 0.8, hd * 0.2], s: [0.022, W, 0.022], c: c1, r: [0, 0, Math.PI / 2], metal: 0.8 },
        B(-hw * 0.8, H * 0.25, hd * 0.2 - 0.004, hw * 0.8, H * 0.8, hd * 0.2 + 0.004, c2, { rough: 1 }),
        B(-hw, H * 0.7, -hd, -hw + 0.02, H * 0.85, hd, c1, { metal: 0.8 }),
        B(hw - 0.02, H * 0.7, -hd, hw, H * 0.85, hd, c1, { metal: 0.8 }),
      ]
    case 'sconce':
      return [B(-hw * 0.5, H * 0.3, -hd, hw * 0.5, H * 0.7, -hd + 0.02, c1, { metal: 0.6 }), { g: 'cone', p: [0, H * 0.6, 0], s: [W, H * 0.6, D * 0.9], c: c2, e: 1.5 }]
    case 'shelf':
      return [B(-hw, 0, -hd, hw, H, hd, c1), B(-hw + 0.1, -0.12, -hd, -hw + 0.12, 0, hd * 0.6, c2), B(hw - 0.12, -0.12, -hd, hw - 0.1, 0, hd * 0.6, c2)]
    case 'fence': {
      const n = Math.max(2, Math.round(W / 0.12))
      const parts: Part[] = [B(-hw, H * 0.15, -hd, hw, H * 0.2, hd, c2), B(-hw, H * 0.8, -hd, hw, H * 0.85, hd, c2)]
      for (let i = 0; i < n; i++) {
        const x = -hw + (W * (i + 0.5)) / n
        parts.push(B(x - W / n / 2 + 0.005, 0, -hd * 0.4, x + W / n / 2 - 0.005, H, hd * 0.4, c1, { rough: 1 }))
      }
      parts.push(B(-hw, 0, -hd * 1.4, -hw + 0.09, H + 0.05, hd * 1.4, c2), B(hw - 0.09, 0, -hd * 1.4, hw, H + 0.05, hd * 1.4, c2))
      return parts
    }
    case 'railing': {
      const n = Math.max(2, Math.round(W / 0.12))
      const parts: Part[] = [B(-hw, H - 0.05, -0.03, hw, H, 0.03, c2), B(-hw, 0.05, -0.015, hw, 0.08, 0.015, c1)]
      for (let i = 0; i <= n; i++) {
        const x = -hw + (W * i) / n
        parts.push(B(x - 0.01, 0.08, -0.01, x + 0.01, H - 0.05, 0.01, c1, { metal: 0.5 }))
      }
      return parts
    }
    case 'pergola': {
      const post = 0.15
      const parts: Part[] = []
      for (const x of [-hw + post / 2, hw - post / 2]) for (const z of [-hd + post / 2, hd - post / 2]) parts.push(B(x - post / 2, 0, z - post / 2, x + post / 2, H - 0.2, z + post / 2, c1))
      parts.push(B(-hw - 0.2, H - 0.2, -hd + 0.02, hw + 0.2, H - 0.05, -hd + 0.12, c1), B(-hw - 0.2, H - 0.2, hd - 0.12, hw + 0.2, H - 0.05, hd - 0.02, c1))
      const n = Math.max(4, Math.round(W / 0.4))
      for (let i = 0; i <= n; i++) {
        const x = -hw + (W * i) / n
        parts.push(B(x - 0.03, H - 0.05, -hd - 0.25, x + 0.03, H + 0.12, hd + 0.25, c2))
      }
      return parts
    }
    case 'fire-pit':
      return [Cy(0, 0, 0, H, W, D, c1, { rough: 1 }), Cy(0, 0, H - 0.02, H + 0.005, W * 0.72, D * 0.72, '#2B2522'), { g: 'cone', p: [0, H + 0.15, 0], s: [W * 0.35, 0.3, D * 0.35], c: c2, e: 2.5, o: 0.9 }]
    case 'garden-bed': {
      const t = 0.05
      return [
        B(-hw, 0, -hd, hw, H, -hd + t, c1, { rough: 1 }),
        B(-hw, 0, hd - t, hw, H, hd, c1, { rough: 1 }),
        B(-hw, 0, -hd, -hw + t, H, hd, c1, { rough: 1 }),
        B(hw - t, 0, -hd, hw, H, hd, c1, { rough: 1 }),
        B(-hw + t, 0, -hd + t, hw - t, H - 0.06, hd - t, '#5A4535', { rough: 1 }),
        ...Array.from({ length: Math.max(2, Math.round(W / 0.35)) }, (_, i) => S(-hw + (W * (i + 0.5)) / Math.max(2, Math.round(W / 0.35)), H + 0.08, 0, 0.3, 0.25, D * 0.6, c2, { rough: 1 })),
      ]
    }
    case 'shed': {
      const wallH = H * 0.72
      const rise = H - wallH
      return [
        B(-hw, 0, -hd, hw, wallH, hd, c1, { rough: 0.9 }),
        B(-hw * 0.3, 0, hd, hw * 0.3, wallH * 0.85, hd + 0.01, shade(c1)),
        { g: 'box', p: [0, wallH + rise / 2, -hd / 2], s: [W + 0.2, 0.05, Math.hypot(D / 2 + 0.1, rise)], c: c2, r: [Math.atan2(rise, D / 2), 0, 0] },
        { g: 'box', p: [0, wallH + rise / 2, hd / 2], s: [W + 0.2, 0.05, Math.hypot(D / 2 + 0.1, rise)], c: c2, r: [-Math.atan2(rise, D / 2), 0, 0] },
      ]
    }
    case 'umbrella':
      return [Cy(0, 0, 0, 0.05, 0.5, 0.5, c2), Cy(0, 0, 0.05, H, 0.04, 0.04, c2, { metal: 0.3 }), { g: 'cone', p: [0, H - 0.25, 0], s: [W, 0.5, D], c: c1 }]
    default:
      return [B(-hw, 0, -hd, hw, H, hd, c1)]
  }
}
