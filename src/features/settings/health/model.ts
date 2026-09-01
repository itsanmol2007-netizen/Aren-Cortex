// ---------------------------------------------------------------------------
// SYSTEM HEALTH — what is working, in the doctor's language.
//
// ── Inspired by Front Desk's Clinic Status, deliberately NOT shared with it
//
// `features/frontdesk/clinicStatus/model.ts` had the right IDEA — translate
// technical health into operational meaning (what it affects, what to press)
// before it ever reaches a person, and carry a support-facing diagnostics
// payload alongside. That idea is borrowed here. The CODE is not, and that is
// on purpose: Front Desk is a different product with a different visual DNA
// and its model is welded to that app's i18n (`StringKey`), which Cortex does
// not have. A shared module would have forced one app's shape onto the other.
// Two registries, one idea, each native to its own product.
//
// ── The rule this file follows: probe it or don't claim it
//
// Every service here is something Cortex can actually CHECK from the browser.
// Front Desk's registry carries a "backup — nightly snapshot ok" row that
// nothing verifies; there is no equivalent here, because a green light nobody
// measured is worse than no light at all. A capability we have not wired yet
// says `notConfigured` and says it plainly (WhatsApp), and anything we cannot
// see from the client is simply absent from the list.
// ---------------------------------------------------------------------------

import {
    Cloud, Database, MessageCircle, Paperclip, Radio, Sparkles, Wifi,
    type LucideIcon,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { loadConsultDraft } from "../../../lib/consultDraft";

export type ServiceState = "operational" | "attention" | "offline" | "notConfigured";
export type OverallState = "healthy" | "warning" | "critical";

export interface HealthService {
    id: string;
    icon: LucideIcon;
    /** What it is, in the doctor's words. */
    name: string;
    /** One line: what this service does FOR them. */
    role: string;
    state: ServiceState;
    /** The measured fact — "112 ms", "3 saved", "not connected". */
    metric: string;
    /** What stops working when this is degraded. Only shown when it is. */
    impact: string;
    /** Ordered steps, most likely first. Only shown when degraded. */
    recovery: string[];
    /** Support-facing payload. DATA, never UI copy — this is what gets
     *  pasted into a support message. */
    diagnostics: string;
}

export interface HealthSnapshot {
    overall: OverallState;
    checkedAt: Date;
    services: HealthService[];
}

const OK: ServiceState[] = ["operational", "notConfigured"];

/** Worst state wins, and `notConfigured` is not a fault — a clinic that has
 *  not connected WhatsApp is not an unhealthy clinic. */
function rollUp(services: HealthService[]): OverallState {
    if (services.some((s) => s.state === "offline")) return "critical";
    if (services.some((s) => s.state === "attention")) return "warning";
    return "healthy";
}

export function isDegraded(s: HealthService): boolean {
    return !OK.includes(s.state);
}

/** A timed round trip to the database, capped so a dead network reports as
 *  offline instead of hanging the whole page behind one probe. */
async function timed<T>(label: string, run: () => Promise<T>, timeoutMs = 6000): Promise<
    { ok: true; ms: number } | { ok: false; ms: number; error: string }
> {
    const started = performance.now();
    try {
        await Promise.race([
            run(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)),
        ]);
        return { ok: true, ms: Math.round(performance.now() - started) };
    } catch (e) {
        return {
            ok: false,
            ms: Math.round(performance.now() - started),
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

/**
 * Runs every probe and builds the snapshot.
 *
 * `hospitalId`/`doctorId` scope the two probes that need them; both reads are
 * deliberately tiny (a single existence check and the local draft store), so
 * opening this page is cheap enough to do whenever something feels wrong.
 */
export async function probeHealth({
    hospitalId, doctorId,
}: { hospitalId: string; doctorId: string }): Promise<HealthSnapshot> {
    const online = navigator.onLine;

    // ── Records: can we actually read this clinic's own row?
    const records = await timed("records", async () => {
        const { error } = await supabase
            .from("hospitals").select("id", { head: true, count: "exact" }).eq("id", hospitalId);
        if (error) throw new Error(error.message);
    });

    // ── Synapse: are the engine's rules reachable? A consult can open without
    //    them, but every suggestion it makes would be empty.
    const synapse = await timed("synapse", async () => {
        const { error } = await supabase
            .from("signal_intent_rules").select("id", { head: true, count: "exact" }).limit(1);
        if (error) throw new Error(error.message);
    });

    // ── Attachments: the phone-upload gateway table backing the QR flow.
    const gateways = await timed("attachments", async () => {
        const { error } = await supabase
            .from("visit_gateways").select("id", { head: true, count: "exact" }).eq("hospital_id", hospitalId);
        if (error) throw new Error(error.message);
    });

    const realtimeUp = (() => {
        try { return supabase.realtime.isConnected(); } catch { return false; }
    })();

    const draft = loadConsultDraft(doctorId);

    const services: HealthService[] = [
        {
            id: "internet",
            icon: Wifi,
            name: "Internet",
            role: "Everything below it depends on this connection.",
            state: online ? "operational" : "offline",
            metric: online ? "Connected" : "No connection",
            impact: "Nothing new can be saved to the clinic's records while this is down. Work already on screen is safe.",
            recovery: [
                "Check the clinic's Wi-Fi or cable.",
                "Reload once the connection returns — your open consult is restored.",
            ],
            diagnostics: `net.online=${online}`,
        },
        {
            id: "records",
            icon: Database,
            name: "Patient records",
            role: "Reading and writing this clinic's patients, visits and prescriptions.",
            state: records.ok ? "operational" : online ? "attention" : "offline",
            metric: records.ok ? `${records.ms} ms` : "Unreachable",
            impact: "Consults cannot be saved and past visits will not load.",
            recovery: [
                "Wait a moment and re-run the check — most failures here are momentary.",
                "If it persists, copy the diagnostics below and send them to us.",
            ],
            diagnostics: records.ok
                ? `records.read ok · ${records.ms}ms`
                : `records.read FAILED · ${records.ms}ms · ${records.error}`,
        },
        {
            id: "synapse",
            icon: Sparkles,
            name: "Synapse engine",
            role: "The suggestions ranked for you as you chart.",
            state: synapse.ok ? "operational" : online ? "attention" : "offline",
            metric: synapse.ok ? `${synapse.ms} ms` : "Rules unreachable",
            impact: "The consult still works, but suggestions will come up empty.",
            recovery: [
                "Re-run the check — the rule set is read once per consult, so a retry usually clears it.",
                "Start the consult anyway; charting and prescribing do not depend on it.",
            ],
            diagnostics: synapse.ok
                ? `synapse.rules ok · ${synapse.ms}ms`
                : `synapse.rules FAILED · ${synapse.ms}ms · ${synapse.error}`,
        },
        {
            id: "realtime",
            icon: Radio,
            name: "Live updates",
            role: "Files arriving from a patient's phone appear without a reload.",
            // Not an error on its own: the channel opens lazily, so "not
            // connected" outside a consult is the normal resting state.
            state: realtimeUp ? "operational" : "notConfigured",
            metric: realtimeUp ? "Connected" : "Idle — opens during a consult",
            impact: "Phone uploads will not appear until the page is reloaded.",
            recovery: ["Reload the consult screen; the channel reopens on its own."],
            diagnostics: `realtime.connected=${realtimeUp}`,
        },
        {
            id: "attachments",
            icon: Paperclip,
            name: "Phone uploads",
            role: "The QR code that lets a patient send files from their phone.",
            state: gateways.ok ? "operational" : online ? "attention" : "offline",
            metric: gateways.ok ? `${gateways.ms} ms` : "Unreachable",
            impact: "New upload links cannot be created. Files already uploaded are unaffected.",
            recovery: [
                "Re-run the check.",
                "Attach from this computer in the meantime — the same card offers it.",
            ],
            diagnostics: gateways.ok
                ? `gateways.read ok · ${gateways.ms}ms`
                : `gateways.read FAILED · ${gateways.ms}ms · ${gateways.error}`,
        },
        {
            id: "drafts",
            icon: Cloud,
            name: "Unsaved work",
            role: "A consult interrupted by a crash or a reload is restored from this device.",
            // A held draft is information, not a fault — it is the safety net
            // doing its job. It only warrants attention if it is stale.
            state: draft ? "attention" : "operational",
            metric: draft
                ? `1 held · ${new Date(draft.savedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                : "Nothing pending",
            impact: "An unfinished consult is waiting on this device and has not been completed.",
            recovery: [
                "Open Consult — it offers to restore the draft.",
                "Or clear it from Settings if it is no longer wanted.",
            ],
            diagnostics: draft ? `drafts.pending=1 · savedAt=${draft.savedAt}` : "drafts.pending=0",
        },
        {
            id: "whatsapp",
            icon: MessageCircle,
            name: "WhatsApp",
            role: "Sending prescriptions and reminders to patients in chat.",
            state: "notConfigured",
            metric: "Not connected yet",
            impact: "Prescriptions can still be printed and shared by hand.",
            recovery: ["We will connect this for your clinic — it needs no setup from you."],
            diagnostics: "whatsapp.provider=not_configured",
        },
    ];

    return { overall: rollUp(services), checkedAt: new Date(), services };
}

/**
 * The whole snapshot as one pasteable block.
 *
 * Deliberately plain text with no formatting: it goes into an email or a
 * WhatsApp message to us, and anything cleverer survives neither.
 */
export function diagnosticsReport(
    snapshot: HealthSnapshot,
    context: { clinic: string; accountRef: string }
): string {
    const lines = [
        `AREN Cortex — diagnostics`,
        `clinic: ${context.clinic}`,
        `account: ${context.accountRef}`,
        `checked: ${snapshot.checkedAt.toISOString()}`,
        `overall: ${snapshot.overall}`,
        `agent: ${navigator.userAgent}`,
        ``,
        ...snapshot.services.map((s) => `[${s.state}] ${s.id} · ${s.diagnostics}`),
    ];
    return lines.join("\n");
}
