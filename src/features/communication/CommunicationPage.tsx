// ---------------------------------------------------------------------------
// COMMUNICATION — V1.
//
// What the doctor does here: sees that their prescriptions and follow-ups
// reached patients, reads what patients wrote back, and keeps enough credits
// to keep doing both. That is the whole page. It is deliberately NOT a
// WhatsApp CRM.
//
// ── The one rule about money on this page
//
// **Only what AREN SENDS costs a credit. A patient's reply is free.** Meta
// does not charge us to receive, so charging the doctor would be inventing a
// cost — and a UI that even IMPLIES it (a "usage by message type" breakdown
// with "patient messages" as a slice) teaches a doctor to avoid the one thing
// this feature exists to give them. Reply rows carry no credit, the delivery
// tile counts outbound only, and the credits card says so in words.
//
// ── Why there is no composer and no send button
//
// Sends are triggered by clinical work, not by this screen: a prescription
// goes out when a consultation is completed. A send button here would invite
// messaging a patient with no prescription attached, which is a different
// product. And replying needs Meta's 24-hour window — a text box that
// silently cannot send outside it is worse than an honest note.
//
// ── Layout: the viewport is the container
//
// The shell is exactly one viewport tall and does not scroll itself; the two
// main panels fill what is left and scroll INSIDE themselves. That is what
// makes the panels the same height with 0 rows, 3 rows or 300 — Anmol,
// 2026-09-07: *"the size of this container should be consistent... doesn't
// matter if there is data."* An empty panel therefore gets the art at full
// size rather than collapsing, and a nearly-empty one gets the same art
// watermarked behind its few rows (see `parts.tsx`).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
    AlertTriangle, ArrowRight, CalendarClock, Check, CheckCheck, Clock,
    ExternalLink, Loader2, MessageSquare, RefreshCw, Search,
    Sparkles, TrendingUp, Wallet, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { doctorName as formatDoctorName } from "../../lib/format";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { PrescriptionPreviewModal } from "../../components/PrescriptionPreviewModal";
import {
    fetchDoctorsByHospital, fetchHospitalCached,
    type DBDoctor, type DBHospital,
} from "../../lib/db";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { CreditHistoryModal } from "./CreditHistoryModal";
import {
    BigEmpty, ConversationArt, FillArt, CreditRing, Panel, PanelHead,
    UsageBars, WhatsAppTemplatePreview, dayLabel, type UsagePoint,
} from "./parts";
import {
    DELIVERY_LABEL, deliveryStateOf, fetchAppointmentRequests, fetchDeliveryStats,
    fetchMessageActivity, fetchPatientCard, fetchWhatsAppThreads, formatReplyWindow,
    formatWhatsAppPhone, setAppointmentRequestStatus,
    type AppointmentRequest, type DeliveryState, type DeliveryStats,
    type MessageActivity, type PatientCard, type WhatsAppThread,
} from "../../lib/db/whatsapp";
import {
    LOW_CREDIT_THRESHOLD, SOFT_LOW_CREDIT_THRESHOLD, cancelRechargeRequest, fetchCreditBalance,
    fetchCreditUsage, fetchRechargeRequests, formatCredits, formatWait, msUntilCancellable,
    type CreditBalance, type RechargeRequest,
} from "../../lib/db/messaging";

// ── The page cache ───────────────────────────────────────────────────────
//
// Anmol, 2026-09-07: *"whenever you enter that page, it takes some time to
// load... why are you loading data again when you are going to that page?
// cache these data."* Every mount used to start from nothing — five empty
// arrays and a null balance — and refetch on every visit, so leaving
// Communication for Patients and coming straight back showed a full skeleton
// flash for numbers that had not actually changed.
//
// A module-scope Map, not `localStorage`: this solves EXACTLY the complaint —
// re-entering the page within the same running app — and nothing more.
// Credits, deliveries and replies can change from another device or another
// browser tab at any moment, so a cache that survived a reload or a day would
// go stale in a way a doctor has no way to notice; keeping it in memory means
// a fresh tab always starts from the database, honestly, while a same-session
// revisit is instant. Keyed on hospital+doctor so switching identity (which
// does not happen mid-session today, but might) can never hand one doctor's
// numbers to another.
interface CachedPage {
    activity: MessageActivity[];
    threads: WhatsAppThread[];
    requests: AppointmentRequest[];
    credits: CreditBalance | null;
    recharges: RechargeRequest[];
    usage: UsagePoint[];
    stats: DeliveryStats | null;
}
const pageCache = new Map<string, CachedPage>();

interface Props {
    hospitalId: string | null;
    doctorId: string | null;
    userId: string | null;
    /** Opens the exact patient record on the Patients page (2026-09-08) —
     *  `patientId` when this thread/message has one (the normal case), a
     *  name-search fallback for the rare unlinked thread. */
    onViewPatient: (patientId: string | null, name: string | null) => void;
}

// ── Formatting ─────────────────────────────────────────────────────────────

function shortTime(iso: string): string {
    const at = new Date(iso);
    const now = new Date();
    const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
    if (now.toDateString() === at.toDateString()) return `Today, ${time}`;
    const yesterday = new Date(now.getTime() - 86400000);
    if (yesterday.toDateString() === at.toDateString()) return `Yesterday, ${time}`;
    return `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
}

function clockTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/** "RS" from "Rahul Sharma". Two letters max; a three-letter monogram in a
 *  32px circle is unreadable at this size. */
function initials(name: string | null, phone: string): string {
    if (!name?.trim()) return phone.slice(-2);
    const parts = name.trim().replace(/^dr\.?\s+/i, "").split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0].toUpperCase();
}

const DAY_COPY: Record<string, string> = { today: "Today", tomorrow: "Tomorrow", week: "This week" };

/**
 * One height for all three tiles, in one place.
 *
 * 178, not 164: measured live 2026-09-07, the Delivery tile's "patient replies
 * are free" line was clipped by the card at 164 — and that line is the one
 * that corrects a wrong belief about being charged, so silently cropping it
 * was worse than any of the layout it saved. A shared constant because three
 * separately-tuned heights is how a row of tiles goes ragged.
 */
const TILE_H = "h-[196px]";

// ── Delivery status pill ───────────────────────────────────────────────────

const STATE_STYLE: Record<DeliveryState, { dot: string; text: string; icon: typeof Check }> = {
    pending: { dot: "bg-[#94a3b8]", text: "text-[#64748b]", icon: Clock },
    sent: { dot: "bg-[#94a3b8]", text: "text-[#64748b]", icon: Check },
    delivered: { dot: "bg-[var(--cs-green)]", text: "text-[var(--cs-green)]", icon: CheckCheck },
    read: { dot: "bg-[var(--cs-green)]", text: "text-[var(--cs-green)]", icon: CheckCheck },
    failed: { dot: "bg-[var(--cs-red)]", text: "text-[var(--cs-red)]", icon: XCircle },
};

/** A dot and a word — the mock's treatment, and lighter than a filled chip on
 *  a list where every single row carries one. */
function StatusDot({ state }: { state: DeliveryState }) {
    const s = STATE_STYLE[state];
    return (
        <span className={`inline-flex flex-none items-center gap-[5px] text-[11px] font-semibold ${s.text}`}>
            <span className={`h-[6px] w-[6px] rounded-full ${s.dot}`} />
            {DELIVERY_LABEL[state]}
        </span>
    );
}

// ── The unified feed ───────────────────────────────────────────────────────
//
// One list, four filters. A doctor thinks "what happened with Rahul", not
// "which table is that in" — so an outbound send and an inbound reply are the
// same kind of row here, distinguished by what they say rather than by living
// in separate tabs the doctor has to guess between.

type FeedKind = "prescription" | "follow_up" | "reply";

interface FeedRow {
    key: string;
    kind: FeedKind;
    phone: string;
    patientId: string | null;
    patientName: string | null;
    title: string;
    preview: string;
    at: string;
    /** Outbound only. A reply has no delivery state — it arrived. */
    state?: DeliveryState;
    replyCount?: number;
    messageId?: number;
}

type Tab = "all" | "prescription" | "follow_up" | "reply";

const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "prescription", label: "Prescriptions" },
    { key: "follow_up", label: "Follow-ups" },
    { key: "reply", label: "Patient replies" },
];

export function CommunicationPage({
    hospitalId, doctorId, userId, onViewPatient,
}: Props) {
    const [tab, setTab] = useState<Tab>("all");
    const [query, setQuery] = useState("");

    // The cache key for THIS render. Read once, up front, so the lazy
    // `useState` initializers below and the hydrate-on-mount effect further
    // down are guaranteed to agree on what "cached" meant at mount time.
    const cacheKey = hospitalId && doctorId ? `${hospitalId}::${doctorId}` : null;
    const cached = cacheKey ? pageCache.get(cacheKey) : undefined;

    const [activity, setActivity] = useState<MessageActivity[]>(cached?.activity ?? []);
    const [threads, setThreads] = useState<WhatsAppThread[]>(cached?.threads ?? []);
    const [requests, setRequests] = useState<AppointmentRequest[]>(cached?.requests ?? []);
    const [credits, setCredits] = useState<CreditBalance | null>(cached?.credits ?? null);
    const [recharges, setRecharges] = useState<RechargeRequest[]>(cached?.recharges ?? []);
    const [usage, setUsage] = useState<UsagePoint[]>(cached?.usage ?? []);
    const [stats, setStats] = useState<DeliveryStats | null>(cached?.stats ?? null);
    const [patient, setPatient] = useState<PatientCard | null>(null);

    // Skeletons only when there is nothing to show yet. A cache hit means
    // real numbers are already on screen from the first paint.
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState<string | null>(null);
    const [busyRequestId, setBusyRequestId] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [buyOpen, setBuyOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    // Selection is by PHONE, never by index: a new message reorders the feed,
    // and an index would silently move the reader into someone else's thread.
    const [activePhone, setActivePhone] = useState<string | null>(null);
    const [focusMessageId, setFocusMessageId] = useState<number | null>(null);

    /**
     * `opts.silent` is what makes a cache hit invisible. A background
     * revalidation on mount must not flip `loading` back to true (that would
     * momentarily blank a list that is already correctly showing) and must
     * not surface a transient network hiccup as a page-level error banner
     * over data the doctor can already see and that is still probably right —
     * it is logged instead, and the NEXT successful load clears it same as
     * always.
     */
    const load = useCallback(async (opts: { silent?: boolean } = {}) => {
        if (!hospitalId) return;
        if (!opts.silent) { setError(null); setLoading(true); }
        try {
            const [a, t, r, c, rc, u, s] = await Promise.all([
                fetchMessageActivity(hospitalId, { doctorId }),
                fetchWhatsAppThreads(hospitalId),
                fetchAppointmentRequests(hospitalId),
                doctorId ? fetchCreditBalance(doctorId) : Promise.resolve(null),
                doctorId ? fetchRechargeRequests(doctorId) : Promise.resolve([]),
                doctorId ? fetchCreditUsage(doctorId, 14) : Promise.resolve([]),
                fetchDeliveryStats(hospitalId, { doctorId }),
            ]);
            setActivity(a); setThreads(t); setRequests(r);
            setCredits(c); setRecharges(rc); setUsage(u); setStats(s);
            if (cacheKey) pageCache.set(cacheKey, { activity: a, threads: t, requests: r, credits: c, recharges: rc, usage: u, stats: s });
        } catch (e) {
            if (opts.silent) console.error("[communication] background refresh failed:", e);
            else setError(e instanceof Error ? e.message : "Could not load messages");
        } finally {
            if (!opts.silent) setLoading(false);
        }
    }, [hospitalId, doctorId, cacheKey]);

    // Silent exactly when this mount already had a cache hit to show —
    // computed once, in the same render that produced `cached` above, so it
    // reflects the state BEFORE this load call rather than one this call is
    // about to overwrite.
    useEffect(() => { void load({ silent: !!cached }); }, [load]);

    const activeThread = useMemo(
        () => threads.find((t) => t.phone === activePhone) ?? null,
        [threads, activePhone]
    );
    const focusMessage = useMemo(() => {
        const exact = activity.find((a) => a.id === focusMessageId);
        if (exact) return exact;
        // Clicking a "Patient replied" row selects a thread, not a send — but
        // the question that row raises ("did my prescription even reach
        // them?") is answered by the same timeline. So fall back to the newest
        // outbound message on this phone rather than showing the panel with a
        // hole where the delivery status was.
        if (!activePhone) return null;
        return activity.find((a) => a.phone === activePhone) ?? null;
    }, [activity, focusMessageId, activePhone]);
    const selectedPatientId = focusMessage?.patientId ?? activeThread?.patientId ?? null;

    // The header's age/gender line. One small read, only for the patient
    // actually on screen — not prefetched for a list nobody may click.
    useEffect(() => {
        if (!selectedPatientId) { setPatient(null); return; }
        let alive = true;
        fetchPatientCard(selectedPatientId)
            .then((p) => { if (alive) setPatient(p); })
            .catch(() => { if (alive) setPatient(null); });
        return () => { alive = false; };
    }, [selectedPatientId]);

    const pendingRecharge = useMemo(
        () => recharges.find((r) => r.status === "pending") ?? null,
        [recharges]
    );

    // ── Build the feed ─────────────────────────────────────────────────────
    const feed = useMemo<FeedRow[]>(() => {
        const rows: FeedRow[] = activity.map((a) => ({
            key: `m${a.id}`,
            kind: a.purpose === "follow_up" ? "follow_up" : "prescription",
            phone: a.phone,
            patientId: a.patientId,
            patientName: a.patientName,
            title: a.purpose === "follow_up" ? "Follow-up" : "Prescription",
            preview:
                a.state === "failed"
                    ? "Message failed to deliver"
                    : a.purpose === "follow_up"
                        ? "Follow-up message sent"
                        : "Prescription sent successfully",
            at: a.createdAt,
            state: a.state,
            messageId: a.id,
        }));

        // One row per thread that has anything inbound — the patient's side of
        // the conversation, which no outbound row represents.
        for (const t of threads) {
            const inbound = t.messages.filter((m) => m.direction === "inbound");
            if (!inbound.length) continue;
            const last = inbound[inbound.length - 1];
            rows.push({
                key: `t${t.phone}`,
                kind: "reply",
                phone: t.phone,
                patientId: t.patientId,
                patientName: t.patientName,
                title: "Patient replied",
                preview: last.body_preview || `[${last.message_type}]`,
                at: last.created_at,
                replyCount: inbound.length,
            });
        }

        return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [activity, threads]);

    const needle = query.trim().toLowerCase();
    const visible = useMemo(
        () => feed.filter((r) => {
            if (tab !== "all" && r.kind !== tab) return false;
            if (!needle) return true;
            return (r.patientName ?? "").toLowerCase().includes(needle)
                || r.phone.includes(needle)
                || r.title.toLowerCase().includes(needle);
        }),
        [feed, tab, needle]
    );

    const selectRow = (row: FeedRow) => {
        setActivePhone(row.phone);
        setFocusMessageId(row.messageId ?? null);
    };

    const handleRequest = useCallback(
        async (request: AppointmentRequest, status: "confirmed" | "declined") => {
            setBusyRequestId(request.id);
            const previous = requests;
            setRequests((rs) => rs.filter((r) => r.id !== request.id));
            try {
                await setAppointmentRequestStatus(request.id, status, userId);
                toast.success(
                    status === "confirmed"
                        ? `Confirmed — call ${formatWhatsAppPhone(request.phone)} with a time`
                        : "Request declined"
                );
            } catch (e) {
                setRequests(previous);
                toast.error(e instanceof Error ? e.message : "Could not update the request");
            } finally {
                setBusyRequestId(null);
            }
        },
        [requests, userId]
    );

    const withdrawRecharge = useCallback(async () => {
        if (!pendingRecharge || cancelling) return;
        setCancelling(true);
        try {
            await cancelRechargeRequest(pendingRecharge.id);
            toast.success("Request withdrawn — you can raise a new one");
            await load();
        } catch (e) {
            // The database's own refusal, shown verbatim: it is written for
            // the doctor ("A request can only be withdrawn after 3 hours.")
            toast.error(e instanceof Error ? e.message : "Could not withdraw the request");
        } finally {
            setCancelling(false);
        }
    }, [pendingRecharge, cancelling, load]);

    // `credits === null` is NOT zero credits — it is "this device has never
    // managed to read the balance". Collapsing the two is what put a clinic
    // that was merely offline into the full out-of-credits alarm: "when
    // there is no any connection, it shows zero credits remaining, which is
    // not a good deal" (Anmol, 2026-09-13). `fetchCreditBalance` already
    // falls back to the last confirmed balance (lib/db/messaging.ts), so
    // null here means even THAT was never written — and the honest answer
    // then is "we don't know", never "you have none".
    const balanceKnown = credits != null;
    const balance = credits?.balance ?? 0;
    // Three tiers below "ok", each a step up in urgency — Anmol, 2026-09-07:
    // "as the credits go under 500, start showing soft warning" ON TOP OF the
    // existing under-100 reminder, not instead of it. `LOW_CREDIT_THRESHOLD`
    // stays what the database and AREN's own email alert use; "soft" is a
    // UI-only earlier nudge with no email behind it.
    const health = !balanceKnown ? "unknown"
        : balance <= 0 ? "out"
            : balance < LOW_CREDIT_THRESHOLD ? "low"
                : balance < SOFT_LOW_CREDIT_THRESHOLD ? "soft"
                    : "ok";
    const usageTotal = useMemo(() => usage.reduce((n, p) => n + p.credits, 0), [usage]);
    const waitMs = pendingRecharge ? msUntilCancellable(pendingRecharge) : 0;

    return (
        // NO `overflow-hidden` HERE — see the identical note in
        // `SupportPage.tsx`/`practice.css`: it makes this root the sticky
        // reference scrollport for `WorkspaceHeader` below, which un-sticks
        // it from the viewport the instant the document is ever a pixel
        // taller than the screen. The content div right below already scrolls
        // itself (`flex-1 min-h-0 overflow-y-auto`), so the root never needed
        // to clip anything.
        <div className="flex h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                title="Communication"
                subtitle="WhatsApp conversations, patient messages & follow-ups"
                rightSlot={
                    <div className="flex items-center gap-[14px]">
                        <span className="flex items-center gap-[6px] text-[11.5px] font-semibold text-[#8ee6ab]">
                            <span className="h-[7px] w-[7px] rounded-full bg-[#25d366]" />
                            WhatsApp connected
                        </span>
                        <span className="h-[24px] w-px bg-[rgba(255,255,255,0.16)]" />
                        <button type="button" className="ws-stat-pill" onClick={() => void load()} disabled={loading}>
                            <span className="ws-stat-icon">
                                <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
                            </span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{credits ? formatCredits(balance) : "—"}</span>
                                <span className="ws-stat-label">credits left</span>
                            </span>
                        </button>
                        <span className="flex flex-col leading-[1.15]">
                            <span className="text-[15px] font-bold tabular-nums text-white">
                                {stats ? formatCredits(stats.monthCount) : "—"}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[rgba(255,255,255,0.55)]">
                                messages this month
                            </span>
                        </span>
                    </div>
                }
            />

            <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[40px] pb-[20px] pt-[16px] max-[900px]:px-[12px]">

                {error && (
                    <div className="flex flex-none items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-red)] bg-[var(--cs-red-soft)] px-[14px] py-[10px] text-[12px] font-medium text-[var(--cs-red)]">
                        {error}
                        <button type="button" className="ml-auto font-bold underline" onClick={() => void load()}>
                            Try again
                        </button>
                    </div>
                )}

                {/* ── Three tiles ──────────────────────────────────────────── */}
                <div className="grid flex-none grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(0,0.95fr)] gap-[12px] max-[1100px]:grid-cols-1">

                    {/* Credits */}
                    <Panel className={TILE_H} label="Message credits">
                        <PanelHead icon={<Wallet size={13} />} title="Message credits" />
                        <div className="flex min-h-0 flex-1 items-center gap-[16px] px-[16px] pb-[12px] pt-[10px]">
                            <CreditRing balance={balance} granted={credits?.granted ?? 0} size={104} />
                            <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                                <span className="text-[13.5px] font-semibold leading-[1.3] text-[var(--cs-ink)]">
                                    {credits ? `${formatCredits(credits.spent)} used` : "—"}
                                    <span className="font-normal text-[var(--cs-faint)]">
                                        {credits ? ` of ${formatCredits(credits.granted)}` : ""}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setBuyOpen(true)}
                                    disabled={!doctorId}
                                    className={
                                        "flex h-[34px] w-full cursor-pointer items-center justify-center gap-[6px] rounded-[10px] border-0 " +
                                        "bg-[var(--cs-violet)] text-[12.5px] font-bold text-white outline-none transition-opacity " +
                                        "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                                    }
                                >
                                    <Wallet size={13} /> Buy credits
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHistoryOpen(true)}
                                    disabled={!doctorId}
                                    className="inline-flex cursor-pointer items-center gap-[3px] self-start rounded-[6px] border-0 bg-transparent p-0 text-[11.5px] font-semibold text-[var(--cs-violet)] outline-none transition-[gap] hover:gap-[6px] disabled:opacity-45"
                                >
                                    View credit history <ArrowRight size={12} />
                                </button>
                            </div>
                        </div>
                    </Panel>

                    {/* Usage — the whole tile is the door to the history modal. */}
                    <Panel className={TILE_H} label="Credits usage" onClick={() => doctorId && setHistoryOpen(true)}>
                        <PanelHead
                            icon={<TrendingUp size={13} />}
                            title="Credits usage"
                            right={
                                <span className="flex flex-col items-end leading-[1.15]">
                                    <span className="text-[17px] font-bold tabular-nums text-[var(--cs-violet)]">
                                        {formatCredits(usageTotal)}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                        last 14 days
                                    </span>
                                </span>
                            }
                        />
                        <div className="flex min-h-0 flex-1 flex-col justify-end gap-[4px] px-[14px] pb-[11px] pt-[6px]">
                            {usageTotal === 0 ? (
                                // Fourteen 2px stubs under an axis is a chart
                                // that looks broken. Say the quiet fortnight
                                // out loud instead.
                                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3px] text-center">
                                    <ConversationArt size={72} />
                                    <span className="text-[11.5px] font-semibold text-[var(--cs-muted)]">
                                        No credits used yet
                                    </span>
                                    <span className="text-[10.5px] text-[var(--cs-faint)]">
                                        Every prescription you send will show up here.
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <UsageBars points={usage} height={72} />
                                    <div className="flex items-center justify-between text-[9.5px] font-medium text-[var(--cs-faint)]">
                                        <span>{usage.length ? dayLabel(usage[0].date) : ""}</span>
                                        <span className="font-semibold text-[var(--cs-violet)]">Open history</span>
                                        <span>{usage.length ? dayLabel(usage[usage.length - 1].date) : ""}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </Panel>

                    {/* Delivery health — what replaced "usage by message type".
                        That card split spend across categories INCLUDING
                        patient messages, which charges for something free and
                        answers a question no doctor asks. This answers the one
                        they do: "are my messages reaching people?" */}
                    <Panel className={TILE_H} label="Delivery">
                        <PanelHead icon={<CheckCheck size={13} />} title="Delivery" />
                        <div className="flex min-h-0 flex-1 flex-col gap-[7px] px-[14px] pb-[12px] pt-[8px]">
                            <div className="flex items-baseline gap-[7px]">
                                <span className="text-[31px] font-extrabold leading-none tabular-nums text-[var(--cs-green)]">
                                    {stats ? `${stats.reachedPct}%` : "—"}
                                </span>
                                <span className="text-[11.5px] text-[var(--cs-faint)]">reached patients · 14 days</span>
                            </div>
                            <div className="flex flex-col gap-[4px]">
                                {([
                                    ["Read", stats?.read ?? 0, "bg-[var(--cs-green)]"],
                                    ["Delivered", stats?.delivered ?? 0, "bg-[#7dd3a0]"],
                                    ["Sent", stats?.sent ?? 0, "bg-[#cbd5e1]"],
                                    ["Failed", stats?.failed ?? 0, "bg-[var(--cs-red)]"],
                                ] as const).map(([label, n, dot]) => (
                                    <span key={label} className="flex items-center gap-[7px] text-[11.5px]">
                                        <span className={`h-[7px] w-[7px] flex-none rounded-full ${dot}`} />
                                        <span className="text-[var(--cs-muted)]">{label}</span>
                                        <span className="ml-auto font-bold tabular-nums text-[var(--cs-ink)]">{n}</span>
                                    </span>
                                ))}
                            </div>
                            {/* Said in words, because the old card implied the
                                opposite and a doctor who believes replies cost
                                money will avoid the feature. */}
                            <span className="mt-auto pt-[2px] text-[10px] leading-[1.35] text-[var(--cs-faint)]">
                                Patient replies are always free — only messages you send use a credit.
                            </span>
                        </div>
                    </Panel>
                </div>

                {/* ── Exhausted: its own banner, not a line in a strip ────────
                    Anmol, 2026-09-07: "that warning should be much better if
                    credit is exhausted." At zero, nothing on this page sends
                    any more — that is a different order of problem than
                    "getting low", and sharing a thin strip with a soft nudge
                    made it read as equally casual. It now gets a bigger,
                    two-colour card, above the tiles, with the recharge action
                    built in rather than pointed at. */}
                {health === "out" && (
                    <div className="flex flex-none items-center gap-[14px] rounded-[var(--cs-radius)] border-2 border-[var(--cs-red)] bg-[var(--cs-red-soft)] px-[18px] py-[14px]">
                        <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-[var(--cs-red)] text-white">
                            <AlertTriangle size={19} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                            <strong className="text-[14px] font-bold leading-[1.2] text-[var(--cs-red)]">
                                Messaging credits exhausted
                            </strong>
                            <span className="text-[12px] leading-[1.4] text-[var(--cs-red)]">
                                Prescriptions and follow-ups can't go out on WhatsApp until you recharge.
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setBuyOpen(true)}
                            disabled={!doctorId}
                            className="flex-none cursor-pointer rounded-full border-0 bg-[var(--cs-red)] px-[16px] py-[9px] text-[12.5px] font-bold text-white outline-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Buy credits now
                        </button>
                    </div>
                )}

                {/* Soft / low / pending-recharge — a thinner strip, one step
                    down in urgency from the banner above. "Soft" (under 500)
                    reads as a nudge, not an alarm: teal rather than amber, an
                    outline icon rather than a triangle, because the doctor has
                    not actually run into a wall yet. */}
                {(health === "low" || health === "soft" || pendingRecharge) && (
                    <div
                        className={
                            "flex flex-none flex-wrap items-center gap-x-[14px] gap-y-[6px] rounded-[var(--cs-radius)] border px-[14px] py-[9px] text-[12px] font-medium " +
                            (health === "low"
                                ? "border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] text-[var(--cs-amber)]"
                                : health === "soft"
                                    ? "border-[var(--cs-teal)] bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]"
                                    : "border-[var(--cs-line)] bg-[var(--cs-card)] text-[var(--cs-muted)]")
                        }
                    >
                        {health === "low" && (
                            <span className="flex items-center gap-[6px] font-semibold">
                                <AlertTriangle size={13} />
                                Low messaging credits — {formatCredits(balance)} remaining.
                            </span>
                        )}
                        {health === "soft" && (
                            <span className="flex items-center gap-[6px] font-semibold">
                                <Wallet size={13} />
                                {formatCredits(balance)} credits left — worth topping up soon.
                            </span>
                        )}
                        {pendingRecharge && (
                            <>
                                <span className="flex items-center gap-[6px]">
                                    <Clock size={13} />
                                    Recharge {pendingRecharge.reference} submitted — we'll contact you shortly.
                                </span>
                                {/* Three hours, enforced by the database
                                    (`cancel_credit_recharge`). Before then the
                                    control states the wait instead of being a
                                    button that errors. */}
                                {waitMs > 0 ? (
                                    <span className="text-[11px] text-[var(--cs-faint)]">
                                        Can be withdrawn in {formatWait(waitMs)}
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void withdrawRecharge()}
                                        disabled={cancelling}
                                        className="inline-flex cursor-pointer items-center gap-[5px] rounded-full border border-[var(--cs-line-strong)] bg-[var(--cs-card)] px-[10px] py-[3px] text-[11px] font-semibold text-[var(--cs-muted)] outline-none hover:bg-[#f1f5f9] disabled:opacity-50"
                                    >
                                        {cancelling ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                                        Withdraw &amp; raise a new one
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Appointment requests — the only part of this page somebody
                    is waiting on an answer for. */}
                {requests.length > 0 && (
                    <Panel className="flex-none" label="Appointment requests">
                        <PanelHead
                            icon={<CalendarClock size={13} />}
                            title="Appointment requests"
                            right={
                                <span className="rounded-full bg-[var(--cs-teal-soft)] px-[8px] py-[2px] text-[10.5px] font-bold text-[var(--cs-teal)]">
                                    {requests.length} waiting
                                </span>
                            }
                        />
                        <div className="flex flex-col gap-[5px] px-[14px] pb-[11px] pt-[8px]">
                            {requests.map((r) => (
                                <div key={r.id} className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[7px]">
                                    <span className="flex min-w-0 flex-col gap-[1px]">
                                        <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                            {r.patientName ?? formatWhatsAppPhone(r.phone)}
                                        </span>
                                        <span className="text-[10.5px] text-[var(--cs-faint)]">
                                            wants {DAY_COPY[r.preferred_day ?? ""] ?? r.preferred_day ?? "a visit"} · {shortTime(r.created_at)}
                                        </span>
                                    </span>
                                    <span className="ml-auto flex flex-none items-center gap-[6px]">
                                        <button
                                            type="button"
                                            disabled={busyRequestId === r.id}
                                            onClick={() => void handleRequest(r, "confirmed")}
                                            className="inline-flex cursor-pointer items-center gap-[4px] rounded-full border border-[var(--cs-teal)] bg-transparent px-[10px] py-[4px] text-[11px] font-semibold text-[var(--cs-teal)] outline-none hover:bg-[var(--cs-teal-soft)] disabled:opacity-45"
                                        >
                                            <Check size={12} /> Confirm
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busyRequestId === r.id}
                                            onClick={() => void handleRequest(r, "declined")}
                                            className="inline-flex cursor-pointer items-center gap-[4px] rounded-full border border-[var(--cs-line-strong)] bg-transparent px-[10px] py-[4px] text-[11px] font-semibold text-[var(--cs-faint)] outline-none hover:bg-[#f1f5f9] disabled:opacity-45"
                                        >
                                            <X size={12} /> Decline
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="m-0 border-t border-[var(--cs-line)] px-[14px] py-[7px] text-[10.5px] leading-[1.45] text-[var(--cs-faint)]">
                            Confirming records your decision — it does not add the patient to today's queue
                            or send a time. Call them with the slot.
                        </p>
                    </Panel>
                )}

                {/* ── Feed + conversation ──────────────────────────────────── */}
                {/* The message list carries more of the width now — it was the
                    half a doctor actually scans, and it was the smaller column.

                    `min-h` alone used to be the whole story — a floor with no
                    ceiling. Both panels below already carry their own
                    `min-h-0 flex-1 overflow-y-auto` scroll region, but that
                    only ever activates when an ANCESTOR actually stops
                    growing; with nothing capping this row, it just grew with
                    the thread instead, and the doctor scrolled the whole
                    PAGE to read old messages rather than the thread
                    scrolling in place. Anmol, 2026-09-11: "you can't
                    generally scroll through the chat... the chat should have
                    its own scrolling." `max-h` gives it the ceiling `min-h`
                    was missing — same fixed range on every screen, past
                    which the panels' own scrollbars take over. */}
                <div className="grid min-h-[468px] max-h-[640px] flex-1 grid-cols-[minmax(340px,0.82fr)_minmax(0,1fr)] gap-[14px] max-[1100px]:grid-cols-1">

                    <Panel className="min-h-0" label="Messages">
                        <div className="flex flex-none items-center gap-[2px] border-b border-[var(--cs-line)] px-[12px] pt-[10px]">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    className={
                                        "relative cursor-pointer border-0 bg-transparent px-[11px] pb-[10px] pt-[3px] text-[13px] outline-none transition-colors " +
                                        (tab === t.key
                                            ? "font-bold text-[var(--cs-violet)] after:absolute after:inset-x-[6px] after:bottom-[-1px] after:h-[2px] after:rounded-full after:bg-[var(--cs-violet)] after:content-['']"
                                            : "font-medium text-[var(--cs-faint)] hover:text-[var(--cs-muted)]")
                                    }
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative flex-none px-[14px] py-[10px]">
                            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-[26px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]" />
                            <input
                                type="search"
                                value={query}
                                placeholder="Search patient name, message type…"
                                onChange={(e) => setQuery(e.target.value)}
                                className="h-[40px]! w-full rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] pl-[34px]! pr-[12px]! text-[13px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-violet)]"
                            />
                        </div>

                        {/* The nested scroll. `min-h-0` is what lets this
                            shrink inside the panel instead of growing it. */}
                        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                            {loading ? (
                                <div className="flex flex-col gap-[6px] px-[12px] pb-[12px] pt-[4px]">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div key={i} className="h-[68px] animate-pulse rounded-[10px] bg-[#eef0f5]" />
                                    ))}
                                </div>
                            ) : visible.length === 0 ? (
                                <BigEmpty
                                    art={<ConversationArt size={158} />}
                                    fact={feed.length === 0 ? "No messages yet" : "Nothing matches that"}
                                    next={
                                        feed.length === 0
                                            ? "Complete a consultation and the prescription goes out on WhatsApp automatically — it will show up right here."
                                            : "Try a different tab, or clear the search."
                                    }
                                />
                            ) : (
                                <>
                                    {/* Sparse-list watermark: the same drawing
                                        the zero state uses, so the leftover
                                        space reads as designed rather than as
                                        a list that stopped early. */}
                                    {visible.length <= 3 && (
                                        <FillArt><ConversationArt size={190} /></FillArt>
                                    )}
                                    <ul className="relative z-[1] m-0 flex list-none flex-col p-0">
                                        {visible.map((row) => {
                                            const on = activePhone === row.phone
                                                && (row.messageId ?? null) === focusMessageId;
                                            return (
                                                <li key={row.key}>
                                                    <button
                                                        type="button"
                                                        onClick={() => selectRow(row)}
                                                        className={
                                                            "flex w-full cursor-pointer items-start gap-[13px] border-0 border-l-[3px] px-[15px] py-[13px] text-left outline-none transition-colors " +
                                                            (on
                                                                ? "border-l-[var(--cs-violet)] bg-[var(--cs-violet-soft)]"
                                                                : "border-l-transparent bg-transparent hover:bg-[#f8fafc]")
                                                        }
                                                    >
                                                        <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full bg-[var(--cs-violet-soft)] text-[13px] font-bold text-[var(--cs-violet)]">
                                                            {initials(row.patientName, row.phone)}
                                                        </span>
                                                        <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
                                                            <span className="flex min-w-0 items-baseline gap-[8px]">
                                                                <span className="truncate text-[14px] font-bold text-[var(--cs-ink)]">
                                                                    {row.patientName ?? formatWhatsAppPhone(row.phone)}
                                                                </span>
                                                                <span className="ml-auto flex-none text-[11.5px] text-[var(--cs-faint)]">
                                                                    {shortTime(row.at)}
                                                                </span>
                                                            </span>
                                                            <span className="text-[12.5px] font-semibold text-[var(--cs-muted)]">
                                                                {row.title}
                                                            </span>
                                                            <span className="flex min-w-0 items-center gap-[8px]">
                                                                <span className="truncate text-[12px] text-[var(--cs-faint)]">
                                                                    {row.preview}
                                                                </span>
                                                                <span className="ml-auto flex-none">
                                                                    {row.state
                                                                        ? <StatusDot state={row.state} />
                                                                        : (
                                                                            <span className="inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-[var(--cs-violet)]">
                                                                                <span className="h-[6px] w-[6px] rounded-full bg-[var(--cs-violet)]" />
                                                                                {row.replyCount === 1 ? "1 reply" : `${row.replyCount} replies`}
                                                                            </span>
                                                                        )}
                                                                </span>
                                                            </span>
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    </Panel>

                    <ConversationPanel
                        thread={activeThread}
                        focus={focusMessage}
                        patient={patient}
                        onViewPatient={onViewPatient}
                        hospitalId={hospitalId}
                    />
                </div>

                {/* Coming soon — quiet, because it is a promise and not a
                    feature, and a full-weight card for something that does
                    nothing competes with the parts that work. */}
                <div className="flex flex-none items-center gap-[9px] rounded-[var(--cs-radius)] border border-dashed border-[var(--cs-line-strong)] px-[14px] py-[9px]">
                    <Sparkles size={14} className="flex-none text-[var(--cs-faint)]" />
                    <span className="text-[12px] font-semibold text-[var(--cs-muted)]">
                        WhatsApp consultation booking
                    </span>
                    <span className="rounded-full bg-[#f1f5f9] px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.06em] text-[#475569]">
                        Coming soon
                    </span>
                </div>
            </div>

            {buyOpen && doctorId && hospitalId && (
                <BuyCreditsModal
                    hospitalId={hospitalId}
                    doctorId={doctorId}
                    userId={userId}
                    currentBalance={balance}
                    pending={pendingRecharge}
                    onClose={() => setBuyOpen(false)}
                    onRequested={(r) => setRecharges((rs) => [r, ...rs])}
                    onWithdrawn={() => { void load(); }}
                />
            )}

            {historyOpen && doctorId && (
                <CreditHistoryModal doctorId={doctorId} onClose={() => setHistoryOpen(false)} />
            )}
        </div>
    );
}

// ── The conversation ───────────────────────────────────────────────────────

/**
 * One patient's thread, read the way WhatsApp reads it — outbound right,
 * inbound left, a tinted ground behind the bubbles — but stopping well short
 * of a clone: no composer, no avatars per bubble, and AREN's own type scale.
 * "Slightly WhatsApp" (Anmol, 2026-09-07) is the brief; a full imitation would
 * promise a reply box this version deliberately does not have.
 */
function ConversationPanel({
    thread, focus, patient, onViewPatient, hospitalId,
}: {
    thread: WhatsAppThread | null;
    focus: MessageActivity | null;
    patient: PatientCard | null;
    onViewPatient: (patientId: string | null, name: string | null) => void;
    hospitalId: string | null;
}) {
    const name = patient?.name ?? thread?.patientName ?? focus?.patientName ?? null;
    const patientId = patient?.id ?? thread?.patientId ?? focus?.patientId ?? null;
    const phone = thread?.phone ?? focus?.phone ?? null;
    const nothing = !thread && !focus;

    const subtitle = [
        patient?.gender ? patient.gender[0].toUpperCase() + patient.gender.slice(1) : null,
        patient?.age ? `${patient.age} years` : null,
        phone ? formatWhatsAppPhone(phone) : null,
    ].filter(Boolean).join("  •  ");

    // ── Rendering a sent prescription template as it actually looked ────────
    // Needs the clinic's own name and the sending doctor's, which nothing on
    // this page loads today — a message row only carries `doctor_id`. Fetched
    // once per hospital (`fetchHospitalCached` is already a cross-page cache,
    // same one Print RX uses), not per message.
    const [hospital, setHospital] = useState<DBHospital | null>(null);
    const [doctors, setDoctors] = useState<DBDoctor[]>([]);
    useEffect(() => {
        if (!hospitalId) return;
        fetchHospitalCached(hospitalId).then(setHospital).catch(() => setHospital(null));
        fetchDoctorsByHospital(hospitalId).then(setDoctors).catch(() => setDoctors([]));
    }, [hospitalId]);
    const doctorNameById = useMemo(
        () => new Map(doctors.map((d) => [d.id, d.name])),
        [doctors]
    );

    // "View Prescription" opens the SAME renderer Consult and Print RX use —
    // never a second one (standing rule 6) — read-only, exactly like Print
    // RX's reprint door. The fetch/skeleton/`ReviewModal` plumbing itself
    // now lives in `PrescriptionPreviewModal` (shared with Overview's own
    // "Prescriptions" activity list, 2026-09-12) — this page just owns which
    // id, if any, is open.
    const [viewingRxId, setViewingRxId] = useState<string | null>(null);

    // The `margin-top: auto` spacer (see the thread div's own comment) fixes
    // scrollability but, on its own, leaves a freshly opened/switched thread
    // sitting at its TOP — a plain scroll container's natural resting
    // position, and the wrong one for a chat, where the newest message is
    // the thing a doctor opens a conversation to read. Jump to the bottom
    // ourselves whenever the thread identity or its message count changes.
    const threadScrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = threadScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [thread?.phone, thread?.messages.length]);

    return (
        <>
        <Panel className="min-h-0" label="Conversation">
            {nothing ? (
                <BigEmpty
                    art={<ConversationArt size={172} />}
                    fact="Nothing selected"
                    next="Pick a message on the left to see what happened to it and anything the patient sent back."
                />
            ) : (
                <>
                    {/* Patient header */}
                    <div className="flex flex-none items-center gap-[11px] border-b border-[var(--cs-line)] px-[16px] py-[12px]">
                        <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full bg-[var(--cs-violet-soft)] text-[14px] font-bold text-[var(--cs-violet)]">
                            {initials(name, phone ?? "")}
                        </span>
                        <span className="flex min-w-0 flex-col gap-[1px]">
                            <span className="truncate text-[15px] font-bold leading-[1.2] text-[var(--cs-ink)]">
                                {name ?? (phone ? formatWhatsAppPhone(phone) : "Unknown patient")}
                            </span>
                            <span className="truncate text-[11.5px] text-[var(--cs-faint)]">
                                {subtitle || (phone ? formatWhatsAppPhone(phone) : "")}
                            </span>
                        </span>
                        {name && (
                            <button
                                type="button"
                                onClick={() => onViewPatient(patientId, name)}
                                className="ml-auto inline-flex flex-none cursor-pointer items-center gap-[5px] rounded-[9px] border border-[var(--cs-line-strong)] bg-[var(--cs-card)] px-[11px] py-[6px] text-[11.5px] font-semibold text-[var(--cs-ink)] outline-none transition-colors hover:border-[var(--cs-violet)] hover:text-[var(--cs-violet)]"
                            >
                                View patient <ExternalLink size={12} />
                            </button>
                        )}
                    </div>

                    {/* The thread. The tinted ground is the one real WhatsApp
                        borrowing — it is what makes bubbles read as bubbles
                        rather than as cards. */}
                    {/* Bottom-anchored via a `margin-top: auto` SPACER, not
                        `justify-content: flex-end` on the scroll container
                        itself — those look identical for a short thread but
                        are NOT the same once it overflows. `justify-end` is
                        "unsafe" alignment per the box-alignment spec: when
                        content is taller than the container, the OVERFLOW
                        happens on the far side from the alignment (the top,
                        here) and is genuinely unreachable by scrolling —
                        `scrollHeight` stays equal to `clientHeight` and every
                        message above whatever fits is just gone. Measured
                        live 2026-09-12 with a 30-message thread: 36 bubbles
                        in the DOM, container reporting zero scrollable
                        overflow, only the last handful ever visible. A plain
                        margin-auto spacer produces the same "sits at the
                        bottom when short" look but collapses to nothing the
                        moment real content is taller than the box, leaving
                        ordinary (reachable) top-anchored overflow. */}
                    <div ref={threadScrollRef} className="flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto bg-[#f7f8fa] px-[16px] py-[13px]">
                        <div className="mt-auto" aria-hidden="true" />
                        {focus && (
                            <DeliveryTimeline focus={focus} />
                        )}

                        {thread?.messages.map((m) => {
                            const out = m.direction === "outbound";
                            const state = deliveryStateOf(m.status);
                            const Icon = STATE_STYLE[state].icon;
                            const timeRow = (extraPad?: boolean) => (
                                <span className={`flex items-center gap-[4px] self-end text-[9.5px] text-[var(--cs-faint)]${extraPad ? " px-[2px]" : ""}`}>
                                    {clockTime(m.created_at)}
                                    {out && <Icon size={11} className={STATE_STYLE[state].text} />}
                                </span>
                            );

                            // The real template, not a paraphrase — Anmol,
                            // 2026-09-08: "the chat preview... should be the
                            // exact replica of what message has been sent."
                            // This mirrors `en_prescription_ready03` (approved
                            // 2026-09-09) component for component: header carries
                            // the patient name, body reads "from {doctor}" with
                            // no baked-in "Dr." (the value carries it), footer
                            // is its own line. `body_preview` stays the plain
                            // activity-feed summary elsewhere on this page.
                            if (out && m.purpose === "prescription") {
                                const rawDoc = (m.doctor_id && doctorNameById.get(m.doctor_id)) || "";
                                const doctorName = formatDoctorName(rawDoc) || "your doctor";
                                const clinicName = hospital?.name || "your clinic";
                                return (
                                    <div key={m.id} className="flex max-w-[76%] flex-none flex-col gap-[3px] self-end">
                                        <WhatsAppTemplatePreview
                                            header={`Hi ${name || "there"}, Your Prescription is Ready`}
                                            body={
                                                <>Your prescription from <strong>{doctorName}</strong> is ready to view or download.
                                                {"\n\n"}If you have any questions or need any help with your prescription, we&rsquo;re just a message away
                                                {"\n\n"}With care, <strong>{clinicName}</strong>. {"❤️‍🩹"}
                                                {"\n"}Thanks You!</>
                                            }
                                            footer="Handled Securely by Arenode."
                                            button="View Prescription"
                                            onButtonClick={m.prescription_id ? () => setViewingRxId(m.prescription_id) : undefined}
                                        />
                                        {timeRow(true)}
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={m.id}
                                    className={
                                        "flex max-w-[76%] flex-none flex-col gap-[3px] px-[11px] py-[8px] shadow-[0_1px_1px_rgba(16,28,46,0.06)] " +
                                        (out
                                            ? "self-end rounded-[12px] rounded-br-[3px] bg-[#e7f7ee]"
                                            : "self-start rounded-[12px] rounded-bl-[3px] bg-white")
                                    }
                                >
                                    <span className="text-[12px] leading-[1.45] text-[var(--cs-ink)]">
                                        {m.body_preview || `[${m.message_type}]`}
                                    </span>
                                    {timeRow()}
                                </div>
                            );
                        })}

                        {!thread && focus && (
                            <p className="m-0 rounded-[10px] bg-white px-[11px] py-[9px] text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                                Nothing has come back from this patient on WhatsApp yet.
                            </p>
                        )}
                    </div>

                    {/* Honest about the gap rather than a dead text box. */}
                    <div className="flex flex-none items-start gap-[8px] border-t border-[var(--cs-line)] bg-[var(--cs-card)] px-[16px] py-[10px]">
                        <MessageSquare size={13} className="mt-[2px] flex-none text-[var(--cs-violet)]" />
                        <span className="flex flex-col gap-[1px]">
                            <span className="text-[11.5px] font-semibold text-[var(--cs-violet)]">
                                Replying to patients from AREN is coming soon.
                            </span>
                            <span className="text-[10.5px] leading-[1.45] text-[var(--cs-faint)]">
                                {thread?.canReply
                                    ? `For now, reply from WhatsApp on your phone — the free-reply window closes in ${formatReplyWindow(thread.replyWindowRemainingMs)}.`
                                    : "WhatsApp only allows a free reply within 24 hours of the patient's last message."}
                            </span>
                        </span>
                    </div>
                </>
            )}
        </Panel>

        {/* Consult's exact review/print pipeline, opened read-only — the
            same door Print RX's reprint uses, never a second renderer
            (standing rule 6). See `PrescriptionPreviewModal`'s own header
            for the skeleton-shell reasoning. */}
        <PrescriptionPreviewModal
            prescriptionId={viewingRxId}
            hospital={hospital}
            onClose={() => setViewingRxId(null)}
        />
        </>
    );
}

/**
 * Sent → Delivered → Read, for the one message the doctor clicked.
 *
 * Only the steps actually REACHED are ticked, and a step carries a time only
 * where we have one. Meta reports each state as a separate webhook that
 * overwrites `updated_at`, so the row knows when it was sent and when it last
 * moved — not when each intermediate step happened. Printing three plausible
 * timestamps from two real ones would be inventing evidence about whether a
 * prescription reached a patient, which is the last thing on this page worth
 * guessing at.
 */
function DeliveryTimeline({ focus }: { focus: MessageActivity }) {
    if (focus.state === "failed") {
        return (
            <div className="flex flex-none flex-col gap-[4px] rounded-[10px] border border-[var(--cs-red)] bg-[var(--cs-red-soft)] px-[11px] py-[9px]">
                <span className="flex items-center gap-[6px] text-[12px] font-bold text-[var(--cs-red)]">
                    <XCircle size={13} /> Not delivered
                </span>
                <span className="text-[11px] leading-[1.45] text-[var(--cs-red)]">
                    {focus.errorDetail || "WhatsApp could not deliver this message."} Your credit was refunded.
                </span>
            </div>
        );
    }

    const reached = { sent: true, delivered: focus.state === "delivered" || focus.state === "read", read: focus.state === "read" };
    const steps = [
        { key: "sent", label: "Sent", at: focus.createdAt, on: reached.sent },
        { key: "delivered", label: "Delivered", at: reached.delivered && !reached.read ? focus.updatedAt : null, on: reached.delivered },
        { key: "read", label: "Read", at: reached.read ? focus.updatedAt : null, on: reached.read },
    ] as const;

    return (
        <div className="flex flex-none items-center gap-[2px] rounded-[10px] border border-[var(--cs-line)] bg-white px-[12px] py-[9px]">
            {steps.map((s, i) => (
                <span key={s.key} className="flex flex-1 items-center gap-[2px]">
                    <span className="flex items-center gap-[6px]">
                        <span
                            className={
                                "grid h-[19px] w-[19px] flex-none place-items-center rounded-full " +
                                (s.on ? "bg-[var(--cs-green)] text-white" : "border border-[var(--cs-line-strong)] bg-white text-[var(--cs-faint)]")
                            }
                        >
                            {s.on ? <Check size={11} /> : <Clock size={10} />}
                        </span>
                        <span className="flex flex-col leading-[1.15]">
                            <span className={`text-[11px] font-semibold ${s.on ? "text-[var(--cs-ink)]" : "text-[var(--cs-faint)]"}`}>
                                {s.label}
                            </span>
                            <span className="text-[9.5px] tabular-nums text-[var(--cs-faint)]">
                                {s.at ? clockTime(s.at) : s.on ? "" : "—"}
                            </span>
                        </span>
                    </span>
                    {i < steps.length - 1 && (
                        <span className={`mx-[4px] h-px flex-1 ${steps[i + 1].on ? "bg-[var(--cs-green)]" : "bg-[var(--cs-line)]"}`} />
                    )}
                </span>
            ))}
        </div>
    );
}
