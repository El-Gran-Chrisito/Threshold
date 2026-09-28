/**
 * Pictures of the house from set viewpoints, taken from the 3D view on
 * screen: whole house with its roof, no cutaway or exploded parts. The
 * person's own 3D settings are put back afterwards.
 */
import { useStore } from '../store/store'

type Dir = 'corner' | 'top' | 'N' | 'E' | 'S' | 'W' | 'street'

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
async function settle() {
  for (let i = 0; i < 4; i++) await nextFrame()
  await new Promise((r) => setTimeout(r, 200))
  await nextFrame()
  await nextFrame()
}

export async function capture3dViews(views: Array<{ dir: Dir; name: string }>): Promise<Array<{ name: string; canvas: HTMLCanvasElement }> | null> {
  const s = useStore.getState()
  const src = document.querySelector<HTMLCanvasElement>('.view-3d canvas')
  if (!src || s.view === 'walk' || s.view === 'plan') return null
  const saved = { cutaway: s.cutaway, showRoof: s.showRoof, explode: s.explode, wallCut: s.wallCut, section: s.section, dir: s.viewFrom.dir }
  useStore.setState({ cutaway: false, showRoof: true, explode: 0, wallCut: false, selection: null, section: { ...s.section, on: false } })
  const out: Array<{ name: string; canvas: HTMLCanvasElement }> = []
  try {
    for (const v of views) {
      useStore.setState({ viewFrom: { dir: v.dir, seq: useStore.getState().viewFrom.seq + 1 } })
      await settle()
      const c = document.createElement('canvas')
      c.width = src.width
      c.height = src.height
      c.getContext('2d')!.drawImage(src, 0, 0)
      out.push({ name: v.name, canvas: c })
    }
  } finally {
    useStore.setState({ cutaway: saved.cutaway, showRoof: saved.showRoof, explode: saved.explode, wallCut: saved.wallCut, section: saved.section, viewFrom: { dir: saved.dir, seq: useStore.getState().viewFrom.seq + 1 } })
  }
  return out
}
