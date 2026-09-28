/**
 * Share a design as a link: the whole design, gzip-compressed, in the URL
 * hash (#design=...). Nothing is uploaded; whoever opens the link gets their
 * own copy. Works wherever the app is hosted on its own address.
 */
import type { Project } from '../model/types'
import type { Brand } from '../product/brand'
import { normalizeProject } from './persistence'

/** What a link carries: the design, and for a client link the sender's brand and "open as a presentation". */
export interface Shared {
  project: Project
  present: boolean
  brand: Brand | null
}

const PREFIX = '#design='

function toB64url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(data: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

async function pack(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value))
  return toB64url(await pipe(json, new CompressionStream('gzip')))
}

export const encodeDesign = (p: Project) => pack(p)

/** A client link: the design opens as a presentation with the sender's brand. */
export const encodePresentation = (p: Project, brand: Brand | null) => pack({ v: 2, present: true, brand, project: p })

export async function decodeShared(code: string): Promise<Shared> {
  const bytes = await pipe(fromB64url(code), new DecompressionStream('gzip'))
  const data = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
  if (data.v === 2 && data.project) {
    const b = data.brand as Partial<Brand> | null
    const brand = b ? { company: String(b.company ?? '').slice(0, 120), contact: String(b.contact ?? '').slice(0, 200), logo: typeof b.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) ? b.logo : null } : null
    return { project: normalizeProject(data.project), present: !!data.present, brand }
  }
  return { project: normalizeProject(data), present: false, brand: null }
}

export async function decodeDesign(code: string): Promise<Project> {
  return (await decodeShared(code)).project
}

/** A link to this page that opens the design (as a branded presentation when `brand` is given). */
export async function shareLink(p: Project, base = window.location.href.split('#')[0], present?: { brand: Brand | null }): Promise<string> {
  return `${base}${PREFIX}${present ? await encodePresentation(p, present.brand) : await encodeDesign(p)}`
}

/** The design in the current address, if any. */
export function sharedCode(hash = window.location.hash): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null
}

/** Share links only work where the page owns its address (not inside an embedded preview). */
export function canShareLinks(): boolean {
  try {
    return window.top === window && !window.claude
  } catch {
    return false
  }
}
