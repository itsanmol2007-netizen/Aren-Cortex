// ---------------------------------------------------------------------------
// "Frequently prescribed" — this doctor's own shortlist.
//
// Read the view's comment for why this is a plain count. The short version:
// there are already three models around this engine and this is not a fourth.
// It does not know what the patient has, it never reads a signal, and it is
// not reordered by anything. It is the doctor's own top medicines, by how
// often they prescribe them.
//
// It is NOT `intent_companions`. Companions are authored, global and clinical —
// an NSAID rides with a PPI for everyone on earth, because of pharmacology.
// This is one doctor's habit, learned from their own log, and means nothing to
// anyone else. The two are shown in different places and worded differently on
// purpose; conflating them would tell a doctor their personal shortlist was
// clinical advice.
// ---------------------------------------------------------------------------

import { supabase } from '@/lib/supabase'
import { doctorId } from './decisions'

/** How many to show. A shortcut longer than a glance is not a shortcut. */
export const FREQUENT_LIMIT = 8

/** Below this it is a coincidence, not a habit, and the list is noise. */
export const FREQUENT_MIN_TIMES = 2

export interface FrequentMedicine {
  intentId: number
  /** the molecule the engine ranks */
  composition: string
  compositionId: number | null
  timesPrescribed: number
  lastPrescribed: string
  /** the brand this doctor usually picks for it, if they have ever picked one */
  usualMedicineId: number | null
  usualBrand: string | null
}

export async function loadFrequentMedicines(): Promise<FrequentMedicine[]> {
  const { data, error } = await supabase
    .from('v_doctor_frequent_medicine')
    .select('intent_id, composition, composition_id, times_prescribed, last_prescribed, usual_medicine_id, usual_brand')
    .eq('doctor_id', doctorId())
    .gte('times_prescribed', FREQUENT_MIN_TIMES)
    .order('times_prescribed', { ascending: false })
    .order('last_prescribed', { ascending: false })
    .limit(FREQUENT_LIMIT)
  if (error) throw new Error(`frequent medicines: ${error.message}`)
  return (data ?? []).map((r) => ({
    intentId: r.intent_id,
    composition: r.composition,
    compositionId: r.composition_id,
    timesPrescribed: r.times_prescribed,
    lastPrescribed: r.last_prescribed,
    usualMedicineId: r.usual_medicine_id,
    usualBrand: r.usual_brand,
  }))
}
