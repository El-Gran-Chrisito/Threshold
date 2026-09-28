import { useEffect, useRef, useState } from 'react'
import { activeLevel, useStore } from '../store/store'
import { buildPrompt, runActions, type Action } from './actions'
import { Icon } from '../ui/Icon'
import { useEntitlements } from '../product/entitlements'
import { allows } from '../product/plans'
import { LockedFeature } from '../ui/Paywall'
import { hostedAssistant } from './hosted'
import { productConfig } from '../product/config'

interface SampleError {
  code: string
  message: string
  text?: string
}

interface SampleFn {
  json: <T>(input: string, options?: Record<string, unknown>) => Promise<T>
  limits: () => Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>
}

const EXAMPLES_EMPTY = ['Design a two-bedroom, one-bath cottage of about 900 sq ft with an open kitchen and living room', 'Lay out a studio apartment with a sleeping nook, bath and galley kitchen']
const EXAMPLES = [
  'Add a 12 × 12 home office east of the living room with a desk, chair and bookshelf',
  'Paint the bedrooms a soft blue and give them oak floors',
  'Add two windows to every bedroom',
  'Furnish the den as a guest room',
  'Switch the roof to a gable roof',
]

const HIDE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'])

function copyFor(code: string): string {
  switch (code) {
    case 'rate_limited':
      return 'Too many requests right now. Try again in a minute.'
    case 'invalid_json':
      return 'The answer could not be read as a list of changes. Try again, or ask for fewer changes at once.'
    case 'refused':
      return 'Claude declined this request. Try describing it differently.'
    case 'prompt_too_large':
      return 'This floor is too big to send in one request. Ask about one part at a time.'
    case 'image_rejected':
      return 'That image could not be used. Try a JPEG or PNG under 20 MB.'
    case 'session_expired':
      return 'Sign in to Claude again, then retry.'
    default:
      return 'Something went wrong. Try again.'
  }
}

export function AssistantPanel() {
  const plan = useEntitlements((s) => s.plan)
  if (!allows(plan, 'assistant')) return <LockedFeature feature="assistant" />
  return <AssistantWorkspace />
}

function AssistantWorkspace() {
  const [sample, setSample] = useState<SampleFn | null | undefined>(undefined)
  const [imagesOk, setImagesOk] = useState(false)
  const [text, setText] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ summary: string; applied: string[]; skipped: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const isEmpty = useStore((s) => activeLevel(s).rooms.length === 0)
  const licensed = useEntitlements((s) => s.source === 'license')

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Inside Claude: the viewer's own Claude. On the hosted site: the license server.
      const s = (window.claude?.use ? ((await window.claude.use('sample').catch(() => null)) as SampleFn | null) : null) ?? hostedAssistant()
      if (!alive) return
      setSample(s)
      if (s) {
        const lim = await s.limits().catch(() => null)
        if (alive) setImagesOk(!!lim?.images)
      }
    })()
    return () => {
      alive = false
      ctl.current?.abort()
    }
  }, [licensed])

  const run = async () => {
    if (!sample || (!text.trim() && !image)) return
    const s = useStore.getState()
    const prompt = buildPrompt(s.project, activeLevel(s), text.trim() || 'Recreate the attached floor plan.', !!image)
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const options: Record<string, unknown> = { signal: c.signal, cache: false }
      if (image) options.images = image
      const data = await sample.json<{ summary?: string; actions?: Action[] }>(prompt, options)
      const actions = Array.isArray(data?.actions) ? data.actions : []
      if (!actions.length) {
        setResult({ summary: typeof data?.summary === 'string' ? data.summary : 'No changes were suggested.', applied: [], skipped: [] })
        return
      }
      const cur = useStore.getState()
      const r = runActions(cur.project, cur.levelId, actions)
      cur.apply(() => r.project)
      cur.select(null)
      cur.set({ zoomRequest: cur.zoomRequest + (isEmpty ? 1 : 0) })
      setResult({ summary: typeof data.summary === 'string' ? data.summary : 'Done.', applied: r.applied, skipped: r.skipped })
      cur.notify(`${r.applied.length} change${r.applied.length === 1 ? '' : 's'} made`)
    } catch (e) {
      const err = e as SampleError
      if (err?.code === 'cancelled') return
      if (HIDE.has(err?.code)) setSample(null)
      else if (err?.code === 'daily_limit' && err.message) setError(err.message)
      else setError(copyFor(err?.code ?? 'upstream_error'))
    } finally {
      if (ctl.current === c) ctl.current = null
      setBusy(false)
    }
  }

  const examples = isEmpty ? EXAMPLES_EMPTY : EXAMPLES

  return (
    <section className="panel-body">
      <header className="insp-head">
        <span className="eyebrow">Design assistant</span>
        <h2>Describe a change</h2>
      </header>
      {sample === undefined && <p className="tip">Connecting…</p>}
      {sample === null && (
        <p className="tip">
          {productConfig.licenseApi
            ? 'On this site the assistant works with a Pro or Studio license (it is not part of the free trial here). Every change it makes can also be done with the tools on the left.'
            : 'The assistant works when Threshold is opened inside Claude. Every change it makes can also be done with the tools on the left.'}
        </p>
      )}
      {sample && (
        <>
          <textarea
            id="ask-input"
            className="ask-input"
            rows={4}
            value={text}
            placeholder={examples[0]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run()
            }}
            aria-label="Describe what to change"
          />
          <div className="chip-wrap">
            {examples.map((ex) => (
              <button key={ex} type="button" className="chip chip-example" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
          {imagesOk && (
            <label className="btn attach" htmlFor="ask-image">
              <Icon name="image" size={16} /> {image ? image.name : 'Attach a floor plan photo or sketch'}
              <input id="ask-image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
          )}
          <div className="btn-row">
            {!busy ? (
              <button type="button" className="btn btn-primary" onClick={run} disabled={!text.trim() && !image}>
                <Icon name="magic" size={16} /> Make these changes
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => ctl.current?.abort()}>
                Stop
              </button>
            )}
            {image && !busy && (
              <button type="button" className="btn" onClick={() => setImage(null)}>
                Remove image
              </button>
            )}
          </div>
          {busy && <p className="tip thinking">Thinking… this can take up to a minute.</p>}
          {error && <p className="error">{error}</p>}
          {result && (
            <div className="ask-result">
              <p>
                <strong>{result.summary}</strong>
              </p>
              {result.applied.length > 0 && (
                <ul>
                  {result.applied.map((a, i) => (
                    <li key={i}>
                      <Icon name="check" size={14} /> {a}
                    </li>
                  ))}
                </ul>
              )}
              {result.skipped.length > 0 && (
                <>
                  <p className="muted">Not done:</p>
                  <ul className="skipped">
                    {result.skipped.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
              {result.applied.length > 0 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    useStore.getState().undo()
                    setResult(null)
                  }}
                >
                  <Icon name="undo" size={16} /> Undo these changes
                </button>
              )}
            </div>
          )}
          <p className="tip">Changes apply to the floor you are viewing, as one step you can undo. Each request uses your Claude account.</p>
        </>
      )}
    </section>
  )
}
