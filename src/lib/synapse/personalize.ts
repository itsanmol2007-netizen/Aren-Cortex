import type { ScoredIntent } from './engine'

// ---------------------------------------------------------------------------
// Personalised re-ranking.
//
// This is the LAST step, and it is deliberately outside the engine. The engine
// produces a global, evidence-based ranking that is identical for every doctor
// in the world; this layer nudges that ranking using one doctor's own history.
//
//     finalScore = clinicalScore + preferenceAdjustment
//
// Never the other way around. Three properties are load-bearing:
//
//  1. It can only REORDER what the engine already ranked. It cannot introduce
//     an intent.
//  2. Safety-critical intents are exempt entirely. A doctor's habit must not
//     be able to demote a red flag. HARD-WARNED intents are exempt for the
//     mirror-image reason: a habit must not be able to promote something a
//     guard is warning about. This exemption used to be structural — guards
//     hid those intents and `personalize` never saw them. Guards warn rather
//     than hide now (§14), so what was a side effect of the data has to be
//     said out loud, in code, or it silently stops being true.
//  3. The adjustment is capped RELATIVE TO ITS OWN INTENT TYPE, so it can
//     reorder options that compete with each other and nothing else.
//
// On (3): an absolute cap does not work, because raw scores are not on a
// common scale. A cap of 0.35 is decisive among medicines scoring ~0.5 and
// meaningless among findings scoring ~3. Worse, it would make the feature
// silently useless exactly where it matters: pantoprazole (1.54) and
// rabeprazole (0.52) are interchangeable PPIs a doctor may legitimately
// choose between, but a 0.35 cap could never close that gap.
//
// So the cap is a fraction of the strongest score WITHIN THE SAME TYPE.
// Medicines compete with medicines, tests with tests. The band scales with
// whatever that consultation's options actually look like.
// ---------------------------------------------------------------------------

/** Fraction of the top score in an intent's own type that preference may move it. */
export const PREFERENCE_CAP = 0.35

export interface PreferenceRow {
  intentId: number
  /** the signal that drove this intent when the decision was made */
  contextKey: string
  /** model output in [-1, 1] — consistency x confidence */
  preference: number
  consistency: number
  confidence: number
  observations: number
}

/** intentId|contextKey -> row. Built once per session. */
export type PreferenceModel = Map<string, PreferenceRow>

export const prefKey = (intentId: number, contextKey: string) => `${intentId}|${contextKey}`

export function buildPreferenceModel(rows: PreferenceRow[]): PreferenceModel {
  return new Map(rows.map((r) => [prefKey(r.intentId, r.contextKey), r]))
}

export interface PersonalizedIntent extends ScoredIntent {
  /** the engine's global, evidence-based score — always preserved */
  clinicalScore: number
  /** position under the clinical ranking alone, 1-based */
  clinicalRank: number
  /** what the doctor's history contributed, already capped */
  adjustment: number
  /** clinicalScore + adjustment */
  finalScore: number
  /** the matched model row, if any */
  preference: PreferenceRow | null
  /** positions moved: positive = promoted, negative = demoted */
  movement: number
}

/**
 * The signal a preference is scoped to. Contributors are sorted largest-first
 * by the engine, so the head is what actually ranked this intent.
 */
export function contextOf(intent: ScoredIntent): string {
  return intent.contributors[0]?.signalId ?? '*'
}

export function personalize(
  intents: ScoredIntent[],
  model: PreferenceModel,
  cap = PREFERENCE_CAP,
): PersonalizedIntent[] {
  // Clinical order first — this is what we are adjusting away from, and what
  // the UI compares against to show movement.
  const clinical = [...intents].sort((a, b) => b.rawScore - a.rawScore)
  const clinicalRank = new Map(clinical.map((i, idx) => [i.intentId, idx + 1]))

  // The competitive band for each type: what the best option of that kind
  // scored in this consultation.
  const topByType = new Map<string, number>()
  for (const i of clinical) {
    topByType.set(i.type, Math.max(topByType.get(i.type) ?? 0, i.rawScore))
  }

  const scored: PersonalizedIntent[] = clinical.map((i) => {
    const ctx = contextOf(i)
    // Prefer a context-scoped preference; fall back to one learned without a
    // context. Safety-critical and hard-warned intents are never adjusted —
    // see (2) above. Both keep their clinical position exactly.
    const exempt = i.isSafetyCritical || i.status === 'warn_hard'
    const row = exempt
      ? null
      : model.get(prefKey(i.intentId, ctx)) ?? model.get(prefKey(i.intentId, '*')) ?? null

    const band = topByType.get(i.type) ?? 0
    const adjustment = row ? clamp(row.preference, -1, 1) * cap * band : 0

    return {
      ...i,
      clinicalScore: i.rawScore,
      clinicalRank: clinicalRank.get(i.intentId)!,
      adjustment,
      finalScore: i.rawScore + adjustment,
      preference: row,
      movement: 0,
    }
  })

  scored.sort((a, b) => b.finalScore - a.finalScore || a.clinicalRank - b.clinicalRank)
  for (let idx = 0; idx < scored.length; idx++) {
    scored[idx].movement = scored[idx].clinicalRank - (idx + 1)
  }
  return scored
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
