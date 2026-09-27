/** Export the 3D home as a binary glTF (.glb) file. */
import type * as THREE from 'three'

export const homeGroupRef: { current: THREE.Group | null } = { current: null }

export async function exportGlb(): Promise<Blob | null> {
  const group = homeGroupRef.current
  if (!group) return null
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(group, { binary: true, onlyVisible: true })
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
}
