/**
 * Keys held for walking, shared by the on-screen pad and the walker. Kept
 * apart from Walker.tsx so the app's first download does not include 3D.
 */
export const walkKeys = { f: false, b: false, l: false, r: false, turnL: false, turnR: false, run: false }
