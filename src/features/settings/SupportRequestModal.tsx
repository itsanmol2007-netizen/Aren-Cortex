// ---------------------------------------------------------------------------
// "OUR TEAM HANDLES THIS" — the one surface for operations a doctor should
// never perform alone.
//
// Anmol, 2026-08-31: operations like deleting an account or closing records
// carry clinical retention obligations and need team review.
//
// Rather than exposing a mailto: link or raw email address, this modal
// provides a direct, template-based submission that creates a case in
// `support_requests` (via `sendSupportRequest` / `support-notify`), sends an
// email notification to support via Amazon SES, and gives the doctor a
// durable reference ID (SR_...) they can track.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { CheckCircle2, LifeBuoy, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { sendSupportRequest } from "../../lib/db/messaging";

export interface SupportTopic {
    /** What the doctor clicked — becomes the subject line. */
    title: string;
    /** One line on why a person does this rather than a button. */
    reason: string;
}

export function SupportRequestModal({
    topic, accountReference, contactEmail, onClose,
}: {
    topic: SupportTopic;
    /** Quoted in the message so support can find the clinic immediately. */
    accountReference: string;
    contactEmail?: string | null;
    onClose: () => void;
}) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reference, setReference] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);

        const messageBody = [
            topic.reason,
            `Account Reference: ${accountReference}`,
            note.trim() ? `Doctor Note:\n${note.trim()}` : "",
        ].filter(Boolean).join("\n\n");

        try {
            const res = await sendSupportRequest({
                topic: topic.title,
                areas: ["Account", "Settings"],
                message: messageBody,
                replyTo: contactEmail || "",
                diagnostics: {
                    accountReference,
                    screen: "settings_account",
                },
            });

            setReference(res.reference || `SR_${accountReference.slice(0, 6)}`);
            toast.success("Support request sent successfully.");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Could not submit your request. Please try again.";
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[900] flex items-center justify-center bg-[rgba(11,23,51,0.28)] p-[32px] backdrop-blur-[14px]"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={topic.title}
                className="w-[min(460px,100%)] overflow-hidden rounded-[20px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,252,0.94))] shadow-[0_40px_80px_-32px_rgba(11,23,51,0.55)]"
            >
                <div className="h-[4px] bg-[linear-gradient(90deg,#f472b6_0%,#a855f7_50%,#6366f1_100%)]" />

                <div className="flex items-start justify-between gap-[12px] px-[18px] pb-[6px] pt-[16px]">
                    <div className="flex items-center gap-[10px]">
                        <span className="grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-[linear-gradient(135deg,#fce7f3_0%,#ede9fe_100%)] text-[#a855f7]">
                            <LifeBuoy size={15} />
                        </span>
                        <div>
                            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[#a855f7]">
                                Handled by our team
                            </p>
                            <span className="text-[14px] font-bold text-[var(--cs-ink)]">{topic.title}</span>
                        </div>
                    </div>
                    <button
                        type="button" onClick={onClose} aria-label="Close"
                        className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] border border-[var(--cs-line-strong)] bg-white text-[var(--cs-muted)]"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="px-[18px] pb-[18px]">
                    {reference ? (
                        <div className="mt-[12px] flex flex-col items-center gap-[12px] text-center">
                            <span className="grid h-[48px] w-[48px] place-items-center rounded-full bg-[rgba(22,163,74,0.12)] text-[var(--cs-green)]">
                                <CheckCircle2 size={28} />
                            </span>
                            <div>
                                <h3 className="m-0 text-[15px] font-bold text-[var(--cs-ink)]">
                                    Request Submitted
                                </h3>
                                <p className="m-0 mt-[4px] text-[12.5px] leading-[1.5] text-[var(--cs-muted)]">
                                    Our support team has received your request and will follow up with you.
                                </p>
                            </div>
                            <div className="flex items-center gap-[8px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[14px] py-[8px]">
                                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                    Case Reference:
                                </span>
                                <code className="text-[13px] font-bold tracking-[0.04em] text-[var(--cs-ink)]">
                                    {reference}
                                </code>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-[6px] h-[38px] w-full rounded-[10px] bg-[var(--cs-violet)] text-[13px] font-bold text-white transition-colors hover:bg-[#7c3aed]"
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="mt-[6px] flex flex-col gap-[12px]">
                            <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--cs-muted)]">
                                {topic.reason}
                            </p>

                            <div className="flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[8px]">
                                <span className="flex flex-col gap-[1px]">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                        Account reference
                                    </span>
                                    <code className="text-[12.5px] font-semibold tracking-[0.04em] text-[var(--cs-ink)]">
                                        {accountReference}
                                    </code>
                                </span>
                                {contactEmail && (
                                    <span className="flex flex-col items-end gap-[1px]">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                            Reply to
                                        </span>
                                        <span className="text-[11.5px] font-medium text-[var(--cs-label)]">
                                            {contactEmail}
                                        </span>
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-[5px]">
                                <label className="text-[11.5px] font-semibold text-[var(--cs-label)]">
                                    Additional details (optional)
                                </label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    placeholder="Add any specific context or instructions for our team..."
                                    className="w-full resize-none rounded-[10px]! border! border-[var(--cs-line-strong)] bg-white! px-[12px]! py-[9px]! text-[12.5px]! leading-[1.5] text-[var(--cs-ink)]! outline-none focus:border-[var(--cs-violet)]"
                                />
                            </div>

                            {error && (
                                <p className="m-0 text-[12px] font-semibold text-[var(--cs-red)]">
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={busy}
                                className="flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[11px] bg-[var(--cs-violet)] text-[13px] font-bold text-white transition-colors hover:bg-[#7c3aed] disabled:opacity-60!"
                            >
                                {busy ? (
                                    <>
                                        <Loader2 size={15} className="animate-spin" />
                                        Submitting request…
                                    </>
                                ) : (
                                    <>
                                        <Send size={15} />
                                        Submit request
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
