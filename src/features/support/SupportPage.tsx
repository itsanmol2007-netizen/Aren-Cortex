// ---------------------------------------------------------------------------
// HELP & SUPPORT — the one place to ask AREN for something, and now the one
// place to hear back.
//
// Built 2026-09-11 as a request form; became a real two-way thread the same
// day, per Founder directive: "Communication between Master Control and
// Cortex must happen through the database, not email alone." A
// `support_requests` row is still filed exactly as before — through
// `support-notify`, resolved server-side, emailed to AREN — but it no longer
// ends there. `support_request_messages` is a conversation on top of it that
// both sides read and write, and this page is Cortex's half of it.
//
// Tailwind utility classes throughout, deliberately — this page used to carry
// its own `support.css` and every layout tweak meant round-tripping through a
// second file. Rewritten inline 2026-09-11 so nothing here needs a stylesheet
// to iterate on again.
//
// ── Two modes, one page ────────────────────────────────────────────────────
//   New request  — topic → affected areas → free text, exactly as it was.
//   My requests  — every ticket this clinic can see, and the thread on
//                   whichever one is open.
// A ticket filed just now shows up in the second mode immediately — `SentPanel`
// links straight into it — so "did that actually go anywhere" never has to be
// wondered about.
//
// ── Status is read-only here, on purpose ───────────────────────────────────
// `support_requests.status` belongs to Master Control (see
// `docs/admin-panel/SUPPORT-REQUESTS.md` — "status is yours, not the
// doctor's"). This page TRANSLATES it (`supportStatus.ts`) for a doctor to
// read; nothing here writes it, and nothing should.
//
// ── Credits are deliberately not here ─────────────────────────────────────
// Messaging credit recharges have their own flow on the Communication page,
// which knows the balance, the packages and the pending request. Duplicating
// it here would mean two ways to ask for the same thing, and one of them
// unable to see whether the other already did.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle, ArrowLeft, Check, Inbox, Loader2, Mail, MessageSquarePlus,
    Phone, Send, ShieldCheck,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { useClinicShape } from "../../hooks/useClinicShape";
import { sendSupportRequest } from "../../lib/db/messaging";
import {
    fetchMySupportTickets, fetchTicketMessages, sendDoctorReply,
    subscribeToMyTickets, subscribeToTicketMessages,
    type SupportMessage, type SupportTicket,
} from "../../lib/db/support";
import { SUPPORT_STATUS, isTicketActive } from "./supportStatus";
import { SUPPORT_TOPICS, collectDiagnostics, type SupportTopic } from "./supportTopics";

interface Props {
    /** `doctors.email` when we have one — prefills where a reply should go. */
    doctorEmail?: string | null;
    clinicName?: string | null;
}

const SUPPORT_EMAIL = "care@arenode.com";
const SUPPORT_PHONE_DISPLAY = "+91 95599 51905";
const SUPPORT_PHONE_TEL = "+919559951905";

type Mode = "new" | "tickets";

type SendStatus =
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; reference: string | null }
    | { kind: "error"; message: string };

export function SupportPage({ doctorEmail, clinicName }: Props) {
    const [mode, setMode] = useState<Mode>("new");
    /* Set by `SentPanel`'s "View this request" — carries the doctor straight
       from filing a ticket into its own thread, rather than back to a list
       they'd have to scan for the one they just sent. */
    const [openTicketId, setOpenTicketId] = useState<number | null>(null);

    // A live count on the tab itself, independent of whether "My requests" is
    // even open — the same reason a mail client badges its inbox instead of
    // making you open it to find out. Zero DB cost beyond what TicketsView
    // already pays: it owns the one list fetch/subscription and reports its
    // count up, rather than this component polling a second copy.
    const [activeCount, setActiveCount] = useState<number | null>(null);

    return (
        // NO `overflow-hidden` HERE — it used to live on this root, and it is
        // why the header scrolled away with the page ("the top header should
        // remain consistent", Anmol, 2026-09-11): `WorkspaceHeader` is
        // `position: sticky`, and ANY ancestor with non-visible overflow
        // becomes a sticky descendant's reference scrollport per spec,
        // whether or not that ancestor itself ever visibly scrolls. This root
        // doesn't need it anyway — every mode below (`NewRequestForm`,
        // `TicketsView`) already bounds and scrolls its own content
        // (`flex-1 overflow-y-auto`/`min-h-0`), so nothing here relied on the
        // root clipping anything. Same bug, same fix as `.prac-page` in
        // practice.css.
        <div className="flex h-dvh flex-col bg-[#f0f2f7]">
            <WorkspaceHeader
                title="Help & Support"
                subtitle={mode === "new" ? "Tell us what you need — a real person reads every one" : "Your clinic's requests, and our replies"}
            />

            <div className="mx-auto mt-[18px] flex w-fit flex-shrink-0 gap-[3px] rounded-[11px] border border-[#e6e8f0] bg-[#eef0f6] p-[3px]">
                <button
                    type="button"
                    onClick={() => setMode("new")}
                    className={
                        "flex h-8 items-center gap-[7px] rounded-[8px] px-[14px] text-[12.5px] font-bold transition-colors " +
                        (mode === "new" ? "bg-white text-[#1268e8] shadow-[0_1px_4px_rgba(20,30,50,0.10)]" : "text-[#6b7385] hover:text-[#3b4356]")
                    }
                >
                    <MessageSquarePlus size={14} /> New request
                </button>
                <button
                    type="button"
                    onClick={() => setMode("tickets")}
                    className={
                        "flex h-8 items-center gap-[7px] rounded-[8px] px-[14px] text-[12.5px] font-bold transition-colors " +
                        (mode === "tickets" ? "bg-white text-[#1268e8] shadow-[0_1px_4px_rgba(20,30,50,0.10)]" : "text-[#6b7385] hover:text-[#3b4356]")
                    }
                >
                    <Inbox size={14} /> My requests
                    {activeCount != null && activeCount > 0 && (
                        <span
                            className={
                                "grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[10px] font-extrabold text-white " +
                                (mode === "tickets" ? "bg-[#1268e8]" : "bg-[#c9791a]")
                            }
                        >
                            {activeCount}
                        </span>
                    )}
                </button>
            </div>

            {mode === "new" ? (
                <NewRequestForm
                    doctorEmail={doctorEmail}
                    clinicName={clinicName}
                    onSent={(id) => {
                        setOpenTicketId(id);
                        setMode("tickets");
                    }}
                />
            ) : (
                <TicketsView openTicketId={openTicketId} onCountChange={setActiveCount} />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW REQUEST — topic → affected areas → free text. Unchanged in substance
// from the original single-mode page; only `onSent` is new, carrying the
// fresh ticket's id up so the page can jump straight to its thread.
// ═══════════════════════════════════════════════════════════════════════════

function NewRequestForm({
    doctorEmail, clinicName, onSent,
}: {
    doctorEmail?: string | null;
    clinicName?: string | null;
    onSent: (ticketId: number) => void;
}) {
    const identity = useClinicalIdentity();
    const clinic = useClinicShape();

    const [topicId, setTopicId] = useState<string | null>(null);
    const [areas, setAreas] = useState<string[]>([]);
    const [message, setMessage] = useState("");
    const [replyTo, setReplyTo] = useState(doctorEmail ?? "");
    const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

    /* How long the send has been going, so the page can say something true
       about it. See `SendingProgress` for why this exists at all. */
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (status.kind !== "sending") return;
        const started = Date.now();
        setElapsed(0);
        const tick = window.setInterval(() => setElapsed(Date.now() - started), 120);
        return () => window.clearInterval(tick);
    }, [status.kind]);

    const topic = useMemo<SupportTopic | null>(
        () => SUPPORT_TOPICS.find((t) => t.id === topicId) ?? null,
        [topicId]
    );

    // A topic alone is enough for the two that are self-explanatory
    // ("Billing or my plan" says everything a first reply needs). The rest
    // genuinely cannot be answered without words, so the button stays
    // disabled rather than sending AREN an email that only says its own
    // subject line.
    const canSend =
        topic !== null &&
        status.kind !== "sending" &&
        (!topic.requiresMessage || message.trim().length >= 10);

    const toggleArea = (area: string) =>
        setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));

    async function handleSend() {
        if (!topic || !canSend) return;
        setStatus({ kind: "sending" });
        try {
            const { reference } = await sendSupportRequest({
                topic: topic.label,
                areas,
                message: message.trim(),
                replyTo: replyTo.trim(),
                diagnostics: collectDiagnostics({
                    Workspace: `AREN ${clinic.brand.product}`,
                    "Clinic shape": clinic.frontDesk
                        ? (clinic.multiDoctor ? "Multi-bench clinic" : "Single bench, front desk")
                        : "Solo practice",
                    Specialty: identity.specialization,
                }),
            });
            setStatus({ kind: "sent", reference });
        } catch (e) {
            setStatus({
                kind: "error",
                message: e instanceof Error ? e.message : "Something went wrong sending that.",
            });
        }
    }

    function startOver() {
        setTopicId(null);
        setAreas([]);
        setMessage("");
        setStatus({ kind: "idle" });
    }

    // `SR_41` → `41`. The reference is a display string; the thread view
    // needs the bare id. Parsed here rather than having `sendSupportRequest`
    // return two shapes of the same fact.
    const sentId = status.kind === "sent" && status.reference
        ? Number(status.reference.replace(/^SR_/, ""))
        : null;

    return (
        <div className="mx-auto min-h-0 w-full max-w-[720px] flex-1 flex-col gap-[22px] overflow-y-auto px-5 pt-[34px] pb-10 flex">
            {status.kind === "sent" ? (
                <SentPanel
                    onAnother={startOver}
                    replyTo={replyTo.trim()}
                    reference={status.reference}
                    onView={sentId != null ? () => onSent(sentId) : undefined}
                />
            ) : (
                <div className="flex flex-col gap-[26px] rounded-2xl border border-[#e6e8f0] bg-white px-[26px] pt-[26px] pb-7 shadow-[0_1px_2px_rgba(20,30,50,0.04),0_10px_30px_rgba(20,30,50,0.035)]">
                    {/* ── 1. the topic ──────────────────────────────── */}
                    <section className="flex flex-col gap-[13px]">
                        <header className="flex items-start gap-[11px]">
                            <span className="mt-px grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-[7px] bg-[#1268e8]/10 text-[11.5px] font-extrabold text-[#1268e8]">1</span>
                            <div>
                                <h2 className="m-0 text-[15px] font-bold normal-case tracking-[-0.01em] text-[#1c2333]">What's this about?</h2>
                                <p className="mt-[3px] mb-0 text-[12.5px] leading-[1.5] text-[#79819a]">Pick the closest one — the last option is there for everything else.</p>
                            </div>
                        </header>

                        <div className="grid grid-cols-2 gap-[9px] max-[720px]:grid-cols-1">
                            {SUPPORT_TOPICS.map((t, i) => {
                                const Icon = t.icon;
                                const on = t.id === topicId;
                                const isLast = i === SUPPORT_TOPICS.length - 1;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            setTopicId(t.id);
                                            setAreas([]);
                                            if (status.kind === "error") setStatus({ kind: "idle" });
                                        }}
                                        aria-pressed={on}
                                        className={
                                            "flex items-center gap-[11px] rounded-[13px] border p-3 px-[13px] text-left transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(18,104,232,0.22)] " +
                                            (isLast ? "col-span-2 max-[720px]:col-span-1 " : "") +
                                            (on
                                                ? "border-[#1268e8] bg-[#1268e8]/[0.045] shadow-[0_0_0_1px_#1268e8,0_4px_14px_rgba(18,104,232,0.12)]"
                                                : "border-[#e6e8f0] bg-[#fcfcfe] hover:border-[#c9d3e6] hover:bg-white")
                                        }
                                    >
                                        <span
                                            className={
                                                "grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] transition-colors " +
                                                (on
                                                    ? "bg-gradient-to-br from-[#4b91f7] to-[#1268e8] text-white shadow-[0_3px_9px_rgba(18,104,232,0.30)]"
                                                    : "bg-[#1268e8]/[0.08] text-[#3b7ae0]")
                                            }
                                        >
                                            <Icon size={17} />
                                        </span>
                                        <span className="flex min-w-0 flex-col gap-[2px]">
                                            <span className="text-[13px] font-bold text-[#232a3b]">{t.label}</span>
                                            <span className="text-[11.5px] leading-[1.35] text-[#858da3]">{t.hint}</span>
                                        </span>
                                        <span
                                            className={
                                                "ml-auto grid h-[19px] w-[19px] flex-shrink-0 place-items-center rounded-full bg-[#1268e8] text-white transition-all " +
                                                (on ? "scale-100 opacity-100" : "scale-[0.6] opacity-0")
                                            }
                                        >
                                            <Check size={13} strokeWidth={3} />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* ── 2. which area (faults only) ───────────────── */}
                    {topic?.areas && (
                        <section className="flex flex-col gap-[13px]">
                            <header className="flex items-start gap-[11px]">
                                <span className="mt-px grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-[7px] bg-[#1268e8]/10 text-[11.5px] font-extrabold text-[#1268e8]">2</span>
                                <div>
                                    <h2 className="m-0 text-[15px] font-bold normal-case tracking-[-0.01em] text-[#1c2333]">Which part of AREN?</h2>
                                    <p className="mt-[3px] mb-0 text-[12.5px] leading-[1.5] text-[#79819a]">Pick as many as apply, or skip this if you're not sure.</p>
                                </div>
                            </header>

                            <div className="flex flex-wrap gap-[7px]">
                                {topic.areas.map((a) => {
                                    const on = areas.includes(a);
                                    return (
                                        <button
                                            key={a}
                                            type="button"
                                            onClick={() => toggleArea(a)}
                                            aria-pressed={on}
                                            className={
                                                "rounded-full border px-[13px] py-[7px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(18,104,232,0.22)] " +
                                                (on
                                                    ? "border-transparent bg-gradient-to-br from-[#4b91f7] to-[#1268e8] text-white shadow-[0_3px_10px_rgba(18,104,232,0.26)]"
                                                    : "border-[#e0e4ef] bg-white text-[#5a6379] hover:border-[#bfcbe2] hover:text-[#2f3748]")
                                            }
                                        >
                                            {a}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── 3. their own words ────────────────────────── */}
                    {topic && (
                        <section className="flex flex-col gap-[13px]">
                            <header className="flex items-start gap-[11px]">
                                <span className="mt-px grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-[7px] bg-[#1268e8]/10 text-[11.5px] font-extrabold text-[#1268e8]">{topic.areas ? 3 : 2}</span>
                                <div>
                                    <h2 className="m-0 text-[15px] font-bold normal-case tracking-[-0.01em] text-[#1c2333]">{topic.prompt}</h2>
                                    <p className="mt-[3px] mb-0 text-[12.5px] leading-[1.5] text-[#79819a]">
                                        {topic.requiresMessage
                                            ? "As much or as little as you like — whatever you'd tell a colleague."
                                            : "Optional. Add anything that would help us answer faster."}
                                    </p>
                                </div>
                            </header>

                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Type here…"
                                rows={6}
                                autoFocus
                                className="box-border w-full resize-y rounded-xl border border-[#e0e4ef] bg-[#fcfcfe] px-[14px] py-[13px] text-[13.5px] leading-[1.6] text-[#232a3b] transition-colors placeholder:text-[#a8afc0] focus:border-[#1268e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(18,104,232,0.14)] focus:outline-none"
                                style={{ minHeight: 120 }}
                            />

                            <div className="flex items-center gap-[10px]">
                                <label htmlFor="supp-reply-to" className="flex-shrink-0 text-[12.5px] font-bold text-[#5a6379]">Reply to</label>
                                <input
                                    id="supp-reply-to"
                                    type="email"
                                    value={replyTo}
                                    onChange={(e) => setReplyTo(e.target.value)}
                                    placeholder="your@email.com"
                                    autoComplete="email"
                                    className="min-w-0 flex-1 rounded-[10px] border border-[#e0e4ef] bg-[#fcfcfe] px-3 py-[9px] text-[13px] text-[#232a3b] transition-colors focus:border-[#1268e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(18,104,232,0.14)] focus:outline-none"
                                />
                            </div>

                            {status.kind === "sending" ? (
                                <SendingProgress elapsed={elapsed} />
                            ) : (
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleSend}
                                        disabled={!canSend}
                                        className="inline-flex items-center gap-2 rounded-[11px] bg-gradient-to-br from-[#2b7ef0] to-[#1268e8] px-5 py-[11px] text-[13.5px] font-bold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(18,104,232,0.28)] transition-all hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(18,104,232,0.36)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-[0.42] disabled:shadow-none"
                                    >
                                        <Send size={15} /> Send to AREN
                                    </button>

                                    {topic.requiresMessage && message.trim().length < 10 && (
                                        <span className="text-xs text-[#98a0b2]">Add a line or two first.</span>
                                    )}
                                </div>
                            )}

                            {status.kind === "error" && (
                                <div role="alert" className="flex items-start gap-[9px] rounded-[11px] border border-[#dc2626]/25 bg-[#dc2626]/5 px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-[#9b2c2c]">
                                    <AlertCircle size={15} className="mt-px flex-shrink-0" />
                                    <span>
                                        {status.message} You can email us directly at{" "}
                                        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-[#9b2c2c]">{SUPPORT_EMAIL}</a>.
                                    </span>
                                </div>
                            )}

                            {/* Saying what rides along is not a legal
                                notice, it is the reason a doctor doesn't
                                have to type any of it. */}
                            <p className="m-0 flex items-start gap-2 text-[11.5px] leading-[1.55] text-[#8b93a6]">
                                <ShieldCheck size={13} className="mt-[2px] flex-shrink-0 text-[#4a9a6a]" />
                                <span>
                                    Sent with your name, clinic{clinicName ? ` (${clinicName})` : ""} and browser
                                    details so we can pick it up without asking. No patient information is included.
                                </span>
                            </p>
                        </section>
                    )}
                </div>
            )}

            {/* Always reachable, whatever the form is doing. */}
            <aside className="flex flex-col gap-[9px]">
                <span className="pl-[2px] text-[10.5px] font-extrabold tracking-[0.08em] text-[#98a0b2] uppercase">Or reach us directly</span>
                <div className="grid grid-cols-2 gap-[10px] max-[720px]:grid-cols-1">
                    <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="flex items-center gap-[11px] rounded-[13px] border border-[#e6e8f0] bg-white px-[14px] py-3 no-underline transition-all hover:-translate-y-px hover:border-[#c9d3e6] hover:shadow-[0_4px_14px_rgba(20,30,50,0.06)]"
                    >
                        <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] bg-[#1268e8]/[0.08] text-[#3b7ae0]"><Mail size={16} /></span>
                        <span className="flex min-w-0 flex-col gap-px">
                            <span className="text-[10px] font-extrabold tracking-[0.07em] text-[#98a0b2] uppercase">Email</span>
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-[#232a3b]">{SUPPORT_EMAIL}</span>
                        </span>
                    </a>
                    <a
                        href={`tel:${SUPPORT_PHONE_TEL}`}
                        className="flex items-center gap-[11px] rounded-[13px] border border-[#e6e8f0] bg-white px-[14px] py-3 no-underline transition-all hover:-translate-y-px hover:border-[#c9d3e6] hover:shadow-[0_4px_14px_rgba(20,30,50,0.06)]"
                    >
                        <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[10px] bg-[#1268e8]/[0.08] text-[#3b7ae0]"><Phone size={16} /></span>
                        <span className="flex min-w-0 flex-col gap-px">
                            <span className="text-[10px] font-extrabold tracking-[0.07em] text-[#98a0b2] uppercase">Phone</span>
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-[#232a3b]">{SUPPORT_PHONE_DISPLAY}</span>
                        </span>
                    </a>
                </div>
            </aside>
        </div>
    );
}

// ---------------------------------------------------------------------------
// WHAT THE SIX SECONDS LOOK LIKE.
//
// The send is genuinely slow — a Zoho OAuth token exchange plus the send
// itself, on an edge function that may be starting cold. Measured at over six
// seconds. The first version of this page answered that with a disabled button
// reading "Sending…" and nothing else, which is honest and horrible: past
// about two seconds, a control that has stopped responding and stopped saying
// anything is indistinguishable from one that has broken, and the doctor's
// next move is to click it again.
//
// Anmol: "humans just need a beautiful architecture feedback system, and they
// will wait... changing texts communicating with the doctor as what's
// happening and what you should do."
//
// So it narrates. Two rules keep the narration honest:
//
//   1. **Every line is something that is actually happening.** The stages
//      below are the real server-side sequence in `support-notify`: verify the
//      session, resolve the clinic, write the `support_requests` row, hand the
//      mail to Zoho. It is not a spinner wearing a costume.
//
//   2. **The bar never lies about being finished.** It eases toward 92% and
//      stops there, however long it takes; only the real response moves it to
//      100%. A progress bar that reaches the end and then waits is worse than
//      no bar, because it converts "this is slow" into "this is stuck".
//
// Past twelve seconds it stops narrating and starts reassuring — at that point
// what a doctor needs is not another step name but to know the request is not
// lost and they do not have to sit and watch it.
// ---------------------------------------------------------------------------

const SEND_STAGES: { at: number; line: string }[] = [
    { at: 0, line: "Packing up your message…" },
    { at: 900, line: "Checking your clinic details…" },
    { at: 2200, line: "Filing it with AREN support…" },
    { at: 3800, line: "Sending the email…" },
    { at: 6500, line: "Almost there — the mail server is taking its time." },
    { at: 12000, line: "Still going. It's safe to leave this page; we have your request." },
];

function SendingProgress({ elapsed }: { elapsed: number }) {
    const stage = [...SEND_STAGES].reverse().find((s) => elapsed >= s.at) ?? SEND_STAGES[0];
    // Asymptotic, so it always moves and never arrives. ~63% at 3.5s, ~86% at
    // 7s, and it can never pass the ceiling no matter how long this takes.
    const pct = Math.min(92, Math.round((1 - Math.exp(-elapsed / 3500)) * 100));

    return (
        <div role="status" aria-live="polite" className="flex flex-col gap-[11px] rounded-xl border border-[#1268e8]/20 bg-[#1268e8]/[0.035] px-4 py-[15px]">
            <div className="h-[5px] overflow-hidden rounded-full bg-[#1268e8]/10">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-[#4b91f7] via-[#1268e8] to-[#7c5cf0] shadow-[0_0_10px_rgba(18,104,232,0.45)] transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex min-h-[18px] items-center gap-[9px] text-[13px] font-semibold text-[#3b4a63]">
                <Loader2 size={14} className="flex-shrink-0 animate-spin text-[#1268e8]" />
                <span key={stage.at}>{stage.line}</span>
            </div>
        </div>
    );
}

function SentPanel({
    onAnother, replyTo, reference, onView,
}: {
    onAnother: () => void;
    replyTo: string;
    reference: string | null;
    /** Present only when the fresh ticket's id parsed cleanly — jumps
     *  straight into "My requests" on that thread. */
    onView?: () => void;
}) {
    return (
        <div className="flex flex-col items-center gap-[10px] rounded-2xl border border-[#e6e8f0] bg-white px-[30px] pt-11 pb-[38px] text-center shadow-[0_1px_2px_rgba(20,30,50,0.04),0_10px_30px_rgba(20,30,50,0.035)]">
            <div className="mb-1 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#34d399] to-[#059669] text-white shadow-[0_6px_20px_rgba(5,150,105,0.32)]">
                <Check size={26} strokeWidth={3} />
            </div>
            <h2 className="m-0 text-[19px] font-bold normal-case tracking-[-0.015em] text-[#1c2333]">That's with us</h2>
            <p className="m-0 max-w-[400px] text-[13.5px] leading-[1.65] text-[#6e7688]">
                We've got your message{replyTo ? <> and we'll reply to <strong className="text-[#2f3748]">{replyTo}</strong></> : <> and we'll be in touch</>}.
                If it's urgent, call us — the number is just below.
            </p>
            {/* The row id from `support_requests`. A doctor who can quote a
                reference gets a faster answer, and it is proof to them that
                this went somewhere real rather than into a mail client. */}
            {reference && (
                <p className="mt-[2px] mb-0 rounded-full border border-[#e3e7f1] bg-[#f7f9fd] px-[13px] py-[5px] text-[11.5px] text-[#7b8396]">
                    Reference <strong className="font-mono text-xs tracking-[0.02em] text-[#1268e8]">{reference}</strong>
                </p>
            )}

            <div className="mt-2 flex items-center gap-[10px]">
                {onView && (
                    <button
                        type="button"
                        onClick={onView}
                        className="inline-flex items-center gap-2 rounded-[11px] bg-gradient-to-br from-[#2b7ef0] to-[#1268e8] px-5 py-[11px] text-[13.5px] font-bold tracking-[0.01em] text-white shadow-[0_4px_14px_rgba(18,104,232,0.28)] transition-all hover:-translate-y-px hover:shadow-[0_6px_18px_rgba(18,104,232,0.36)]"
                    >
                        <Inbox size={14} /> View this request
                    </button>
                )}
                <button
                    type="button"
                    onClick={onAnother}
                    className="rounded-[10px] border border-[#dde2ee] bg-white px-[18px] py-[9px] text-[12.5px] font-bold text-[#4a5468] transition-colors hover:border-[#bfcbe2] hover:bg-[#f8fafd]"
                >
                    Send another
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MY REQUESTS — the list + thread split.
//
// A genuinely different layout problem from the form above: two panes that
// scroll INDEPENDENTLY inside a fixed-height row, the same shape Patient
// Records solved (patients-shell.css's own header comment has the full story
// of why `.app-shell` gives nothing here a real height to inherit). `100dvh`
// sidesteps it the same way — an absolute floor, not a percentage of a
// heightless ancestor — with the header height subtracted explicitly.
// `--app-header-h` is the same registered custom property the nav rail
// animates (features/sidebar/sidebar.css); `inherits: true` on its
// `@property` declaration is what makes it reachable here via a plain
// Tailwind arbitrary value, no stylesheet of its own needed.
// ═══════════════════════════════════════════════════════════════════════════

function TicketsView({
    openTicketId, onCountChange,
}: {
    /** Set once, from `SentPanel` — selects this ticket the moment the list
     *  has loaded, then gets out of the way (the doctor may pick another). */
    openTicketId: number | null;
    onCountChange: (n: number) => void;
}) {
    const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const consumedOpenId = useRef<number | null>(null);

    async function reload() {
        try {
            const rows = await fetchMySupportTickets();
            setTickets(rows);
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Couldn't load your requests.");
        }
    }

    useEffect(() => {
        void reload();
        const unsubscribe = subscribeToMyTickets(() => void reload());
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        onCountChange(tickets ? tickets.filter((t) => isTicketActive(t.status)).length : 0);
    }, [tickets, onCountChange]);

    // Land on the just-filed ticket once, the first time the list contains
    // it; after that the doctor's own clicks own `selectedId`.
    useEffect(() => {
        if (!tickets || openTicketId == null || consumedOpenId.current === openTicketId) return;
        if (tickets.some((t) => t.id === openTicketId)) {
            setSelectedId(openTicketId);
            consumedOpenId.current = openTicketId;
        }
    }, [tickets, openTicketId]);

    const selected = tickets?.find((t) => t.id === selectedId) ?? null;

    return (
        <div className="w-full min-h-0 flex-1 overflow-hidden px-5 pt-[14px] pb-5">
            <div className="mx-auto flex h-full min-h-[380px] max-w-[1080px] overflow-hidden rounded-2xl border border-[#e6e8f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.04),0_10px_30px_rgba(20,30,50,0.035)]">
                <div
                    className={
                        "w-[300px] flex-shrink-0 overflow-y-auto border-r border-[#edeff5] max-[880px]:w-full " +
                        (selected ? "max-[880px]:hidden" : "")
                    }
                >
                    {tickets === null && !loadError && (
                        <div className="flex h-full flex-col items-center justify-center gap-[10px] px-5 py-[30px]">
                            <Loader2 size={18} className="animate-spin text-[#9aa1b1]" />
                        </div>
                    )}
                    {loadError && (
                        <div role="alert" className="m-4 flex items-start gap-[9px] rounded-[11px] border border-[#dc2626]/25 bg-[#dc2626]/5 px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-[#9b2c2c]">
                            <AlertCircle size={15} className="mt-px flex-shrink-0" />
                            <span>{loadError}</span>
                        </div>
                    )}
                    {tickets?.length === 0 && (
                        <div className="flex h-full flex-col items-center justify-center gap-[10px] px-5 py-[30px] text-center text-[12.5px] leading-[1.55] text-[#9aa1b1]">
                            <Inbox size={22} />
                            <p className="m-0">No requests yet.<br />Anything you send AREN will show up here.</p>
                        </div>
                    )}
                    {tickets?.map((t) => (
                        <TicketRow key={t.id} ticket={t} active={t.id === selectedId} onClick={() => setSelectedId(t.id)} />
                    ))}
                </div>

                <div
                    className={
                        "flex min-w-0 flex-1 flex-col max-[880px]:w-full " +
                        (selected ? "" : "max-[880px]:hidden")
                    }
                >
                    {selected ? (
                        <ThreadPanel key={selected.id} ticket={selected} onBack={() => setSelectedId(null)} />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-[10px] p-[30px] text-center text-[12.5px] text-[#b5bac8]">
                            <Inbox size={26} />
                            <p className="m-0">Pick a request on the left to see the conversation.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** The status pill — shared by the list row and the thread header. Colour and
 *  background are DYNAMIC (from `SUPPORT_STATUS`), so they stay inline style;
 *  everything else is Tailwind. */
function StatusPill({ status }: { status: SupportTicket["status"] }) {
    const tone = SUPPORT_STATUS[status];
    return (
        <span
            className="inline-flex items-center gap-[5px] rounded-full py-[3px] pr-[9px] pl-[7px] text-[10.5px] font-bold whitespace-nowrap"
            style={{ color: tone.color, background: tone.soft }}
        >
            <span
                className={"h-[6px] w-[6px] flex-shrink-0 rounded-full" + (tone.pulses ? " animate-pulse" : "")}
                style={{ background: tone.color }}
            />
            {tone.label}
        </span>
    );
}

function TicketRow({ ticket, active, onClick }: { ticket: SupportTicket; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "flex w-full flex-col gap-[7px] border-0 border-b border-[#f1f2f7] px-4 py-[13px] text-left transition-colors " +
                (active ? "bg-[#1268e8]/[0.06] shadow-[inset_3px_0_0_#1268e8]" : "bg-transparent hover:bg-[#f8f9fc]")
            }
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-bold text-[#232a3b]">{ticket.topic}</span>
                <span className="flex-shrink-0 font-mono text-[10px] text-[#a8afc0]">{ticket.reference}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
                <StatusPill status={ticket.status} />
                <span className="flex-shrink-0 text-[10.5px] text-[#9aa1b1]">{formatTicketTime(ticket.updatedAt)}</span>
            </div>
        </button>
    );
}

function ThreadPanel({ ticket, onBack }: { ticket: SupportTicket; onBack: () => void }) {
    const identity = useClinicalIdentity();
    const [messages, setMessages] = useState<SupportMessage[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    async function reload() {
        try {
            const rows = await fetchTicketMessages(ticket.id);
            setMessages(rows);
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Couldn't load this conversation.");
        }
    }

    useEffect(() => {
        void reload();
        const unsubscribe = subscribeToTicketMessages(ticket.id, () => void reload());
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket.id]);

    useEffect(() => {
        // Bottom-of-thread, not top — a chat is read newest-last. Runs after
        // every load, including the realtime-triggered ones, so a reply that
        // arrives while the doctor is looking scrolls into view for them.
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    async function handleReply() {
        const body = draft.trim();
        if (!body || sending) return;
        setSending(true);
        setSendError(null);
        try {
            await sendDoctorReply(ticket.id, body, identity.doctorName);
            setDraft("");
            await reload();
        } catch (e) {
            setSendError(e instanceof Error ? e.message : "Couldn't send that — try again.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex flex-shrink-0 items-center gap-[11px] border-b border-[#edeff5] px-4 py-[13px]">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to requests"
                    className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[#e6e8f0] bg-white text-[#5a6379] max-[880px]:flex"
                >
                    <ArrowLeft size={16} />
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-bold text-[#1c2333]">{ticket.topic}</span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#98a0b2]">
                        {ticket.reference}{ticket.areas.length > 0 ? ` · ${ticket.areas.join(", ")}` : ""}
                    </span>
                </div>
                <StatusPill status={ticket.status} />
            </header>

            <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto bg-[#fbfbfd] p-4">
                {/* The original request is the thread's own first message —
                    a doctor scrolling up should find what they originally
                    said, not a conversation that starts mid-way. */}
                {ticket.message && (
                    <ThreadBubble senderType="doctor" senderName={identity.doctorName} body={ticket.message} createdAt={ticket.createdAt} isOriginal />
                )}

                {messages === null && !loadError && (
                    <div className="flex flex-col items-center justify-center gap-[10px] py-5">
                        <Loader2 size={16} className="animate-spin text-[#9aa1b1]" />
                    </div>
                )}
                {loadError && (
                    <div role="alert" className="m-4 flex items-start gap-[9px] rounded-[11px] border border-[#dc2626]/25 bg-[#dc2626]/5 px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-[#9b2c2c]">
                        <AlertCircle size={15} className="mt-px flex-shrink-0" /><span>{loadError}</span>
                    </div>
                )}
                {messages?.map((m) => (
                    <ThreadBubble key={m.id} senderType={m.senderType} senderName={m.senderName} body={m.body} createdAt={m.createdAt} />
                ))}
            </div>

            <div className="flex flex-shrink-0 items-end gap-2 border-t border-[#edeff5] bg-white px-4 py-3">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleReply();
                        }
                    }}
                    placeholder="Reply to AREN…"
                    rows={2}
                    className="min-h-5 max-h-[96px] flex-1 resize-none rounded-[11px] border border-[#e0e4ef] bg-[#fcfcfe] px-3 py-[9px] text-[13px] leading-[1.5] text-[#232a3b] transition-colors focus:border-[#1268e8] focus:bg-white focus:shadow-[0_0_0_3px_rgba(18,104,232,0.14)] focus:outline-none"
                />
                <button
                    type="button"
                    onClick={() => void handleReply()}
                    disabled={sending || !draft.trim()}
                    aria-label="Send reply"
                    className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-[#2b7ef0] to-[#1268e8] text-white shadow-[0_3px_10px_rgba(18,104,232,0.28)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.42]"
                >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
            </div>
            {sendError && (
                <div role="alert" className="mx-4 mb-3 flex items-start gap-[9px] rounded-[11px] border border-[#dc2626]/25 bg-[#dc2626]/5 px-[13px] py-[11px] text-[12.5px] leading-[1.5] text-[#9b2c2c]">
                    <AlertCircle size={15} className="mt-px flex-shrink-0" /><span>{sendError}</span>
                </div>
            )}
        </div>
    );
}

function ThreadBubble({
    senderType, senderName, body, createdAt, isOriginal,
}: {
    senderType: SupportMessage["senderType"];
    senderName: string | null;
    body: string;
    createdAt: string;
    /** The ticket's own opening message, rendered from `support_requests.message`
     *  rather than a `support_request_messages` row — same visual shape, so it
     *  reads as "the first thing said" rather than a different kind of entry. */
    isOriginal?: boolean;
}) {
    if (senderType === "system") {
        return (
            <div className="self-center rounded-full bg-[#eef0f6] px-3 py-[5px] text-[11px] text-[#8b93a6] italic">
                {body}
            </div>
        );
    }
    const mine = senderType === "doctor";
    return (
        <div className={"flex w-full" + (mine ? " justify-end" : "")}>
            <div
                className={
                    "flex max-w-[78%] flex-col gap-[3px] rounded-2xl px-[13px] py-[9px] max-[880px]:max-w-[88%] " +
                    (mine
                        ? "rounded-br-[4px] bg-gradient-to-br from-[#4b91f7] to-[#1268e8]"
                        : "rounded-bl-[4px] border border-[#edeff5] bg-white")
                }
            >
                {!mine && <span className="text-[10.5px] font-extrabold text-[#7c5cf0]">{senderName || "AREN Support"}</span>}
                <p className={"m-0 text-[13px] leading-[1.5] break-words whitespace-pre-wrap " + (mine ? "text-white" : "text-[#232a3b]")}>{body}</p>
                <span className={"text-[9.5px] " + (mine ? "self-end text-white/70" : "self-start text-[#a8afc0]")}>
                    {formatTicketTime(createdAt)}{isOriginal ? " · original request" : ""}
                </span>
            </div>
        </div>
    );
}

/** "just now" / "12m ago" / "3h ago" / "9 Sept" — short enough for a list row
 *  and a bubble timestamp alike; falls back to a date past a day old rather
 *  than ever printing something like "31h ago". */
function formatTicketTime(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
