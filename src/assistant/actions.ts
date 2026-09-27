/**
 * Plain-language design assistant: the action vocabulary Claude answers
 * with, the design summary it reads, and the executor that applies actions
 * to the active level as one undoable change.
 *
 * Coordinates in actions are FEET on the plan: x grows to the east (right),
 * y grows to the south (down).
 */
import type { Item, Level, OpeningKind, Project, Room, RoofMaterial, RoofStyle, Vec2, Wall, WallFinish } from '../model/types'
import { CATALOG, catalogEntry } from '../model/catalog'
import { FLOORS, WALL_FINISHES, PAINTS } from '../model/materials'
import { addRoom, clampOpening, deleteRoom, edgeOnSide, exteriorSides, moveRoom, moveRoomEdge, paintExterior, paintRoomWalls, rectPoints, roomArea, roomWallSides, snapItemToWall, wallLength } from '../model/ops'
import { bounds, lerp, pointInPolygon } from '../model/geometry'
import { makeItem, makeOpening } from '../model/factory'
import { furnishRoom } from '../model/furnish'
import { CM_PER_FT } from '../model/units'
import { applyHomeStyle, HOME_STYLES } from '../model/styles'

type Side = 'N' | 'S' | 'E' | 'W'

export type Action =
  | { op: 'add_room'; name: string; x: number; y: number; w: number; d: number; floor?: string }
  | { op: 'add_room_poly'; name: string; points: Array<[number, number]>; floor?: string }
  | { op: 'move_room'; room: string; dx: number; dy: number }
  | { op: 'resize_room'; room: string; w?: number; d?: number }
  | { op: 'rename_room'; room: string; name: string }
  | { op: 'delete_room'; room: string; with_walls?: boolean }
  | { op: 'set_floor'; room: string; floor: string }
  | { op: 'paint_walls'; room: string; color: string; finish?: string }
  | { op: 'add_door'; room: string; to?: string; side?: Side; kind?: OpeningKind; width?: number }
  | { op: 'add_window'; room: string; side?: Side; width?: number; count?: number }
  | { op: 'add_item'; type: string; room: string; place?: Side | 'center'; along?: number; rotation?: number; color?: string; width?: number; depth?: number }
  | { op: 'remove_items'; room: string; type?: string }
  | { op: 'furnish_room'; room: string }
  | { op: 'exterior'; color: string; finish?: string }
  | { op: 'set_roof'; style: RoofStyle; pitch?: number; material?: RoofMaterial; color?: string }
  | { op: 'apply_style'; style: string }

const ft = (n: number) => n * CM_PER_FT
const toFt = (cm: number) => Math.round((cm / CM_PER_FT) * 10) / 10

// ---------------------------------------------------------------------------
// What Claude reads

export function describeLevel(p: Project, level: Level): string {
  const rooms = level.rooms.map((r) => {
    const b = bounds(r.points)
    const items = level.items.filter((i) => pointInPolygon(i, r.points)).map((i) => i.type)
    const doors = level.openings.filter((o) => o.kind !== 'window' && roomWallSides(level, r).some((s) => s.wall.id === o.wallId)).length
    const windows = level.openings.filter((o) => o.kind === 'window' && roomWallSides(level, r).some((s) => s.wall.id === o.wallId)).length
    return {
      name: r.name,
      x: toFt(b.minX),
      y: toFt(b.minY),
      w: toFt(b.maxX - b.minX),
      d: toFt(b.maxY - b.minY),
      ...(r.points.length !== 4 ? { shape: 'irregular' } : {}),
      sqft: Math.round(roomArea(r) / (CM_PER_FT * CM_PER_FT)),
      floor: r.floor,
      doors,
      windows,
      items,
    }
  })
  return JSON.stringify({ level: level.name, floors_in_home: p.levels.map((l) => l.name), roof: level.roof.style, rooms })
}

export function catalogSummary(): string {
  return CATALOG.map((c) => `${c.id} (${c.name}, ${Math.round(c.w / 2.54)}x${Math.round(c.d / 2.54)} in)`).join('; ')
}

export function buildPrompt(p: Project, level: Level, request: string, hasImage: boolean): string {
  return `You are the design assistant inside a home design app. Turn the user's request into edit actions for the floor shown below.

PLAN COORDINATES: feet. x grows to the east (right), y grows to the south (down). Rooms are rectangles given by top-left corner (x, y), width w (east-west) and depth d (north-south). Rooms that touch share a wall automatically. Keep new rooms touching existing ones unless the user says otherwise. Typical sizes: bedroom 11x12 to 14x16, primary bedroom 14x16+, bathroom 5x8 to 8x10, kitchen 10x12+, living room 14x16+, closet 3x6, hallway 4 wide.

ACTIONS (reply with only this JSON object, no other text):
{"summary": "one short sentence saying what you changed", "actions": [ ... ]}
Each action is one of:
- {"op":"add_room","name":str,"x":num,"y":num,"w":num,"d":num,"floor"?:floorId}
- {"op":"add_room_poly","name":str,"points":[[x,y],...],"floor"?:floorId}
- {"op":"move_room","room":name,"dx":num,"dy":num}
- {"op":"resize_room","room":name,"w"?:num,"d"?:num}   (top-left corner stays)
- {"op":"rename_room","room":name,"name":str}
- {"op":"delete_room","room":name,"with_walls"?:bool}
- {"op":"set_floor","room":name,"floor":floorId}
- {"op":"paint_walls","room":name,"color":"#RRGGBB","finish"?:finishId}
- {"op":"add_door","room":name,"to"?:otherRoomName|"outside","side"?:"N"|"S"|"E"|"W","kind"?:"door"|"double-door"|"slider"|"opening"|"garage","width"?:inches}
- {"op":"add_window","room":name,"side"?:"N"|"S"|"E"|"W","width"?:inches,"count"?:int}
- {"op":"add_item","type":catalogId,"room":name,"place"?:"N"|"S"|"E"|"W"|"center","along"?:0..1,"rotation"?:degrees,"color"?:"#RRGGBB"}
   place = which wall the item backs onto; along = position along that wall (0 = west/north end, 1 = east/south end); "center" floats it mid-room.
- {"op":"remove_items","room":name,"type"?:catalogId}
- {"op":"furnish_room","room":name}   (adds a sensible starter set for the room's type; prefer this over many add_item actions when asked to furnish a room)
- {"op":"exterior","color":"#RRGGBB","finish"?:finishId}
- {"op":"set_roof","style":"none"|"flat"|"gable"|"hip"|"shed","pitch"?:risePer12,"material"?:"shingle"|"metal"|"tile"|"slate"|"membrane","color"?:"#RRGGBB"}
- {"op":"apply_style","style":${HOME_STYLES.map((s) => `"${s.id}"`).join('|')}}  (restyles every room, floor, trim, outside, roof and furniture colour in the whole home; use first, then any specific changes)
Order matters: create rooms before adding doors, windows or items to them. Give every new room at least one door. Keep furniture sizes realistic for the room.

FLOOR IDS: ${FLOORS.map((f) => `${f.id} (${f.name})`).join('; ')}
FINISH IDS: ${WALL_FINISHES.map((f) => `${f.id}`).join(', ')}
PAINT IDEAS: ${PAINTS.map((s) => `${s.name} ${s.hex}`).join(', ')}
CATALOG IDS: ${catalogSummary()}

CURRENT FLOOR: ${describeLevel(p, level)}
${hasImage ? '\nAN IMAGE IS ATTACHED: it shows a floor plan, sketch or photo. Recreate what it shows with add_room actions (and doors/windows/items you can see), estimating dimensions in feet from any labels or proportions.\n' : ''}
USER REQUEST: ${request}`
}

// ---------------------------------------------------------------------------
// Executor

function findRoom(level: Level, name: string | undefined): Room | null {
  if (!name) return null
  const n = name.trim().toLowerCase()
  return level.rooms.find((r) => r.name.toLowerCase() === n) ?? level.rooms.find((r) => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase())) ?? null
}

function floorId(id: string | undefined): string | undefined {
  if (!id) return undefined
  const n = id.toLowerCase()
  return (FLOORS.find((f) => f.id === n) ?? FLOORS.find((f) => f.name.toLowerCase().includes(n) || n.includes(f.id)))?.id
}

function finishId(id: string | undefined): WallFinish | undefined {
  if (!id) return undefined
  const n = id.toLowerCase()
  return (WALL_FINISHES.find((f) => f.id === n) ?? WALL_FINISHES.find((f) => f.name.toLowerCase().includes(n)))?.id
}

function catalogId(type: string): string | null {
  const n = type.toLowerCase()
  return (CATALOG.find((c) => c.id === n) ?? CATALOG.find((c) => c.name.toLowerCase() === n) ?? CATALOG.find((c) => c.name.toLowerCase().includes(n) || (c.keywords ?? '').includes(n)))?.id ?? null
}

const hex = (c: string | undefined, fallback: string) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : fallback)

/** Which side of the room's bounding box a wall runs along (by its midpoint), if any. */
function sideOfRoom(room: Room, w: Wall): Side | null {
  const b = bounds(room.points)
  const m = lerp(w.a, w.b, 0.5)
  const tol = w.thickness + 4
  if (Math.abs(m.y - b.minY) < tol) return 'N'
  if (Math.abs(m.y - b.maxY) < tol) return 'S'
  if (Math.abs(m.x - b.minX) < tol) return 'W'
  if (Math.abs(m.x - b.maxX) < tol) return 'E'
  return null
}

function pickWall(level: Level, room: Room, opts: { to?: string; side?: Side; exteriorOnly?: boolean }): Wall | null {
  const mine = roomWallSides(level, room).map((s) => s.wall)
  let candidates = mine
  if (opts.to && opts.to.toLowerCase() !== 'outside') {
    const other = findRoom(level, opts.to)
    if (!other) return null
    const theirs = new Set(roomWallSides(level, other).map((s) => s.wall.id))
    candidates = mine.filter((w) => theirs.has(w.id))
  } else if (opts.to?.toLowerCase() === 'outside' || opts.exteriorOnly) {
    const ext = new Set(exteriorSides(level).map((s) => s.wall.id))
    const outside = mine.filter((w) => ext.has(w.id))
    if (outside.length || opts.to?.toLowerCase() === 'outside') candidates = outside
  }
  if (opts.side) {
    const onSide = candidates.filter((w) => sideOfRoom(room, w) === opts.side)
    if (onSide.length) candidates = onSide
  }
  return [...candidates].sort((a, b) => wallLength(b) - wallLength(a))[0] ?? null
}

function freeSpotOnWall(level: Level, w: Wall, width: number, prefer = 0.5): number | null {
  const L = wallLength(w)
  if (width > L - 10) return null
  const taken = level.openings.filter((o) => o.wallId === w.id).map((o) => [o.offset - o.width / 2 - 15, o.offset + o.width / 2 + 15])
  const tries = [prefer, 0.5, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]
  for (const t of tries) {
    const c = Math.min(Math.max(t * L, width / 2 + 5), L - width / 2 - 5)
    if (taken.every(([a, b]) => c + width / 2 < a || c - width / 2 > b)) return c
  }
  return null
}

export interface RunResult {
  project: Project
  applied: string[]
  skipped: string[]
}

export function runActions(project: Project, levelId: string, actions: Action[]): RunResult {
  const applied: string[] = []
  const skipped: string[] = []
  let proj = project
  let level = project.levels.find((l) => l.id === levelId)!
  let roof = level.roof

  for (const raw of actions) {
    const a = raw as Action
    try {
      switch (a.op) {
        case 'add_room': {
          if (!(a.w > 0 && a.d > 0)) throw new Error('size missing')
          const { level: next } = addRoom(level, rectPoints({ x: ft(a.x), y: ft(a.y) }, { x: ft(a.x + a.w), y: ft(a.y + a.d) }), { name: a.name || undefined, floor: floorId(a.floor) ?? 'oak' }, { height: level.height })
          level = next
          applied.push(`Added ${a.name} (${a.w}′ × ${a.d}′)`)
          break
        }
        case 'add_room_poly': {
          if (!Array.isArray(a.points) || a.points.length < 3) throw new Error('needs 3+ points')
          level = addRoom(level, a.points.map(([x, y]) => ({ x: ft(x), y: ft(y) })), { name: a.name || undefined, floor: floorId(a.floor) ?? 'oak' }, { height: level.height }).level
          applied.push(`Added ${a.name}`)
          break
        }
        case 'move_room': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          level = moveRoom(level, r.id, { x: ft(a.dx || 0), y: ft(a.dy || 0) })
          applied.push(`Moved ${r.name}`)
          break
        }
        case 'resize_room': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          if (r.points.length !== 4) throw new Error(`${r.name} is not rectangular`)
          const b = bounds(r.points)
          const east = edgeOnSide(r, 'E')
          if (a.w && east >= 0) level = moveRoomEdge(level, r.id, east, ft(a.w) - (b.maxX - b.minX))
          const resized = level.rooms.find((x) => x.id === r.id)!
          const south = edgeOnSide(resized, 'S')
          if (a.d && south >= 0) level = moveRoomEdge(level, r.id, south, ft(a.d) - (b.maxY - b.minY))
          applied.push(`Resized ${r.name}`)
          break
        }
        case 'rename_room': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          level = { ...level, rooms: level.rooms.map((x) => (x.id === r.id ? { ...x, name: a.name } : x)) }
          applied.push(`Renamed ${r.name} to ${a.name}`)
          break
        }
        case 'delete_room': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          level = deleteRoom(level, r.id, !!a.with_walls)
          applied.push(`Removed ${r.name}`)
          break
        }
        case 'set_floor': {
          const r = findRoom(level, a.room)
          const f = floorId(a.floor)
          if (!r) throw new Error(`no room “${a.room}”`)
          if (!f) throw new Error(`unknown floor “${a.floor}”`)
          level = { ...level, rooms: level.rooms.map((x) => (x.id === r.id ? { ...x, floor: f, floorColor: undefined } : x)) }
          applied.push(`${r.name}: floor set`)
          break
        }
        case 'paint_walls': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          level = paintRoomWalls(level, r.id, hex(a.color, '#F4F2EC'), finishId(a.finish) ?? 'paint')
          applied.push(`${r.name}: walls ${finishId(a.finish) && finishId(a.finish) !== 'paint' ? finishId(a.finish) : 'painted'}`)
          break
        }
        case 'add_door': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          const kind: OpeningKind = (['door', 'double-door', 'slider', 'opening', 'garage'] as const).includes(a.kind as never) ? (a.kind as OpeningKind) : 'door'
          const w = pickWall(level, r, { to: a.to ?? (a.side ? undefined : 'outside'), side: a.side })
          if (!w) throw new Error(`no wall for a door in ${r.name}`)
          const base = makeOpening(w.id, kind, 0)
          const width = a.width ? a.width * 2.54 : base.width
          const at = freeSpotOnWall(level, w, Math.min(width, wallLength(w) - 12))
          if (at === null) throw new Error(`no room on the wall for a door`)
          const o = clampOpening({ ...base, offset: at, width: Math.min(width, wallLength(w) - 12) }, w)
          level = { ...level, openings: [...level.openings, o] }
          applied.push(`${r.name}: ${kind.replace('-', ' ')} added${a.to ? ` to ${a.to}` : ''}`)
          break
        }
        case 'add_window': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          const w = pickWall(level, r, { side: a.side, exteriorOnly: true })
          if (!w) throw new Error(`no outside wall in ${r.name}`)
          const n = Math.max(1, Math.min(4, Math.round(a.count ?? 1)))
          let added = 0
          for (let i = 0; i < n; i++) {
            const base = makeOpening(w.id, 'window', 0)
            const width = a.width ? a.width * 2.54 : base.width
            const at = freeSpotOnWall(level, w, width, n === 1 ? 0.5 : (i + 1) / (n + 1))
            if (at === null) break
            level = { ...level, openings: [...level.openings, clampOpening({ ...base, offset: at, width }, w)] }
            added++
          }
          if (!added) throw new Error('no space for a window')
          applied.push(`${r.name}: ${added} window${added > 1 ? 's' : ''} added`)
          break
        }
        case 'add_item': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          const id = catalogId(a.type)
          if (!id) throw new Error(`unknown item “${a.type}”`)
          const c = catalogEntry(id)
          const b = bounds(r.points)
          const along = Math.min(1, Math.max(0, a.along ?? 0.5))
          const place = a.place ?? 'center'
          let pos: Vec2
          let rotation = a.rotation ?? 0
          const depth = a.depth ? a.depth * 2.54 : c.d
          const inset = depth / 2 + 12
          switch (place) {
            case 'N':
              pos = { x: lerp({ x: b.minX, y: 0 }, { x: b.maxX, y: 0 }, along).x, y: b.minY + inset }
              rotation = 0
              break
            case 'S':
              pos = { x: lerp({ x: b.minX, y: 0 }, { x: b.maxX, y: 0 }, along).x, y: b.maxY - inset }
              rotation = 180
              break
            case 'W':
              pos = { x: b.minX + inset, y: lerp({ x: 0, y: b.minY }, { x: 0, y: b.maxY }, along).y }
              rotation = 270
              break
            case 'E':
              pos = { x: b.maxX - inset, y: lerp({ x: 0, y: b.minY }, { x: 0, y: b.maxY }, along).y }
              rotation = 90
              break
            default:
              pos = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
          }
          let item: Item = makeItem(id, pos, {
            rotation,
            ...(a.color ? { color: hex(a.color, c.color) } : {}),
            ...(a.width ? { width: a.width * 2.54 } : {}),
            ...(a.depth ? { depth: a.depth * 2.54 } : {}),
            height: c.fitHeight ? level.height + 25 : c.h,
            elevation: c.mount === 'ceiling' ? Math.max(0, level.height - c.h) : c.elevation ?? 0,
          })
          if (place !== 'center') {
            const sn = snapItemToWall(level, item, pos, 60)
            if (sn) item = { ...item, ...sn }
          }
          level = { ...level, items: [...level.items, item] }
          applied.push(`${r.name}: added ${c.name.toLowerCase()}`)
          break
        }
        case 'remove_items': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          const id = a.type ? catalogId(a.type) : null
          const before = level.items.length
          level = { ...level, items: level.items.filter((i) => !(pointInPolygon(i, r.points) && (!id || i.type === id))) }
          applied.push(`${r.name}: removed ${before - level.items.length} item(s)`)
          break
        }
        case 'furnish_room': {
          const r = findRoom(level, a.room)
          if (!r) throw new Error(`no room “${a.room}”`)
          const items = furnishRoom(level, r)
          if (!items.length) throw new Error(`no free space in ${r.name}`)
          level = { ...level, items: [...level.items, ...items] }
          applied.push(`${r.name}: furnished (${items.length} pieces)`)
          break
        }
        case 'exterior': {
          level = paintExterior(level, hex(a.color, '#CFC8BB'), undefined, finishId(a.finish))
          applied.push('Outside walls updated')
          break
        }
        case 'set_roof': {
          const style = (['none', 'flat', 'gable', 'hip', 'shed'] as const).includes(a.style) ? a.style : 'gable'
          const material = (['shingle', 'metal', 'tile', 'slate', 'membrane'] as const).find((m) => m === a.material)
          const color = typeof a.color === 'string' && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : undefined
          roof = { ...roof, style, ...(a.pitch ? { pitch: Math.min(2, Math.max(0, a.pitch / 12)) } : {}), ...(material ? { material } : {}), ...(color ? { color } : {}) }
          level = { ...level, roof }
          applied.push(`Roof: ${style}`)
          break
        }
        case 'apply_style': {
          const st = HOME_STYLES.find((x) => x.id === a.style)
          if (!st) throw new Error(`no style "${a.style}"`)
          proj = applyHomeStyle({ ...proj, levels: proj.levels.map((l) => (l.id === levelId ? level : l)) }, st.id)
          level = proj.levels.find((l) => l.id === levelId)!
          roof = level.roof
          applied.push(`Style: ${st.name}`)
          break
        }
        default:
          skipped.push(`Unknown action ${(raw as { op?: string }).op ?? '?'}`)
      }
    } catch (e) {
      skipped.push(`${(raw as { op?: string }).op ?? 'action'}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  return { project: { ...proj, levels: proj.levels.map((l) => (l.id === levelId ? level : l)), updatedAt: Date.now() }, applied, skipped }
}

