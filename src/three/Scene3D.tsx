import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Item, Level, Opening, Project, Room, Vec2, Wall } from '../model/types'
import { activeLevel, useStore } from '../store/store'
import { catalogEntry } from '../model/catalog'
import { dist, pointInPolygon, rectCorners, sub } from '../model/geometry'
import { exteriorSides, levelBounds, paintRoomWalls, updateWall } from '../model/ops'
import { jointKeys, pointKey, wallSpans } from '../plan/wallGeometry'
import { buildParts } from './items3d'
import { floorMat, roofMat, stdMat, unitBox, unitCone, unitCyl, unitSph, wallMat, worldUVBox } from './materials3d'
import { roofMaterialOf } from '../model/roof'
import { Walker } from './Walker'
import { DraggableHome } from './ItemDrag'
import { useHover } from './hover'
import { homeGroupRef } from './exportModel'
import { explodeState, useExplodeOffset } from './explode'

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
  useFrame((_, dt) => {
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

const WallMesh = memo(function WallMesh({ w, openings, joints, cut, selected, center, outside, trim }: { w: Wall; openings: Opening[]; joints: Set<string>; cut: number | null; selected: boolean; center: Vec2; outside: 'A' | 'B' | null; trim: string | null }) {
  const height = cut ? Math.min(cut, w.height) : w.height
  const pieces = wallPieces(w, openings, height, joints)
  const d = sub(w.b, w.a)
  const ang = Math.atan2(d.y, d.x)
  const top = stdMat(cut ? '#3A3F42' : '#D9D6D0')
  const edge = stdMat('#D9D6D0')
  const hovered = useHover((s) => s.id === `wall:${w.id}`)
  const mats = [edge, edge, top, edge, wallMat(w.finishA, w.colorA, selected), wallMat(w.finishB, w.colorB, selected)]
  const piecesKey = JSON.stringify(pieces)
  // Rebuild geometry only when the wall's solid pieces actually change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geos = useMemo(() => pieces.map((p) => worldUVBox((p.x1 - p.x0) * M, (p.y1 - p.y0) * M, w.thickness * M, p.x0 * M, p.y0 * M)), [piecesKey, w.thickness])
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos])
  const mx = (w.a.x + w.b.x) / 2 - center.x
  const my = (w.a.y + w.b.y) / 2 - center.y
  return (
    <Exploding offset={[mx * M * 0.45, 0.35, my * M * 0.45]}>
    <group position={[w.a.x * M, 0, w.a.y * M]} rotation={[0, -ang, 0]}>
      {pieces.map((p, i) => (
        <mesh
          key={i}
          geometry={geos[i]}
          material={mats}
          position={[((p.x0 + p.x1) / 2) * M, ((p.y0 + p.y1) / 2) * M, 0]}
          castShadow
          receiveShadow
          userData={{ hit: `wall:${w.id}` }}
        />
      ))}
      {trim &&
        pieces
          .filter((p) => p.y0 === 0)
          .flatMap((p, i) =>
            (['A', 'B'] as const)
              .filter((side) => side !== outside)
              .map((side) => (
                <mesh
                  key={`bb${i}${side}`}
                  geometry={unitBox}
                  material={stdMat(trim, { rough: 0.5 })}
                  position={[((p.x0 + p.x1) / 2) * M, 0.05, (side === 'A' ? 1 : -1) * (w.thickness / 2 + 0.7) * M]}
                  scale={[(p.x1 - p.x0) * M, 0.1, 0.014]}
                  userData={{ hit: `wall:${w.id}` }}
                />
              )),
          )}
      {hovered &&
        !selected &&
        pieces.map((p, i) => (
          <mesh
            key={`h${i}`}
            geometry={unitBox}
            position={[((p.x0 + p.x1) / 2) * M, ((p.y0 + p.y1) / 2) * M, 0]}
            scale={[(p.x1 - p.x0) * M + 0.02, (p.y1 - p.y0) * M + 0.02, w.thickness * M + 0.02]}
            raycast={() => null}
          >
            <meshBasicMaterial color="#2BB3A9" transparent opacity={0.22} depthWrite={false} />
          </mesh>
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
  const night = useStore((s) => Math.round(nightFactor(s.sunHour) * 4) / 4)
  const glass = night > 0 ? stdMat('#FFD9A0', { opacity: 0.35 + night * 0.4, rough: 0.05, emissive: night * 1.4 }) : stdMat('#BFD9E3', { opacity: 0.28, rough: 0.05, metal: 0.1 })
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
      const style = o.style ?? 'casement'
      box('g', s0 + ft, s1 - ft, y0 + ft, y1 - ft, -0.6, 0.6, glass)
      if (style === 'casement') {
        if (o.width > 100) box('m', o.offset - 2, o.offset + 2, y0 + ft, y1 - ft, -2, 2, frame)
        if (o.height > 100) box('h', s0 + ft, s1 - ft, y0 + o.height * 0.55 - 2, y0 + o.height * 0.55 + 2, -2, 2, frame)
      } else if (style === 'awning') {
        box('h', s0 + ft, s1 - ft, y0 + o.height * 0.68 - 2.5, y0 + o.height * 0.68 + 2.5, -2.5, 2.5, frame)
      } else if (style === 'grid') {
        const cols = Math.max(2, Math.round(o.width / 30))
        const rows = Math.max(2, Math.round(o.height / 30))
        for (let c = 1; c < cols; c++) {
          const x = s0 + ft + ((o.width - 2 * ft) * c) / cols
          box(`gc${c}`, x - 1.2, x + 1.2, y0 + ft, y1 - ft, -1.5, 1.5, frame)
        }
        for (let r = 1; r < rows; r++) {
          const y = y0 + ft + ((o.height - 2 * ft) * r) / rows
          box(`gr${r}`, s0 + ft, s1 - ft, y - 1.2, y + 1.2, -1.5, 1.5, frame)
        }
      }
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
    const leafMat = stdMat(o.leafColor ?? o.frameColor, { rough: 0.55 })
    const style = o.style ?? 'panel'
    const openAng = (65 * Math.PI) / 180
    if (style === 'barn' && o.kind === 'door') {
      // Sliding barn door: leaf hangs on the wall face beside the opening, on a rail.
      const zf = sideSign * (t / 2 + 3)
      const lw = o.width + 10
      const xs = o.hinge === 'start' ? s0 - lw + 12 : s1 - 12
      box('rail', Math.min(xs, s0) - 5, Math.max(xs + lw, s1) + 5, y1 + 4, y1 + 8, zf - 1.5, zf + 1.5, stdMat('#2A2B2D', { metal: 0.7 }))
      box('leaf', xs, xs + lw, 1, y1 + 4, zf - 2, zf + 2, leafMat)
      box('brace1', xs + 6, xs + lw - 6, y1 * 0.5 - 4, y1 * 0.5 + 4, zf + sideSign * 2, zf + sideSign * 3.2, leafMat)
      return <>{parts}</>
    }
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
          {style === 'panel' &&
            [0.28, 0.72].flatMap((fy) =>
              [-1, 1].map((face) => (
                <mesh
                  key={`${fy}${face}`}
                  geometry={unitBox}
                  material={leafMat}
                  position={[((lf.dir * lf.width) / 2) * M, hLeaf * fy * M, (sideSign * -2 + face * 2.3) * M]}
                  scale={[lf.width * 0.7 * M, hLeaf * 0.34 * M, 1 * M]}
                  userData={{ hit: `opening:${o.id}` }}
                />
              )),
            )}
          {style === 'glass' && (
            <mesh geometry={unitBox} material={glass} position={[((lf.dir * lf.width) / 2) * M, hLeaf * 0.55 * M, sideSign * -2 * M]} scale={[lf.width * 0.72 * M, hLeaf * 0.7 * M, 4.4 * M]} userData={{ hit: `opening:${o.id}` }} />
          )}
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
  const angle = room.floorAngle ?? 0
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: slab * M, bevelEnabled: false })
    if (angle) {
      // Turn the pattern: rotate the texture coordinates (which are in metres).
      const uv = g.attributes.uv
      const c = Math.cos((angle * Math.PI) / 180)
      const s = Math.sin((angle * Math.PI) / 180)
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i)
        const v = uv.getY(i)
        uv.setXY(i, u * c - v * s, u * s + v * c)
      }
      uv.needsUpdate = true
    }
    return g
  }, [shape, slab, angle])
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
  const hovered = useHover((s) => s.id === `item:${item.id}`)
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
      {(selected || hovered) && (
        <mesh position={[0, (item.height * M) / 2, 0]} scale={[item.width * M + 0.04, item.height * M + 0.04, item.depth * M + 0.04]} geometry={unitBox} raycast={() => null}>
          <meshBasicMaterial color="#2BB3A9" wireframe transparent opacity={selected ? 0.95 : 0.5} />
        </mesh>
      )}
    </group>
    </Exploding>
  )
})

// ---------------------------------------------------------------------------
// Name tags shown while the house is pulled apart, so each layer is identifiable.

function PartTag({ at, bounds, text }: { at: [number, number, number]; bounds: ReturnType<typeof levelBounds>; text: string }) {
  const exploded = useStore((s) => s.explode > 0.05)
  if (!exploded) return null
  const pos: [number, number, number] = bounds ? [bounds.minX * M - 0.4, at[1], bounds.minY * M - 0.4] : at
  return (
    <Html position={pos} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <span className="part-tag">{text}</span>
    </Html>
  )
}

// ---------------------------------------------------------------------------
// Lamps: real point lights that fade in after dark. The number of lights only
// changes when lamps are added or removed, so moving the time slider never
// forces shaders to recompile.

const LAMP_SHAPES: Record<string, number> = { 'floor-lamp': 0.85, 'table-lamp': 0.72, pendant: 0.1, chandelier: 0.5, 'ceiling-light': 0, sconce: 0.6, 'fire-pit': 1.2 }

function LampLights({ items }: { items: Item[] }) {
  const hour = useStore((s) => s.sunHour)
  const night = nightFactor(hour)
  const lamps = items.filter((i) => catalogEntry(i.type).shape in LAMP_SHAPES).slice(0, 10)
  return (
    <>
      {lamps.map((i) => {
        const shape = catalogEntry(i.type).shape
        const y = i.elevation / 100 + (i.height / 100) * LAMP_SHAPES[shape] - (shape === 'ceiling-light' ? 0.05 : 0)
        return <pointLight key={i.id} position={[i.x / 100, y, i.y / 100]} intensity={night * (shape === 'chandelier' ? 9 : 5)} distance={7} decay={1.6} color="#FFD8A0" />
      })}
    </>
  )
}

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
  return withRoofUVs(v, r.style !== 'flat')
}

/**
 * Split triangles into roof surfaces (group 0) and vertical gable or shed ends
 * (group 1, clad like the outside walls), with UVs in metres: u along the
 * eaves, v up the slope, so coverings run in true scale and direction.
 */
function withRoofUVs(v: number[], splitEnds: boolean): THREE.BufferGeometry {
  const up = new THREE.Vector3(0, 1, 0)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const t = new THREE.Vector3()
  const bt = new THREE.Vector3()
  const buckets: [number[], number[]][] = [
    [[], []],
    [[], []],
  ]
  for (let i = 0; i < v.length; i += 9) {
    a.fromArray(v, i)
    b.fromArray(v, i + 3)
    c.fromArray(v, i + 6)
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize()
    if (Math.abs(n.y) > 0.999) {
      t.set(1, 0, 0)
      bt.set(0, 0, 1)
    } else {
      t.crossVectors(up, n).normalize()
      bt.crossVectors(n, t).normalize()
      if (bt.y < 0) bt.negate()
    }
    const end = splitEnds && Math.abs(n.y) < 0.05
    const [pos, uv] = buckets[end ? 1 : 0]
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z)
      uv.push(p.dot(t), p.dot(bt))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...buckets[0][0], ...buckets[1][0]], 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...buckets[0][1], ...buckets[1][1]], 2))
  const n0 = buckets[0][0].length / 3
  g.addGroup(0, n0, 0)
  g.addGroup(n0, buckets[1][0].length / 3, 1)
  g.computeVertexNormals()
  return g
}

const endMats = new Map<string, THREE.Material>()
function roofEndMat(finish: string | undefined, color: string): THREE.Material {
  const key = `${finish}|${color}`
  let m = endMats.get(key)
  if (!m) {
    m = wallMat(finish, color).clone()
    m.side = THREE.DoubleSide
    endMats.set(key, m)
  }
  return m
}

function RoofMesh({ level, wallColor, endFinish }: { level: Level; wallColor: string; endFinish?: string }) {
  const geo = useMemo(() => roofGeometry(level), [level])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  const mats = [roofMat(roofMaterialOf(level), level.roof.color), roofEndMat(endFinish, wallColor)]
  return <mesh geometry={geo} material={mats} castShadow receiveShadow userData={{ hit: 'roof', wallColor }} />
}

// ---------------------------------------------------------------------------
// Level

function stairHoles(project: Project, level: Level): Vec2[][] {
  const below = project.levels.filter((l) => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)[0]
  if (!below) return []
  return below.items.filter((i) => catalogEntry(i.type).shape === 'stairs').map((i) => rectCorners(i, i.width + 4, i.depth + 4, i.rotation))
}

const LevelModel = memo(function LevelModel({ level, project, cut, showCeiling, showRoof, selectionId, active, index, multi, hide }: { level: Level; project: Project; cut: number | null; showCeiling: boolean; showRoof: boolean; selectionId: string | null; active: boolean; index: number; multi: string[]; hide: string }) {
  // Derived inputs are keyed by value so that editing one object (dragging a
  // chair) does not hand every wall and floor a "new" prop and rebuild them.
  const jointsKey = [...jointKeys(level)].sort().join('|')
  const joints = useMemo(() => new Set(jointsKey ? jointsKey.split('|') : []), [jointsKey])
  const holesKey = JSON.stringify(stairHoles(project, level).map((h) => h.map((p) => [Math.round(p.x), Math.round(p.y)])))
  const holes = useMemo(() => (JSON.parse(holesKey) as number[][][]).map((h) => h.map(([x, y]) => ({ x, y }))), [holesKey])
  const b = levelBounds(level)
  const cx = b ? Math.round((b.minX + b.maxX) / 2) : 0
  const cy = b ? Math.round((b.minY + b.maxY) / 2) : 0
  const center = useMemo(() => ({ x: cx, y: cy }), [cx, cy])
  const outsideKey = exteriorSides(level)
    .map((s) => `${s.wall.id}:${s.side}`)
    .join('|')
  const outside = useMemo(() => new Map(outsideKey ? outsideKey.split('|').map((x) => x.split(':') as [string, 'A' | 'B']) : []), [outsideKey])
  const trim = project.defaults.baseboards === false ? null : project.defaults.trimColor ?? '#F7F7F4'
  // Gable ends take the cladding of the first outside wall face.
  const firstOut = [...outside][0]
  const firstWall = firstOut ? level.walls.find((w) => w.id === firstOut[0]) : undefined
  const endCladding = firstWall
    ? firstOut[1] === 'A'
      ? { finish: firstWall.finishA, color: firstWall.colorA }
      : { finish: firstWall.finishB, color: firstWall.colorB }
    : { finish: undefined, color: project.defaults.exteriorColor }
  return (
    <Exploding base={[0, level.elevation * M, 0]} offset={[0, index * 3.4, 0]}>
      {!hide.includes('floors') && level.rooms.map((r) => (
        <FloorMesh key={r.id} room={r} holes={holes} slab={level.slab} showCeiling={showCeiling && !cut} ceilingY={level.height} selected={active && selectionId === r.id} />
      ))}
      {!hide.includes('walls') && level.walls.map((w) => (
        <WallMesh key={w.id} w={w} openings={level.openings} joints={joints} cut={cut} selected={active && selectionId === w.id} center={center} outside={outside.get(w.id) ?? null} trim={trim} />
      ))}
      {!hide.includes('furniture') && level.items.map((i) => {
        const c = catalogEntry(i.type)
        if (cut && c.mount === 'ceiling') return null
        if (cut && c.mount === 'wall' && i.elevation > cut) return null
        return <ItemMesh key={i.id} item={i} selected={active && (selectionId === i.id || multi.includes(i.id))} center={center} />
      })}
      <LampLights items={level.items} />
      <PartTag at={[(center.x - 0) * M, 0.3, center.y * M]} bounds={levelBounds(level)} text={level.name} />
      {showRoof && !cut && !hide.includes('roof') && (
        <Exploding offset={[0, 3.2, 0]}>
          <RoofMesh level={level} wallColor={endCladding.color} endFinish={endCladding.finish} />
          {level.roof.style !== 'none' && <PartTag at={[center.x * M, (level.height + 60) / 100, center.y * M]} bounds={null} text={`Roof (${level.roof.style})`} />}
        </Exploding>
      )}
    </Exploding>
  )
})

// ---------------------------------------------------------------------------
// Lighting and camera

function sunDirection(hour: number, north: number): THREE.Vector3 {
  // After dark the "sun" becomes moonlight from high in the south-west.
  if (hour > 20.25 || hour < 5.75) hour = 14.5
  const t = Math.min(1, Math.max(0, (hour - 6) / 14))
  const elev = Math.max(0.08, Math.sin(t * Math.PI)) * (Math.PI / 180) * 62
  const az = ((90 + t * 180 + north) * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize()
}

/** 0 in daylight, 1 at night; eases through dusk and dawn. */
export function nightFactor(hour: number): number {
  if (hour >= 7 && hour <= 18.5) return 0
  if (hour > 18.5) return Math.min(1, (hour - 18.5) / 1.75)
  return Math.min(1, (7 - hour) / 1.5)
}

function Sun({ center, radius, hour, north, indoor }: { center: THREE.Vector3; radius: number; hour: number; north: number; indoor: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null)
  const night = nightFactor(hour)
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
      <directionalLight ref={light} position={pos} intensity={(low ? 1.6 : 2.3) * (1 - night * 0.93)} color={night > 0.3 ? '#9FB4E8' : low ? '#FFD6A8' : '#FFF6E8'} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} />
      <hemisphereLight args={[night > 0.5 ? '#5C6E99' : '#DDE8F0', '#8C8474', (low ? 0.9 : 1.1) * (indoor ? 1.7 : 1) * (1 - night * 0.8)]} />
      <ambientLight intensity={(indoor ? 0.75 : 0.25) * (1 - night * 0.7)} />
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
  const { camera, size } = useThree()
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null)
  const last = useRef<string>('')
  const aspect = size.width / Math.max(1, size.height)
  const viewFrom = useStore((s) => s.viewFrom)
  const frame = () => {
    const cam = camera as THREE.PerspectiveCamera
    const vfov = ((cam.fov || 42) * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const r = Math.max(4, radius)
    const d = Math.max(r / Math.sin(vfov / 2), r / Math.sin(hfov / 2)) * 1.0
    // Plan north is -z. "From the south" means the camera stands south looking north.
    const dirs: Record<string, [number, number, number]> = { corner: [0.55, 0.75, 0.85], top: [0, 1, 0.0001], N: [0, 0.18, -1], S: [0, 0.18, 1], E: [1, 0.18, 0], W: [-1, 0.18, 0] }
    const dir = new THREE.Vector3(...dirs[viewFrom.dir]).normalize()
    camera.position.copy(center).addScaledVector(dir, d)
    camera.lookAt(center)
    if (controls.current) {
      controls.current.target.copy(center)
      controls.current.update()
    }
  }
  // Double-click: glide the orbit centre to the clicked point and move in.
  const focus = useStore((s) => s.focus)
  const anim = useRef<{ t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null>(null)
  useEffect(() => {
    if (!focus || !controls.current) return
    const target = new THREE.Vector3(focus.x, focus.y, focus.z)
    const fromT = controls.current.target.clone()
    const dir = camera.position.clone().sub(fromT).normalize()
    const dist = Math.min(camera.position.distanceTo(fromT), 5.5)
    anim.current = { t: 0, fromT, toT: target, fromP: camera.position.clone(), toP: target.clone().addScaledVector(dir, dist) }
  }, [focus, camera])
  useFrame((_, dt) => {
    const a = anim.current
    if (!a || !controls.current) return
    a.t = Math.min(1, a.t + dt / 0.6)
    const k = 1 - Math.pow(1 - a.t, 3)
    controls.current.target.lerpVectors(a.fromT, a.toT, k)
    camera.position.lerpVectors(a.fromP, a.toP, k)
    controls.current.update()
    if (a.t >= 1) anim.current = null
  })
  // Frame on first show, on "Reset", and when the pane changes shape a lot.
  const key = `${zoomRequest}|${walk}|${Math.round(aspect * 4)}|${viewFrom.seq}`
  useEffect(() => {
    if (walk || last.current === key) return
    last.current = key
    frame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, walk])
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
  const multi = useStore((s) => s.multi)
  const cutaway = useStore((s) => s.cutaway)
  const showRoof = useStore((s) => s.showRoof)
  const wallCut = useStore((s) => s.wallCut)
  const sunHour = useStore((s) => s.sunHour)
  const zoomRequest = useStore((s) => s.zoomRequest)
  const explode = useStore((s) => (s.explode > 0 ? 1 : 0))
  const lowQuality = useStore((s) => s.lowQuality)
  const hiddenParts = useStore((s) => s.hiddenParts)
  const hide = explode && !walk ? hiddenParts.join(',') : ''
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
    const lift = walk ? 0 : explode * Math.max(1, project.levels.length) * 1.7
    const cy = walk ? 0 : active.elevation * M + 1 + lift
    return { center: new THREE.Vector3(((minX + maxX) / 2) * M, cy, ((minY + maxY) / 2) * M), radius: (Math.hypot(maxX - minX, maxY - minY) / 2) * M + lift * 1.2 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.levels.length, zoomRequest, active.id, walk, isEmpty, explode])

  const nightNow = nightFactor(sunHour)
  const skyColor = useMemo(() => '#' + new THREE.Color(bg).lerp(new THREE.Color('#0B1220'), nightNow * 0.92).getHexString(), [bg, nightNow])
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
      const { target, color, floor, finish } = s.paint
      if (kind === 'wall') {
        const n = e.face?.normal
        if (!n || Math.abs(n.z) < 0.5) return
        const side = n.z > 0 ? 'A' : 'B'
        s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? updateWall(l, id, side === 'A' ? { colorA: color, finishA: finish } : { colorB: color, finishB: finish }) : l)) }))
        s.notify('Wall side painted')
      } else if (kind === 'room') {
        if (target === 'floor') s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? { ...l, rooms: l.rooms.map((r) => (r.id === id ? { ...r, floor, floorColor: undefined } : r)) } : l)) }))
        else s.apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === owner.id ? paintRoomWalls(l, id, color, finish) : l)) }))
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
      key={lowQuality ? 'low' : 'high'}
      shadows={!lowQuality}
      dpr={lowQuality ? 1 : [1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }}
      camera={{ fov: walk ? 70 : 42, near: 0.05, far: 2000, position: [12, 10, 14] }}
      onPointerMissed={(e) => {
        if (e.type === 'click' && useStore.getState().tool === 'select') useStore.getState().select(null)
      }}
    >
      <color attach="background" args={[skyColor]} />
      <fog attach="fog" args={[skyColor, radius * 4 + 30, radius * 10 + 90]} />
      <Sun center={center} radius={radius} hour={sunHour} north={project.site.northAngle} indoor={walk} />
      {project.site.showGround && <Ground color={project.site.groundColor} radius={radius} />}
      <group onClick={onClick} ref={(g) => void (homeGroupRef.current = g)}>
        <DraggableHome disabled={walk}>
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
            multi={multi}
            hide={hide}
          />
        ))}
        </DraggableHome>
      </group>
      <ExplodeDriver walk={walk} />
      <CameraRig center={center} radius={radius} zoomRequest={zoomRequest + (isEmpty ? 0.5 : 0) + explode * 0.25} walk={walk} />
      {walk && <Walker />}
    </Canvas>
  )
}

