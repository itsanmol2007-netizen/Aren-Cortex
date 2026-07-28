// ---------------------------------------------------------------------------
// Co-prescription companions.
//
// Doctors rarely prescribe one drug: an NSAID rides with a PPI for gastric
// cover, an antibiotic with a probiotic, isoniazid with pyridoxine. That is an
// intent -> intent relationship, not signal -> intent: the PPI is suggested
// because another PRESCRIPTION was made, not because of a symptom.
//
// So companions fire on ACCEPTANCE, after scoring — exactly like guards, and
// exactly NOT like the engine. This module sits downstream of the engine and
// touches no score. Delete intent_companions and this file and every clinical
// ranking is byte-identical.
//
// A companion is a suggestion like any other, so it carries the same guard
// verdict the engine would give it: a muscle-relaxant companion offered to a
// pregnant patient arrives with the same hard warning, and the doctor
// acknowledges it on the same terms. It is never withheld — no part of this
// system withholds anything from the doctor any more (see Guard in the engine).
//
// This module used to re-implement the engine's private guard predicate, and
// carried a standing warning that the two had to stay in lockstep. `guardIntent`
// is now exported and that mirror is gone.
// ---------------------------------------------------------------------------

import { guardIntent, type Ruleset, type ActiveSignal, type IntentType, type GuardStatus } from './engine'

export type CompanionScope = 'authored' | 'learned'

/** One row of intent_companions. */
export interface CompanionEdge {
  intentId: number
  companionIntentId: number
  weight: number
  reason: string
  scope: CompanionScope
}

export interface CompanionSuggestion {
  companionIntentId: number
  type: IntentType
  label: string
  /** strongest edge weight among the triggers that fired it */
  weight: number
  /** doctor-facing reasons ("gastric cover"), one per distinct triggering edge */
  reasons: string[]
  scopes: CompanionScope[]
  /** accepted intent ids that triggered this companion */
  triggeredBy: number[]
  /** guard verdict — 'warn_hard' companions need acknowledging, not hiding */
  status: GuardStatus
  guardReasons: string[]
}

export interface CompanionResult {
  /** every companion that fired, strongest first — none is ever withheld */
  suggestions: CompanionSuggestion[]
  /** the subset carrying a hard warning: same objects, for the summary line */
  hardWarned: CompanionSuggestion[]
}

/**
 * Given the intents the doctor accepted, resolve the companion suggestions.
 *
 *   * an edge fires only if its trigger was accepted;
 *   * a companion already accepted this consultation is not re-suggested;
 *   * several triggers pointing at one companion collapse into a single
 *     suggestion (max weight, reasons unioned);
 *   * every one is run through the guards, which attach a status and reasons
 *     and remove nothing.
 *
 * `activeSignals` are the consultation's signals — the same ones the engine
 * scored on — so guard context (PREGNANCY, PEDIATRIC, …) is identical.
 */
export function resolveCompanions(
  acceptedIntentIds: Iterable<number>,
  edges: CompanionEdge[],
  rs: Ruleset,
  activeSignals: ActiveSignal[],
): CompanionResult {
  const accepted = new Set(acceptedIntentIds)
  const activeIds = new Set(activeSignals.map((s) => s.signalId))

  interface Agg {
    weight: number
    reasons: Set<string>
    scopes: Set<CompanionScope>
    triggers: Set<number>
  }
  const agg = new Map<number, Agg>()

  for (const e of edges) {
    if (!accepted.has(e.intentId)) continue // trigger was not prescribed
    if (accepted.has(e.companionIntentId)) continue // already prescribed; don't nag
    const cur =
      agg.get(e.companionIntentId) ??
      { weight: 0, reasons: new Set<string>(), scopes: new Set<CompanionScope>(), triggers: new Set<number>() }
    cur.weight = Math.max(cur.weight, e.weight)
    cur.reasons.add(e.reason)
    cur.scopes.add(e.scope)
    cur.triggers.add(e.intentId)
    agg.set(e.companionIntentId, cur)
  }

  const suggestions: CompanionSuggestion[] = []

  for (const [companionId, a] of agg) {
    const intent = rs.intents.get(companionId)
    if (!intent) continue // companion missing from ruleset — nothing to show
    const v = guardIntent(rs, activeIds, { id: companionId, type: intent.type })
    suggestions.push({
      companionIntentId: companionId,
      type: intent.type,
      label: intent.label,
      weight: a.weight,
      reasons: [...a.reasons],
      scopes: [...a.scopes],
      triggeredBy: [...a.triggers],
      status: v.status,
      guardReasons: v.reasons,
    })
  }

  suggestions.sort((x, y) => y.weight - x.weight)
  return { suggestions, hardWarned: suggestions.filter((c) => c.status === 'warn_hard') }
}
