/**
 * Who is designing: a person planning their own home, or a professional
 * designing for clients. Asked once on the welcome sheet; it decides which
 * plan the upgrade sheet recommends. Kept per device.
 */
import { create } from 'zustand'
import { track } from './analytics'

export type Audience = 'home' | 'pro'

const KEY = 'threshold:audience'

function load(): Audience | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'home' || v === 'pro' ? v : null
  } catch {
    return null
  }
}

export const useAudience = create<{ audience: Audience | null; setAudience: (a: Audience) => void }>((set) => ({
  audience: load(),
  setAudience: (audience) => {
    set({ audience })
    try {
      localStorage.setItem(KEY, audience)
    } catch {
      /* storage unavailable */
    }
    track('audience', { audience })
  },
}))
