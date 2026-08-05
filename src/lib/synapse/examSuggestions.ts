// ---------------------------------------------------------------------------
// EXAM FINDING SUGGESTIONS — the same "one engine, run twice" pattern,
// applied one stage earlier.
//
// The main engine ranks intents (medicine/test/finding-diagnosis/referral/
// advice/exercise) from active signals. This is the identical computation —
// same signal vocabulary, same additive scoring, same "ranking is a safety
// property, never a verdict" rule — pointed at a different target: which
// EXAMINATION FINDING (an observable, not an intent) is worth checking for,
// given the symptoms already on the chart.
//
// Confirming one is not a treatment decision, so it never touches
// decision_log or the personalisation loop — it's answered by ticking the
// suggested chip on the Findings picker, which is itself already a new
// observation that re-runs the whole engine. That's the cascade: symptoms
// suggest what to examine for -> doctor confirms -> engine re-runs -> ranks
// Possible Conditions -> doctor confirms -> engine re-runs -> medicines/tests.
//
// Pure, no Supabase, no React — same discipline as engine.ts. Deliberately a
// separate module rather than grown inside engine.ts: this is additive
// scoring over a different edge type (signal -> observable, not
// signal -> intent), not a change to how intents are ranked.
// ---------------------------------------------------------------------------

import type { ActiveSignal } from "./engine";

export interface FindingSuggestionRule {
    signalId: string;
    observableId: number;
    weight: number;
}

export interface ExamSuggestionContributor {
    signalId: string;
    contribution: number;
}

export interface RankedExamSuggestion {
    observableId: number;
    /** additive, same arithmetic as the main engine's rawScore */
    score: number;
    /** largest first, same convention as ScoredIntent.contributors */
    contributors: ExamSuggestionContributor[];
}

/**
 * Rank candidate examination findings by relevance to the chart's active
 * signals. Already-charted observables are excluded — there is nothing to
 * suggest checking for what has already been ticked.
 */
export function rankExamSuggestions(
    rules: FindingSuggestionRule[],
    activeSignals: ActiveSignal[],
    chartedObservableIds: ReadonlySet<number>
): RankedExamSuggestion[] {
    const strengthBySignal = new Map(activeSignals.map((s) => [s.signalId, s.strength]));
    const byObservable = new Map<number, RankedExamSuggestion>();

    for (const rule of rules) {
        if (chartedObservableIds.has(rule.observableId)) continue;
        const strength = strengthBySignal.get(rule.signalId);
        if (strength == null) continue;

        const contribution = strength * rule.weight;
        const entry = byObservable.get(rule.observableId) ?? {
            observableId: rule.observableId,
            score: 0,
            contributors: [],
        };
        entry.score += contribution;
        entry.contributors.push({ signalId: rule.signalId, contribution });
        byObservable.set(rule.observableId, entry);
    }

    return [...byObservable.values()]
        .map((entry) => ({
            ...entry,
            contributors: entry.contributors.sort((a, b) => b.contribution - a.contribution),
        }))
        .sort((a, b) => b.score - a.score);
}
