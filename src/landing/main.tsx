import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import { PASS, PLANS, type PlanId } from '../product/plans'
import { checkoutUrl, productConfig, type Billing } from '../product/config'
import { registerServiceWorker } from '../product/pwa'

const env = import.meta.env as Record<string, string | undefined>
/** Where the app lives. With host rewrites set up (see docs/MONETIZATION.md) this can be "/app". */
const APP = env.VITE_APP_PATH || './index.html'

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
    body: 'Walk through every room at eye height, look out of each window, and check how the light falls at any time of day. Doors are open; furniture is to scale.',
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
  ['Plan from your needs', 'Pick bedrooms, bathrooms, floors and garage; get a furnished plan that passes the design check.'],
  ['Design check', 'Rooms without doors, bedrooms without windows, blocked doors, walls inside setbacks.'],
  ['Whole-home styles', 'Farmhouse, Scandinavian, mid-century and more, applied to every surface in one click.'],
  ['Roofs and stairs', 'Gable, hip, shed and flat roofs in shingle, metal, tile or slate. Straight, L and U stairs.'],
  ['Electrical layout', 'Lights, switches by every door, outlets every 12 ft and smoke alarms, in one click.'],
  ['Lot and setbacks', 'Property lines and building limits on the plan, in 3D and on printed sheets.'],
  ['Exports', 'Floor plan sheets, 3D images, a .glb model for other tools, and spreadsheets.'],
  ['Made for reading', 'Large-text and extra-spacing modes, Lexend or Atkinson Hyperlegible, feet or metres.'],
]

const FAQ: Array<[string, string]> = [
  ['Do I need to install anything?', 'No. Threshold runs in your web browser on a computer, tablet or phone. Your designs save automatically.'],
  ['Where are my designs stored?', 'In your browser on this device. On Pro and Studio they also follow your license to every device you use. You can always save a design file as your own copy.'],
  ['What happens to my designs if I stop paying?', 'Nothing is lost. Every design stays and still opens; only the paid features pause.'],
  ['Can I cancel anytime?', 'Yes. Monthly plans end at the end of the month you cancel in; yearly plans at the end of the year.'],
  ['I only need it for one house. Do I have to subscribe?', `No. The ${PASS.name} is one payment of $${PASS.price} for 6 months of Pro. Nothing renews, and your designs stay when it ends.`],
  ['Can I use the plans with my builder or architect?', 'Yes. Export floor plan sheets, 3D images, a 3D model and the materials list. For a permit, a licensed professional still needs to prepare the construction drawings.'],
  ['Can I use Threshold for client work?', 'Yes, on the Studio plan: your brand on every sheet, a presentation mode for clients, and commercial use of everything you export.'],
]

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
