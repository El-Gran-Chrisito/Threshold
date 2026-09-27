import { useEffect, useMemo, useRef, useState } from 'react'
import { activeLevel, addLevelAbove, addLevelBelow, useStore } from '../store/store'
import { CATEGORIES, searchCatalog, type Category } from '../model/catalog'
import { FLOORS, PAINTS } from '../model/materials'
import { ItemSymbol } from '../plan/symbols'
import { formatLength, formatMoney } from '../model/units'
import { ConfirmButton, Field, FinishChips, LengthInput, NumberInput, Segmented, Swatches, Toggle } from './controls'
import { Icon } from './Icon'
import type { Level, RoofStyle } from '../model/types'
import { budget } from '../model/budget'
import { TEMPLATES, buildTemplate } from '../model/templates'
import { deleteSaved, listSaved, loadSaved, normalizeProject } from '../store/persistence'
import { dataUrlToBlob, saveFile, slug } from '../store/files'
import { cloudDelete, cloudList, cloudLoad } from '../store/cloud'
import { planPng } from '../plan/exportPlan'
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
          <Field label="Roof colour">
            <Swatches label="Roof colour" swatches={PAINTS.slice(3, 18)} value={active.roof.color} onChange={(c) => updLevel(active.id, { roof: { ...active.roof, color: c } })} />
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
  const project = useStore((s) => s.project)
  const { lines, total, byGroup } = useMemo(() => budget(project), [project])
  const groups = ['Flooring', 'Walls & paint', 'Doors & windows', 'Furniture & fixtures']
  const max = Math.max(1, ...groups.map((g) => byGroup[g] ?? 0))
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section className="panel-body">
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
    </section>
  )
}

// ---------------------------------------------------------------------------
// Project: templates, saved designs, import/export

export function ProjectPanel() {
  const project = useStore((s) => s.project)
  const [saved, setSaved] = useState(listSaved)
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
    const r = await saveFile(`${slug(project.name)}-3d.png`, dataUrlToBlob(canvas.toDataURL('image/png')), 'image/png')
    s.notify(r === 'saved' ? 'Image saved' : 'Image not saved')
  }
  const exportPlan = async () => {
    const st = useStore.getState()
    const level = activeLevel(st)
    try {
      const blob = await planPng(st.project, level)
      const r = await saveFile(`${slug(project.name)}-${slug(level.name)}-plan.png`, blob, 'image/png')
      s.notify(r === 'saved' ? 'Floor plan saved' : 'Floor plan not saved')
    } catch {
      s.notify('Could not draw the floor plan image')
    }
  }
  const exportModel = async () => {
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
      <Field label="New design from a starting point">
        <div className="template-list">
          {TEMPLATES.map((t) => (
            <ConfirmButton
              key={t.id}
              className="template-card"
              confirmText="Click again: your current design stays saved"
              onConfirm={() => {
                const p = buildTemplate(t.id)
                useStore.getState().loadProject({ ...p, units: project.units })
                setSaved(listSaved())
                useStore.getState().notify(`Started: ${t.name}`)
              }}
            >
              <strong>{t.name}</strong>
              <span className="muted">{t.blurb}</span>
            </ConfirmButton>
          ))}
        </div>
      </Field>
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
      <Field label="Files">
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportJson}>
            <Icon name="download" size={16} /> Save design file
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Open design file
          </button>
          <button type="button" className="btn" onClick={exportPlan}>
            <Icon name="plan" size={16} /> Save floor plan image
          </button>
          <button type="button" className="btn" onClick={exportModel}>
            <Icon name="cube" size={16} /> Save 3D model (.glb)
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
      <Field label="Site">
        <Toggle id="site-ground" checked={project.site.showGround} onChange={(v) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, showGround: v } }))} label="Show ground in 3D" />
        <Swatches label="Ground colour" swatches={[{ name: 'Lawn', hex: '#8DA870' }, { name: 'Dry grass', hex: '#B6AE7A' }, { name: 'Gravel', hex: '#B9B4AA' }, { name: 'Snow', hex: '#EEF1F3' }, { name: 'Soil', hex: '#8A6E55' }]} value={project.site.groundColor} onChange={(c) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, groundColor: c } }))} />
      </Field>
      <Field label="North direction (compass bearing of plan up)">
        <NumberInput id="north" value={project.site.northAngle} min={-180} max={360} step={15} suffix="°" onChange={(v) => useStore.getState().apply((p) => ({ ...p, site: { ...p.site, northAngle: v } }))} />
      </Field>
      <p className="tip">{cloudOn ? 'Your designs save automatically to your account and open on any device where you use this app.' : 'Your design saves automatically in this browser. Save a design file to keep a copy or move it to another device.'}</p>
    </section>
  )
}

