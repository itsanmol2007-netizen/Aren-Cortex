// ---------------------------------------------------------------------------
// VISIT GIST — one visit, the way a doctor takes it in at a glance.
//
// "Wrist / hand pain - Right wrist · 1 day · pain 7/10 · swelling, bruising
//  · X-ray right wrist, result awaited" is the whole of a first visit after a
// fall, and it is what the Last Visit card has to say without being read
// line by line. A visit with a single complaint is still a real visit: the
// gist is built so one complaint reads as a complete statement, not as a
// half-empty form ("Nothing prescribed").
//
//   headline   what it was ABOUT: the assessment if one was made, else the
//              complaint with its place, else the written diagnosis
//   context    how long, how bad, how it happened
//   found      what the examination found, without repeating the place
//   outcomes   what came of it, in the order that needs attention: results
//              still awaited, results in, procedures done, plans, medicines
// ---------------------------------------------------------------------------

import type { RealVisit } from "../../lib/db";
import { dashText } from "../../lib/clinicalText";

export type OutcomeKind = "awaited" | "result" | "done" | "planned" | "rx" | "exercise";

export interface VisitOutcome {
    kind: OutcomeKind;
    /** "X-ray Right wrist", "Cast - Right wrist", "Paracetamol 650" */
    text: string;
    /** "Result awaited", "Done", "Due 3 Oct", "+2 more" */
    status?: string;
    /** the full line, for a tooltip */
    title?: string;
}

export interface VisitGist {
    headline: string;
    context: string[];
    found: string[];
    outcomes: VisitOutcome[];
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** "Joint swelling / effusion - Right wrist" → ["Joint swelling / effusion", "Right wrist"]. */
function splitSite(text: string): [string, string | null] {
    const i = text.lastIndexOf(" - ");
    return i > 0 ? [text.slice(0, i), text.slice(i + 3)] : [text, null];
}

/** The first clause of a composed line — "Cast - Right wrist, below-elbow, POP" → "Cast - Right wrist". */
function lead(text: string): string {
    return dashText(text).split(",")[0].trim();
}

export function visitGist(v: RealVisit): VisitGist {
    const assessments = v.assessments ?? [];
    const found = v.sitedFindings?.length ? v.sitedFindings : v.findings.map((f) => f.name);

    // ── Headline ─────────────────────────────────────────────────────────
    // The place, when the visit knows one: a sited finding's, else the body
    // map's. A complaint without its place is half a statement.
    const knownSite = found.map((f) => splitSite(f)[1]).find(Boolean) ?? v.body_sites[0] ?? null;
    let headline: string;
    if (assessments.length) headline = assessments[0].short;
    else if (v.symptoms.length) {
        const [c, s] = splitSite(v.symptoms[0]);
        headline = s ? v.symptoms[0] : knownSite ? `${c} - ${knownSite}` : c;
    } else if (v.diagnoses?.length) headline = v.diagnoses[0];
    else if (found.length) headline = found[0];
    else headline = "Consultation";
    const headSite = splitSite(headline)[1];

    // ── Context ──────────────────────────────────────────────────────────
    const context: string[] = [];
    if (v.story_duration) context.push(v.story_duration);
    const pain = (v.sitePain ?? [])[0];
    const vas = v.vitals && typeof v.vitals === "object" ? Number((v.vitals as Record<string, unknown>).painVas) : NaN;
    if (pain) context.push(`pain ${pain.value}/10`);
    else if (Number.isFinite(vas) && vas > 0) context.push(`pain ${vas}/10`);
    if (v.story_mechanism) {
        const m = v.story_mechanism.trim();
        context.push(m.length > 42 ? `${m.slice(0, 40).trimEnd()}…` : m);
    }
    // The other complaints, when the headline is not already one of them.
    const more = v.symptoms.filter((s) => !headline.startsWith(splitSite(s)[0])).map((s) => splitSite(s)[0]);
    if (more.length) context.push(more.slice(0, 2).join(", ").toLowerCase() + (more.length > 2 ? ` +${more.length - 2}` : ""));

    // ── Found ────────────────────────────────────────────────────────────
    // The place is in the headline already; each finding says only what.
    const foundShort = found.map((f) => {
        const [what, where] = splitSite(f);
        return where && where === headSite ? what : f;
    });

    // ── Outcomes ─────────────────────────────────────────────────────────
    const outcomes: VisitOutcome[] = [];
    const orders = v.orders?.length
        ? v.orders
        : (v.tests ?? []).map((t) => ({ id: t, name: t, orderedAt: v.created_at, resultText: null, resultAt: null }));
    for (const o of orders.filter((x) => !x.resultText)) {
        outcomes.push({ kind: "awaited", text: dashText(o.name), status: "Result awaited" });
    }
    for (const o of orders.filter((x) => x.resultText)) {
        outcomes.push({ kind: "result", text: dashText(o.name), status: "Result in", title: `${o.name}: ${o.resultText}` });
    }
    for (const p of (v.procedures ?? []).filter((x) => x.status === "performed")) {
        outcomes.push({ kind: "done", text: lead(p.text), status: p.removesId ? "Removed" : "Done", title: p.text });
    }
    for (const p of (v.procedures ?? []).filter((x) => x.status === "planned")) {
        outcomes.push({ kind: "planned", text: lead(p.text), status: p.dueDate ? `Due ${shortDate(p.dueDate)}` : "Planned", title: p.text });
    }
    if (v.medicines.length) {
        outcomes.push({
            kind: "rx",
            text: v.medicines[0].name,
            status: v.medicines.length > 1 ? `+${v.medicines.length - 1} more` : undefined,
            title: v.medicines.map((m) => m.name).join(", "),
        });
    }
    const ex = v.exercise_names.length;
    if (ex) outcomes.push({ kind: "exercise", text: `${ex} exercise${ex === 1 ? "" : "s"}`, title: v.exercise_names.join(", ") });

    return { headline, context, found: foundShort, outcomes };
}

/** "today", "yesterday", "5 days ago", "3 weeks ago" — how long since a visit. */
export function agoText(iso: string, now: Date = new Date()): string {
    const d0 = new Date(iso);
    const days = Math.round(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
            - new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime()) / 86_400_000,
    );
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    return `${Math.round(days / 30)} months ago`;
}
