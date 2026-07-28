import { supabase } from '@/lib/supabase'
import type { EngineResult, ScoredIntent, IntentType } from '@engine'
import { contextOf, type PreferenceRow } from './personalize'

/**
 * `searched_accepted` is a distinct, stronger signal than a low-ranked accept:
 * the doctor ignored the entire ranked list and searched for something else, so
 * the ranking missed rather than merely mis-ordered. It always carries
 * was_shown = false. Steps 4 (doctor-local rules) and 2 (brand learning) both
 * read it.
 *
 * `override_accepted` is an accept of a HARD-WARNED intent — the doctor read
 * the guard's reason, acknowledged it, and prescribed anyway. It is a separate
 * outcome rather than a plain `accepted` on purpose: v_doctor_preference reads
 * accepted/skipped, and an override must not teach the model to promote
 * something a guard is warning about. The prescription still happens; only the
 * learning is withheld.
 *
 * `blocked` is gone. It described an intent the engine withheld, and the engine
 * withholds nothing (§14).
 */
export type Outcome = 'shown' | 'accepted' | 'skipped' | 'searched_accepted' | 'override_accepted'

/** An intent the doctor reached by searching, outside the ranked list. */
export interface SearchedAccept {
  intentId: number
  /** which brand was prescribed, if this is a medicine intent */
  chosenMedicineId?: number | null
}

export interface CommitOptions {
  /** intentId → medicine_id, the brand actually prescribed for an accepted medicine intent */
  chosenBrands?: Map<number, number>
  /** intents the doctor found by searching, not present in the ranked list */
  searched?: SearchedAccept[]
}

const DOCTOR_KEY = 'synapse.doctorId'

/**
 * Which doctor this browser is. There is no auth in the sandbox, and
 * decision_log has no FK on doctor_id, so a stable local UUID is enough to
 * prove the personalisation loop end to end. Replacing this with the real
 * signed-in doctor id is the only change needed for production.
 */
export function doctorId(): string {
  let id = localStorage.getItem(DOCTOR_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DOCTOR_KEY, id)
  }
  return id
}

export function resetDoctor(): string {
  localStorage.removeItem(DOCTOR_KEY)
  return doctorId()
}

interface LogRow {
  visit_id: string
  doctor_id: string
  intent_id: number
  score: number
  rank: number
  // where the intent sat in its own type's list (medicines vs medicines); null
  // for blocked and searched rows, which have no meaningful per-type position
  rank_position: number | null
  // false only when the doctor reached the intent by searching, not from the list
  was_shown: boolean
  // the brand actually prescribed; null for non-medicine intents or no brand
  chosen_medicine_id: number | null
  outcome: Outcome
  signal_context: string[]
  context_key: string | null
  ruleset_version: string
}

interface RowExtras {
  rankPosition: number | null
  wasShown: boolean
  chosenMedicineId: number | null
}

function row(
  visitId: string,
  intent: ScoredIntent,
  rank: number,
  outcome: Outcome,
  result: EngineResult,
  extras: RowExtras,
): LogRow {
  return {
    visit_id: visitId,
    doctor_id: doctorId(),
    intent_id: intent.intentId,
    // the clinical score is logged, never the personalised one — otherwise the
    // model would be learning from its own output
    score: Number(intent.rawScore.toFixed(4)),
    rank,
    rank_position: extras.rankPosition,
    was_shown: extras.wasShown,
    chosen_medicine_id: extras.chosenMedicineId,
    outcome,
    signal_context: result.activeSignals.map((s) => s.signalId),
    context_key: contextOf(intent),
    ruleset_version: result.rulesetVersion,
  }
}

/**
 * One write, when the consultation is closed.
 *
 * Nothing is logged while the doctor is still typing: an abandoned draft is
 * not evidence of anything, and streaming every keystroke would poison the
 * model with intents that appeared for half a second. What gets written is the
 * final state of a consultation the doctor actually finished.
 *
 * A guard that fired is still exactly the thing you want a record of, but it no
 * longer needs a row of its own: a hard-warned intent is in the ranked list
 * like everything else, so it gets the ordinary `shown` row, and the event
 * worth singling out is the doctor going ahead anyway — `override_accepted`.
 *
 * Implicit skips are the important subtlety. Doctors will not click "skip"
 * twenty times, but if they accepted one medicine and left four others on
 * screen, they chose against those four. That inference is made only within an
 * intent type where something WAS accepted: ordering no tests at all says
 * nothing about any individual test, so no negative is inferred there. Red
 * flags are never inferred as rejected.
 */
export async function commitConsultation(
  visitId: string,
  result: EngineResult,
  accepted: Set<number>,
  skipped: Set<number>,
  opts: CommitOptions = {},
): Promise<{ rows: number; implicit: number; searched: number; overrides: number }> {
  const chosenBrands = opts.chosenBrands ?? new Map<number, number>()
  const searched = opts.searched ?? []

  // Per-type rank: result.intents is a single list ranked across all types, so
  // the intent's position within its OWN type is counted here, not its global
  // rank. "First medicine offered" and "first test offered" both read as 1.
  const perTypeRank = new Map<number, number>()
  const typeCount = new Map<IntentType, number>()
  for (const i of result.intents) {
    const n = (typeCount.get(i.type) ?? 0) + 1
    typeCount.set(i.type, n)
    perTypeRank.set(i.intentId, n)
  }

  const ranked = result.intents.map((i, idx) => ({
    i,
    rank: idx + 1,
    pos: perTypeRank.get(i.intentId) ?? null,
  }))

  const brandOf = (intentId: number): number | null =>
    chosenBrands.get(intentId) ?? null

  const typesWithAcceptance = new Set(
    ranked.filter(({ i }) => accepted.has(i.intentId)).map(({ i }) => i.type),
  )

  const implicit = ranked.filter(
    ({ i }) =>
      typesWithAcceptance.has(i.type) &&
      !accepted.has(i.intentId) &&
      !skipped.has(i.intentId) &&
      !i.isSafetyCritical,
  )

  const rows: LogRow[] = [
    // everything ranked was shown to the doctor
    ...ranked.map(({ i, rank, pos }) =>
      row(visitId, i, rank, 'shown', result, {
        rankPosition: pos,
        wasShown: true,
        chosenMedicineId: null,
      }),
    ),
    // explicit accepts carry the brand actually prescribed, when known. An
    // accept of a hard-warned intent is an OVERRIDE: the same prescription,
    // recorded under an outcome the preference model does not read.
    ...ranked
      .filter(({ i }) => accepted.has(i.intentId))
      .map(({ i, rank, pos }) =>
        row(visitId, i, rank, i.status === 'warn_hard' ? 'override_accepted' : 'accepted', result, {
          rankPosition: pos,
          wasShown: true,
          chosenMedicineId: brandOf(i.intentId),
        }),
      ),
    // explicit skips
    ...ranked
      .filter(({ i }) => skipped.has(i.intentId))
      .map(({ i, rank, pos }) =>
        row(visitId, i, rank, 'skipped', result, {
          rankPosition: pos,
          wasShown: true,
          chosenMedicineId: null,
        }),
      ),
    // implicit skips: shown, left untouched, in a type where something else was taken
    ...implicit.map(({ i, rank, pos }) =>
      row(visitId, i, rank, 'skipped', result, {
        rankPosition: pos,
        wasShown: true,
        chosenMedicineId: null,
      }),
    ),
    // searched_accepted: the doctor bypassed the ranked list entirely. These
    // intents were never scored here, so score 0, no per-type position, no
    // context_key, and was_shown = false.
    ...searched.map((s) => ({
      visit_id: visitId,
      doctor_id: doctorId(),
      intent_id: s.intentId,
      score: 0,
      rank: 0,
      rank_position: null,
      was_shown: false,
      chosen_medicine_id: s.chosenMedicineId ?? null,
      outcome: 'searched_accepted' as Outcome,
      signal_context: result.activeSignals.map((sig) => sig.signalId),
      context_key: null,
      ruleset_version: result.rulesetVersion,
    })),
  ]

  const overrides = rows.filter((r) => r.outcome === 'override_accepted').length

  if (rows.length === 0) return { rows: 0, implicit: 0, searched: 0, overrides: 0 }
  const { error } = await supabase.from('decision_log').insert(rows)
  if (error) throw new Error(`decision_log: ${error.message}`)
  return { rows: rows.length, implicit: implicit.length, searched: searched.length, overrides }
}

/** This doctor's preference model. Local to them by construction. */
export async function loadPreferences(): Promise<PreferenceRow[]> {
  const { data, error } = await supabase
    .from('v_doctor_preference')
    .select('intent_id, context_key, preference, consistency, confidence, observations')
    .eq('doctor_id', doctorId())
  if (error) throw new Error(`preferences: ${error.message}`)
  return (data ?? []).map((r) => ({
    intentId: r.intent_id,
    contextKey: r.context_key,
    preference: Number(r.preference),
    consistency: Number(r.consistency),
    confidence: Number(r.confidence),
    observations: r.observations,
  }))
}
