/**
 * Procedural floor textures drawn on canvases. Each returns a repeating
 * texture plus the real-world size (metres) one tile covers, so UVs in metres
 * map to true scale.
 */
import * as THREE from 'three'
import type { FloorMaterial } from '../model/materials'

const cache = new Map<string, { tex: THREE.CanvasTexture; sx: number; sy: number }>()

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex)
  const k = (c: number) => Math.max(0, Math.min(255, Math.round(c * f)))
  return `rgb(${k(r)},${k(g)},${k(b)})`
}

function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`
}

function noise(ctx: CanvasRenderingContext2D, W: number, H: number, amount: number, rand: () => number) {
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

export function floorTexture(m: FloorMaterial, tint?: string): { tex: THREE.CanvasTexture; sx: number; sy: number } {
  const key = `${m.id}|${tint ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const base = tint ?? m.base
  const accent = tint ? shade(tint, 0.82) : m.accent
  const rand = rng(m.id.split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7))
  const W = 512
  let H = 512
  let sx = 1
  let sy = 1
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  let ctx = canvas.getContext('2d')!
  const mod = m.module / 100 // metres

  switch (m.pattern) {
    case 'planks':
    case 'deck': {
      const rows = 8
      sx = mod * rows * 1.0
      sy = mod * rows
      const rowH = H / rows
      for (let r = 0; r < rows; r++) {
        let x = -rand() * W * 0.8
        while (x < W) {
          const len = W * (0.45 + rand() * 0.55)
          const f = 0.9 + rand() * 0.2
          ctx.fillStyle = mix(base, accent, rand() * 0.6)
          ctx.fillRect(x, r * rowH, len, rowH)
          ctx.fillStyle = shade(base, f)
          ctx.globalAlpha = 0.35
          ctx.fillRect(x, r * rowH, len, rowH)
          ctx.globalAlpha = 1
          // Grain
          ctx.strokeStyle = shade(accent, 0.85)
          ctx.globalAlpha = 0.18
          for (let g = 0; g < 5; g++) {
            const gy = r * rowH + rand() * rowH
            ctx.beginPath()
            ctx.moveTo(x, gy)
            ctx.bezierCurveTo(x + len * 0.3, gy + (rand() - 0.5) * 6, x + len * 0.6, gy + (rand() - 0.5) * 6, x + len, gy)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = shade(accent, m.pattern === 'deck' ? 0.35 : 0.7)
          ctx.fillRect(x, r * rowH, m.pattern === 'deck' ? 3 : 2, rowH)
          x += len
        }
        ctx.fillStyle = shade(accent, m.pattern === 'deck' ? 0.3 : 0.65)
        ctx.fillRect(0, r * rowH, W, m.pattern === 'deck' ? 5 : 2)
      }
      noise(ctx, W, H, 10, rand)
      break
    }
    case 'parquet': {
      const cells = 8
      sx = sy = mod * 4 * (cells / 2)
      const c = W / cells
      for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
          const horiz = (i + j) % 2 === 0
          const strips = 4
          for (let k = 0; k < strips; k++) {
            ctx.fillStyle = mix(base, accent, rand() * 0.7)
            if (horiz) ctx.fillRect(i * c, j * c + (k * c) / strips, c, c / strips)
            else ctx.fillRect(i * c + (k * c) / strips, j * c, c / strips, c)
            ctx.strokeStyle = shade(accent, 0.7)
            ctx.lineWidth = 1.2
            if (horiz) ctx.strokeRect(i * c, j * c + (k * c) / strips, c, c / strips)
            else ctx.strokeRect(i * c + (k * c) / strips, j * c, c / strips, c)
          }
        }
      }
      noise(ctx, W, H, 10, rand)
      break
    }
    case 'tiles':
    case 'marble': {
      const n = m.pattern === 'marble' ? 2 : 4
      sx = sy = mod * n
      const c = W / n
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = shade(base, 0.97 + rand() * 0.06)
          ctx.fillRect(i * c, j * c, c, c)
        }
      if (m.pattern === 'marble') {
        ctx.strokeStyle = accent
        for (let v = 0; v < 14; v++) {
          ctx.globalAlpha = 0.12 + rand() * 0.25
          ctx.lineWidth = 0.6 + rand() * 1.8
          ctx.beginPath()
          let x = rand() * W
          let y = rand() * H
          ctx.moveTo(x, y)
          for (let s = 0; s < 6; s++) {
            const nx = x + (rand() - 0.3) * 160
            const ny = y + (rand() - 0.5) * 120
            ctx.quadraticCurveTo(x + (rand() - 0.5) * 80, y + (rand() - 0.5) * 80, nx, ny)
            x = nx
            y = ny
          }
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
      noise(ctx, W, H, m.pattern === 'marble' ? 5 : 8, rand)
      ctx.fillStyle = accent
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * c - 1.5, 0, 3, H)
        ctx.fillRect(0, i * c - 1.5, W, 3)
      }
      break
    }
    case 'hex': {
      // Pointy-top hexes; tile is sqrt(3)r × 3r.
      const r = 36
      const tw = Math.sqrt(3) * r * 4
      const th = 3 * r * 2
      canvas.width = Math.round(tw)
      canvas.height = Math.round(th)
      H = canvas.height
      ctx = canvas.getContext('2d')!
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const hx = Math.sqrt(3) * r
      for (let row = -1; row <= 5; row++) {
        for (let col = -1; col <= 5; col++) {
          const cx = col * hx + (row % 2 ? hx / 2 : 0)
          const cy = row * 1.5 * r
          ctx.beginPath()
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6
            const px = cx + Math.cos(a) * (r - 2)
            const py = cy + Math.sin(a) * (r - 2)
            if (k) ctx.lineTo(px, py)
            else ctx.moveTo(px, py)
          }
          ctx.closePath()
          ctx.fillStyle = shade(base, 0.96 + rand() * 0.06)
          ctx.fill()
        }
      }
      const cmPerPx = m.module / (2 * r) // module = hex diameter
      sx = (canvas.width * cmPerPx) / 100
      sy = (canvas.height * cmPerPx) / 100
      break
    }
    case 'concrete':
    case 'carpet':
    case 'solid':
    case 'grass': {
      ctx.fillStyle = base
      ctx.fillRect(0, 0, W, H)
      sx = sy = m.pattern === 'carpet' ? 0.6 : m.pattern === 'grass' ? 1.5 : 2.4
      if (m.pattern === 'concrete') {
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = shade(base, 0.9 + rand() * 0.2)
          ctx.globalAlpha = 0.12
          ctx.beginPath()
          ctx.arc(rand() * W, rand() * H, 10 + rand() * 60, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
        noise(ctx, W, H, 16, rand)
      } else if (m.pattern === 'grass') {
        for (let i = 0; i < 5000; i++) {
          ctx.strokeStyle = shade(i % 2 ? base : accent, 0.8 + rand() * 0.4)
          ctx.globalAlpha = 0.5
          const x = rand() * W
          const y = rand() * H
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + (rand() - 0.5) * 4, y - 4 - rand() * 6)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      } else if (m.pattern === 'carpet') noise(ctx, W, H, 26, rand)
      else noise(ctx, W, H, 4, rand)
      break
    }
    case 'terrazzo': {
      ctx.fillStyle = base
      ctx.fillRect(0, 0, W, H)
      sx = sy = 0.8
      const chips = ['#8F8A82', '#C9B7A0', '#6F7470', '#D9D3C7', '#B38E78', '#50555A']
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = chips[Math.floor(rand() * chips.length)]
        ctx.beginPath()
        const x = rand() * W
        const y = rand() * H
        const s = 1.5 + rand() * 7
        ctx.moveTo(x, y)
        for (let k = 0; k < 5; k++) ctx.lineTo(x + (rand() - 0.5) * s * 2, y + (rand() - 0.5) * s * 2)
        ctx.fill()
      }
      noise(ctx, W, H, 6, rand)
      break
    }
    case 'brick': {
      const rows = 8
      const bw = W / 4
      const bh = H / rows
      sx = (m.module * 4) / 100
      sy = ((m.module / 2) * rows) / 100
      ctx.fillStyle = shade(accent, 0.7)
      ctx.fillRect(0, 0, W, H)
      for (let r = 0; r < rows; r++) {
        const off = r % 2 ? bw / 2 : 0
        for (let c = -1; c < 5; c++) {
          ctx.fillStyle = mix(base, accent, rand() * 0.6)
          ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4)
        }
      }
      noise(ctx, W, H, 12, rand)
      break
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const out = { tex, sx, sy }
  cache.set(key, out)
  return out
}
