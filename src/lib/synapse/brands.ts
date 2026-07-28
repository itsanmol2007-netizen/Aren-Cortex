// ---------------------------------------------------------------------------
// Brand resolution — the fast-learning layer.
//
// A doctor prescribes a BRAND, not a composition. Thousands of medicines share
// one composition, and each doctor reaches for one or two. Once the engine has
// ranked the composition, this module orders the brands beneath it for one
// doctor, using their own history.
//
// This is deliberately SEPARATE from composition-level preference (personalize.ts):
//
//   * Choosing a brand within an already-chosen composition is a habit, not a
//     clinical decision — the molecule is already picked, so the risk is
//     near-zero and it should feel near-instant. The view behind it
//     (v_doctor_brand_preference) uses a confidence constant of 0.5, so one
//     decision buys ~0.67 confidence and two buy ~0.80.
//   * Composition-level preference stays SLOW (constant 3) because it is a
//     clinical judgement and must not flip on one data point.
//
// Like personalize.ts, this sits entirely downstream of the engine. It never
// scores anything and never touches result.blocked. Delete this module and the
// view and every clinical score is byte-identical; only brand ORDER changes.
// Guards act on the composition intent upstream — a blocked composition is never
// resolved to brands at all, so a brand preference can never unblock anything.
// ---------------------------------------------------------------------------

/** Dosage form. In this schema it is `medicine_composition_map.route`. */
export type Form = string // 'tablet' | 'syrup' | 'drops' | 'injection' | 'topical' | 'inhalation'

/**
 * Oral forms appropriate for a paediatric patient. When the PEDIATRIC signal is
 * active, a preference learned on an adult form (a tablet) must NOT be inherited
 * into the child's case — Calpol 650 tablet and Calpol syrup are different
 * prescriptions. This is enforced explicitly in `resolveBrands`, not left to
 * fall out of the key.
 */
export const PEDIATRIC_FORMS: ReadonlySet<Form> = new Set(['syrup', 'drops'])

export interface Medicine {
  id: number
  compositionId: number
  name: string
  /** dosage form / route — part of the preference key */
  form: Form | null
  /** how often this brand is prescribed overall; popularity fallback */
  prescriptionCount: number
  /** clinic-configured default brand for this composition */
  isClinicDefault: boolean
  /**
   * Where the catalogue lookup placed this brand, lower first. Optional: it
   * exists because alphabetical is a genuinely terrible last resort — it makes
   * "A 250 Suspension" the face of paracetamol ahead of Calpol — and the
   * lookup knows things the sort does not, such as which forms suit a
   * paediatric case. Ranked below the clinic default and popularity, which are
   * real evidence; above alphabetical, which is none. Absent means "no opinion"
   * and falls through to the name.
   */
  catalogueRank?: number
}

export interface BrandPreference {
  compositionId: number
  medicineId: number
  form: Form | null
  /** model output in [-1, 1] — consistency x confidence */
  preference: number
}

export interface BrandContext {
  /** every brand available for the composition being resolved (fetched upstream) */
  candidates: Medicine[]
  /** PEDIATRIC signal active — adult-form preferences do not apply */
  isPediatric: boolean
}

/** (composition, medicine, form) -> preference row. Built once per session. */
export type BrandPreferenceModel = Map<string, BrandPreference>

export const brandKey = (compositionId: number, medicineId: number, form: Form | null) =>
  `${compositionId}|${medicineId}|${form ?? '*'}`

export function buildBrandModel(rows: BrandPreference[]): BrandPreferenceModel {
  return new Map(rows.map((r) => [brandKey(r.compositionId, r.medicineId, r.form), r]))
}

/** Whether a preference learned on `form` may be applied in this context. */
function formApplies(form: Form | null, ctx: BrandContext): boolean {
  if (!ctx.isPediatric) return true
  // In a paediatric case only paediatric-appropriate forms carry preference.
  // An unknown (null) form is treated as not-applicable, which is the safe side.
  return form != null && PEDIATRIC_FORMS.has(form)
}

/**
 * Order the brands of ONE composition for ONE doctor.
 *
 * Fallback chain, strongest tier first:
 *   1. learned preference   (higher first; neutralised when the form does not apply)
 *   2. clinic default
 *   3. most-prescribed
 *   4. catalogue rank       (the order the lookup fetched them in, if it had one)
 *   5. alphabetical
 *
 * `resolveBrands` only reorders the candidates the caller already fetched; it
 * never introduces or removes a brand. A negative learned preference sinks a
 * brand below the neutral fallbacks, which is the doctor actively avoiding it.
 */
export function resolveBrands(
  compositionId: number,
  brandPrefs: BrandPreferenceModel,
  context: BrandContext,
): Medicine[] {
  const candidates = context.candidates.filter((m) => m.compositionId === compositionId)

  const effectivePref = (m: Medicine): number => {
    const row = brandPrefs.get(brandKey(compositionId, m.id, m.form))
    if (!row) return 0
    if (!formApplies(m.form, context)) return 0 // adult-form pref neutralised in paediatric
    return row.preference
  }

  return [...candidates].sort((a, b) => {
    const pa = effectivePref(a)
    const pb = effectivePref(b)
    if (pa !== pb) return pb - pa // 1. learned preference
    if (a.isClinicDefault !== b.isClinicDefault) return a.isClinicDefault ? -1 : 1 // 2. clinic default
    if (a.prescriptionCount !== b.prescriptionCount) return b.prescriptionCount - a.prescriptionCount // 3. most-prescribed
    const ra = a.catalogueRank ?? Infinity
    const rb = b.catalogueRank ?? Infinity
    if (ra !== rb) return ra - rb // 4. catalogue rank
    return a.name.localeCompare(b.name) // 5. alphabetical
  })
}
