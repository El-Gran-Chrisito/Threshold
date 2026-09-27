/**
 * Getting started: the few actions that show what Threshold can do. Each
 * step ticks itself when the person does it; progress is kept per device.
 */
import { create } from 'zustand'
import type { Project } from '../model/types'
import { useStore } from '../store/store'

export type Step = 'room' | 'opening' | 'item' | 'finish' | 'view3d' | 'walk'

export const STEPS: Array<{ id: Step; text: string; hint: string }> = [
  { id: 'room', text: 'Draw or resize a room', hint: 'Room tool (R), or drag a room edge' },
  { id: 'opening', text: 'Add a door or window', hint: 'Door (D) or Window (N), then click a wall' },
  { id: 'item', text: 'Add furniture', hint: 'Furnish, pick a piece, click to place' },
  { id: 'finish', text: 'Change a floor, wall colour or style', hint: 'Paint panel' },
  { id: 'view3d', text: 'See it in 3D', hint: '3D or Split at the top' },
  { id: 'walk', text: 'Walk through it', hint: 'Walk at the top' },
]

const KEY = 'threshold:onboarding'

interface Onboarding {
  done: Step[]
  dismissed: boolean
  mark: (s: Step) => void
  dismiss: () => void
}

function load(): Pick<Onboarding, 'done' | 'dismissed'> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { done: [], dismissed: false, ...(JSON.parse(raw) as Partial<Onboarding>) }
  } catch {
    /* storage unavailable */
  }
  return { done: [], dismissed: false }
}

function save(v: Pick<Onboarding, 'done' | 'dismissed'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

export const useOnboarding = create<Onboarding>((set, get) => ({
  ...load(),
  mark: (s) => {
    if (get().done.includes(s)) return
    const done = [...get().done, s]
    set({ done })
    save({ done, dismissed: get().dismissed })
  },
  dismiss: () => {
    set({ dismissed: true })
    save({ done: get().done, dismissed: true })
  },
}))

const count = (p: Project, f: (l: Project['levels'][number]) => number) => p.levels.reduce((s, l) => s + f(l), 0)
const shape = (p: Project) => JSON.stringify(p.levels.map((l) => l.rooms.map((r) => r.points)))
const looks = (p: Project) => JSON.stringify(p.levels.map((l) => [l.rooms.map((r) => r.floor), l.walls.map((w) => [w.colorA, w.colorB, w.finishA, w.finishB])]))

/** Compare each edit of the same design with the one before and tick what changed. */
export function watchOnboarding(): () => void {
  return useStore.subscribe((s, prev) => {
    const o = useOnboarding.getState()
    if (o.dismissed || o.done.length === STEPS.length) return
    if (s.view !== prev.view) {
      if (s.view === '3d' || s.view === 'split') o.mark('view3d')
      if (s.view === 'walk') o.mark('walk')
    }
    const a = prev.project
    const b = s.project
    if (a === b || a.id !== b.id) return
    if (count(b, (l) => l.rooms.length) > count(a, (l) => l.rooms.length) || shape(a) !== shape(b)) o.mark('room')
    if (count(b, (l) => l.openings.length) > count(a, (l) => l.openings.length)) o.mark('opening')
    if (count(b, (l) => l.items.length) > count(a, (l) => l.items.length)) o.mark('item')
    if (looks(a) !== looks(b)) o.mark('finish')
  })
}
