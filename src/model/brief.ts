/**
 * Plan from a brief: bedrooms, bathrooms, floors, garage. Rooms sit in two
 * rows either side of a hall, living spaces at one end and bedrooms at the
 * other, so every room has an outside wall for windows and a door to the hall.
 * The result is an ordinary design: every wall, door and item stays editable.
 * Coordinates are feet.
 */
import type { Level, Project } from './types'
import { Builder, ft } from './templates'
import { makeLevel, makeProject } from './factory'
import { furnishRoom } from './furnish'
import { roomArea } from './ops'

export interface Brief {
  bedrooms: number
  /** Full baths plus 0.5 for a powder room. */
  bathrooms: number
  storeys: 1 | 2
  garage: 0 | 1 | 2
  office: boolean
  openPlan: boolean
}

export const DEFAULT_BRIEF: Brief = { bedrooms: 3, bathrooms: 2, storeys: 1, garage: 2, office: false, openPlan: true }

type Kind = 'kitchen' | 'dining' | 'living' | 'bed' | 'primary' | 'ensuite' | 'bath' | 'powder' | 'laundry' | 'office' | 'stairs' | 'landing'

interface Slot {
  name: string
  w: number
  floor: string
  kind: Kind
  /** Fixed slots keep their width so the stairs line up between floors. */
  fixed?: boolean
}

interface Placed extends Slot {
  x0: number
  x1: number
  north: boolean
}

/** Row depth, hall width, whole depth. */
const ROW = 13
const HALL = 4
const DEPTH = ROW * 2 + HALL

const rank: Record<Kind, number> = { kitchen: 0, dining: 0, living: 0, stairs: 0, landing: 0, laundry: 1, powder: 1, office: 1, bath: 2, bed: 3, primary: 4, ensuite: 4 }

const slot = (name: string, w: number, floor: string, kind: Kind, fixed = false): Slot => ({ name, w, floor, kind, fixed })

/** Share loose rooms between the two rows, largest first, into the shorter row. */
function share(north: Slot[], south: Slot[], loose: Slot[][]): void {
  const len = (r: Slot[]) => r.reduce((s, x) => s + x.w, 0)
  const units = [...loose].sort((a, b) => len(b) - len(a))
  for (const u of units) (len(north) <= len(south) ? north : south).push(...u)
  // Quieter rooms further from the living end; a suite stays together.
  const order = (r: Slot[]) => {
    const head = r.filter((s) => s.fixed)
    const rest = r.filter((s) => !s.fixed)
    const groups: Slot[][] = []
    for (const s of rest) {
      if (s.kind === 'ensuite' && groups.length && groups[groups.length - 1][0].kind === 'primary') groups[groups.length - 1].push(s)
      else groups.push([s])
    }
    groups.sort((a, b) => rank[a[0].kind] - rank[b[0].kind])
    r.splice(0, r.length, ...head, ...groups.flat())
  }
  order(north)
  order(south)
}

/** Make both rows the same length: widen flexible rooms, or add a room at the end. */
function fill(row: Slot[], W: number, filler: Slot): void {
  let gap = W - row.reduce((s, x) => s + x.w, 0)
  if (gap <= 0) return
  const flex = row.filter((s) => !s.fixed && (s.kind === 'bed' || s.kind === 'primary' || s.kind === 'office' || s.kind === 'living'))
  if (flex.length) {
    const each = Math.min(4, gap / flex.length)
    for (const s of flex) s.w += each
    gap -= each * flex.length
  }
  if (gap >= 8) row.push({ ...filler, w: gap })
  else if (gap >= 3.5) row.push(slot('Storage', gap, 'oak', 'laundry'))
  else if (gap > 0) row[row.length - 1].w += gap
}

function place(north: Slot[], south: Slot[]): Placed[] {
  const out: Placed[] = []
  for (const [row, isNorth] of [
    [north, true],
    [south, false],
  ] as const) {
    let x = 0
    for (const s of row) {
      out.push({ ...s, w: Math.round(s.w * 2) / 2, x0: x, x1: x + Math.round(s.w * 2) / 2, north: isNorth })
      x += Math.round(s.w * 2) / 2
    }
  }
  return out
}

function buildFloor(level: Level, rooms: Placed[], W: number, brief: Brief, opts: { garage: boolean; ground: boolean }): Level {
  const b = new Builder(level)
  const yEdge = (r: Placed) => (r.north ? ROW : ROW + HALL)
  const yOut = (r: Placed) => (r.north ? 0 : DEPTH)
  const yMid = (r: Placed) => (r.north ? ROW / 2 : ROW + HALL + ROW / 2)

  for (const r of rooms) b.room(r.name, r.x0, r.north ? 0 : ROW + HALL, r.x1, r.north ? ROW : DEPTH, r.floor)
  b.room('Hall', 0, ROW, W, ROW + HALL, 'oak')
  if (opts.garage) {
    const gw = brief.garage === 2 ? 22 : 12
    b.room('Garage', -gw, DEPTH - 24, 0, DEPTH, 'concrete')
  }
  b.exterior('#DCE3E6', 20, 'siding')

  const open = (r: Placed) => ({ x: (r.x0 + r.x1) / 2, y: yMid(r) })
  for (const r of rooms) {
    const cx = (r.x0 + r.x1) / 2
    const w = r.x1 - r.x0
    const end = r.x1 >= W - 0.01
    const start = r.x0 <= 0.01
    switch (r.kind) {
      case 'kitchen':
      case 'dining':
      case 'living':
        b.opening('opening', cx, yEdge(r), { width: brief.openPlan ? Math.min(w - 2.5, r.kind === 'living' ? 14 : 10) : 5 })
        break
      case 'stairs':
      case 'landing':
        b.opening('opening', r.x0 + 6, yEdge(r), { width: 10 })
        break
      case 'ensuite':
        break
      default: {
        // Bedroom doors near a corner leave the long walls for furniture.
        const dx = r.kind === 'bed' || r.kind === 'primary' || r.kind === 'office' ? r.x0 + 2.4 : cx
        b.opening('door', dx, yEdge(r), { width: r.kind === 'bath' || r.kind === 'powder' || r.kind === 'laundry' ? 2.5 : 2.67, into: open(r) })
      }
    }

    // Windows on the outside wall.
    const small = r.kind === 'bath' || r.kind === 'ensuite' || r.kind === 'powder' || r.kind === 'laundry'
    if (r.kind === 'dining') {
      if (opts.ground) b.opening('slider', cx, yOut(r), { width: 6, into: open(r) })
    } else if (r.kind === 'kitchen') {
      b.opening('window', cx, yOut(r), { width: 4, sill: 3.5, height: 3.5 })
    } else if (r.kind === 'living' && opts.ground && !r.north) {
      b.opening('door', r.x0 + Math.min(4, w * 0.25), yOut(r), { width: 3, style: 'panel', into: open(r) })
      b.opening('window', r.x0 + w * 0.68, yOut(r), { width: Math.min(6, w * 0.35) })
    } else if (small) {
      b.opening('window', cx, yOut(r), { width: 2.5, sill: 4.5, height: 2.5 })
    } else if (w >= 17) {
      b.opening('window', r.x0 + w / 3, yOut(r), { width: 4 })
      b.opening('window', r.x0 + (2 * w) / 3, yOut(r), { width: 4 })
    } else {
      b.opening('window', cx, yOut(r), { width: r.kind === 'stairs' || r.kind === 'landing' ? 3 : 4 })
    }
    if (end && !small) b.opening('window', W, yMid(r), { width: 4 })
    if (start && !opts.garage && !small && r.kind !== 'kitchen') b.opening('window', 0, yMid(r), { width: 4 })
  }

  // En-suite door from the primary bedroom, beside the hall.
  const primary = rooms.find((r) => r.kind === 'primary')
  const ensuite = rooms.find((r) => r.kind === 'ensuite')
  if (primary && ensuite) {
    const x = primary.x1 === ensuite.x0 ? primary.x1 : primary.x0
    b.opening('door', x, primary.north ? ROW - 2.5 : ROW + HALL + 2.5, { width: 2.5, into: open(ensuite) })
  }
  // Kitchen to dining, when they are separate rooms.
  const kitchen = rooms.find((r) => r.kind === 'kitchen')
  const dining = rooms.find((r) => r.kind === 'dining')
  if (kitchen && dining) b.opening('opening', kitchen.x1 === dining.x0 ? kitchen.x1 : kitchen.x0, ROW / 2, { width: brief.openPlan ? 9 : 4 })

  if (opts.garage) {
    const gw = brief.garage === 2 ? 22 : 12
    b.opening('door', 0, ROW + HALL / 2, { width: 2.67, into: { x: -3, y: ROW + HALL / 2 } })
    b.opening('garage', -gw / 2, DEPTH, { width: brief.garage === 2 ? 16 : 9 })
  }

  // Stairs rise from the hall towards the outside wall; the landing above is open to the hall.
  const stairs = rooms.find((r) => r.kind === 'stairs')
  if (stairs) {
    const run = 330 / ft(1)
    b.put('stairs', stairs.x0 + 2.9, ROW + 0.9 - run / 2, 0, { height: level.height + 25 })
  }

  let l = b.level
  for (const r of l.rooms) {
    if (/^(hall|stairs|landing)/i.test(r.name)) continue
    l = { ...l, items: [...l.items, ...furnishRoom(l, r)] }
  }
  return l
}

export function planFromBrief(brief: Brief): Project {
  const beds = Math.max(1, Math.min(6, Math.round(brief.bedrooms)))
  const full = Math.max(1, Math.floor(brief.bathrooms))
  const half = brief.bathrooms % 1 >= 0.5
  const ensuite = full >= 2
  const two = brief.storeys === 2
  const name = `${beds}-bedroom ${two ? 'two-storey' : 'single-storey'} home`
  const p = makeProject(name)

  const primary: Slot[] = ensuite ? [slot('Primary bedroom', two ? 14 : 15, 'carpet-oat', 'primary', two), slot('Primary bath', two ? 8 : 9, 'marble', 'ensuite', two)] : [slot('Primary bedroom', two ? 13 : 14, 'carpet-oat', 'primary', two)]
  const bedrooms = Array.from({ length: beds - 1 }, (_, k) => [slot(`Bedroom ${k + 2}`, 12, 'carpet-oat', 'bed')])
  const hallBaths = full - (ensuite ? 1 : 0)
  const baths = Array.from({ length: hallBaths }, (_, k) => [slot(hallBaths > 1 ? `Bath ${k + 1}` : 'Bath', 9, 'hex', 'bath')])
  const service = [[slot('Laundry', 7, 'tile-grey', 'laundry')], ...(half ? [[slot('Powder room', 5, 'hex', 'powder')]] : []), ...(brief.office ? [[slot('Office', 11, 'oak', 'office')]] : [])]

  if (!two) {
    // Living spaces grow with the household.
    const k = beds <= 2 ? 0 : beds <= 4 ? 1 : 2
    const north = [slot('Kitchen', [12, 14, 15][k], 'oak', 'kitchen', true), slot('Dining', [10, 12, 13][k], 'oak', 'dining', true)]
    const south = [slot('Living room', [18, 22, 24][k], 'oak', 'living', true)]
    share(north, south, [...service, ...baths, ...bedrooms, primary])
    const W = Math.max(...[north, south].map((r) => r.reduce((s, x) => s + x.w, 0)))
    fill(north, W, slot('Family room', 0, 'oak', 'living'))
    fill(south, W, slot('Den', 0, 'oak', 'living'))
    const ground = { ...makeLevel('Ground floor', 0), roof: { style: 'gable' as const, pitch: 0.5, overhang: 45, color: '#3E4246', ridgeAlongLong: true } }
    return { ...p, levels: [buildFloor(ground, place(north, south), W, brief, { garage: brief.garage > 0, ground: true })] }
  }

  // Two storeys. The first 22 ft of the north row match on both floors so the stairs meet the landing.
  const gNorth = [slot('Kitchen', 12, 'oak', 'kitchen', true), slot('Dining', 10, 'oak', 'dining', true), slot('Stairs', 12, 'oak', 'stairs', true)]
  const gSouth = [slot('Living room', 20, 'oak', 'living', true)]
  share(gNorth, gSouth, service)
  const uNorth = [...(ensuite ? primary : [...primary, slot('Bath', 9, 'hex', 'bath', true)]), slot('Landing', 12, 'oak', 'landing', true)]
  const uSouth: Slot[] = []
  const upperBaths = ensuite ? baths : baths.slice(1)
  share(uNorth, uSouth, [...upperBaths, ...bedrooms])
  const W = Math.max(34, ...[gNorth, gSouth, uNorth, uSouth].map((r) => r.reduce((s, x) => s + x.w, 0)))
  fill(gNorth, W, slot('Family room', 0, 'oak', 'living'))
  fill(gSouth, W, slot('Den', 0, 'oak', 'living'))
  fill(uNorth, W, slot('Bonus room', 0, 'carpet-oat', 'office'))
  fill(uSouth, W, slot('Study', 0, 'oak', 'office'))
  const g0 = { ...makeLevel('Ground floor', 0), roof: { style: 'flat' as const, pitch: 0.5, overhang: 20, color: '#5B5F63', ridgeAlongLong: true } }
  const ground = buildFloor(g0, place(gNorth, gSouth), W, brief, { garage: brief.garage > 0, ground: true })
  const u0 = { ...makeLevel('Upper floor', ground.height + 25, 260), roof: { style: 'gable' as const, pitch: 0.5, overhang: 45, color: '#3E4246', ridgeAlongLong: true } }
  const upper = buildFloor(u0, place(uNorth, uSouth), W, brief, { garage: false, ground: false })
  return { ...p, levels: [ground, upper] }
}

/** Indoor floor area in cm², garage excluded. */
export function briefArea(p: Project): number {
  return p.levels.flatMap((l) => l.rooms).filter((r) => !/garage/i.test(r.name)).reduce((s, r) => s + roomArea(r), 0)
}
