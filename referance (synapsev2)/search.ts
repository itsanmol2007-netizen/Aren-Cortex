import type { Observable } from './useSynapse'

// One ranking function, used by both the zone fields and the command palette,
// so a chip that is easy to find in one is equally easy to find in the other.
// search_text carries the colloquial terms (e.g. "nazla" for blocked nose) and
// must rank before a slug match.
export function rank(o: Observable, q: string): number {
  const label = o.label.toLowerCase()
  if (label.startsWith(q)) return 0
  if (label.includes(q)) return 1
  if ((o.searchText || '').toLowerCase().includes(q)) return 2
  if (o.slug.includes(q)) return 3
  return 99
}

// Body-system grouping for the picker. The engine has no concept of a system —
// this is the same status as `domains`, purely how the catalogue is browsed.
//
// It exists because a flat alphabetical list works at 117 chips and does not
// work at ~370: with no query, the doctor was shown the first 40 chips
// alphabetically, which is not a catalogue, it is an accident.
export const SYSTEM_ORDER = [
  'general', 'infection', 'respiratory', 'cardiovascular', 'gastrointestinal',
  'neuro', 'ent', 'eye', 'urinary', 'gynaecology', 'andrology',
  'musculoskeletal', 'skin', 'endocrine', 'allergy', 'psychiatry',
  'paediatrics', 'history',
] as const

export const SYSTEM_LABEL: Record<string, string> = {
  general: 'General',
  infection: 'Infection patterns',
  respiratory: 'Respiratory',
  cardiovascular: 'Cardiovascular',
  gastrointestinal: 'Gastrointestinal',
  neuro: 'Neurological',
  ent: 'ENT & mouth',
  eye: 'Eyes',
  urinary: 'Urinary',
  gynaecology: 'Gynaecology',
  andrology: 'Male reproductive',
  musculoskeletal: 'Musculoskeletal',
  skin: 'Skin',
  endocrine: 'Endocrine',
  allergy: 'Allergy',
  psychiatry: 'Mental health',
  paediatrics: 'Paediatric',
  history: 'History & risk',
}

const SYSTEM_RANK = new Map(SYSTEM_ORDER.map((s, i) => [s as string, i]))

export interface SystemGroup {
  system: string
  label: string
  items: Observable[]
}

/**
 * Bucket already-ranked results by system, preserving the incoming rank order
 * inside each bucket. Groups appear in SYSTEM_ORDER so the list reads the same
 * way every time — a picker whose section order moves under you is worse than
 * no sections at all.
 */
export function groupBySystem(results: Observable[]): SystemGroup[] {
  const buckets = new Map<string, Observable[]>()
  for (const o of results) {
    const key = o.system || 'general'
    const list = buckets.get(key)
    if (list) list.push(o)
    else buckets.set(key, [o])
  }
  return [...buckets.entries()]
    .sort((a, b) => (SYSTEM_RANK.get(a[0]) ?? 99) - (SYSTEM_RANK.get(b[0]) ?? 99))
    .map(([system, items]) => ({ system, label: SYSTEM_LABEL[system] ?? system, items }))
}

/** Rank-filter a pool against a query. Empty query returns the pool alphabetically. */
export function searchChips(pool: Observable[], query: string, limit = 40): Observable[] {
  const q = query.trim().toLowerCase()
  const scored = q
    ? pool.map((o) => ({ o, r: rank(o, q) })).filter((x) => x.r < 99)
    : pool.map((o) => ({ o, r: 0 }))
  scored.sort((a, b) => a.r - b.r || a.o.label.localeCompare(b.o.label))
  return scored.slice(0, limit).map((x) => x.o)
}

// Which zone a chip belongs to. The engine has no concept of zones — this is
// purely how the consultation is laid out, and it is what lets the command
// palette accept any chip and route it without the clinician choosing a target.
export type Zone = 'patient' | 'reported' | 'examined'

export const ZONE_OF: Record<Observable['kind'], Zone> = {
  history: 'patient',
  symptom: 'reported',
  finding: 'examined',
}

export const ZONE_LABEL: Record<Zone, string> = {
  patient: 'Patient',
  reported: 'Reported',
  examined: 'Examined',
}

// Age is entered as a number and injected as a measurement, which is what fires
// ELDERLY / PEDIATRIC. These two chips map to the same signals, so once an age
// is present they are derived from it rather than set by hand — otherwise a
// 34-year-old can be marked elderly and both are "true" at once.
export const AGE_DERIVED: Partial<Record<string, (age: number) => boolean>> = {
  elderly: (age) => age >= 65,
  pediatric: (age) => age < 12,
}
