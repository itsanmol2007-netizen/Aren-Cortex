// ---------------------------------------------------------------------------
// COMMUNICATION — V1.
//
// What the doctor does here: sees that their prescriptions and follow-ups
// reached patients, reads what patients wrote back, and keeps enough credits
// to keep doing both. That is the whole page. It is deliberately NOT a
// WhatsApp CRM, and the two things that would make it one — composing a
// message, and managing templates — are absent on purpose.
//
// ── Why there is no "send" button anywhere on this page
//
// Every message AREN sends is triggered by clinical work, not by this screen:
// a prescription goes out when a consultation is completed, a follow-up when
// one falls due. A send button here would invite a doctor to message a
// patient with no prescription attached, which is a different product. So
// this page is a mirror of what the system did, and its only actions are
// "look at this" and "buy more credits".
//
// Replying is absent for a different reason, stated in the UI rather than
// hidden: Meta only accepts a free-form reply within 24 hours of the
// patient's last message, and a text box that silently cannot send outside
// that window is worse than an honest note. See docs/whatsapp-two-way.md.
//
// ── The three regions, in the order they earn their place
//
// 1. **Credits, at the top.** Not vanity: at zero, nothing on this page works
//    any more, and a doctor should learn that from a header rather than from
//    a prescription that quietly never arrived.
// 2. **Appointment requests**, when any exist — the only part of this page
//    with work attached. Somebody is waiting for an answer.
// 3. **Activity and the conversation**, side by side. The list says what was
//    sent; the panel says what happened to one of them.
//
// Tailwind on `--cs-*` tokens, per design-DNA §0a. The old `communication.css`
// went with the old layout — this is a different page, not a restyle.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
    AlertTriangle, CalendarClock, Check, CheckCheck, Clock, ExternalLink,
    FileText, MessageSquare, RefreshCw, Search, Send, Sparkles,
    Wallet, X, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { CommunicationArt } from "../../components/PlaceholderArt";
import { Card, EmptyBlock, RowText, SkeletonRows } from "../clinic/ui";
import { BuyCreditsModal } from "./BuyCreditsModal";
import {
    DELIVERY_LABEL, deliveryStateOf, fetchAppointmentRequests, fetchMessageActivity,
    fetchWhatsAppThreads, formatReplyWindow, formatWhatsAppPhone, purposeLabel,
    setAppointmentRequestStatus,
    type AppointmentRequest, type DeliveryState, type MessageActivity,
    type WhatsAppThread,
} from "../../lib/db/whatsapp";
import {
    LOW_CREDIT_THRESHOLD, fetchCreditBalance, fetchRechargeRequests, formatCredits,
    type CreditBalance, type RechargeRequest,
} from "../../lib/db/messaging";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    hospitalId: string | null;
    doctorId: string | null;
    userId: string | null;
    /** Hands a patient's name to the Patients page's search box. There is no
     *  deep link to a patient record in this app, and inventing one for this
     *  button would mean threading a fetch through PatientsPage's whole list
     *  state — so the doctor lands on the search already filled in, one click
     *  from the record, rather than in an unrelated list. */
    onViewPatient: (query: string) => void;
}

/** "2:45 pm" today, "4 Sep" before that. The two things a reader of a message
 *  list actually wants — never a full timestamp on every row. */
function shortTime(iso: string): string {
    const at = new Date(iso);
    const isToday = new Date().toDateString() === at.toDateString();
    return isToday
        ? at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()
        : at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fullTime(iso: string): string {
    return new Date(iso).toLocaleString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    });
}

const DAY_COPY: Record<string, string> = {
    today: "Today", tomorrow: "Tomorrow", week: "This week",
};

// ── Delivery status pill ───────────────────────────────────────────────────
//
// Four states, four colours, from the existing seven. Read (green) sits above
// delivered (blue) sits above sent (slate) — the ladder reads as progress at
// a glance, which is the only question this pill answers.

const STATE_STYLE: Record<DeliveryState, { cls: string; icon: typeof Check }> = {
    pending: { cls: "bg-[#f1f5f9] text-[#475569]", icon: Clock },
    sent: { cls: "bg-[#f1f5f9] text-[#475569]", icon: Check },
    delivered: { cls: "bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]", icon: CheckCheck },
    read: { cls: "bg-[var(--cs-green-soft)] text-[var(--cs-green)]", icon: CheckCheck },
    failed: { cls: "bg-[var(--cs-red-soft)] text-[var(--cs-red)]", icon: XCircle },
};

function StatusPill({ state }: { state: DeliveryState }) {
    const { cls, icon: Icon } = STATE_STYLE[state];
    return (
        <span className={`inline-flex flex-none items-center gap-[3px] rounded-full px-[7px] py-[2px] text-[10px] font-bold ${cls}`}>
            <Icon size={10} /> {DELIVERY_LABEL[state]}
        </span>
    );
}

type Tab = "activity" | "messages" | "templates";

const TABS: { key: Tab; label: string }[] = [
    { key: "activity", label: "Activity" },
    { key: "messages", label: "Patient messages" },
    { key: "templates", label: "Templates" },
];

export function CommunicationPage({
    logoRef, onOpenSidebar, hospitalId, doctorId, userId, onViewPatient,
}: Props) {
    const [tab, setTab] = useState<Tab>("activity");
    const [query, setQuery] = useState("");
    const [stateFilter, setStateFilter] = useState<DeliveryState | null>(null);

    const [activity, setActivity] = useState<MessageActivity[]>([]);
    const [threads, setThreads] = useState<WhatsAppThread[]>([]);
    const [requests, setRequests] = useState<AppointmentRequest[]>([]);
    const [credits, setCredits] = useState<CreditBalance | null>(null);
    const [recharges, setRecharges] = useState<RechargeRequest[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyRequestId, setBusyRequestId] = useState<number | null>(null);
    const [buyOpen, setBuyOpen] = useState(false);

    // Selection is by PHONE, not by index: a new message reorders both lists,
    // and an index would silently move the reader into someone else's
    // conversation mid-read. `focusMessageId` narrows that to one send within
    // the thread, so clicking an activity row lands on that message rather
    // than the newest one.
    const [activePhone, setActivePhone] = useState<string | null>(null);
    const [focusMessageId, setFocusMessageId] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!hospitalId) return;
        setError(null);
        try {
            // All five in flight together. They are independent reads, and
            // serialising them would make the page visibly assemble in stages
            // for no benefit.
            const [nextActivity, nextThreads, nextRequests, nextCredits, nextRecharges] =
                await Promise.all([
                    fetchMessageActivity(hospitalId, { doctorId }),
                    fetchWhatsAppThreads(hospitalId),
                    fetchAppointmentRequests(hospitalId),
                    doctorId ? fetchCreditBalance(doctorId) : Promise.resolve(null),
                    doctorId ? fetchRechargeRequests(doctorId) : Promise.resolve([]),
                ]);
            setActivity(nextActivity);
            setThreads(nextThreads);
            setRequests(nextRequests);
            setCredits(nextCredits);
            setRecharges(nextRecharges);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load messages");
        } finally {
            setLoading(false);
        }
    }, [hospitalId, doctorId]);

    useEffect(() => { void load(); }, [load]);

    const activeThread = useMemo(
        () => threads.find((t) => t.phone === activePhone) ?? null,
        [threads, activePhone]
    );
    const focusMessage = useMemo(
        () => activity.find((a) => a.id === focusMessageId) ?? null,
        [activity, focusMessageId]
    );

    const pendingRecharge = useMemo(
        () => recharges.find((r) => r.status === "pending") ?? null,
        [recharges]
    );

    // ── Filtering ──────────────────────────────────────────────────────────
    const needle = query.trim().toLowerCase();
    const visibleActivity = useMemo(
        () => activity.filter((a) => {
            if (stateFilter && a.state !== stateFilter) return false;
            if (!needle) return true;
            return (a.patientName ?? "").toLowerCase().includes(needle)
                || a.phone.includes(needle)
                || purposeLabel(a.purpose).toLowerCase().includes(needle);
        }),
        [activity, stateFilter, needle]
    );
    const visibleThreads = useMemo(
        () => threads.filter((t) => {
            if (!needle) return true;
            return (t.patientName ?? "").toLowerCase().includes(needle) || t.phone.includes(needle);
        }),
        [threads, needle]
    );

    const handleRequest = useCallback(
        async (request: AppointmentRequest, status: "confirmed" | "declined") => {
            setBusyRequestId(request.id);
            // Optimistic: the row leaves the queue immediately, and is put
            // back if the write fails. A confirm that appears to do nothing
            // for a second gets pressed twice.
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

    const selectActivity = (row: MessageActivity) => {
        setActivePhone(row.phone);
        setFocusMessageId(row.id);
    };

    const balance = credits?.balance ?? 0;
    const creditState: DeliveryState | "ok" = balance <= 0
        ? "failed"
        : balance < LOW_CREDIT_THRESHOLD ? "pending" : "ok";

    return (
        <div className="relative flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Communication"
                subtitle="Prescriptions, follow-ups and patient replies"
                rightSlot={
                    <button type="button" className="ws-stat-pill" onClick={() => void load()} disabled={loading}>
                        <span className="ws-stat-icon">
                            <RefreshCw size={12} className={loading ? "animate-spin" : undefined} />
                        </span>
                        <span className="ws-stat-text">
                            <span className="ws-stat-value">Refresh</span>
                            <span className="ws-stat-label">messages</span>
                        </span>
                    </button>
                }
            />

            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[56px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {error && (
                    <div className="flex items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-red)] bg-[var(--cs-red-soft)] px-[14px] py-[10px] text-[12px] font-medium text-[var(--cs-red)]">
                        {error}
                        <button type="button" className="ml-auto font-bold underline" onClick={() => void load()}>
                            Try again
                        </button>
                    </div>
                )}

                {/* ── Credits ──────────────────────────────────────────────
                    One strip, three facts: the channel works, what you have
                    left, and how to get more. It changes colour rather than
                    growing a second banner — the warning IS this row, so a
                    doctor never has to reconcile two statements about the
                    same number. */}
                <section
                    className={
                        "flex flex-wrap items-center gap-x-[22px] gap-y-[10px] rounded-[var(--cs-radius)] border px-[16px] py-[12px] shadow-[var(--cs-shadow)] " +
                        (creditState === "failed"
                            ? "border-[var(--cs-red)] bg-[var(--cs-red-soft)]"
                            : creditState === "pending"
                                ? "border-[var(--cs-amber)] bg-[var(--cs-amber-soft)]"
                                : "border-[var(--cs-line)] bg-[var(--cs-card)]")
                    }
                >
                    <span className="flex flex-none items-center gap-[7px]">
                        <span className="grid h-[26px] w-[26px] place-items-center rounded-[8px] bg-[var(--cs-green-soft)] text-[var(--cs-green)]">
                            <MessageSquare size={14} />
                        </span>
                        <span className="flex flex-col">
                            <span className="text-[12.5px] font-bold text-[var(--cs-ink)]">WhatsApp</span>
                            <span className="text-[10.5px] font-semibold text-[var(--cs-green)]">Connected</span>
                        </span>
                    </span>

                    <span className="h-[26px] w-px flex-none bg-[var(--cs-line)]" />

                    <span className="flex min-w-0 flex-col">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                            Message credits
                        </span>
                        <span className="flex items-baseline gap-[7px]">
                            <span className={`text-[23px] font-bold leading-[1.1] tabular-nums ${creditState === "failed" ? "text-[var(--cs-red)]" : creditState === "pending" ? "text-[var(--cs-amber)]" : "text-[var(--cs-ink)]"}`}>
                                {credits ? formatCredits(balance) : "—"}
                            </span>
                            {credits && (
                                <span className="text-[11px] text-[var(--cs-faint)] tabular-nums">
                                    {formatCredits(credits.spent)} of {formatCredits(credits.granted)} used
                                </span>
                            )}
                        </span>
                    </span>

                    {/* Subtle, and only when it is true. */}
                    {creditState !== "ok" && (
                        <span className={`flex items-center gap-[5px] text-[11.5px] font-semibold ${creditState === "failed" ? "text-[var(--cs-red)]" : "text-[var(--cs-amber)]"}`}>
                            <AlertTriangle size={13} />
                            {creditState === "failed"
                                ? "Messaging credits exhausted. Recharge to continue sending messages."
                                : `Low messaging credits — ${formatCredits(balance)} remaining.`}
                        </span>
                    )}

                    {pendingRecharge && (
                        <span className="flex items-center gap-[5px] text-[11.5px] font-medium text-[var(--cs-muted)]">
                            <Clock size={13} />
                            Recharge {pendingRecharge.reference} submitted — we'll be in touch.
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={() => setBuyOpen(true)}
                        disabled={!doctorId}
                        className={
                            "ml-auto flex flex-none cursor-pointer items-center gap-[6px] rounded-full border-0 bg-[var(--cs-violet)] " +
                            "px-[16px] py-[8px] text-[12px] font-bold text-white outline-none transition-opacity " +
                            "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                        }
                    >
                        <Wallet size={13} /> Buy credits
                    </button>
                </section>

                {/* ── Appointment requests ─────────────────────────────────
                    Above the inbox because it is the only part of this page a
                    clinic OWES somebody an answer to. Buried inside a thread
                    it would mean scrolling to find out whether anyone is
                    waiting. */}
                {requests.length > 0 && (
                    <Card
                        tone="teal"
                        icon={<CalendarClock size={14} />}
                        title="Appointment requests"
                        subtitle={`${requests.length} waiting for a reply`}
                        foot={
                            <p className="m-0 text-[11px] leading-[1.5] text-[var(--cs-faint)]">
                                Confirming records your decision — it does not add the patient to
                                today's queue or send a time. Call them with the slot.
                            </p>
                        }
                    >
                        <div className="flex flex-col gap-[6px]">
                            {requests.map((r) => (
                                <div key={r.id} className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]">
                                    <RowText
                                        label={r.patientName ?? formatWhatsAppPhone(r.phone)}
                                        sub={`wants ${DAY_COPY[r.preferred_day ?? ""] ?? r.preferred_day ?? "a visit"}${r.preferred_date ? ` · ${r.preferred_date}` : ""} · ${shortTime(r.created_at)}`}
                                    />
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
                    </Card>
                )}

                {/* ── The two columns ──────────────────────────────────────── */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    <Card
                        tone="blue"
                        icon={<Send size={14} />}
                        title="Messages"
                        subtitle={
                            tab === "activity" ? "What AREN sent, and what happened to it"
                                : tab === "messages" ? "What patients wrote back"
                                    : "What each message says"
                        }
                        bodyClass="gap-[9px]"
                    >
                        <div className="flex flex-none items-center gap-[3px]">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    className={
                                        "cursor-pointer rounded-full border px-[10px] py-[3px] text-[10.5px] font-semibold outline-none transition-colors " +
                                        (tab === t.key
                                            ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]"
                                            : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                    }
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {tab !== "templates" && (
                            <>
                                <div className="relative flex-none">
                                    <Search
                                        size={12}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]"
                                    />
                                    <input
                                        type="search"
                                        value={query}
                                        placeholder="Search a patient or number"
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="h-[31px]! w-full rounded-[9px] border border-[var(--cs-line)] bg-[var(--cs-page)] pl-[27px]! pr-[9px]! text-[12px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-blue)]"
                                    />
                                </div>

                                {tab === "activity" && (
                                    <div className="flex flex-none flex-wrap items-center gap-[4px]">
                                        {([null, "sent", "delivered", "read", "failed"] as const).map((s) => (
                                            <button
                                                key={s ?? "all"}
                                                type="button"
                                                onClick={() => setStateFilter(s)}
                                                className={
                                                    "cursor-pointer rounded-full border px-[9px] py-[2px] text-[10px] font-semibold outline-none transition-colors " +
                                                    (stateFilter === s
                                                        ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]"
                                                        : "border-[var(--cs-line)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                                }
                                            >
                                                {s ? DELIVERY_LABEL[s] : "All"}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* The list owns its own scroll (`max-h` + overflow),
                            so a busy clinic's history cannot grow this card
                            without bound — layout-composition.md rule 10. */}
                        <div className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto max-h-[420px]">
                            {tab === "templates" ? (
                                <TemplatesTab />
                            ) : loading ? (
                                <SkeletonRows count={5} />
                            ) : tab === "activity" ? (
                                visibleActivity.length === 0 ? (
                                    <EmptyBlock
                                        art={activity.length === 0 ? <CommunicationArt /> : undefined}
                                        fact={activity.length === 0 ? "No messages sent yet" : "Nothing matches that"}
                                        next={
                                            activity.length === 0
                                                ? "Complete a consultation and the prescription goes out on WhatsApp automatically."
                                                : "Clear the search or pick a different status."
                                        }
                                    />
                                ) : (
                                    visibleActivity.map((row) => (
                                        <button
                                            key={row.id}
                                            type="button"
                                            onClick={() => selectActivity(row)}
                                            className={
                                                "flex w-full flex-none cursor-pointer items-center gap-[9px] rounded-[10px] border px-[9px] py-[7px] text-left outline-none transition-colors " +
                                                (focusMessageId === row.id
                                                    ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)]"
                                                    : "border-[var(--cs-line)] bg-[var(--cs-page)] hover:border-[var(--cs-line-strong)]")
                                            }
                                        >
                                            <RowText
                                                label={row.patientName ?? formatWhatsAppPhone(row.phone)}
                                                sub={`${purposeLabel(row.purpose)} · ${shortTime(row.createdAt)}`}
                                            />
                                            <span className="ml-auto"><StatusPill state={row.state} /></span>
                                        </button>
                                    ))
                                )
                            ) : visibleThreads.length === 0 ? (
                                <EmptyBlock
                                    art={threads.length === 0 ? <CommunicationArt /> : undefined}
                                    fact={threads.length === 0 ? "No patient replies yet" : "Nothing matches that"}
                                    next={
                                        threads.length === 0
                                            ? "When a patient replies to a prescription, their message appears here."
                                            : "Clear the search to see every conversation."
                                    }
                                />
                            ) : (
                                visibleThreads.map((t) => (
                                    <button
                                        key={t.phone}
                                        type="button"
                                        onClick={() => { setActivePhone(t.phone); setFocusMessageId(null); }}
                                        className={
                                            "flex w-full flex-none cursor-pointer flex-col gap-[2px] rounded-[10px] border px-[9px] py-[7px] text-left outline-none transition-colors " +
                                            (activePhone === t.phone && !focusMessageId
                                                ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)]"
                                                : "border-[var(--cs-line)] bg-[var(--cs-page)] hover:border-[var(--cs-line-strong)]")
                                        }
                                    >
                                        <span className="flex w-full items-baseline gap-[8px]">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                {t.patientName ?? formatWhatsAppPhone(t.phone)}
                                            </span>
                                            <span className="ml-auto flex-none text-[10px] text-[var(--cs-faint)]">
                                                {shortTime(t.lastMessage.created_at)}
                                            </span>
                                        </span>
                                        <span className="truncate text-[10.5px] leading-[1.4] text-[var(--cs-faint)]">
                                            {t.lastMessage.direction === "outbound" && "You: "}
                                            {t.lastMessage.body_preview || `[${t.lastMessage.message_type}]`}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </Card>

                    <ConversationPanel
                        thread={activeThread}
                        focus={focusMessage}
                        onViewPatient={onViewPatient}
                    />
                </div>

                {/* ── Coming soon ──────────────────────────────────────────
                    Small and quiet on purpose: it is a promise, not a
                    feature, and a full-weight card for something that does
                    nothing would compete with the parts that work. */}
                <div className="flex items-center gap-[9px] rounded-[var(--cs-radius)] border border-dashed border-[var(--cs-line-strong)] bg-transparent px-[14px] py-[10px]">
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
                />
            )}
        </div>
    );
}

// ── The right-hand panel ───────────────────────────────────────────────────

/**
 * One conversation, read top to bottom: who this is, what AREN sent them,
 * what happened to it, and what they said back.
 *
 * The focused message gets its own block ABOVE the transcript rather than
 * being highlighted inside it. "Did the prescription arrive" is a question
 * about one message's status, and answering it by asking the doctor to find
 * a highlighted bubble in a scroll is not answering it.
 */
function ConversationPanel({
    thread, focus, onViewPatient,
}: {
    thread: WhatsAppThread | null;
    focus: MessageActivity | null;
    onViewPatient: (query: string) => void;
}) {
    const name = thread?.patientName ?? focus?.patientName ?? null;
    const phone = thread?.phone ?? focus?.phone ?? null;

    return (
        <Card
            tone="violet"
            icon={<MessageSquare size={14} />}
            title={name ?? (phone ? formatWhatsAppPhone(phone) : "Conversation")}
            subtitle={phone ? formatWhatsAppPhone(phone) : "Pick a message on the left"}
            action={
                name && (
                    <button
                        type="button"
                        onClick={() => onViewPatient(name)}
                        className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-violet)] outline-none hover:underline"
                    >
                        View patient <ExternalLink size={11} />
                    </button>
                )
            }
        >
            {!thread && !focus ? (
                <EmptyBlock
                    fact="Nothing selected"
                    next="Choose a message or a conversation to see what happened to it."
                />
            ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-[9px]">

                    {focus && (
                        <div className="flex flex-none flex-col gap-[6px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
                            <div className="flex items-center gap-[7px]">
                                <FileText size={13} className="flex-none text-[var(--cs-violet)]" />
                                <span className="text-[12px] font-bold text-[var(--cs-ink)]">
                                    {purposeLabel(focus.purpose)}
                                </span>
                                <span className="ml-auto"><StatusPill state={focus.state} /></span>
                            </div>
                            <span className="text-[11px] text-[var(--cs-faint)] tabular-nums">
                                {fullTime(focus.createdAt)}
                            </span>
                            {focus.state === "failed" && focus.errorDetail && (
                                // The refund is stated here rather than left to
                                // the ledger: "it failed" without "and you were
                                // not charged" is the support call.
                                <span className="rounded-[8px] bg-[var(--cs-red-soft)] px-[8px] py-[6px] text-[11px] leading-[1.45] text-[var(--cs-red)]">
                                    Not delivered — {focus.errorDetail}. Your credit was refunded.
                                </span>
                            )}
                        </div>
                    )}

                    {thread ? (
                        <>
                            <div className="flex min-h-0 flex-1 flex-col gap-[6px] overflow-y-auto max-h-[300px]">
                                {thread.messages.map((m) => (
                                    <div
                                        key={m.id}
                                        className={
                                            "flex max-w-[80%] flex-none flex-col gap-[2px] rounded-[10px] px-[10px] py-[7px] " +
                                            (m.direction === "outbound"
                                                ? "self-end bg-[var(--cs-blue-soft)]"
                                                : "self-start bg-[#f1f5f9]")
                                        }
                                    >
                                        <span className="text-[11.5px] leading-[1.45] text-[var(--cs-ink)]">
                                            {m.body_preview || `[${m.message_type}]`}
                                        </span>
                                        <span className="text-[9.5px] text-[var(--cs-faint)]">
                                            {shortTime(m.created_at)}
                                            {m.direction === "outbound" && ` · ${DELIVERY_LABEL[deliveryStateOf(m.status)]}`}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Honest about the gap rather than a dead text
                                box. V1 does not let a doctor reply from AREN;
                                see the file header. */}
                            <p className="m-0 flex-none border-t border-[var(--cs-line)] pt-[7px] text-[11px] leading-[1.45] text-[var(--cs-faint)]">
                                {thread.canReply
                                    ? `Replying from AREN is coming next — for now, reply from WhatsApp. Free-reply window ${formatReplyWindow(thread.replyWindowRemainingMs)}.`
                                    : "WhatsApp only allows a free reply within 24 hours of the patient's last message."}
                            </p>
                        </>
                    ) : (
                        <EmptyBlock
                            fact="No reply yet"
                            next="Nothing has come back from this patient on WhatsApp."
                        />
                    )}
                </div>
            )}
        </Card>
    );
}

// ── Templates ──────────────────────────────────────────────────────────────

/**
 * Two templates, described in the doctor's words.
 *
 * Meta's template machinery — approval state, language codes, component
 * arrays, the name a template was re-approved under — is deliberately absent.
 * A doctor does not choose a template and cannot edit one; what they need to
 * know is what each message says and when it goes, which is exactly what this
 * shows.
 */
function TemplatesTab() {
    const templates = [
        {
            key: "prescription",
            icon: <FileText size={13} />,
            title: "Prescription",
            when: "Sent automatically when you complete a consultation.",
            body: "Hi {patient}, your prescription from {clinic} is attached. Get well soon.",
        },
        {
            key: "follow_up",
            icon: <CalendarClock size={13} />,
            title: "Follow-up",
            when: "Sent automatically when a follow-up you set falls due.",
            body: "Hi {patient}, this is a reminder about your follow-up at {clinic} on {date}.",
        },
    ];

    return (
        <div className="flex flex-col gap-[7px]">
            {templates.map((t) => (
                <div key={t.key} className="flex flex-none flex-col gap-[4px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px]">
                    <div className="flex items-center gap-[6px]">
                        <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]">
                            {t.icon}
                        </span>
                        <span className="text-[12px] font-bold text-[var(--cs-ink)]">{t.title}</span>
                        <span className="ml-auto rounded-full bg-[#f1f5f9] px-[7px] py-[2px] text-[10px] font-bold text-[#475569]">
                            1 credit
                        </span>
                    </div>
                    <span className="text-[11px] text-[var(--cs-faint)]">{t.when}</span>
                    <span className="rounded-[8px] bg-[var(--cs-card)] px-[8px] py-[6px] text-[11px] italic leading-[1.45] text-[var(--cs-muted)]">
                        {t.body}
                    </span>
                </div>
            ))}
            <p className="m-0 text-[11px] leading-[1.5] text-[var(--cs-faint)]">
                AREN keeps these approved and up to date with WhatsApp — there is nothing
                to set up.
            </p>
        </div>
    );
}
