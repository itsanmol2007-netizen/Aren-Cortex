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
    guardCombination, guardIntent, medicineIntentIndex,
    type ActiveSignal, type GuardStatus, type GuardVerdict, type IntentType, type Ruleset,
} from "../../lib/synapse/engine";
import { searchIntents, type IntentSearchHit } from "../../lib/db/synapse";
import { fetchProductsByNames, type ResolvedProduct } from "../../lib/db/medicines";
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
    state, placeholder, inputRef, disabled, trailing, onKeyDown,
}: {
    state: IntentSearchState;
    placeholder: string;
    inputRef?: React.RefObject<HTMLInputElement>;
    disabled?: boolean;
    /** an optional control beside the field, e.g. a type filter */
    trailing?: React.ReactNode;
    /**
     * The card's list navigation — ↑ ↓ to walk its rows and Enter to take one.
     *
     * It belongs to the CARD rather than to this field because only the card
     * knows what its rows are and what taking one means ("Prescribe" on a
     * medicine, "Confirm" on a condition, "Order" on a test). This field just
     * hands the keystroke over first and keeps Escape for itself, which is the
     * same division of labour as the rest of the keyboard work: this module
     * owns the input, the surface owns what is in the list under it.
     */
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
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
                    onKeyDown={(e) => {
                        onKeyDown?.(e);
                        // Escape clears the query and is not offered to the
                        // card: every one of them would do the same thing with
                        // it, and a card that forgot to would leave the doctor
                        // with a search they cannot get out of.
                        if (!e.defaultPrevented && e.key === "Escape") state.setQuery("");
                    }}
                    aria-label={placeholder}
                />
            </div>
            {trailing}
        </div>
    );
}

/**
 * What each brand hit ACTUALLY contains, resolved for the whole result set.
 *
 * `search_intents` returns one composition per hit and picks it by rarity,
 * which selects the minor ingredient more often than the major one, so a
 * combination was being described on screen by the half the doctor was least
 * likely to have wanted. This fills in the rest.
 *
 * Deliberately additive. If the lookup fails the row still renders with the
 * RPC's single composition, exactly as before, because a product list that
 * disappears because a secondary read failed is worse than one that is
 * briefly less specific.
 */
export function useHitProducts(hits: IntentSearchHit[]): Map<string, ResolvedProduct> {
    const [products, setProducts] = useState<Map<string, ResolvedProduct>>(new Map());

    const names = hits
        .filter((h) => h.matchKind === "brand" && h.viaLabel)
        .map((h) => h.viaLabel!)
        .join("|");

    useEffect(() => {
        if (!names) { setProducts(new Map()); return; }
        let cancelled = false;
        fetchProductsByNames(names.split("|"))
            .then((m) => { if (!cancelled) setProducts(m); })
            .catch((e) => {
                // Loud in the console, invisible on screen. This read is a
                // refinement of a row that already works.
                console.warn("product composition lookup failed:", e);
                if (!cancelled) setProducts(new Map());
            });
        return () => { cancelled = true; };
    }, [names]);

    return products;
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
    const products = useHitProducts(state.hits);

    // The reverse of `ruleset.intents`, for reaching a combination's OTHER
    // molecules by composition id — see its doc comment in engine.ts.
    const intentIndex = useMemo(
        () => (ruleset ? medicineIntentIndex(ruleset) : new Map()),
        [ruleset]
    );

    /**
     * The guard verdict for every hit, on the same ruleset and signals the
     * ranked list used. Computed here rather than left to the caller so that no
     * search surface can forget it — a silent contraindication is the one
     * failure mode §14 does not tolerate.
     *
     * `search_intents` matches a combination through ONE composition, chosen
     * by rarity — frequently the minor ingredient (§14.15 / atlas). Checking
     * only THAT composition's guard would let a genuinely contraindicated
     * combination reach the doctor with a weaker warning than the same
     * product gets through the ranked list — doctrine rule 11. When the hit
     * resolves to a product carrying more than one molecule, its verdict is
     * the worse of the two: the hit's own composition, and every molecule the
     * resolved product actually contains.
     */
    const verdicts = useMemo(() => {
        const m = new Map<number, GuardVerdict>();
        if (!ruleset) return m;
        for (const h of state.hits) {
            const base = guardIntent(ruleset, activeSignals, { id: h.intentId, type: h.type });
            const resolved = h.matchKind === "brand" && h.viaLabel ? products.get(h.viaLabel) : undefined;
            if (!resolved || resolved.compositionIds.length <= 1) {
                m.set(h.intentId, base);
                continue;
            }
            const full = guardCombination(ruleset, activeSignals, intentIndex, resolved.compositionIds);
            const status: GuardStatus =
                base.status === "warn_hard" || full.status === "warn_hard" ? "warn_hard"
                    : base.status === "warn" || full.status === "warn" ? "warn" : "ok";
            m.set(h.intentId, { status, reasons: [...new Set([...base.reasons, ...full.reasons])] });
        }
        return m;
    }, [ruleset, activeSignals, state.hits, products, intentIndex]);

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

                        {/* ── BRAND FIRST, ALWAYS ──────────────────────────
                            When a hit was reached by brand name, the BRAND is
                            the headline and the molecule is the subtitle —
                            never the other way round. The doctor typed
                            "Acenac-P"; showing them "aceclofenac" as the
                            answer makes them wonder whether the thing they
                            searched for exists at all. The molecule still
                            appears, because what is prescribed is ultimately
                            a composition, but it sits underneath. */}
                        <div className="cs-sug-main">
                            <div className="cs-sug-name">
                                <span>{hit.matchKind === "brand" && hit.viaLabel ? hit.viaLabel : hit.label}</span>
                                {isWarn && <span className="cs-flag is-warn">Caution</span>}
                                {isHard && (
                                    <span className="cs-flag is-hard"><ShieldAlert size={10} /> Check</span>
                                )}
                            </div>
                            {hit.matchKind === "brand" && hit.viaLabel ? (
                                <span className="cs-sug-rel">
                                    {/* EVERY molecule, when the product has been
                                        resolved. The RPC's single `hit.label` is
                                        the fallback and it is frequently the
                                        MINOR ingredient: Acenac-MR comes back as
                                        thiocolchicoside with its aceclofenac
                                        nowhere on the row. */}
                                    <b className="cs-sug-molecule">
                                        {products.get(hit.viaLabel)?.compositionLabels.join(" + ")
                                            ?? hit.label}
                                    </b>
                                    {(products.get(hit.viaLabel)?.compositionIds.length ?? 0) > 1 &&
                                        " · combination"}
                                    {wasRanked && " · already in the list"}
                                </span>
                            ) : (
                                <span className="cs-sug-rel">
                                    {MATCH_TEXT[hit.matchKind](hit.viaLabel)}
                                    {wasRanked && " · already in the list"}
                                </span>
                            )}
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
                                        // The product the doctor NAMED. Until
                                        // this was carried, the accept knew
                                        // only the molecule, and the resolver
                                        // behind it returns single-molecule
                                        // products only, so a combination the
                                        // search had just displayed could
                                        // never be the thing prescribed.
                                        brandHint:
                                            hit.matchKind === "brand" ? hit.viaLabel : null,
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
