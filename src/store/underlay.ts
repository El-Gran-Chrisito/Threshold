/**
 * Tracing image under the plan, one per floor. Kept in this browser only
 * (images are too large for the design file), downscaled on import.
 */
import { create } from 'zustand'
import type { Vec2 } from '../model/types'

export interface Underlay {
  src: string
  x: number
  y: number
  /** Width in cm; height follows the image's aspect ratio. */
  width: number
  aspect: number
  opacity: number
  visible: boolean
}

interface UnderlayState {
  byLevel: Record<string, Underlay>
  mode: null | 'move' | 'calibrate'
  calib: Vec2[]
  set: (levelId: string, u: Underlay | null) => void
  patch: (levelId: string, p: Partial<Underlay>) => void
  setMode: (m: UnderlayState['mode']) => void
  addCalib: (p: Vec2) => void
  load: (levelId: string) => void
}

const key = (levelId: string) => `threshold:underlay:${levelId}`

function persist(levelId: string, u: Underlay | null) {
  try {
    if (u) localStorage.setItem(key(levelId), JSON.stringify(u))
    else localStorage.removeItem(key(levelId))
  } catch {
    /* too large or storage unavailable: keep in memory only */
  }
}

export const useUnderlay = create<UnderlayState>((set, get) => ({
  byLevel: {},
  mode: null,
  calib: [],
  set: (levelId, u) => {
    const byLevel = { ...get().byLevel }
    if (u) byLevel[levelId] = u
    else delete byLevel[levelId]
    set({ byLevel, mode: null, calib: [] })
    persist(levelId, u)
  },
  patch: (levelId, p) => {
    const cur = get().byLevel[levelId]
    if (!cur) return
    const next = { ...cur, ...p }
    set({ byLevel: { ...get().byLevel, [levelId]: next } })
    persist(levelId, next)
  },
  setMode: (mode) => set({ mode, calib: [] }),
  addCalib: (p) => set({ calib: [...get().calib, p].slice(-2) }),
  load: (levelId) => {
    if (get().byLevel[levelId]) return
    try {
      const raw = localStorage.getItem(key(levelId))
      if (raw) set({ byLevel: { ...get().byLevel, [levelId]: JSON.parse(raw) as Underlay } })
    } catch {
      /* ignore */
    }
  },
}))

/** Read an image file, downscale it to at most `max` px on the long side, return a JPEG data URL and its aspect ratio. */
export function readImage(file: File, max = 1800): Promise<{ src: string; aspect: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not an image this browser can open'))
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * k)
        const h = Math.round(img.height * k)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve({ src: c.toDataURL('image/jpeg', 0.82), aspect: h / w })
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
