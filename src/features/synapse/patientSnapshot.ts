// ---------------------------------------------------------------------------
// PATIENT SNAPSHOT — specialty-aware "Clinical Snapshot" for the Patient
// Overview table and Today's Patients cards. Same configuration law as
// `specialtyProfile.ts`: this decides what a row SHOWS, never what the
// engine ranks or what gets recorded. Built 2026-08-23.
//
// ── Why this is a separate module, not inline in PatientsList.tsx
//
// The brief is explicit: "Do not use fixed clinical columns... because the
// content must be specialty-aware" and "do not hardcode this only for
// physiotherapy... create the structure so that specialty-specific display
// rules can be configured later." One function per configured specialty,
// keyed the same way `PROFILES` is keyed in specialtyProfile.ts, with a
// General-OPD-shaped fallback for every profile that has not earned its own
// rule yet — exactly the posture `inputLayout` already takes for the consult
// screen (`"soap"` fallback until a profile's turn comes).
//
// ── Only two specialties are "real" today, on purpose
//
// General OPD and Physiotherapy are the only profiles with configured
// clinical reasoning here, per the brief's own scope ("the meaningful
// supported contexts are: General OPD, Physiotherapy... Other specialty
// categories currently present in the system should not be treated as fully
// supported clinical workflows"). Every other profile (Diagnostics,
// Cardiology, Pediatrics, Gynaecology, Dentistry, Dermatology) falls through
// to the General OPD shape — correct today because none of them has its own
// `inputLayout` yet either (still `"soap"`, see specialtyProfile.ts), so
// there is no specialty-specific clinical shape to read in the first place.
//
// ── Honesty over fabrication (Anmol, 2026-08-23)
//
// Every field this reads is real — no field here is a heuristic standing in
// for data that doesn't exist. Two real gaps this module works around by
// SAYING NOTHING rather than inventing something:
//   1. `impairment_names` reads empty for every visit today — the
//      `visit_impairments` table exists (migration `add_visit_impairments`)
//      but nothing writes to it yet. See aren-cortex-context.md §7.
//   2. `care_plan_session_label` is null unless a visit is actually linked
//      to an active care plan with a target — which is effectively never,
//      today (care_plans exists and works, nothing calls it from the physio
//      consult flow yet). The fallback is the patient's REAL visit count,
//      labelled "visits" rather than a fabricated "session N of M".
// Both are tracked gaps for a dedicated physio-consult session, not patched
// over here with invented data.
// ---------------------------------------------------------------------------

import type { PatientRecordRow } from "../../lib/db";
import type { SpecialtyProfile } from "./specialtyProfile";

export type SnapshotChipTone = "primary" | "neutral" | "count";

export interface SnapshotChip {
    label: string;
    tone: SnapshotChipTone;
}

export interface ClinicalSnapshot {
    /** 1–3 short tags, primary complaint first. Empty means nothing recorded. */
    chips: SnapshotChip[];
    /** One supporting line, or null when nothing real is recorded — render an
     *  honest empty state, never a placeholder pretending to be data. */
    detail: string | null;
}

const EMPTY_SNAPSHOT: ClinicalSnapshot = { chips: [], detail: null };

function countChip(row: PatientRecordRow, noun: string): SnapshotChip {
    if (row.care_plan_session_label) {
        return { label: row.care_plan_session_label, tone: "count" };
    }
    const n = row.visit_count ?? 1;
    return { label: `${n} ${noun}${n === 1 ? "" : "s"}`, tone: "count" };
}

// ── General OPD ──────────────────────────────────────────────────────────
// Symptoms → findings → medicine as chips (the everyday OPD reading), tests
// advised as the supporting line. Matches the brief's own example: "Fever ·
// Dehydration signs · Calpol" / "CBC advised".
const generalOpdSnapshot = (row: PatientRecordRow): ClinicalSnapshot => {
    const chips: SnapshotChip[] = [];
    if (row.symptom_names[0]) chips.push({ label: row.symptom_names[0], tone: "primary" });
    if (row.finding_names[0]) chips.push({ label: row.finding_names[0], tone: "neutral" });
    if (row.medicine_names[0]) chips.push({ label: row.medicine_names[0], tone: "neutral" });

    let detail: string | null = null;
    if (row.test_names.length) {
        const rest = row.test_names.length - 1;
        detail = `${row.test_names[0]}${rest > 0 ? ` +${rest} more` : ""} advised`;
    }

    if (!chips.length && !detail) return EMPTY_SNAPSHOT;
    return { chips: chips.slice(0, 3), detail };
};

// ── Physiotherapy ────────────────────────────────────────────────────────
// Complaint → body region → impairment (or finding, until impairments are
// wired) as chips, plus a real session/visit count. Detail line prefers
// functional-limitation text (not populated yet, see header note), then the
// story's own words (duration + how it started), then the exercise given —
// whichever is the most real thing actually on this visit.
const physiotherapySnapshot = (row: PatientRecordRow): ClinicalSnapshot => {
    const chips: SnapshotChip[] = [];
    if (row.symptom_names[0]) chips.push({ label: row.symptom_names[0], tone: "primary" });
    if (row.body_sites[0]) chips.push({ label: row.body_sites[0], tone: "neutral" });
    if (row.impairment_names[0]) chips.push({ label: row.impairment_names[0], tone: "neutral" });
    else if (row.finding_names[0]) chips.push({ label: row.finding_names[0], tone: "neutral" });

    if (chips.length) chips.push(countChip(row, "visit"));

    const storyLine = [row.story_duration, row.story_mechanism || null]
        .filter((s): s is string => !!s && s.trim().length > 0)
        .join(" · ");

    const detail =
        row.impairment_names[0]
        ?? (storyLine || null)
        ?? (row.exercise_names[0] ? `Exercise: ${row.exercise_names[0]}` : null);

    if (!chips.length && !detail) return EMPTY_SNAPSHOT;
    return { chips: chips.slice(0, 3), detail };
};

type SnapshotBuilder = (row: PatientRecordRow) => ClinicalSnapshot;

const SNAPSHOT_BUILDERS: Record<string, SnapshotBuilder> = {
    general_opd: generalOpdSnapshot,
    physiotherapy: physiotherapySnapshot,
};

/**
 * The one read point, mirroring `profileFor()`. Any profile without its own
 * configured rule reads the General OPD shape — see header note for why
 * that's correct today, not a stopgap.
 */
export function snapshotFor(profile: SpecialtyProfile, row: PatientRecordRow): ClinicalSnapshot {
    const builder = SNAPSHOT_BUILDERS[profile.id] ?? generalOpdSnapshot;
    return builder(row);
}

/** What the "N visits/sessions" concept should be called for this profile — used
 *  outside the snapshot too (e.g. the table's own Visits column). */
export function visitNoun(profile: SpecialtyProfile): string {
    return profile.id === "physiotherapy" ? "session" : "visit";
}
