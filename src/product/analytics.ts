/**
 * Product events for the upgrade funnel. Nothing leaves the device by
 * default: events go to an in-memory list and a DOM event, and to Plausible
 * only when the host page has loaded it.
 */

export type ProductEvent = 'paywall_shown' | 'upgrade_clicked' | 'trial_started' | 'trial_ended_shown' | 'license_activated' | 'license_failed' | 'export' | 'design_created'

const log: Array<{ event: ProductEvent; props?: Record<string, string>; at: number }> = []

export function track(event: ProductEvent, props?: Record<string, string>) {
  log.push({ event, props, at: Date.now() })
  if (log.length > 200) log.shift()
  try {
    window.dispatchEvent(new CustomEvent('threshold:track', { detail: { event, props } }))
    const w = window as unknown as { plausible?: (e: string, o?: { props?: Record<string, string> }) => void }
    w.plausible?.(event, props ? { props } : undefined)
  } catch {
    /* no window in tests */
  }
}

export function trackedEvents() {
  return [...log]
}
