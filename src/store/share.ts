/**
 * Share a design as a link: the whole design, gzip-compressed, in the URL
 * hash (#design=...). Nothing is uploaded; whoever opens the link gets their
 * own copy. Works wherever the app is hosted on its own address.
 */
import type { Project } from '../model/types'
import { normalizeProject } from './persistence'

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

export async function encodeDesign(p: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p))
  return toB64url(await pipe(json, new CompressionStream('gzip')))
}

export async function decodeDesign(code: string): Promise<Project> {
  const bytes = await pipe(fromB64url(code), new DecompressionStream('gzip'))
  return normalizeProject(JSON.parse(new TextDecoder().decode(bytes)))
}

/** A link to this page that opens the design. */
export async function shareLink(p: Project, base = window.location.href.split('#')[0]): Promise<string> {
  return `${base}${PREFIX}${await encodeDesign(p)}`
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
