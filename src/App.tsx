import { lazy, Suspense, useEffect, useState } from 'react'
import { activeLevel, useStore } from './store/store'
import type { Tool, ViewMode } from './model/types'
import { PlanView } from './plan/PlanView'
import { Inspector, deleteSelection, duplicateItem } from './ui/Inspector'
import { BudgetPanel, CatalogPanel, LevelsPanel, PaintPanel, ProjectPanel } from './ui/Panels'
import { Icon } from './ui/Icon'
import { walkKeys } from './three/Walker'
import { budget } from './model/budget'
import { formatMoney } from './model/units'
import { uid } from './model/factory'

const Scene3D = lazy(() => import('./three/Scene3D').then((m) => ({ default: m.Scene3D })))

const TOOLS: Array<{ id: Tool; label: string; icon: string; key: string }> = [
  { id: 'select', label: 'Select', icon: 'select', key: 'V' },
  { id: 'room', label: 'Room', icon: 'room', key: 'R' },
  { id: 'polyroom', label: 'Shape', icon: 'polyroom', key: 'O' },
  { id: 'wall', label: 'Wall', icon: 'wall', key: 'W' },
  { id: 'door', label: 'Door', icon: 'door', key: 'D' },
  { id: 'window', label: 'Window', icon: 'window', key: 'N' },
  { id: 'item', label: 'Furnish', icon: 'item', key: 'F' },
  { id: 'paint', label: 'Paint', icon: 'paint', key: 'P' },
  { id: 'measure', label: 'Measure', icon: 'measure', key: 'M' },
  { id: 'label', label: 'Text', icon: 'label', key: 'T' },
]

const VIEWS: Array<{ id: ViewMode; label: string; icon: string }> = [
  { id: 'plan', label: '2D', icon: 'plan' },
  { id: 'split', label: 'Split', icon: 'split' },
  { id: '3d', label: '3D', icon: 'cube' },
  { id: 'walk', label: 'Walk', icon: 'walk' },
]

type PanelId = 'inspector' | 'catalog' | 'paint' | 'levels' | 'budget' | 'project'
const PANELS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'inspector', label: 'Edit', icon: 'select' },
  { id: 'catalog', label: 'Catalog', icon: 'catalog' },
  { id: 'paint', label: 'Paint', icon: 'paint' },
  { id: 'levels', label: 'Levels', icon: 'levels' },
  { id: 'budget', label: 'Budget', icon: 'budget' },
  { id: 'project', label: 'Project', icon: 'project' },
]

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 820px)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 820px)')
    const on = () => setNarrow(mq.matches)
    mq?.addEventListener?.('change', on)
    return () => mq?.removeEventListener?.('change', on)
  }, [])
  return narrow
}

export default function App() {
  const view = useStore((s) => s.view)
  const tool = useStore((s) => s.tool)
  const panel = useStore((s) => s.panel)
  const narrow = useNarrow()
  const [help, setHelp] = useState(false)

  useShortcuts(() => setHelp((h) => !h))

  // On phones, split view stacks; start in plan to keep things roomy.
  useEffect(() => {
    if (narrow && useStore.getState().view === 'split') useStore.setState({ view: 'plan' })
  }, [narrow])

  const selectTool = (t: Tool) => {
    const s = useStore.getState()
    s.setTool(t)
    if (t === 'item') s.set({ panel: 'catalog' })
    if (t === 'paint') s.set({ panel: 'paint' })
    if ((t === 'door' || t === 'window') && s.view === '3d') s.setView('split')
    if (t !== 'select' && (s.view === '3d' || s.view === 'walk') && t !== 'paint') s.setView(narrow ? 'plan' : 'split')
  }

  const showPlan = view === 'plan' || view === 'split'
  const show3d = view === '3d' || view === 'split' || view === 'walk'

  return (
    <div className={`app view-${view}${panel ? ' has-panel' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
            <path d="M4 28V14L16 4l12 10v14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M12 28v-9h8v9" fill="var(--accent)" />
            <path d="M2 28h28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="brand-name">Threshold</span>
        </div>
        <ProjectTitle />
        <div className="topbar-group">
          <UndoRedo />
        </div>
        <nav className="view-switch" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={view === v.id ? 'is-on' : ''} aria-pressed={view === v.id} onClick={() => useStore.getState().setView(v.id)} title={`${v.label} view`}>
              <Icon name={v.icon} size={18} />
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <BudgetChip />
        <button type="button" className="icon-btn help-btn" onClick={() => setHelp(true)} aria-label="Help and shortcuts">
          <Icon name="help" />
        </button>
      </header>

      <nav className="toolrail" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={`tool${tool === t.id ? ' is-on' : ''}`} aria-pressed={tool === t.id} onClick={() => selectTool(t.id)} title={`${t.label} (${t.key})`}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="stage">
        {showPlan && (
          <div className="view-plan">
            <PlanView />
            <LevelChips />
            <ZoomButtons />
            {view === 'split' && <WalkerMarkerNote />}
          </div>
        )}
        {show3d && (
          <div className="view-3d">
            <Suspense fallback={<div className="loading3d">Building 3D view…</div>}>
              <Scene3D walk={view === 'walk'} />
            </Suspense>
            {view === 'walk' ? <WalkPad /> : <View3DBar />}
            {view !== 'walk' && view !== 'split' && <LevelChips />}
          </div>
        )}
      </main>

      <aside className="sidepanel" aria-label="Details">
        <div className="panel-tabs" role="tablist">
          {PANELS.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={panel === p.id} className={panel === p.id ? 'is-on' : ''} onClick={() => useStore.getState().set({ panel: panel === p.id && narrow ? null : p.id })}>
              <Icon name={p.icon} size={18} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        {panel && (
          <div className="panel-scroll">
            {panel === 'inspector' && <Inspector />}
            {panel === 'catalog' && <CatalogPanel />}
            {panel === 'paint' && <PaintPanel />}
            {panel === 'levels' && <LevelsPanel />}
            {panel === 'budget' && <BudgetPanel />}
            {panel === 'project' && <ProjectPanel />}
          </div>
        )}
      </aside>

      <Toast />
      {help && <HelpSheet onClose={() => setHelp(false)} />}
    </div>
  )
}

function ProjectTitle() {
  const name = useStore((s) => s.project.name)
  return (
    <button type="button" className="project-title" onClick={() => useStore.getState().set({ panel: 'project' })} title="Project settings">
      {name}
    </button>
  )
}

function UndoRedo() {
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  return (
    <>
      <button type="button" className="icon-btn" disabled={!canUndo} onClick={() => useStore.getState().undo()} aria-label="Undo" title="Undo (Ctrl+Z)">
        <Icon name="undo" />
      </button>
      <button type="button" className="icon-btn" disabled={!canRedo} onClick={() => useStore.getState().redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <Icon name="redo" />
      </button>
    </>
  )
}

function BudgetChip() {
  const project = useStore((s) => s.project)
  const total = budget(project).total
  return (
    <button type="button" className="budget-chip" onClick={() => useStore.getState().set({ panel: 'budget' })} title="Estimated cost">
      <span className="muted">Est.</span> {formatMoney(total)}
    </button>
  )
}

function LevelChips() {
  const levels = useStore((s) => s.project.levels)
  const levelId = useStore((s) => s.levelId)
  if (levels.length < 2) return null
  const sorted = [...levels].sort((a, b) => b.elevation - a.elevation)
  return (
    <div className="level-chips" role="tablist" aria-label="Floors">
      {sorted.map((l) => (
        <button key={l.id} type="button" role="tab" aria-selected={l.id === levelId} className={l.id === levelId ? 'is-on' : ''} onClick={() => useStore.getState().setLevel(l.id)}>
          {l.name}
        </button>
      ))}
    </div>
  )
}

function ZoomButtons() {
  const z = (k: string) => window.dispatchEvent(new CustomEvent('plan-zoom', { detail: k }))
  return (
    <div className="zoom-btns">
      <button type="button" className="icon-btn" onClick={() => z('in')} aria-label="Zoom in">
        <Icon name="plus" />
      </button>
      <button type="button" className="icon-btn" onClick={() => z('out')} aria-label="Zoom out">
        <Icon name="minus" />
      </button>
      <button type="button" className="icon-btn" onClick={() => z('fit')} aria-label="Fit to screen">
        <Icon name="fit" />
      </button>
    </div>
  )
}

function WalkerMarkerNote() {
  return null
}

function View3DBar() {
  const cutaway = useStore((s) => s.cutaway)
  const showRoof = useStore((s) => s.showRoof)
  const wallCut = useStore((s) => s.wallCut)
  const explode = useStore((s) => s.explode)
  const sunHour = useStore((s) => s.sunHour)
  const set = useStore.getState().set
  const hour = Math.floor(sunHour)
  const mins = Math.round((sunHour - hour) * 60)
  return (
    <div className="bar3d">
      <div className="bar3d-row">
        <button type="button" className={`pill${cutaway && !showRoof ? ' is-on' : ''}`} onClick={() => set({ cutaway: true, showRoof: false, explode: 0 })} title="See inside the current floor">
          <Icon name="eye" size={16} /> Inside
        </button>
        <button type="button" className={`pill${!cutaway && showRoof ? ' is-on' : ''}`} onClick={() => set({ cutaway: false, showRoof: true, wallCut: false })} title="Whole house with roof">
          <Icon name="roof" size={16} /> Outside
        </button>
        <button type="button" className={`pill${explode > 0 ? ' is-on' : ''}`} onClick={() => set(explode > 0 ? { explode: 0 } : { explode: 1, cutaway: false, showRoof: true, wallCut: false })} title="Pull the house apart to reach every part">
          <Icon name="explode" size={16} /> Explode
        </button>
        <button type="button" className={`pill${wallCut ? ' is-on' : ''}`} onClick={() => set({ wallCut: !wallCut })} title="Cut walls low to see furniture">
          <Icon name="lowwalls" size={16} /> Low walls
        </button>
        <button type="button" className="pill" onClick={() => set({ zoomRequest: useStore.getState().zoomRequest + 1 })} title="Reset camera">
          <Icon name="fit" size={16} /> Reset
        </button>
      </div>
      <div className="bar3d-row sliders">
        {explode > 0 && (
          <label className="slider" htmlFor="explode-amt">
            <span>Spread</span>
            <input id="explode-amt" type="range" min={0.1} max={1.6} step={0.05} value={explode} onChange={(e) => set({ explode: Number(e.target.value) })} />
          </label>
        )}
        <label className="slider" htmlFor="sun-hour">
          <Icon name="sun" size={16} />
          <input id="sun-hour" type="range" min={6} max={20} step={0.25} value={sunHour} onChange={(e) => set({ sunHour: Number(e.target.value) })} />
          <span className="num">
            {((hour + 11) % 12) + 1}:{String(mins).padStart(2, '0')} {hour < 12 ? 'am' : 'pm'}
          </span>
        </label>
      </div>
    </div>
  )
}

function WalkPad() {
  const hold = (k: keyof typeof walkKeys) => ({
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      walkKeys[k] = true
    },
    onPointerUp: () => (walkKeys[k] = false),
    onPointerCancel: () => (walkKeys[k] = false),
    onPointerLeave: () => (walkKeys[k] = false),
  })
  return (
    <>
      <div className="walk-hint">Drag to look · W A S D or arrows to walk · Shift to run · doors are open</div>
      <div className="walkpad" aria-label="Walk controls">
        <button type="button" className="wp-up" aria-label="Walk forward" {...hold('f')}>
          ▲
        </button>
        <button type="button" className="wp-left" aria-label="Turn left" {...hold('turnL')}>
          ◀
        </button>
        <button type="button" className="wp-down" aria-label="Walk back" {...hold('b')}>
          ▼
        </button>
        <button type="button" className="wp-right" aria-label="Turn right" {...hold('turnR')}>
          ▶
        </button>
      </div>
    </>
  )
}

function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div className={`toast${visible ? ' is-on' : ''}`} role="status" aria-live="polite">
      {toast?.text}
    </div>
  )
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['V', 'Select and move things'],
    ['R', 'Draw a rectangular room'],
    ['O', 'Draw a room of any shape'],
    ['W', 'Draw walls (type a number for exact length)'],
    ['D / N', 'Add doors / windows'],
    ['F', 'Furniture catalog'],
    ['P', 'Paint walls, floors, furniture'],
    ['M', 'Measure'],
    ['T', 'Text label'],
    ['Q / E', 'Rotate selected item 15° (Shift: 90°)'],
    ['Arrows', 'Nudge selected item (Shift: further)'],
    ['Ctrl+D', 'Duplicate'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste furniture'],
    ['Delete', 'Delete selected'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['1 2 3 4', '2D · Split · 3D · Walk'],
    ['Esc', 'Stop drawing / clear selection'],
  ]
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="help-title">How Threshold works</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close help">
            <Icon name="close" />
          </button>
        </header>
        <ol className="help-steps">
          <li>
            <strong>Draw rooms.</strong> Pick Room and drag a rectangle. Rooms next to each other share walls.
          </li>
          <li>
            <strong>Add doors and windows.</strong> Pick Door or Window and click a wall.
          </li>
          <li>
            <strong>Furnish.</strong> Pick an item in the catalog and click the plan. It backs onto the nearest wall.
          </li>
          <li>
            <strong>Finish.</strong> Paint walls, pick floors, set roofs and floors in Levels.
          </li>
          <li>
            <strong>See it.</strong> Switch to 3D, explode the house apart, or walk through it.
          </li>
        </ol>
        <table className="keys">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function useShortcuts(toggleHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const s = useStore.getState()
      if (s.view === 'walk' && /^(w|a|s|d|arrow)/i.test(e.key)) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      const sel = s.selection
      const level = activeLevel(s)
      const item = sel?.kind === 'item' ? level.items.find((i) => i.id === sel.id) : undefined
      if (mod && key === 'd' && item) {
        e.preventDefault()
        duplicateItem(item)
        return
      }
      if (mod && key === 'c' && item) {
        useStore.setState({ clipboard: item })
        s.notify('Copied')
        return
      }
      if (mod && key === 'v' && s.clipboard) {
        const c = { ...s.clipboard, id: uid('i'), x: s.clipboard.x + 40, y: s.clipboard.y + 40 }
        s.applyLevel((l) => ({ ...l, items: [...l.items, c] }))
        s.select({ kind: 'item', id: c.id })
        useStore.setState({ clipboard: c })
        return
      }
      if (mod) return
      if ((key === 'delete' || key === 'backspace') && sel) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (item && (key === 'q' || key === 'e')) {
        const step = e.shiftKey ? 90 : 15
        const rot = (item.rotation + (key === 'e' ? step : -step) + 360) % 360
        s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, rotation: rot } : i)) }))
        return
      }
      if (item && key.startsWith('arrow') && s.view !== 'walk') {
        e.preventDefault()
        const d = e.shiftKey ? 30 : 2.54
        const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
        const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
        s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (i.id === item.id ? { ...i, x: i.x + dx, y: i.y + dy } : i)) }))
        return
      }
      const toolKeys: Record<string, Tool> = { v: 'select', r: 'room', o: 'polyroom', w: 'wall', d: 'door', n: 'window', f: 'item', p: 'paint', m: 'measure', t: 'label' }
      if (toolKeys[key]) {
        s.setTool(toolKeys[key])
        if (key === 'f') s.set({ panel: 'catalog' })
        if (key === 'p') s.set({ panel: 'paint' })
        return
      }
      const views: Record<string, ViewMode> = { '1': 'plan', '2': 'split', '3': '3d', '4': 'walk' }
      if (views[key]) return s.setView(views[key])
      if (key === '?') toggleHelp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleHelp])
}
