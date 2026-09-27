import { useMemo, useState } from 'react'
import { briefArea, DEFAULT_BRIEF, planFromBrief, type Brief } from '../model/brief'
import type { Project } from '../model/types'
import { Field, Segmented, Toggle } from './controls'

/** Pick bedrooms, bathrooms, floors and garage; get a furnished starting plan. */
export function BriefForm({ onMake, submitLabel = 'Make my plan' }: { onMake: (p: Project) => void; submitLabel?: string }) {
  const [b, setB] = useState<Brief>(DEFAULT_BRIEF)
  const set = (patch: Partial<Brief>) => setB((x) => ({ ...x, ...patch }))
  const preview = useMemo(() => planFromBrief(b), [b])
  const rooms = preview.levels.reduce((s, l) => s + l.rooms.filter((r) => !/^(hall|stairs|landing)/i.test(r.name)).length, 0)
  return (
    <form
      className="brief-form"
      onSubmit={(e) => {
        e.preventDefault()
        onMake(planFromBrief(b))
      }}
    >
      <Field label="Bedrooms">
        <Segmented label="Bedrooms" value={String(b.bedrooms)} onChange={(v) => set({ bedrooms: Number(v) })} options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Bathrooms" hint=".5 adds a powder room (toilet and sink)">
        <Segmented label="Bathrooms" value={String(b.bathrooms)} onChange={(v) => set({ bathrooms: Number(v) })} options={['1', '1.5', '2', '2.5', '3'].map((v) => ({ value: v, label: v }))} />
      </Field>
      <div className="grid-2">
        <Field label="Floors">
          <Segmented label="Floors" value={String(b.storeys)} onChange={(v) => set({ storeys: Number(v) as 1 | 2 })} options={[{ value: '1', label: 'One' }, { value: '2', label: 'Two' }]} />
        </Field>
        <Field label="Garage (cars)">
          <Segmented label="Garage" value={String(b.garage)} onChange={(v) => set({ garage: Number(v) as 0 | 1 | 2 })} options={[{ value: '0', label: 'None' }, { value: '1', label: '1' }, { value: '2', label: '2' }]} />
        </Field>
      </div>
      <Toggle id="brief-office" checked={b.office} onChange={(v) => set({ office: v })} label="Home office" />
      <Toggle id="brief-open" checked={b.openPlan} onChange={(v) => set({ openPlan: v })} label="Open-plan kitchen, dining and living" />
      <p className="brief-summary">
        <strong>{briefArea(preview).toLocaleString()} sq ft</strong> · {rooms} rooms · furnished · every wall, door and item editable
      </p>
      <button type="submit" className="btn btn-primary">
        {submitLabel}
      </button>
    </form>
  )
}
