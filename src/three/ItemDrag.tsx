/**
 * Drag furniture directly in the 3D view. Pressing on an item selects it and
 * slides it across its floor; it snaps to the grid and backs onto walls just
 * like in the plan. Orbiting is paused while dragging.
 */
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, type ReactNode } from 'react'
import * as THREE from 'three'
import { useStore } from '../store/store'
import { snapItemToWall } from '../model/ops'
import { snapToGrid } from '../model/geometry'
import { gridStep } from '../model/units'
import { catalogEntry } from '../model/catalog'
import type { Item } from '../model/types'

interface DragState {
  itemId: string
  levelId: string
  planeY: number
  offset: THREE.Vector3
  orig: Item
  moved: boolean
  startX: number
  startY: number
}

const drag: { current: DragState | null } = { current: null }
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const hitPoint = new THREE.Vector3()

type Controls = { enabled: boolean } | null

export function DraggableHome({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  const { camera, gl, controls } = useThree()

  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return
      d.moved = true
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -d.planeY)
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return
      const s = useStore.getState()
      const units = s.project.units
      let pos = { x: (hitPoint.x + d.offset.x) * 100, y: (hitPoint.z + d.offset.z) * 100 }
      if (s.snap) pos = snapToGrid(pos, gridStep(units) / 2)
      let rotation = d.orig.rotation
      const c = catalogEntry(d.orig.type)
      const base = (s.txBase ?? s.project).levels.find((l) => l.id === d.levelId)
      if (base && s.snap && !ev.altKey && c.category !== 'Outdoor' && c.shape !== 'rug') {
        const sn = snapItemToWall(base, d.orig, pos, 25)
        if (sn) {
          pos = { x: sn.x, y: sn.y }
          rotation = sn.rotation
        }
      }
      s.preview((p) => ({
        ...p,
        levels: p.levels.map((l) => (l.id === d.levelId ? { ...l, items: l.items.map((i) => (i.id === d.itemId ? { ...i, x: pos.x, y: pos.y, rotation } : i)) } : l)),
      }))
    }
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      const s = useStore.getState()
      if (d.moved) s.commit()
      else s.cancel()
      if (controls) (controls as unknown as Controls)!.enabled = true
      gl.domElement.style.cursor = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [camera, gl, controls])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (disabled || e.button !== 0) return
    const s = useStore.getState()
    if (s.tool !== 'select' || s.explode > 0) return
    const hit = (e.object.userData?.hit as string | undefined) ?? ''
    if (!hit.startsWith('item:')) return
    const id = hit.slice(5)
    const level = s.project.levels.find((l) => l.items.some((i) => i.id === id))
    const item = level?.items.find((i) => i.id === id)
    if (!level || !item || item.locked) return
    e.stopPropagation()
    if (level.id !== s.levelId) useStore.setState({ levelId: level.id })
    s.select({ kind: 'item', id })
    s.begin()
    const planeY = level.elevation / 100
    const onPlane = e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), new THREE.Vector3())
    const ref = onPlane ?? e.point
    drag.current = {
      itemId: id,
      levelId: level.id,
      planeY,
      offset: new THREE.Vector3(item.x / 100 - ref.x, 0, item.y / 100 - ref.z),
      orig: item,
      moved: false,
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
    }
    if (controls) (controls as unknown as Controls)!.enabled = false
    gl.domElement.style.cursor = 'grabbing'
  }

  return <group onPointerDown={onPointerDown}>{children}</group>
}
