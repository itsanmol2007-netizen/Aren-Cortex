// ---------------------------------------------------------------------------
// THE FREE-TEXT FALLBACK — matching, shared by every card that offers it.
//
// §4, 2026-08-24; widened same day to weigh accepted-intent overlap, not just
// signal overlap, per the follow-up ask ("record other credentials with it
// too... best personalization"). One scoring function so ConditionsCard and
// SuggestionsCard can never quietly drift on what "a good match" means.
// ---------------------------------------------------------------------------

import type { DoctorFreeTerm, DoctorFreeTermType } from "../../lib/db/synapse";

/**
 * How well a remembered term matches THIS consult.
 *
 * Accepted-intent overlap is weighted higher than signal overlap: two
 * consults sharing a symptom is common and weak evidence ("fever" fires
 * constantly); two consults where the SAME OTHER MEDICINES/TESTS were also
 * accepted is rarer and stronger evidence that this doctor reaches for this
 * term in this specific situation, not just whenever this signal happens to
 * be active. Both are real evidence, so both count — this is additive, the
 * same shape the engine itself uses (docs/aren-cortex-context.md rule 23),
 * not a replacement of one signal by the other.
 */
const ACCEPTED_INTENT_WEIGHT = 2;

export function scoreFreeTerm(
    term: Pick<DoctorFreeTerm, "signalIds" | "acceptedIntentIds">,
    activeSignalIds: ReadonlySet<string>,
    acceptedIntentIds: ReadonlySet<number>
): number {
    let score = 0;
    for (const id of term.signalIds) if (activeSignalIds.has(id)) score += 1;
    for (const id of term.acceptedIntentIds) if (acceptedIntentIds.has(id)) score += ACCEPTED_INTENT_WEIGHT;
    return score;
}

/**
 * The doctor's own terms worth suggesting on the RANKED view (no search
 * typed) — top few, best match first, ties broken by how often the doctor
 * has actually used the term. Zero-overlap terms never appear here: with
 * nothing in common with today's chart, a "your terms" strip would just be
 * a doctor's whole history dumped onto every consult.
 */
export function topFreeTermMatches(
    terms: DoctorFreeTerm[],
    type: DoctorFreeTermType,
    activeSignalIds: ReadonlySet<string>,
    acceptedIntentIds: ReadonlySet<number>,
    alreadyTaken: ReadonlySet<string>,
    limit = 3
): DoctorFreeTerm[] {
    return terms
        .filter((t) => t.type === type && !alreadyTaken.has(t.label))
        .map((t) => ({ term: t, score: scoreFreeTerm(t, activeSignalIds, acceptedIntentIds) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || b.term.useCount - a.term.useCount)
        .slice(0, limit)
        .map(({ term }) => term);
}

/**
 * The same list, filtered to what is actually typed — for search mode.
 *
 * Deliberately does NOT drop an already-taken label — §1's follow-up fix,
 * 2026-08-24: "searching same thing again could appear in search results"
 * used to fail because this filtered taken labels out entirely, so a term
 * the doctor had just added vanished from its own search the moment it was
 * accepted. A catalogue hit that is already on the plan still shows up in
 * search (as a checkmark, not a second "add"); a free term now behaves the
 * same way — the caller renders the taken/not-taken state, this just
 * answers "does it match", the same split `IntentSearchResults` already
 * uses for catalogue hits.
 */
export function matchingFreeTerms(
    terms: DoctorFreeTerm[],
    type: DoctorFreeTermType,
    query: string
): DoctorFreeTerm[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return terms.filter((t) => t.type === type && t.label.toLowerCase().includes(q));
}
