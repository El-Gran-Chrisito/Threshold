/**
 * First-person walk-through. WASD / arrow keys move, dragging looks around,
 * walls block movement except through door openings. The walker's position
 * is mirrored to the store (throttled) so the plan can show where you are.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Level, Vec2 } from '../model/types'
import { activeLevel, useStore } from '../store/store'
import { closestOnSegment, dist, labelPoint, lerp, polygonArea } from '../model/geometry'
import { wallSpans } from '../plan/wallGeometry'
import { wallLength } from '../model/ops'

const EYE = 1.6
const RADIUS = 22 // cm

export const walkKeys = { f: false, b: false, l: false, r: false, turnL: false, turnR: false, run: false }

/** Wall segments that block walking (door openings are passable, windows are not). */
function blockers(level: Level): Array<[Vec2, Vec2, number]> {
  const out: Array<[Vec2, Vec2, number]> = []
  for (const w of level.walls) {
    const passable = level.openings.filter((o) => o.wallId === w.id && o.sill < 40)
    const spans = wallSpans(w, passable)
    const L = wallLength(w)
    for (const [s0, s1] of spans) out.push([lerp(w.a, w.b, s0 / L), lerp(w.a, w.b, s1 / L), w.thickness / 2])
  }
  return out
}

export function startPosition(level: Level): { x: number; y: number; yaw: number } {
  const preferred = /living|great|family|kitchen|lounge|studio/i
  const avoid = /garage|closet|bath|powder|laundry|mud|utility/i
  const score = (r: (typeof level.rooms)[number]) => polygonArea(r.points) * (preferred.test(r.name) ? 3 : 1) * (avoid.test(r.name) ? 0.05 : 1)
  const rooms = [...level.rooms].sort((a, b) => score(b) - score(a))
  if (rooms.length) {
    const p = labelPoint(rooms[0].points)
    return { x: p.x, y: p.y, yaw: 0 }
  }
  return { x: 0, y: 0, yaw: 0 }
}

export function Walker() {
  const { camera, gl } = useThree()
  const levelId = useStore((s) => s.levelId)
  const project = useStore((s) => s.project)
  const level = activeLevel({ project, levelId })
  const segs = useMemo(() => blockers(level), [level])
  const pos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const yaw = useRef(0)
  const pitch = useRef(-0.05)
  const lastSync = useRef(0)
  const dragging = useRef<{ x: number; y: number } | null>(null)

  // Initialise from the store or the largest room.
  useEffect(() => {
    const w = useStore.getState().walker ?? startPosition(level)
    pos.current = { x: w.x, y: w.y }
    yaw.current = w.yaw
    useStore.setState({ walker: w })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId])

  // Follow external moves (dragging the marker in the plan).
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.walker && s.walker !== prev.walker && (Math.abs(s.walker.x - pos.current.x) > 1 || Math.abs(s.walker.y - pos.current.y) > 1)) {
          pos.current = { x: s.walker.x, y: s.walker.y }
          yaw.current = s.walker.yaw
        }
      }),
    [],
  )

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const prev = cam.fov
    cam.fov = 70
    cam.updateProjectionMatrix()
    return () => {
      cam.fov = prev
      cam.updateProjectionMatrix()
    }
  }, [camera])

  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => {
      dragging.current = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragging.current.x
      const dy = e.clientY - dragging.current.y
      dragging.current = { x: e.clientX, y: e.clientY }
      yaw.current -= dx * 0.005
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - dy * 0.004))
    }
    const up = () => {
      dragging.current = null
    }
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const on = e.type === 'keydown'
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          walkKeys.f = on
          break
        case 's':
        case 'arrowdown':
          walkKeys.b = on
          break
        case 'a':
          walkKeys.l = on
          break
        case 'd':
          walkKeys.r = on
          break
        case 'arrowleft':
          walkKeys.turnL = on
          break
        case 'arrowright':
          walkKeys.turnR = on
          break
        case 'shift':
          walkKeys.run = on
          break
        default:
          return
      }
      e.preventDefault()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', key)
      Object.keys(walkKeys).forEach((k) => ((walkKeys as Record<string, boolean>)[k] = false))
    }
  }, [gl])

  useFrame((state, dt) => {
    const k = walkKeys
    if (k.turnL) yaw.current += dt * 1.8
    if (k.turnR) yaw.current -= dt * 1.8
    const speed = (k.run ? 300 : 150) * Math.min(dt, 0.05) // cm per frame
    // Plan forward for yaw 0 is -y (north). Yaw turns counter-clockwise seen from above.
    const fx = -Math.sin(yaw.current)
    const fy = -Math.cos(yaw.current)
    const rx = -fy
    const ry = fx
    let mx = 0
    let my = 0
    if (k.f) {
      mx += fx
      my += fy
    }
    if (k.b) {
      mx -= fx
      my -= fy
    }
    if (k.l) {
      mx -= rx
      my -= ry
    }
    if (k.r) {
      mx += rx
      my += ry
    }
    const len = Math.hypot(mx, my)
    if (len > 0) {
      let p = { x: pos.current.x + (mx / len) * speed, y: pos.current.y + (my / len) * speed }
      // Push out of walls (two passes handles corners).
      for (let pass = 0; pass < 2; pass++) {
        for (const [a, b, ht] of segs) {
          const c = closestOnSegment(p, a, b)
          const minD = ht + RADIUS
          if (c.d < minD) {
            const d = c.d || 0.001
            p = { x: c.point.x + ((p.x - c.point.x) / d) * minD, y: c.point.y + ((p.y - c.point.y) / d) * minD }
          }
        }
      }
      pos.current = p
    }
    const elev = level.elevation / 100
    camera.position.set(pos.current.x / 100, elev + EYE, pos.current.y / 100)
    camera.rotation.order = 'YXZ'
    camera.rotation.set(pitch.current, yaw.current, 0)
    const t = state.clock.elapsedTime
    if (t - lastSync.current > 0.12) {
      lastSync.current = t
      const w = useStore.getState().walker
      if (!w || dist(w, pos.current) > 2 || Math.abs(w.yaw - yaw.current) > 0.02) useStore.setState({ walker: { x: pos.current.x, y: pos.current.y, yaw: yaw.current } })
    }
  })

  return null
}

