/**
 * Everything outside the house in 3D: a painted sky with sun, moon, clouds
 * and stars; rolling ground that fades into hazy hills; the street, drive,
 * paths and planting beds; instanced trees and shrubs; neighbouring houses
 * and street lamps that light up after dark.
 */
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Landscape, Neighbour, Rect, Shrub, Tree } from '../model/landscape'
import { rng } from '../model/landscape'
import { sceneDirection } from '../model/sun'
import { floorMaterial } from '../model/materials'
import { floorTexture } from './textures'
import { asphaltTexture, concreteTexture, fieldTexture, grassTexture, gravelTexture, mulchTexture } from './groundTextures'
import { stdMat, unitBox, unitCone, unitCyl, unitSph } from './materials3d'
import { buildParts } from './items3d'

const M = 0.01

// ---------------------------------------------------------------------------
// Sun and sky colours

/** The sun's true direction, below the horizon at night (the lighting uses moonlight then). */
export function solarDirection(azimuth: number, elevation: number, north: number): THREE.Vector3 {
  return new THREE.Vector3(...sceneDirection(azimuth, elevation, north)).normalize()
}

const STOPS: Array<[number, { top: string; horizon: string; ground: string; sun: string }]> = [
  [-0.14, { top: '#03060f', horizon: '#111a2e', ground: '#080b12', sun: '#9fb4e8' }],
  [-0.03, { top: '#1f2c52', horizon: '#dd8659', ground: '#2e2826', sun: '#ff8f4d' }],
  [0.1, { top: '#3c63a3', horizon: '#efc394', ground: '#5d584c', sun: '#ffcf96' }],
  [0.32, { top: '#2b69b6', horizon: '#bad4e8', ground: '#77746a', sun: '#fff2d8' }],
]

export interface SkyColors {
  top: THREE.Color
  horizon: THREE.Color
  ground: THREE.Color
  sun: THREE.Color
  night: number
}

export function skyColors(elev: number): SkyColors {
  const c = (hex: string) => new THREE.Color(hex)
  let i = 0
  while (i < STOPS.length - 1 && elev > STOPS[i + 1][0]) i++
  const [e0, a] = STOPS[i]
  const [e1, b] = STOPS[Math.min(i + 1, STOPS.length - 1)]
  const t = e1 === e0 ? 0 : Math.min(1, Math.max(0, (elev - e0) / (e1 - e0)))
  return {
    top: c(a.top).lerp(c(b.top), t),
    horizon: c(a.horizon).lerp(c(b.horizon), t),
    ground: c(a.ground).lerp(c(b.ground), t),
    sun: c(a.sun).lerp(c(b.sun), t),
    night: Math.min(1, Math.max(0, (-0.02 - elev) / 0.1)),
  }
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uCloud;
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h >= 0.0 ? mix(uHorizon, uTop, pow(h, 0.5)) : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
  vec3 sd = normalize(uSunDir);
  float s = max(dot(d, sd), 0.0);
  float day = 1.0 - uNight;
  // Glow around the sun, and the disc itself.
  col += uSun * (pow(s, 6.0) * 0.22 + pow(s, 60.0) * 0.45) * (0.25 + 0.75 * day);
  col = mix(col, uSun * 2.4, smoothstep(0.99955, 0.99975, s) * step(0.0, h));
  // Moon.
  float m = max(dot(d, normalize(uMoonDir)), 0.0);
  col += vec3(0.55, 0.62, 0.78) * pow(m, 90.0) * 0.25 * uNight;
  col = mix(col, vec3(0.92, 0.94, 0.98), smoothstep(0.99975, 0.9999, m) * uNight);
  // Clouds on a flat layer overhead, lit from the sun's side.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.5 + vec2(uTime * 0.012, uTime * 0.005);
    float n = fbm(uv);
    float c = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.3, n) * smoothstep(0.0, 0.2, h);
    float lit = 0.8 + 0.45 * pow(s, 3.0);
    vec3 cloud = mix(uHorizon, vec3(1.0), 0.6) * lit;
    cloud = mix(cloud, uSun, 0.22 * day);
    cloud = mix(cloud, uTop * 1.8 + vec3(0.015), uNight);
    col = mix(col, cloud, c * 0.88);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export const SkyDome = memo(function SkyDome({ azimuth, elevation, north, clouds = 0.56, radius = 1500 }: { azimuth: number; elevation: number; north: number; clouds?: number; radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uSun: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
          uNight: { value: 0 },
          uCloud: { value: clouds },
          uTime: { value: 0 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useEffect(() => {
    const dir = solarDirection(azimuth, elevation, north)
    const c = skyColors(dir.y)
    const u = mat.uniforms
    u.uTop.value.copy(c.top)
    u.uHorizon.value.copy(c.horizon)
    u.uGround.value.copy(c.ground)
    u.uSun.value.copy(c.sun)
    u.uSunDir.value.copy(dir)
    // The moon hangs high in the north, where the usual views look.
    u.uMoonDir.value.copy(solarDirection(20, 58, north))
    u.uNight.value = c.night
    u.uCloud.value = clouds
  }, [azimuth, elevation, north, clouds, mat])
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt
  })
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  )
})

// ---------------------------------------------------------------------------
// Small noise for terrain

function vnoise(x: number, y: number): number {
  const h = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const i = Math.floor(x)
  const j = Math.floor(y)
  const fx = x - i
  const fy = y - j
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * ux
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * ux
  return a + (b - a) * uy
}

function fbm(x: number, y: number, oct = 4): number {
  let v = 0
  let a = 0.5
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x, y)
    x = x * 2.03 + 17.1
    y = y * 2.03 + 11.7
    a *= 0.5
  }
  return v
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Ground

const Terrain = memo(function Terrain({ L, color }: { L: Landscape; color: string }) {
  const cx = (L.lot.x + L.lot.w / 2) * M
  const cz = (L.lot.y + L.lot.d / 2) * M
  const flatR = Math.max(90, (Math.hypot(L.lot.w, L.lot.d) * M) / 2 + (L.kind === 'country' ? 110 : 60))
  const roadZ = L.street ? ((L.street.road[0] + L.street.road[1]) / 2) * M : L.lane ? ((L.lane[0] + L.lane[1]) / 2) * M : null
  const geo = useMemo(() => {
    const size = 2600
    const seg = 200
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    const uv = g.attributes.uv
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx
      const z = pos.getZ(i) + cz
      const r = Math.hypot(x - cx, z - cz)
      let flat = smooth(flatR, flatR + 70, r)
      if (roadZ !== null) flat = Math.min(flat, Math.max(smooth(30, 70, Math.abs(z - roadZ)), smooth(140, 190, Math.abs(x - cx))))
      const rolling = (fbm(x * 0.012, z * 0.012, 3) - 0.5) * 7
      const hills = smooth(260, 900, r) * (fbm(x * 0.0035 + 3.1, z * 0.0035 - 1.7, 4) * 95 - 18)
      pos.setXYZ(i, x, -0.16 + flat * (rolling + hills), z)
      uv.setXY(i, x / 2.5, z / 2.5)
      const v = 0.84 + fbm(x * 0.045, z * 0.045, 3) * 0.3
      const dry = smooth(200, 700, r) * 0.08
      col[i * 3] = v + dry
      col[i * 3 + 1] = v + dry * 0.6
      col[i * 3 + 2] = v * 0.96
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [cx, cz, flatR, roadZ])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, map: grassTexture(), vertexColors: true, roughness: 1 }), [color])
  useEffect(() => () => mat.dispose(), [mat])
  return <mesh geometry={geo} material={mat} receiveShadow userData={{ hit: 'ground' }} />
})

/** A flat convex polygon (world metres) with UVs in metres divided by `tile`. */
function flatGeo(pts: Array<[number, number]>, tileU: number, tileV = tileU): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  for (let i = 1; i + 1 < pts.length; i++) {
    for (const p of [pts[0], pts[i + 1], pts[i]]) {
      pos.push(p[0], 0, p[1])
      uv.push(p[0] / tileU, p[1] / tileV)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

const rectPts = (r: Rect): Array<[number, number]> => [
  [r.minX * M, r.minY * M],
  [r.maxX * M, r.minY * M],
  [r.maxX * M, r.maxY * M],
  [r.minX * M, r.maxY * M],
]

function Surface({ pts, y, mat, tile, tileV }: { pts: Array<[number, number]>; y: number; mat: THREE.Material; tile: number; tileV?: number }) {
  const geo = useMemo(() => flatGeo(pts, tile, tileV), [pts, tile, tileV])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={mat} position={[0, y, 0]} receiveShadow userData={{ hit: 'ground' }} />
}

function texMat(tex: THREE.Texture, rough = 0.95, color = '#ffffff') {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: rough, color, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
}

const Paving = memo(function Paving({ L }: { L: Landscape }) {
  const mats = useMemo(() => {
    const pav = floorTexture(floorMaterial('pavers'))
    return {
      asphalt: texMat(asphaltTexture(), 0.92),
      walk: texMat(concreteTexture('#c9c6bf'), 0.9),
      drive: texMat(concreteTexture('#d2cfc8'), 0.85),
      pavers: { mat: texMat(pav.tex, 0.9), sx: pav.sx, sy: pav.sy },
      mulch: texMat(mulchTexture(), 1),
      gravel: texMat(gravelTexture(), 1),
      curb: stdMat('#b9b6ae', { rough: 0.9 }),
      line: stdMat('#e2b53e', { rough: 0.7 }),
    }
  }, [])
  const cx = (L.lot.x + L.lot.w / 2) * M
  const span = 130
  const band = (y0: number, y1: number): Array<[number, number]> => [
    [cx - span, y0 * M],
    [cx + span, y0 * M],
    [cx + span, y1 * M],
    [cx - span, y1 * M],
  ]
  const s = L.street
  const dashes = useMemo(() => {
    if (!s) return null
    const mid = ((s.road[0] + s.road[1]) / 2) * M
    const n = Math.floor((span * 2) / 9)
    const im = new THREE.InstancedMesh(unitBox, mats.line, n)
    const m = new THREE.Matrix4()
    for (let i = 0; i < n; i++) {
      m.compose(new THREE.Vector3(cx - span + i * 9 + 2, -0.125, mid), new THREE.Quaternion(), new THREE.Vector3(3, 0.01, 0.12))
      im.setMatrixAt(i, m)
    }
    im.receiveShadow = true
    return im
  }, [s, cx, mats])
  return (
    <group>
      {s && (
        <>
          <Surface pts={band(s.road[0], s.road[1])} y={-0.14} mat={mats.asphalt} tile={5} />
          <Surface pts={band(s.sidewalk[0], s.sidewalk[1])} y={-0.13} mat={mats.walk} tile={1.5} />
          <Surface pts={band(s.far[2], s.far[3])} y={-0.13} mat={mats.walk} tile={1.5} />
          {[s.road[0] - 15, s.road[1]].map((y, k) => (
            <mesh key={k} geometry={unitBox} material={mats.curb} position={[cx, -0.08, (y + 7.5) * M]} scale={[span * 2, 0.15, 0.15]} receiveShadow castShadow={false} />
          ))}
          {dashes && <primitive object={dashes} />}
        </>
      )}
      {L.lane && <Surface pts={band(L.lane[0], L.lane[1])} y={-0.14} mat={mats.gravel} tile={2} />}
      {L.driveways.map((d, k) => (
        <Surface key={`d${k}`} pts={rectPts(d)} y={-0.12} mat={mats.drive} tile={3} />
      ))}
      {L.paths.map((d, k) => (
        <Surface key={`p${k}`} pts={rectPts(d)} y={-0.11} mat={mats.pavers.mat} tile={mats.pavers.sx} tileV={mats.pavers.sy} />
      ))}
      {L.beds.map((b, k) => {
        const o = { x: b.n.x * 95, y: b.n.y * 95 }
        const pts: Array<[number, number]> = [
          [b.a.x * M, b.a.y * M],
          [b.b.x * M, b.b.y * M],
          [(b.b.x + o.x) * M, (b.b.y + o.y) * M],
          [(b.a.x + o.x) * M, (b.a.y + o.y) * M],
        ]
        return <Surface key={`b${k}`} pts={pts} y={-0.1} mat={mats.mulch} tile={1.2} />
      })}
      {L.kind === 'country' && <Fields L={L} />}
    </group>
  )
})

const Fields = memo(function Fields({ L }: { L: Landscape }) {
  const mats = useMemo(
    () => [
      texMat(fieldTexture('#c8ad62', '#8f7650'), 1),
      texMat(fieldTexture('#6f9447', '#6e5a3e'), 1),
      texMat(fieldTexture('#9aa65a', '#7b6446'), 1),
      texMat(fieldTexture('#7b6446', '#6a553b'), 1),
    ],
    [],
  )
  const plots = useMemo(() => {
    const r = rng(Math.round(L.lot.w + L.lot.d))
    const out: Array<{ pts: Array<[number, number]>; mat: number }> = []
    const cx = (L.lot.x + L.lot.w / 2) * M
    const lotRect = { minX: L.lot.x * M - 12, maxX: (L.lot.x + L.lot.w) * M + 12, minY: L.lot.y * M - 12, maxY: L.front * M + 14 }
    for (let gx = -4; gx <= 4; gx++)
      for (let gy = -3; gy <= 3; gy++) {
        const w = 38 + r() * 18
        const d = 30 + r() * 16
        const x = cx + gx * 62 + (r() - 0.5) * 8
        const z = L.front * M + gy * 50 + 30 + (r() - 0.5) * 8
        const rect = { minX: x - w / 2, maxX: x + w / 2, minY: z - d / 2, maxY: z + d / 2 }
        if (rect.maxX > lotRect.minX && rect.minX < lotRect.maxX && rect.maxY > lotRect.minY && rect.minY < lotRect.maxY) continue
        if (L.lane && rect.maxY > L.lane[0] * M - 2 && rect.minY < L.lane[1] * M + 2) continue
        if (Math.hypot(x - cx, z - L.front * M) > 230 || r() < 0.2) continue
        out.push({ pts: [[rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.maxX, rect.maxY], [rect.minX, rect.maxY]], mat: Math.floor(r() * mats.length) })
      }
    return out
  }, [L, mats])
  return (
    <group>
      {plots.map((p, k) => (
        <Surface key={k} pts={p.pts} y={-0.145} mat={mats[p.mat]} tile={4} />
      ))}
    </group>
  )
})

// ---------------------------------------------------------------------------
// Plants

const trunkGeo = new THREE.CylinderGeometry(0.55, 0.8, 1, 7).translate(0, 0.5, 0)
const blobGeo = new THREE.IcosahedronGeometry(1, 1)
const coneGeo = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)
const petalGeo = new THREE.IcosahedronGeometry(1, 0)
const plantMat = () => new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true })

const LEAF = ['#4d7a35', '#5b8a3c', '#6b9446', '#43692f', '#7a9a48', '#56823a']
const AUTUMN = ['#b88a3a', '#a8612f', '#c49a42']
const NEEDLE = ['#2f5a3a', '#3b6b44', '#2a4d33', '#355f3c']
const BUSH = ['#3f6b33', '#4f7d3a', '#58803f', '#3a5f37', '#62894a']

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Array<{ p: THREE.Vector3; s: THREE.Vector3; r?: number; c: string }>, shadow: boolean) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length))
  im.count = list.length
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const col = new THREE.Color()
  list.forEach((it, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r ?? 0)
    m.compose(it.p, q, it.s)
    im.setMatrixAt(i, m)
    im.setColorAt(i, col.set(it.c))
  })
  im.castShadow = shadow
  im.receiveShadow = shadow
  im.userData.hit = 'ground'
  return im
}

export const TreesLayer = memo(function TreesLayer({ trees, shadow }: { trees: Tree[]; shadow: boolean }) {
  const meshes = useMemo(() => {
    const trunks: Array<{ p: THREE.Vector3; s: THREE.Vector3; r?: number; c: string }> = []
    const blobs: typeof trunks = []
    const cones: typeof trunks = []
    for (const t of trees) {
      const x = t.x * M
      const z = t.y * M
      const h = t.h * M
      const r = t.r * M
      const v = t.v
      if (t.kind === 'conifer') {
        trunks.push({ p: new THREE.Vector3(x, -0.15, z), s: new THREE.Vector3(r * 0.09, h * 0.3, r * 0.09), c: '#4e3b2c' })
        const c = NEEDLE[Math.floor(v * NEEDLE.length) % NEEDLE.length]
        cones.push({ p: new THREE.Vector3(x, h * 0.16, z), s: new THREE.Vector3(r, h * 0.46, r), r: v * 6, c })
        cones.push({ p: new THREE.Vector3(x, h * 0.4, z), s: new THREE.Vector3(r * 0.74, h * 0.38, r * 0.74), r: v * 9, c })
        cones.push({ p: new THREE.Vector3(x, h * 0.62, z), s: new THREE.Vector3(r * 0.46, h * 0.38, r * 0.46), r: v * 3, c })
      } else {
        trunks.push({ p: new THREE.Vector3(x, -0.15, z), s: new THREE.Vector3(Math.max(0.12, r * 0.08), h * 0.62, Math.max(0.12, r * 0.08)), c: '#5a4636' })
        const pal = v > 0.92 ? AUTUMN : LEAF
        const c = pal[Math.floor(v * 97) % pal.length]
        const a = v * Math.PI * 2
        blobs.push({ p: new THREE.Vector3(x, h - r * 0.9, z), s: new THREE.Vector3(r, r * 0.86, r), r: a, c })
        blobs.push({ p: new THREE.Vector3(x + Math.cos(a) * r * 0.5, h - r * 1.35, z + Math.sin(a) * r * 0.5), s: new THREE.Vector3(r * 0.72, r * 0.62, r * 0.72), r: a * 2, c: LEAF[(Math.floor(v * 31) + 1) % LEAF.length] })
        blobs.push({ p: new THREE.Vector3(x - Math.cos(a) * r * 0.45, h - r * 1.25, z - Math.sin(a) * r * 0.45), s: new THREE.Vector3(r * 0.66, r * 0.58, r * 0.66), r: a * 3, c })
      }
    }
    return [instanced(trunkGeo, plantMat(), trunks, shadow), instanced(blobGeo, plantMat(), blobs, shadow), instanced(coneGeo, plantMat(), cones, shadow)]
  }, [trees, shadow])
  useEffect(
    () => () => {
      for (const m of meshes) {
        ;(m.material as THREE.Material).dispose()
        m.dispose()
      }
    },
    [meshes],
  )
  return (
    <group>
      {meshes.map((m, k) => (
        <primitive key={k} object={m} />
      ))}
    </group>
  )
})

const ShrubsLayer = memo(function ShrubsLayer({ shrubs }: { shrubs: Shrub[] }) {
  const meshes = useMemo(() => {
    const blobs: Array<{ p: THREE.Vector3; s: THREE.Vector3; r?: number; c: string }> = []
    const petals: typeof blobs = []
    for (const s of shrubs) {
      const x = s.x * M
      const z = s.y * M
      const r = s.r * M
      const h = s.h * M
      const c = BUSH[Math.floor(s.v * 53) % BUSH.length]
      blobs.push({ p: new THREE.Vector3(x, h * 0.42 - 0.1, z), s: new THREE.Vector3(r, h * 0.55, r), r: s.v * 6, c })
      blobs.push({ p: new THREE.Vector3(x + r * 0.35, h * 0.35 - 0.1, z - r * 0.2), s: new THREE.Vector3(r * 0.7, h * 0.42, r * 0.7), r: s.v * 3, c: BUSH[(Math.floor(s.v * 53) + 2) % BUSH.length] })
      if (s.flower) {
        const rr = rng(Math.round(s.x * 3 + s.y))
        for (let k = 0; k < 9; k++) {
          const a = rr() * Math.PI * 2
          const up = 0.35 + rr() * 0.6
          petals.push({ p: new THREE.Vector3(x + Math.cos(a) * r * 0.85 * Math.cos(up), h * 0.42 - 0.1 + h * 0.55 * Math.sin(up), z + Math.sin(a) * r * 0.85 * Math.cos(up)), s: new THREE.Vector3(0.07, 0.07, 0.07), r: a, c: s.flower })
        }
      }
    }
    return [instanced(blobGeo, plantMat(), blobs, true), instanced(petalGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), petals, false)]
  }, [shrubs])
  useEffect(
    () => () => {
      for (const m of meshes) {
        ;(m.material as THREE.Material).dispose()
        m.dispose()
      }
    },
    [meshes],
  )
  return (
    <group>
      {meshes.map((m, k) => (
        <primitive key={k} object={m} />
      ))}
    </group>
  )
})

// ---------------------------------------------------------------------------
// Neighbours, lamps, mailbox, fences

function gableGeo(w: number, d: number, rise: number, over: number) {
  // Ridge along x. Two sloped planes plus the two end triangles (group 1).
  const x0 = -w / 2 - over
  const x1 = w / 2 + over
  const z0 = -d / 2 - over
  const z1 = d / 2 + over
  const y = 0
  const top = rise + (over * rise) / (d / 2)
  const pos = [
    x0, y - (over * rise) / (d / 2), z0, x1, y - (over * rise) / (d / 2), z0, x1, top, 0,
    x0, y - (over * rise) / (d / 2), z0, x1, top, 0, x0, top, 0,
    x1, y - (over * rise) / (d / 2), z1, x0, y - (over * rise) / (d / 2), z1, x0, top, 0,
    x1, y - (over * rise) / (d / 2), z1, x0, top, 0, x1, top, 0,
  ]
  const ends = [-w / 2, w / 2].flatMap((x) => [x, 0, -d / 2, x, 0, d / 2, x, rise, 0])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, ...ends], 3))
  g.addGroup(0, 12, 0)
  g.addGroup(12, 6, 1)
  g.computeVertexNormals()
  return g
}

const NeighbourHouse = memo(function NeighbourHouse({ n, night, focus }: { n: Neighbour; night: number; focus: THREE.Vector3 }) {
  const w = n.w * M
  const d = n.d * M
  const H = n.storeys * 2.8 + 0.25
  // Step out of the way when it stands between the camera and the design.
  const group = useRef<THREE.Group>(null)
  const box = useMemo(() => new THREE.Box3(new THREE.Vector3(n.x * M - w / 2 - 1, -1, n.y * M - d / 2 - 1), new THREE.Vector3(n.x * M + w / 2 + 1, H + 4, n.y * M + d / 2 + 1)), [n, w, d, H])
  const ray = useMemo(() => new THREE.Ray(), [])
  const hitPoint = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    ray.origin.copy(camera.position)
    ray.direction.copy(focus).sub(camera.position).normalize()
    const hit = box.containsPoint(camera.position) || (ray.intersectBox(box, hitPoint) !== null && hitPoint.distanceTo(camera.position) < focus.distanceTo(camera.position))
    g.visible = !hit
  })
  const roof = useMemo(() => gableGeo(w, d, Math.min(d * 0.28, 2.6), 0.45), [w, d])
  useEffect(() => () => roof.dispose(), [roof])
  const wallM = stdMat(n.wall, { rough: 0.9 })
  const roofM = stdMat(n.roof, { rough: 0.85, side: THREE.DoubleSide })
  const endM = stdMat(n.wall, { rough: 0.9, side: THREE.DoubleSide })
  const glassM = night > 0.2 ? stdMat('#ffcf8a', { rough: 0.3, emissive: 0.5 + night * 0.9 }) : stdMat('#2d3b46', { rough: 0.15, metal: 0.3 })
  const trimM = stdMat(n.trim, { rough: 0.8 })
  const doorM = stdMat('#4a3a30', { rough: 0.7 })
  const garageM = stdMat('#e6e3dc', { rough: 0.8 })
  const windows: Array<[number, number, number]> = []
  const garageW = w > 11 ? 4.9 : 0
  const doorX = -w * 0.12
  for (let s = 0; s < n.storeys; s++) {
    const cols = Math.max(2, Math.floor((w - 1.5) / 2.7))
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / cols
      if (s === 0 && (Math.abs(x - doorX) < 1.1 || (garageW && x > w / 2 - garageW - 0.8))) continue
      windows.push([x, s * 2.8 + 1.45, d / 2 + 0.03])
      windows.push([x, s * 2.8 + 1.45, -d / 2 - 0.03])
    }
  }
  return (
    <group ref={group} position={[n.x * M, -0.15, n.y * M]} rotation={[0, n.rotation === 180 ? Math.PI : 0, 0]}>
      <mesh geometry={unitBox} material={wallM} position={[0, H / 2, 0]} scale={[w, H, d]} castShadow receiveShadow />
      <mesh geometry={roof} material={[roofM, endM]} position={[0, H, 0]} castShadow />
      <mesh geometry={unitBox} material={trimM} position={[0, H + 0.02, 0]} scale={[w + 0.1, 0.12, d + 0.1]} />
      <mesh geometry={unitBox} material={doorM} position={[doorX, 1.05, d / 2 + 0.04]} scale={[1.0, 2.1, 0.08]} />
      {garageW > 0 && <mesh geometry={unitBox} material={garageM} position={[w / 2 - garageW / 2 - 0.5, 1.15, d / 2 + 0.04]} scale={[garageW, 2.3, 0.08]} />}
      {windows.map(([x, y, z], k) => (
        <group key={k} position={[x, y, z]}>
          <mesh geometry={unitBox} material={trimM} scale={[1.34, 1.44, 0.06]} />
          <mesh geometry={unitBox} material={glassM} scale={[1.18, 1.28, 0.08]} />
        </group>
      ))}
    </group>
  )
})

const Lamps = memo(function Lamps({ lamps, night, near }: { lamps: Array<{ x: number; y: number }>; night: number; near: THREE.Vector3 }) {
  const pole = stdMat('#2d3034', { rough: 0.5, metal: 0.6 })
  const head = night > 0.1 ? stdMat('#ffe2b0', { emissive: 1.5 + night * 2 }) : stdMat('#dcdcd6', { rough: 0.4 })
  const closest = [...lamps].sort((a, b) => Math.hypot(a.x * M - near.x, a.y * M - near.z) - Math.hypot(b.x * M - near.x, b.y * M - near.z)).slice(0, 2)
  return (
    <group>
      {lamps.map((l, k) => (
        <group key={k} position={[l.x * M, -0.15, l.y * M]}>
          <mesh geometry={unitBox} material={pole} position={[0, 2.3, 0]} scale={[0.12, 4.6, 0.12]} castShadow={false} />
          <mesh geometry={unitBox} material={head} position={[0, 4.55, 0]} scale={[0.5, 0.16, 0.5]} />
        </group>
      ))}
      {closest.map((l, k) => (
        <pointLight key={k} position={[l.x * M, 4.2, l.y * M]} intensity={night * 22} distance={20} decay={1.7} color="#ffd49a" />
      ))}
    </group>
  )
})

/** A parked car, built from the same parts as the furniture catalog's car. */
const ParkedCar = memo(function ParkedCar({ car }: { car: { x: number; y: number; rotation: number; color: string } }) {
  const parts = useMemo(() => buildParts('car', 1.85, 4.7, 1.45, car.color, '#1e2328'), [car.color])
  return (
    <group position={[car.x * M, -0.12, car.y * M]} rotation={[0, (-car.rotation * Math.PI) / 180, 0]}>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.g === 'box' ? unitBox : p.g === 'cyl' ? unitCyl : p.g === 'sph' ? unitSph : unitCone}
          material={stdMat(p.c, { rough: p.rough, metal: p.metal, opacity: p.o, emissive: p.e })}
          position={p.p}
          scale={p.s}
          rotation={p.r ?? [0, 0, 0]}
        />
      ))}
    </group>
  )
})

function Mailbox({ at }: { at: { x: number; y: number } }) {
  const post = stdMat('#4b3a2c', { rough: 0.9 })
  const box = stdMat('#2a2d31', { rough: 0.4, metal: 0.4 })
  return (
    <group position={[at.x * M, -0.15, at.y * M]}>
      <mesh geometry={unitBox} material={post} position={[0, 0.55, 0]} scale={[0.1, 1.1, 0.1]} castShadow />
      <mesh geometry={unitBox} material={box} position={[0, 1.18, 0]} scale={[0.24, 0.24, 0.5]} castShadow />
    </group>
  )
}

function Fences({ fences }: { fences: Array<[{ x: number; y: number }, { x: number; y: number }]> }) {
  const wood = stdMat('#8a7058', { rough: 0.95 })
  const items = useMemo(() => {
    const posts: Array<{ p: THREE.Vector3; s: THREE.Vector3; c: string }> = []
    for (const [a, b] of fences) {
      const L = Math.hypot(b.x - a.x, b.y - a.y) * M
      const n = Math.max(1, Math.round(L / 2.4))
      for (let i = 0; i <= n; i++) posts.push({ p: new THREE.Vector3((a.x + ((b.x - a.x) * i) / n) * M, 0.4, (a.y + ((b.y - a.y) * i) / n) * M), s: new THREE.Vector3(0.12, 1.1, 0.12), c: '#8a7058' })
    }
    return instanced(unitBox, new THREE.MeshStandardMaterial({ roughness: 0.95 }), posts, true)
  }, [fences])
  useEffect(() => () => items.dispose(), [items])
  return (
    <group>
      <primitive object={items} />
      {fences.flatMap(([a, b], k) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y) * M
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        return [0.45, 0.8].map((y) => <mesh key={`${k}-${y}`} geometry={unitBox} material={wood} position={[((a.x + b.x) / 2) * M, y, ((a.y + b.y) / 2) * M]} rotation={[0, -ang, 0]} scale={[L, 0.09, 0.05]} castShadow />)
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------

export const Surroundings = memo(function Surroundings({ L, groundColor, night, lowQuality }: { L: Landscape; groundColor: string; night: number; lowQuality: boolean }) {
  const shadowTrees = useMemo(() => L.trees.filter((t) => t.shadow), [L])
  const otherTrees = useMemo(() => [...L.trees.filter((t) => !t.shadow), ...(lowQuality ? L.farTrees.filter((_, i) => i % 3 === 0) : L.farTrees)], [L, lowQuality])
  const near = useMemo(() => new THREE.Vector3((L.lot.x + L.lot.w / 2) * M, 0, L.front * M), [L])
  const focus = useMemo(() => new THREE.Vector3((L.lot.x + L.lot.w / 2) * M, 3, (L.lot.y + L.lot.d / 2) * M), [L])
  return (
    <group>
      <Terrain L={L} color={groundColor} />
      <Paving L={L} />
      <TreesLayer trees={shadowTrees} shadow />
      <TreesLayer trees={otherTrees} shadow={false} />
      <ShrubsLayer shrubs={L.shrubs} />
      {L.neighbours.map((n, k) => (
        <NeighbourHouse key={k} n={n} night={night} focus={focus} />
      ))}
      {L.lamps.length > 0 && <Lamps lamps={L.lamps} night={night} near={near} />}
      {L.mailbox && <Mailbox at={L.mailbox} />}
      {L.cars.map((c, k) => (
        <ParkedCar key={k} car={c} />
      ))}
      {L.fences.length > 0 && <Fences fences={L.fences} />}
      {night > 0.3 && <Stars radius={700} depth={120} count={lowQuality ? 1200 : 3000} factor={9} saturation={0} fade speed={0.3} />}
    </group>
  )
})
