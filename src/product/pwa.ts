/** Offline support and install for hosted builds (never inside Claude or the one-file build). */
export function registerServiceWorker() {
  if (import.meta.env.MODE.startsWith('artifact') || import.meta.env.DEV) return
  if (!('serviceWorker' in navigator) || (window as { claude?: unknown }).claude) return
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (location.protocol !== 'https:' && !local) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })
}
