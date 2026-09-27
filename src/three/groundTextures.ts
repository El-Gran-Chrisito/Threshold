/**
 * Outdoor surface textures drawn on canvases: grass, asphalt, concrete,
 * mulch, gravel and field rows. All tile seamlessly and are cached.
 * Grass is a near-white detail map so the site's ground colour tints it.
 */
import * as THREE from 'three'

const cache = new Map<string, THREE.CanvasTexture>()

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, S: number, r: () => number) => void, srgb = true): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  draw(ctx, size, rand(key.length * 7919 + size))
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  cache.set(key, tex)
  return tex
}

/** Speckle noise drawn with wrap-around so the tile repeats cleanly. */
function speckle(ctx: CanvasRenderingContext2D, S: number, r: () => number, n: number, size: [number, number], colors: string[], alpha: [number, number]) {
  for (let i = 0; i < n; i++) {
    const x = r() * S
    const y = r() * S
    const s = size[0] + r() * (size[1] - size[0])
    ctx.globalAlpha = alpha[0] + r() * (alpha[1] - alpha[0])
    ctx.fillStyle = colors[Math.floor(r() * colors.length)]
    for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) ctx.fillRect(x + dx, y + dy, s, s)
  }
  ctx.globalAlpha = 1
}

export function grassTexture(): THREE.CanvasTexture {
  return make('grass', 512, (ctx, S, r) => {
    ctx.fillStyle = '#e6e6e6'
    ctx.fillRect(0, 0, S, S)
    speckle(ctx, S, r, 9000, [1, 3], ['#ffffff', '#cfcfcf', '#bdbdbd', '#f4f4f4'], [0.25, 0.6])
    // Blades: short strokes leaning every way.
    ctx.lineCap = 'round'
    for (let i = 0; i < 5200; i++) {
      const x = r() * S
      const y = r() * S
      const a = -Math.PI / 2 + (r() - 0.5) * 1.2
      const l = 4 + r() * 9
      ctx.strokeStyle = r() < 0.5 ? '#ffffff' : '#a9a9a9'
      ctx.globalAlpha = 0.18 + r() * 0.3
      ctx.lineWidth = 0.8 + r() * 0.8
      for (const dx of [0, -S, S])
        for (const dy of [0, -S, S]) {
          ctx.beginPath()
          ctx.moveTo(x + dx, y + dy)
          ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l)
          ctx.stroke()
        }
    }
    ctx.globalAlpha = 1
  })
}

export function asphaltTexture(): THREE.CanvasTexture {
  return make('asphalt', 512, (ctx, S, r) => {
    ctx.fillStyle = '#4a4d51'
    ctx.fillRect(0, 0, S, S)
    speckle(ctx, S, r, 26000, [1, 2.2], ['#2e3033', '#5d6166', '#6c7075', '#3b3e42'], [0.4, 0.9])
    // A few patched cracks.
    ctx.strokeStyle = '#2a2c2f'
    ctx.globalAlpha = 0.5
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      let x = r() * S
      let y = r() * S
      ctx.moveTo(x, y)
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.5) * 40
        y += (r() - 0.5) * 40
        ctx.lineTo(x, y)
      }
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  })
}

/** Poured concrete with a control joint around each square (one tile = one slab). */
export function concreteTexture(tone = '#c9c6bf'): THREE.CanvasTexture {
  return make(`concrete|${tone}`, 256, (ctx, S, r) => {
    ctx.fillStyle = tone
    ctx.fillRect(0, 0, S, S)
    speckle(ctx, S, r, 5000, [1, 2], ['#ffffff', '#9d9a94', '#b3b0aa'], [0.15, 0.4])
    ctx.strokeStyle = 'rgba(70,68,64,0.55)'
    ctx.lineWidth = 3
    ctx.strokeRect(0, 0, S, S)
  })
}

export function mulchTexture(): THREE.CanvasTexture {
  return make('mulch', 256, (ctx, S, r) => {
    ctx.fillStyle = '#4b3526'
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 1600; i++) {
      const x = r() * S
      const y = r() * S
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(r() * Math.PI)
      ctx.fillStyle = ['#6b4a33', '#3a281c', '#7d5a3f', '#2f2117'][Math.floor(r() * 4)]
      ctx.globalAlpha = 0.8
      ctx.fillRect(-4, -1, 8 + r() * 6, 2 + r() * 1.5)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  })
}

export function gravelTexture(): THREE.CanvasTexture {
  return make('gravel', 256, (ctx, S, r) => {
    ctx.fillStyle = '#a79f92'
    ctx.fillRect(0, 0, S, S)
    speckle(ctx, S, r, 6000, [2, 4.5], ['#d7d0c4', '#857d71', '#bdb4a6', '#6f685e'], [0.6, 1])
  })
}

/** Crop rows for fields: `crop` is the row colour, `soil` shows between rows. */
export function fieldTexture(crop: string, soil: string): THREE.CanvasTexture {
  return make(`field|${crop}|${soil}`, 256, (ctx, S, r) => {
    ctx.fillStyle = soil
    ctx.fillRect(0, 0, S, S)
    for (let y = 0; y < S; y += 16) {
      ctx.fillStyle = crop
      ctx.fillRect(0, y + 3, S, 10)
    }
    speckle(ctx, S, r, 4000, [1, 3], ['#ffffff', '#000000'], [0.04, 0.12])
  })
}
