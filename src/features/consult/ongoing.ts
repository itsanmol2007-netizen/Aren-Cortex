// ---------------------------------------------------------------------------
// ONGOING CARE — what is still true about this patient from earlier visits,
// and what can be done about it from here.
//
// A returning orthopaedic patient is not "4 previous visits"; they are "a
// displaced fracture of the right knee, in a POP backslab for 4 days, with a
// check X-ray due Friday". That is read here from the visit history already
// loaded for the consult, in three kinds, each with its own lifecycle
// (docs/clinical-state-vocabulary.md):
//
//   in place     a cast, splint, strapping or sutures put on at an earlier
//                visit and not taken off since (nothing later `removes` it).
//                → Remove: a removal in today's plan, linked to it.
//   due          something an earlier visit planned and nobody has done yet
//                (nothing later `fulfils` it; not cancelled). Overdue is
//                derived, never stored.
//                → Do today · Defer a week / two · Cancel
//   condition    a structured assessment from a recent visit, newest per
//                place, with its latest recorded state.
//                → Active · Healing · Clinically united · Radiologically
//                  united · Resolved (a fracture); Active · Improving ·
//                  Resolved (anything else)
//
// A state recorded during THIS visit stays on the list ("Resolved today")
// so it can be changed back; from the next visit on, a closed item is gone.
// Until a state is recorded, a condition is stated as when it was assessed,
// never as "active" or "healing": the software does not know which.
// ---------------------------------------------------------------------------

import type { RealVisit, VisitOrder, VisitProcedure } from "../../lib/db";
import { clinicalSiteLabel, siteKey, type SiteRef } from "../../lib/body/clinicalSite";
import {
    CLOSED_STATUSES, STATUS_LABEL, type ConditionStatus, type PlanStatus,
} from "../../lib/db/clinicalState";

export type OngoingKind = "in-place" | "due" | "awaiting" | "condition";

export interface OngoingItem {
    key: string;
    kind: OngoingKind;
    /** "POP cast", "Fracture" */
    title: string;
    /** "Right knee" */
    site: string | null;
    siteRef: SiteRef | null;
    /** the full printed line, for a tooltip / the detail row */
    text: string;
    /** "In place 4 days", "Due 3 Oct", "Overdue by 2 days", "Healing · 25 Sept" */
    status: string;
    /** overdue items read in the warning tone */
    urgent: boolean;
    /** changed during this visit — shown settled, still changeable */
    today: boolean;
    /** the visit it came from, to open */
    visitId: string;
    /** condition: the assessment row, its family and current state */
    assessmentId?: string;
    family?: string | null;
    state?: ConditionStatus | null;
    /** in place / due: the procedure row */
    procedure?: VisitProcedure;
    /** awaiting: the investigation order */
    order?: VisitOrder;
}

/** What has been done about these during the consult in progress. */
export interface OngoingLocal {
    /** assessment id → state recorded this visit */
    conditions: Map<string, ConditionStatus>;
    /** planned intervention id → deferred / cancelled (or back to active) this visit */
    plans: Map<string, { status: PlanStatus | "active"; dueDate: string | null }>;
    /** in-place ids a removal in today's plan points at */
    removedToday: Set<string>;
    /** planned ids something in today's plan carries out */
    fulfilledToday: Set<string>;
    /** order id → result recorded this visit */
    results: Map<string, string>;
}

/** What can be done to an item from the Ongoing Care card. */
export type OngoingAction =
    | { type: "remove" }
    | { type: "do" }
    | { type: "defer"; days: number }
    | { type: "cancel" }
    | { type: "restore" }
    | { type: "status"; status: ConditionStatus }
    | { type: "open-result" }
    | { type: "result"; text: string };

export const EMPTY_LOCAL: OngoingLocal = {
    conditions: new Map(), plans: new Map(), removedToday: new Set(), fulfilledToday: new Set(), results: new Map(),
};

/** Things that stay on the patient until someone takes them off. */
const IN_PLACE_FAMILIES = new Set(["cast", "splint", "strapping", "closure"]);

/** Past this, an unremoved cast is a record nobody closed, not a cast. */
const IN_PLACE_MAX_DAYS = 120;
/** An investigation still without a result, this long after it was ordered, is
 *  a result nobody will enter, not one still coming. */
const AWAITING_MAX_DAYS = 30;
/** How long an assessment is shown as current without a newer visit restating it. */
const CONDITION_MAX_DAYS = 120;

const DAY = 86_400_000;

/** The states a condition can be moved to, in the order it moves through them. */
export function conditionOptions(family: string | null | undefined): ConditionStatus[] {
    if (family === "fracture") return ["active", "healing", "clinically_united", "radiologically_united", "resolved"];
    if (family === "wound" || family === "ulcer" || family === "burn") return ["active", "healing", "resolved"];
    return ["active", "improving", "resolved"];
}

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

function dueStatus(dueDate: string | null, now: Date): { text: string; urgent: boolean } {
    if (!dueDate) return { text: "Planned", urgent: false };
    const left = -daysBetween(dueDate, now);
    if (left < 0) return { text: `Overdue by ${spanText(-left)}`, urgent: true };
    if (left === 0) return { text: "Due today", urgent: false };
    return { text: `Due ${shortDate(dueDate)}`, urgent: false };
}

export function ongoingFrom(
    pastVisits: RealVisit[],
    local: OngoingLocal = EMPTY_LOCAL,
    now: Date = new Date(),
): OngoingItem[] {
    const all: (VisitProcedure & { visitId: string })[] = [];
    for (const v of pastVisits) for (const p of v.procedures ?? []) all.push({ ...p, visitId: v.id });
    const removed = new Set(all.map((p) => p.removesId).filter(Boolean) as string[]);
    const fulfilled = new Set(all.map((p) => p.fulfilsId).filter(Boolean) as string[]);

    const inPlace: OngoingItem[] = [];
    const due: OngoingItem[] = [];
    for (const p of all) {
        const site = p.site ? clinicalSiteLabel(p.site) : null;
        if (p.status === "performed" && p.family && IN_PLACE_FAMILIES.has(p.family) && !removed.has(p.id)) {
            const days = daysBetween(p.createdAt, now);
            if (days > IN_PLACE_MAX_DAYS) continue;
            const off = local.removedToday.has(p.id);
            inPlace.push({
                key: `in:${p.id}`,
                kind: "in-place",
                title: procedureTitle(p),
                site,
                siteRef: p.site,
                text: p.text,
                status: off ? "Removal in today's plan" : days <= 0 ? "Put on today" : `In place ${spanText(days)}`,
                urgent: false,
                today: off,
                visitId: p.visitId,
                procedure: p,
            });
        }
        if (p.status === "planned" && !fulfilled.has(p.id)) {
            const mine = local.plans.get(p.id);
            const saved = p.planState;
            // A cancellation recorded at an earlier visit closes it for good;
            // one recorded now stays in view so it can be taken back.
            if (!mine && saved?.status === "cancelled") continue;
            const state = mine ?? (saved ? { status: saved.status as PlanStatus | "active", dueDate: saved.dueDate } : null);
            const dueDate = state?.status === "deferred" ? state.dueDate : p.dueDate;
            const d = dueStatus(dueDate, now);
            const doneNow = local.fulfilledToday.has(p.id);
            due.push({
                key: `due:${p.id}`,
                kind: "due",
                title: procedureTitle(p),
                site,
                siteRef: p.site,
                text: p.text,
                status: doneNow ? "In today's plan"
                    : mine?.status === "cancelled" ? "Cancelled today"
                        : mine?.status === "deferred" ? `Deferred to ${shortDate(dueDate!)}`
                            : d.text,
                urgent: !doneNow && !mine && d.urgent,
                today: doneNow || !!mine,
                visitId: p.visitId,
                procedure: p,
            });
        }
    }

    // Newest visit first (as loaded): the first assessment seen at a place
    // is the current one for that place.
    // Investigations ordered at an earlier visit whose result is not in yet —
    // the thread a patient comes back with ("here is my X-ray").
    const awaiting: OngoingItem[] = [];
    for (const v of pastVisits) {
        const days = daysBetween(v.created_at, now);
        if (days > AWAITING_MAX_DAYS) continue;
        for (const o of v.orders ?? []) {
            const mine = local.results.get(o.id);
            if (o.resultText && !mine) continue;
            awaiting.push({
                key: `rx:${o.id}`,
                kind: "awaiting",
                title: o.name,
                site: null,
                siteRef: null,
                text: mine ? `${o.name}: ${mine}` : o.name,
                status: mine ? `Result: ${mine}` : `Ordered ${shortDate(v.created_at)} · result awaited`,
                urgent: false,
                today: !!mine,
                visitId: v.id,
                order: o,
            });
        }
    }

    const conditions: OngoingItem[] = [];
    const seen = new Set<string>();
    for (const v of pastVisits) {
        const days = daysBetween(v.created_at, now);
        if (days > CONDITION_MAX_DAYS) continue;
        for (const a of v.assessments ?? []) {
            const k = `${a.family ?? a.short}|${a.site ? siteKey(a.site) : "-"}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const mine = a.id ? local.conditions.get(a.id) : undefined;
            const saved = a.state && !["deferred", "cancelled"].includes(a.state.status)
                ? { status: a.state.status as ConditionStatus, at: a.state.at } : null;
            // Closed at an earlier visit: no longer ongoing.
            if (!mine && saved && CLOSED_STATUSES.has(saved.status)) continue;
            const current = mine ?? saved?.status ?? null;
            conditions.push({
                key: `cx:${v.id}:${k}`,
                kind: "condition",
                title: a.short.split(" - ")[0],
                site: a.site ? clinicalSiteLabel(a.site) : null,
                siteRef: a.site,
                text: a.text,
                status: mine
                    ? `${STATUS_LABEL[mine]} · marked today`
                    : saved
                        ? `${STATUS_LABEL[saved.status]} · since ${shortDate(saved.at)}`
                        : `Assessed ${shortDate(v.created_at)} · ${spanText(days)} ago`.replace("today ago", "today"),
                urgent: false,
                today: !!mine,
                visitId: v.id,
                assessmentId: a.id,
                family: a.family,
                state: current,
            });
        }
    }

    // Overdue first (it needs doing today), then what is on the patient
    // (a cast outranks a check that is not due yet), then what is coming,
    // then the assessment it is all for.
    return [
        ...due.filter((d) => d.urgent),
        ...awaiting,
        ...inPlace,
        ...due.filter((d) => !d.urgent),
        ...conditions,
    ];
}
