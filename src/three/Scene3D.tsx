import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Item, Level, Opening, Project, Room, Vec2, Wall } from '../model/types'
import { activeLevel, useStore } from '../store/store'
import { catalogEntry } from '../model/catalog'
import { dist, norm, pointInPolygon, rectCorners, sub } from '../model/geometry'
import { levelBounds, paintRoomWalls, updateWall } from '../model/ops'
import { jointKeys, pointKey, wallSpans } from '../plan/wallGeometry'
import { buildParts } from './items3d'
import { floorMat, stdMat, unitBox, unitCone, unitCyl, unitSph } from './materials3d'
import { Walker } from './Walker'
import { explodeState, useExplodeOffset } from './explode'
import { useFrame as useFrameR3F } from '@react-three/fiber'

const M = 0.01 // cm → m

function Exploding({ base = [0, 0, 0], offset, children }: { base?: [number, number, number]; offset: [number, number, number]; children: React.ReactNode }) {
  const ref = useExplodeOffset(base, offset)
  return (
    <group ref={ref} position={base}>
      {children}
    </group>
  )
}

function ExplodeDriver({ walk }: { walk: boolean }) {
  useFrameR3F((_, dt) => {
    const target = walk ? 0 : useStore.getState().explode
    const k = 1 - Math.exp(-dt * 5)
    explodeState.current += (target - explodeState.current) * k
    if (Math.abs(target - explodeState.current) < 0.0005) explodeState.current = target
  })
  return null
}

// ---------------------------------------------------------------------------
// Walls

interface Piece {
  x0: number
  x1: number
  y0: number
  y1: number
}

function wallPieces(w: Wall, openings: Opening[], height: number, joints: Set<string>): Piece[] {
  const L = dist(w.a, w.b)
  const spans = wallSpans(w, openings)
  const ht = w.thickness / 2
  const extA = joints.has(pointKey(w.a)) ? ht : 0
  const extB = joints.has(pointKey(w.b)) ? ht : 0
  const out: Piece[] = spans.map(([s0, s1]) => ({ x0: s0 <= 0.01 ? -extA : s0, x1: s1 >= L - 0.01 ? L + extB : s1, y0: 0, y1: height }))
  for (const o of openings) {
    if (o.wallId !== w.id) continue
    const s0 = Math.max(0, o.offset - o.width / 2)
    const s1 = Math.min(L, o.offset + o.width / 2)
    const top = Math.min(height, o.sill + o.height)
    if (o.sill > 0.5) out.push({ x0: s0, x1: s1, y0: 0, y1: Math.min(o.sill, height) })
    if (top < height - 0.5) out.push({ x0: s0, x1: s1, y0: top, y1: height })
  }
  return out.filter((p) => p.x1 - p.x0 > 0.1 && p.y1 - p.y0 > 0.1)
}

const WallMesh = memo(function WallMesh({ w, openings, joints, cut, selected, center }: { w: Wall; openings: Opening[]; joints: Set<string>; cut: number | null; selected: boolean; center: Vec2 }) {
  const height = cut ? Math.min(cut, w.height) : w.height
  const pieces = wallPieces(w, openings, height, joints)
  const d = sub(w.b, w.a)
  const ang = Math.atan2(d.y, d.x)
  const top = stdMat(cut ? '#3A3F42' : '#D9D6D0')
  const edge = stdMat('#D9D6D0')
  const mats = [edge, edge, top, edge, stdMat(selected ? '#7FC8C1' : w.colorA, { rough: 0.9 }), stdMat(selected ? '#7FC8C1' : w.colorB, { rough: 0.9 })]
  const mx = (w.a.x + w.b.x) / 2 - center.x
  const my = (w.a.y + w.b.y) / 2 - center.y
  return (
    <Exploding offset={[mx * M * 0.45, 0.35, my * M * 0.45]}>
    <group position={[w.a.x * M, 0, w.a.y * M]} rotation={[0, -ang, 0]}>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          geometry={unitBox}
          material={mats}
          position={[((p.x0 + p.x1) / 2) * M, ((p.y0 + p.y1) / 2) * M, 0]}
          scale={[(p.x1 - p.x0) * M, (p.y1 - p.y0) * M, w.thickness * M]}
          castShadow
          receiveShadow
          userData={{ hit: `wall:${w.id}` }}
        />
      ))}
      {openings
        .filter((o) => o.wallId === w.id)
        .map((o) => (
          <OpeningMesh key={o.id} o={o} w={w} cut={cut} />
        ))}
    </group>
    </Exploding>
  )
})

function OpeningMesh({ o, w, cut }: { o: Opening; w: Wall; cut: number | null }) {
  const t = w.thickness
  const s0 = o.offset - o.width / 2
  const s1 = o.offset + o.width / 2
  const frame = stdMat(o.frameColor, { rough: 0.6 })
  const glass = stdMat('#BFD9E3', { opacity: 0.28, rough: 0.05, metal: 0.1 })
  const ft = 5 // frame thickness cm
  const fd = Math.min(t, 10) // frame depth
  const parts: React.ReactNode[] = []
  const box = (key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material) => {
    if (cut && y0 >= cut) return
    const yy1 = cut ? Math.min(y1, cut) : y1
    parts.push(
      <mesh key={key} geometry={unitBox} material={mat} position={[((x0 + x1) / 2) * M, ((y0 + yy1) / 2) * M, ((z0 + z1) / 2) * M]} scale={[(x1 - x0) * M, (yy1 - y0) * M, (z1 - z0) * M]} castShadow userData={{ hit: `opening:${o.id}` }} />,
    )
  }
  const y0 = o.sill
  const y1 = o.sill + o.height
  const sideSign = o.swing === 'A' ? 1 : -1
  if (o.kind === 'window' || o.kind === 'slider') {
    box('l', s0, s0 + ft, y0, y1, -fd / 2, fd / 2, frame)
    box('r', s1 - ft, s1, y0, y1, -fd / 2, fd / 2, frame)
    box('t', s0, s1, y1 - ft, y1, -fd / 2, fd / 2, frame)
    box('b', s0, s1, y0, y0 + ft, -fd / 2, fd / 2, frame)
    if (o.kind === 'window') {
      box('g', s0 + ft, s1 - ft, y0 + ft, y1 - ft, -0.6, 0.6, glass)
      if (o.width > 100) box('m', o.offset - 2, o.offset + 2, y0 + ft, y1 - ft, -2, 2, frame)
      if (o.height > 100) box('h', s0 + ft, s1 - ft, y0 + o.height * 0.55 - 2, y0 + o.height * 0.55 + 2, -2, 2, frame)
      box('sill', s0 - 4, s1 + 4, y0 - 3, y0, -t / 2 - 5, -t / 2 + 2, frame)
    } else {
      const mid = o.offset
      box('g1', s0 + ft, mid + 3, y0 + ft, y1 - ft, 1, 2.5, glass)
      box('g2', mid - 3, s1 - ft, y0 + ft, y1 - ft, -2.5, -1, glass)
      box('m1', mid - 3, mid + 3, y0 + ft, y1 - ft, -3, 3, frame)
    }
  } else if (o.kind === 'door' || o.kind === 'double-door') {
    box('l', s0, s0 + 3, 0, y1, -t / 2 - 1, t / 2 + 1, frame)
    box('r', s1 - 3, s1, 0, y1, -t / 2 - 1, t / 2 + 1, frame)
    box('t', s0, s1, y1 - 3, y1, -t / 2 - 1, t / 2 + 1, frame)
    const leafMat = stdMat(o.frameColor, { rough: 0.55 })
    const openAng = (65 * Math.PI) / 180
    const leaves: Array<{ hingeX: number; width: number; dir: 1 | -1 }> =
      o.kind === 'door' ? [o.hinge === 'start' ? { hingeX: s0 + 3, width: o.width - 6, dir: 1 } : { hingeX: s1 - 3, width: o.width - 6, dir: -1 }] : [
            { hingeX: s0 + 3, width: o.width / 2 - 3, dir: 1 },
            { hingeX: s1 - 3, width: o.width / 2 - 3, dir: -1 },
          ]
    leaves.forEach((lf, i) => {
      const phi = lf.dir === 1 ? -sideSign * openAng : sideSign * openAng
      if (cut && cut < 10) return
      const hLeaf = Math.min(o.height - 4, cut ?? Infinity)
      parts.push(
        <group key={`leaf${i}`} position={[lf.hingeX * M, 0, ((sideSign * t) / 2) * M]} rotation={[0, phi, 0]}>
          <mesh geometry={unitBox} material={leafMat} position={[((lf.dir * lf.width) / 2) * M, (hLeaf / 2) * M, sideSign * -2 * M]} scale={[lf.width * M, hLeaf * M, 4 * M]} castShadow userData={{ hit: `opening:${o.id}` }} />
          {hLeaf > 100 && (
            <mesh geometry={unitSph} material={stdMat('#B89457', { metal: 0.8, rough: 0.3 })} position={[lf.dir * (lf.width - 7) * M, 100 * M, sideSign * 1 * M]} scale={[0.05, 0.05, 0.05]} />
          )}
        </group>,
      )
    })
  } else if (o.kind === 'garage') {
    const panelMat = stdMat(o.frameColor, { rough: 0.5 })
    box('p', s0, s1, 0, y1, -t / 2 + 2, -t / 2 + 5, panelMat)
    const n = 4
    for (let i = 1; i < n; i++) box(`gr${i}`, s0 + 2, s1 - 2, (y1 * i) / n - 1, (y1 * i) / n + 1, -t / 2, -t / 2 + 2.2, stdMat('#B8B6B0'))
  }
  return <>{parts}</>
}

// ---------------------------------------------------------------------------
// Floors and ceilings

function roomShape(r: Room, holes: Vec2[][]): THREE.Shape {
  const shape = new THREE.Shape(r.points.map((p) => new THREE.Vector2(p.x * M, -p.y * M)))
  for (const h of holes) {
    if (h.every((p) => pointInPolygon(p, r.points))) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x * M, -p.y * M))))
  }
  return shape
}

const FloorMesh = memo(function FloorMesh({ room, holes, slab, showCeiling, ceilingY, selected }: { room: Room; holes: Vec2[][]; slab: number; showCeiling: boolean; ceilingY: number; selected: boolean }) {
  const shape = useMemo(() => roomShape(room, holes), [room, holes])
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shape, { depth: slab * M, bevelEnabled: false }), [shape, slab])
  const ceilGeo = useMemo(() => new THREE.ShapeGeometry(shape), [shape])
  useEffect(() => () => geo.dispose(), [geo])
  useEffect(() => () => ceilGeo.dispose(), [ceilGeo])
  const mats = [selected ? stdMat('#9ED6CF') : floorMat(room.floor, room.floorColor), stdMat('#BDB8AE')]
  return (
    <group>
      <mesh geometry={geo} material={mats} rotation={[-Math.PI / 2, 0, 0]} position={[0, -slab * M, 0]} receiveShadow userData={{ hit: `room:${room.id}` }} />
      {showCeiling && (
        <mesh geometry={ceilGeo} material={stdMat(room.ceilingColor, { side: THREE.BackSide, rough: 1 })} rotation={[-Math.PI / 2, 0, 0]} position={[0, ceilingY * M, 0]} userData={{ hit: `room:${room.id}` }} />
      )}
    </group>
  )
})

// ---------------------------------------------------------------------------
// Items

const ItemMesh = memo(function ItemMesh({ item, selected, center }: { item: Item; selected: boolean; center: Vec2 }) {
  const c = catalogEntry(item.type)
  const parts = useMemo(() => buildParts(c.shape, item.width * M, item.depth * M, item.height * M, item.color, item.color2), [c.shape, item.width, item.depth, item.height, item.color, item.color2])
  return (
    <Exploding offset={[(item.x - center.x) * M * 0.12, 1.1 + (c.mount === 'ceiling' ? 0.6 : 0), (item.y - center.y) * M * 0.12]}>
    <group position={[item.x * M, item.elevation * M, item.y * M]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]} scale={[item.mirrored ? -1 : 1, 1, 1]}>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.g === 'box' ? unitBox : p.g === 'cyl' ? unitCyl : p.g === 'sph' ? unitSph : unitCone}
          material={stdMat(p.c, { rough: p.rough, metal: p.metal, opacity: p.o, emissive: p.e, side: p.g === 'cone' ? THREE.DoubleSide : THREE.FrontSide })}
          position={p.p}
          scale={p.s}
          rotation={p.r ?? [0, 0, 0]}
          castShadow={!p.o && !p.e}
          receiveShadow
          userData={{ hit: `item:${item.id}` }}
        />
      ))}
      {selected && (
        <mesh position={[0, (item.height * M) / 2, 0]} scale={[item.width * M + 0.04, item.height * M + 0.04, item.depth * M + 0.04]} geometry={unitBox}>
          <meshBasicMaterial color="#2BB3A9" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </group>
    </Exploding>
  )
})

// ---------------------------------------------------------------------------
// Roof

function roofGeometry(level: Level): THREE.BufferGeometry | null {
  const r = level.roof
  if (r.style === 'none') return null
  const pts = level.walls.flatMap((w) => [w.a, w.b])
  if (pts.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const o = r.overhang
  minX -= o
  minY -= o
  maxX += o
  maxY += o
  const y0 = level.height
  const W = maxX - minX
  const D = maxY - minY
  const alongX = r.ridgeAlongLong ? W >= D : W < D
  const span = alongX ? D : W
  const rise = r.pitch * (span / 2)
  const v: number[] = []
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c)
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tri(a, b, c)
    tri(a, c, d)
  }
  const P = (x: number, y: number, z: number) => [x * M, y * M, z * M]
  if (r.style === 'flat') {
    const t = 20
    const A = P(minX, y0 + t, minY)
    const B = P(maxX, y0 + t, minY)
    const C = P(maxX, y0 + t, maxY)
    const D2 = P(minX, y0 + t, maxY)
    quad(A, D2, C, B)
    const a = P(minX, y0, minY)
    const b = P(maxX, y0, minY)
    const c = P(maxX, y0, maxY)
    const d = P(minX, y0, maxY)
    quad(a, b, B, A)
    quad(b, c, C, B)
    quad(c, d, D2, C)
    quad(d, a, A, D2)
  } else if (r.style === 'shed') {
    const hi = y0 + r.pitch * span
    if (alongX) {
      const A = P(minX, hi, minY)
      const B = P(maxX, hi, minY)
      const C = P(maxX, y0, maxY)
      const D2 = P(minX, y0, maxY)
      quad(A, D2, C, B)
      tri(P(minX, y0, minY), P(minX, hi, minY), P(minX, y0, maxY))
      tri(P(maxX, y0, minY), P(maxX, y0, maxY), P(maxX, hi, minY))
      quad(P(minX, y0, minY), P(maxX, y0, minY), B, A)
    } else {
      const A = P(minX, hi, minY)
      const B = P(maxX, y0, minY)
      const C = P(maxX, y0, maxY)
      const D2 = P(minX, hi, maxY)
      quad(A, D2, C, B)
      tri(P(minX, y0, minY), P(minX, y0, maxY), A)
      tri(P(minX, y0, maxY), D2, A)
    }
  } else if (alongX) {
    const zm = (minY + maxY) / 2
    const inset = r.style === 'hip' ? Math.min(D / 2, W / 2) : 0
    const R1 = P(minX + inset, y0 + rise, zm)
    const R2 = P(maxX - inset, y0 + rise, zm)
    quad(P(minX, y0, minY), R1, R2, P(maxX, y0, minY))
    quad(P(maxX, y0, maxY), R2, R1, P(minX, y0, maxY))
    if (r.style === 'hip') {
      tri(P(minX, y0, maxY), R1, P(minX, y0, minY))
      tri(P(maxX, y0, minY), R2, P(maxX, y0, maxY))
    } else {
      tri(P(minX + o, y0, maxY - o), P(minX + o, y0 + rise * ((span / 2 - o) / (span / 2)), zm), P(minX + o, y0, minY + o))
      tri(P(maxX - o, y0, minY + o), P(maxX - o, y0 + rise * ((span / 2 - o) / (span / 2)), zm), P(maxX - o, y0, maxY - o))
    }
  } else {
    const xm = (minX + maxX) / 2
    const inset = r.style === 'hip' ? Math.min(D / 2, W / 2) : 0
    const R1 = P(xm, y0 + rise, minY + inset)
    const R2 = P(xm, y0 + rise, maxY - inset)
    quad(P(minX, y0, maxY), R2, R1, P(minX, y0, minY))
    quad(P(maxX, y0, minY), R1, R2, P(maxX, y0, maxY))
    if (r.style === 'hip') {
      tri(P(minX, y0, minY), R1, P(maxX, y0, minY))
      tri(P(maxX, y0, maxY), R2, P(minX, y0, maxY))
    } else {
      tri(P(maxX - o, y0, minY + o), P(xm, y0 + rise * ((span / 2 - o) / (span / 2)), minY + o), P(minX + o, y0, minY + o))
      tri(P(minX + o, y0, maxY - o), P(xm, y0 + rise * ((span / 2 - o) / (span / 2)), maxY - o), P(maxX - o, y0, maxY - o))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

function RoofMesh({ level, wallColor }: { level: Level; wallColor: string }) {
  const geo = useMemo(() => roofGeometry(level), [level])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  const isGableEnd = level.roof.style === 'gable'
  return <mesh geometry={geo} material={stdMat(isGableEnd ? level.roof.color : level.roof.color, { side: THREE.DoubleSide, rough: 0.8 })} castShadow receiveShadow userData={{ hit: 'roof', wallColor }} />
}

// ---------------------------------------------------------------------------
// Level

function stairHoles(project: Project, level: Level): Vec2[][] {
  const below = project.levels.filter((l) => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)[0]
  if (!below) return []
  return below.items.filter((i) => catalogEntry(i.type).shape === 'stairs').map((i) => rectCorners(i, i.width + 4, i.depth + 4, i.rotation))
}

const LevelModel = memo(function LevelModel({ level, project, cut, showCeiling, showRoof, selectionId, active, index }: { level: Level; project: Project; cut: number | null; showCeiling: boolean; showRoof: boolean; selectionId: string | null; active: boolean; index: number }) {
  const joints = useMemo(() => jointKeys(level), [level])
  const holes = useMemo(() => stairHoles(project, level), [project, level])
  const center = useMemo(() => {
    const b = levelBounds(level)
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 }
  }, [level])
  return (
    <Exploding base={[0, level.elevation * M, 0]} offset={[0, index * 3.4, 0]}>
      {level.rooms.map((r) => (
        <FloorMesh key={r.id} room={r} holes={holes} slab={level.slab} showCeiling={showCeiling && !cut} ceilingY={level.height} selected={active && selectionId === r.id} />
      ))}
      {level.walls.map((w) => (
        <WallMesh key={w.id} w={w} openings={level.openings} joints={joints} cut={cut} selected={active && selectionId === w.id} center={center} />
      ))}
      {level.items.map((i) => {
        const c = catalogEntry(i.type)
        if (cut && c.mount === 'ceiling') return null
        if (cut && c.mount === 'wall' && i.elevation > cut) return null
        return <ItemMesh key={i.id} item={i} selected={active && selectionId === i.id} center={center} />
      })}
      {showRoof && !cut && (
        <Exploding offset={[0, 3.2, 0]}>
          <RoofMesh level={level} wallColor={project.defaults.exteriorColor} />
        </Exploding>
      )}
    </Exploding>
  )
})

// ---------------------------------------------------------------------------
// Lighting and camera

function sunDirection(hour: number, north: number): THREE.Vector3 {
  const t = Math.min(1, Math.max(0, (hour - 6) / 14))
  const elev = Math.max(0.08, Math.sin(t * Math.PI)) * (Math.PI / 180) * 62
  const az = ((90 + t * 180 + north) * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize()
}

function Sun({ center, radius, hour, north, indoor }: { center: THREE.Vector3; radius: number; hour: number; north: number; indoor: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const dir = sunDirection(hour, north)
  const pos = center.clone().add(dir.clone().multiplyScalar(radius * 2 + 10))
  const low = dir.y < 0.35
  useEffect(() => {
    const l = light.current
    if (!l) return
    l.target.position.copy(center)
    l.target.updateMatrixWorld()
    const cam = l.shadow.camera as THREE.OrthographicCamera
    const r = radius + 4
    cam.left = -r
    cam.right = r
    cam.top = r
    cam.bottom = -r
    cam.near = 0.5
    cam.far = radius * 5 + 30
    cam.updateProjectionMatrix()
  }, [center, radius])
  return (
    <>
      <directionalLight ref={light} position={pos} intensity={low ? 1.6 : 2.3} color={low ? '#FFD6A8' : '#FFF6E8'} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
      <hemisphereLight args={['#DDE8F0', '#8C8474', (low ? 0.9 : 1.1) * (indoor ? 1.7 : 1)]} />
      <ambientLight intensity={indoor ? 0.75 : 0.25} />
    </>
  )
}

function Ground({ color, radius }: { color: string; radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow userData={{ hit: 'ground' }}>
      <circleGeometry args={[Math.max(60, radius * 5), 64]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

function CameraRig({ center, radius, zoomRequest, walk }: { center: THREE.Vector3; radius: number; zoomRequest: number; walk: boolean }) {
  const { camera } = useThree()
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const last = useRef(-1)
  useEffect(() => {
    if (walk) return
    if (last.current === zoomRequest && last.current !== -1) return
    last.current = zoomRequest
    const d = Math.max(8, radius * 2.3)
    camera.position.set(center.x + d * 0.55, center.y + d * 0.75, center.z + d * 0.85)
    camera.lookAt(center)
    if (controls.current) {
      controls.current.target.copy(center)
      controls.current.update()
    }
  }, [zoomRequest, center, radius, camera, walk])
  useEffect(() => {
    if (!walk && controls.current) {
      // Returning from walk mode: frame the home again.
      const d = Math.max(8, radius * 2.3)
      camera.position.set(center.x + d * 0.55, center.y + d * 0.75, center.z + d * 0.85)
      controls.current.target.copy(center)
      controls.current.update()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk])
  if (walk) return null
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={1.5} maxDistance={Math.max(60, radius * 6)} />
}

// ---------------------------------------------------------------------------

function bgColor(): string {
  const root = document.documentElement
  const theme = root.getAttribute('data-theme')
  const dark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return dark ? '#162024' : '#DCE6EA'
}

export function Scene3D({ walk }: { walk: boolean }) {
  const project = useStore((s) => s.project)
  const levelId = useStore((s) => s.levelId)
  const selection = useStore((s) => s.selection)
  const cutaway = useStore((s) => s.cutaway)
  const showRoof = useStore((s) => s.showRoof)
  const wallCut = useStore((s) => s.wallCut)
  const sunHour = useStore((s) => s.sunHour)
  const zoomRequest = useStore((s) => s.zoomRequest)
  const [bg, setBg] = useState(bgColor)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = () => setBg(bgColor())
    mq?.addEventListener?.('change', on)
    const mo = new MutationObserver(on)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq?.removeEventListener?.('change', on)
      mo.disconnect()
    }
  }, [])

  const active = activeLevel({ project, levelId })
  const isEmpty = project.levels.every((l) => l.walls.length === 0 && l.rooms.length === 0 && l.items.length === 0)
  const { center, radius } = useMemo(() => {
    const all = project.levels.map(levelBounds).filter(Boolean) as NonNullable<ReturnType<typeof levelBounds>>[]
    if (!all.length) return { center: new THREE.Vector3(4, 0, 4), radius: 8 }
    const minX = Math.min(...all.map((b) => b.minX))
    const maxX = Math.max(...all.map((b) => b.maxX))
    const minY = Math.min(...all.map((b) => b.minY))
    const maxY = Math.max(...all.map((b) => b.maxY))
    const cy = walk ? 0 : active.elevation * M + 1
    return { center: new THREE.Vector3(((minX + maxX) / 2) * M, cy, ((minY + maxY) / 2) * M), radius: (Math.hypot(maxX - minX, maxY - minY) / 2) * M }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.levels.length, zoomRequest, active.id, walk, isEmpty])

  const levels = [...project.levels].sort((a, b) => a.elevation - b.elevation)
  const visible = walk ? levels : cutaway ? levels.filter((l) => l.elevation <= active.elevation) : levels
  const topVisible = visible[visible.length - 1]
  const cut = !walk && wallCut ? 105 : null

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return
    e.stopPropagation()
    const hit = (e.object.userData?.hit as string | undefined) ?? ''
    const [kind, id] = hit.split(':')
    const s = useStore.getState()
    // Find which level the object belongs to and make it active.
    const owner = s.project.levels.find(
      (l) => l.walls.some((w) => w.id === id) || l.rooms.some((r) => r.id === id) || l.items.some((i) => i.id === id) || l.openings.some((o) => o.id === id),
    )
    if (!owner) {
      if (s.tool === 'select') s.select(null)
      return
    }
    if (owner.id !== s.levelId) useStore.setState({ levelId: owner.id })
    if (s.tool === 'paint') {
      const { target, color, floor } = s.paint
      if (kind === 'wall') {
        const n = e.face?.normal
        if (!n || Math.abs(n.z) < 0.5) return
        const side = n.z > 0 ? 'A' : 'B'
        s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? updateWall(l, id, side === 'A' ? { colorA: color } : { colorB: color }) : l)) }))
        s.notify('Wall side painted')
      } else if (kind === 'room') {
        if (target === 'floor') s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? { ...l, rooms: l.rooms.map((r) => (r.id === id ? { ...r, floor, floorColor: undefined } : r)) } : l)) }))
        else s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? paintRoomWalls(l, id, color) : l)) }))
        s.notify(target === 'floor' ? 'Floor changed' : 'Room walls painted')
      } else if (kind === 'item') {
        s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? { ...l, items: l.items.map((i) => (i.id === id ? { ...i, color } : i)) } : l)) }))
        s.notify('Item recoloured')
      }
      return
    }
    if (kind === 'wall' || kind === 'room' || kind === 'item' || kind === 'opening') {
      if (s.tool !== 'select') useStore.setState({ tool: 'select' })
      s.select({ kind, id } as never)
    }
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: walk ? 70 : 42, near: 0.05, far: 2000, position: [12, 10, 14] }}
      onPointerMissed={(e) => {
        if (e.type === 'click' && useStore.getState().tool === 'select') useStore.getState().select(null)
      }}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, radius * 4 + 30, radius * 10 + 90]} />
      <Sun center={center} radius={radius} hour={sunHour} north={project.site.northAngle} indoor={walk} />
      {project.site.showGround && <Ground color={project.site.groundColor} radius={radius} />}
      <group onClick={onClick}>
        {visible.map((l) => (
          <LevelModel
            key={l.id}
            level={l}
            project={project}
            cut={l.id === topVisible.id ? cut : null}
            showCeiling={walk}
            showRoof={walk || (showRoof && (!cutaway || l.id === topVisible.id) && (l.id === topVisible.id || l.roof.style === 'flat'))}
            selectionId={selection?.id ?? null}
            active={l.id === levelId}
            index={visible.indexOf(l)}
          />
        ))}
      </group>
      <ExplodeDriver walk={walk} />
      <CameraRig center={center} radius={radius} zoomRequest={zoomRequest + (isEmpty ? 0.5 : 0)} walk={walk} />
      {walk && <Walker />}
    </Canvas>
  )
}

export { norm }
