// ---------------------------------------------------------------------------
// INTERVENTIONS — what the clinic did to the patient, this visit.
//
// Casting, reduction, splinting, joint injection (orthopedics); ultrasound,
// IFT, manual therapy, dry needling (physiotherapy). One shared mechanism
// underneath — the `modality` IntentType, unchanged since 2026-08-16 — with a
// specialty-chosen display label on top (see specialtyProfile.ts). Anmol,
// 2026-09-23: "cast application, closed reduction, splinting, IFT, manual
// therapy, exercise therapy, joint injection" are all the same clinical
// object wearing different clothes: "Interventions."
//
// ── Why this needed a structure at all
//
// Until now an accepted modality was a LINE OF TEXT in `therapyNotes` — see
// the git history on useConsultPlan.ts. That collapsed a patient with two
// simultaneous fractures into one blurred sentence, with no way to say WHERE
// each thing was done. Anmol: "one edge case and the whole system will be
// fucked off... what will happen if a guy with multiple fractures will
// appear to the doctor?" The answer has to be: two lines, each with its own
// site, not one string.
//
// ── Why this is NOT exercisePlan.ts with a different name
//
// It is the same idea — structured lines instead of prose — borrowed
// deliberately, but two things are genuinely different:
//
//   * SITE, not just side. A fracture site is "right distal radius" or
//     "L4-L5", not just a laterality. `side` (left/right/bilateral) stays,
//     for the common case where it's the only thing that needs saying, but
//     `site` is free text because no fixed enum covers where an orthopedic
//     procedure happens.
//
//   * NO progression model. An exercise dose is compared session over
//     session on purpose — that comparison is the entire point of the
//     badge. An intervention is a record of something already done; a cast
//     applied today was not "progressed" from a cast applied last visit,
//     it either happened again or it didn't. So there is no `volumeOf`,
//     no `Progression` type, no badge — just a plain list, same as the
//     plan rail's other groups.
// ---------------------------------------------------------------------------

import type { SiteRef } from "../../lib/body/clinicalSite";
import type { AssessmentDetails } from "./assessmentFamilies";
import { JOIN } from "../../lib/clinicalText";

export type InterventionSide = "left" | "right" | "both";

export interface InterventionLine {
    /** client-side row id; not the database id */
    id: string;
    /** the engine intent this came from, or null when typed freehand */
    intentId: number | null;
    label: string;
    /** free text — "right distal radius", "L4-L5", "left knee" — or "" when not recorded */
    site: string;
    side: InterventionSide | null;
    notes: string;
    sortOrder: number;

    // ── Families (interventionFamilies.ts). All optional: physio modalities
    // and drafts saved before families existed have none of these.
    /** "cast", "injection", "removal"… — null for an unconfigured modality */
    family?: string | null;
    siteRef?: SiteRef | null;
    details?: AssessmentDetails;
    /** the composed line — "Cast — Left forearm, below-elbow, backslab, POP" */
    text?: string;
    /** the earlier intervention (database id) this removes or changes */
    removesId?: string | null;
    /** the assessment at this site it treats — "Fracture — Left forearm" */
    assessmentText?: string | null;
    /** done today, or planned for later (Phase 5) */
    status?: "performed" | "planned";
    /** when a planned one is due, yyyy-mm-dd (Phase 5) */
    dueDate?: string | null;
    /** the planned row (database id, from an earlier visit) this performs */
    fulfilsId?: string | null;
}

/** "12 Oct" — a due date as the rail and the print show it. */
export function formatDue(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** yyyy-mm-dd, `days` from today. */
export function dueInDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + Math.round(days));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * What identifies this line across the same visit's plan.
 *
 * intentId + site + side: the same procedure at two different sites (or two
 * different sides) is two real lines, not a duplicate to be collapsed — the
 * multi-fracture case this whole structure exists for.
 */
export function identityOf(line: Pick<InterventionLine, "intentId" | "label" | "site" | "side">): string {
    const base = line.intentId != null ? `i${line.intentId}` : `l${line.label.trim().toLowerCase()}`;
    return `${base}::${line.site.trim().toLowerCase()}::${line.side ?? "-"}`;
}

/** The side, spoken plainly — unlike exercise's blank-for-both, an
 *  intervention's laterality is worth stating even when it's both, because
 *  "Cast — Bilateral" and "Cast" (unspecified) are different clinical facts. */
export function formatSide(side: InterventionSide | null): string {
    if (side === "left") return "Left";
    if (side === "right") return "Right";
    if (side === "both") return "Bilateral";
    return "";
}

/** One line, printed — for the prescription and the plan rail. */
export function formatLine(line: InterventionLine): string {
    if (line.text) {
        const planned = line.status === "planned"
            ? ` [planned${line.dueDate ? `, due ${formatDue(line.dueDate)}` : ""}]` : "";
        return line.notes.trim() ? `${line.text}${planned} (${line.notes.trim()})` : `${line.text}${planned}`;
    }
    const sideTag = formatSide(line.side);
    const where = [line.site.trim(), sideTag].filter(Boolean).join(" · ");
    const head = where ? `${line.label}${JOIN}${where}` : line.label;
    return line.notes.trim() ? `${head} (${line.notes.trim()})` : head;
}
