// ---------------------------------------------------------------------------
// ONGOING CARE — what is still true about this patient from earlier visits.
//
// A returning orthopaedic patient is not "4 previous visits"; they are "a
// displaced fracture of the right knee, in a POP backslab for 4 days, with a
// check X-ray due Friday". That is read here from the visit history already
// loaded for the consult (no extra round trip), in three kinds:
//
//   in place     a cast, splint, strapping or sutures put on at an earlier
//                visit and not taken off since (nothing later `removes` it)
//   due          something an earlier visit planned and nobody has done yet
//                (nothing later `fulfils` it) — overdue said as such
//   condition    a structured assessment from a recent visit ("Fracture -
//                Right knee, displaced"), newest per place
//
// Status words follow docs/clinical-state-vocabulary.md: an in-place item is
// "In place", a planned one "Due" or "Overdue". A condition has no recorded
// status yet (there is nowhere to mark a fracture united), so it is stated
// as when it was assessed, never as "active" or "healing" — the software
// does not know that, and it does not guess.
// ---------------------------------------------------------------------------

import type { RealVisit, VisitProcedure } from "../../lib/db";
import { clinicalSiteLabel, siteKey } from "../../lib/body/clinicalSite";

export type OngoingKind = "in-place" | "due" | "condition";

export interface OngoingItem {
    key: string;
    kind: OngoingKind;
    /** "POP cast", "Fracture" */
    title: string;
    /** "Right knee" */
    site: string | null;
    /** the full printed line, for a tooltip / the detail row */
    text: string;
    /** "In place 4 days", "Due 3 Oct", "Overdue by 2 days", "Assessed 21 Sept" */
    status: string;
    /** overdue items read in the warning tone */
    urgent: boolean;
    /** the visit it came from, to open */
    visitId: string;
}

/** Things that stay on the patient until someone takes them off. */
const IN_PLACE_FAMILIES = new Set(["cast", "splint", "strapping", "closure"]);

/** Past this, an unremoved cast is a record nobody closed, not a cast. */
const IN_PLACE_MAX_DAYS = 120;
/** How long an assessment is shown as current without a newer visit restating it. */
const CONDITION_MAX_DAYS = 120;

const DAY = 86_400_000;

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(fromIso: string, now: Date): number {
    return Math.round((startOfDay(now) - startOfDay(new Date(fromIso))) / DAY);
}

/** "4 days", "2 weeks", "3 weeks 2 days" — fracture care is counted in weeks. */
export function spanText(days: number): string {
    if (days <= 0) return "today";
    if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
    const w = Math.floor(days / 7);
    const d = days % 7;
    return d ? `${w} weeks ${d} day${d === 1 ? "" : "s"}` : `${w} weeks`;
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** "Plaster of Paris (POP) cast" → "POP cast"; otherwise the label as is. */
function procedureTitle(p: VisitProcedure): string {
    const m = p.label.match(/\(([^)]+)\)\s*(.*)$/);
    if (m && m[2]) return `${m[1]} ${m[2]}`.trim();
    return p.label;
}

export function ongoingFrom(pastVisits: RealVisit[], now: Date = new Date()): OngoingItem[] {
    const all: (VisitProcedure & { visitId: string })[] = [];
    for (const v of pastVisits) for (const p of v.procedures ?? []) all.push({ ...p, visitId: v.id });
    const removed = new Set(all.map((p) => p.removesId).filter(Boolean) as string[]);
    const fulfilled = new Set(all.map((p) => p.fulfilsId).filter(Boolean) as string[]);

    const inPlace: OngoingItem[] = [];
    const due: OngoingItem[] = [];
    for (const p of all) {
        if (p.status === "performed" && p.family && IN_PLACE_FAMILIES.has(p.family) && !removed.has(p.id)) {
            const days = daysBetween(p.createdAt, now);
            if (days > IN_PLACE_MAX_DAYS) continue;
            inPlace.push({
                key: `in:${p.id}`,
                kind: "in-place",
                title: procedureTitle(p),
                site: p.site ? clinicalSiteLabel(p.site) : null,
                text: p.text,
                status: days <= 0 ? "Put on today" : `In place ${spanText(days)}`,
                urgent: false,
                visitId: p.visitId,
            });
        }
        if (p.status === "planned" && !fulfilled.has(p.id)) {
            const left = p.dueDate ? -daysBetween(p.dueDate, now) : null;
            due.push({
                key: `due:${p.id}`,
                kind: "due",
                title: procedureTitle(p),
                site: p.site ? clinicalSiteLabel(p.site) : null,
                text: p.text,
                status: left === null ? "Planned"
                    : left < 0 ? `Overdue by ${spanText(-left)}`
                        : left === 0 ? "Due today"
                            : `Due ${shortDate(p.dueDate!)}`,
                urgent: left !== null && left < 0,
                visitId: p.visitId,
            });
        }
    }

    // Newest visit first (as loaded): the first assessment seen at a place
    // is the current one for that place.
    const conditions: OngoingItem[] = [];
    const seen = new Set<string>();
    for (const v of pastVisits) {
        const days = daysBetween(v.created_at, now);
        if (days > CONDITION_MAX_DAYS) continue;
        for (const a of v.assessments ?? []) {
            const k = `${a.family ?? a.short}|${a.site ? siteKey(a.site) : "-"}`;
            if (seen.has(k)) continue;
            seen.add(k);
            conditions.push({
                key: `cx:${v.id}:${k}`,
                kind: "condition",
                title: a.short.split(" - ")[0],
                site: a.site ? clinicalSiteLabel(a.site) : null,
                text: a.text,
                status: `Assessed ${shortDate(v.created_at)} · ${spanText(days)} ago`.replace("today ago", "today"),
                urgent: false,
                visitId: v.id,
            });
        }
    }

    // Overdue first (it needs doing today), then what is on the patient
    // (a cast outranks a check that is not due yet), then what is coming,
    // then the assessment it is all for.
    return [
        ...due.filter((d) => d.urgent),
        ...inPlace,
        ...due.filter((d) => !d.urgent),
        ...conditions,
    ];
}
