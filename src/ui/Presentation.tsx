/**
 * Client presentation: the 3D home full screen with the studio's branding,
 * a short summary, and a guided set of views (street, corners, garden side,
 * from above, inside) that can advance on its own.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useBrand, hasBrand } from '../product/brand'
import { homeSummary } from '../model/schedule'
import { Icon } from './Icon'

const Scene3D = lazy(() => import('../three/Scene3D').then((m) => ({ default: m.Scene3D })))

type Dir = 'corner' | 'top' | 'N' | 'E' | 'S' | 'W' | 'street'
const VIEWS: Array<{ name: string; dir: Dir; inside?: boolean }> = [
  { name: 'From the street', dir: 'street' },
  { name: 'Front corner', dir: 'corner' },
  { name: 'Right side', dir: 'E' },
  { name: 'Garden side', dir: 'N' },
  { name: 'Left side', dir: 'W' },
  { name: 'From above', dir: 'top' },
  { name: 'Inside', dir: 'corner', inside: true },
]

export function Presentation({ onExit }: { onExit: () => void }) {
  const project = useStore((s) => s.project)
  const client = useStore((s) => s.clientView)
  const own = useBrand()
  // A client sees the sender's brand from the link, never the viewer's own settings.
  const brand = client ? (client.brand ?? { company: '', contact: '', logo: null }) : own
  const title = project.name.replace(/\s*\(shared\)$/, '')
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(false)
  const [evening, setEvening] = useState(false)
  const saved = useRef<{ cutaway: boolean; showRoof: boolean; explode: number; wallCut: boolean; sunHour: number } | null>(null)

  // Remember the designer's 3D settings and put them back afterwards.
  useEffect(() => {
    const s = useStore.getState()
    saved.current = { cutaway: s.cutaway, showRoof: s.showRoof, explode: s.explode, wallCut: s.wallCut, sunHour: s.sunHour }
    useStore.setState({ explode: 0, wallCut: false, section: { ...s.section, on: false }, selection: null })
    return () => {
      if (saved.current) useStore.setState(saved.current)
    }
  }, [])

  useEffect(() => {
    const v = VIEWS[i]
    const s = useStore.getState()
    useStore.setState({ cutaway: !!v.inside, showRoof: !v.inside, viewFrom: { dir: v.dir, seq: s.viewFrom.seq + 1 } })
  }, [i])

  useEffect(() => {
    useStore.setState({ sunHour: evening ? 19.75 : 15 })
  }, [evening])

  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => setI((k) => (k + 1) % VIEWS.length), 7000)
    return () => clearInterval(t)
  }, [auto])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      if (e.key === 'ArrowRight') setI((k) => (k + 1) % VIEWS.length)
      if (e.key === 'ArrowLeft') setI((k) => (k + VIEWS.length - 1) % VIEWS.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const summary = useMemo(() => homeSummary(project), [project])

  return (
    <div className="present" role="dialog" aria-modal="true" aria-label={`Presentation: ${title}`}>
      <div className="present-stage">
        <Suspense fallback={<div className="loading3d">Building 3D view…</div>}>
          <Scene3D walk={false} />
        </Suspense>
      </div>
      <div className="present-brand">
        {brand.logo ? <img src={brand.logo} alt={brand.company || 'Logo'} /> : null}
        {hasBrand(brand) ? (brand.logo ? null : <strong>{brand.company}</strong>) : <strong>Threshold</strong>}
      </div>
      <button type="button" className="present-exit" onClick={onExit} aria-label={client ? 'Explore this home yourself' : 'End presentation'}>
        {client ? (
          <span>Explore it yourself</span>
        ) : (
          <>
            <Icon name="close" /> <span>End</span>
          </>
        )}
      </button>
      {client && <p className="present-made">Made with Threshold</p>}
      <div className="present-card">
        <h1>{title}</h1>
        <p>{summary}</p>
        {project.client && <p className="present-client">Prepared for {project.client}</p>}
        {hasBrand(brand) && (brand.company || brand.contact) && <p className="present-contact">{[brand.company, brand.contact].filter(Boolean).join(' · ')}</p>}
      </div>
      <div className="present-controls">
        <button type="button" className="present-btn" onClick={() => setI((k) => (k + VIEWS.length - 1) % VIEWS.length)} aria-label="Previous view">
          ◀
        </button>
        <span className="present-view">
          {VIEWS[i].name}
          <small>
            {i + 1} / {VIEWS.length}
          </small>
        </span>
        <button type="button" className="present-btn" onClick={() => setI((k) => (k + 1) % VIEWS.length)} aria-label="Next view">
          ▶
        </button>
        <button type="button" className={`present-btn wide${auto ? ' is-on' : ''}`} aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
          {auto ? 'Pause tour' : 'Play tour'}
        </button>
        <button type="button" className={`present-btn wide${evening ? ' is-on' : ''}`} aria-pressed={evening} onClick={() => setEvening((e) => !e)}>
          {evening ? 'Evening' : 'Daytime'}
        </button>
      </div>
    </div>
  )
}
