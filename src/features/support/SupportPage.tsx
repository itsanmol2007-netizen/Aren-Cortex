// ---------------------------------------------------------------------------
// HELP & SUPPORT — the one place to ask AREN for something.
//
// Rebuilt 2026-09-11. What it replaced: two `mailto:`/`tel:` cards. Honest,
// but it put the whole job on the doctor — open your mail client, work out
// what to say, describe your own browser, and remember to mention which
// clinic you are. Most of that AREN already knows.
//
// This page asks three things, and only the first is mandatory:
//   1. what it is about        (a topic — five, including "something else")
//   2. which part of AREN      (only for a fault, the only topic where the
//                               answer changes who picks it up)
//   3. what happened           (their own words, always available)
//
// Everything else rides along by itself: who they are and which clinic
// (resolved from the session ON THE SERVER — see support-notify's own header;
// the page cannot claim to be a different doctor), and the browser facts
// nobody should have to type (`collectDiagnostics`).
//
// ── Why this is not a "ticket system" ─────────────────────────────────────
// There is no tickets table, no status, no thread. This sends an email and
// says so plainly. A ticket UI implies a queue a doctor can check, and
// building the appearance of one without the thing behind it is worse than
// not having it — a doctor would refresh a page waiting for a status that
// nothing updates. Email is what AREN actually answers on, so email is what
// this page promises. The phone number stays, right there, for the times an
// email is too slow.
//
// ── Credits are deliberately not here ─────────────────────────────────────
// Messaging credit recharges have their own flow on the Communication page,
// which knows the balance, the packages and the pending request. Duplicating
// it here would mean two ways to ask for the same thing, and one of them
// unable to see whether the other already did.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Check, Loader2, Mail, Phone, Send, ShieldCheck, AlertCircle } from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { useClinicShape } from "../../hooks/useClinicShape";
import { sendSupportRequest } from "../../lib/db/messaging";
import { SUPPORT_TOPICS, collectDiagnostics, type SupportTopic } from "./supportTopics";
import "./support.css";

interface Props {
    /** `doctors.email` when we have one — prefills where a reply should go. */
    doctorEmail?: string | null;
    clinicName?: string | null;
}

const SUPPORT_EMAIL = "care@arenode.com";
const SUPPORT_PHONE_DISPLAY = "+91 95599 51905";
const SUPPORT_PHONE_TEL = "+919559951905";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function SupportPage({ doctorEmail, clinicName }: Props) {
    const identity = useClinicalIdentity();
    const clinic = useClinicShape();

    const [topicId, setTopicId] = useState<string | null>(null);
    const [areas, setAreas] = useState<string[]>([]);
    const [message, setMessage] = useState("");
    const [replyTo, setReplyTo] = useState(doctorEmail ?? "");
    const [status, setStatus] = useState<Status>({ kind: "idle" });

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
            await sendSupportRequest({
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
            setStatus({ kind: "sent" });
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

    return (
        <div className="supp-page">
            <WorkspaceHeader
                title="Help & Support"
                subtitle="Tell us what you need — a real person reads every one"
            />

            <div className="supp-body">
                {status.kind === "sent" ? (
                    <SentPanel onAnother={startOver} replyTo={replyTo.trim()} />
                ) : (
                    <div className="supp-form">
                        {/* ── 1. the topic ──────────────────────────────── */}
                        <section className="supp-step">
                            <header className="supp-step-head">
                                <span className="supp-step-num">1</span>
                                <div>
                                    <h2>What's this about?</h2>
                                    <p>Pick the closest one — the last option is there for everything else.</p>
                                </div>
                            </header>

                            <div className="supp-topics">
                                {SUPPORT_TOPICS.map((t) => {
                                    const Icon = t.icon;
                                    const on = t.id === topicId;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            className={`supp-topic${on ? " is-on" : ""}`}
                                            onClick={() => {
                                                setTopicId(t.id);
                                                setAreas([]);
                                                if (status.kind === "error") setStatus({ kind: "idle" });
                                            }}
                                            aria-pressed={on}
                                        >
                                            <span className="supp-topic-icon"><Icon size={17} /></span>
                                            <span className="supp-topic-text">
                                                <span className="supp-topic-label">{t.label}</span>
                                                <span className="supp-topic-hint">{t.hint}</span>
                                            </span>
                                            <span className="supp-topic-tick"><Check size={13} strokeWidth={3} /></span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* ── 2. which area (faults only) ───────────────── */}
                        {topic?.areas && (
                            <section className="supp-step">
                                <header className="supp-step-head">
                                    <span className="supp-step-num">2</span>
                                    <div>
                                        <h2>Which part of AREN?</h2>
                                        <p>Pick as many as apply, or skip this if you're not sure.</p>
                                    </div>
                                </header>

                                <div className="supp-areas">
                                    {topic.areas.map((a) => (
                                        <button
                                            key={a}
                                            type="button"
                                            className={`supp-area${areas.includes(a) ? " is-on" : ""}`}
                                            onClick={() => toggleArea(a)}
                                            aria-pressed={areas.includes(a)}
                                        >
                                            {a}
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* ── 3. their own words ────────────────────────── */}
                        {topic && (
                            <section className="supp-step">
                                <header className="supp-step-head">
                                    <span className="supp-step-num">{topic.areas ? 3 : 2}</span>
                                    <div>
                                        <h2>{topic.prompt}</h2>
                                        <p>
                                            {topic.requiresMessage
                                                ? "As much or as little as you like — whatever you'd tell a colleague."
                                                : "Optional. Add anything that would help us answer faster."}
                                        </p>
                                    </div>
                                </header>

                                <textarea
                                    className="supp-textarea"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type here…"
                                    rows={6}
                                    autoFocus
                                />

                                <div className="supp-reply">
                                    <label htmlFor="supp-reply-to">Reply to</label>
                                    <input
                                        id="supp-reply-to"
                                        type="email"
                                        value={replyTo}
                                        onChange={(e) => setReplyTo(e.target.value)}
                                        placeholder="your@email.com"
                                        autoComplete="email"
                                    />
                                </div>

                                <div className="supp-send-row">
                                    <button
                                        type="button"
                                        className="supp-send"
                                        onClick={handleSend}
                                        disabled={!canSend}
                                    >
                                        {status.kind === "sending"
                                            ? (<><Loader2 size={15} className="supp-spin" /> Sending…</>)
                                            : (<><Send size={15} /> Send to AREN</>)}
                                    </button>

                                    {topic.requiresMessage && message.trim().length < 10 && (
                                        <span className="supp-send-note">Add a line or two first.</span>
                                    )}
                                </div>

                                {status.kind === "error" && (
                                    <div className="supp-error" role="alert">
                                        <AlertCircle size={15} />
                                        <span>
                                            {status.message} You can email us directly at{" "}
                                            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                                        </span>
                                    </div>
                                )}

                                {/* Saying what rides along is not a legal
                                    notice, it is the reason a doctor doesn't
                                    have to type any of it. */}
                                <p className="supp-attached">
                                    <ShieldCheck size={13} />
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
                <aside className="supp-direct">
                    <span className="supp-direct-label">Or reach us directly</span>
                    <div className="supp-direct-cards">
                        <a className="supp-card" href={`mailto:${SUPPORT_EMAIL}`}>
                            <span className="supp-card-icon"><Mail size={16} /></span>
                            <span className="supp-card-text">
                                <span className="supp-card-label">Email</span>
                                <span className="supp-card-value">{SUPPORT_EMAIL}</span>
                            </span>
                        </a>
                        <a className="supp-card" href={`tel:${SUPPORT_PHONE_TEL}`}>
                            <span className="supp-card-icon"><Phone size={16} /></span>
                            <span className="supp-card-text">
                                <span className="supp-card-label">Phone</span>
                                <span className="supp-card-value">{SUPPORT_PHONE_DISPLAY}</span>
                            </span>
                        </a>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function SentPanel({ onAnother, replyTo }: { onAnother: () => void; replyTo: string }) {
    return (
        <div className="supp-sent">
            <div className="supp-sent-tick"><Check size={26} strokeWidth={3} /></div>
            <h2>That's with us</h2>
            <p>
                We've got your message{replyTo ? <> and we'll reply to <strong>{replyTo}</strong></> : <> and we'll be in touch</>}.
                If it's urgent, call us — the number is just below.
            </p>
            <button type="button" className="supp-again" onClick={onAnother}>
                Send another
            </button>
        </div>
    );
}
