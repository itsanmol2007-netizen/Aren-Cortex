// ═══════════════════════════════════════════════════════════════════════════
//  VISIT COMPARE — the diff layer on top of the longitudinal read seam
//
//  Pure functions only: given two visits (already in chronological order),
//  work out what changed. No React, no fetching — visitAdapter.ts already
//  normalises a RealVisit into the shapes these functions and the UI both
//  need, so a rendered document and a computed diff can never read the same
//  visit two different ways.
//
//  Deliberately does NOT colour-code numeric direction (is a rising BP bad?
//  is falling weight bad?) — the schema has no per-measure "which way is
//  improvement" signal today (see measurement_rules), so guessing it would
//  mean showing a false "improving" green on a deteriorating patient. This
//  module reports magnitude only, never judgement. Medicine/symptom/finding
//  status labels below (added/stopped/resolved/new) are categorical state
//  changes, not clinical judgements, so those are safe to distinguish.
// ═══════════════════════════════════════════════════════════════════════════

import type { RealVisit, RealVisitMedicine } from "../../lib/db";
import type { PrescriptionMedicine } from "../../types";
import { toPrescriptionMedicine } from "./visitAdapter";

// ── Medicines ────────────────────────────────────────────────────────────────

export type MedicineDiffStatus = "changed" | "added" | "stopped" | "unchanged";
export type MedicineDiffField = "dosage" | "frequency" | "duration" | "route";

export interface MedicineDiffRow {
    status: MedicineDiffStatus;
    medicine_id: number;
    name: string;
    older: PrescriptionMedicine | null;
    newer: PrescriptionMedicine | null;
    changedFields: MedicineDiffField[];
}

function fieldsChanged(a: RealVisitMedicine, b: RealVisitMedicine): MedicineDiffField[] {
    const changed: MedicineDiffField[] = [];
    if ((a.dosage_mg ?? null) !== (b.dosage_mg ?? null)) changed.push("dosage");
    if ((a.frequency ?? "") !== (b.frequency ?? "")) changed.push("frequency");
    if ((a.duration_days ?? null) !== (b.duration_days ?? null)) changed.push("duration");
    if ((a.route ?? "oral") !== (b.route ?? "oral")) changed.push("route");
    return changed;
}

const STATUS_ORDER: Record<MedicineDiffStatus, number> = {
    changed: 0,
    added: 1,
    stopped: 2,
    unchanged: 3,
};

/**
 * `older`/`newer` must already be in chronological order — this function
 * trusts the caller rather than re-deriving order from created_at, because
 * the compare UI already has to sort once to build the header; doing it
 * again here would just be a second place to get it wrong.
 */
export function diffMedicines(older: RealVisit, newer: RealVisit): MedicineDiffRow[] {
    const olderById = new Map(older.medicines.map((m) => [m.medicine_id, m]));
    const newerById = new Map(newer.medicines.map((m) => [m.medicine_id, m]));
    const allIds = new Set([...olderById.keys(), ...newerById.keys()]);

    const rows: MedicineDiffRow[] = [];
    for (const id of allIds) {
        const o = olderById.get(id);
        const n = newerById.get(id);

        if (o && !n) {
            rows.push({
                status: "stopped", medicine_id: id, name: o.name,
                older: toPrescriptionMedicine(o, id, "cmp-old"), newer: null, changedFields: [],
            });
        } else if (!o && n) {
            rows.push({
                status: "added", medicine_id: id, name: n.name,
                older: null, newer: toPrescriptionMedicine(n, id, "cmp-new"), changedFields: [],
            });
        } else if (o && n) {
            const changedFields = fieldsChanged(o, n);
            rows.push({
                status: changedFields.length ? "changed" : "unchanged",
                medicine_id: id,
                name: n.name,
                older: toPrescriptionMedicine(o, id, "cmp-old"),
                newer: toPrescriptionMedicine(n, id, "cmp-new"),
                changedFields,
            });
        }
    }

    return rows.sort(
        (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
    );
}

// ── Symptoms & findings ────────────────────────────────────────────────────

export interface SetDiff<T> {
    /** In newer, not older. */
    added: T[];
    /** In older, not newer. */
    resolved: T[];
    /** In both. */
    persisting: T[];
}

export function diffSymptoms(older: RealVisit, newer: RealVisit): SetDiff<string> {
    const o = new Set(older.symptoms);
    const n = new Set(newer.symptoms);
    return {
        added: newer.symptoms.filter((s) => !o.has(s)),
        resolved: older.symptoms.filter((s) => !n.has(s)),
        persisting: newer.symptoms.filter((s) => o.has(s)),
    };
}

export interface FindingLike { name: string; is_abnormal: boolean }

export function diffFindings(older: RealVisit, newer: RealVisit): SetDiff<FindingLike> {
    const oNames = new Set(older.findings.map((f) => f.name));
    const nNames = new Set(newer.findings.map((f) => f.name));
    return {
        added: newer.findings.filter((f) => !oNames.has(f.name)),
        resolved: older.findings.filter((f) => !nNames.has(f.name)),
        persisting: newer.findings.filter((f) => oNames.has(f.name)),
    };
}

// ── Vitals ──────────────────────────────────────────────────────────────────

export interface VitalDiffRow {
    key: string;
    label: string;
    unit: string;
    older: number | null;
    newer: number | null;
    /** newer − older, only when both sides are present and numeric. */
    delta: number | null;
}

function parseNum(s: string | undefined): number | null {
    if (!s?.trim()) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

function splitBP(s: string | undefined): [number | null, number | null] {
    if (!s?.trim()) return [null, null];
    const [sys, dia] = s.split("/");
    return [parseNum(sys), parseNum(dia)];
}

function vitalRow(
    key: string, label: string, unit: string,
    ov: number | null, nv: number | null
): VitalDiffRow {
    return {
        key, label, unit, older: ov, newer: nv,
        delta: ov !== null && nv !== null ? Math.round((nv - ov) * 10) / 10 : null,
    };
}

/**
 * Reads visits.vitals as typed (Fahrenheit temp, mmHg BP) — matches every
 * other on-screen display in the app (topbar, Review). No unit conversion,
 * no plausibility filtering; that belongs to the write-path validator
 * (lib/db/measurements.ts), not to a display diff.
 */
export function diffVitals(older: RealVisit, newer: RealVisit): VitalDiffRow[] {
    const o = older.vitals ?? {};
    const n = newer.vitals ?? {};
    const [oSys, oDia] = splitBP(o.bp);
    const [nSys, nDia] = splitBP(n.bp);

    return [
        vitalRow("bp_sys", "BP Systolic", "mmHg", oSys, nSys),
        vitalRow("bp_dia", "BP Diastolic", "mmHg", oDia, nDia),
        vitalRow("pulse", "Pulse", "bpm", parseNum(o.pulse), parseNum(n.pulse)),
        vitalRow("temp", "Temp", "°F", parseNum(o.temp), parseNum(n.temp)),
        vitalRow("spo2", "SpO₂", "%", parseNum(o.spo2), parseNum(n.spo2)),
        vitalRow("weight", "Weight", "kg", parseNum(o.weight), parseNum(n.weight)),
    ].filter((r) => r.older !== null || r.newer !== null);
}
