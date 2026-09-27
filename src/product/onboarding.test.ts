import { describe, expect, it } from 'vitest'
import { useStore } from '../store/store'
import { useOnboarding, watchOnboarding } from './onboarding'
import { buildTemplate } from '../model/templates'
import { makeItem } from '../model/factory'

describe('getting started', () => {
  it('ticks steps from real edits, not from opening another design', () => {
    const stop = watchOnboarding()
    useStore.getState().loadProject(buildTemplate('studio'))
    useStore.getState().loadProject(buildTemplate('family'))
    expect(useOnboarding.getState().done).toEqual([])
    useStore.getState().applyLevel((l) => ({ ...l, items: [...l.items, makeItem('sofa-3', { x: 100, y: 100 })] }))
    useStore.getState().applyLevel((l) => ({ ...l, rooms: l.rooms.map((r, k) => (k === 0 ? { ...r, floor: 'walnut' } : r)) }))
    useStore.getState().setView('walk')
    expect(useOnboarding.getState().done.sort()).toEqual(['finish', 'item', 'walk'])
    stop()
  })
})
