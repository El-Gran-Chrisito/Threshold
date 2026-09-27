/**
 * Threshold data model.
 *
 * All lengths are centimetres. Plan space is 2D with x to the right and y
 * downward (same as SVG). In 3D, plan (x, y) maps to world (x, z) and height
 * is world y; the 3D layer converts cm to metres.
 */

export interface Vec2 {
  x: number
  y: number
}

export type UnitSystem = 'imperial' | 'metric'

export type ID = string

export type WallFinish = 'paint' | 'brick' | 'stone' | 'siding' | 'shingle' | 'wood' | 'tile' | 'concrete' | 'wallpaper'

export type DoorStyle = 'flush' | 'panel' | 'glass' | 'barn'
export type WindowStyle = 'casement' | 'picture' | 'grid' | 'awning'

export interface Wall {
  id: ID
  a: Vec2
  b: Vec2
  thickness: number
  height: number
  /** Paint on the side the left-hand normal (-dy, dx) points to. */
  colorA: string
  /** Paint on the opposite side. */
  colorB: string
  finishA?: WallFinish
  finishB?: WallFinish
}

export type OpeningKind = 'door' | 'window' | 'opening' | 'slider' | 'double-door' | 'garage'

export interface Opening {
  id: ID
  wallId: ID
  kind: OpeningKind
  /** Distance from wall.a to the opening centre, along the wall. */
  offset: number
  width: number
  height: number
  /** Height of the bottom edge above the floor (0 for doors). */
  sill: number
  /** Door hinge side and swing: which end the hinge is on, which side it opens to. */
  hinge: 'start' | 'end'
  swing: 'A' | 'B'
  frameColor: string
  /** Door leaf or window glazing style. */
  style?: DoorStyle | WindowStyle
  /** Door leaf colour (defaults to the frame colour). */
  leafColor?: string
}

export interface Room {
  id: ID
  name: string
  points: Vec2[]
  floor: string // material id
  floorColor?: string // tint override for solid materials
  ceilingColor: string
  showCeiling: boolean
}

export interface Item {
  id: ID
  type: string // catalog id
  name?: string
  x: number
  y: number
  /** Degrees, clockwise in plan view. */
  rotation: number
  width: number
  depth: number
  height: number
  /** Height of the item's base above the level floor. */
  elevation: number
  color: string
  color2: string
  mirrored?: boolean
  locked?: boolean
}

export interface Label {
  id: ID
  text: string
  x: number
  y: number
  size: number
}

export type RoofStyle = 'none' | 'flat' | 'gable' | 'hip' | 'shed'

export interface Roof {
  style: RoofStyle
  /** Rise over run, e.g. 0.5 = 6:12. */
  pitch: number
  overhang: number
  color: string
  /** Gable ridge runs along the longer side when true. */
  ridgeAlongLong: boolean
}

export interface Level {
  id: ID
  name: string
  elevation: number
  height: number
  /** Floor slab thickness drawn below this level's floors. */
  slab: number
  walls: Wall[]
  openings: Opening[]
  rooms: Room[]
  items: Item[]
  labels: Label[]
  roof: Roof
}

export interface Site {
  showGround: boolean
  groundColor: string
  /** Compass bearing of plan "up", degrees. 0 = north is up. */
  northAngle: number
}

export interface Project {
  version: 1
  id: ID
  name: string
  units: UnitSystem
  levels: Level[]
  site: Site
  defaults: {
    wallThickness: number
    wallHeight: number
    wallColor: string
    exteriorColor: string
    /** Baseboards on interior wall faces in 3D. */
    baseboards?: boolean
    trimColor?: string
  }
  /** Price overrides keyed by catalog id or material id. */
  prices: Record<string, number>
  createdAt: number
  updatedAt: number
}

export type Selection =
  | { kind: 'wall'; id: ID }
  | { kind: 'opening'; id: ID }
  | { kind: 'room'; id: ID }
  | { kind: 'item'; id: ID }
  | { kind: 'label'; id: ID }

export type SelectionKind = Selection['kind']

export type Tool =
  | 'select'
  | 'wall'
  | 'room'
  | 'polyroom'
  | 'door'
  | 'window'
  | 'item'
  | 'paint'
  | 'measure'
  | 'label'
  | 'pan'

export type ViewMode = 'plan' | '3d' | 'split' | 'walk'
