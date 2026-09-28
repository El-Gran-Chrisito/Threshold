import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import { FEATURES, FREE_LIMITS, PASS, PLANS, allows, type Feature, type PlanId } from '../product/plans'
import { FAQ } from './faq'
import { checkoutUrl, productConfig, type Billing } from '../product/config'
import { registerServiceWorker } from '../product/pwa'
import { captureInvite, storedInvite } from '../product/invite'

const env = import.meta.env as Record<string, string | undefined>
/** Where the app lives. With host rewrites set up (see docs/MONETIZATION.md) this can be "/app". */
const APP = env.VITE_APP_PATH || './index.html'
// An invite link (?invite=...) is kept for checkout on this page and in the app.
const INVITED = captureInvite() ?? storedInvite()
// The plan library pages exist in the hosted build, not in the one-file preview.
const HAS_PLAN_PAGES = !import.meta.env.MODE.startsWith('artifact')

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <path d="M4 28V14L16 4l12 10v14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12 28v-9h8v9" fill="var(--accent)" />
      <path d="M2 28h28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** A red-pencil dimension line, the way plans label a length. */
function Dim({ label }: { label: string }) {
  return (
    <div className="dim" aria-hidden>
      <span className="dim-tick" />
      <span className="dim-line" />
      <span className="dim-label">{label}</span>
      <span className="dim-line" />
      <span className="dim-tick" />
    </div>
  )
}

function Shot({ src, alt, caption, eager = false }: { src: string; alt: string; caption?: string; eager?: boolean }) {
  return (
    <figure className="shot">
      <div className="shot-frame">
        <span className="shot-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} width={1600} height={1000} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

const STORIES: Array<{ title: string; body: string; img: string; alt: string; dim: string }> = [
  {
    title: 'Draw it the way you think',
    body: `Drag out rooms, type exact sizes like 12' 6" or 3.8 m, and click any room’s size to change it. Doors, windows and stairs snap into walls. The plan reads like the drawings your builder will make.`,
    img: 'shots/plan.jpg',
    alt: 'A two-storey family home floor plan with room names, areas and dimensions',
    dim: `31' 6"`,
  },
  {
    title: 'Stand in your kitchen before it exists',
    body: 'Walk through every room at eye height, look out of each window, and check how the light falls at any hour and in any season. Doors are open; furniture is to scale.',
    img: 'shots/walk.jpg',
    alt: 'Standing at the kitchen counter, looking through a window at the garden',
    dim: `5' 7" eye height`,
  },
  {
    title: 'Pull the house apart',
    body: 'The exploded view lifts the roof, separates the floors and spreads the walls so every part is within reach. Click any piece to change it: walls, floors, furniture, windows.',
    img: 'shots/explode.jpg',
    alt: 'An exploded 3D view of a house with floors and roof separated',
    dim: '2 floors',
  },
  {
    title: 'See it on the street, at dusk',
    body: 'Your home sits on a real-looking street with a driveway, a front path, planting beds and neighbours. Slide the sun to evening and watch the windows light up.',
    img: 'shots/night.jpg',
    alt: 'The house seen from across the street in the evening with lit windows',
    dim: 'Dusk · 8:30 pm',
  },
  {
    title: 'Know what it costs and what to buy',
    body: 'A running estimate for flooring, walls, roofing, doors and furniture, and a shopping list with paint in gallons, flooring with cutting waste and roofing in bundles.',
    img: 'shots/split.jpg',
    alt: 'Plan and 3D side by side with the shopping list open',
    dim: '20 gal · 2 coats',
  },
]

const EXTRAS: Array<[string, string]> = [
  ['Start from a plan', 'Pick bedrooms, bathrooms, floors and garage for a furnished plan, or open a ready-made home from the plan library.'],
  ['Design check', 'Rooms without doors, bedrooms without windows, blocked doors, walls inside setbacks.'],
  ['Whole-home styles', 'Farmhouse, Scandinavian, mid-century and more, applied to every surface in one click.'],
  ['Roofs and stairs', 'Gable, hip, shed and flat roofs in shingle, metal, tile or slate. Straight, L and U stairs.'],
  ['Electrical layout', 'Lights, switches by every door, outlets every 12 ft and smoke alarms, in one click.'],
  ['Lot and setbacks', 'Property lines and building limits on the plan, in 3D and on printed sheets.'],
  ['Sun and daylight', 'The real sun for your latitude on any day of the year, and the hours of direct sun each room gets in summer and winter.'],
  ['Design versions', 'Save named versions of a design, try a bold idea, and go back to any version.'],
  ['Share a link', 'Send a link that opens your design in 3D. The person who opens it needs no account.'],
  ['Works offline', 'Install it like an app. It keeps working without a connection.'],
  ['Exports', 'A PDF plan set for your builder, floor plan sheets, 3D images, a .glb model for other tools, and spreadsheets.'],
  ['Made for reading', 'Large-text and extra-spacing modes, Lexend or Atkinson Hyperlegible, feet or metres.'],
]


/** Every feature by plan, from the same list the app uses to unlock them. */
const BASICS = ['Floor plans, walls, doors, windows and stairs', '3D, walk-through and exploded view', 'Furniture, finishes and whole-home styles (2 free)', 'Design check and cost estimate', 'Share links and design files']
const ORDER: Feature[] = ['unlimited-designs', 'plan-set', 'clean-exports', 'hd-exports', 'model-export', 'shopping-export', 'electrical', 'assistant', 'all-styles', 'surroundings', 'sun-study', 'plan-library', 'versions', 'sync', 'branding', 'presentation']

function Compare() {
  const cols: PlanId[] = ['free', 'pro', 'studio']
  const mark = (on: boolean) => (on ? <span className="yes" aria-label="Included">✓</span> : <span className="no" aria-label="Not included">–</span>)
  return (
    <details className="compare">
      <summary>Compare every feature</summary>
      <div className="compare-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {cols.map((c) => (
                <th key={c} scope="col">
                  {PLANS.find((p) => p.id === c)!.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BASICS.map((b) => (
              <tr key={b}>
                <th scope="row">{b}</th>
                {cols.map((c) => (
                  <td key={c}>{mark(true)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">Designs kept</th>
              <td>{FREE_LIMITS.designs}</td>
              <td>Unlimited</td>
              <td>Unlimited</td>
            </tr>
            {ORDER.filter((f) => f !== 'unlimited-designs').map((f) => (
              <tr key={f}>
                <th scope="row">{FEATURES[f].name}</th>
                {cols.map((c) => (
                  <td key={c}>{mark(allows(c, f))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function Pricing() {
  const [billing, setBilling] = useState<Billing>('yearly')
  const cta = (id: PlanId) => (id === 'free' ? APP : checkoutUrl(id, billing) ?? APP)
  return (
    <section id="pricing" className="band pricing">
      <div className="wrap">
        <h2>Simple pricing</h2>
        <p className="lede">Start free. Upgrade when you are ready to share, print or build.</p>
        <div className="toggle" role="radiogroup" aria-label="Billing">
          {(['yearly', 'monthly'] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={billing === b} className={billing === b ? 'is-on' : ''} onClick={() => setBilling(b)}>
              {b === 'yearly' ? 'Yearly · save up to 33%' : 'Monthly'}
            </button>
          ))}
        </div>
        <div className="plans">
          {PLANS.map((p) => {
            const price = billing === 'yearly' ? p.yearly / 12 : p.monthly
            return (
              <article key={p.id} className={`plan${p.id === 'pro' ? ' is-featured' : ''}`}>
                {p.id === 'pro' && <span className="flag">Most popular</span>}
                <h3>{p.name}</h3>
                <p className="price">
                  <strong>${Number.isInteger(price) ? price : price.toFixed(2)}</strong>
                  <span>{p.monthly ? '/ month' : 'forever'}</span>
                </p>
                <p className="bill">{p.monthly ? (billing === 'yearly' ? `$${p.yearly} billed yearly` : 'Billed monthly') : 'No card needed'}</p>
                <p className="tag">{p.tagline}</p>
                <ul>
                  {p.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <a className={`btn${p.id === 'pro' ? ' btn-primary' : ''}`} href={cta(p.id)} target={p.id !== 'free' && checkoutUrl(p.id, billing) ? '_blank' : undefined} rel="noreferrer">
                  {p.id === 'free' ? 'Start designing' : `Get ${p.name}`}
                </a>
              </article>
            )
          })}
        </div>
        <aside className="pass">
          <div>
            <h3>
              Planning one home? <span>{PASS.name}</span>
            </h3>
            <p>{PASS.blurb}</p>
          </div>
          <p className="price">
            <strong>${PASS.price}</strong>
            <span>once</span>
          </p>
          <a className="btn" href={checkoutUrl('pro', 'pass') ?? APP} target={checkoutUrl('pro', 'pass') ? '_blank' : undefined} rel="noreferrer">
            Get the pass
          </a>
        </aside>
        <Compare />
        <p className="fine">Prices in US dollars. Pro includes a {productConfig.trialDays}-day free trial inside the app, no card needed.</p>
      </div>
    </section>
  )
}

function Landing() {
  const year = new Date().getFullYear()
  return (
    <>
      <header className="nav">
        <div className="wrap nav-row">
          <a className="logo" href="./home.html">
            <Mark /> Threshold
          </a>
          <nav aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#studio">For professionals</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">Questions</a>
          </nav>
          <a className="btn btn-primary btn-small" href={APP}>
            Open the app
          </a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            {INVITED && productConfig.inviteOffer && <p className="invited">A friend invited you: {productConfig.inviteOffer} when you choose a plan.</p>}
            <p className="eyebrow">Home design in your browser</p>
            <h1>See your home before it is built.</h1>
            <p className="lede">Draw the floor plan, furnish every room, choose every finish, and walk through it in 3D on the street it will stand on. Free to start, nothing to install.</p>
            <div className="cta-row">
              <a className="btn btn-primary btn-big" href={APP}>
                Start designing free
              </a>
              <a className="btn btn-big" href="#pricing">
                See pricing
              </a>
            </div>
            <Dim label="From sketch to walk-through in minutes" />
            <Shot eager src="shots/street.jpg" alt="Threshold showing a two-storey brick and siding home from across a suburban street" />
          </div>
        </section>

        <section className="band steps">
          <div className="wrap">
            <h2>Three steps</h2>
            <ol className="step-list">
              <li>
                <span className="step-n">1</span>
                <h3>Say what you need</h3>
                <p>Bedrooms, bathrooms, floors, garage. Threshold lays out a furnished plan you can change, or you start from a blank lot.</p>
              </li>
              <li>
                <span className="step-n">2</span>
                <h3>Shape every room</h3>
                <p>Move walls, type sizes, place doors and windows, pick floors, paint, cabinets and furniture from over 100 pieces.</p>
              </li>
              <li>
                <span className="step-n">3</span>
                <h3>Walk through it</h3>
                <p>Explore in 3D, pull it apart, walk inside, see it at dusk, then export plans, images and a shopping list.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="features" className="stories">
          {STORIES.map((s, k) => (
            <div key={s.title} className={`story${k % 2 ? ' is-flipped' : ''}`}>
              <div className="wrap story-row">
                <div className="story-text">
                  <Dim label={s.dim} />
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </div>
                <Shot src={s.img} alt={s.alt} />
              </div>
            </div>
          ))}
        </section>

        <section className="band handoff">
          <div className="wrap story-row">
            <div className="story-text">
              <Dim label="Letter or A4 · Pro" />
              <h2>Hand your builder a plan set</h2>
              <p>One PDF with a cover, 3D views from the street, the corner, the garden and above, a dimensioned sheet for every floor, a room schedule with finishes and ceiling heights, a cost estimate and the shopping list. Print it, or send it to your builder, designer or family.</p>
              <a className="btn btn-primary handoff-cta" href="#pricing">
                See Pro and the Build Pass
              </a>
            </div>
            <div className="sheets" role="img" aria-label="Three pages from a sample plan set: the cover, the ground floor plan and the 3D views">
              <img src="shots/set-views.jpg" alt="" loading="lazy" width={1100} height={850} />
              <img src="shots/set-plan.jpg" alt="" loading="lazy" width={1100} height={850} />
              <img src="shots/set-cover.jpg" alt="" loading="lazy" width={1100} height={850} />
            </div>
          </div>
        </section>

        <section id="studio" className="story is-flipped studio-band">
          <div className="wrap story-row">
            <div className="story-text">
              <Dim label="Studio · for professionals" />
              <h2>Show clients their home, under your name</h2>
              <p>Send a link that opens a guided 3D tour with your logo and your client's name; they need no account. Your brand goes on every plan sheet and plan set, and everything you export is yours to use in client work.</p>
              <a className="btn btn-primary handoff-cta" href="#pricing">
                See Studio
              </a>
            </div>
            <Shot src="shots/studio.jpg" alt="A client presentation showing a studio's logo, the client's name and a 3D view of the house from the street" />
          </div>
        </section>

        <section className="band extras">
          <div className="wrap">
            <h2>Everything else a home needs</h2>
            <div className="extra-grid">
              {EXTRAS.map(([t, b]) => (
                <div key={t} className="extra">
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Pricing />

        <section id="faq" className="band faq">
          <div className="wrap narrow">
            <h2>Questions</h2>
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <h2>Your next home starts with a line.</h2>
            <a className="btn btn-primary btn-big" href={APP}>
              Start designing free
            </a>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-row">
          <span>© {year} Threshold</span>
          <nav aria-label="Legal">
            {HAS_PLAN_PAGES && <a href="plans/index.html">House plans</a>}
            <a href="legal/terms.html">Terms</a>
            <a href="legal/privacy.html">Privacy</a>
            <a href="legal/refunds.html">Refunds</a>
          </nav>
          {productConfig.supportEmail && <span className="support">{productConfig.supportEmail}</span>}
        </div>
      </footer>
    </>
  )
}

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
