// ---------------------------------------------------------------------------
// "OUR TEAM HANDLES THIS" — the one surface for operations a doctor should
// never perform alone.
//
// Anmol, 2026-08-31, on data export: "data export or something like that is
// not a feature which someone will even use autonomously — because if
// situations end up like that, then obviously we will take over, and not just
// the software."
//
// That is true of a whole class of operations, and they share one shape:
// exporting a clinic's records, deleting an account, changing the number an
// account is keyed on, adding a second doctor. Each is rare, each is
// irreversible or legally loaded, and each is better done by a person who can
// see the whole picture. Building self-service UI for any of them would be
// building a loaded gun for a case that happens twice a year.
//
// So they all route HERE instead: one component, one explanation, the account
// reference already quoted so the first support reply doesn't have to ask for
// it. Adding another such operation is a row that opens this — never a new
// half-built flow.
//
// This is deliberately NOT a dead end dressed as a feature. It states what the
// operation is, that a person handles it, and exactly how to start that.
// ---------------------------------------------------------------------------

import { LifeBuoy, Mail, X } from "lucide-react";
import { toast } from "sonner";

/** Where a support request actually goes. NOT invented — this is the address
 *  the login screen already publishes ("Trouble signing in or forgot your
 *  password? Write to care@arenode.com"), so the product speaks with one
 *  voice instead of sending doctors to two different inboxes. */
const SUPPORT_EMAIL = "care@arenode.com";

export interface SupportTopic {
    /** What the doctor clicked — becomes the subject line. */
    title: string;
    /** One line on why a person does this rather than a button. */
    reason: string;
}

export function SupportRequestModal({
    topic, accountReference, onClose,
}: {
    topic: SupportTopic;
    /** Quoted in the message so support can find the clinic immediately. */
    accountReference: string;
    onClose: () => void;
}) {
    const subject = `${topic.title} — clinic ${accountReference}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

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
                className="w-[min(430px,100%)] overflow-hidden rounded-[20px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,252,0.94))] shadow-[0_40px_80px_-32px_rgba(11,23,51,0.55)]"
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
                    <p className="m-0 mt-[4px] text-[12.5px] leading-[1.55] text-[var(--cs-muted)]">
                        {topic.reason}
                    </p>

                    <div className="mt-[14px] flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[10px]">
                        <span className="flex flex-col gap-[2px]">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                Account reference
                            </span>
                            <code className="text-[13px] font-semibold tracking-[0.04em] text-[var(--cs-ink)]">
                                {accountReference}
                            </code>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard?.writeText(accountReference)
                                    .then(() => toast.success("Account reference copied."))
                                    .catch(() => toast.error("Could not copy — select it by hand."));
                            }}
                            className="rounded-full border border-[var(--cs-line-strong)] bg-white px-[12px] py-[6px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-violet)] hover:text-[var(--cs-violet)]"
                        >
                            Copy
                        </button>
                    </div>

                    <a
                        href={mailto}
                        className="mt-[12px] flex h-[42px] w-full items-center justify-center gap-[8px] rounded-[11px] bg-[var(--cs-blue)] text-[13px] font-bold text-white transition-colors hover:bg-[#0e56c4]"
                    >
                        <Mail size={15} /> Email support
                    </a>
                    <p className="m-0 mt-[8px] text-center text-[11.5px] text-[var(--cs-faint)]">
                        {SUPPORT_EMAIL}
                    </p>
                </div>
            </div>
        </div>
    );
}
