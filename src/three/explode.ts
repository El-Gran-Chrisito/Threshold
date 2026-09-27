/**
 * Exploded view. A single animated factor (0 assembled → 1 exploded) drives
 * every component's offset, so parts glide apart and back without React
 * re-rendering the scene.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'

export const explodeState = { current: 0 }

/**
 * Offset a group by `offset * factor` from its base position each frame.
 * Returns the ref to attach to the group.
 */
export function useExplodeOffset(base: [number, number, number], offset: [number, number, number]) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const f = explodeState.current
    g.position.set(base[0] + offset[0] * f, base[1] + offset[1] * f, base[2] + offset[2] * f)
  })
  return ref
}
