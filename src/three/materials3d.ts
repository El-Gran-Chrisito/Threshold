import * as THREE from 'three'
import { floorMaterial } from '../model/materials'
import { floorTexture, roofTexture, wallTexture } from './textures'

const matCache = new Map<string, THREE.MeshStandardMaterial>()

export function stdMat(color: string, opts: { rough?: number; metal?: number; opacity?: number; emissive?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.metal ?? 0}|${opts.opacity ?? 1}|${opts.emissive ?? 0}|${opts.side ?? 0}`
  let m = matCache.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
      depthWrite: (opts.opacity ?? 1) >= 1,
    })
    if (opts.emissive) {
      m.emissive = new THREE.Color(color)
      m.emissiveIntensity = opts.emissive
    }
    matCache.set(key, m)
  }
  return m
}

export function floorMat(materialId: string, tint?: string): THREE.MeshStandardMaterial {
  const key = `floor|${materialId}|${tint ?? ''}`
  let m = matCache.get(key)
  if (!m) {
    const fm = floorMaterial(materialId)
    const { tex, sx, sy } = floorTexture(fm, tint)
    const t = tex.clone()
    t.needsUpdate = true
    t.repeat.set(1 / sx, 1 / sy)
    const rough = fm.pattern === 'marble' || fm.pattern === 'tiles' ? 0.35 : fm.pattern === 'carpet' || fm.pattern === 'grass' ? 1 : 0.7
    m = new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: 0 })
    matCache.set(key, m)
  }
  return m
}

export const unitBox = new THREE.BoxGeometry(1, 1, 1)
export const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 28)
export const unitSph = new THREE.SphereGeometry(0.5, 24, 16)
export const unitCone = new THREE.CylinderGeometry(0.28, 0.5, 1, 28, 1, true)

/** Material for one face of a wall. Geometry UVs are in metres. */
export function wallMat(finish: string | undefined, color: string, highlight = false): THREE.MeshStandardMaterial {
  if (highlight) return stdMat('#7FC8C1', { rough: 0.9 })
  if (!finish || finish === 'paint') return stdMat(color, { rough: 0.92 })
  const key = `wallfin|${finish}|${color}`
  let m = matCache.get(key)
  if (!m) {
    const t = wallTexture(finish, color)
    if (!t) return stdMat(color, { rough: 0.92 })
    const tex = t.tex.clone()
    tex.needsUpdate = true
    tex.repeat.set(1 / t.sx, 1 / t.sy)
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: finish === 'tile' ? 0.3 : 0.9 })
    matCache.set(key, m)
  }
  return m
}

/** Roof covering. Roof geometry UVs are in metres, v running down the slope. */
export function roofMat(material: string, color: string): THREE.MeshStandardMaterial {
  const key = `roofmat|${material}|${color}`
  let m = matCache.get(key)
  if (!m) {
    const t = roofTexture(material, color)
    if (!t) return stdMat(color, { side: THREE.DoubleSide, rough: 0.8 })
    const tex = t.tex.clone()
    tex.needsUpdate = true
    tex.repeat.set(1 / t.sx, 1 / t.sy)
    m = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: material === 'metal' ? 0.45 : 0.85, metalness: material === 'metal' ? 0.35 : 0 })
    matCache.set(key, m)
  }
  return m
}

/** Box centred on the origin whose UVs are in metres, offset by (u0, v0) on the long faces. */
export function worldUVBox(w: number, h: number, d: number, u0: number, v0: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const nx = Math.abs(nor.getX(i))
    const ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, u0 + x + w / 2, z + d / 2)
    else if (nx > 0.5) uv.setXY(i, z + d / 2, v0 + y + h / 2)
    else uv.setXY(i, u0 + x + w / 2, v0 + y + h / 2)
  }
  uv.needsUpdate = true
  return g
}
