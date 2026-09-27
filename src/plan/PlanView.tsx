import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Item, Level, Opening, Vec2 } from '../model/types'
import { activeLevel, selectedItemIds, useStore } from '../store/store'
import { add, angleDeg, closestOnSegment, dist, norm, normalOf, pointInPolygon, rotate, scale, sideOf, snapToGrid, sub } from '../model/geometry'
import {
  addRoom,
  addWalls,
  clampOpening,
  findWallAt,
  levelBounds,
  moveRoom,
  moveRoomEdge,
  moveVertex,
  moveWall,
  paintRoomWalls,
  rectPoints,
  snapItemToWall,
  updateWall,
  wallLength,
} from '../model/ops'
import { makeItem, makeLabel, makeOpening } from '../model/factory'
import { catalogEntry } from '../model/catalog'
import { formatLength, gridStep, parseLength, CM_PER_FT } from '../model/units'
import { snapPoint, type SnapResult } from './snap'
import { useUnderlay } from '../store/underlay'
import { DimLine, ItemGlyph, ItemsLayer, LabelsLayer, OpeningSymbol, OpeningsLayer, RoomLabelsLayer, RoomsLayer, SelectionHandles, WallDims, WallsLayer, rotateVec } from './PlanLayers'
import { polyPath } from './wallGeometry'

interface Camera {
  x0: number
  y0: number
  scale: number // screen px per cm
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; moved: boolean; click?: () => void }
  | { kind: 'item'; id: string; start: Vec2; orig: Item; moved: boolean }
  | { kind: 'group'; start: Vec2; origs: Item[]; moved: boolean }
  | { kind: 'marquee'; start: Vec2 }
  | { kind: 'underlay'; start: Vec2; orig: Vec2 }
  | { kind: 'item-rot'; id: string; orig: Item }
  | { kind: 'item-size'; id: string; axis: 'w' | 'd'; sign: number; orig: Item }
  | { kind: 'wall'; id: string; start: Vec2; moved: boolean }
  | { kind: 'vertex'; from: Vec2; moved: boolean }
  | { kind: 'room'; id: string; start: Vec2; moved: boolean }
  | { kind: 'room-edge'; id: string; edge: number; start: Vec2 }
  | { kind: 'opening'; id: string; moved: boolean }
  | { kind: 'op-width'; id: string; sign: number; orig: Opening }
  | { kind: 'label'; id: string; start: Vec2; orig: Vec2 }
  | { kind: 'rect'; start: Vec2; moved: boolean }
  | { kind: 'measure'; start: Vec2 }

type Draft = { kind: 'chain'; points: Vec2[] } | { kind: 'poly'; points: Vec2[] } | { kind: 'rect'; start: Vec2 } | null

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

export function PlanView({ minimap = false }: { minimap?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const size = useSize(wrapRef)
  const [cam, setCam] = useState<Camera>({ x0: -200, y0: -200, scale: 0.6 })
  const camRef = useRef(cam)
  camRef.current = cam

  const project = useStore((s) => s.project)
  const levelId = useStore((s) => s.levelId)
  const level = activeLevel({ project, levelId })
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const placeType = useStore((s) => s.placeType)
  const showDims = useStore((s) => s.showDims)
  const showGrid = useStore((s) => s.showGrid)
  const snapOn = useStore((s) => s.snap)
  const showOther = useStore((s) => s.showOtherLevels)
  const zoomRequest = useStore((s) => s.zoomRequest)
  const walker = useStore((s) => s.walker)
  const units = project.units

  const [hover, setHover] = useState<SnapResult | null>(null)
  const [rawHover, setRawHover] = useState<Vec2 | null>(null)
  const [draft, setDraft] = useState<Draft>(null)
  const [measure, setMeasure] = useState<{ a: Vec2; b: Vec2 } | null>(null)
  const [marquee, setMarquee] = useState<{ a: Vec2; b: Vec2 } | null>(null)
  const marqueeRef = useRef<{ a: Vec2; b: Vec2 } | null>(null)
  marqueeRef.current = marquee
  const multi = useStore((s) => s.multi)
  const underlay = useUnderlay((s) => s.byLevel[levelId])
  const underlayMode = useUnderlay((s) => s.mode)
  const calib = useUnderlay((s) => s.calib)
  useEffect(() => {
    useUnderlay.getState().load(levelId)
  }, [levelId])
  const [lengthInput, setLengthInput] = useState<string | null>(null)
  const [altKey, setAltKey] = useState(false)
  const drag = useRef<Drag | null>(null)
  const applyTypedRef = useRef<(t: string) => void>(() => {})
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; cam: Camera; mid: { x: number; y: number } } | null>(null)

  const px = 1 / cam.scale
  const grid = gridStep(units)

  // ---- camera helpers -------------------------------------------------------
  const toPlan = useCallback((clientX: number, clientY: number): Vec2 => {
    const rect = svgRef.current!.getBoundingClientRect()
    const c = camRef.current
    return { x: c.x0 + (clientX - rect.left) / c.scale, y: c.y0 + (clientY - rect.top) / c.scale }
  }, [])

  const fit = useCallback(() => {
    const s = useStore.getState()
    const l = activeLevel(s)
    const all = s.project.levels.map(levelBounds).filter(Boolean) as NonNullable<ReturnType<typeof levelBounds>>[]
    const u = useUnderlay.getState().byLevel[l.id]
    const ub = u?.visible ? { minX: u.x, minY: u.y, maxX: u.x + u.width, maxY: u.y + u.width * u.aspect } : null
    const b = levelBounds(l) ?? ub ?? (all.length ? all[0] : null)
    const el = wrapRef.current
    if (!el) return
    const w = el.clientWidth || 800
    const h = el.clientHeight || 600
    if (!b) {
      const sc = Math.min(w, h) / (CM_PER_FT * 40)
      setCam({ x0: -w / 2 / sc + CM_PER_FT * 15, y0: -h / 2 / sc + CM_PER_FT * 12, scale: sc })
      return
    }
    const pad = Math.max(120, (b.maxX - b.minX) * 0.08)
    const bw = b.maxX - b.minX + pad * 2
    const bh = b.maxY - b.minY + pad * 2
    const sc = Math.min(w / bw, h / bh, 3)
    setCam({ x0: (b.minX + b.maxX) / 2 - w / 2 / sc, y0: (b.minY + b.maxY) / 2 - h / 2 / sc, scale: sc })
  }, [])

  useEffect(() => {
    fit()
  }, [zoomRequest, fit])
  // Keep the drawing fitted while the layout settles, until the user moves the view.
  const userMoved = useRef(false)
  useEffect(() => {
    if (!userMoved.current && size.w > 50) fit()
  }, [size.w, size.h, fit])
  useEffect(() => {
    userMoved.current = false
  }, [zoomRequest])

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    userMoved.current = true
    const rect = svgRef.current!.getBoundingClientRect()
    setCam((c) => {
      const scaleN = Math.min(8, Math.max(0.03, c.scale * factor))
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const px0 = c.x0 + mx / c.scale
      const py0 = c.y0 + my / c.scale
      return { x0: px0 - mx / scaleN, y0: py0 - my / scaleN, scale: scaleN }
    })
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || Math.abs(e.deltaY) > 0 || !e.shiftKey) {
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))
        zoomAt(e.clientX, e.clientY, f)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Expose zoom controls to the toolbar.
  useEffect(() => {
    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail as string
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      if (kind === 'in') zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25)
      if (kind === 'out') zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.8)
      if (kind === 'fit') fit()
    }
    window.addEventListener('plan-zoom', handler)
    return () => window.removeEventListener('plan-zoom', handler)
  }, [zoomAt, fit])

  // ---- snapping --------------------------------------------------------------
  const snap = useCallback(
    (raw: Vec2, from?: Vec2, ignore?: Vec2[]) =>
      snapPoint(raw, { level: activeLevel(useStore.getState()), enabled: useStore.getState().snap, grid, pxToCm: 1 / camRef.current.scale, from, ignore }),
    [grid],
  )

  // ---- tool state resets ---------------------------------------------------
  useEffect(() => {
    setDraft(null)
    setMeasure(null)
    setLengthInput(null)
    useStore.getState().cancel()
  }, [tool, levelId])

  const finishChain = useCallback(() => {
    const s = useStore.getState()
    if (draft?.kind === 'chain' && draft.points.length >= 2) s.commit()
    else s.cancel()
    setDraft(null)
    setLengthInput(null)
  }, [draft])

  const finishPoly = useCallback(() => {
    const s = useStore.getState()
    if (draft?.kind === 'poly' && draft.points.length >= 3) {
      s.applyLevel((l) => {
        const { level: next, room } = addRoom(l, draft.points, {}, { thickness: s.project.defaults.wallThickness, height: activeLevel(s).height })
        queueMicrotask(() => useStore.getState().select({ kind: 'room', id: room.id }))
        return next
      })
      s.notify('Room added')
    }
    setDraft(null)
  }, [draft])

  // Preview walls of the chain being drawn.
  const previewChain = useCallback((points: Vec2[]) => {
    const s = useStore.getState()
    const lvl = activeLevel(s)
    const segs: Array<[Vec2, Vec2]> = []
    for (let i = 0; i + 1 < points.length; i++) segs.push([points[i], points[i + 1]])
    s.previewLevel((base) => addWalls(base, segs, { thickness: s.project.defaults.wallThickness, height: lvl.height }).level)
  }, [])

  // ---- keyboard --------------------------------------------------------------
  useEffect(() => {
    if (minimap) return
    const onKey = (e: KeyboardEvent) => {
      setAltKey(e.altKey)
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.type !== 'keydown') return
      const s = useStore.getState()
      if (e.key === 'Escape') {
        if (draft?.kind === 'chain') return finishChain()
        if (draft?.kind === 'poly') return finishPoly()
        setDraft(null)
        setMeasure(null)
        if (s.tool !== 'select') s.setTool('select')
        else s.select(null)
        return
      }
      if (e.key === 'Enter') {
        if (lengthInput !== null) return applyTypedRef.current(lengthInput)
        if (draft?.kind === 'chain') finishChain()
        if (draft?.kind === 'poly') finishPoly()
        return
      }
      // Type a length while drawing walls. Keys that arrive before the box has focus are appended.
      if (draft?.kind === 'chain' && /^[0-9.'"\- ]$/.test(e.key) && (lengthInput !== null || /^[0-9.]$/.test(e.key))) {
        setLengthInput((prev) => (prev ?? '') + e.key)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [draft, finishChain, finishPoly, lengthInput, minimap])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    applyTypedRef.current = applyTypedLength
  })
  const applyTypedLength = (text: string) => {
    if (draft?.kind !== 'chain' || !hover) return setLengthInput(null)
    const L = parseLength(text, units, units === 'metric' ? 'cm' : 'ft')
    if (!L || L <= 0) return setLengthInput(null)
    const last = draft.points[draft.points.length - 1]
    const dir = norm(sub(hover.p, last))
    if (dir.x === 0 && dir.y === 0) return setLengthInput(null)
    const next = add(last, scale(dir, L))
    const pts = [...draft.points, next]
    setDraft({ kind: 'chain', points: pts })
    previewChain(pts)
    setLengthInput(null)
  }

  // ---- hit testing ---------------------------------------------------------------
  const hitOf = (e: React.PointerEvent): string | null => {
    const el = (e.target as Element).closest('[data-hit]')
    return el ? el.getAttribute('data-hit') : null
  }

  // ---- pointer handlers ----------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      // Right click finishes drawing.
      if (draft?.kind === 'chain') finishChain()
      if (draft?.kind === 'poly') finishPoly()
      return
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    svgRef.current?.setPointerCapture(e.pointerId)
    if (pointers.current.size === 2) {
      // Start pinch; abandon any drag.
      useStore.getState().cancel()
      drag.current = null
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cam: camRef.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
      return
    }
    const s = useStore.getState()
    const p = toPlan(e.clientX, e.clientY)
    if (minimap) {
      useStore.setState({ walker: { x: p.x, y: p.y, yaw: s.walker?.yaw ?? 0 } })
      return
    }
    const hit = hitOf(e)
    const panDrag = (click?: () => void): Drag => ({ kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camRef.current, moved: false, click })

    if (e.button === 1 || s.tool === 'pan') {
      drag.current = panDrag()
      return
    }
    const ul = useUnderlay.getState()
    if (ul.mode === 'move' && ul.byLevel[s.levelId]) {
      const u = ul.byLevel[s.levelId]
      drag.current = { kind: 'underlay', start: p, orig: { x: u.x, y: u.y } }
      return
    }
    if (ul.mode === 'calibrate') {
      ul.addCalib(p)
      return
    }

    switch (s.tool) {
      case 'select': {
        if (hit?.startsWith('h:')) {
          const [, what, id, extra] = hit.split(':')
          s.begin()
          if (what === 'wall-a' || what === 'wall-b') {
            const w = level.walls.find((x) => x.id === id)
            if (w) drag.current = { kind: 'vertex', from: what === 'wall-a' ? w.a : w.b, moved: false }
          } else if (what === 'room-v') {
            const r = level.rooms.find((x) => x.id === id)
            if (r) drag.current = { kind: 'vertex', from: r.points[Number(extra)], moved: false }
          } else if (what === 'room-e') {
            drag.current = { kind: 'room-edge', id, edge: Number(extra), start: p }
          } else if (what === 'item-rot') {
            const it = level.items.find((x) => x.id === id)
            if (it) drag.current = { kind: 'item-rot', id, orig: it }
          } else if (what === 'item-w' || what === 'item-d') {
            const it = level.items.find((x) => x.id === id)
            if (it) drag.current = { kind: 'item-size', id, axis: what === 'item-w' ? 'w' : 'd', sign: Number(extra), orig: it }
          } else if (what === 'op-w') {
            const o = level.openings.find((x) => x.id === id)
            if (o) drag.current = { kind: 'op-width', id, sign: Number(extra), orig: o }
          }
          return
        }
        if (e.shiftKey && !hit?.startsWith('item:')) {
          drag.current = { kind: 'marquee', start: p }
          setMarquee({ a: p, b: p })
          return
        }
        if (hit) {
          const [kind, id] = hit.split(':') as [string, string]
          if (kind === 'item' && e.shiftKey) {
            // Shift-click toggles furniture in the multi-selection.
            const current = selectedItemIds(s)
            const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
            if (next.length === 0) s.select(null)
            else if (next.length === 1) s.select({ kind: 'item', id: next[0] })
            else useStore.setState({ selection: { kind: 'item', id: next[next.length - 1] }, multi: next, panel: 'inspector' })
            return
          }
          if (kind === 'item' && s.multi.length > 1 && s.multi.includes(id)) {
            s.begin()
            drag.current = { kind: 'group', start: p, origs: level.items.filter((i) => s.multi.includes(i.id) && !i.locked), moved: false }
            return
          }
          if (kind === 'item') {
            const it = level.items.find((x) => x.id === id)!
            s.select({ kind: 'item', id })
            if (it.locked) {
              drag.current = panDrag()
              return
            }
            s.begin()
            drag.current = { kind: 'item', id, start: p, orig: it, moved: false }
            return
          }
          if (kind === 'opening') {
            s.select({ kind: 'opening', id })
            s.begin()
            drag.current = { kind: 'opening', id, moved: false }
            return
          }
          if (kind === 'wall') {
            s.select({ kind: 'wall', id })
            s.begin()
            drag.current = { kind: 'wall', id, start: p, moved: false }
            return
          }
          if (kind === 'label') {
            const l = level.labels.find((x) => x.id === id)!
            s.select({ kind: 'label', id })
            s.begin()
            drag.current = { kind: 'label', id, start: p, orig: { x: l.x, y: l.y } }
            return
          }
          if (kind === 'room') {
            if (s.selection?.kind === 'room' && s.selection.id === id) {
              s.begin()
              drag.current = { kind: 'room', id, start: p, moved: false }
            } else {
              drag.current = panDrag(() => s.select({ kind: 'room', id }))
            }
            return
          }
        }
        drag.current = panDrag(() => s.select(null))
        return
      }
      case 'wall': {
        const from = draft?.kind === 'chain' ? draft.points[draft.points.length - 1] : undefined
        const sp = snap(p, from, undefined).p
        if (draft?.kind === 'chain') {
          if (dist(sp, from!) < 1) return finishChain()
          const pts = [...draft.points, sp]
          // Closing the loop on the first point finishes the chain.
          if (dist(sp, draft.points[0]) < 1 && pts.length > 2) {
            previewChain(pts)
            useStore.getState().commit()
            setDraft(null)
            return
          }
          setDraft({ kind: 'chain', points: pts })
          previewChain(pts)
        } else {
          s.begin()
          setDraft({ kind: 'chain', points: [sp] })
        }
        return
      }
      case 'room': {
        const sp = snap(p).p
        if (draft?.kind === 'rect') {
          createRectRoom(draft.start, sp)
          setDraft(null)
        } else {
          setDraft({ kind: 'rect', start: sp })
          drag.current = { kind: 'rect', start: sp, moved: false }
        }
        return
      }
      case 'polyroom': {
        const sp = snap(p).p
        if (draft?.kind === 'poly') {
          if (dist(sp, draft.points[0]) < 12 / camRef.current.scale && draft.points.length >= 3) return finishPoly()
          if (dist(sp, draft.points[draft.points.length - 1]) < 1) return finishPoly()
          setDraft({ kind: 'poly', points: [...draft.points, sp] })
        } else setDraft({ kind: 'poly', points: [sp] })
        return
      }
      case 'door':
      case 'window': {
        const prev = openingPreview(p)
        if (prev) {
          s.applyLevel((l) => ({ ...l, openings: [...l.openings, prev.o] }))
          s.select({ kind: 'opening', id: prev.o.id })
          s.notify(`${prev.o.kind === 'window' ? 'Window' : 'Door'} added`)
        } else {
          drag.current = panDrag()
        }
        return
      }
      case 'item': {
        if (!placeType) {
          drag.current = panDrag()
          return
        }
        const ghost = itemGhost(p, e.altKey)
        if (ghost) {
          s.applyLevel((l) => ({ ...l, items: [...l.items, ghost] }))
          s.select({ kind: 'item', id: ghost.id })
          if (!e.shiftKey) useStore.setState({ tool: 'select', placeType: null })
          s.notify(`${catalogEntry(ghost.type).name} added`)
        }
        return
      }
      case 'paint': {
        doPaint(p, hit)
        return
      }
      case 'measure': {
        const sp = snap(p).p
        setMeasure({ a: sp, b: sp })
        drag.current = { kind: 'measure', start: sp }
        return
      }
      case 'label': {
        const lab = makeLabel('Label', snapToGrid(p, grid))
        s.applyLevel((l) => ({ ...l, labels: [...l.labels, lab] }))
        useStore.setState({ tool: 'select' })
        s.select({ kind: 'label', id: lab.id })
        return
      }
    }
  }

  const createRectRoom = (a: Vec2, b: Vec2) => {
    if (Math.abs(a.x - b.x) < 30 || Math.abs(a.y - b.y) < 30) return
    const s = useStore.getState()
    let roomId = ''
    s.applyLevel((l) => {
      const { level: next, room } = addRoom(l, rectPoints(a, b), {}, { thickness: s.project.defaults.wallThickness, height: l.height })
      roomId = room.id
      return next
    })
    s.select({ kind: 'room', id: roomId })
    s.notify('Room added. Drag its edges to resize.')
  }

  const openingPreview = (p: Vec2): { o: Opening; wall: ReturnType<typeof findWallAt> } | null => {
    const wall = findWallAt(level, p, 10 / camRef.current.scale)
    if (!wall) return null
    const { t } = closestOnSegment(p, wall.a, wall.b)
    const kind = useStore.getState().tool === 'window' ? 'window' : useStore.getState().openingKind === 'window' ? 'door' : useStore.getState().openingKind
    let offset = t * wallLength(wall)
    if (useStore.getState().snap) offset = Math.round(offset / (grid / 2)) * (grid / 2)
    const side = sideOf(p, wall.a, wall.b) >= 0 ? 'A' : 'B'
    const o = clampOpening(makeOpening(wall.id, kind, offset, { swing: side }), wall)
    if (o.width > wallLength(wall)) return null
    return { o, wall }
  }

  const itemGhost = (p: Vec2, noSnap: boolean): Item | null => {
    if (!placeType) return null
    const c = catalogEntry(placeType)
    const lvl = level
    const base = makeItem(placeType, snapOn ? snapToGrid(p, grid / 2) : p, {
      height: c.fitHeight ? lvl.height + 25 : c.h,
      elevation: c.mount === 'ceiling' ? Math.max(0, lvl.height - c.h) : c.elevation ?? 0,
    })
    if (!noSnap && c.category !== 'Outdoor' && c.shape !== 'rug') {
      const sn = snapItemToWall(lvl, base, p, 30)
      if (sn) return { ...base, ...sn }
    }
    return base
  }

  const doPaint = (p: Vec2, hit: string | null) => {
    const s = useStore.getState()
    const { target, color, floor, finish } = s.paint
    if (hit?.startsWith('wall:')) {
      const id = hit.split(':')[1]
      const w = level.walls.find((x) => x.id === id)
      if (!w) return
      const side = sideOf(p, w.a, w.b) >= 0 ? 'A' : 'B'
      s.applyLevel((l) => updateWall(l, id, side === 'A' ? { colorA: color, finishA: finish } : { colorB: color, finishB: finish }))
      s.notify('Wall side painted')
      return
    }
    const room = [...level.rooms].reverse().find((r) => pointInPolygon(p, r.points))
    if (!room) return
    if (target === 'floor') {
      s.applyLevel((l) => ({ ...l, rooms: l.rooms.map((r) => (r.id === room.id ? { ...r, floor, floorColor: undefined } : r)) }))
      s.notify(`Floor changed in ${room.name}`)
    } else {
      s.applyLevel((l) => paintRoomWalls(l, room.id, color, finish))
      s.notify(`Walls painted in ${room.name}`)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const pc = pinch.current
      const rect = svgRef.current!.getBoundingClientRect()
      const scaleN = Math.min(8, Math.max(0.03, (pc.cam.scale * d) / pc.d))
      const planMid = { x: pc.cam.x0 + (pc.mid.x - rect.left) / pc.cam.scale, y: pc.cam.y0 + (pc.mid.y - rect.top) / pc.cam.scale }
      userMoved.current = true
      setCam({ x0: planMid.x - (mid.x - rect.left) / scaleN, y0: planMid.y - (mid.y - rect.top) / scaleN, scale: scaleN })
      return
    }

    if (minimap) return
    const p = toPlan(e.clientX, e.clientY)
    setRawHover(p)
    setAltKey(e.altKey)
    const s = useStore.getState()
    const dr = drag.current

    if (!dr) {
      // Hover feedback for drawing tools.
      if (s.tool === 'wall' || s.tool === 'room' || s.tool === 'polyroom' || s.tool === 'measure') {
        const from = draft?.kind === 'chain' ? draft.points[draft.points.length - 1] : undefined
        setHover(snap(p, from))
      } else setHover(null)
      return
    }

    const scaleNow = camRef.current.scale
    switch (dr.kind) {
      case 'pan': {
        const dx = e.clientX - dr.sx
        const dy = e.clientY - dr.sy
        if (!dr.moved && Math.hypot(dx, dy) < 4) return
        dr.moved = true
        userMoved.current = true
        setCam({ ...dr.cam, x0: dr.cam.x0 - dx / dr.cam.scale, y0: dr.cam.y0 - dy / dr.cam.scale })
        return
      }
      case 'item': {
        const delta = sub(p, dr.start)
        if (!dr.moved && Math.hypot(delta.x, delta.y) * scaleNow < 3) return
        dr.moved = true
        let pos = add({ x: dr.orig.x, y: dr.orig.y }, delta)
        let rot = dr.orig.rotation
        if (s.snap) pos = snapToGrid(pos, grid / 2)
        const c = catalogEntry(dr.orig.type)
        if (!e.altKey && c.category !== 'Outdoor' && c.shape !== 'rug' && s.snap) {
          const sn = snapItemToWall(activeLevel({ project: s.txBase ?? s.project, levelId: s.levelId }), dr.orig, add({ x: dr.orig.x, y: dr.orig.y }, delta), 18 / scaleNow + 4)
          if (sn) {
            pos = { x: sn.x, y: sn.y }
            rot = sn.rotation
          }
        }
        s.previewLevel((base) => ({ ...base, items: base.items.map((i) => (i.id === dr.id ? { ...i, x: pos.x, y: pos.y, rotation: rot } : i)) }))
        return
      }
      case 'group': {
        let delta = sub(p, dr.start)
        if (!dr.moved && Math.hypot(delta.x, delta.y) * scaleNow < 3) return
        dr.moved = true
        if (s.snap) delta = snapToGrid(delta, grid / 2)
        const byId = new Map(dr.origs.map((i) => [i.id, i]))
        s.previewLevel((base) => ({ ...base, items: base.items.map((i) => (byId.has(i.id) ? { ...i, x: byId.get(i.id)!.x + delta.x, y: byId.get(i.id)!.y + delta.y } : i)) }))
        return
      }
      case 'marquee': {
        setMarquee({ a: dr.start, b: p })
        return
      }
      case 'underlay': {
        useUnderlay.getState().patch(s.levelId, { x: dr.orig.x + p.x - dr.start.x, y: dr.orig.y + p.y - dr.start.y })
        return
      }
      case 'item-rot': {
        let ang = angleDeg(dr.orig, p) + 90
        if (!e.altKey) ang = Math.round(ang / 15) * 15
        ang = ((ang % 360) + 360) % 360
        s.previewLevel((base) => ({ ...base, items: base.items.map((i) => (i.id === dr.id ? { ...i, rotation: ang } : i)) }))
        return
      }
      case 'item-size': {
        const o = dr.orig
        const local = rotateVec(sub(p, o), -o.rotation)
        const half = dr.axis === 'w' ? o.width / 2 : o.depth / 2
        const along = dr.axis === 'w' ? local.x : local.y
        // Opposite edge stays put.
        let newSize = Math.max(5, along * dr.sign + half)
        if (s.snap) newSize = Math.max(grid / 2, Math.round(newSize / (grid / 2)) * (grid / 2))
        const shift = ((newSize - half * 2) / 2) * dr.sign
        const centerShift = rotateVec(dr.axis === 'w' ? { x: shift, y: 0 } : { x: 0, y: shift }, o.rotation)
        s.previewLevel((base) => ({
          ...base,
          items: base.items.map((i) =>
            i.id === dr.id ? { ...i, x: o.x + centerShift.x, y: o.y + centerShift.y, ...(dr.axis === 'w' ? { width: newSize } : { depth: newSize }) } : i,
          ),
        }))
        return
      }
      case 'wall': {
        const base = activeLevel({ project: s.txBase ?? s.project, levelId: s.levelId })
        const w = base.walls.find((x) => x.id === dr.id)
        if (!w) return
        let delta = sub(p, dr.start)
        if (!dr.moved && Math.hypot(delta.x, delta.y) * scaleNow < 3) return
        dr.moved = true
        if (!e.altKey) {
          // Move perpendicular to the wall only.
          const n = normalOf(w.a, w.b)
          let k = delta.x * n.x + delta.y * n.y
          if (s.snap) k = Math.round(k / grid) * grid
          delta = scale(n, k)
        } else if (s.snap) delta = snapToGrid(delta, grid)
        s.previewLevel((b) => moveWall(b, dr.id, delta))
        return
      }
      case 'vertex': {
        const sp = snap(p, undefined, [dr.from])
        setHover(sp)
        dr.moved = true
        s.previewLevel((b) => moveVertex(b, dr.from, sp.p))
        return
      }
      case 'room': {
        let delta = sub(p, dr.start)
        if (!dr.moved && Math.hypot(delta.x, delta.y) * scaleNow < 3) return
        dr.moved = true
        if (s.snap) delta = snapToGrid(delta, grid)
        s.previewLevel((b) => moveRoom(b, dr.id, delta))
        return
      }
      case 'room-edge': {
        const base = activeLevel({ project: s.txBase ?? s.project, levelId: s.levelId })
        const r = base.rooms.find((x) => x.id === dr.id)
        if (!r) return
        const a = r.points[dr.edge]
        const b = r.points[(dr.edge + 1) % r.points.length]
        const n = normalOf(a, b)
        const outward = scale(n, -1)
        let k = (p.x - dr.start.x) * outward.x + (p.y - dr.start.y) * outward.y
        if (s.snap) k = Math.round(k / grid) * grid
        s.previewLevel((bl) => moveRoomEdge(bl, dr.id, dr.edge, k))
        return
      }
      case 'opening': {
        dr.moved = true
        const base = activeLevel({ project: s.txBase ?? s.project, levelId: s.levelId })
        const o = base.openings.find((x) => x.id === dr.id)
        if (!o) return
        const wall = findWallAt(base, p, 30 / scaleNow) ?? base.walls.find((w) => w.id === o.wallId)
        if (!wall) return
        const { t } = closestOnSegment(p, wall.a, wall.b)
        let offset = t * wallLength(wall)
        if (s.snap) offset = Math.round(offset / (grid / 2)) * (grid / 2)
        s.previewLevel((b) => ({ ...b, openings: b.openings.map((x) => (x.id === dr.id ? clampOpening({ ...x, wallId: wall.id, offset }, wall) : x)) }))
        return
      }
      case 'op-width': {
        const base = activeLevel({ project: s.txBase ?? s.project, levelId: s.levelId })
        const o = dr.orig
        const wall = base.walls.find((w) => w.id === o.wallId)
        if (!wall) return
        const { t } = closestOnSegment(p, wall.a, wall.b)
        const at = t * wallLength(wall)
        const fixed = o.offset - (dr.sign * o.width) / 2
        let width = Math.abs(at - fixed)
        if (s.snap) width = Math.round(width / (grid / 2)) * (grid / 2)
        width = Math.max(30, width)
        const offset = fixed + (dr.sign * width) / 2
        s.previewLevel((b) => ({ ...b, openings: b.openings.map((x) => (x.id === dr.id ? clampOpening({ ...x, width, offset }, wall) : x)) }))
        return
      }
      case 'label': {
        const delta = sub(p, dr.start)
        const pos = s.snap ? snapToGrid(add(dr.orig, delta), grid / 2) : add(dr.orig, delta)
        s.previewLevel((b) => ({ ...b, labels: b.labels.map((l) => (l.id === dr.id ? { ...l, x: pos.x, y: pos.y } : l)) }))
        return
      }
      case 'rect': {
        const sp = snap(p)
        setHover(sp)
        if (dist(sp.p, dr.start) * scaleNow > 8) dr.moved = true
        return
      }
      case 'measure': {
        const sp = snap(p)
        setHover(sp)
        setMeasure({ a: dr.start, b: sp.p })
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null
      return
    }
    const dr = drag.current
    drag.current = null
    if (!dr) return
    const s = useStore.getState()
    switch (dr.kind) {
      case 'pan':
        if (!dr.moved) dr.click?.()
        return
      case 'rect':
        if (dr.moved && hover) {
          createRectRoom(dr.start, hover.p)
          setDraft(null)
        }
        return
      case 'measure':
        return
      case 'marquee': {
        const m = marqueeRef.current
        setMarquee(null)
        if (!m) return
        const x0 = Math.min(m.a.x, m.b.x)
        const x1 = Math.max(m.a.x, m.b.x)
        const y0 = Math.min(m.a.y, m.b.y)
        const y1 = Math.max(m.a.y, m.b.y)
        const ids = level.items.filter((i) => i.x >= x0 && i.x <= x1 && i.y >= y0 && i.y <= y1).map((i) => i.id)
        const merged = [...new Set([...selectedItemIds(s), ...ids])]
        if (merged.length === 1) s.select({ kind: 'item', id: merged[0] })
        else if (merged.length > 1) useStore.setState({ selection: { kind: 'item', id: merged[merged.length - 1] }, multi: merged, panel: 'inspector' })
        return
      }
      case 'vertex':
        setHover(null)
        s.commit()
        return
      default:
        s.commit()
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = useStore.getState()
    if (draft?.kind === 'chain') return finishChain()
    if (draft?.kind === 'poly') return finishPoly()
    if (s.tool === 'select') {
      const el = (e.target as Element).closest('[data-hit]')
      const hit = el?.getAttribute('data-hit')
      if (!hit) return
      const [kind, id] = hit.split(':')
      if (kind === 'room') {
        s.select({ kind: 'room', id })
        s.set({ panel: 'inspector' })
      }
    }
  }

  // ---- derived render data -------------------------------------------------------
  const otherLevel: Level | null = useMemo(() => {
    if (!showOther) return null
    const sorted = [...project.levels].sort((a, b) => a.elevation - b.elevation)
    const i = sorted.findIndex((l) => l.id === level.id)
    return i > 0 ? sorted[i - 1] : null
  }, [project.levels, level.id, showOther])

  const viewW = size.w / cam.scale
  const viewH = size.h / cam.scale
  const minorStep = units === 'imperial' ? CM_PER_FT : 25
  const majorStep = units === 'imperial' ? CM_PER_FT * 5 : 100
  const showMinor = minorStep * cam.scale > 7

  const ghostItem = tool === 'item' && rawHover && placeType ? itemGhost(rawHover, altKey) : null
  const ghostOpening = (tool === 'door' || tool === 'window') && rawHover ? openingPreview(rawHover) : null

  const cursor = underlayMode === 'move' ? 'move' : underlayMode === 'calibrate' ? 'crosshair' : tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'paint' ? 'cell' : 'crosshair'

  // Chain rubber band
  const chainLast = draft?.kind === 'chain' ? draft.points[draft.points.length - 1] : null
  const polyPts = draft?.kind === 'poly' ? draft.points : null

  return (
    <div ref={wrapRef} className="plan-wrap" style={{ cursor }}>
      <svg
        ref={svgRef}
        className="plan-svg"
        width={size.w}
        height={size.h}
        viewBox={`${cam.x0} ${cam.y0} ${viewW} ${viewH}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          setRawHover(null)
          if (!drag.current) setHover(null)
        }}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        role="application"
        aria-label="Floor plan editor"
      >
        <defs>
          <pattern id="grid-minor" width={minorStep} height={minorStep} patternUnits="userSpaceOnUse">
            <path d={`M ${minorStep} 0 L 0 0 0 ${minorStep}`} className="grid-minor" strokeWidth={px} fill="none" />
          </pattern>
          <pattern id="grid-major" width={majorStep} height={majorStep} patternUnits="userSpaceOnUse">
            {showMinor && <rect width={majorStep} height={majorStep} fill="url(#grid-minor)" />}
            <path d={`M ${majorStep} 0 L 0 0 0 ${majorStep}`} className="grid-major" strokeWidth={px} fill="none" />
          </pattern>
        </defs>
        <rect x={cam.x0} y={cam.y0} width={viewW} height={viewH} className="plan-bg" />
        {showGrid && <rect x={cam.x0} y={cam.y0} width={viewW} height={viewH} fill="url(#grid-major)" pointerEvents="none" />}

        {underlay?.visible && (
          <image
            href={underlay.src}
            x={underlay.x}
            y={underlay.y}
            width={underlay.width}
            height={underlay.width * underlay.aspect}
            opacity={underlay.opacity}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        )}
        {calib.length > 0 && (
          <g pointerEvents="none">
            {calib.length === 2 && <DimLine a={calib[0]} b={calib[1]} px={px} units={units} label="?" />}
            {calib.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={6 * px} className="snap-dot is-vertex" strokeWidth={px * 1.5} />
            ))}
          </g>
        )}
        {otherLevel && (
          <g className="other-level" pointerEvents="none">
            <WallsLayer level={otherLevel} px={px} selection={null} ghost />
          </g>
        )}

        <RoomsLayer level={level} px={px} selection={selection} />
        <ItemsLayer items={level.items} px={px} selection={selection} filter={(i) => catalogEntry(i.type).mount !== 'ceiling'} />
        <WallsLayer level={level} px={px} selection={selection} />
        <OpeningsLayer level={level} px={px} selection={selection} />
        <ItemsLayer items={level.items} px={px} selection={selection} filter={(i) => catalogEntry(i.type).mount === 'ceiling'} />
        {!minimap && <RoomLabelsLayer level={level} px={px} units={units} showDims={showDims} />}
        <LabelsLayer labels={level.labels} px={px} selection={selection} />
        {showDims && !minimap && <WallDims level={level} px={px} units={units} />}
        {tool === 'select' && !minimap && multi.length < 2 && <SelectionHandles level={level} selection={selection} px={px} units={units} />}
        {minimap && walker && <WalkerMarker x={walker.x} y={walker.y} yaw={walker.yaw} px={px} />}

        {/* Tool previews */}
        {ghostItem && <ItemGlyph item={ghostItem} px={px} ghost />}
        {ghostOpening && ghostOpening.wall && <OpeningSymbol o={ghostOpening.o} w={ghostOpening.wall} px={px} preview />}

        {chainLast && hover && (
          <g pointerEvents="none">
            <path d={`M ${chainLast.x} ${chainLast.y} L ${hover.p.x} ${hover.p.y}`} className="rubber" strokeWidth={useStore.getState().project.defaults.wallThickness} />
            <DimLine a={chainLast} b={hover.p} px={px} units={units} offset={-(useStore.getState().project.defaults.wallThickness / 2 + 18 * px)} />
          </g>
        )}
        {polyPts && (
          <g pointerEvents="none">
            <path d={polyPts.map((q, i) => `${i ? 'L' : 'M'} ${q.x} ${q.y}`).join(' ') + (hover ? ` L ${hover.p.x} ${hover.p.y}` : '')} className="rubber-poly" strokeWidth={px * 2} />
            {polyPts.length >= 2 && <path d={polyPath(hover ? [...polyPts, hover.p] : polyPts)} className="rubber-fill" />}
            {polyPts.map((q, i) => (
              <circle key={i} cx={q.x} cy={q.y} r={4 * px} className="snap-dot" />
            ))}
            {hover && polyPts.length > 0 && <DimLine a={polyPts[polyPts.length - 1]} b={hover.p} px={px} units={units} offset={-16 * px} />}
          </g>
        )}
        {draft?.kind === 'rect' && hover && (
          <g pointerEvents="none">
            <path d={polyPath(rectPoints(draft.start, hover.p))} className="rubber-fill" />
            <path d={polyPath(rectPoints(draft.start, hover.p))} className="rubber-poly" strokeWidth={px * 2} />
            <DimLine a={{ x: Math.min(draft.start.x, hover.p.x), y: Math.min(draft.start.y, hover.p.y) }} b={{ x: Math.max(draft.start.x, hover.p.x), y: Math.min(draft.start.y, hover.p.y) }} px={px} units={units} offset={-18 * px} />
            <DimLine a={{ x: Math.max(draft.start.x, hover.p.x), y: Math.min(draft.start.y, hover.p.y) }} b={{ x: Math.max(draft.start.x, hover.p.x), y: Math.max(draft.start.y, hover.p.y) }} px={px} units={units} offset={-18 * px} />
          </g>
        )}
        {multi.length > 1 &&
          level.items
            .filter((i) => multi.includes(i.id))
            .map((i) => (
              <rect
                key={`m${i.id}`}
                x={-i.width / 2 - 3 * px}
                y={-i.depth / 2 - 3 * px}
                width={i.width + 6 * px}
                height={i.depth + 6 * px}
                transform={`translate(${i.x} ${i.y}) rotate(${i.rotation})`}
                className="sel-box"
                strokeWidth={px * 1.5}
                pointerEvents="none"
              />
            ))}
        {marquee && <path d={polyPath(rectPoints(marquee.a, marquee.b))} className="marquee" strokeWidth={px} pointerEvents="none" />}
        {measure && dist(measure.a, measure.b) > 1 && (
          <g pointerEvents="none" className="measure">
            <DimLine a={measure.a} b={measure.b} px={px} units={units} />
          </g>
        )}
        {hover && (tool === 'wall' || tool === 'room' || tool === 'polyroom' || tool === 'measure' || drag.current?.kind === 'vertex') && (
          <g pointerEvents="none">
            {hover.guides.map((g, i) =>
              g.axis === 'x' ? (
                <path key={i} d={`M ${g.value} ${Math.min(g.from.y, hover.p.y) - 200} V ${Math.max(g.from.y, hover.p.y) + 200}`} className="guide" strokeWidth={px} />
              ) : (
                <path key={i} d={`M ${Math.min(g.from.x, hover.p.x) - 200} ${g.value} H ${Math.max(g.from.x, hover.p.x) + 200}`} className="guide" strokeWidth={px} />
              ),
            )}
            <circle cx={hover.p.x} cy={hover.p.y} r={(hover.kind === 'vertex' ? 6 : 4) * px} className={`snap-dot is-${hover.kind}`} strokeWidth={px * 1.5} />
          </g>
        )}
      </svg>

      {lengthInput !== null && (
        <form
          className="length-entry"
          onSubmit={(e) => {
            e.preventDefault()
            applyTypedLength(lengthInput)
          }}
        >
          <label htmlFor="len-entry">Wall length</label>
          <input
            id="len-entry"
            autoFocus
            value={lengthInput}
            onChange={(e) => setLengthInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLengthInput(null)
            }}
            placeholder={units === 'imperial' ? `12' 6"` : '3.5 m'}
          />
          <span className="length-hint">Enter to place</span>
        </form>
      )}
      {!minimap && (tool === 'wall' || tool === 'room' || tool === 'polyroom') && !draft && lengthInput === null && <WallOptions />}
      {!minimap && underlayMode && <UnderlayBar />}
      {!minimap && <ScaleBar scale={cam.scale} units={units} />}
      {!minimap && <ToolHint drawing={draft} />}
    </div>
  )
}

function UnderlayBar() {
  const mode = useUnderlay((s) => s.mode)
  const calib = useUnderlay((s) => s.calib)
  const levelId = useStore((s) => s.levelId)
  const units = useStore((s) => s.project.units)
  const [text, setText] = useState('')
  const apply = () => {
    const D = parseLength(text, units, units === 'metric' ? 'cm' : 'ft')
    const u = useUnderlay.getState().byLevel[levelId]
    if (!D || !u || calib.length < 2) return
    const d = dist(calib[0], calib[1])
    if (d < 1) return
    const k = D / d
    const c = calib[0]
    useUnderlay.getState().patch(levelId, { width: u.width * k, x: c.x + (u.x - c.x) * k, y: c.y + (u.y - c.y) * k })
    useUnderlay.getState().setMode(null)
    useStore.getState().notify('Image scaled. Draw walls over it.')
    window.dispatchEvent(new CustomEvent('plan-zoom', { detail: 'fit' }))
    setText('')
  }
  return (
    <form
      className="length-entry underlay-bar"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      {mode === 'move' && <span>Drag the image to line it up</span>}
      {mode === 'calibrate' && calib.length < 2 && <span>Click two points on the image whose real distance you know ({calib.length}/2)</span>}
      {mode === 'calibrate' && calib.length === 2 && (
        <>
          <label htmlFor="calib-len">Real distance</label>
          <input id="calib-len" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={units === 'imperial' ? `12' 6"` : '3.8 m'} />
          <button type="submit" className="btn btn-primary">
            Set scale
          </button>
        </>
      )}
      <button type="button" className="btn" onClick={() => useUnderlay.getState().setMode(null)}>
        Done
      </button>
    </form>
  )
}

const THICKNESSES: Array<{ cm: number; label: string; metric: string }> = [
  { cm: 10, label: 'Thin 4″', metric: 'Thin 10 cm' },
  { cm: 12, label: 'Interior 4½″', metric: 'Interior 12 cm' },
  { cm: 20, label: 'Exterior 8″', metric: 'Exterior 20 cm' },
  { cm: 30, label: 'Thick 12″', metric: 'Thick 30 cm' },
]

function WallOptions() {
  const thickness = useStore((s) => s.project.defaults.wallThickness)
  const units = useStore((s) => s.project.units)
  return (
    <div className="tool-options" role="radiogroup" aria-label="New wall thickness">
      <span>New walls</span>
      {THICKNESSES.map((t) => (
        <button
          key={t.cm}
          type="button"
          role="radio"
          aria-checked={Math.abs(thickness - t.cm) < 0.5}
          className={`chip${Math.abs(thickness - t.cm) < 0.5 ? ' is-on' : ''}`}
          onClick={() => useStore.getState().apply((p) => ({ ...p, defaults: { ...p.defaults, wallThickness: t.cm } }))}
        >
          {units === 'metric' ? t.metric : t.label}
        </button>
      ))}
    </div>
  )
}

function WalkerMarker({ x, y, yaw, px }: { x: number; y: number; yaw: number; px: number }) {
  const fx = -Math.sin(yaw)
  const fy = -Math.cos(yaw)
  const R = 150
  const spread = 0.6
  const a1 = { x: x + (fx * Math.cos(spread) - fy * Math.sin(spread)) * R, y: y + (fx * Math.sin(spread) + fy * Math.cos(spread)) * R }
  const a2 = { x: x + (fx * Math.cos(-spread) - fy * Math.sin(-spread)) * R, y: y + (fx * Math.sin(-spread) + fy * Math.cos(-spread)) * R }
  return (
    <g pointerEvents="none">
      <path d={`M ${x} ${y} L ${a1.x} ${a1.y} A ${R} ${R} 0 0 0 ${a2.x} ${a2.y} Z`} className="walker-cone" />
      <circle cx={x} cy={y} r={7 * px} className="walker-marker" strokeWidth={2 * px} />
    </g>
  )
}

function ScaleBar({ scale: sc, units }: { scale: number; units: 'imperial' | 'metric' }) {
  // Pick a round length that is 60–160 px on screen.
  const candidates = units === 'imperial' ? [1, 2, 5, 10, 20, 50, 100].map((f) => f * CM_PER_FT) : [25, 50, 100, 200, 500, 1000, 2000, 5000]
  const len = candidates.find((c) => c * sc >= 60) ?? candidates[candidates.length - 1]
  return (
    <div className="scale-bar" aria-hidden>
      <div className="scale-bar-line" style={{ width: len * sc }} />
      <span>{formatLength(len, units)}</span>
    </div>
  )
}

function ToolHint({ drawing }: { drawing: Draft }) {
  const tool = useStore((s) => s.tool)
  const placeType = useStore((s) => s.placeType)
  let text = ''
  switch (tool) {
    case 'select':
      text = 'Click to select · Shift+click or Shift+drag to pick several · drag empty space to pan · scroll to zoom'
      break
    case 'wall':
      text = drawing ? 'Click to add corners · type a number for exact length · double-click or Enter to finish' : 'Click to start a wall'
      break
    case 'room':
      text = drawing ? 'Click the opposite corner' : 'Drag (or click twice) to draw a rectangular room'
      break
    case 'polyroom':
      text = drawing ? 'Click each corner · click the first corner or press Enter to close' : 'Click the first corner of the room'
      break
    case 'door':
      text = 'Click a wall to add a door'
      break
    case 'window':
      text = 'Click a wall to add a window'
      break
    case 'item':
      text = placeType ? `Click to place ${catalogEntry(placeType).name} · hold Shift to place several · Alt: no wall snap` : 'Pick an item from the catalog'
      break
    case 'paint':
      text = 'Click a wall side, a room, or a floor to paint it'
      break
    case 'measure':
      text = 'Drag to measure'
      break
    case 'label':
      text = 'Click to place a text label'
      break
    case 'pan':
      text = 'Drag to move around'
      break
  }
  return <div className="tool-hint">{text}</div>
}

export { rotate }
