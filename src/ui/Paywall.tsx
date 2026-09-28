import { useEffect, useState } from 'react'
import { FEATURES, PASS, PLANS, allows, planInfo, type Feature, type PlanId } from '../product/plans'
import { daysLeft, deleteSyncedDesigns, isPass, requestKeyEmail, trialState, useEntitlements } from '../product/entitlements'
import { checkoutUrl, productConfig, type Billing } from '../product/config'
import { useAudience } from '../product/audience'
import { fetchInvite, inviteLink } from '../product/invite'
import { track } from '../product/analytics'
import { ConfirmButton, Segmented } from './controls'
import { Icon } from './Icon'

const money = (n: number) => (n % 1 ? `$${n.toFixed(2)}` : `$${n}`)
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Plan badge in the top bar: shows the current plan and opens the plans sheet. */
export function PlanBadge() {
  const plan = useEntitlements((s) => s.plan)
  const source = useEntitlements((s) => s.source)
  const started = useEntitlements((s) => s.trialStartedAt)
  const license = useEntitlements((s) => s.license)
  const open = useEntitlements((s) => s.openPaywall)
  const t = trialState(started)
  const left = isPass(license) ? daysLeft(license) : null
  const plural = (n: number) => `${n} day${n === 1 ? '' : 's'} left`
  const label =
    source === 'trial' ? `${planInfo(plan).name} trial · ${plural(t.daysLeft)}` : plan === 'free' ? 'Upgrade' : left !== null && left <= 14 ? `${planInfo(plan).name} · ${plural(left)}` : planInfo(plan).name
  // Phones get a short form of the same label.
  const short = source === 'trial' ? `${t.daysLeft}d left` : plan === 'free' ? 'Pro' : left !== null && left <= 14 ? `${left}d left` : planInfo(plan).name
  return (
    <button type="button" className={`plan-badge is-${plan}${source === 'trial' ? ' is-trial' : ''}`} onClick={() => open(null)} title="Plans and license" aria-label={label}>
      {plan === 'free' ? <Icon name="magic" size={15} /> : null}
      <span className="pb-long">{label}</span>
      <span className="pb-short" aria-hidden>
        {short}
      </span>
    </button>
  )
}

export function PaywallSheet() {
  const paywall = useEntitlements((s) => s.paywall)
  const plan = useEntitlements((s) => s.plan)
  const source = useEntitlements((s) => s.source)
  const license = useEntitlements((s) => s.license)
  const lapsed = useEntitlements((s) => s.lapsed)
  const started = useEntitlements((s) => s.trialStartedAt)
  const { closePaywall, startTrial, activate, signOut } = useEntitlements.getState()
  const [billing, setBilling] = useState<Billing>('yearly')
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [lost, setLost] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const storedKey = useEntitlements((s) => s.key)
  const audience = useAudience((s) => s.audience)
  useEffect(() => {
    if (!paywall.open) {
      setMsg(null)
      setKey('')
      setLost(false)
    }
  }, [paywall.open])
  useEffect(() => {
    if (!paywall.open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closePaywall()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paywall.open, closePaywall])
  if (!paywall.open) return null
  const f = paywall.feature ? FEATURES[paywall.feature] : null
  const bestSaving = Math.max(...PLANS.filter((p) => p.monthly).map((p) => Math.round((1 - p.yearly / (p.monthly * 12)) * 100)))
  // A feature asks for its own plan; otherwise professionals are shown Studio.
  const need: PlanId = f?.plan ?? (audience === 'pro' ? 'studio' : 'pro')
  const trialFor: 'pro' | 'studio' = need === 'studio' ? 'studio' : 'pro'
  const trial = trialState(started)
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && closePaywall()}>
      <div className="sheet paywall" role="dialog" aria-modal="true" aria-labelledby="paywall-title">
        <header>
          <span className="eyebrow">{source === 'license' ? `Your plan: ${planInfo(plan).name}` : 'Plans'}</span>
          <button type="button" className="icon-btn" onClick={closePaywall} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <h2 id="paywall-title">
          {f
            ? `${f.name} is part of ${planInfo(need).name}`
            : source === 'license'
              ? 'Thank you for supporting Threshold'
              : lapsed?.exp
                ? `Your ${planInfo(lapsed.plan).name} ${isPass(lapsed) ? 'pass' : 'plan'} ended on ${day(lapsed.exp)}`
                : trial.used && !trial.active
                  ? 'Your Pro trial has ended'
                  : 'Get more from Threshold'}
        </h2>
        {f && <p className="paywall-lede">{f.blurb}</p>}
        {!f && !lapsed && source === 'free' && trial.used && !trial.active && (
          <p className="paywall-lede">Every design you made is still here. Clean exports, the 3D model, the shopping list, electrical layout, the assistant and all styles are paused until you choose a plan.</p>
        )}
        {!f && lapsed && source !== 'license' && lapsed.ref?.startsWith('sub_') && (
          <p className="paywall-lede">Still subscribed? Your key renews by itself when this device is online. If it does not, choose “I have a license key”, then “Email me my key”.</p>
        )}
        {!f && lapsed && source !== 'license' && <p className="paywall-lede">Every design you made is still here and still opens. Pick a plan or a pass to switch the paid tools back on.</p>}
        <Segmented
          label="Billing"
          value={billing}
          onChange={setBilling}
          options={[
            { value: 'yearly', label: 'Yearly', badge: `save up to ${bestSaving}%` },
            { value: 'monthly', label: 'Monthly' },
          ]}
        />
        <div className="plan-grid">
          {PLANS.map((p) => {
            const current = p.id === plan
            const price = billing === 'yearly' ? p.yearly / 12 : p.monthly
            const url = p.id === 'free' ? null : checkoutUrl(p.id, billing, license?.email)
            const recommended = p.id === need && !current
            return (
              <article key={p.id} className={`plan-card${recommended ? ' is-recommended' : ''}${current ? ' is-current' : ''}`}>
                {recommended && <span className="plan-flag">Recommended</span>}
                <h3>{p.name}</h3>
                <p className="plan-price">
                  <strong>{p.monthly ? money(Math.round(price * 100) / 100) : '$0'}</strong>
                  <span>{p.monthly ? ' / month' : ' forever'}</span>
                </p>
                {p.monthly > 0 && <p className="plan-bill">{billing === 'yearly' ? `${money(p.yearly)} billed yearly` : 'Billed monthly, cancel anytime'}</p>}
                <p className="plan-tag">{p.tagline}</p>
                <ul>
                  {p.bullets.map((b) => (
                    <li key={b}>
                      <Icon name="check" size={14} /> {b}
                    </li>
                  ))}
                </ul>
                {current ? (
                  <span className="plan-current">{source === 'trial' ? `Trial · ${trial.daysLeft} days left` : 'Current plan'}</span>
                ) : p.id === 'free' ? null : url ? (
                  <a className={`btn${recommended ? ' btn-primary' : ''}`} href={url} target="_blank" rel="noreferrer" onClick={() => track('upgrade_clicked', { plan: p.id, billing })}>
                    Choose {p.name}
                  </a>
                ) : (
                  <span className="plan-soon">Checkout is not connected in this copy yet</span>
                )}
              </article>
            )
          })}
        </div>
        {(audience !== 'pro' && (plan === 'free' || source === 'trial')) || (isPass(license) && (daysLeft(license) ?? 99) <= 14) ? <PassOffer email={license?.email ?? lapsed?.email} /> : null}
        {!trial.used && source === 'free' && !lapsed && (
          <button type="button" className="btn btn-primary paywall-trial" onClick={() => startTrial(trialFor)}>
            Try {planInfo(trialFor).name} free for {productConfig.trialDays} days
          </button>
        )}
        {source === 'license' && license ? (
          <>
          {storedKey && (
            <details className="paywall-device">
              <summary>Use Threshold on another device</summary>
              <p className="paywall-fine">Open Threshold there, press Upgrade, choose “I have a license key” and paste this key. Your designs follow the key.</p>
              <div className="paywall-key-row">
                <input id="your-license-key" readOnly value={storedKey} onFocus={(e) => e.currentTarget.select()} aria-label="Your license key" spellCheck={false} />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(storedKey)
                      setMsg({ ok: true, text: 'License key copied.' })
                    } catch {
                      ;(document.getElementById('your-license-key') as HTMLInputElement | null)?.select()
                      setMsg({ ok: true, text: 'Key selected. Copy it with your keyboard or long-press.' })
                    }
                  }}
                >
                  <Icon name="copy" size={15} /> Copy
                </button>
              </div>
              {msg && <p className={msg.ok ? 'check-ok' : 'error'}>{msg.text}</p>}
            </details>
          )}
          {license.billing === 'monthly' && <YearlyOffer plan={license.plan} />}
          {storedKey && license.ref?.startsWith('sub_') && productConfig.licenseApi && <InviteBox licenseKey={storedKey} planName={planInfo(license.plan).name} />}
          <p className="paywall-fine">
            Licensed to {license.email || license.name || 'you'}
            {license.exp ? (isPass(license) ? ` · ${planInfo(license.plan).name} until ${day(license.exp)}, nothing renews` : ` · renews by ${day(license.exp)}`) : ''} ·{' '}
            {productConfig.billingPortal && (
              <>
                <a href={productConfig.billingPortal} target="_blank" rel="noreferrer">
                  Manage subscription
                </a>{' '}
                ·{' '}
              </>
            )}
            {storedKey && productConfig.licenseApi && allows(license.plan, 'sync') && !license.trial && (
              <>
                <ConfirmButton
                  className="linklike"
                  confirmText="Click again: delete every synced design"
                  onConfirm={async () => {
                    const r = await deleteSyncedDesigns(storedKey)
                    setNote({ ok: r.ok, text: r.message })
                  }}
                >
                  Delete my synced designs
                </ConfirmButton>{' '}
                ·{' '}
              </>
            )}
            <button type="button" className="linklike" onClick={signOut}>
              Remove license from this device
            </button>
          </p>
          {note && <p className={note.ok ? 'check-ok' : 'error'}>{note.text}</p>}
          </>
        ) : (
          <div className="paywall-key">
            {showKey ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const r = await activate(key)
                  setMsg({ ok: r.ok, text: r.message })
                }}
              >
                <label htmlFor="license-key">License key</label>
                <div className="paywall-key-row">
                  <input id="license-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="THR1.…" autoComplete="off" spellCheck={false} />
                  <button type="submit" className="btn">
                    Activate
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="linklike" onClick={() => setShowKey(true)}>
                I have a license key
              </button>
            )}
            {showKey && productConfig.licenseApi && !lost && (
              <button type="button" className="linklike paywall-lost" onClick={() => setLost(true)}>
                Email me my key
              </button>
            )}
            {lost && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (sending) return
                  setSending(true)
                  const r = await requestKeyEmail(email)
                  setMsg({ ok: r.ok, text: r.message })
                  setSending(false)
                }}
              >
                <label htmlFor="recover-email">The email address you paid with</label>
                <div className="paywall-key-row">
                  <input id="recover-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                  <button type="submit" className="btn" disabled={sending}>
                    {sending ? 'Sending…' : 'Send key'}
                  </button>
                </div>
              </form>
            )}
            {msg && <p className={msg.ok ? 'check-ok' : 'error'}>{msg.text}</p>}
          </div>
        )}
        <p className="paywall-fine">
          Prices in US dollars. Your designs are always yours: if a plan ends, everything you made stays and still opens.
          {productConfig.supportEmail ? ` Questions: ${productConfig.supportEmail}` : ''}
        </p>
      </div>
    </div>
  )
}

/** Monthly subscribers: what a year costs on the yearly price instead. */
function YearlyOffer({ plan }: { plan: PlanId }) {
  const p = planInfo(plan)
  if (!p.monthly || !p.yearly) return null
  const monthlyYear = p.monthly * 12
  const save = Math.round((1 - p.yearly / monthlyYear) * 100)
  if (save <= 0) return null
  return (
    <aside className="pass-offer">
      <div>
        <span className="eyebrow">Save {save}%</span>
        <h3>
          Switch to yearly <span className="pass-price">{money(p.yearly)} a year</span>
        </h3>
        <p>
          Instead of {money(monthlyYear)} a year on monthly billing. Same {p.name} features.
        </p>
      </div>
      {productConfig.billingPortal ? (
        <a className="btn" href={productConfig.billingPortal} target="_blank" rel="noreferrer" onClick={() => track('upgrade_clicked', { plan, billing: 'switch-yearly' })}>
          Switch in billing
        </a>
      ) : productConfig.supportEmail ? (
        <span className="plan-soon">Write to {productConfig.supportEmail} to switch</span>
      ) : null}
    </aside>
  )
}

/** Subscribers share a link; each friend who subscribes earns them a month. */
function InviteBox({ licenseKey, planName }: { licenseKey: string; planName: string }) {
  const [info, setInfo] = useState<{ code: string; count: number } | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [copied, setCopied] = useState(false)
  const load = async () => {
    if (info || state === 'loading') return
    setState('loading')
    const r = await fetchInvite(licenseKey)
    setInfo(r)
    setState(r ? 'idle' : 'error')
  }
  const link = info ? inviteLink(info.code) : ''
  return (
    <details className="paywall-device" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && void load()}>
      <summary>Invite a friend</summary>
      <p className="paywall-fine">
        {productConfig.inviteOffer ? `Friends get ${productConfig.inviteOffer}. ` : ''}You get a month of {planName} free for each friend who subscribes.
      </p>
      {state === 'loading' && <p className="paywall-fine">Getting your link…</p>}
      {state === 'error' && <p className="error">Could not get your invite link. Try again later.</p>}
      {info && (
        <>
          <div className="paywall-key-row">
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Your invite link" spellCheck={false} />
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link)
                  setCopied(true)
                } catch {
                  ;(document.getElementById('invite-link') as HTMLInputElement | null)?.select()
                }
              }}
            >
              <Icon name="copy" size={15} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {info.count > 0 && (
            <p className="check-ok">
              {info.count} friend{info.count === 1 ? ' has' : 's have'} joined. Thank you!
            </p>
          )}
        </>
      )}
    </details>
  )
}

/** The one-time Build Pass, for people planning a single home. */
function PassOffer({ email }: { email?: string }) {
  const url = checkoutUrl('pro', 'pass', email)
  return (
    <aside className="pass-offer">
      <div>
        <span className="eyebrow">Planning one home?</span>
        <h3>
          {PASS.name} <span className="pass-price">{money(PASS.price)} once</span>
        </h3>
        <p>{PASS.blurb}</p>
      </div>
      {url ? (
        <a className="btn" href={url} target="_blank" rel="noreferrer" onClick={() => track('upgrade_clicked', { plan: 'pro', billing: 'pass' })}>
          Get the pass
        </a>
      ) : (
        <span className="plan-soon">Checkout is not connected in this copy yet</span>
      )}
    </aside>
  )
}

/** A small "Pro" or "Studio" tag for buttons that open a paid feature. */
export function PlanTag({ plan }: { plan: PlanId }) {
  const current = useEntitlements((s) => s.plan)
  const ranks: Record<PlanId, number> = { free: 0, pro: 1, studio: 2 }
  if (ranks[current] >= ranks[plan]) return null
  return <span className={`plan-tag-chip is-${plan}`}>{planInfo(plan).name}</span>
}

/** Shown in place of a paid panel: what it does, and how to get it. */
export function LockedFeature({ feature }: { feature: Feature }) {
  const f = FEATURES[feature]
  const started = useEntitlements((s) => s.trialStartedAt)
  const { openPaywall, startTrial } = useEntitlements.getState()
  const trial = trialState(started)
  return (
    <section className="panel-body locked-feature">
      <header className="insp-head">
        <span className="eyebrow">{planInfo(f.plan).name} feature</span>
        <h2>{f.name}</h2>
      </header>
      <p>{f.blurb}</p>
      <div className="btn-row">
        {!trial.used && f.plan !== 'free' && (
          <button type="button" className="btn btn-primary" onClick={() => startTrial(f.plan === 'studio' ? 'studio' : 'pro')}>
            Try {planInfo(f.plan).name} free for {productConfig.trialDays} days
          </button>
        )}
        <button type="button" className="btn" onClick={() => openPaywall(feature)}>
          See plans
        </button>
      </div>
    </section>
  )
}
