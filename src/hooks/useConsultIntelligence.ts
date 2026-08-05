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
import { resolveCompanions, type CompanionResult } from "../lib/synapse/companions";
import { rankExamSuggestions, type RankedExamSuggestion } from "../lib/synapse/examSuggestions";
import { buildEngineInput, isPediatricConsult, type MeasurementRow } from "../lib/synapse/consultInput";
import {
    fetchCompositionBrands,
    compositionIdsOf,
    persistVisitInput,
    type BrandIndex,
    type CompositionBrands,
} from "../lib/db/synapse";
import type { SynapseData } from "./useSynapse";
import type { Vitals } from "../types";

export interface ConsultIntelligenceArgs {
    data: SynapseData | null;
    visitId: string | null;
    /** every observable on the chart: symptoms, findings and history alike */
    observableIds: number[];
    vitals: Vitals;
    ageYears: number | null;
    /** intent ids the doctor has actually taken — drives companions */
    acceptedIntentIds: number[];
}

export interface ConsultIntelligence {
    result: EngineResult | null;
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
    isPediatric: boolean;
    measurements: MeasurementRow[];
    hasInput: boolean;
}

const EMPTY_BY_TYPE = (): Record<IntentType, PersonalizedIntent[]> => ({
    medicine: [], test: [], exercise: [], referral: [], finding: [], advice: [],
});

export function useConsultIntelligence(args: ConsultIntelligenceArgs): ConsultIntelligence {
    const { data, visitId, observableIds, vitals, ageYears, acceptedIntentIds } = args;

    // ---- 1. inputs -> signals -> ranked intents. Synchronous. ----
    const built = useMemo(() => {
        if (!data) return null;
        return buildEngineInput({ observableIds, vitals, ageYears });
        // vitals is a small object rebuilt on every keystroke; its FIELDS are
        // the real dependency, so they are listed rather than the identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        data,
        observableIds.join(","),
        vitals.bp, vitals.pulse, vitals.temp, vitals.spo2, vitals.weight,
        ageYears,
    ]);

    const result = useMemo(() => {
        if (!data || !built) return null;
        const hasAnything =
            built.input.observations.length > 0 || built.input.measurements.length > 0;
        if (!hasAnything) return null;
        return runEngine(data.ruleset, built.input);
    }, [data, built]);

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
        return resolveCompanions(
            acceptedIntentIds,
            data.companionEdges,
            data.ruleset,
            result.activeSignals
        );
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
    }, [brandKey, data, isPediatric]);

    // ---- 5. the raw input, persisted. Debounced, fire-and-forget. ----
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!visitId || !built) return;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            persistVisitInput({
                visitId,
                observableIds: built.observableIds,
                measurements: built.measurements,
            }).catch((e) => console.warn("visit input persist (non-fatal):", e));
        }, 600);
        return () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [visitId, built]);

    return {
        result,
        intents,
        byType,
        hardWarned,
        signals,
        companions,
        examSuggestions,
        brands,
        brandsLoading,
        brandError,
        isPediatric,
        measurements: built?.measurements ?? [],
        hasInput: !!built && (built.observableIds.length > 0 || built.measurements.length > 0),
    };
}
