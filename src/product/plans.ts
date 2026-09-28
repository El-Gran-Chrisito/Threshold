/**
 * Plans and what each one includes. Everything needed to design a home and
 * see it in 3D is free; Pro adds finished outputs and time-savers; Studio adds
 * what professionals need to present to clients.
 */

export type PlanId = 'free' | 'pro' | 'studio'

export const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1, studio: 2 }

export type Feature =
  | 'unlimited-designs'
  | 'clean-exports'
  | 'hd-exports'
  | 'model-export'
  | 'shopping-export'
  | 'electrical'
  | 'assistant'
  | 'surroundings'
  | 'all-styles'
  | 'branding'
  | 'presentation'
  | 'sync'

export const FEATURES: Record<Feature, { name: string; blurb: string; plan: PlanId }> = {
  'unlimited-designs': { name: 'Unlimited designs', blurb: 'Free keeps up to 3 designs. Keep every idea and version with Pro, or delete a design in Project to make room.', plan: 'pro' },
  'clean-exports': { name: 'Exports without a watermark', blurb: 'Floor plans and 3D images ready to share with builders, banks and family.', plan: 'pro' },
  'hd-exports': { name: 'High-resolution exports', blurb: 'Print-quality floor plan sheets at twice the resolution.', plan: 'pro' },
  'model-export': { name: '3D model export', blurb: 'Download the whole home as a .glb model for other 3D tools, AR and rendering.', plan: 'pro' },
  'shopping-export': { name: 'Shopping list export', blurb: 'Save the materials and furniture list as a spreadsheet for suppliers and contractors.', plan: 'pro' },
  electrical: { name: 'One-click electrical layout', blurb: 'Lights, switches, outlets and smoke alarms placed in every room.', plan: 'pro' },
  assistant: { name: 'Design assistant', blurb: 'Describe a change in plain words, or upload a photo of a floor plan, and it is drawn for you.', plan: 'pro' },
  surroundings: { name: 'Garden and countryside settings', blurb: 'See the home in a private garden or in the countryside, not only on a street.', plan: 'pro' },
  'all-styles': { name: 'All whole-home styles', blurb: 'Every designer style for walls, floors, roof, cabinets and furniture in one click.', plan: 'pro' },
  sync: { name: 'Designs on all your devices', blurb: 'Your designs follow your license to every browser you use, and survive cleared browser data.', plan: 'pro' },
  branding: { name: 'Your brand on plan sheets', blurb: 'Your company name, contact and logo in the title block of every floor plan.', plan: 'studio' },
  presentation: { name: 'Client presentation mode', blurb: 'A full-screen, guided 3D tour of the home to show clients, with your branding.', plan: 'studio' },
}

/** What the free plan allows before asking to upgrade. */
export const FREE_LIMITS = { designs: 3, styles: 2 }

export interface PlanInfo {
  id: PlanId
  name: string
  tagline: string
  /** US dollars. Yearly is the price per year. */
  monthly: number
  yearly: number
  bullets: string[]
}

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Design your home and see it in 3D',
    monthly: 0,
    yearly: 0,
    bullets: [`Up to ${FREE_LIMITS.designs} designs`, 'Every drawing and furnishing tool', '3D, walk-through and exploded view', 'Design check and cost estimate', 'Exports with a small watermark'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For planning a real build or renovation',
    monthly: 12,
    yearly: 96,
    bullets: ['Unlimited designs, synced across devices', 'Watermark-free, high-resolution exports', '3D model (.glb) export', 'Shopping list spreadsheet', 'One-click electrical layout', 'Design assistant', 'All styles and surroundings'],
  },
  {
    id: 'studio',
    name: 'Studio',
    tagline: 'For designers, builders and agents',
    monthly: 29,
    yearly: 288,
    bullets: ['Everything in Pro', 'Your brand on every plan sheet', 'Client presentation mode', 'Commercial use of all outputs', 'Priority support'],
  },
]

/**
 * One payment, no subscription: Pro for the length of a typical design
 * phase. For people planning one home who do not want another subscription.
 */
export const PASS = {
  name: 'Pro Build Pass',
  plan: 'pro' as const,
  price: 49,
  days: 183,
  blurb: 'Everything in Pro for 6 months. One payment, nothing renews.',
}

export const planInfo = (id: PlanId) => PLANS.find((p) => p.id === id)!

export function allows(plan: PlanId, feature: Feature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURES[feature].plan]
}
