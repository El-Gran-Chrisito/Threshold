/** A studio's own name, contact line and logo for plan sheets and presentations. Kept on this device. */
import { create } from 'zustand'

export interface Brand {
  company: string
  contact: string
  /** PNG or JPEG data URL, kept small. */
  logo: string | null
}

const KEY = 'threshold:brand'

function load(): Brand {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { company: '', contact: '', logo: null, ...(JSON.parse(raw) as Partial<Brand>) }
  } catch {
    /* storage unavailable */
  }
  return { company: '', contact: '', logo: null }
}

export const useBrand = create<Brand & { update: (patch: Partial<Brand>) => void }>((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch)
    const { company, contact, logo } = { ...get(), ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify({ company, contact, logo }))
    } catch {
      /* storage unavailable */
    }
  },
}))

export const hasBrand = (b: Brand) => !!(b.company.trim() || b.logo)

/** Shrink an uploaded logo so it stays light in storage and exports. */
export async function readLogo(file: File, maxW = 480, maxH = 160): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('not an image'))
      img.src = url
    })
    const k = Math.min(1, maxW / img.width, maxH / img.height)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k))
    c.height = Math.max(1, Math.round(img.height * k))
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
