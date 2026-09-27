import { create } from 'zustand'
import type { Item, Level, OpeningKind, Project, Selection, Tool, ViewMode } from '../model/types'
import { buildTemplate } from '../model/templates'
import { makeLevel, uid } from '../model/factory'
import { loadLastProject, saveProject } from './persistence'

const HISTORY_LIMIT = 200

export interface PaintState {
  target: 'wall' | 'floor'
  color: string
  floor: string
}

export interface State {
  project: Project
  levelId: string
  selection: Selection | null
  tool: Tool
  placeType: string | null
  openingKind: OpeningKind
  paint: PaintState
  view: ViewMode
  showDims: boolean
  showGrid: boolean
  snap: boolean
  showOtherLevels: boolean
  /** In 3D, hide levels above the active one (look inside). */
  cutaway: boolean
  showRoof: boolean
  showCeilings: boolean
  /** Walls drawn at ~1 m so furniture is visible from above. */
  wallCut: boolean
  sunHour: number
  /** 0 = assembled, 1 = fully exploded (3D). */
  explode: number
  walker: { x: number; y: number; yaw: number } | null
  panel: 'inspector' | 'catalog' | 'paint' | 'levels' | 'budget' | 'project' | null
  toast: { text: string; at: number } | null
  past: Project[]
  future: Project[]
  txBase: Project | null
  clipboard: Item | null
  zoomRequest: number

  // History-aware mutation
  apply: (fn: (p: Project) => Project) => void
  applyLevel: (fn: (l: Level) => Level) => void
  begin: () => void
  preview: (fn: (base: Project) => Project) => void
  previewLevel: (fn: (base: Level) => Level) => void
  commit: () => void
  cancel: () => void
  undo: () => void
  redo: () => void
  loadProject: (p: Project) => void

  // UI
  select: (s: Selection | null) => void
  setTool: (t: Tool) => void
  setView: (v: ViewMode) => void
  setLevel: (id: string) => void
  set: (patch: Partial<State>) => void
  notify: (text: string) => void
}

export function activeLevel(s: Pick<State, 'project' | 'levelId'>): Level {
  return s.project.levels.find((l) => l.id === s.levelId) ?? s.project.levels[0]
}

function withLevel(p: Project, levelId: string, fn: (l: Level) => Level): Project {
  return { ...p, levels: p.levels.map((l) => (l.id === levelId ? fn(l) : l)), updatedAt: Date.now() }
}

const initial = loadLastProject() ?? buildTemplate('family')

export const useStore = create<State>((set, get) => ({
  project: initial,
  levelId: initial.levels[0].id,
  selection: null,
  tool: 'select',
  placeType: null,
  openingKind: 'door',
  paint: { target: 'wall', color: '#B3BFA6', floor: 'oak' },
  view: 'split',
  showDims: true,
  showGrid: true,
  snap: true,
  showOtherLevels: true,
  cutaway: true,
  showRoof: false,
  showCeilings: false,
  wallCut: false,
  sunHour: 15,
  explode: 0,
  walker: null,
  panel: 'inspector',
  toast: null,
  past: [],
  future: [],
  txBase: null,
  clipboard: null,
  zoomRequest: 0,

  apply: (fn) => {
    const { project, past } = get()
    const next = fn(project)
    if (next === project) return
    set({ project: { ...next, updatedAt: Date.now() }, past: [...past, project].slice(-HISTORY_LIMIT), future: [], txBase: null })
  },
  applyLevel: (fn) => {
    const { levelId } = get()
    get().apply((p) => withLevel(p, levelId, fn))
  },
  begin: () => {
    if (!get().txBase) set({ txBase: get().project })
  },
  preview: (fn) => {
    const base = get().txBase ?? get().project
    if (!get().txBase) set({ txBase: base })
    set({ project: fn(base) })
  },
  previewLevel: (fn) => {
    const { levelId } = get()
    get().preview((p) => withLevel(p, levelId, fn))
  },
  commit: () => {
    const { txBase, project, past } = get()
    if (!txBase) return
    if (txBase === project) {
      set({ txBase: null })
      return
    }
    set({ past: [...past, txBase].slice(-HISTORY_LIMIT), future: [], txBase: null, project: { ...project, updatedAt: Date.now() } })
  },
  cancel: () => {
    const { txBase } = get()
    if (txBase) set({ project: txBase, txBase: null })
  },
  undo: () => {
    const { past, project, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], txBase: null })
    fixLevelAndSelection()
    get().notify('Undone')
  },
  redo: () => {
    const { past, project, future } = get()
    if (!future.length) return
    const next = future[0]
    set({ project: next, past: [...past, project], future: future.slice(1), txBase: null })
    fixLevelAndSelection()
    get().notify('Redone')
  },
  loadProject: (p) => {
    set({ project: p, levelId: p.levels[0].id, selection: null, past: [], future: [], txBase: null, zoomRequest: get().zoomRequest + 1 })
  },

  select: (selection) => set({ selection, panel: selection ? 'inspector' : get().panel }),
  setTool: (tool) => {
    get().cancel()
    set({ tool, selection: tool === 'select' ? get().selection : null, placeType: tool === 'item' ? get().placeType : null })
  },
  setView: (view) => set({ view }),
  setLevel: (levelId) => set({ levelId, selection: null }),
  set: (patch) => set(patch),
  notify: (text) => set({ toast: { text, at: Date.now() } }),
}))

/** After undo/redo the active level or selected object may no longer exist. */
function fixLevelAndSelection() {
  const s = useStore.getState()
  const level = s.project.levels.find((l) => l.id === s.levelId)
  if (!level) useStore.setState({ levelId: s.project.levels[0].id, selection: null })
  const sel = s.selection
  if (!sel) return
  const l = activeLevel(useStore.getState())
  const exists =
    (sel.kind === 'wall' && l.walls.some((w) => w.id === sel.id)) ||
    (sel.kind === 'room' && l.rooms.some((r) => r.id === sel.id)) ||
    (sel.kind === 'item' && l.items.some((r) => r.id === sel.id)) ||
    (sel.kind === 'opening' && l.openings.some((r) => r.id === sel.id)) ||
    (sel.kind === 'label' && l.labels.some((r) => r.id === sel.id))
  if (!exists) useStore.setState({ selection: null })
}

// Autosave (debounced) whenever the project changes outside a drag.
let saveTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe((s, prev) => {
  if (s.project === prev.project || s.txBase) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveProject(useStore.getState().project), 400)
})

export function addLevelAbove(copyWalls: boolean) {
  const s = useStore.getState()
  const levels = [...s.project.levels].sort((a, b) => a.elevation - b.elevation)
  const top = levels[levels.length - 1]
  const lvl = makeLevel(`Level ${levels.length + 1}`, top.elevation + top.height + 25, top.height)
  if (copyWalls) {
    lvl.walls = top.walls.map((w) => ({ ...w, id: uid('w') }))
    lvl.rooms = top.rooms.map((r) => ({ ...r, id: uid('r') }))
  }
  lvl.roof = { ...top.roof }
  s.apply((p) => ({
    ...p,
    levels: [...p.levels.map((l) => (l.id === top.id ? { ...l, roof: { ...l.roof, style: 'none' as const } } : l)), lvl],
  }))
  useStore.setState({ levelId: lvl.id, selection: null })
  s.notify(`Added ${lvl.name}`)
}

export function addLevelBelow() {
  const s = useStore.getState()
  const levels = [...s.project.levels].sort((a, b) => a.elevation - b.elevation)
  const bottom = levels[0]
  const lvl = makeLevel(bottom.elevation === 0 ? 'Basement' : `Level ${levels.length + 1}`, bottom.elevation - 25 - 240, 240)
  s.apply((p) => ({ ...p, levels: [lvl, ...p.levels] }))
  useStore.setState({ levelId: lvl.id, selection: null })
  s.notify(`Added ${lvl.name}`)
}
