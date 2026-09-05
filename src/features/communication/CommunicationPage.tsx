// ---------------------------------------------------------------------------
// COMMUNICATION — the WhatsApp inbox, and the appointment requests that come
// out of it.
//
// This page was a `ComingSoonPage`-shaped stub until 2026-09-04. What made it
// buildable was not new UI thinking but a migration: `whatsapp_messages` was
// service_role-only, so the browser saw zero rows no matter what was in it.
// Adding `hospital_id` plus a scoped SELECT policy is what turned "we have the
// data somewhere" into "the clinic can see its own conversations".
//
// ── Two things on one page, and why they belong together
//
// The requests strip sits ABOVE the inbox because it is the only part with
// work attached. A conversation is something you read; a pending request is
// something a clinic owes a patient an answer to, and burying that inside a
// thread would mean scrolling the inbox to find out whether anyone is waiting.
// Both come from the same WhatsApp conversation, so they share a page rather
// than making front desk check two.
//
// ── Why there is no composer yet
//
// Deliberate, and stated in the UI rather than hidden. Sending needs Meta
// credentials that cannot exist in a browser bundle, so a reply has to go
// through `server/` — which currently runs on a laptop behind ngrok, not
// anywhere a clinic could reach. Shipping a text box that throws on submit
// would be worse than an honest "read-only for now". The seam is one POST
// endpoint away; see docs/whatsapp-two-way.md.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
    CalendarClock, Check, Loader2, MessageSquare, RefreshCw, X,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { CommunicationArt } from "../../components/PlaceholderArt";
import {
    fetchAppointmentRequests, fetchWhatsAppThreads, formatReplyWindow,
    formatWhatsAppPhone, setAppointmentRequestStatus,
    type AppointmentRequest, type WhatsAppThread,
} from "../../lib/db/whatsapp";
import "./communication.css";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    hospitalId: string | null;
    userId: string | null;
}

/** "2:45 pm" for today, "4 Sep" for anything older — the two things a reader
 *  of a chat list actually wants, never a full timestamp on every row. */
function shortTime(iso: string): string {
    const at = new Date(iso);
    const isToday = new Date().toDateString() === at.toDateString();
    return isToday
        ? at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase()
        : at.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const DAY_COPY: Record<string, string> = {
    today: "Today",
    tomorrow: "Tomorrow",
    week: "This week",
};

export function CommunicationPage({ logoRef, onOpenSidebar, hospitalId, userId }: Props) {
    const [threads, setThreads] = useState<WhatsAppThread[]>([]);
    const [requests, setRequests] = useState<AppointmentRequest[]>([]);
    const [activePhone, setActivePhone] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyRequestId, setBusyRequestId] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!hospitalId) return;
        setError(null);
        try {
            // Both in flight together: the requests strip and the inbox are
            // independent reads, and serialising them would make the page
            // visibly assemble in two steps for no benefit.
            const [nextThreads, nextRequests] = await Promise.all([
                fetchWhatsAppThreads(hospitalId),
                fetchAppointmentRequests(hospitalId),
            ]);
            setThreads(nextThreads);
            setRequests(nextRequests);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load messages");
        } finally {
            setLoading(false);
        }
    }, [hospitalId]);

    useEffect(() => { void load(); }, [load]);

    // Keep the selection valid across refreshes by PHONE rather than by index:
    // a new message reorders the list, and an index would silently jump the
    // reader into someone else's conversation mid-read.
    const activeThread = useMemo(
        () => threads.find((t) => t.phone === activePhone) ?? null,
        [threads, activePhone]
    );

    const handleRequest = useCallback(
        async (request: AppointmentRequest, status: "confirmed" | "declined") => {
            setBusyRequestId(request.id);
            // Optimistic: the row leaves the queue immediately, and is put back
            // if the write fails. A confirm that appears to do nothing for a
            // second gets pressed twice.
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

    const headerAction = (
        <button type="button" className="comm-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? "comm-spin" : undefined} />
            Refresh
        </button>
    );

    return (
        <div className="comm-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Communication"
                subtitle="WhatsApp conversations, patient messages & follow-ups"
                rightSlot={headerAction}
            />

            <div className="comm-body">
                {error && (
                    <div className="comm-error">
                        {error}
                        <button type="button" onClick={() => void load()}>Try again</button>
                    </div>
                )}

                {requests.length > 0 && (
                    <section className="comm-requests">
                        <h3 className="comm-section-title">
                            <CalendarClock size={14} />
                            Appointment requests
                            <span className="comm-count">{requests.length}</span>
                        </h3>
                        <ul className="comm-request-list">
                            {requests.map((r) => (
                                <li key={r.id} className="comm-request">
                                    <div className="comm-request-who">
                                        <span className="comm-request-name">
                                            {r.patientName ?? formatWhatsAppPhone(r.phone)}
                                        </span>
                                        <span className="comm-request-meta">
                                            wants {DAY_COPY[r.preferred_day ?? ""] ?? r.preferred_day ?? "a visit"}
                                            {r.preferred_date ? ` · ${r.preferred_date}` : ""}
                                            {" · "}{shortTime(r.created_at)}
                                        </span>
                                    </div>
                                    <div className="comm-request-actions">
                                        <button
                                            type="button"
                                            className="comm-btn comm-btn-confirm"
                                            disabled={busyRequestId === r.id}
                                            onClick={() => void handleRequest(r, "confirmed")}
                                        >
                                            <Check size={13} /> Confirm
                                        </button>
                                        <button
                                            type="button"
                                            className="comm-btn comm-btn-decline"
                                            disabled={busyRequestId === r.id}
                                            onClick={() => void handleRequest(r, "declined")}
                                        >
                                            <X size={13} /> Decline
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <p className="comm-requests-note">
                            Confirming records your decision — it does not add the patient to
                            today's queue or send a time. Call them with the slot.
                        </p>
                    </section>
                )}

                {loading ? (
                    <div className="comm-loading">
                        <Loader2 size={18} className="comm-spin" />
                        Loading conversations…
                    </div>
                ) : threads.length === 0 ? (
                    <div className="comm-hero">
                        <CommunicationArt />
                        <h2 className="comm-hero-title">No WhatsApp messages yet</h2>
                        <p className="comm-hero-sub">
                            Once a patient replies to a prescription or messages the clinic's
                            WhatsApp number, every conversation appears here — one inbox,
                            instead of switching to a separate app.
                        </p>
                    </div>
                ) : (
                    <section className="comm-inbox">
                        <ul className="comm-threads">
                            {threads.map((t) => (
                                <li key={t.phone}>
                                    <button
                                        type="button"
                                        className={`comm-thread${t.phone === activePhone ? " is-active" : ""}`}
                                        onClick={() => setActivePhone(t.phone)}
                                    >
                                        <span className="comm-thread-top">
                                            <span className="comm-thread-name">
                                                {t.patientName ?? formatWhatsAppPhone(t.phone)}
                                            </span>
                                            <span className="comm-thread-time">
                                                {shortTime(t.lastMessage.created_at)}
                                            </span>
                                        </span>
                                        <span className="comm-thread-preview">
                                            {t.lastMessage.direction === "outbound" && "You: "}
                                            {t.lastMessage.body_preview || `[${t.lastMessage.message_type}]`}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <div className="comm-thread-view">
                            {!activeThread ? (
                                <div className="comm-thread-empty">
                                    <MessageSquare size={22} />
                                    <p>Select a conversation</p>
                                </div>
                            ) : (
                                <>
                                    <header className="comm-thread-header">
                                        <div>
                                            <div className="comm-thread-title">
                                                {activeThread.patientName ?? "Unknown patient"}
                                            </div>
                                            <div className="comm-thread-sub">
                                                {formatWhatsAppPhone(activeThread.phone)}
                                            </div>
                                        </div>
                                        {activeThread.canReply ? (
                                            <span className="comm-window comm-window-open">
                                                Reply window open · {formatReplyWindow(activeThread.replyWindowRemainingMs)}
                                            </span>
                                        ) : (
                                            <span className="comm-window comm-window-closed">
                                                Reply window closed
                                            </span>
                                        )}
                                    </header>

                                    <div className="comm-messages">
                                        {activeThread.messages.map((m) => (
                                            <div
                                                key={m.id}
                                                className={`comm-msg comm-msg-${m.direction}`}
                                            >
                                                <div className="comm-msg-body">
                                                    {m.body_preview || `[${m.message_type}]`}
                                                </div>
                                                <div className="comm-msg-meta">
                                                    {shortTime(m.created_at)}
                                                    {m.direction === "outbound" && ` · ${m.status}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Honest about the gap rather than a dead text box.
                                        See the file header for why sending isn't here. */}
                                    <footer className="comm-composer-note">
                                        {activeThread.canReply
                                            ? "Replying from here is coming next — for now, reply from WhatsApp on your phone."
                                            : "WhatsApp only allows a free reply within 24 hours of the patient's last message. After that, only an approved template can be sent."}
                                    </footer>
                                </>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
