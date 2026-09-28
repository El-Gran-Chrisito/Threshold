import { useEffect, useMemo, useRef, useState } from 'react'
import { activeLevel, addLevelAbove, addLevelBelow, useStore } from '../store/store'
import { CATEGORIES, searchCatalog, type Category } from '../model/catalog'
import { FLOORS, floorMaterial, PAINTS, ROOF_SWATCHES } from '../model/materials'
import { applyHomeStyle, HOME_STYLES } from '../model/styles'
import { ItemSymbol } from '../plan/symbols'
import { formatLength, formatMoney } from '../model/units'
import { ConfirmButton, Field, FinishChips, LengthInput, NumberInput, Segmented, Swatches, Toggle } from './controls'
import { Icon } from './Icon'
import type { Level, Lot, Project, RoofStyle } from '../model/types'
import { budget } from '../model/budget'
import { ROOF_MATERIALS, roofMaterialOf } from '../model/roof'
import { BriefForm } from './BriefForm'
import { PlanTag } from './Paywall'
import { can, requireFeature, useEntitlements } from '../product/entitlements'
import { canStartNewDesign, watermarked } from '../product/gates'
import { allows, FREE_LIMITS } from '../product/plans'
import { track } from '../product/analytics'
import { brandForLink, readLogo, useBrand } from '../product/brand'
import { defaultLot } from '../model/site'
import { SURROUNDINGS } from '../model/landscape'
import { TAKEOFF_GROUPS, takeoff, takeoffCsv, takeoffText } from '../model/takeoff'
import { shopConfig, shopUrl } from '../product/shop'
import { productConfig } from '../product/config'
import { TEMPLATES, buildTemplate } from '../model/templates'
import { LIBRARY, buildLibraryPlan, libraryBlurb } from '../model/library'
import { MiniPlan } from './MiniPlan'
import { deleteSaved, listSaved, loadSaved, normalizeProject, saveProject } from '../store/persistence'
import { uid } from '../model/factory'
import { dataUrlToBlob, saveFile, slug } from '../store/files'
import { canShareLinks, shareLink } from '../store/share'
import { cloudDelete, cloudList, cloudLoad } from '../store/cloud'
import { planPng } from '../plan/exportPlan'
import { planSetPdf } from '../plan/planSet'
import { capture3dViews } from '../three/captureViews'
import { exportGlb } from '../three/exportModel'
import { readImage, useUnderlay } from '../store/underlay'
import { levelBounds } from '../model/ops'

// ---------------------------------------------------------------------------
// Catalog

export function CatalogPanel() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const placeType = useStore((s) => s.placeType)
  const tool = useStore((s) => s.tool)
  const units = useStore((s) => s.project.units)
  const items = useMemo(() => searchCatalog(q, cat), [q, cat])
  return (
    <section className="panel-body">
      <header className="insp-head">
        <span className="eyebrow">Furniture & fixtures</span>
        <h2>Catalog</h2>
      </header>
      <input id="catalog-search" className="search" placeholder="Search: sofa, bed, sink…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalog" />
      <div className="chip-wrap" role="tablist" aria-label="Categories">
        {(['All', ...CATEGORIES] as const).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} className={`chip${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="catalog-grid">
        {items.map((c) => {
          const scale = 64 / Math.max(c.w, c.d)
          const on = tool === 'item' && placeType === c.id
          return (
            <button
              key={c.id}
              type="button"
              className={`cat-card${on ? ' is-on' : ''}`}
              onClick={() => {
                useStore.setState({ tool: 'item', placeType: c.id, selection: null })
                useStore.getState().notify(`Click in the plan to place: ${c.name}`)
              }}
            >
              <svg viewBox="-40 -40 80 80" className="cat-thumb" aria-hidden>
                <g transform={`scale(${scale})`}>
                  <ItemSymbol w={c.w} d={c.d} color={c.color} color2={c.color2} shape={c.shape} px={1 / scale} />
                </g>
              </svg>
              <span className="cat-name">{c.name}</span>
              <span className="cat-dims">
                {formatLength(c.w, units, { compact: true })} × {formatLength(c.d, units, { compact: true })}
              </span>
            </button>
          )
        })}
        {items.length === 0 && <p className="tip">Nothing matches “{q}”.</p>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Paint

export function PaintPanel() {
  const paint = useStore((s) => s.paint)
  const set = (patch: Partial<typeof paint>) => useStore.setState({ paint: { ...paint, ...patch }, tool: 'paint', selection: null })
  return (
    <section className="panel-body">
      <header className="insp-head">
        <span className="eyebrow">Paint & finishes</span>
        <h2>Paint</h2>
      </header>
      <Segmented
        label="What to paint"
        value={paint.target}
        onChange={(v) => set({ target: v })}
        options={[
          { value: 'wall', label: 'Walls & items' },
          { value: 'floor', label: 'Floors' },
        ]}
      />
      {paint.target === 'wall' ? (
        <>
          <Field label="Finish">
            <FinishChips label="Wall finish" value={paint.finish} onChange={(f, c) => set({ finish: f, color: f === 'paint' ? paint.color : c })} />
          </Field>
          <Field label="Colour" hint="Click a wall side, a whole room, or a piece of furniture (in 3D).">
            <Swatches label="Paint colour" swatches={PAINTS} value={paint.color} onChange={(c) => set({ color: c })} />
          </Field>
        </>
      ) : (
        <Field label="Floor finish" hint="Click any room to apply.">
          <div className="floor-grid" role="radiogroup" aria-label="Floor finish">
            {FLOORS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={paint.floor === f.id} className="floor-chip" onClick={() => set({ floor: f.id })}>
                <span className={`floor-swatch pat-${f.pattern}`} style={{ background: f.base, color: f.accent }} />
                <span className="floor-name">{f.name}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      <hr />
      <Field label="Whole-home style" hint="Restyles walls, floors, trim, doors, windows, outside, roof, cabinets and furniture colours. Layout stays. Undo to go back.">
        <div className="style-list">
          {HOME_STYLES.map((st, k) => (
            <button
              key={st.id}
              type="button"
              className="style-card"
              onClick={() => {
                if (k >= FREE_LIMITS.styles && !requireFeature('all-styles')) return
                useStore.getState().apply((p) => applyHomeStyle(p, st.id))
                useStore.getState().notify(`Style applied: ${st.name}. Press Undo to go back.`)
              }}
            >
              <span className="style-dots" aria-hidden>
                {[st.walls.living, st.walls.bedroom, floorMaterial(st.floors.living).base, st.wood, st.fabric, st.exterior.color, st.roof.color].map((c, k) => (
                  <span key={k} style={{ background: c }} />
                ))}
              </span>
              <strong>
                {st.name}
                {k >= FREE_LIMITS.styles && <PlanTag plan="pro" />}
              </strong>
              <span className="muted">{st.blurb}</span>
            </button>
          ))}
        </div>
      </Field>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Levels

const ROOFS: Array<{ value: RoofStyle; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'flat', label: 'Flat' },
  { value: 'gable', label: 'Gable' },
  { value: 'hip', label: 'Hip' },
  { value: 'shed', label: 'Shed' },
]

export function LevelsPanel() {
  const project = useStore((s) => s.project)
  const levelId = useStore((s) => s.levelId)
  const units = project.units
  const levels = [...project.levels].sort((a, b) => b.elevation - a.elevation)
  const active = activeLevel({ project, levelId })
  const updLevel = (id: string, patch: Partial<Level>) => useStore.getState().apply((p) => ({ ...p, levels: p.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  return (
    <section className="panel-body">
      <header className="insp-head">
        <span className="eyebrow">Floors & roof</span>
        <h2>Levels</h2>
      </header>
      <ol className="level-list">
        {levels.map((l) => (
          <li key={l.id}>
            <button type="button" className={`level-item${l.id === levelId ? ' is-on' : ''}`} onClick={() => useStore.getState().setLevel(l.id)}>
              <span className="level-name">{l.name}</span>
              <span className="muted">
                {l.rooms.length} rooms · floor at {formatLength(l.elevation, units)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => addLevelAbove(true)}>
          <Icon name="plus" size={16} /> Floor above (copy walls)
        </button>
        <button type="button" className="btn" onClick={() => addLevelAbove(false)}>
          <Icon name="plus" size={16} /> Empty floor above
        </button>
        <button type="button" className="btn" onClick={() => addLevelBelow()}>
          <Icon name="plus" size={16} /> Basement
        </button>
      </div>
      <hr />
      <Field label="Name of this floor">
        <input id="level-name" value={active.name} onChange={(e) => updLevel(active.id, { name: e.target.value })} />
      </Field>
      <div className="grid-2">
        <Field label="Ceiling height">
          <LengthInput
            id="level-height"
            value={active.height}
            units={units}
            min={150}
            onChange={(v) =>
              useStore.getState().apply((p) => ({
                ...p,
                levels: p.levels.map((l) => (l.id === active.id ? { ...l, height: v, walls: l.walls.map((w) => (Math.abs(w.height - l.height) < 1 ? { ...w, height: v } : w)) } : l)),
              }))
            }
          />
        </Field>
        <Field label="Floor elevation">
          <LengthInput id="level-elev" value={active.elevation} units={units} min={-2000} onChange={(v) => updLevel(active.id, { elevation: v })} />
        </Field>
      </div>
      <Field label="Roof over this floor">
        <div className="chip-wrap">
          {ROOFS.map((r) => (
            <button key={r.value} type="button" className={`chip${active.roof.style === r.value ? ' is-on' : ''}`} onClick={() => {
              updLevel(active.id, { roof: { ...active.roof, style: r.value } })
              if (r.value !== 'none') useStore.setState({ showRoof: true })
            }}>
              {r.label}
            </button>
          ))}
        </div>
      </Field>
      {active.roof.style !== 'none' && (
        <>
          <div className="grid-2">
            <Field label="Pitch (rise per 12)">
              <NumberInput id="roof-pitch" value={Math.round(active.roof.pitch * 12 * 10) / 10} min={0} max={24} step={0.5} onChange={(v) => updLevel(active.id, { roof: { ...active.roof, pitch: v / 12 } })} />
            </Field>
            <Field label="Overhang">
              <LengthInput id="roof-over" value={active.roof.overhang} units={units} bare={units === 'imperial' ? 'in' : 'cm'} onChange={(v) => updLevel(active.id, { roof: { ...active.roof, overhang: v } })} />
            </Field>
          </div>
          <Toggle id="roof-ridge" checked={active.roof.ridgeAlongLong} onChange={(v) => updLevel(active.id, { roof: { ...active.roof, ridgeAlongLong: v } })} label="Ridge runs along the long side" />
          <Field label="Roof covering">
            <div className="chip-wrap">
              {ROOF_MATERIALS.filter((m) => (active.roof.style === 'flat' ? m.id === 'membrane' || m.id === 'metal' : m.id !== 'membrane')).map((m) => (
                <button key={m.id} type="button" className={`chip${roofMaterialOf(active) === m.id ? ' is-on' : ''}`} aria-pressed={roofMaterialOf(active) === m.id} onClick={() => updLevel(active.id, { roof: { ...active.roof, material: m.id } })}>
                  {m.name}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Roof colour">
            <Swatches label="Roof colour" swatches={ROOF_SWATCHES} value={active.roof.color} onChange={(c) => updLevel(active.id, { roof: { ...active.roof, color: c } })} />
          </Field>
        </>
      )}
      <hr />
      <TracingImage levelId={active.id} />
      {project.levels.length > 1 && (
        <div className="btn-row">
          <ConfirmButton
            className="btn btn-danger"
            confirmText={`Confirm: delete ${active.name}`}
            onConfirm={() => {
              const s = useStore.getState()
              s.apply((p) => ({ ...p, levels: p.levels.filter((l) => l.id !== active.id) }))
              useStore.setState({ levelId: useStore.getState().project.levels[0].id, selection: null })
            }}
          >
            <Icon name="trash" size={16} /> Delete this floor
          </ConfirmButton>
        </div>
      )}
    </section>
  )
}

function TracingImage({ levelId }: { levelId: string }) {
  const u = useUnderlay((s) => s.byLevel[levelId])
  const mode = useUnderlay((s) => s.mode)
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => useUnderlay.getState().load(levelId), [levelId])
  const pick = async (f: File) => {
    try {
      const { src, aspect } = await readImage(f)
      const l = activeLevel(useStore.getState())
      const b = levelBounds(l)
      const width = b ? Math.max(600, b.maxX - b.minX) : 1500
      useUnderlay.getState().set(levelId, { src, aspect, x: b ? b.minX : 0, y: b ? b.minY : 0, width, opacity: 0.5, visible: true })
      useStore.setState({ view: useStore.getState().view === '3d' || useStore.getState().view === 'walk' ? 'split' : useStore.getState().view, zoomRequest: useStore.getState().zoomRequest + 1 })
      useUnderlay.getState().setMode('calibrate')
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open that image')
    }
  }
  return (
    <Field label="Tracing image" hint="Put a photo or scan of an existing floor plan under this floor, set its scale, then draw walls over it. Kept in this browser.">
      {!u ? (
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={16} /> Add floor plan image
        </button>
      ) : (
        <>
          <label className="slider slider-flat" htmlFor="underlay-opacity">
            <span>Opacity</span>
            <input id="underlay-opacity" type="range" min={0.1} max={1} step={0.05} value={u.opacity} onChange={(e) => useUnderlay.getState().patch(levelId, { opacity: Number(e.target.value) })} />
          </label>
          <div className="btn-row">
            <button type="button" className={`btn${mode === 'calibrate' ? ' btn-primary' : ''}`} onClick={() => useUnderlay.getState().setMode(mode === 'calibrate' ? null : 'calibrate')}>
              <Icon name="measure" size={16} /> Set scale
            </button>
            <button type="button" className={`btn${mode === 'move' ? ' btn-primary' : ''}`} onClick={() => useUnderlay.getState().setMode(mode === 'move' ? null : 'move')}>
              <Icon name="pan" size={16} /> Move image
            </button>
            <button type="button" className="btn" onClick={() => useUnderlay.getState().patch(levelId, { visible: !u.visible })}>
              <Icon name="eye" size={16} /> {u.visible ? 'Hide' : 'Show'}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => useUnderlay.getState().set(levelId, null)}>
              <Icon name="trash" size={16} /> Remove
            </button>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        id="underlay-file"
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pick(f)
          e.target.value = ''
        }}
      />
      {err && <p className="error">{err}</p>}
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Budget

export function BudgetPanel() {
  const [tab, setTab] = useState<'cost' | 'list'>('cost')
  return (
    <section className="panel-body">
      <Segmented
        label="Budget view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'cost', label: 'Cost' },
          { value: 'list', label: 'Shopping list' },
        ]}
      />
      {tab === 'cost' ? <CostView /> : <ShoppingList />}
    </section>
  )
}

function CostView() {
  const project = useStore((s) => s.project)
  const { lines, total, byGroup } = useMemo(() => budget(project), [project])
  const groups = ['Flooring', 'Walls & paint', 'Roof', 'Doors & windows', 'Furniture & fixtures'].filter((g) => g !== 'Roof' || byGroup.Roof)
  const max = Math.max(1, ...groups.map((g) => byGroup[g] ?? 0))
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <header className="insp-head">
        <span className="eyebrow">Rough cost estimate</span>
        <h2>{formatMoney(total)}</h2>
      </header>
      <ul className="budget-bars">
        {groups.map((g) => (
          <li key={g}>
            <button type="button" className="budget-row" onClick={() => setOpen(open === g ? null : g)} aria-expanded={open === g}>
              <span className="budget-label">{g}</span>
              <span className="budget-val">{formatMoney(byGroup[g] ?? 0)}</span>
              <span className="budget-bar">
                <span style={{ width: `${((byGroup[g] ?? 0) / max) * 100}%` }} />
              </span>
            </button>
            {open === g && (
              <ul className="budget-lines">
                {lines
                  .filter((l) => l.group === g)
                  .sort((a, b) => b.cost - a.cost)
                  .map((l, i) => (
                    <li key={i}>
                      <span>{l.label}</span>
                      <span className="muted">{l.qty}</span>
                      <span className="num">{formatMoney(l.cost)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="tip">US ballpark prices for materials and installation. Change any furniture price in its inspector. Tap a group to see every line.</p>
    </>
  )
}

function ShoppingList() {
  const project = useStore((s) => s.project)
  const lines = useMemo(() => takeoff(project), [project])
  const notify = useStore.getState().notify
  const saveCsv = async () => {
    if (!requireFeature('shopping-export')) return
    const r = await saveFile(`${slug(project.name)}-shopping-list.csv`, takeoffCsv(lines, (l) => shopUrl(l)), 'text/csv')
    notify(r === 'saved' ? 'Shopping list saved' : r === 'declined' ? 'Save cancelled' : 'Could not save the file')
  }
  const copy = async () => {
    if (!requireFeature('shopping-export')) return
    try {
      await navigator.clipboard.writeText(takeoffText(project.name, lines))
      notify('Shopping list copied')
    } catch {
      notify('Clipboard not available here')
    }
  }
  return (
    <>
      <header className="insp-head">
        <span className="eyebrow">What to buy</span>
        <h2>Shopping list</h2>
      </header>
      <div className="btn-row">
        <button type="button" className="btn" onClick={saveCsv}>
          <Icon name="download" size={16} /> Save as spreadsheet <PlanTag plan="pro" />
        </button>
        <button type="button" className="btn" onClick={copy}>
          Copy as text
        </button>
      </div>
      {TAKEOFF_GROUPS.map((g) => {
        const ls = lines.filter((l) => l.group === g)
        if (!ls.length) return null
        return (
          <div key={g} className="takeoff-group">
            <h3 className="field-label">{g}</h3>
            <ul className="takeoff">
              {ls.map((l, i) => (
                <li key={i}>
                  <span className="takeoff-item">{l.item}</span>
                  <span className="takeoff-qty num">{l.qty}</span>
                  <span className="takeoff-detail muted">{l.detail}</span>
                  <span className="takeoff-where muted">{l.where}</span>
                  {shopUrl(l) && (
                    <a className="takeoff-find" href={shopUrl(l)!} target="_blank" rel="noreferrer sponsored" onClick={() => track('shop_click', { group: l.group })} aria-label={`Find ${l.item} in a store`}>
                      Find it
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <p className="tip">
        Paint is 2 coats. Flooring and wall finishes include cutting waste. Check amounts with your supplier before you buy.
        {shopConfig.affiliate ? ' Store links may earn Threshold a commission, at no cost to you.' : ''}
      </p>
    </>
  )
}

// Previews are built once per session; the designs themselves never change.
const previews = new Map<string, Project>()
function libraryPreview(id: string): Project {
  if (!previews.has(`lib:${id}`)) previews.set(`lib:${id}`, buildLibraryPlan(id))
  return previews.get(`lib:${id}`)!
}
function templatePreview(id: string): Project {
  if (!previews.has(`tpl:${id}`)) previews.set(`tpl:${id}`, buildTemplate(id))
  return previews.get(`tpl:${id}`)!
}

/** Send the design's share link to an email address (and, if ticked, sign up for tips). */
function EmailDesign() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [tips, setTips] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!open)
    return (
      <button type="button" className="linklike email-design-open" onClick={() => setOpen(true)}>
        Email me this design
      </button>
    )
  return (
    <form
      className="email-design"
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          const p = useStore.getState().project
          const res = await fetch(`${productConfig.licenseApi}/send-design`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, link: await shareLink(p), name: p.name, tips }),
          })
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          setMsg(res.ok ? { ok: true, text: `Sent to ${email.trim()}. Open the link on any device to get this design.` } : { ok: false, text: data.error ?? 'Could not send the email.' })
          if (res.ok) track('export', { kind: 'email-design' })
        } catch {
          setMsg({ ok: false, text: 'Could not reach the server. Try again later.' })
        }
        setBusy(false)
      }}
    >
      <label htmlFor="email-design">Your email address</label>
      <div className="paywall-key-row">
        <input id="email-design" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={tips} onChange={(e) => setTips(e.target.checked)} />
        <span>Also send me occasional home-design tips</span>
      </label>
      {msg && <p className={msg.ok ? 'check-ok' : 'error'}>{msg.text}</p>}
    </form>
  )
}

/** Free plan: how many of the free designs are in use. */
function DesignAllowance({ count }: { count: number }) {
  const plan = useEntitlements((s) => s.plan)
  if (allows(plan, 'unlimited-designs')) return null
  const n = Math.min(count, FREE_LIMITS.designs)
  return (
    <div className="allowance">
      <div className="allowance-row">
        <span>
          Free plan: <strong>{n} of {FREE_LIMITS.designs}</strong> designs used
        </span>
        <button type="button" className="linklike" onClick={() => requireFeature('unlimited-designs')}>
          Unlimited with Pro
        </button>
      </div>
      <span className="allowance-bar" aria-hidden>
        <span style={{ width: `${(n / FREE_LIMITS.designs) * 100}%` }} />
      </span>
    </div>
  )
}

/** Studio: the studio's name, contact and logo on plan sheets and presentations. */
function BrandingSettings() {
  const plan = useEntitlements((s) => s.plan)
  const brand = useBrand()
  const fileRef = useRef<HTMLInputElement>(null)
  if (!allows(plan, 'branding')) {
    return (
      <Field label="Your branding">
        <button type="button" className="template-card" onClick={() => requireFeature('branding')}>
          <strong>
            Put your company on every plan sheet <PlanTag plan="studio" />
          </strong>
          <span className="muted">Name, contact and logo in the title block and in client presentations</span>
        </button>
      </Field>
    )
  }
  return (
    <Field label="Your branding (plan sheets and presentations)">
      <input id="brand-company" placeholder="Company name" value={brand.company} onChange={(e) => brand.update({ company: e.target.value })} />
      <input id="brand-contact" placeholder="Phone, email or website" value={brand.contact} onChange={(e) => brand.update({ contact: e.target.value })} />
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={16} /> {brand.logo ? 'Change logo' : 'Add logo'}
        </button>
        {brand.logo && (
          <button type="button" className="btn" onClick={() => brand.update({ logo: null })}>
            Remove logo
          </button>
        )}
      </div>
      {brand.logo && <img className="brand-preview" src={brand.logo} alt="Your logo" />}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            brand.update({ logo: await readLogo(f) })
          } catch {
            useStore.getState().notify('That image could not be read')
          }
        }}
      />
    </Field>
  )
}

function LotSettings() {
  const project = useStore((s) => s.project)
  const lot = project.site.lot
  const units = project.units
  const apply = useStore.getState().apply
  const setLot = (patch: Partial<Lot>) =>
    apply((p) => {
      const cur = p.site.lot
      if (!cur) return p
      const next = { ...cur, ...patch }
      // Resize about the centre so the house stays where it is on the lot.
      if (patch.w !== undefined) next.x = cur.x + (cur.w - patch.w) / 2
      if (patch.d !== undefined) next.y = cur.y + (cur.d - patch.d) / 2
      return { ...p, site: { ...p.site, lot: next } }
    })
  return (
    <Field label="Lot (property lines)">
      <Toggle id="site-lot" checked={!!lot} onChange={(v) => apply((p) => ({ ...p, site: { ...p.site, lot: v ? defaultLot(p) : undefined } }))} label="Show the lot and setbacks" />
      {lot && (
        <>
          <div className="grid-2">
            <Field label="Lot width">
              <LengthInput id="lot-w" value={lot.w} units={units} min={100} onChange={(v) => setLot({ w: v })} />
            </Field>
            <Field label="Lot depth">
              <LengthInput id="lot-d" value={lot.d} units={units} min={100} onChange={(v) => setLot({ d: v })} />
            </Field>
            <Field label="Front setback">
              <LengthInput id="lot-front" value={lot.front} units={units} onChange={(v) => setLot({ front: v })} />
            </Field>
            <Field label="Rear setback">
              <LengthInput id="lot-rear" value={lot.rear} units={units} onChange={(v) => setLot({ rear: v })} />
            </Field>
            <Field label="Side setbacks">
              <LengthInput id="lot-side" value={lot.side} units={units} onChange={(v) => setLot({ side: v })} />
            </Field>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              apply((p) => {
                const fresh = defaultLot(p)
                const cur = p.site.lot!
                return { ...p, site: { ...p.site, lot: { ...cur, x: fresh.x + (fresh.w - cur.w) / 2, y: fresh.y + (fresh.d - cur.d) / 2 } } }
              })
            }
          >
            Centre the lot on the house
          </button>
          <p className="field-hint">Front (street) is the bottom edge of the plan. The design check flags walls past a setback.</p>
        </>
      )}
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Project: templates, saved designs, import/export

export function ProjectPanel() {
  const project = useStore((s) => s.project)
  const [saved, setSaved] = useState(listSaved)
  const [showBrief, setShowBrief] = useState(false)
  const cloudOn = useStore((s) => s.cloudStatus !== 'off')
  useEffect(() => {
    let alive = true
    cloudList().then((remote) => {
      if (!alive || !remote.length) return
      setSaved((local) => {
        const byId = new Map(local.map((m) => [m.id, m]))
        for (const r of remote) {
          const l = byId.get(r.id)
          if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r)
        }
        return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
      })
    })
    return () => {
      alive = false
    }
  }, [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const s = useStore.getState()

  const exportJson = async () => {
    const r = await saveFile(`${slug(project.name)}.threshold.json`, JSON.stringify(project, null, 1), 'application/json')
    s.notify(r === 'saved' ? 'Design file saved' : r === 'declined' ? 'Save cancelled' : 'Could not save the file')
  }
  const exportImage = async () => {
    const canvas = document.querySelector('.view-3d canvas') as HTMLCanvasElement | null
    if (!canvas) return s.notify('Open the 3D view first')
    const out = can('clean-exports') ? canvas : watermarked(canvas)
    track('export', { kind: '3d-image' })
    const r = await saveFile(`${slug(project.name)}-3d.png`, dataUrlToBlob(out.toDataURL('image/png')), 'image/png')
    if (r === 'saved' && !can('clean-exports')) s.notify('Image saved with the free watermark.', { label: 'Remove watermark', run: () => useEntitlements.getState().openPaywall('clean-exports') })
    else s.notify(r === 'saved' ? 'Image saved' : 'Image not saved')
  }
  const exportPlan = async () => {
    const st = useStore.getState()
    const level = activeLevel(st)
    try {
      const blob = await planPng(st.project, level, can('hd-exports') ? 4800 : 2400, { watermark: !can('clean-exports'), brand: can('branding') ? useBrand.getState() : null })
      track('export', { kind: 'plan' })
      const r = await saveFile(`${slug(project.name)}-${slug(level.name)}-plan.png`, blob, 'image/png')
      if (r === 'saved' && !can('clean-exports')) s.notify('Floor plan saved with the free watermark.', { label: 'Remove watermark', run: () => useEntitlements.getState().openPaywall('clean-exports') })
      else s.notify(r === 'saved' ? 'Floor plan saved' : 'Floor plan not saved')
    } catch {
      s.notify('Could not draw the floor plan image')
    }
  }
  const [making, setMaking] = useState(false)
  const exportPlanSet = async () => {
    if (!requireFeature('plan-set') || making) return
    setMaking(true)
    s.notify('Drawing the plan set…')
    try {
      // From plan view, open Split for a moment so the 3D pictures can be taken.
      const was = useStore.getState().view
      if (was === 'plan') {
        useStore.getState().setView('split')
        for (let t = 0; t < 40 && !document.querySelector('.view-3d canvas'); t++) await new Promise((r) => setTimeout(r, 200))
        await new Promise((r) => setTimeout(r, 800))
      }
      const canvas = document.querySelector('.view-3d canvas') as HTMLCanvasElement | null
      const views = await capture3dViews([
        { dir: 'street', name: 'From the street' },
        { dir: 'corner', name: 'Front corner' },
        { dir: 'N', name: 'Garden side' },
        { dir: 'top', name: 'From above' },
      ])
      if (was === 'plan') useStore.getState().setView('plan')
      const blob = await planSetPdf(useStore.getState().project, { cover3d: canvas, views, brand: can('branding') ? useBrand.getState() : null, shopping: can('shopping-export') })
      track('export', { kind: 'plan-set' })
      const r = await saveFile(`${slug(project.name)}-plan-set.pdf`, blob, 'application/pdf')
      s.notify(r === 'saved' ? 'Plan set saved' : r === 'declined' ? 'Save cancelled' : 'Could not save the file')
    } catch {
      s.notify('Could not make the plan set')
    } finally {
      setMaking(false)
    }
  }
  const exportModel = async () => {
    if (!requireFeature('model-export')) return
    const st = useStore.getState()
    if (st.view === 'plan') {
      st.setView('split')
      return s.notify('3D view opened. Press Save 3D model again.')
    }
    st.select(null)
    await new Promise((r) => setTimeout(r, 120))
    try {
      const blob = await exportGlb()
      if (!blob) return s.notify('Open the 3D view first')
      const r = await saveFile(`${slug(project.name)}.glb`, blob, 'model/gltf-binary')
      s.notify(r === 'saved' ? '3D model saved' : '3D model not saved')
    } catch {
      s.notify('Could not export the 3D model')
    }
  }
  const copyShare = async () => {
    try {
      const link = await shareLink(useStore.getState().project)
      await navigator.clipboard.writeText(link)
      track('export', { kind: 'share-link' })
      s.notify('Share link copied. Whoever opens it gets their own copy of this design.')
    } catch {
      s.notify('Could not copy the link here')
    }
  }
  const copyClient = async () => {
    if (!requireFeature('presentation')) return
    try {
      const brand = await brandForLink(useBrand.getState())
      const link = await shareLink(useStore.getState().project, undefined, { brand })
      await navigator.clipboard.writeText(link)
      track('export', { kind: 'client-link' })
      s.notify('Client link copied. It opens this home as a guided 3D tour with your brand.')
    } catch {
      s.notify('Could not copy the link here')
    }
  }
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(project))
      s.notify('Design copied to clipboard')
    } catch {
      s.notify('Clipboard not available here')
    }
  }
  return (
    <section className="panel-body">
      <header className="insp-head">
        <span className="eyebrow">Project</span>
        <h2>{project.name}</h2>
      </header>
      <Field label="Design name">
        <input id="project-name" value={project.name} onChange={(e) => useStore.getState().apply((p) => ({ ...p, name: e.target.value }))} />
      </Field>
      <Field label="Units">
        <Segmented
          label="Units"
          value={project.units}
          onChange={(v) => useStore.getState().apply((p) => ({ ...p, units: v }))}
          options={[
            { value: 'imperial', label: 'Feet & inches' },
            { value: 'metric', label: 'Metres' },
          ]}
        />
      </Field>
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (!canStartNewDesign(useStore.getState().project.id)) return
            const cur = useStore.getState().project
            const copy = { ...structuredClone(cur), id: uid('prj'), name: `${cur.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }
            useStore.getState().loadProject(copy)
            saveProject(copy)
            setSaved(listSaved())
            useStore.getState().notify('Working on a copy. The original is saved.')
          }}
        >
          <Icon name="copy" size={16} /> Duplicate this design
        </button>
      </div>
      <DesignAllowance count={saved.length + (saved.some((m) => m.id === project.id) ? 0 : 1)} />
      <Field label="Plan from your needs">
        {showBrief ? (
          <BriefForm
            submitLabel="Make this plan (current design stays saved)"
            onMake={(p) => {
              if (!canStartNewDesign(useStore.getState().project.id)) return
              useStore.getState().loadProject({ ...p, units: project.units })
              setSaved(listSaved())
              setShowBrief(false)
              useStore.getState().notify(`Started: ${p.name}`)
            }}
          />
        ) : (
          <button type="button" className="template-card" onClick={() => setShowBrief(true)}>
            <strong>Choose bedrooms, bathrooms, floors, garage</strong>
            <span className="muted">Get a furnished starting plan</span>
          </button>
        )}
      </Field>
      <Field label="New design from a starting point">
        <div className="template-list">
          {TEMPLATES.map((t) => (
            <ConfirmButton
              key={t.id}
              className="template-card"
              confirmText="Click again: your current design stays saved"
              onConfirm={() => {
                if (!canStartNewDesign(useStore.getState().project.id)) return
                const p = buildTemplate(t.id)
                useStore.getState().loadProject({ ...p, units: project.units })
                setSaved(listSaved())
                useStore.getState().notify(`Started: ${t.name}`)
              }}
            >
              {t.id !== 'blank' && <MiniPlan project={templatePreview(t.id)} />}
              <strong>{t.name}</strong>
              <span className="muted">{t.blurb}</span>
            </ConfirmButton>
          ))}
        </div>
      </Field>
      <div className="library-field">
      <Field label="Plan library" hint="Ready-made homes, furnished and styled. Start from one and change anything.">
        <div className="template-list">
          {LIBRARY.map((l) => (
            <ConfirmButton
              key={l.id}
              className="template-card"
              confirmText="Click again: your current design stays saved"
              onConfirm={() => {
                if (l.pro && !requireFeature('plan-library')) return
                if (!canStartNewDesign(useStore.getState().project.id)) return
                const p = buildLibraryPlan(l.id)
                useStore.getState().loadProject({ ...p, units: project.units })
                setSaved(listSaved())
                track('design_created', { from: `library-${l.id}` })
                useStore.getState().notify(`Started: ${l.name}`)
              }}
            >
              <MiniPlan project={libraryPreview(l.id)} />
              <strong>
                {l.name} {l.pro && <PlanTag plan="pro" />}
              </strong>
              <span className="muted">{libraryBlurb(l)}</span>
              <span className="muted">{l.for}</span>
            </ConfirmButton>
          ))}
        </div>
      </Field>
      </div>
      {saved.length > 1 && (
        <Field label={cloudOn ? 'Your saved designs' : 'Saved in this browser'}>
          <ul className="saved-list">
            {saved.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`saved-item${m.id === project.id ? ' is-on' : ''}`}
                  onClick={async () => {
                    const local = loadSaved(m.id)
                    const remote = !local || local.updatedAt < m.updatedAt ? await cloudLoad(m.id) : null
                    const p = remote ?? local
                    if (p) useStore.getState().loadProject(p)
                    else useStore.getState().notify('That design could not be opened')
                  }}
                >
                  <span>{m.name}</span>
                  <span className="muted">{new Date(m.updatedAt).toLocaleDateString()}</span>
                </button>
                {m.id !== project.id && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete ${m.name}`}
                    onClick={() => {
                      deleteSaved(m.id)
                      cloudDelete(m.id)
                      setSaved((xs) => xs.filter((x) => x.id !== m.id))
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {canShareLinks() && (
        <Field label="Share" hint="The link holds the whole design. Nothing is uploaded; whoever opens it gets their own copy. A client link opens as a guided 3D tour.">
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={copyShare}>
              <Icon name="copy" size={16} /> Copy share link
            </button>
            <button type="button" className="btn" onClick={copyClient} title="Opens as a full-screen 3D tour with your brand">
              <Icon name="copy" size={16} /> Copy client link <PlanTag plan="studio" />
            </button>
          </div>
          {productConfig.licenseApi && <EmailDesign />}
        </Field>
      )}
      <Field label="Files">
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportJson}>
            <Icon name="download" size={16} /> Save design file
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Open design file
          </button>
          <button type="button" className="btn" onClick={exportPlanSet} disabled={making} title="Cover, 3D views, every floor plan, room schedule and shopping list">
            <Icon name="sheets" size={16} /> {making ? 'Making plan set…' : 'Save plan set (PDF)'} <PlanTag plan="pro" />
          </button>
          <button type="button" className="btn" onClick={exportPlan}>
            <Icon name="plan" size={16} /> Save floor plan image
          </button>
          <button type="button" className="btn" onClick={exportModel}>
            <Icon name="cube" size={16} /> Save 3D model (.glb) <PlanTag plan="pro" />
          </button>
          <button type="button" className="btn" onClick={exportImage}>
            <Icon name="image" size={16} /> Save 3D image
          </button>
          <button type="button" className="btn" onClick={copyJson}>
            <Icon name="copy" size={16} /> Copy design
          </button>
        </div>
        <input
          ref={fileRef}
          id="import-file"
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = () => {
              try {
                const p = normalizeProject(JSON.parse(String(reader.result)))
                if (!listSaved().some((m) => m.id === p.id) && !canStartNewDesign()) return
                useStore.getState().loadProject(p)
                setErr(null)
                useStore.getState().notify(`Opened ${p.name}`)
              } catch (ex) {
                setErr(ex instanceof Error ? ex.message : 'That file could not be read.')
              }
            }
            reader.readAsText(f)
            e.target.value = ''
          }}
        />
        {err && <p className="error">{err}</p>}
      </Field>
      <Field label="Trim">
        <Toggle id="baseboards" checked={project.defaults.baseboards !== false} onChange={(v) => useStore.getState().apply((p) => ({ ...p, defaults: { ...p.defaults, baseboards: v } }))} label="Baseboards on inside walls" />
        {project.defaults.baseboards !== false && (
          <Swatches label="Trim colour" swatches={[...PAINTS.slice(0, 8), { name: 'Oak', hex: '#C29A6B' }, { name: 'Walnut', hex: '#6A4630' }]} value={project.defaults.trimColor ?? '#F7F7F4'} onChange={(c) => useStore.getState().apply((p) => ({ ...p, defaults: { ...p.defaults, trimColor: c } }))} />
        )}
      </Field>
      <Field label="Surroundings in 3D">
        <div className="style-list">
          {SURROUNDINGS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`style-card${(project.site.surroundings ?? 'suburb') === o.id ? ' is-on' : ''}`}
              aria-pressed={(project.site.surroundings ?? 'suburb') === o.id}
              onClick={() => {
                if ((o.id === 'garden' || o.id === 'country') && !requireFeature('surroundings')) return
                useStore.getState().apply((p) => ({ ...p, site: { ...p.site, surroundings: o.id, showGround: true } }))
              }}
            >
              <strong>
                {o.name}
                {(o.id === 'garden' || o.id === 'country') && <PlanTag plan="pro" />}
              </strong>
              <span className="muted">{o.blurb}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Site">
        <Toggle id="site-ground" checked={project.site.showGround} onChange={(v) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, showGround: v } }))} label="Show ground in 3D" />
        <Swatches label="Ground colour" swatches={[{ name: 'Lawn', hex: '#8DA870' }, { name: 'Dry grass', hex: '#B6AE7A' }, { name: 'Gravel', hex: '#B9B4AA' }, { name: 'Snow', hex: '#EEF1F3' }, { name: 'Soil', hex: '#8A6E55' }]} value={project.site.groundColor} onChange={(c) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, groundColor: c } }))} />
      </Field>
      <LotSettings />
      <BrandingSettings />
      <Field label="North direction (compass bearing of plan up)">
        <NumberInput id="north" value={project.site.northAngle} min={-180} max={360} step={15} suffix="°" onChange={(v) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, northAngle: v } }))} />
      </Field>
      <p className="tip">{cloudOn ? 'Your designs save automatically to your account and open on any device where you use this app.' : 'Your design saves automatically in this browser. Save a design file to keep a copy or move it to another device.'}</p>
    </section>
  )
}

