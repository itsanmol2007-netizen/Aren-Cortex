// ---------------------------------------------------------------------------
// THE CONSULT SURFACE SHELL — one card, worn by the queue sheet and the
// handover modal.
//
// `docs/aren-modal-design.md`'s shape, unchanged: a blurred backdrop, a white
// rounded card, a 4px accent stripe across the very top, a header with an icon
// tile + eyebrow + title + close, body sections, and a footer with a ghost and
// one solid primary. Nothing about that is re-decided here.
//
// What this shell adds, and why it is not a new visual language:
//
//   1. A WIDER card. The existing family caps at 480/600px because its bodies
//      are forms. These two bodies are a patient beside a queue — two columns
//      of real content — and squeezing that into 480px would stack them, which
//      loses the entire point of showing the queue next to the patient.
//   2. An optional DARK BAND under the stripe, into which the caller puts
//      `PatientBand`. That band is the app's own consult header (`#050916` +
//      the nebula), reused inside the card. It is where the contrast comes
//      from — a dark hero over a paper body, rather than white-on-white with a
//      4px stripe carrying the whole identity.
//
// Escape always closes; a backdrop click closes only when the caller says the
// surface has nothing to lose — the same `dirty` contract `PracticeModal`
// established, for the same reason (2026-08-28: "do not close the modal by
// outside-click when the user has already entered information").
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useOverlayFocus } from "../../../hooks/useOverlayFocus";

export function ConsultModal({
    icon, eyebrow, title, subtitle, band, footer, onClose, holdOpen, children, labelledBy,
}: {
    icon: ReactNode;
    eyebrow: string;
    title: string;
    subtitle?: string;
    /** the dark identity band — `PatientBand`, or nothing */
    band?: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
    /**
     * True when a backdrop click would throw something away — a chosen
     * override, a half-made decision. Escape and the × still always work,
     * because both are an explicit "I want to leave".
     */
    holdOpen?: boolean;
    children: ReactNode;
    labelledBy?: string;
}) {
    // Focus lands on the card and returns to whatever had it on close. Load-
    // bearing, not politeness: this overlay is opened from a workspace whose
    // un-modified keys are all bound (`useConsultKeyboard`), and rule 14 is
    // that an overlay which does not take focus leaves those bindings live
    // underneath it — a stray "r" while choosing the next patient would open
    // Review behind the scrim.
    const ref = useRef<HTMLDivElement>(null);
    useOverlayFocus(ref);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(8,16,35,0.45)] p-[var(--cs-s4)] backdrop-blur-[10px] backdrop-saturate-[1.4]"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !holdOpen) onClose(); }}
        >
            <div
                ref={ref}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={labelledBy ? undefined : title}
                aria-labelledby={labelledBy}
                className={
                    "flex max-h-[min(660px,90vh)] w-[min(760px,100%)] flex-col overflow-hidden rounded-[20px] " +
                    "bg-[rgba(255,255,255,0.97)] outline-none " +
                    "shadow-[0_2px_4px_rgba(16,28,46,0.06),0_8px_24px_rgba(16,28,46,0.10),0_32px_80px_rgba(16,28,46,0.18)]"
                }
            >
                {/* The 4px mark, in the action tone this whole surface carries. */}
                <div
                    aria-hidden="true"
                    className="h-[4px] flex-none"
                    style={{ background: "linear-gradient(90deg, #1268e8 0%, #7c3aed 100%)" }}
                />

                <div className="flex flex-none items-start justify-between gap-[var(--cs-s3)] px-[var(--cs-s5)] pb-[var(--cs-s3)] pt-[var(--cs-s4)]">
                    <div className="flex min-w-0 items-center gap-[var(--cs-s3)]">
                        <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]">
                            {icon}
                        </span>
                        <div className="min-w-0">
                            <div className="text-[10px] font-[750] uppercase tracking-[0.06em] text-[var(--cs-blue)]">{eyebrow}</div>
                            {/* role=heading, not <h3>: base.css is unlayered and
                                restyles bare headings to 12px uppercase. */}
                            <div role="heading" aria-level={2} className="truncate text-[15px] font-bold leading-tight text-[var(--cs-ink)]">
                                {title}
                            </div>
                            {subtitle && (
                                <div className="mt-[2px] truncate text-[11.5px] font-normal text-[var(--cs-faint)]">{subtitle}</div>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-[28px] w-[28px] flex-none place-items-center rounded-full border-0 bg-black/[0.03] text-[var(--cs-faint)] transition-colors hover:bg-black/[0.07] hover:text-[var(--cs-ink)]"
                    >
                        <X size={15} />
                    </button>
                </div>

                {band}

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

                {footer && (
                    <div className="flex flex-none items-center gap-[var(--cs-s3)] border-t border-[var(--cs-line)] px-[var(--cs-s5)] py-[var(--cs-s4)]">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/** The footer's ghost action — Cancel, Back, "not now". */
export function GhostButton({
    onClick, children, disabled,
}: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={
                "inline-flex h-[42px] flex-none items-center justify-center gap-[6px] rounded-[12px] border " +
                "border-[var(--cs-line-strong)] bg-black/[0.03] px-[18px] text-[13px] font-semibold text-[var(--cs-muted)] " +
                "transition-colors hover:bg-black/[0.06] disabled:opacity-45"
            }
        >
            {children}
        </button>
    );
}

/** The footer's one solid action. Never two of these on the same footer. */
export function PrimaryButton({
    onClick, children, disabled, full,
}: { onClick: () => void; children: ReactNode; disabled?: boolean; full?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={
                "inline-flex h-[42px] items-center justify-center gap-[7px] rounded-[12px] border-0 px-[20px] " +
                "text-[13px] font-bold text-white transition-[filter,box-shadow] " +
                "bg-[linear-gradient(90deg,#1268e8_0%,#7c3aed_100%)] " +
                "shadow-[0_2px_10px_rgba(18,104,232,0.28)] hover:brightness-[1.06] disabled:opacity-45 " +
                (full ? "w-full" : "flex-none")
            }
        >
            {children}
        </button>
    );
}
