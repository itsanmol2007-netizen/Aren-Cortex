// Measurement input catalogue.
//
// The engine only ever receives { measureKey, value }. Everything here —
// labels, units, which specialty surfaces it, sane ranges — is UI concern.
// AGE is deliberately absent: it is patient context, injected from the header
// on every run so ELDERLY / PEDIATRIC can fire (see handoff §2.4).

export type Specialty = 'opd' | 'physio'

export interface MeasureDef {
  key: string
  label: string
  unit: string
  /** which specialty views surface this input */
  show: Specialty[]
  group: 'vitals' | 'labs' | 'physio'
  min?: number
  max?: number
  step?: number
  /** short helper shown under the field, e.g. a threshold hint */
  hint?: string
}

// Blood pressure is one control but TWO measurements. If the app ever writes a
// single "170/100" it silently never fires a signal (handoff §2.4). We emit
// BP_SYS and BP_DIA as separate rows, always.
export const BP_SYS = 'BP_SYS'
export const BP_DIA = 'BP_DIA'

export const MEASURES: MeasureDef[] = [
  { key: 'HR', label: 'Heart rate', unit: 'bpm', show: ['opd'], group: 'vitals', min: 20, max: 250 },
  { key: 'SPO2', label: 'SpO₂', unit: '%', show: ['opd'], group: 'vitals', min: 50, max: 100 },
  { key: 'TEMP', label: 'Temperature', unit: '°C', show: ['opd'], group: 'vitals', min: 34, max: 43, step: 0.1 },
  { key: 'RR', label: 'Respiratory rate', unit: '/min', show: ['opd'], group: 'vitals', min: 5, max: 60 },
  { key: 'GLUCOSE_RANDOM', label: 'Random glucose', unit: 'mg/dL', show: ['opd'], group: 'labs', min: 20, max: 800 },
  { key: 'GLUCOSE_FASTING', label: 'Fasting glucose', unit: 'mg/dL', show: ['opd'], group: 'labs', min: 20, max: 800 },
  { key: 'HBA1C', label: 'HbA1c', unit: '%', show: ['opd'], group: 'labs', min: 3, max: 18, step: 0.1 },

  { key: 'PAIN_VAS', label: 'Pain', unit: '/10', show: ['physio'], group: 'physio', min: 0, max: 10 },
  { key: 'ROM_PCT', label: 'Range of motion', unit: '%', show: ['physio'], group: 'physio', min: 0, max: 100, hint: 'Achieved ÷ expected' },
  { key: 'MMT', label: 'Muscle power (MMT)', unit: '/5', show: ['physio'], group: 'physio', min: 0, max: 5 },
  { key: 'GRIP_KG', label: 'Grip strength', unit: 'kg', show: ['physio'], group: 'physio', min: 0, max: 100 },
]

/**
 * Every measure key a specialty actually shows. Blood pressure is surfaced in
 * both views (physio needs it for exercise safety), so it is always included.
 * Used to discard values the doctor can no longer see after switching view —
 * an invisible input that still feeds the engine is a silent wrong answer.
 */
export function visibleMeasureKeys(specialty: Specialty): Set<string> {
  const keys = new Set<string>([BP_SYS, BP_DIA])
  for (const m of MEASURES) if (m.show.includes(specialty)) keys.add(m.key)
  return keys
}

/** Ordered groups for a specialty, ready to render. */
export function measureGroups(specialty: Specialty) {
  const groups: { key: MeasureDef['group']; title: string; items: MeasureDef[] }[] = [
    { key: 'vitals', title: 'Vitals', items: [] },
    { key: 'labs', title: 'Bedside labs', items: [] },
    { key: 'physio', title: 'Physical measures', items: [] },
  ]
  for (const m of MEASURES) {
    if (!m.show.includes(specialty)) continue
    groups.find((g) => g.key === m.group)!.items.push(m)
  }
  return groups.filter((g) => g.items.length > 0)
}
