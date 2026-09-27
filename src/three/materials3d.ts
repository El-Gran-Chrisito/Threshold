import * as THREE from 'three'
import { floorMaterial } from '../model/materials'
import { floorTexture } from './textures'

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
