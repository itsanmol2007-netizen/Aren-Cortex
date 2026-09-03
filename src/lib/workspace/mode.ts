// ---------------------------------------------------------------------------
// CORTEX vs CONSULT — one workspace, two starting workflows.
//
// Both are the SAME clinical screen. What differs is where the encounter comes
// from:
//
//   Cortex  — a solo practitioner does intake AND the consultation. The doctor
//             opens the patient modal, types the patient in, and consults.
//   Consult — the clinic has a front desk. Reception prepares the encounter
//             (patient, symptoms, history, measurements, attachments) and the
//             doctor receives a patient who is already on the chart.
//
// ── Why this is derived and never chosen ──────────────────────────────────
// A doctor does not pick "Consult" from a menu; a clinic either has a front
// desk or it does not, and `hospitals.clinic_mode` is where that fact has
// lived since registration was built (`'solo' | 'solo_reception' |
// 'multi_doctor'` — see docs/Login Screen Implementation.md and
// admin-panel/ADMIN-PANEL-INTEGRATION.md §4a). So the mode is READ from the
// clinic row the auth gate already loaded, not stored a second time and not
// exposed as a doctor-facing switch. Rule 19: when two things must agree,
// make one read the other.
//
// ── The default is Cortex, deliberately ───────────────────────────────────
// Anything unrecognised — a null column, a clinic_mode value added later that
// this build has never heard of — falls to Cortex, which is the workflow that
// needs nothing else to exist. Serving Consult to a clinic with no
// receptionist would give a doctor an empty queue and no way to start.
// ---------------------------------------------------------------------------

export type WorkspaceMode = "cortex" | "consult";

/**
 * The clinic modes that mean "somebody else does intake".
 *
 * `solo_reception` — one doctor, one receptionist.
 * `multi_doctor`   — several doctors behind one front desk.
 *
 * Both hand the doctor a prepared patient, which is the whole of what
 * Consult is. They differ in how the QUEUE is filtered (see
 * `useConsultQueue`), not in which workspace is served.
 */
const FRONT_DESK_MODES = new Set(["solo_reception", "multi_doctor"]);

export function modeForClinic(clinicMode: string | null | undefined): WorkspaceMode {
    return clinicMode && FRONT_DESK_MODES.has(clinicMode) ? "consult" : "cortex";
}

/** True when the clinic runs more than one doctor behind the same front desk. */
export function isMultiDoctor(clinicMode: string | null | undefined): boolean {
    return clinicMode === "multi_doctor";
}

export interface ModeBrand {
    /** the word after "AREN" in every header */
    product: string;
    /** the line under it — what this workspace IS, in three or four words */
    tagline: string;
    /** the workspace identity subtitle beside a page title */
    context: string;
}

/**
 * The only place either product name is written down.
 *
 * The visual language is identical — same dark header, same logo pill, same
 * type scale (docs/cortex-design-dna/). One word and one line change, because
 * one word and one line are the whole of the difference a doctor should feel.
 */
export const MODE_BRAND: Record<WorkspaceMode, ModeBrand> = {
    cortex: {
        product: "Cortex",
        tagline: "Phase 1 workflow",
        context: "Consultation workspace",
    },
    consult: {
        product: "Consult",
        tagline: "Front desk queue",
        context: "Prepared by front desk",
    },
};
