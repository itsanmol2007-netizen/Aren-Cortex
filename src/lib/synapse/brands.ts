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
  /**
   * Strength in mg, when the catalogue records it. Null on ~31% of products —
   * including Calpol, Crocin and Dolo, the three curated paracetamol brands —
   * so this must never be treated as required. It is carried for DISPLAY, to
   * tell one variant of a brand family from another; it is not part of any
   * preference key and nothing ranks on it.
   */
  strengthMg?: number | null
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
  /**
   * EVERY molecule in this product, ascending, when the product was resolved
   * as a product rather than as one molecule's brand (see lib/db/medicines.ts).
   *
   * `compositionId` above stays the molecule this product was REACHED
   * through, because the preference model and the decision log are keyed on
   * it. This is what the product actually contains, and the two differ for
   * every combination: Acenac-P is reached through aceclofenac and contains
   * aceclofenac plus paracetamol.
   *
   * Optional because `composition_brands` cannot populate it: that RPC filters
   * to `ingredient_count = 1`, so anything it returns has exactly one molecule
   * and `[compositionId]` is the whole truth. Absent therefore means
   * single-molecule, and every reader should fall back to `[compositionId]`.
   *
   * Load-bearing downstream. `prescription_medicines.composition_ids` is an
   * array column documented as "all composition IDs (1 for single, 2+ for
   * combos)", and it was being written as `[compositionId]` unconditionally,
   * so a combination was recorded in the clinical record as a single molecule
   * and its second drug was invisible to duplicate checking.
   */
  compositionIds?: number[]
  /** their display names, same order as `compositionIds`, for the subtitle */
  compositionLabels?: string[]
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

// ---------------------------------------------------------------------------
// Brand families — one brand, many strengths and forms.
//
// The catalogue stores every strength and form of a brand as its OWN product
// row, so `Aceto` is six rows under paracetamol (100mg drop, 125mg/5ml syrup,
// 150mg drop, 250mg/5ml suspension, 500mg tablet, 650mg tablet) and one brand
// reaches twelve. Measured across the catalogue: 49,860 of 115,541 offerable
// rows (43%) are a strength/form variant of a brand already in the list.
//
// Rendered flat, that is not a choice between brands — it is the same name
// repeated until it fills the card, pushing genuine alternatives out of view.
// So the list is grouped: one row per brand, the strengths underneath it.
//
// This is presentation only. It never changes which products exist, never
// reorders against the doctor's learned preference (family order follows the
// best-ranked member, so a learned brand still leads), and never drops a row —
// every variant stays reachable in the sheet.
// ---------------------------------------------------------------------------

/** A strength with its unit — "650mg", "125mg/5ml", "0.5%". */
const STRENGTH_RE = /\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|ml|iu|%)(?:\s*\/\s*\d*(?:\.\d+)?\s*(?:ml|gm|g))?/gi

/**
 * Dosage-form nouns. Deliberately does NOT include release modifiers (SR, XR,
 * DT, MR): sustained-release IS a different product, and merging it into the
 * plain family would hide it. Conservative on purpose — a family that splits
 * too eagerly shows one extra row, a family that merges too eagerly hides a
 * prescription.
 */
const FORM_RE =
  /\b(?:tablets?|capsules?|syrup|suspension|drops?|injection|infusion|cream|gel|ointment|solution|lotion|sachet|granules|powder|respules|rotacaps|inhaler|kit|oral)\b/gi

/** Bare strength numbers left behind — "Dolo 500 Tablet" once the form is gone. */
const BARE_NUM_RE = /\b\d+(?:\.\d+)?\b/g

/**
 * The display name of the family a product belongs to — "Aceto 250mg/5ml
 * Suspension" -> "Aceto". Case is preserved, because this is what the doctor
 * reads. Falls back to the original name when stripping leaves nothing (a
 * product genuinely named for its strength).
 */
export function brandFamilyLabel(name: string): string {
  const label = name
    .replace(STRENGTH_RE, ' ')
    .replace(FORM_RE, ' ')
    .replace(BARE_NUM_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–—,.]+$/, '')
    .trim()
  return label || name.trim()
}

/**
 * Grouping key. Families are only ever compared WITHIN one composition, so a
 * key collision across two different molecules cannot happen and the key can
 * stay this simple.
 */
export function brandFamilyKey(name: string): string {
  return brandFamilyLabel(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * What tells this variant apart from its siblings — "650mg Tablet".
 *
 * Taken from the product's own name rather than rebuilt from `strengthMg`,
 * because the name carries concentrations the column cannot: "125mg/5ml" is a
 * syrup concentration, and `strength_mg = 125` states a dose the product does
 * not contain. The column is only a fallback.
 */
export function brandVariantLabel(m: Medicine): string {
  // Subtract the family's own words from the product name; what is left is
  // exactly the strength and form that distinguish this variant.
  //
  // Deliberately NOT a prefix slice: the family label is built by removing
  // tokens from anywhere in the name, so it is often not a prefix at all
  // ("Ameto 1000 Tablet ER" -> family "Ameto ER"). A prefix slice failed on
  // those and fell through to `strengthMg`, which collapsed "Ameto 1000
  // Tablet ER" and "Ameto 1000mg Tablet ER" onto the same label and made two
  // distinct products indistinguishable in the sheet.
  const baseTokens = new Set(
    brandFamilyLabel(m.name).toLowerCase().split(/\s+/).filter(Boolean)
  )
  const rest = m.name
    .split(/\s+/)
    .filter((w) => w && !baseTokens.has(w.toLowerCase()))
    .join(' ')
    .replace(/^[\s\-–—,.]+|[\s\-–—,.]+$/g, '')
    .trim()
  if (rest) return rest

  const parts = [m.strengthMg != null ? `${m.strengthMg}mg` : null, m.form].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'standard'
}

/** A concentration — "125mg/5ml", "80mg/ml". NOT a dose. */
const CONCENTRATION_RE = /\d+(?:\.\d+)?\s*(?:mg|mcg|gm|g|iu)\s*\/\s*\d*(?:\.\d+)?\s*(?:ml|gm|g)/i

/** A mass strength with its unit, captured — "650mg", "1 g", "50 mcg". */
const MASS_RE = /(\d+(?:\.\d+)?)\s*(mg|mcg|gm|g)\b/gi

/** A bare number left in a name that carries no unit at all — "Dolo 650 Tablet". */
const LONE_NUM_RE = /\b(\d+(?:\.\d+)?)\b/g

const TO_MG: Record<string, number> = { mg: 1, mcg: 0.001, g: 1000, gm: 1000 }

/**
 * The dose to pre-fill a prescription with, in mg, read out of the product's
 * own NAME. Null whenever the name does not say so unambiguously.
 *
 * `medicines.strength_mg` is null on 66,166 of 213,145 rows, and 12,760 of
 * those carry the strength in the name instead ("Dolo 650 Tablet") — measured
 * live 2026-08-14. Those are the rows this recovers. The doctor was otherwise
 * retyping a number that was already on screen in the product they had just
 * picked.
 *
 * Three things it refuses to guess, because a wrong pre-filled dose is worse
 * than an empty box — an empty box is obviously unanswered, a wrong number
 * looks answered:
 *
 *  * A CONCENTRATION IS NOT A DOSE. "125mg/5ml" is how much drug is in a
 *    spoonful of syrup; the dose depends on how many spoonfuls. This is the
 *    same distinction `brandVariantLabel` is careful about, and writing 125
 *    into the dose box states a quantity the product does not contain.
 *  * A COMBINATION HAS NO SINGLE STRENGTH. "Acenac S 100 mg/15 mg Tablet"
 *    holds two numbers and neither one is "the" dose.
 *  * A BARE NUMBER IS ONLY TRUSTED WHEN IT IS ALONE and lands in a plausible
 *    range, so a pack count or a release code cannot be read as milligrams.
 */
export function doseMgFromName(name: string): number | null {
  const n = name.trim()
  if (!n) return null

  // A syrup or suspension states a concentration; there is no dose to derive.
  if (CONCENTRATION_RE.test(n)) return null

  const masses: number[] = []
  for (const m of n.matchAll(MASS_RE)) {
    const value = Number(m[1]) * (TO_MG[m[2].toLowerCase()] ?? 0)
    if (Number.isFinite(value) && value > 0) masses.push(value)
  }

  // More than one distinct strength means a combination — no single answer.
  const distinct = [...new Set(masses)]
  if (distinct.length === 1) return distinct[0]
  if (distinct.length > 1) return null

  // No unit anywhere. Accept a lone number in a plausible oral-dose range;
  // anything else is a pack size, a release code or a brand that happens to
  // contain a digit.
  const bare = [...new Set([...n.matchAll(LONE_NUM_RE)].map((m) => Number(m[1])))]
  if (bare.length !== 1) return null
  const only = bare[0]
  return only > 0 && only <= 2000 ? only : null
}

/**
 * The same answer as a string, ready for the dose input. Prefers the
 * catalogue's own column and falls back to the name.
 */
export function doseFieldValue(m: Pick<Medicine, 'name' | 'strengthMg'>): string {
  if (m.strengthMg != null && m.strengthMg > 0) return String(m.strengthMg)
  const parsed = doseMgFromName(m.name)
  return parsed == null ? '' : String(parsed)
}

export interface BrandFamily {
  /** grouping key, unique within the composition */
  key: string
  /** what the doctor reads — "Aceto" */
  label: string
  /** the variant that represents the family: its best-ranked member */
  lead: Medicine
  /** every variant including the lead, in resolved order */
  variants: Medicine[]
}

/**
 * Group an ALREADY-RESOLVED brand list into families.
 *
 * Order is inherited, never recomputed: a family sits where its best-ranked
 * member sat, and that member leads it. So a learned preference, a clinic
 * default and the paediatric form ordering all survive grouping untouched —
 * if the doctor's brand is a 250mg syrup, that syrup is the lead and its
 * family is first.
 */
export function groupBrandFamilies(ordered: Medicine[]): BrandFamily[] {
  const byKey = new Map<string, BrandFamily>()
  for (const m of ordered) {
    const key = brandFamilyKey(m.name)
    const existing = byKey.get(key)
    if (existing) existing.variants.push(m)
    else byKey.set(key, { key, label: brandFamilyLabel(m.name), lead: m, variants: [m] })
  }
  return [...byKey.values()]
}
