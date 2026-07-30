// ---------------------------------------------------------------------------
// MANUAL SEARCH — the fallback, on every output category.
//
// The ranking decides what is OFFERED. It must never decide what is REACHABLE
// (handoff §0.3, §13.4): a doctor who wants an X-ray the chart never suggested
// has to be able to get to it, and reaching it that way is real evidence —
// `searched_accepted` says the ranking MISSED, which is what teaches the
// doctor-local rule layer. A category with no search box quietly throws that
// signal away and leaves the doctor stuck with the list.
//
// Medicines had this and nothing else did. This module is that one affordance,
// extracted, so investigations, referrals, possible conditions, advice and
// exercises get the identical thing rather than five near-copies that drift.
//
// ── The two rules a search must honour ────────────────────────────────────
//
//  1. Picking something already on screen is an ACCEPT, not a miss. Logging it
//     as a miss would teach the learning layer the ranking failed when it did
//     not, and mint a doctor-local rule for something already globally ruled.
//     The caller passes `rankedIntentIds` and the hit is marked accordingly.
//
//  2. An out-of-list pick must carry its guard verdict AT FULL STRENGTH. Guards
//     hide nothing (§14), so search is allowed to reach a contraindicated
//     intent — what it must never do is reach one SILENTLY. The verdict is
//     computed here, on the same ruleset and the same active signals the ranked
//     list used, and rendered on the row before the doctor can take it.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, ShieldAlert } from "lucide-react";
import {
    guardIntent, type ActiveSignal, type IntentType, type Ruleset,
} from "../../lib/synapse/engine";
import { searchIntents, type IntentSearchHit } from "../../lib/db/synapse";
import type { AcceptPayload } from "./types";
import { GuardReason } from "./parts";

/** Below this a query matches most of the catalogue and means nothing. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 220;

export interface IntentSearchState {
    query: string;
    setQuery: (v: string) => void;
    /** true once the query is long enough to have replaced the ranked list */
    isSearching: boolean;
    loading: boolean;
    hits: IntentSearchHit[];
    error: string | null;
}

/**
 * One debounced search over `search_intents`, scoped to some intent types.
 *
 * The RPC matches by label, by brand name, or BY THE SYMPTOM AN INTENT TREATS —
 * typing "fever" surfaces paracetamol through the rule base rather than through
 * string matching — and it supports all six types, so nothing here is
 * medicine-specific.
 */
export function useIntentSearch(types: IntentType[], limit = 20): IntentSearchState {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<IntentSearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The type list is rebuilt by every parent render; its CONTENT is the real
    // dependency, so the effect keys on that rather than the array identity.
    const typeKey = types.join(",");

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = query.trim();
        if (q.length < MIN_QUERY) { setHits([]); setLoading(false); setError(null); return; }

        setLoading(true);
        timer.current = setTimeout(() => {
            searchIntents({ query: q, types: typeKey.split(",") as IntentType[], limit })
                .then((r) => { setHits(r); setError(null); })
                .catch((e) => {
                    console.warn("intent search failed:", e);
                    setHits([]);
                    setError(e instanceof Error ? e.message : String(e));
                })
                .finally(() => setLoading(false));
        }, DEBOUNCE_MS);

        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query, typeKey, limit]);

    return {
        query,
        setQuery,
        isSearching: query.trim().length >= MIN_QUERY,
        loading,
        hits,
        error,
    };
}

/** The input itself. Identical on every card, by construction. */
export function IntentSearchField({
    state, placeholder, inputRef, disabled, trailing,
}: {
    state: IntentSearchState;
    placeholder: string;
    inputRef?: React.RefObject<HTMLInputElement>;
    disabled?: boolean;
    /** an optional control beside the field, e.g. a type filter */
    trailing?: React.ReactNode;
}) {
    return (
        <div className="cs-rec-search">
            <div className="cs-field">
                <Search size={15} />
                <input
                    ref={inputRef}
                    value={state.query}
                    placeholder={placeholder}
                    disabled={disabled}
                    onChange={(e) => state.setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") state.setQuery(""); }}
                    aria-label={placeholder}
                />
            </div>
            {trailing}
        </div>
    );
}

/** How a hit was reached, said plainly. Never "score 2.4". */
const MATCH_TEXT: Record<IntentSearchHit["matchKind"], (via: string | null) => string> = {
    label: () => "Matched by name",
    brand: (via) => (via ? `Brand — ${via}` : "Matched by brand"),
    symptom: (via) => (via ? `Treats ${via.toLowerCase()}` : "Matched by what it treats"),
};

/**
 * The results list, in place of whatever the card normally shows.
 *
 * It replaces the ranked list rather than sitting under it, deliberately: two
 * lists on one card, one ranked and one not, is the fastest way to make a
 * doctor believe a search result was ranked.
 */
export function IntentSearchResults({
    state, verbOf, ruleset, activeSignals, rankedIntentIds, acceptedIntentIds,
    acknowledged, onAcknowledge, onAccept,
}: {
    state: IntentSearchState;
    /**
     * The verb this hit is taken with — "Prescribe", "Order", "Refer". A
     * function rather than a string because one search box can span several
     * types, and "Add" on a referral reads as a database verb leaking onto a
     * doctor's screen.
     */
    verbOf: (type: IntentType) => string;
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    /** intent ids the ranked list is already showing */
    rankedIntentIds: Set<number>;
    acceptedIntentIds: Set<number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
}) {
    /**
     * The guard verdict for every hit, on the same ruleset and signals the
     * ranked list used. Computed here rather than left to the caller so that no
     * search surface can forget it — a silent contraindication is the one
     * failure mode §14 does not tolerate.
     */
    const verdicts = useMemo(() => {
        const m = new Map<number, { status: string; reasons: string[] }>();
        if (!ruleset) return m;
        for (const h of state.hits) {
            m.set(h.intentId, guardIntent(ruleset, activeSignals, { id: h.intentId, type: h.type }));
        }
        return m;
    }, [ruleset, activeSignals, state.hits]);

    if (state.error) {
        return (
            <div className="cs-empty">
                <strong>Search is unavailable right now</strong>
                <span>The ranked list below is unaffected. Try again in a moment.</span>
            </div>
        );
    }

    if (state.loading && state.hits.length === 0) {
        return <div className="cs-empty"><strong>Searching…</strong></div>;
    }

    if (state.hits.length === 0) {
        return (
            <div className="cs-empty">
                <strong>Nothing matches “{state.query.trim()}”</strong>
                <span>Try the name, or the symptom you are treating.</span>
            </div>
        );
    }

    return (
        <>
            {state.hits.map((hit) => {
                const verdict = verdicts.get(hit.intentId);
                const isHard = verdict?.status === "warn_hard";
                const isWarn = verdict?.status === "warn";
                const ack = acknowledged.has(hit.intentId);
                const locked = isHard && !ack;
                const added = acceptedIntentIds.has(hit.intentId);
                // Already on screen: taking it is an accept, not a miss.
                const wasRanked = rankedIntentIds.has(hit.intentId);

                return (
                    <div
                        key={hit.intentId}
                        className={`cs-sug is-hit${added ? " is-added" : ""}${isHard ? " is-hard" : ""}`}
                    >
                        <span className={`cs-sug-icon is-${hit.type}`} aria-hidden="true">
                            <Search size={13} />
                        </span>

                        <div className="cs-sug-main">
                            <div className="cs-sug-name">
                                <span>{hit.label}</span>
                                {isWarn && <span className="cs-flag is-warn">Caution</span>}
                                {isHard && (
                                    <span className="cs-flag is-hard"><ShieldAlert size={10} /> Check</span>
                                )}
                            </div>
                            <span className="cs-sug-rel">
                                {MATCH_TEXT[hit.matchKind](hit.viaLabel)}
                                {wasRanked && " · already in the list"}
                            </span>
                        </div>

                        {added ? (
                            <span className="cs-added" aria-label="Taken"><Check size={15} /></span>
                        ) : locked ? (
                            <span style={{ width: 29 }} aria-hidden="true" />
                        ) : (
                            <button
                                type="button"
                                className="cs-act"
                                onClick={() =>
                                    onAccept({
                                        intentId: hit.intentId,
                                        type: hit.type,
                                        label: hit.label,
                                        refTable: hit.refTable,
                                        refId: hit.refId,
                                        // App resolves the brand for a medicine
                                        // it was handed without one.
                                        medicine: null,
                                        // Only a pick the ranking never offered
                                        // is a miss. Anything already on screen
                                        // is an ordinary accept.
                                        viaSearch: !wasRanked,
                                        overridden: !!isHard,
                                    })
                                }
                            >{verbOf(hit.type)}</button>
                        )}

                        {(isWarn || isHard) && (verdict?.reasons.length ?? 0) > 0 && (
                            <div style={{ gridColumn: "2 / -1" }}>
                                <GuardReason
                                    hard={!!isHard}
                                    reasons={verdict!.reasons}
                                    acknowledged={ack}
                                    onAcknowledge={(v) => onAcknowledge(hit.intentId, v)}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}
