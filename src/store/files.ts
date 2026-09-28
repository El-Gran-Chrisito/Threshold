/**
 * Saving files. Inside a claude.ai artifact the page asks the viewer through
 * the `downloads` capability; everywhere else a normal browser download.
 */

interface DownloadsNS {
  save: (args: { filename: string; data: string | Blob | ArrayBuffer | Uint8Array; mimeType?: string }) => Promise<unknown>
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> }
  }
}

let downloadsPromise: Promise<DownloadsNS | null> | null = null

function downloads(): Promise<DownloadsNS | null> {
  if (!downloadsPromise) {
    downloadsPromise = window.claude?.use ? (window.claude.use('downloads') as Promise<DownloadsNS | null>).catch(() => null) : Promise.resolve(null)
  }
  return downloadsPromise
}

/** 'unsupported' means this host cannot save that kind of file (the hosted app can). */
export async function saveFile(filename: string, data: string | Blob, mimeType: string): Promise<'saved' | 'declined' | 'failed' | 'unsupported'> {
  const ns = await downloads()
  if (ns) {
    try {
      await ns.save({ filename, data, mimeType })
      return 'saved'
    } catch (e) {
      const code = (e as { code?: string } | null)?.code
      return code === 'rejected_extension' || code === 'extension_not_enabled' ? 'unsupported' : 'declined'
    }
  }
  try {
    const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return 'saved'
  } catch {
    return 'failed'
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream'
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'
}
