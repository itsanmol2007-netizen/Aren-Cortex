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

type ProbeResult = { ok: true; ms: number } | { ok: false; ms: number; error: string };

/** A timed round trip to the database, capped so a dead network reports as
 *  offline instead of hanging the whole page behind one probe.
 *
 *  `skip` is what makes this page usable with no internet. A dead network
 *  does not refuse a request, it swallows it — so three probes at 6s each
 *  meant eighteen seconds of spinner before the page could say the one thing
 *  it already knew from `navigator.onLine`. When we know we are offline we do
 *  not dial at all, and the verdict is on screen immediately. */
async function timed<T>(
    label: string, run: () => Promise<T>, opts: { skip?: boolean; timeoutMs?: number } = {}
): Promise<ProbeResult> {
    const { skip = false, timeoutMs = 6000 } = opts;
    if (skip) return { ok: false, ms: 0, error: "skipped — device is offline" };
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

    // The three network probes run TOGETHER. Sequentially they compounded —
    // three 6s ceilings is an eighteen-second page — and they have no
    // dependency on each other, so there was never a reason to queue them.
    const [records, synapse, gateways] = await Promise.all([
        // ── Records: can we actually read this clinic's own row?
        timed("records", async () => {
            const { error } = await supabase
                .from("hospitals").select("id", { head: true, count: "exact" }).eq("id", hospitalId);
            if (error) throw new Error(error.message);
        }, { skip: !online }),

        // ── Synapse: are the engine's rules reachable? A consult can open
        //    without them, but every suggestion it makes would be empty.
        timed("synapse", async () => {
            const { error } = await supabase
                .from("signal_intent_rules").select("id", { head: true, count: "exact" }).limit(1);
            if (error) throw new Error(error.message);
        }, { skip: !online }),

        // ── Attachments: the phone-upload gateway table backing the QR flow.
        timed("attachments", async () => {
            const { error } = await supabase
                .from("visit_gateways").select("id", { head: true, count: "exact" }).eq("hospital_id", hospitalId);
            if (error) throw new Error(error.message);
        }, { skip: !online }),
    ]);

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
            metric: records.ok ? `${records.ms} ms` : online ? "Unreachable" : "Not checked — offline",
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
            metric: synapse.ok ? `${synapse.ms} ms` : online ? "Rules unreachable" : "Not checked — offline",
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
            metric: gateways.ok ? `${gateways.ms} ms` : online ? "Unreachable" : "Not checked — offline",
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

// ── Surviving a lost connection ─────────────────────────────────────────────
//
// Opening this page on a dead network used to mean a spinner, then a page of
// failures with no history — the least useful moment to have the least
// information. So the last snapshot is kept on the device: the page renders it
// the instant it mounts, says plainly how old it is, and re-probes behind it.
// Nothing here is authoritative; it is the previous answer, labelled as such.
//
// Deliberately localStorage and not the profile cache: this is per-DEVICE
// truth ("was the internet working on THIS machine"), and copying it between
// installs would make it a lie.

const SNAPSHOT_KEY = "aren.health.v1.snapshot";

/** The serialised shape. Icons are React components and states are rebuilt on
 *  the next probe, so only the copy a human reads is stored — the icon is
 *  restored by id when the snapshot is read back. */
interface StoredSnapshot {
    overall: OverallState;
    checkedAt: string;
    services: Omit<HealthService, "icon">[];
}

export function cacheSnapshot(snapshot: HealthSnapshot): void {
    try {
        const stored: StoredSnapshot = {
            overall: snapshot.overall,
            checkedAt: snapshot.checkedAt.toISOString(),
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            services: snapshot.services.map(({ icon, ...rest }) => rest),
        };
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(stored));
    } catch {
        // A full or unavailable store is not worth a word to the doctor —
        // they lose the cached view, not the live check.
    }
}

/** The last snapshot taken on this device, with its icons put back. Returns
 *  `null` for anything unreadable rather than throwing: a corrupt cache must
 *  degrade to "no cache", never to a broken page. */
export function readCachedSnapshot(): HealthSnapshot | null {
    try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredSnapshot;
        if (!Array.isArray(stored.services)) return null;
        return {
            overall: stored.overall,
            checkedAt: new Date(stored.checkedAt),
            services: stored.services.map((s) => ({ ...s, icon: ICON_BY_ID[s.id] ?? Cloud })),
        };
    } catch {
        return null;
    }
}

/** Icons keyed by service id, so a cached snapshot comes back looking like
 *  the live one. A service added without an entry here falls back to a
 *  neutral glyph rather than crashing the page. */
const ICON_BY_ID: Record<string, HealthService["icon"]> = {
    internet: Wifi,
    records: Database,
    synapse: Sparkles,
    realtime: Radio,
    attachments: Paperclip,
    drafts: Cloud,
    whatsapp: MessageCircle,
};

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
