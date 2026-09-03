// ---------------------------------------------------------------------------
// CONSULT'S OPENING STATE — the front desk's work, on the doctor's chart.
//
// The one seam between the two halves of a Consult clinic. Reception records
// the patient, their complaints, volunteered history, sometimes a BP and a
// weight; the doctor opens the visit and it is already there, marked as the
// desk's, fully editable, already ranked.
//
// ── It is not only a convenience ──────────────────────────────────────────
// `persistVisitInput` (lib/db/synapse.ts) DELETES the visit's
// `visit_observations` and re-inserts them from the doctor's chart, on a 600ms
// debounce, every time the chart changes. Before this hook existed, a doctor
// opening a front-desk visit had an empty chart — so the first thing that
// write did was erase everything reception had entered. Reading it back onto
// the chart is what makes that delete-and-rewrite safe: the rows come back
// because they are now genuinely on the chart.
//
// That is also why the caller must run this BEFORE it sets `visitId` — see
// `useConsultLifecycle`, which is the only caller and does exactly that. With
// no visit id there is no persist effect to race.
//
// ── It runs in BOTH modes, deliberately ──────────────────────────────────
// In Cortex a brand-new visit has no intake, so this is a no-op that costs one
// cheap read. On a RESUMED visit — either mode — it is the read-back
// `useConsultLifecycle.resumeConsult`'s own header records as a known gap:
// the chips and measurements already written for that visit come back instead
// of the doctor facing a blank chart they have to retype.
// ---------------------------------------------------------------------------

import { useCallback } from "react";
import { fetchVisitIntake, type IntakeSource } from "../../lib/db/intake";
import type { ChipOrigin, ConsultChart } from "../../hooks/useConsultChart";

/**
 * The column's vocabulary, translated to the chart's — the mirror of
 * `DB_SOURCE` in `lib/db/synapse.ts`, and the only other place the two
 * vocabularies meet.
 *
 * `'doctor'` and `'import'` map to `undefined`: they are not provenance a chip
 * should wear a marker for. A chip the doctor typed should look like a chip
 * the doctor typed.
 */
const ORIGIN_OF: Record<IntakeSource, ChipOrigin | undefined> = {
    doctor: undefined,
    import: undefined,
    reception: "reception",
    confirmed_intent: "confirmed",
    carried_forward: "carried",
};

export interface IntakePrefillResult {
    /** how many chips came back — the toast says so, or says nothing */
    chips: number;
    /** whether any measurement came with them */
    hasMeasurements: boolean;
    attachmentCount: number;
}

export function useIntakePrefill(chart: ConsultChart) {
    const { seedIntake, setVitals } = chart;

    return useCallback(async (visitId: string): Promise<IntakePrefillResult> => {
        const intake = await fetchVisitIntake(visitId);

        if (intake.observations.length) {
            seedIntake(intake.observations.map((o) => ({
                label: o.label,
                kind: o.kind,
                durationDays: o.durationDays,
                origin: ORIGIN_OF[o.source],
            })));
        }

        const entries = Object.entries(intake.vitals).filter(([, v]) => v !== undefined && v !== "");
        if (entries.length) {
            // Merge, never replace, and never over a value that is already
            // there. The chart has just been reset so in practice nothing is,
            // but a rule that only holds "in practice" is the one that breaks
            // when a second caller appears.
            setVitals((curr) => {
                const next = { ...curr };
                let changed = false;
                for (const [key, value] of entries) {
                    const k = key as keyof typeof next;
                    if (next[k]) continue;
                    (next as Record<string, string>)[k] = value as string;
                    changed = true;
                }
                return changed ? next : curr;
            });
        }

        return {
            chips: intake.observations.length,
            hasMeasurements: entries.length > 0,
            attachmentCount: intake.attachmentCount,
        };
    }, [seedIntake, setVitals]);
}
