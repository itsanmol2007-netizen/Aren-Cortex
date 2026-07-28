// ---------------------------------------------------------------------------
// Loads everything the engine needs, once per session.
//
// The ruleset is ~4,000 rows across seven tables and does not change during a
// consultation, so it is fetched once and cached. `reload()` exists because
// rule weights get edited directly in the database during calibration and
// waiting for a page refresh to see the effect makes tuning miserable.
//
// Failure is graded, not all-or-nothing. The ruleset is the clinical output and
// the consult cannot rank without it — that is a hard failure. The three
// preference models are personalisation: if they fail, the doctor gets the
// global evidence-based ranking, which is exactly what a doctor with no history
// gets anyway. Losing personalisation must never cost the doctor the ranking.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ruleset } from "../lib/synapse/engine";
import { buildPreferenceModel, type PreferenceModel, type PreferenceRow } from "../lib/synapse/personalize";
import { buildBrandModel, type BrandPreferenceModel, type BrandPreference } from "../lib/synapse/brands";
import type { CompanionEdge } from "../lib/synapse/companions";
import {
    loadSynapseRuleset,
    loadSignalLabels,
    loadObservableMaps,
    fetchObservables,
    type Observable,
    loadPreferences,
    loadBrandPreferences,
    loadClinicBrandDefaults,
    loadFrequentMedicines,
    loadCompanionEdges,
    type ObservableMaps,
    type ClinicBrandDefaults,
    type FrequentMedicine,
} from "../lib/db/synapse";
import { useClinicalIdentity } from "./useClinicalIdentity";

export interface SynapseData {
    ruleset: Ruleset;
    /** signalId -> human label, for explaining "why" */
    signalLabels: Map<string, string>;
    /** ★ the catalogue — every pickable chip, split by `kind` */
    observables: Observable[];
    /** observable -> legacy symptom/finding id, for the v1 compatibility write */
    observableMaps: ObservableMaps;
    /** this doctor's learned preferences — local to them, never global */
    preferences: PreferenceModel;
    /** this doctor's brand habits — a separate, ~6x faster model */
    brandPreferences: BrandPreferenceModel;
    /** the clinic's declared brands — shared by everyone working here */
    clinicBrandDefaults: ClinicBrandDefaults;
    /** this doctor's most-prescribed molecules. Not a model, a flat count. */
    frequent: FrequentMedicine[];
    companionEdges: CompanionEdge[];
    /** signals that at least one active rule points at — i.e. can produce output */
    signalsWithRules: Set<string>;
    loadedAt: Date;
    /** true when personalisation could not be loaded but ranking still works */
    degraded: boolean;
}

type Status = "idle" | "loading" | "ready" | "error";

export interface UseSynapse {
    status: Status;
    data: SynapseData | null;
    error: string | null;
    reloading: boolean;
    reload: () => void;
}

export function useSynapse(): UseSynapse {
    const identity = useClinicalIdentity();
    const [status, setStatus] = useState<Status>("idle");
    const [data, setData] = useState<SynapseData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloading, setReloading] = useState(false);
    const mounted = useRef(true);

    // Personalisation is loaded ONLY under a verified identity. When a signed-in
    // account has no `doctors` row, `useClinicalIdentity` falls back to the MVP
    // constant — and loading personalisation on that id would show one doctor
    // another doctor's learned rules, habits and frequent list. Falling back to
    // the global ranking is the correct failure: it is what every doctor sees on
    // their first day, and it is nobody else's data.
    const { hospitalId, ready, isReal } = identity;
    const doctorId = isReal ? identity.doctorId : null;

    const load = useCallback(
        async (isReload: boolean) => {
            if (isReload) setReloading(true);
            else setStatus("loading");
            setError(null);

            try {
                // The clinical half. If any of this fails there is no ranking.
                const [ruleset, signalLabels, observables, observableMaps] = await Promise.all([
                    loadSynapseRuleset(doctorId),
                    loadSignalLabels(),
                    fetchObservables(),
                    loadObservableMaps(),
                ]);

                // The personalisation half. Each piece degrades on its own —
                // one missing view must not cost the doctor the whole surface.
                const soft = async <T,>(p: Promise<T>, fallback: T): Promise<[T, boolean]> => {
                    try {
                        return [await p, false];
                    } catch (e) {
                        console.warn("Synapse personalisation (non-fatal):", e);
                        return [fallback, true];
                    }
                };

                const [
                    [prefRows, f1],
                    [brandRows, f2],
                    [clinicBrandDefaults, f3],
                    [frequent, f4],
                    [companionEdges, f5],
                ] = await Promise.all([
                    doctorId
                        ? soft(loadPreferences(doctorId), [] as PreferenceRow[])
                        : ([[] as PreferenceRow[], false] as [PreferenceRow[], boolean]),
                    doctorId
                        ? soft(loadBrandPreferences(doctorId), [] as BrandPreference[])
                        : ([[] as BrandPreference[], false] as [BrandPreference[], boolean]),
                    // The clinic tier is keyed by hospital, not by doctor, so it
                    // loads either way — a shared default is not personal data.
                    soft(loadClinicBrandDefaults(hospitalId), new Map() as ClinicBrandDefaults),
                    doctorId
                        ? soft(loadFrequentMedicines(doctorId), [] as FrequentMedicine[])
                        : ([[] as FrequentMedicine[], false] as const),
                    soft(loadCompanionEdges(), [] as CompanionEdge[]),
                ]);

                if (!mounted.current) return;

                setData({
                    ruleset,
                    signalLabels,
                    observables,
                    observableMaps,
                    preferences: buildPreferenceModel(prefRows),
                    brandPreferences: buildBrandModel(brandRows),
                    clinicBrandDefaults,
                    frequent,
                    companionEdges,
                    // A chip can be perfectly wired to a signal and still
                    // produce nothing because no rule points at that signal
                    // yet. That is a gap in the knowledge base, not an empty
                    // result, and the two must not look the same.
                    signalsWithRules: new Set(ruleset.signalIntentRules.map((r) => r.signalId)),
                    loadedAt: new Date(),
                    degraded: f1 || f2 || f3 || f4 || f5,
                });
                setStatus("ready");
            } catch (e) {
                if (!mounted.current) return;
                setError(e instanceof Error ? e.message : String(e));
                setStatus("error");
            } finally {
                if (mounted.current) setReloading(false);
            }
        },
        [doctorId, hospitalId]
    );

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        // Wait for a real identity: loading the ruleset under the MVP fallback
        // and then reloading under the real doctor would fetch twice and,
        // worse, briefly show one doctor's overlay to another.
        if (!ready) return;
        void load(false);
    }, [ready, load]);

    const reload = useCallback(() => void load(true), [load]);

    return { status, data, error, reloading, reload };
}
