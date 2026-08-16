// ═══════════════════════════════════════════════════════════════════════════
//  VISIT ADAPTER — the longitudinal read seam
//
//  One place that turns a stored `RealVisit` back into the shapes the live
//  consult already speaks: `PrescriptionMedicine[]` and the props
//  `PrescriptionDocument` renders.
//
//  Everything that reads history goes through here — the past-visit viewer,
//  Repeat Rx, and (next) visit-to-visit comparison. Keeping the conversion in
//  one pure, React-free module is the whole point: comparison needs to line up
//  two visits field-by-field, and it can only do that if both sides were
//  normalised the same way.
// ═══════════════════════════════════════════════════════════════════════════

import { freqSlotToLabel } from "../../lib/db";
import type { RealVisit, RealVisitMedicine } from "../../lib/db";
import type { PrescriptionMedicine, Vitals } from "../../types";

export const EMPTY_VITALS: Vitals = { bp: "", pulse: "", temp: "", spo2: "", weight: "" };

/**
 * A stored medicine row → the shape the consult workspace and the printable
 * document both use.
 *
 * `idPrefix` keeps React keys from colliding when the same historical medicine
 * is on screen twice (e.g. viewer open while a Repeat Rx sits in the tray).
 */
export function toPrescriptionMedicine(
    med: RealVisitMedicine,
    index: number,
    idPrefix = "visit"
): PrescriptionMedicine {
    const compositionIds = med.composition_ids.length
        ? med.composition_ids
        : med.composition_id
            ? [med.composition_id]
            : [];

    return {
        id: `${idPrefix}-${med.medicine_id}-${index}`,
        medicine_id: med.medicine_id,
        composition_ids: compositionIds,
        primary_composition_id: med.composition_id ?? compositionIds[0] ?? 0,
        name: med.name,
        category: "",
        use: "",
        match: 0,
        composition: "",

        // Display fields — mirror the defaults the live inspector applies, so a
        // reproduced document reads identically to the one that was issued.
        dosage: med.dosage_mg ? `${med.dosage_mg}mg` : "1 tab",
        frequency: med.frequency ? freqSlotToLabel(med.frequency) : "Morning and Night",
        duration: med.duration_days ? `${med.duration_days} days` : "5 days",
        notes: med.notes ?? "",

        // Persistence fields — carried through verbatim.
        dosage_mg: med.dosage_mg,
        duration_days: med.duration_days,
        route: med.route ?? "oral",
        instructions: med.instructions ?? "",
        is_sos: med.is_sos,
        sort_order: med.sort_order ?? index,
    };
}

export function toPrescriptionMedicines(
    visit: RealVisit,
    idPrefix = "visit"
): PrescriptionMedicine[] {
    return visit.medicines.map((med, i) => toPrescriptionMedicine(med, i, idPrefix));
}

/** Stored vitals are loose jsonb; normalise to the five fields the UI knows. */
export function toVitals(visit: RealVisit): Vitals {
    const v = visit.vitals;
    if (!v) return EMPTY_VITALS;
    return {
        bp: v.bp ?? "",
        pulse: v.pulse ?? "",
        temp: v.temp ?? "",
        spo2: v.spo2 ?? "",
        weight: v.weight ?? "",
    };
}

export function toFindingNames(visit: RealVisit): string[] {
    return visit.findings.map((f) => f.name);
}

/**
 * The clinical payload of a past visit, in document terms.
 *
 * Deliberately excludes patient/doctor/hospital/format — those are "who is
 * looking at this now" concerns supplied by the caller, not properties of the
 * historical visit.
 */
export interface VisitDocumentContent {
    visitId: string;
    date: string;
    prescriptionRef?: string;
    symptoms: string[];
    findings: string[];
    prescription: PrescriptionMedicine[];
    tests: string[];
    followUpDays: number | null;
    adviceNotes: string;
    vitals: Vitals;
}

export function toDocumentContent(visit: RealVisit, idPrefix = "visit"): VisitDocumentContent {
    return {
        visitId: visit.id,
        date: visit.created_at,
        prescriptionRef: visit.prescription_ref ?? visit.id.slice(0, 8),
        symptoms: visit.symptoms,
        findings: toFindingNames(visit),
        prescription: toPrescriptionMedicines(visit, idPrefix),
        tests: visit.tests,
        followUpDays: visit.follow_up_days,
        adviceNotes: visit.advice_notes ?? "",
        vitals: toVitals(visit),
    };
}

/** True when there is anything worth rendering or importing. */
export function hasClinicalContent(visit: RealVisit): boolean {
    return (
        visit.symptoms.length > 0 ||
        visit.findings.length > 0 ||
        visit.medicines.length > 0 ||
        visit.tests.length > 0
    );
}

export function formatVisitDateLong(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

export function formatVisitDateShort(iso: string): string {
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        ...(sameYear ? {} : { year: "numeric" }),
    });
}
