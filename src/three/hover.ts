import { create } from 'zustand'

/** Which 3D object the pointer is over ("item:ID", "wall:ID", ...). Kept apart from the main store so hovering re-renders only the two objects involved. */
export const useHover = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}))
