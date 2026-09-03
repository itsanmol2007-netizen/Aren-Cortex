// ---------------------------------------------------------------------------
// WHAT THE FRONT DESK ALREADY KNOWS ABOUT THIS VISIT.
//
// Consult's starting state. Reception fills in the patient, the symptoms and
// volunteered history, sometimes a BP and a weight, sometimes a photo of an
// old report — and until this file existed none of it reached the doctor's
// screen. Two separate consequences, and the second one is the serious one:
//
//   1. The doctor re-asked questions the patient had already answered at the
//      desk, which is the whole thing Consult exists to stop.
//   2. `persistVisitInput` (lib/db/synapse.ts) DELETES every
//      `visit_observations` row for the visit and re-inserts from the doctor's
//      chart. So the moment the doctor added their first chip, reception's
//      intake was silently erased from the permanent record. Reading it back
//      onto the chart is what makes that delete-and-rewrite safe: the rows
//      come back because they are now genuinely on the chart.
//
// Read-only. Everything here answers "what is already recorded"; the writes
// stay where they were (`patients.ts` for the front desk, `synapse.ts` for the
// consult), per standing rule 1's "DB calls live in lib/db" and its corollary
// that a module owns its own writes.
// ---------------------------------------------------------------------------

import { supabase } from "../supabase";
import { measurementsToVitals } from "../synapse/consultInput";
import type { Vitals } from "../../types";

export type IntakeSource = "doctor" | "reception" | "confirmed_intent" | "carried_forward" | "import";

export interface IntakeObservation {
    observableId: number;
    label: string;
    kind: "symptom" | "finding" | "history";
    source: IntakeSource;
    /** how long, in days — null when nobody asked or the question was skipped */
    durationDays: number | null;
}

export interface VisitIntake {
    visitId: string;
    observations: IntakeObservation[];
    /** the same numbers, in the shape MeasurementsCard edits */
    vitals: Partial<Vitals>;
    attachmentCount: number;
}

/**
 * Everything recorded against one visit before the doctor opened it.
 *
 * Best-effort by construction: every branch degrades to "nothing recorded"
 * rather than throwing, because this runs on the path that STARTS a consult
 * and a failed prefill must never stop a doctor from seeing a patient. The
 * caller gets an empty intake and the doctor charts from scratch — exactly
 * what Cortex has always done.
 */
export async function fetchVisitIntake(visitId: string): Promise<VisitIntake> {
    const empty: VisitIntake = { visitId, observations: [], vitals: {}, attachmentCount: 0 };
    if (!visitId) return empty;

    try {
        const [obsRes, measureRes, attachRes] = await Promise.all([
            supabase
                .from("visit_observations")
                .select("observable_id, source, duration_days")
                .eq("visit_id", visitId),
            supabase
                .from("visit_measurements")
                .select("measure_key, value_num, value_text")
                .eq("visit_id", visitId),
            supabase
                .from("visit_attachments")
                .select("id", { count: "exact", head: true })
                .eq("visit_id", visitId),
        ]);

        const rows = obsRes.data ?? [];
        let observations: IntakeObservation[] = [];
        if (rows.length) {
            const ids = [...new Set(rows.map((r: any) => Number(r.observable_id)))];
            const { data: catalogue } = await supabase
                .from("observables")
                .select("id, label, kind")
                .in("id", ids);
            const byId = new Map<number, { label: string; kind: IntakeObservation["kind"] }>();
            for (const o of catalogue ?? []) byId.set(Number(o.id), { label: o.label, kind: o.kind });

            observations = rows
                .map((r: any) => {
                    const hit = byId.get(Number(r.observable_id));
                    if (!hit) return null;
                    return {
                        observableId: Number(r.observable_id),
                        label: hit.label,
                        kind: hit.kind,
                        source: (r.source ?? "doctor") as IntakeSource,
                        durationDays: r.duration_days == null ? null : Number(r.duration_days),
                    } satisfies IntakeObservation;
                })
                .filter((o): o is IntakeObservation => o !== null);
        }

        return {
            visitId,
            observations,
            vitals: measurementsToVitals(measureRes.data ?? []),
            attachmentCount: attachRes.count ?? 0,
        };
    } catch (e) {
        console.warn("fetchVisitIntake (non-fatal):", e);
        return empty;
    }
}

// ── The queue's own preview of the same thing ──────────────────────────────

export interface IntakePreview {
    /** presenting complaints, reception's own words for them */
    symptoms: string[];
    /** volunteered context — "Known diabetic", "Pregnant" */
    history: string[];
    /** the handful of numbers worth showing on a card, already formatted */
    measurements: { label: string; value: string }[];
    attachmentCount: number;
}

/**
 * The compact readout the transition modal and the queue sheet both print.
 *
 * ONE round trip for the whole visible queue rather than one per card: the
 * transition modal shows five patients at once, and five patients × three
 * queries is thirty requests against a browser that will only run six of them
 * at a time (see `cortex-gotchas.md` on the per-origin connection cap).
 *
 * Formatting happens here, not in the card, because both surfaces print the
 * identical string and a second formatter is a second answer to "what was the
 * BP". Only the readings a doctor scans a queue card for — the general vitals
 * — are included; the full set is on the Measurements card once the consult is
 * open.
 */
const PREVIEW_MEASURES: { key: string; label: string; unit: string }[] = [
    { key: "BP_SYS", label: "BP", unit: "" },       // paired with BP_DIA below
    { key: "TEMP", label: "Temp", unit: "°F" },
    { key: "HR", label: "Pulse", unit: "" },
    { key: "SPO2", label: "SpO₂", unit: "%" },
    { key: "RR", label: "Resp", unit: "/min" },
    { key: "WEIGHT", label: "Weight", unit: "kg" },
    { key: "PAIN_VAS", label: "Pain", unit: "/10" },
];

export async function fetchIntakePreviews(visitIds: string[]): Promise<Map<string, IntakePreview>> {
    const out = new Map<string, IntakePreview>();
    if (!visitIds.length) return out;

    try {
        const [obsRes, measureRes, attachRes] = await Promise.all([
            supabase.from("visit_observations").select("visit_id, observable_id").in("visit_id", visitIds),
            supabase.from("visit_measurements").select("visit_id, measure_key, value_num, value_text").in("visit_id", visitIds),
            supabase.from("visit_attachments").select("visit_id").in("visit_id", visitIds),
        ]);

        const obsRows = obsRes.data ?? [];
        const kindById = new Map<number, { label: string; kind: string }>();
        if (obsRows.length) {
            const ids = [...new Set(obsRows.map((r: any) => Number(r.observable_id)))];
            const { data: catalogue } = await supabase
                .from("observables").select("id, label, kind").in("id", ids);
            for (const o of catalogue ?? []) kindById.set(Number(o.id), { label: o.label, kind: o.kind });
        }

        const blank = (): IntakePreview => ({ symptoms: [], history: [], measurements: [], attachmentCount: 0 });
        for (const id of visitIds) out.set(id, blank());

        for (const r of obsRows as any[]) {
            const bucket = out.get(r.visit_id);
            const hit = kindById.get(Number(r.observable_id));
            if (!bucket || !hit) continue;
            if (hit.kind === "history") bucket.history.push(hit.label);
            else if (hit.kind === "symptom") bucket.symptoms.push(hit.label);
        }

        const byVisit = new Map<string, Map<string, { num: number | null; text: string | null }>>();
        for (const r of (measureRes.data ?? []) as any[]) {
            let m = byVisit.get(r.visit_id);
            if (!m) { m = new Map(); byVisit.set(r.visit_id, m); }
            const n = r.value_num == null ? null : Number(r.value_num);
            m.set(r.measure_key, { num: Number.isFinite(n as number) ? (n as number) : null, text: r.value_text ?? null });
        }
        for (const [visitId, m] of byVisit) {
            const bucket = out.get(visitId);
            if (!bucket) continue;
            for (const spec of PREVIEW_MEASURES) {
                const row = m.get(spec.key);
                if (!row || row.num === null) continue;
                if (spec.key === "BP_SYS") {
                    const dia = m.get("BP_DIA");
                    bucket.measurements.push({
                        label: "BP",
                        value: `${Math.round(row.num)}/${dia?.num != null ? Math.round(dia.num) : "—"}`,
                    });
                } else if (spec.key === "TEMP") {
                    // Stored Celsius, read Fahrenheit — same conversion as
                    // `measurementsToVitals`, for the same reason.
                    bucket.measurements.push({
                        label: "Temp",
                        value: `${Math.round(((row.num * 9) / 5 + 32) * 10) / 10}${spec.unit}`,
                    });
                } else {
                    bucket.measurements.push({
                        label: spec.label,
                        value: `${Math.round(row.num * 10) / 10}${spec.unit}`,
                    });
                }
            }
        }

        for (const r of (attachRes.data ?? []) as any[]) {
            const bucket = out.get(r.visit_id);
            if (bucket) bucket.attachmentCount += 1;
        }

        return out;
    } catch (e) {
        console.warn("fetchIntakePreviews (non-fatal):", e);
        return out;
    }
}

// ── Operational events ─────────────────────────────────────────────────────

/**
 * Record something operationally accountable, clinic-wide and durably.
 *
 * Distinct from `features/frontdesk/operational/eventLog.ts`, which is a
 * localStorage note about THIS browser ("went offline at 2:41"). This one
 * outlives the browser profile because somebody may have to answer for it —
 * "why did token 014 go in before 011" has an answer now.
 *
 * Fire-and-forget by rule 4: a consultation must never fail because its audit
 * write did.
 */
export function logOperationalEvent(opts: {
    hospitalId: string;
    actorUserId: string | null;
    kind: "queue_override" | "queue_skip";
    visitId?: string | null;
    detail?: Record<string, unknown>;
}): void {
    void supabase
        .from("operational_events")
        .insert({
            hospital_id: opts.hospitalId,
            actor_user_id: opts.actorUserId,
            kind: opts.kind,
            visit_id: opts.visitId ?? null,
            detail: opts.detail ?? {},
        })
        .then(({ error }) => {
            if (error) console.warn("operational_events (non-fatal):", error.message);
        });
}
