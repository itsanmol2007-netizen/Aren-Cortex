// ---------------------------------------------------------------------------
// Brand lookup — the wiring between a ranked composition and a prescribable
// brand.
//
// The engine ranks COMPOSITIONS and never sees a brand (§0.4). `brands.ts`
// knows how to ORDER brands for one doctor but has no idea where they come
// from; this module is the missing half — it fetches the candidates and hands
// them over.
//
// Two things it must not get wrong:
//
//  * A brand is only offered for a composition when the product contains that
//    molecule ALONE. `medicine_composition_map` maps combination products to
//    every one of their ingredients, so "brands of aceclofenac" naively
//    includes Acezen-SP (aceclofenac + paracetamol + serratiopeptidase). The
//    engine ranked one molecule; offering three is a different prescription.
//    The RPC filters on ingredient_count = 1 and returns the combination count
//    separately, so the UI can say they exist without offering them.
//
//  * A composition with no brand behind it is RANKABLE BUT NOT PRESCRIBABLE.
//    That must be visible, not an empty space — same reason `result.blocked`
//    is returned rather than deleted.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import { doctorId } from './decisions'
import {
  resolveBrands,
  type BrandPreference,
  type BrandPreferenceModel,
  type Medicine,
} from './brands'

/**
 * Candidates fetched per composition. Not a display limit — `resolveBrands`
 * reorders within this set, so it has to be wide enough that the doctor's own
 * brand can surface, and small enough that paracetamol's 1,790 single-molecule
 * brands never reach the browser.
 */
export const BRAND_CANDIDATES = 12

export interface CompositionBrands {
  compositionId: number
  /** ordered for this doctor — learned preference first, then catalogue order */
  brands: Medicine[]
  /** every single-molecule brand in the catalogue, not just the ones fetched */
  singleTotal: number
  /** combination products containing this molecule — counted, never offered */
  combinationTotal: number
}

/** compositionId -> its brands. Empty entry means "looked up, found nothing". */
export type BrandIndex = Map<number, CompositionBrands>

interface BrandRow {
  composition_id: number
  /** null on the totals-only row a combination-only composition returns */
  medicine_id: number | null
  name: string | null
  manufacturer: string | null
  strength_mg: number | null
  route: string | null
  is_primary: boolean
  ingredient_count: number
  single_total: number
  combination_total: number
}

/**
 * This doctor's brand habits. Same shape as `loadPreferences`, different model:
 * the view behind it uses a confidence constant of 0.5, so it moves on one or
 * two decisions rather than a dozen (§10b).
 */
export async function loadBrandPreferences(): Promise<BrandPreference[]> {
  const { data, error } = await supabase
    .from('v_doctor_brand_preference')
    .select('composition_id, medicine_id, form, preference')
    .eq('doctor_id', doctorId())
  if (error) throw new Error(`brand preferences: ${error.message}`)
  return (data ?? []).map((r) => ({
    compositionId: r.composition_id,
    medicineId: r.medicine_id,
    form: r.form,
    preference: Number(r.preference),
  }))
}

/**
 * Fetch and order the brands for every ranked composition, in one round trip.
 *
 * The order the RPC returns is carried into `resolveBrands` as `catalogueRank`
 * rather than relied on implicitly. It is not enough to hand the array over
 * pre-sorted and hope: `resolveBrands` ends on an alphabetical tiebreak, so
 * with no learned preference and no popularity data it would re-sort by name
 * and hand back "A 250 Suspension" as the face of paracetamol, ahead of Calpol
 * — and quietly discard the paediatric form ordering with it.
 */
export async function fetchCompositionBrands(
  compositionIds: number[],
  prefs: BrandPreferenceModel,
  isPediatric: boolean,
): Promise<BrandIndex> {
  const index: BrandIndex = new Map()
  if (compositionIds.length === 0) return index

  const wanted = new Set(compositionIds)

  // Brands this doctor already has history with must always be in the candidate
  // set. Without this, a preference learned on a brand that sits 900 names down
  // the alphabet could never surface it — the layer would look broken.
  const keep = [
    ...new Set(
      [...prefs.values()]
        .filter((p) => wanted.has(p.compositionId))
        .map((p) => p.medicineId),
    ),
  ]

  const { data, error } = await supabase.rpc('composition_brands', {
    p_composition_ids: compositionIds,
    p_limit: BRAND_CANDIDATES,
    p_pediatric: isPediatric,
    p_keep_medicine_ids: keep,
  })
  if (error) throw new Error(`brands: ${error.message}`)

  const rows = (data ?? []) as BrandRow[]

  const candidates = new Map<number, Medicine[]>()
  const totals = new Map<number, { single: number; combination: number }>()

  for (const r of rows) {
    if (!totals.has(r.composition_id)) {
      totals.set(r.composition_id, {
        single: Number(r.single_total),
        combination: Number(r.combination_total),
      })
    }

    // A composition whose only products are combinations returns one row with
    // no medicine on it. The totals are the whole point of that row.
    if (r.medicine_id == null) continue

    const list = candidates.get(r.composition_id)
    const m: Medicine = {
      id: r.medicine_id,
      compositionId: r.composition_id,
      name: r.name ?? `#${r.medicine_id}`,
      // the dosage form is medicine_composition_map.route — `medicines` has no
      // form column, and the paediatric rule keys on this
      form: r.route,
      // No popularity source exists in this schema. `prescription_medicines`
      // has 4 rows and decision_log has no brand decisions yet, so inventing a
      // number here would be inventing evidence.
      prescriptionCount: 0,
      // No clinic formulary table in v2 either — `hospital_medicine_preference`
      // is a dead v1 table (§0.2) and is empty.
      isClinicDefault: false,
      // The RPC already ordered these: doctor's own history, then paediatric
      // forms when relevant, then catalogue-seeded, then name.
      catalogueRank: list ? list.length : 0,
    }
    if (list) list.push(m)
    else candidates.set(r.composition_id, [m])
  }

  for (const compositionId of wanted) {
    const list = candidates.get(compositionId) ?? []
    const t = totals.get(compositionId)
    index.set(compositionId, {
      compositionId,
      brands: resolveBrands(compositionId, prefs, {
        candidates: list,
        isPediatric,
      }),
      singleTotal: t?.single ?? 0,
      combinationTotal: t?.combination ?? 0,
    })
  }

  return index
}
