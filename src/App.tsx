import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { activeLevel, selectedItemIds, syncFromCloud, useStore, type PartKind } from './store/store'
import { BriefForm } from './ui/BriefForm'
import { PaywallSheet, PlanBadge, PlanTag } from './ui/Paywall'
import { Presentation } from './ui/Presentation'
import { decodeShared, sharedCode } from './store/share'
import { uid } from './model/factory'
import { track } from './product/analytics'
import { watchOnboarding } from './product/onboarding'
import { can, requireFeature, showTrialEndedOnce, useEntitlements } from './product/entitlements'
import { LIBRARY, buildLibraryPlan } from './model/library'
import { canStartNewDesign } from './product/gates'
import { useAudience, type Audience } from './product/audience'
import { captureInvite } from './product/invite'
import { productConfig } from './product/config'
import { allows } from './product/plans'
import { DEFAULT_LATITUDE, MONTHS, clockLabel, dateLabel, dayOfYear, monthOfDay, sunTimes, todayOfYear } from './model/sun'
import { SURROUNDINGS, type Surroundings } from './model/landscape'
import type { Tool, ViewMode } from './model/types'
import { PlanView } from './plan/PlanView'
import { Inspector, deleteItems, deleteSelection, duplicateItems } from './ui/Inspector'
import { BudgetPanel, CatalogPanel, LevelsPanel, PaintPanel, ProjectPanel } from './ui/Panels'
import { Icon } from './ui/Icon'
import { AssistantPanel } from './assistant/AssistantPanel'
import { Segmented, Toggle } from './ui/controls'
import { walkKeys } from './three/walkKeys'
import { budget } from './model/budget'
import { formatMoney } from './model/units'
import { buildTemplate } from './model/templates'

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

type PanelId = 'inspector' | 'assistant' | 'catalog' | 'paint' | 'levels' | 'budget' | 'project'
const PANELS: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: 'inspector', label: 'Edit', icon: 'select' },
  { id: 'assistant', label: 'Ask', icon: 'magic' },
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
  const presenting = useStore((s) => s.presenting)
  useEffect(() => watchOnboarding(), [])
  // A license activated in this visit starts syncing designs straight away.
  useEffect(
    () =>
      useEntitlements.subscribe((s, prev) => {
        if (s.source === 'license' && prev.source !== 'license' && prev.ready) void syncFromCloud()
      }),
    [],
  )
  useEffect(() => {
    const invite = captureInvite()
    if (invite && productConfig.inviteOffer) useStore.getState().notify(`Invite saved: ${productConfig.inviteOffer} when you choose a plan.`)
    void (async () => {
      const ent = useEntitlements.getState()
      await ent.init()
      void syncFromCloud()
      // Back from a hosted checkout: ?checkout_session=cs_... (Stripe's {CHECKOUT_SESSION_ID}).
      // Opened from a share link: load the design as this person's own copy.
      const code = sharedCode()
      if (code) {
        try {
          const { project: shared, present, brand } = await decodeShared(code)
          useStore.getState().loadProject({ ...shared, id: uid('prj'), name: shared.name.endsWith('(shared)') ? shared.name : `${shared.name} (shared)`, updatedAt: Date.now() })
          if (present) {
            useStore.setState({ presenting: true, clientView: { brand } })
            track('design_created', { from: 'client-link' })
          } else {
            useStore.getState().setView('split')
            useStore.getState().notify('Opened a shared design. This is your own copy: change anything.')
            track('design_created', { from: 'share' })
          }
        } catch {
          useStore.getState().notify('That share link is incomplete. Ask for it again.')
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      // Opened from a plan library page: #library=<id>.
      const libId = window.location.hash.match(/^#library=([a-z-]+)$/)?.[1]
      if (libId) {
        const l = LIBRARY.find((x) => x.id === libId)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        if (l && l.pro && !can('plan-library')) useEntitlements.getState().openPaywall('plan-library')
        else if (l && canStartNewDesign(useStore.getState().project.id)) {
          useStore.getState().loadProject(buildLibraryPlan(l.id))
          useStore.getState().setView(window.matchMedia?.('(max-width: 820px)').matches ? '3d' : 'split')
          useStore.getState().notify(`Opened the ${l.name}. It is yours to change.`)
          track('design_created', { from: `plan-page-${l.id}` })
        }
      }
      const params = new URLSearchParams(window.location.search)
      const session = params.get('checkout_session') ?? params.get('session_id')
      if (!session && !useStore.getState().presenting) showTrialEndedOnce()
      if (session) {
        const r = await ent.claimCheckout(session)
        useStore.getState().notify(r.message)
        params.delete('checkout_session')
        params.delete('session_id')
        const q = params.toString()
        window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash)
      }
    })()
  }, [])
  const [welcome, setWelcome] = useState(() => {
    if (sharedCode() || window.location.hash.startsWith('#library=')) return false
    try {
      return !localStorage.getItem('threshold:welcomed') && !localStorage.getItem('threshold:last')
    } catch {
      return false
    }
  })

  useShortcuts(() => setHelp((h) => !h))
  const cloudLoaded = useStore((s) => s.cloudLoaded)
  useEffect(() => {
    if (cloudLoaded) setWelcome(false)
  }, [cloudLoaded])

  // On phones, split view stacks; start in plan to keep things roomy.
  useEffect(() => {
    if (narrow && useStore.getState().view === 'split') useStore.setState({ view: 'plan' })
    if (narrow) useStore.setState({ panel: null })
  }, [narrow])

  // On phones the tool rail scrolls sideways; a fade marks the side with more tools.
  const railRef = useRef<HTMLElement>(null)
  const [railEdge, setRailEdge] = useState({ start: true, end: true })
  const updateRailEdge = () => {
    const el = railRef.current
    if (!el) return
    const start = el.scrollLeft <= 2
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2
    setRailEdge((e) => (e.start === start && e.end === end ? e : { start, end }))
  }
  useEffect(() => {
    updateRailEdge()
    window.addEventListener('resize', updateRailEdge)
    return () => window.removeEventListener('resize', updateRailEdge)
  }, [])

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

  if (presenting)
    return (
      <>
        <Presentation
          onExit={() => {
            if (useStore.getState().clientView) {
              useStore.setState({ presenting: false, clientView: null })
              useStore.getState().setView(narrow ? '3d' : 'split')
              useStore.getState().notify('This copy of the home is yours to explore and change. Nothing you change reaches the designer.')
            } else useStore.setState({ presenting: false })
          }}
        />
        <Toast />
        <PaywallSheet />
      </>
    )
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
        <PlanBadge />
        <button type="button" className="icon-btn help-btn" onClick={() => setHelp(true)} aria-label="Help and shortcuts">
          <Icon name="help" />
        </button>
      </header>

      <nav className={`toolrail${railEdge.start ? '' : ' more-before'}${railEdge.end ? '' : ' more-after'}`} aria-label="Tools" ref={railRef} onScroll={updateRailEdge}>
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
            {view === 'walk' && (
              <div className="minimap" aria-label="Map: tap to jump there">
                <PlanView minimap />
              </div>
            )}
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
            {panel === 'assistant' && <AssistantPanel />}
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
      <PaywallSheet />
      {welcome && (
        <WelcomeSheet
          onClose={() => {
            setWelcome(false)
            try {
              localStorage.setItem('threshold:welcomed', '1')
            } catch {
              /* storage unavailable */
            }
          }}
        />
      )}
    </div>
  )
}

function ProjectTitle() {
  const name = useStore((s) => s.project.name)
  const status = useStore((s) => s.cloudStatus)
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved to your account' : status === 'error' ? 'Saved in this browser only' : 'Saved in this browser'
  return (
    <button type="button" className="project-title" onClick={() => useStore.getState().set({ panel: 'project' })} title="Project settings">
      <span className="project-name">{name}</span>
      <span className={`save-state is-${status}`}>{label}</span>
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

function ViewOptions() {
  const showDims = useStore((s) => s.showDims)
  const showGrid = useStore((s) => s.showGrid)
  const snap = useStore((s) => s.snap)
  const showOther = useStore((s) => s.showOtherLevels)
  const showElectrical = useStore((s) => s.showElectrical)
  const [open, setOpen] = useState(false)
  const set = useStore.getState().set
  return (
    <div className="view-options">
      <button type="button" className={`icon-btn${open ? ' is-on' : ''}`} onClick={() => setOpen((o) => !o)} aria-label="Plan display options" aria-expanded={open}>
        <Icon name="eye" />
      </button>
      {open && (
        <div className="view-options-pop" role="group" aria-label="Plan display options">
          <Toggle id="opt-dims" checked={showDims} onChange={(v) => set({ showDims: v })} label="Dimensions" />
          <Toggle id="opt-grid" checked={showGrid} onChange={(v) => set({ showGrid: v })} label="Grid" />
          <Toggle id="opt-snap" checked={snap} onChange={(v) => set({ snap: v })} label="Snap to grid and corners" />
          <Toggle id="opt-other" checked={showOther} onChange={(v) => set({ showOtherLevels: v })} label="Show floor below" />
          <Toggle id="opt-elec" checked={showElectrical} onChange={(v) => set({ showElectrical: v })} label="Electrical (outlets, switches, alarms)" />
        </div>
      )}
    </div>
  )
}

function ZoomButtons() {
  const z = (k: string) => window.dispatchEvent(new CustomEvent('plan-zoom', { detail: k }))
  return (
    <div className="zoom-btns">
      <ViewOptions />
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

const PARTS: Array<[PartKind, string]> = [
  ['roof', 'Roof'],
  ['walls', 'Walls'],
  ['floors', 'Floors'],
  ['furniture', 'Furniture'],
]

type Mode3D = 'inside' | 'outside' | 'explode' | 'section'

function View3DBar() {
  const cutaway = useStore((s) => s.cutaway)
  const showRoof = useStore((s) => s.showRoof)
  const wallCut = useStore((s) => s.wallCut)
  const explode = useStore((s) => s.explode)
  const lowQuality = useStore((s) => s.lowQuality)
  const hiddenParts = useStore((s) => s.hiddenParts)
  const section = useStore((s) => s.section)
  const surroundings = useStore((s) => (s.project.site.showGround ? s.project.site.surroundings ?? 'suburb' : 'plain'))
  const plan = useEntitlements((s) => s.plan)
  const set = useStore.getState().set
  const seq = () => useStore.getState().viewFrom.seq + 1
  const mode: Mode3D = explode > 0 ? 'explode' : section.on ? 'section' : cutaway && !showRoof ? 'inside' : 'outside'
  const pick = (m: Mode3D) => {
    const off = { explode: 0, section: { ...section, on: false } }
    if (m === 'inside') set({ ...off, cutaway: true, showRoof: false })
    else if (m === 'outside') set({ ...off, cutaway: false, showRoof: true, wallCut: false })
    else if (m === 'explode') set({ ...off, explode: 1, cutaway: false, showRoof: true, wallCut: false })
    else set({ explode: 0, section: { ...section, on: true }, cutaway: false, showRoof: true, viewFrom: { dir: section.axis === 'z' ? 'S' : 'E', seq: seq() } })
  }
  const MODES: Array<[Mode3D, string, string, string]> = [
    ['inside', 'Inside', 'eye', 'See inside the current floor'],
    ['outside', 'Outside', 'roof', 'The whole house with its roof'],
    ['explode', 'Explode', 'explode', 'Pull the house apart to reach every part'],
    ['section', 'Section', 'section', 'Slice through the house to see every floor from the side'],
  ]
  return (
    <div className="bar3d">
      <div className="bar3d-main">
        <div className="mode-seg" role="radiogroup" aria-label="3D view">
          {MODES.map(([m, label, icon, title]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-on' : ''} onClick={() => pick(m)} title={title}>
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
        {mode === 'inside' && (
          <div className="ctx-row">
            <button type="button" className={`chip${wallCut ? ' is-on' : ''}`} aria-pressed={wallCut} onClick={() => set({ wallCut: !wallCut })} title="Cut walls low to see furniture">
              <Icon name="lowwalls" size={15} /> Low walls
            </button>
          </div>
        )}
        {mode === 'explode' && (
          <div className="ctx-row">
            <label className="ctx-slider" htmlFor="explode-amt">
              <span>Spread</span>
              <input id="explode-amt" type="range" min={0.1} max={1.6} step={0.05} value={explode} onChange={(e) => set({ explode: Number(e.target.value) })} />
            </label>
            <div className="ctx-group" role="group" aria-label="Parts to show">
              {PARTS.map(([k, label]) => {
                const on = !hiddenParts.includes(k)
                return (
                  <button key={k} type="button" className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => set({ hiddenParts: on ? [...hiddenParts, k] : hiddenParts.filter((x) => x !== k) })}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {mode === 'section' && (
          <div className="ctx-row" role="group" aria-label="Section cut">
            <div className="ctx-group">
              <button type="button" className={`chip${section.axis === 'z' ? ' is-on' : ''}`} aria-pressed={section.axis === 'z'} onClick={() => set({ section: { ...section, axis: 'z' }, viewFrom: { dir: 'S', seq: seq() } })}>
                Front to back
              </button>
              <button type="button" className={`chip${section.axis === 'x' ? ' is-on' : ''}`} aria-pressed={section.axis === 'x'} onClick={() => set({ section: { ...section, axis: 'x' }, viewFrom: { dir: 'E', seq: seq() } })}>
                Side to side
              </button>
            </div>
            <label className="ctx-slider" htmlFor="section-at">
              <span>Cut at</span>
              <input id="section-at" type="range" min={0.02} max={0.98} step={0.01} value={section.at} onChange={(e) => set({ section: { ...section, at: Number(e.target.value) } })} aria-label="Cut position" />
            </label>
            <button type="button" className={`chip${section.flip ? ' is-on' : ''}`} aria-pressed={section.flip} onClick={() => set({ section: { ...section, flip: !section.flip } })}>
              Flip
            </button>
          </div>
        )}
      </div>

      <div className="ctl-col" role="toolbar" aria-label="3D view tools" aria-orientation="vertical">
        <button type="button" className="ctl-btn" onClick={() => set({ zoomRequest: useStore.getState().zoomRequest + 1, viewFrom: { dir: 'corner', seq: useStore.getState().viewFrom.seq } })} title="Reset the camera">
          <Icon name="fit" size={18} />
          <span>Reset</span>
        </button>
        <label className="ctl-btn" htmlFor="view-from" title="Look at the house from the street, a corner, above or one side">
          <Icon name="camera" size={18} />
          <span>View</span>
          <select
            id="view-from"
            value=""
            onChange={(e) => {
              const dir = e.target.value as 'corner' | 'top' | 'N' | 'E' | 'S' | 'W' | 'street'
              if (dir === 'street') set({ viewFrom: { dir, seq: seq() }, cutaway: false, showRoof: true, wallCut: false, explode: 0 })
              else if (dir) set({ viewFrom: { dir, seq: seq() } })
            }}
            aria-label="View from"
          >
            <option value="">View from…</option>
            <option value="street">Street (eye level)</option>
            <option value="corner">Corner</option>
            <option value="top">Top</option>
            <option value="S">Front</option>
            <option value="E">Right side</option>
            <option value="N">Back (garden side)</option>
            <option value="W">Left side</option>
          </select>
        </label>
        <label className="ctl-btn" htmlFor="surroundings" title="What surrounds the house: a street, a garden, the countryside or nothing">
          <Icon name="tree" size={18} />
          <span>Setting</span>
          <select
            id="surroundings"
            value={surroundings}
            onChange={(e) => {
              const v = e.target.value as Surroundings
              if ((v === 'garden' || v === 'country') && !requireFeature('surroundings')) return
              useStore.getState().apply((p) => ({ ...p, site: { ...p.site, surroundings: v, showGround: true } }))
            }}
            aria-label="Surroundings"
          >
            {SURROUNDINGS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {(o.id === 'garden' || o.id === 'country') && !allows(plan, 'surroundings') ? ' (Pro)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`ctl-btn${lowQuality ? ' is-on' : ''}`}
          aria-pressed={lowQuality}
          onClick={() => {
            const v = !lowQuality
            set({ lowQuality: v })
            try {
              localStorage.setItem('threshold:lowq', v ? '1' : '0')
            } catch {
              /* storage unavailable */
            }
          }}
          title="Faster 3D for slower devices: no shadows, lower resolution"
        >
          <Icon name="bolt" size={18} />
          <span>Fast 3D</span>
        </button>
        <button
          type="button"
          className="ctl-btn"
          onClick={() => {
            if (!requireFeature('presentation')) return
            useStore.setState({ presenting: true })
          }}
          title="Full-screen guided tour to show a client (Studio)"
        >
          <Icon name="present" size={18} />
          <span>Present</span>
          {!allows(plan, 'presentation') && <i className="ctl-tag">Studio</i>}
        </button>
      </div>

      <div className="sun-dock">
        <SunControls />
      </div>
    </div>
  )
}

/** Time of day, day of the year, and playing a whole day (sun study, Pro). */
function SunControls() {
  const sunHour = useStore((s) => s.sunHour)
  const sunDay = useStore((s) => s.sunDay)
  const latitude = useStore((s) => s.project.site.latitude ?? DEFAULT_LATITUDE)
  const plan = useEntitlements((s) => s.plan)
  const [playing, setPlaying] = useState(false)
  const study = allows(plan, 'sun-study')
  const times = sunTimes(sunDay, latitude)
  const today = todayOfYear()

  useEffect(() => {
    if (!playing) return
    const t = sunTimes(useStore.getState().sunDay, latitude)
    const from = t ? Math.max(4, t.rise - 0.4) : 4
    const to = t ? Math.min(23, t.set + 0.9) : 23
    let h = useStore.getState().sunHour
    if (h < from || h >= to - 0.1) h = from
    let last = performance.now()
    let raf = 0
    // The whole day in about 16 seconds.
    const tick = (now: number) => {
      h += ((now - last) / 1000) * ((to - from) / 16)
      last = now
      if (h >= to) {
        useStore.setState({ sunHour: to })
        setPlaying(false)
        return
      }
      useStore.setState({ sunHour: h })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, latitude])

  return (
    <>
      <label className="sun-time" htmlFor="sun-hour" title={times ? `Sunrise ${clockLabel(times.rise)}, sunset ${clockLabel(times.set)} (solar time)` : undefined}>
        <Icon name="sun" size={17} />
        <input
          id="sun-hour"
          type="range"
          min={4}
          max={23}
          step={0.25}
          value={sunHour}
          onChange={(e) => {
            setPlaying(false)
            useStore.setState({ sunHour: Number(e.target.value) })
          }}
          aria-label="Time of day"
        />
        <span className="num">{clockLabel(sunHour)}</span>
      </label>
      <label className="sun-day" htmlFor="sun-day" title={`Day of the year for the sun (today is ${dateLabel(today)})`}>
        <select
          id="sun-day"
          value={sunDay === today ? 'today' : String(monthOfDay(sunDay))}
          onChange={(e) => {
            const v = e.target.value
            if (v !== 'today' && !requireFeature('sun-study')) return
            useStore.setState({ sunDay: v === 'today' ? today : dayOfYear(Number(v), 21) })
          }}
          aria-label="Day of the year"
        >
          <option value="today">Today</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m} 21{study ? '' : ' (Pro)'}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={`sun-play${playing ? ' is-on' : ''}`}
        aria-pressed={playing}
        aria-label={playing ? 'Pause' : 'Play day'}
        onClick={() => {
          if (!playing && !requireFeature('sun-study')) return
          setPlaying(!playing)
        }}
        title="Play the day from sunrise to sunset and watch the light move through the rooms"
      >
        <Icon name={playing ? 'pause' : 'play'} size={15} />
        <span className="sun-play-label">{playing ? 'Pause' : 'Play day'}</span>
        {!study && <PlanTag plan="pro" />}
      </button>
    </>
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
  // The instructions step aside after a few seconds; the pad stays.
  const [quiet, setQuiet] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQuiet(true), 8000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <div className={`walk-hint${quiet ? ' is-quiet' : ''}`}>Drag to look · W A S D or arrows to walk · Shift to run · doors are open</div>
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
    const t = setTimeout(() => setVisible(false), toast.action ? 6000 : 2200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div className={`toast${visible ? ' is-on' : ''}${toast?.action ? ' has-action' : ''}`} role="status" aria-live="polite">
      {toast?.text}
      {toast?.action && visible && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            setVisible(false)
            toast.action!.run()
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}

function WelcomeSheet({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'choose' | 'brief'>('choose')
  const audience = useAudience((s) => s.audience)
  const setAudience = useAudience((s) => s.setAudience)
  const phone = () => window.matchMedia?.('(max-width: 820px)').matches
  const start = (id: string | null) => {
    if (id) {
      const p = buildTemplate(id)
      useStore.getState().loadProject(p)
    }
    if (id === 'blank') useStore.setState({ tool: 'room', view: phone() ? 'plan' : 'split' })
    onClose()
  }
  return (
    <div className="sheet-backdrop">
      <div className="sheet welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <span className="eyebrow">Threshold</span>
        {step === 'brief' ? (
          <>
            <h2 id="welcome-title">Tell us what you need</h2>
            <p className="muted">You get a furnished starting plan. Change any part of it after.</p>
            <BriefForm
              onMake={(p) => {
                useStore.getState().loadProject(p)
                useStore.setState({ view: phone() ? 'plan' : 'split' })
                onClose()
              }}
            />
            <button type="button" className="btn" onClick={() => setStep('choose')}>
              Back
            </button>
          </>
        ) : (
          <>
            <h2 id="welcome-title">Design your home, every part of it.</h2>
            <p className="muted">Draw rooms, add doors and windows, furnish, choose finishes, then see it in 3D or walk through it.</p>
            <span className="field-label welcome-who">I am designing</span>
            <Segmented<Audience>
              label="I am designing"
              value={audience ?? 'home'}
              onChange={(a) => setAudience(a)}
              options={[
                { value: 'home', label: 'A home for me' },
                { value: 'pro', label: 'Homes for clients' },
              ]}
            />
            <div className="welcome-grid">
              <button type="button" className="welcome-card is-primary" onClick={() => start(null)}>
                <i className="welcome-icon" aria-hidden>
                  <Icon name="cube" size={20} />
                </i>
                <strong>Explore the example home</strong>
                <span>Two storeys, 3 bedrooms, fully furnished. Change anything.</span>
              </button>
              <button type="button" className="welcome-card" onClick={() => setStep('brief')}>
                <i className="welcome-icon" aria-hidden>
                  <Icon name="magic" size={20} />
                </i>
                <strong>Plan from your needs</strong>
                <span>Pick bedrooms, bathrooms, floors and garage. Get a furnished plan.</span>
              </button>
              <button
                type="button"
                className="welcome-card"
                onClick={() => {
                  useStore.setState({ panel: 'project' })
                  onClose()
                  // The panel mounts after the sheet closes; try until the library is on the page.
                  // Scroll the side panel only, never the page.
                  const reveal = () => {
                    const el = document.querySelector<HTMLElement>('.library-field')
                    const box = el?.closest<HTMLElement>('.panel-scroll')
                    if (el && box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8
                  }
                  for (const ms of [150, 450, 900]) setTimeout(reveal, ms)
                }}
              >
                <i className="welcome-icon" aria-hidden>
                  <Icon name="catalog" size={20} />
                </i>
                <strong>Pick a ready-made home</strong>
                <span>Cottages, ranches, farmhouses and family homes, furnished and styled.</span>
              </button>
              <button type="button" className="welcome-card" onClick={() => start('blank')}>
                <i className="welcome-icon" aria-hidden>
                  <Icon name="room" size={20} />
                </i>
                <strong>Start from scratch</strong>
                <span>Empty plot. The Room tool is ready: drag to draw your first room.</span>
              </button>
            </div>
            <p className="tip">Your work saves automatically. The ? button explains every tool.</p>
          </>
        )}
      </div>
    </div>
  )
}

/** "Q / E" or "Shift+click" as separate keys: alternatives joined by "or", keys held together by "+". */
function Keys({ combo }: { combo: string }) {
  return (
    <span className="key-combo">
      {combo.split(' / ').map((alt, i) => (
        <span key={i} className="key-alt">
          {i > 0 && <span className="key-sep">or</span>}
          {alt.split('+').map((key, j) => (
            <span key={j} className="key-alt">
              {j > 0 && <span className="key-sep">+</span>}
              <kbd>{key}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

// Reading comfort: remembered per device (a personal preference, not part of the design).
type Comfort = { size: 1 | 1.12 | 1.25; spacing: boolean; font?: 'hyperlegible' | 'lexend' }

function loadComfort(): Comfort {
  try {
    const raw = localStorage.getItem('threshold:comfort')
    if (raw) return { size: 1, spacing: false, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return { size: 1, spacing: false }
}

function applyComfort(c: Comfort) {
  const root = document.documentElement
  root.style.setProperty('--ui-zoom', String(c.size))
  root.classList.toggle('comfort-spacing', c.spacing)
  root.classList.toggle('font-lexend', c.font === 'lexend')
  if (c.font === 'lexend' && !document.getElementById('font-lexend')) {
    // Loaded only when chosen. Falls back to the standard font when offline.
    const link = document.createElement('link')
    link.id = 'font-lexend'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap'
    document.head.appendChild(link)
  }
}

applyComfort(loadComfort())

function ComfortSettings() {
  const [c, setC] = useState(loadComfort)
  const update = (patch: Partial<Comfort>) => {
    const next = { ...c, ...patch }
    setC(next)
    applyComfort(next)
    try {
      localStorage.setItem('threshold:comfort', JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <section className="comfort">
      <h3>Reading comfort</h3>
      <div className="segmented" role="radiogroup" aria-label="Text size">
        {([
          [1, 'Text: normal'],
          [1.12, 'Large'],
          [1.25, 'Larger'],
        ] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={c.size === v} className={c.size === v ? 'is-on' : ''} onClick={() => update({ size: v })}>
            {label}
          </button>
        ))}
      </div>
      <div className="segmented" role="radiogroup" aria-label="Font">
        {([
          ['hyperlegible', 'Font: Hyperlegible'],
          ['lexend', 'Lexend'],
        ] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={(c.font ?? 'hyperlegible') === v} className={(c.font ?? 'hyperlegible') === v ? 'is-on' : ''} onClick={() => update({ font: v })}>
            {label}
          </button>
        ))}
      </div>
      <Toggle id="comfort-spacing" checked={c.spacing} onChange={(v) => update({ spacing: v })} label="Extra space between letters, words and lines" />
    </section>
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
    ['Shift+click / Shift+drag', 'Select several pieces of furniture'],
    ['Ctrl+A', 'Select all furniture on this floor'],
    ['Ctrl+D', 'Duplicate'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste furniture'],
    ['Delete', 'Delete selected'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['1 2 3 4', '2D · Split · 3D · Walk'],
    ['Double-click (3D)', 'Zoom in on that spot'],
    ['Drag furniture (3D)', 'Move it across the floor'],
    ['Right-click / long-press', 'Quick actions for what is under the pointer'],
    ['Double-click an edge pill', 'Add a corner to a room'],
    ['Click a dimension', 'Type a new wall length'],
    ['G', 'Grid on / off'],
    ['Alt (while dragging)', 'No snapping / no wall backing'],
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
        <ComfortSettings />
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
                  <Keys combo={k} />
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
      const ids = selectedItemIds(s)
      const items = level.items.filter((i) => ids.includes(i.id))
      if (mod && key === 'd' && items.length) {
        e.preventDefault()
        duplicateItems(items)
        return
      }
      if (mod && key === 'a' && s.tool === 'select') {
        e.preventDefault()
        const all = level.items.map((i) => i.id)
        if (all.length) useStore.setState({ selection: { kind: 'item', id: all[0] }, multi: all.length > 1 ? all : [], panel: 'inspector' })
        return
      }
      if (mod && key === 'c' && items.length) {
        useStore.setState({ clipboard: items })
        s.notify(items.length > 1 ? `Copied ${items.length} items` : 'Copied')
        return
      }
      if (mod && key === 'v' && s.clipboard?.length) {
        const copies = s.clipboard.map((c) => ({ ...c, id: uid('i'), x: c.x + 40, y: c.y + 40, locked: false }))
        s.applyLevel((l) => ({ ...l, items: [...l.items, ...copies] }))
        if (copies.length === 1) s.select({ kind: 'item', id: copies[0].id })
        else useStore.setState({ selection: { kind: 'item', id: copies[0].id }, multi: copies.map((c) => c.id) })
        useStore.setState({ clipboard: copies })
        return
      }
      if (mod) return
      if ((key === 'delete' || key === 'backspace') && (sel || ids.length)) {
        e.preventDefault()
        if (ids.length > 1) deleteItems(ids)
        else deleteSelection()
        return
      }
      if (items.length && (key === 'q' || key === 'e')) {
        const step = (e.shiftKey ? 90 : 15) * (key === 'e' ? 1 : -1)
        s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) ? { ...i, rotation: (i.rotation + step + 360) % 360 } : i)) }))
        return
      }
      if (items.length && key.startsWith('arrow') && s.view !== 'walk') {
        e.preventDefault()
        const d = e.shiftKey ? 30 : 2.54
        const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
        const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
        s.applyLevel((l) => ({ ...l, items: l.items.map((i) => (ids.includes(i.id) && !i.locked ? { ...i, x: i.x + dx, y: i.y + dy } : i)) }))
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
      if (key === 'g') return s.set({ showGrid: !s.showGrid })
      if (key === '?') toggleHelp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleHelp])
}
