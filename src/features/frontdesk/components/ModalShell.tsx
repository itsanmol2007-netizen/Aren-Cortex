import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "../i18n/i18n";

// The Bhor modal surface (session 36). Every Front Desk modal renders inside
// this shell so the whole family — intake, visit details, future
// confirmations — reads as one AREN object: dawn thread at full strength on
// the top edge, a header zone lit by faint dawn radials with the corner-arc
// watermark (the DawnArcs motif folded into the frame), a brand-gradient icon
// tile under a violet eyebrow, and an optional soft footer band. Decoration
// lives only in the frame; the body stays paper (§2.3: she's scanning, not
// admiring).

type Props = {
    eyebrow: string;
    title: React.ReactNode;
    icon: React.ReactNode; // ~19px lucide icon; renders white on the gradient tile
    onClose: () => void;
    footer?: React.ReactNode;
    children: React.ReactNode;
    // Panel width cap. 580 is the Bhor default; exploration surfaces (the
    // visit-timeline modal) may go a touch wider without leaving the family.
    maxWidth?: number;
};

export function ModalShell({ eyebrow, title, icon, onClose, footer, children, maxWidth = 580 }: Props) {
    const t = useT();
    // A backdrop click only counts if the press ALSO started on the backdrop.
    // Without this, any in-panel interaction that reflows the layout between
    // mousedown and mouseup (a dropdown closing, content collapsing) lets the
    // mouseup land on the overlay and silently destroys the user's work.
    const pressedOnBackdrop = useRef(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-[rgba(17,20,35,0.42)] p-[5vh_20px_24px] backdrop-blur-[6px]"
            onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
            onClick={(e) => { if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="relative w-full rounded-[18px] bg-white shadow-[0_32px_80px_rgba(13,18,38,0.32),0_8px_28px_rgba(124,92,240,0.10)]"
                style={{ maxWidth }}
            >
                {/* Header zone clips its own decoration (rounded top) so the panel
                    itself can stay overflow-visible — floating dropdowns inside the
                    body (e.g. the symptom catalog) must never be cut off. */}
                <div
                    className="relative overflow-hidden rounded-t-[18px] border-b border-[#eeebf7] px-[22px] pb-4 pt-[17px]"
                    style={{
                        background:
                            "radial-gradient(ellipse 320px 140px at 90% 0%, rgba(168,85,247,0.10), transparent 70%), " +
                            "radial-gradient(ellipse 260px 120px at 28% 0%, rgba(242,169,134,0.05), transparent 70%), " +
                            "linear-gradient(180deg, #faf8ff 0%, #ffffff 100%)",
                    }}
                >
                    {/* Dawn thread — full strength with glow on modals since s36
                        (amends §3.2's 65% weight; the modal is a formal surface). */}
                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2.5px]"
                        style={{
                            background: "linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)",
                            boxShadow: "0 1px 10px rgba(168,85,247,0.35), 0 2px 18px rgba(244,114,182,0.14)",
                        }}
                    />
                    <CornerArcs />
                    <div className="relative flex items-center gap-[13px] pr-10">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(155deg,#7c5cf0,#2f6bed)] text-white shadow-[0_3px_12px_rgba(124,92,240,0.32)]">
                            {icon}
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#8b5cf6]">{eyebrow}</div>
                            <div className="mt-[1px] truncate font-[Manrope,sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[#161d29]">
                                {title}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("back")}
                        className="absolute right-[18px] top-[18px] z-10 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[#8a91a0] transition-colors hover:bg-[rgba(20,30,50,0.06)] hover:text-[#3b4453]"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="px-[22px] pb-5 pt-4">{children}</div>

                {footer && (
                    <div className="flex items-center justify-end gap-[10px] rounded-b-[18px] border-t border-[#eeebf7] bg-[#fbfaff] px-[22px] py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

// The dawn-arcs motif reduced to a corner ornament: three pastel quarter-arcs
// radiating from the panel's top-right corner with the apricot sun dot.
// Purely decorative; sits under the header content.
function CornerArcs() {
    return (
        <svg
            width="150"
            height="86"
            viewBox="0 0 150 86"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0"
        >
            <path d="M150 78 A78 78 0 0 1 72 0" stroke="#e9e3f9" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M150 56 A56 56 0 0 1 94 0" stroke="#f9dcec" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M150 36 A36 36 0 0 1 114 0" stroke="#fbe7db" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="117" cy="33" r="3.5" fill="#f2a986" opacity="0.5" />
        </svg>
    );
}
