// ---------------------------------------------------------------------------
// SYSTEM HEALTH — the page behind Settings' health card.
//
// ── Why a page and not a modal
//
// This is where a doctor lands when something feels wrong, and the first thing
// they need is room: the degraded service, what it stops them doing, what to
// press, and a diagnostics block to send us. A modal would have to scroll
// inside itself and could not carry a back button, which is precisely the
// "cramped, and where am I" shape this codebase keeps having to fix.
//
// It is a page in Cortex's own language, not Front Desk's: the shared dark
// `WorkspaceHeader` with the standard glass `BackButton` in its rightSlot,
// one scroll region under it, `--cs-*` tokens throughout. See the model's own
// header for why none of Front Desk's Clinic Status code is imported here.
//
// ── Why degraded services are separated from the rest
//
// A card that grows when it has a problem, sitting in a grid beside cards
// that do not, makes a row where one box is 400px and its neighbour is 700px.
// So: anything wrong goes in a full-width list at the top where it has room to
// explain itself, and everything healthy goes in a uniform grid below where
// every card holds the same four lines. Both regions stay balanced by
// construction rather than by luck.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";
import {
    AlertTriangle, Check, ClipboardCopy, Loader2, RefreshCw, ShieldCheck, WifiOff,
} from "lucide-react";
import { WorkspaceHeader } from "../../../components/WorkspaceHeader";
import { BackButton } from "../../../components/BackButton";
import { BlankHealthArt } from "../../consult/BlankArt";
import {
    cacheSnapshot, diagnosticsReport, isDegraded, probeHealth, readCachedSnapshot,
    type HealthService, type HealthSnapshot, type ServiceState,
} from "./model";
import { toast } from "sonner";

const STATE_LABEL: Record<ServiceState, string> = {
    operational: "Operational",
    attention: "Needs attention",
    offline: "Offline",
    notConfigured: "Not connected",
};

/** One tone per state, all from the seven — amber is the soft guard, red the
 *  hard one, green "working", slate "nothing to report". No eighth colour. */
const STATE_TONE: Record<ServiceState, string> = {
    operational: "bg-[rgba(22,163,74,0.10)] text-[var(--cs-green)]",
    attention: "bg-[rgba(180,83,9,0.10)] text-[var(--cs-amber)]",
    offline: "bg-[rgba(180,35,24,0.10)] text-[var(--cs-red)]",
    notConfigured: "bg-[var(--cs-page)] text-[var(--cs-label)]",
};

function StatePill({ state }: { state: ServiceState }) {
    return (
        <span className={`inline-flex flex-none items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11px] font-bold ${STATE_TONE[state]}`}>
            <span className="h-[6px] w-[6px] rounded-full bg-current" aria-hidden="true" />
            {STATE_LABEL[state]}
        </span>
    );
}

/** A healthy (or simply unconfigured) service: always these four lines, so
 *  every card in the grid is the same height. */
function ServiceCard({ service }: { service: HealthService }) {
    const Icon = service.icon;
    return (
        <div className="flex min-w-0 flex-col rounded-[14px] border border-[var(--cs-line)] bg-[var(--cs-card)] p-[15px] shadow-[var(--cs-shadow)]">
            <div className="flex items-start gap-[11px]">
                <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] bg-[var(--cs-page)] text-[var(--cs-label)]">
                    <Icon size={17} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="text-[14px] font-bold text-[var(--cs-ink)]">{service.name}</span>
                    <span className="text-[12px] leading-[1.45] text-[var(--cs-faint)]">{service.role}</span>
                </span>
            </div>
            <div className="mt-[12px] flex items-center justify-between gap-[10px] border-t border-[var(--cs-line)] pt-[10px]">
                <span className="truncate text-[12.5px] font-semibold text-[var(--cs-muted)]">{service.metric}</span>
                <StatePill state={service.state} />
            </div>
        </div>
    );
}

/** A degraded service, full width: what it affects and what to press. */
function ProblemRow({ service }: { service: HealthService }) {
    const Icon = service.icon;
    return (
        <div className="flex min-w-0 flex-col rounded-[14px] border border-[rgba(180,83,9,0.28)] bg-[var(--cs-card)] p-[16px] shadow-[var(--cs-shadow)]">
            <div className="flex items-start gap-[12px]">
                <span className="grid h-[36px] w-[36px] flex-none place-items-center rounded-[10px] bg-[rgba(180,83,9,0.10)] text-[var(--cs-amber)]">
                    <Icon size={18} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="flex flex-wrap items-center gap-[9px]">
                        <span className="text-[14.5px] font-bold text-[var(--cs-ink)]">{service.name}</span>
                        <StatePill state={service.state} />
                        <span className="text-[12px] font-semibold text-[var(--cs-faint)]">{service.metric}</span>
                    </div>
                    <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--cs-muted)]">{service.impact}</p>
                </div>
            </div>

            <ol className="m-0 mt-[12px] flex list-none flex-col gap-[7px] border-t border-[var(--cs-line)] p-0 pt-[11px]">
                {service.recovery.map((step, i) => (
                    <li key={i} className="flex items-start gap-[9px]">
                        <span className="grid h-[19px] w-[19px] flex-none place-items-center rounded-full bg-[var(--cs-page)] text-[10.5px] font-bold text-[var(--cs-label)]">
                            {i + 1}
                        </span>
                        <span className="text-[12.5px] leading-[1.5] text-[var(--cs-muted)]">{step}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

/**
 * The page's own shape, drawn before the first probe answers.
 *
 * Not a spinner in the middle of an empty page: the hero, the section heading
 * and the card grid are all laid out at their REAL sizes, so nothing jumps
 * when the data lands. Two things make that possible rather than a guess:
 *
 * 1. `probeHealth` always returns exactly the same seven services (`model.ts`
 *    — internet, records, synapse, realtime, attachments, drafts, whatsapp).
 *    Only their pass/fail state is unknown before the first check, never
 *    their count — so the grid below draws seven cards, not a round number.
 * 2. The skeleton assumes the healthy outcome: no "Needs attention" block,
 *    an "All services" heading, all seven cards in one grid. That is the
 *    overwhelmingly common real state, and a doctor opening this page
 *    mid-incident sees the true one within a couple of seconds regardless —
 *    a skeleton that guessed "something's wrong" would be wrong far more
 *    often, and would mean the layout jumps TWICE: once to a fake problem,
 *    once to the real answer.
 *
 * The hero icon is sized to `BlankHealthArt` itself (76×76) — the healthy
 * icon, matching the outcome this skeleton assumes — not a rounder guess;
 * a mismatched placeholder is exactly the kind of shift this exists to avoid.
 */
function HealthSkeleton() {
    return (
        <div className="flex flex-col gap-[16px]" aria-hidden="true">
            <section className="flex flex-wrap items-center gap-[18px] rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[22px] py-[20px] shadow-[var(--cs-shadow)]">
                <span className="h-[76px] w-[76px] flex-none animate-pulse rounded-full bg-[var(--cs-page)]" />
                <div className="flex min-w-[240px] flex-1 flex-col gap-[8px]">
                    <span className="h-[19px] w-[210px] animate-pulse rounded-[6px] bg-[var(--cs-page)]" />
                    <span className="h-[13px] w-[340px] max-w-full animate-pulse rounded-[5px] bg-[var(--cs-page)]" />
                    <span className="h-[11.5px] w-[120px] animate-pulse rounded-[5px] bg-[var(--cs-page)]" />
                </div>
                {/* Same two buttons, same order, same padding as the live
                    hero — "Re-run check" (border) then "Copy diagnostics"
                    (filled) — so the row doesn't reflow width on landing. */}
                <div className="flex flex-none items-center gap-[8px]">
                    <span className="h-[38px] w-[132px] animate-pulse rounded-[10px] bg-[var(--cs-page)]" />
                    <span className="h-[38px] w-[158px] animate-pulse rounded-[10px] bg-[var(--cs-page)]" />
                </div>
            </section>

            {/* "ALL SERVICES", plus the small check glyph the live heading
                only shows once it actually knows nothing is wrong. */}
            <div className="ml-[2px] flex items-center gap-[7px]">
                <span className="h-[11px] w-[84px] animate-pulse rounded-[4px] bg-[var(--cs-line)]" />
                <span className="h-[13px] w-[13px] animate-pulse rounded-full bg-[var(--cs-line)]" />
            </div>

            <div className="grid grid-cols-2 gap-[12px] max-[900px]:grid-cols-1">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="flex h-[118px] flex-col justify-between rounded-[14px] border border-[var(--cs-line)] bg-[var(--cs-card)] p-[15px] shadow-[var(--cs-shadow)]">
                        <div className="flex items-start gap-[11px]">
                            <span className="h-[34px] w-[34px] flex-none animate-pulse rounded-[10px] bg-[var(--cs-page)]" />
                            <span className="flex flex-1 flex-col gap-[6px]">
                                <span className="h-[14px] w-[52%] animate-pulse rounded-[5px] bg-[var(--cs-page)]" />
                                <span className="h-[11px] w-[78%] animate-pulse rounded-[4px] bg-[var(--cs-page)]" />
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[var(--cs-line)] pt-[10px]">
                            <span className="h-[12px] w-[56px] animate-pulse rounded-[4px] bg-[var(--cs-page)]" />
                            <span className="h-[18px] w-[86px] animate-pulse rounded-full bg-[var(--cs-page)]" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HealthPage({
    logoRef, onOpenSidebar, onBack, hospitalId, doctorId, clinicName,
}: {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    onBack: () => void;
    hospitalId: string;
    doctorId: string;
    clinicName: string;
}) {
    // Boots from the last snapshot taken on THIS device, so a doctor who
    // opens this page with no internet sees the previous answer (labelled as
    // previous) instead of a spinner followed by a wall of failures.
    const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(() => readCachedSnapshot());
    const [checking, setChecking] = useState(true);
    const [online, setOnline] = useState(() => navigator.onLine);
    /** True until the first LIVE probe of this visit lands — separates "this
     *  is yesterday's answer" from "this is now". */
    const [stale, setStale] = useState(true);

    const run = useCallback(async () => {
        setChecking(true);
        try {
            const next = await probeHealth({ hospitalId, doctorId });
            setSnapshot(next);
            setStale(false);
            cacheSnapshot(next);
        } finally {
            setChecking(false);
        }
    }, [hospitalId, doctorId]);

    useEffect(() => { void run(); }, [run]);

    // Connectivity is the one input this page can be told about rather than
    // having to poll for. Coming back online re-runs immediately, which is
    // exactly what a doctor would otherwise press the button for.
    useEffect(() => {
        const up = () => { setOnline(true); void run(); };
        const down = () => { setOnline(false); };
        window.addEventListener("online", up);
        window.addEventListener("offline", down);
        return () => {
            window.removeEventListener("online", up);
            window.removeEventListener("offline", down);
        };
    }, [run]);

    const problems = snapshot?.services.filter(isDegraded) ?? [];
    const healthy = snapshot?.services.filter((s) => !isDegraded(s)) ?? [];

    const copy = () => {
        if (!snapshot) return;
        const report = diagnosticsReport(snapshot, { clinic: clinicName, accountRef: hospitalId.slice(0, 8) });
        navigator.clipboard?.writeText(report)
            .then(() => toast.success("Diagnostics copied — paste them to us."))
            .catch(() => toast.error("Could not copy — select the text by hand."));
    };

    return (
        <div className="flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="System Health"
                subtitle="What's working, and what to do if something isn't"
                rightSlot={<BackButton label="Settings" onClick={onBack} />}
            />

            {/* One scroll region, the page's own — never a box scrolling inside
                a box. Same 56px gutter Clinic and Practice take. */}
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-[16px] px-[56px] pb-[44px] pt-[22px] max-[900px]:px-[14px]">

                    {/* Nothing cached and nothing probed yet — draw the page's
                        real shape rather than a spinner in an empty frame. */}
                    {!snapshot ? <HealthSkeleton /> : (
                    <>

                    {/* No connection is the ONE thing this page can still say
                        with certainty when everything else times out, so it
                        says it first and explains what the rest of the page
                        now means. */}
                    {!online && (
                        <div className="flex items-start gap-[11px] rounded-[14px] border border-[rgba(180,83,9,0.28)] bg-[rgba(180,83,9,0.06)] px-[16px] py-[13px]">
                            <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[10px] bg-[rgba(180,83,9,0.12)] text-[var(--cs-amber)]">
                                <WifiOff size={16} />
                            </span>
                            <div className="flex min-w-0 flex-col gap-[2px]">
                                <span className="text-[13.5px] font-bold text-[var(--cs-ink)]">
                                    This device has no internet connection
                                </span>
                                <span className="text-[12.5px] leading-[1.5] text-[var(--cs-muted)]">
                                    Nothing below could be checked just now — what you see is the last check on this
                                    device. It re-runs on its own the moment you are back online.
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ══ The verdict, and the two things you can do with it ══ */}
                    <section className="flex flex-wrap items-center gap-[18px] rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[22px] py-[20px] shadow-[var(--cs-shadow)]">
                        <span className="flex-none">
                            {problems.length === 0
                                ? <BlankHealthArt />
                                : <AlertTriangle size={54} strokeWidth={1.4} className="text-[var(--cs-amber)]" />}
                        </span>

                        <div className="flex min-w-[240px] flex-1 flex-col gap-[5px]">
                            {/* Offline is ONE fault with four symptoms, and
                                counting the symptoms is how a page tells a
                                doctor to chase four problems that are really
                                the Wi-Fi. Name the cause instead. */}
                            <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.01em] text-[var(--cs-ink)]">
                                {!online
                                    ? "You're offline"
                                    : problems.length === 0
                                        ? "Everything is working"
                                        : problems.length === 1
                                            ? "One thing needs your attention"
                                            : `${problems.length} things need your attention`}
                            </h2>
                            <p className="m-0 text-[13px] leading-[1.5] text-[var(--cs-muted)]">
                                {!online
                                    ? "Everything below depends on the connection, so nothing else could be checked. Fix the connection first."
                                    : problems.length === 0
                                        ? "Records, suggestions and uploads all responded. Nothing is waiting on you."
                                        : "Everything else is fine — only what's listed below is affected."}
                            </p>
                            {/* Says WHEN, and whether that "when" is this
                                visit — a cached verdict presented as live is
                                the one dishonest thing this page could do. */}
                            <p className="m-0 mt-[2px] flex items-center gap-[6px] text-[11.5px] text-[var(--cs-faint)]">
                                {checking && <Loader2 size={11} className="animate-spin" />}
                                {checking
                                    ? "Checking now…"
                                    : stale
                                        ? `Last checked ${snapshot.checkedAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                                        : `Checked ${snapshot.checkedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`}
                            </p>
                        </div>

                        <div className="flex flex-none flex-wrap items-center gap-[8px]">
                            <button
                                type="button" onClick={() => void run()} disabled={checking}
                                className="inline-flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[10px] text-[12.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)] disabled:opacity-60"
                            >
                                {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Re-run check
                            </button>
                            {/* The single most useful control on this page: it
                                turns "it's not working" into something we can
                                actually read. */}
                            <button
                                type="button" onClick={copy}
                                className="inline-flex items-center gap-[7px] rounded-[10px] bg-[var(--cs-blue)] px-[15px] py-[10px] text-[12.5px] font-bold text-white transition-colors hover:bg-[#0e56c4] disabled:opacity-60"
                            >
                                <ClipboardCopy size={14} /> Copy diagnostics
                            </button>
                        </div>
                    </section>

                    {problems.length > 0 && (
                        <section className="flex flex-col gap-[10px]">
                            <h3 className="m-0 px-[2px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-faint)]">
                                Needs attention
                            </h3>
                            {problems.map((s) => <ProblemRow key={s.id} service={s} />)}
                        </section>
                    )}

                    <section className="flex flex-col gap-[10px]">
                        <h3 className="m-0 flex items-center gap-[7px] px-[2px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-faint)]">
                            {problems.length > 0 ? "Everything else" : "All services"}
                            {problems.length === 0 && !checking && (
                                <ShieldCheck size={13} className="text-[var(--cs-green)]" />
                            )}
                        </h3>

                        <div className="grid grid-cols-2 gap-[12px] max-[900px]:grid-cols-1">
                            {healthy.map((s) => <ServiceCard key={s.id} service={s} />)}
                        </div>
                    </section>

                    <p className="m-0 flex items-center gap-[7px] px-[4px] text-[11.5px] text-[var(--cs-faint)]">
                        <Check size={13} />
                        Only checks Cortex can actually run are listed — nothing here is a green light nobody measured.
                    </p>
                    </>
                    )}
                </div>
            </div>
        </div>
    );
}
