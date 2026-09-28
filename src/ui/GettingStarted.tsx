import { STEPS, useOnboarding } from '../product/onboarding'
import { trialState, useEntitlements } from '../product/entitlements'
import { productConfig } from '../product/config'
import { useAudience } from '../product/audience'
import { Icon } from './Icon'

/** A short checklist for first sessions; each step ticks itself. */
export function GettingStarted() {
  const done = useOnboarding((s) => s.done)
  const dismissed = useOnboarding((s) => s.dismissed)
  const plan = useEntitlements((s) => s.plan)
  const started = useEntitlements((s) => s.trialStartedAt)
  const forPros = useAudience((s) => s.audience) === 'pro'
  if (dismissed) return null
  const all = done.length >= STEPS.length
  const offerTrial = all && plan === 'free' && !trialState(started).used
  if (all && !offerTrial) return null
  return (
    <section className="getting-started" aria-label="Getting started">
      <header>
        <strong>{all ? 'You have seen the essentials' : 'Getting started'}</strong>
        <span className="muted">
          {Math.min(done.length, STEPS.length)} / {STEPS.length}
        </span>
        <button type="button" className="icon-btn" aria-label="Hide getting started" onClick={() => useOnboarding.getState().dismiss()}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <span className="gs-bar" aria-hidden>
        <span style={{ width: `${(Math.min(done.length, STEPS.length) / STEPS.length) * 100}%` }} />
      </span>
      {all ? (
        <div className="gs-done">
          <p>Next: export clean plans, a 3D model and the shopping list, and let the assistant draw changes for you.</p>
          <button type="button" className="btn btn-primary" onClick={() => useEntitlements.getState().startTrial(forPros ? 'studio' : 'pro')}>
            Try {forPros ? 'Studio' : 'Pro'} free for {productConfig.trialDays} days
          </button>
        </div>
      ) : (
        <ul>
          {STEPS.map((s) => {
            const ok = done.includes(s.id)
            return (
              <li key={s.id} className={ok ? 'is-done' : ''}>
                <span className="gs-check" aria-hidden>
                  {ok ? <Icon name="check" size={13} /> : null}
                </span>
                <span>
                  {s.text}
                  {!ok && <small>{s.hint}</small>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
