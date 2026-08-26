// ---------------------------------------------------------------------------
// The consult, ranked.
//
// The engine is a pure function over data already in memory, so ranking is
// SYNCHRONOUS — no request, no debounce, no spinner. Cortex previously posted
// every chart change to an edge function and waited 300 ms before it could even
// start; now the list re-ranks in the same frame the chip lands. That is not a
// performance nicety, it is the difference between a tool that answers and a
// tool you wait for.
//
// Only two things here are async, and neither can hold up the ranking:
//   * brand resolution, which runs after the compositions are known;
//   * persistence of the raw input, which is fire-and-forget.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { runEngine, type EngineResult, type IntentType } from "../lib/synapse/engine";
import { personalize, type PersonalizedIntent } from "../lib/synapse/personalize";
import { resolveCompanions, applyHospitalCompanionPrefs, type CompanionResult } from "../lib/synapse/companions";
import { rankExamSuggestions, type RankedExamSuggestion } from "../lib/synapse/examSuggestions";
import { buildEngineInput, isPediatricConsult, type MeasurementRow } from "../lib/synapse/consultInput";
import {
    fetchCompositionBrands,
    compositionIdsOf,
    persistVisitInput,
    type BrandIndex,
    type CompositionBrands,
} from "../lib/db/synapse";
import { fetchCombinationProducts, type ResolvedProduct } from "../lib/db/medicines";
import type { SynapseData } from "./useSynapse";
import type { Vitals } from "../types";
import type { Sex } from "../lib/growth/growth";

export interface ConsultIntelligenceArgs {
    data: SynapseData | null;
    visitId: string | null;
    /** every observable on the chart: symptoms, findings and history alike */
    observableIds: number[];
    /**
     * How an observable got onto the chart, for the ones the doctor did not tap.
     * Written to `visit_observations.source` so a ranking re-derived from the
     * permanent record does not claim the doctor entered a chip that arrived by
     * confirmation or was carried forward. Absent means 'doctor'.
     */
    observableSources?: Map<number, "confirmed" | "carried">;
    vitals: Vitals;
    ageYears: number | null;
    /** exact age in months from the date of birth — growth standards only */
    ageMonths?: number | null;
    /** WHO publishes separate growth standards per sex */
    sex?: Sex | null;
    /** intent ids the doctor has actually taken — drives companions */
    acceptedIntentIds: number[];
    /**
     * Required to see this hospital's own pending (doctor-added, not yet
     * admin-approved) medicines alongside the global catalogue — see the
     * `hospitalId` note on `fetchCompositionBrands`. Optional only so a
     * still-resolving identity doesn't crash the hook; brands simply come
     * back global-only until it's ready.
     */
    hospitalId?: string;
}

export interface ConsultIntelligence {
    result: EngineResult | null;
    /** changes identity exactly when the engine's output changes — see ThinkingRing */
    thinkingKey: string;
    /** re-ranked by this doctor's history; safety-critical intents exempt */
    intents: PersonalizedIntent[];
    byType: Record<IntentType, PersonalizedIntent[]>;
    /** the subset needing acknowledgement before it can be prescribed */
    hardWarned: PersonalizedIntent[];
    /** active signals, with their human labels, strongest first */
    signals: { id: string; label: string; strength: number }[];
    companions: CompanionResult | null;
    /** examination findings worth checking for, given the chart so far — the
     * entry-band cascade one stage before Possible Conditions. Low confidence
     * by nature (2-3 symptoms driving it); ranking says so, never a verdict. */
    examSuggestions: RankedExamSuggestion[];
    brands: BrandIndex;
    brandsLoading: boolean;
    brandError: string | null;
    /**
     * Combination products containing a ranked (or companion) composition —
     * the counterpart to `brands`, which `composition_brands` restricts to
     * single-molecule products only. compositionId -> combos, fewest extra
     * molecules first. Empty for a composition with no combination products
     * or none fetched yet.
     */
    combinations: Map<number, ResolvedProduct[]>;
    combinationsLoading: boolean;
    isPediatric: boolean;
    measurements: MeasurementRow[];
    hasInput: boolean;
}

const EMPTY_BY_TYPE = (): Record<IntentType, PersonalizedIntent[]> => ({
    medicine: [], test: [], exercise: [], modality: [], referral: [], finding: [], advice: [],
    impairment: [],
});

export function useConsultIntelligence(args: ConsultIntelligenceArgs): ConsultIntelligence {
    const { data, visitId, observableIds, observableSources, vitals, ageYears, ageMonths, sex, acceptedIntentIds, hospitalId } = args;

    // ---- 1. inputs -> signals -> ranked intents. Synchronous. ----
    // `vitals` is rebuilt on every keystroke, so its identity is useless as a
    // dependency — but the fix used to be an ENUMERATED list of fields, and
    // that list silently stopped at the original five (bp, pulse, temp, spo2,
    // weight).
    //
    // Every field added after them — height, blood group, pain, ROM, LMP,
    // G-P-L-A, the glycaemic panel, respiratory rate — therefore did not
    // re-run the engine when it changed. Entering an LMP raised no
    // AMENORRHEA; entering a random sugar raised no HIGH_BLOOD_GLUCOSE. It
    // went unnoticed for so long because it self-heals the moment anything
    // else changes: add a chip after typing the number and the memo
    // recomputes with the current vitals, so it only ever failed when a
    // measurement was the LAST or ONLY thing entered.
    //
    // Serialising the whole object makes the enumeration — and therefore the
    // chance of it going stale again — structurally impossible. `vitals` is a
    // dozen short strings; stringifying it per keystroke costs nothing next to
    // the engine run it guards.
    const vitalsKey = JSON.stringify(vitals);

    const built = useMemo(() => {
        if (!data) return null;
        return buildEngineInput({ observableIds, vitals, ageYears, ageMonths, sex });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        data,
        observableIds.join(","),
        vitalsKey,
        ageYears,
        ageMonths,
        sex,
    ]);

    const result = useMemo(() => {
        if (!data || !built) return null;
        const hasAnything =
            built.input.observations.length > 0 || built.input.measurements.length > 0;
        if (!hasAnything) return null;
        return runEngine(data.ruleset, built.input);
    }, [data, built]);

    // "Synapse is thinking" — see ThinkingRing in features/consult/parts.tsx.
    // A value that changes identity exactly when the engine's OUTPUT changes
    // (a different set of ranked intents, or the same set with different
    // scores), and only then: recomputing to the SAME answer, or a render
    // with nothing new to say, must not re-fire the cue. Rounded scores so
    // floating-point noise below the two-decimal place a doctor could ever
    // perceive doesn't retrigger it either. Every ranked card (Possible
    // Conditions, Medicine Recommendations, Suggestions) is handed this same
    // string, so they ripple in the same frame — one engine, not three.
    const thinkingKey = useMemo(() => {
        if (!result) return "";
        return result.intents.map((i) => `${i.intentId}:${i.rawScore.toFixed(2)}`).join("|");
    }, [result]);

    // ---- 2. personalisation. Reorders only; never introduces an intent. ----
    const intents = useMemo(() => {
        if (!result || !data) return [];
        return personalize(result.intents, data.preferences);
    }, [result, data]);

    const byType = useMemo(() => {
        const out = EMPTY_BY_TYPE();
        for (const i of intents) out[i.type].push(i);
        return out;
    }, [intents]);

    const hardWarned = useMemo(
        () => intents.filter((i) => i.status === "warn_hard"),
        [intents]
    );

    const signals = useMemo(() => {
        if (!result || !data) return [];
        return result.activeSignals.map((s) => ({
            id: s.signalId,
            label: data.signalLabels.get(s.signalId) ?? s.signalId,
            strength: s.strength,
        }));
    }, [result, data]);

    const isPediatric = useMemo(
        () => (result ? isPediatricConsult(result.activeSignals.map((s) => s.signalId)) : false),
        [result]
    );

    // ---- 2b. exam suggestions. Same signals, a different target — see
    // examSuggestions.ts. Already-charted observables are excluded so this
    // never suggests re-ticking something already on the exam picker. ----
    const examSuggestions = useMemo(() => {
        if (!result || !data || !built) return [];
        return rankExamSuggestions(
            data.findingSuggestionRules,
            result.activeSignals,
            new Set(built.observableIds)
        );
    }, [result, data, built]);

    // ---- 3. companions. Fire on acceptance, after scoring, never on score. ----
    const acceptedKey = acceptedIntentIds.join(",");
    const companions = useMemo(() => {
        if (!result || !data || !data.companionEdges.length || !acceptedIntentIds.length) return null;
        const resolved = resolveCompanions(
            acceptedIntentIds,
            data.companionEdges,
            data.ruleset,
            result.activeSignals
        );
        // The practice curation layer — only ever removes an `ok`-status
        // suggestion this hospital has fully turned off; see that
        // function's own doc comment for why it cannot touch a caution.
        return applyHospitalCompanionPrefs(resolved, data.companionCuration);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, data, acceptedKey]);

    // ---- 4. brands. Async, cached per session, cannot block the ranking. ----
    const [brands, setBrands] = useState<BrandIndex>(new Map());
    const [brandsLoading, setBrandsLoading] = useState(false);
    const [brandError, setBrandError] = useState<string | null>(null);
    const brandCache = useRef(new Map<string, CompositionBrands>());

    // The preference model is rebuilt on reload; anything cached under the old
    // one was ordered by it, so it has to go.
    useEffect(() => {
        brandCache.current.clear();
    }, [data?.brandPreferences, data?.clinicBrandDefaults]);

    // Ranked medicines, plus any medicine a COMPANION is offering.
    //
    // A companion now lands on the Plan as a real prescription line, which
    // means it needs a brand exactly as a ranked medicine does. Companions fire
    // on acceptance, so their compositions are frequently not in the ranked set
    // — a PPI suggested because an NSAID was taken may never have been ranked
    // at all. Without this the doctor would be offered a pairing and then told
    // it has no product behind it.
    //
    // This changes which brands are FETCHED and nothing else. No score, no
    // rank and no guard verdict is touched by it.
    const companionCompositionIds = useMemo(() => {
        if (!companions || !data) return [];
        const out: number[] = [];
        for (const c of companions.suggestions) {
            if (c.type !== "medicine") continue;
            const intent = data.ruleset.intents.get(c.companionIntentId);
            if (intent?.refTable === "compositions" && intent.refId != null) {
                out.push(intent.refId);
            }
        }
        return out;
    }, [companions, data]);

    const wantedCompositions = useMemo(
        () => [...new Set([...compositionIdsOf(byType.medicine), ...companionCompositionIds])],
        [byType.medicine, companionCompositionIds]
    );
    const brandKey = `${isPediatric ? "p" : "a"}:${wantedCompositions.join(",")}`;

    useEffect(() => {
        if (!data) return;
        const ck = (id: number) => `${isPediatric ? "p" : "a"}:${id}`;
        const missing = wantedCompositions.filter((id) => !brandCache.current.has(ck(id)));

        if (missing.length === 0) {
            const next: BrandIndex = new Map();
            for (const id of wantedCompositions) {
                const hit = brandCache.current.get(ck(id));
                if (hit) next.set(id, hit);
            }
            setBrands(next);
            setBrandError(null);
            return;
        }

        let cancelled = false;
        setBrandsLoading(true);
        fetchCompositionBrands({
            compositionIds: missing,
            prefs: data.brandPreferences,
            clinicDefaults: data.clinicBrandDefaults,
            isPediatric,
            hospitalId,
        })
            .then((fetched) => {
                for (const [id, cb] of fetched) brandCache.current.set(ck(id), cb);
                if (cancelled) return;
                const next: BrandIndex = new Map();
                for (const id of wantedCompositions) {
                    const hit = brandCache.current.get(ck(id));
                    if (hit) next.set(id, hit);
                }
                setBrands(next);
                setBrandError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                // A brand lookup failure must not blank the ranking. The
                // composition ranking is the clinical output and stands on its
                // own; the UI keeps showing it and says why brands are missing.
                setBrandError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setBrandsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // `brandKey` is the identity of the request — the array itself is
        // rebuilt every render and would loop forever.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brandKey, data, isPediatric, hospitalId]);

    // ---- 4b. combination products, beside the single-molecule brands. ----
    // docs/aren-cortex-atlas.md §14.17: "Synapse does not recommend medicines
    // with more than one composition." `fetchCombinationProducts` (lib/db/
    // medicines.ts) was written 2026-08-13 and called from nowhere — this is
    // that wiring. Same shape as the brands cache just above, deliberately:
    // async, cannot block the ranking, and a failure here must not touch it.
    //
    // Catalogue-only (no doctor preference, no clinic default, no paediatric
    // form applies to which molecules a product CONTAINS), so unlike brands
    // the cache key is the composition id alone and is never invalidated.
    const [combinations, setCombinations] = useState<Map<number, ResolvedProduct[]>>(new Map());
    const [combinationsLoading, setCombinationsLoading] = useState(false);
    const combinationCache = useRef(new Map<number, ResolvedProduct[]>());
    const combinationKey = wantedCompositions.join(",");

    useEffect(() => {
        const missing = wantedCompositions.filter((id) => !combinationCache.current.has(id));

        if (missing.length === 0) {
            const next = new Map<number, ResolvedProduct[]>();
            for (const id of wantedCompositions) {
                const hit = combinationCache.current.get(id);
                if (hit) next.set(id, hit);
            }
            setCombinations(next);
            return;
        }

        let cancelled = false;
        setCombinationsLoading(true);
        fetchCombinationProducts({ compositionIds: missing })
            .then((fetched) => {
                // Record a miss too — an empty array for a molecule with no
                // combination product, so it is never re-fetched.
                for (const id of missing) combinationCache.current.set(id, fetched.get(id) ?? []);
                if (cancelled) return;
                const next = new Map<number, ResolvedProduct[]>();
                for (const id of wantedCompositions) {
                    const hit = combinationCache.current.get(id);
                    if (hit) next.set(id, hit);
                }
                setCombinations(next);
            })
            .catch((e) => {
                // Same rule as brands: a failure here must not blank the
                // ranking, and the single-molecule brands beside it still work.
                console.warn("combination products fetch failed:", e);
            })
            .finally(() => {
                if (!cancelled) setCombinationsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // `combinationKey` is the identity of the request, same reasoning as
        // `brandKey` above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [combinationKey]);

    // ---- 5. the raw input, persisted. Debounced, fire-and-forget. ----
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Read through a ref so provenance changing does not by itself restart the
    // debounce: `built` is what decides a write is needed, and the sources are
    // just how that write labels each row.
    const sourcesRef = useRef(observableSources);
    sourcesRef.current = observableSources;
    useEffect(() => {
        if (!visitId || !built) return;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            persistVisitInput({
                visitId,
                observableIds: built.observableIds,
                measurements: built.measurements,
                sources: sourcesRef.current,
            }).catch((e) => console.warn("visit input persist (non-fatal):", e));
        }, 600);
        return () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [visitId, built]);

    return {
        result,
        thinkingKey,
        intents,
        byType,
        hardWarned,
        signals,
        companions,
        examSuggestions,
        brands,
        brandsLoading,
        brandError,
        combinations,
        combinationsLoading,
        isPediatric,
        measurements: built?.measurements ?? [],
        hasInput: !!built && (built.observableIds.length > 0 || built.measurements.length > 0),
    };
}
