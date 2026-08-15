// ---------------------------------------------------------------------------
// WHY THIS RANKED — the engine's own contribution data, shown on request.
//
// Every scored intent already carries `contributors`: which signals pushed it
// up, and by how much, largest first. That is the engine's real explainability
// surface and it has existed since the sandbox — it simply had no way to reach
// a doctor in Cortex.
//
// ── Three rules this had to get right ─────────────────────────────────────
//
//  1. NOT SHOWN BY DEFAULT. The ranked list is a decision surface; a reason
//     beside every row turns it into a reading surface. This opens on an info
//     icon or a double-click and closes on anything else.
//
//  2. CUMULATIVE, NEVER CAUSAL. The engine adds contributions; it does not
//     conclude. "Fever → Paracetamol" is a sentence the arithmetic does not
//     support and a doctor would be right to distrust. So this renders a STACK
//     of contributors that visibly sum, with the count in the heading, and it
//     never draws an arrow between one input and one output. A single-signal
//     intent says so in those words rather than being dressed up as a chain.
//
//  3. NO SCORES. Same rule as the rank bar: contributions are drawn as
//     proportions of the largest contributor in this intent. The figure behind
//     the bar reads as clinical confidence to a human being and is nothing of
//     the kind. Percentages here are OF THE EXPLANATION, not of certainty, and
//     they are labelled that way.
//
// A negative contributor is real and is shown as such — `HEARTBURN → Acute
// coronary syndrome −0.15` is the engine arguing against something, and hiding
// that half would make the panel a sales pitch rather than an explanation.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";

const SHEET_WIDTH = 320;
const MARGIN = 10;

/** Contributors past this are summarised rather than listed one by one. */
const MAX_ROWS = 6;

export interface ExplainTarget {
    intent: PersonalizedIntent;
    anchor: DOMRect;
}

export function ContributionSheet({
    target, signalLabels, onClose,
}: {
    target: ExplainTarget;
    /** signalId -> human label. Never render a raw signal token. */
    signalLabels: Map<string, string>;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const { intent, anchor } = target;
    const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.left });

    /**
     * ── Deliberately does NOT take focus ─────────────────────────────────
     *
     * Tried `useOverlayFocus` here first and reverted it, 2026-08-15: a
     * doctor opened this with Alt+E and then had EVERY OTHER KEY on the
     * page — Tab, the arrows, next patient, review — go dead, with no
     * visible affordance for the one key (Escape) that still worked. That is
     * the right behaviour for a MODAL and the wrong one for a read-only
     * popover that exists beside a list the doctor is still working in.
     *
     * So this stays out of `isAnyModalOpen` (App.tsx) and never steals DOM
     * focus. Focus stays on whatever list the doctor was navigating, and
     * because of that the NEXT arrow-key press keeps moving that list's own
     * cursor exactly as if this were not open — which is "any new key
     * overrides the popup" without a special case anywhere for it. The X
     * button below and the outside-click/scroll/Escape handlers are for a
     * doctor who wants to dismiss it explicitly without doing anything else.
     */

    useLayoutEffect(() => {
        const h = ref.current?.offsetHeight ?? 260;
        let top = anchor.bottom + 6;
        if (top + h > window.innerHeight - MARGIN) {
            top = Math.max(MARGIN, anchor.top - h - 6);
        }
        const left = Math.min(
            Math.max(MARGIN, anchor.left),
            window.innerWidth - SHEET_WIDTH - MARGIN
        );
        setPos({ top, left });
    }, [anchor]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener("keydown", onKey);
        window.addEventListener("mousedown", onDown, true);
        window.addEventListener("scroll", onClose, true);
        return () => {
            window.removeEventListener("keydown", onKey);
            window.removeEventListener("mousedown", onDown, true);
            window.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    const all = intent.contributors ?? [];
    const rows = all.slice(0, MAX_ROWS);
    const rest = all.slice(MAX_ROWS);
    const restTotal = rest.reduce((n, c) => n + c.delta, 0);

    // The denominator is the LARGEST contribution in this intent, so the bars
    // compare inputs with each other. Normalising against the total would make
    // every bar shrink as more signals arrive, which reads as the evidence
    // getting weaker when the opposite happened.
    const peak = all.reduce((m, c) => Math.max(m, Math.abs(c.delta)), 0) || 1;

    return createPortal(
        <div
            ref={ref}
            className="cs-why"
            style={{ top: pos.top, left: pos.left, width: SHEET_WIDTH }}
            role="dialog"
            aria-label={`Why ${intent.label} is in this list`}
        >
            <div className="cs-why-head">
                <div className="cs-why-title-row">
                    <div className="cs-why-title cs-cap">{intent.label}</div>
                    {/* An explicit, literal way out — Escape and clicking
                        anywhere else already close this, but neither was
                        visible on the popover itself, which is what made it
                        feel stuck rather than merely quiet. */}
                    <button
                        type="button"
                        className="cs-why-close"
                        onClick={onClose}
                        aria-label="Close"
                    ><X size={13} /></button>
                </div>
                <div className="cs-why-sub">
                    {all.length === 0
                        ? "No contributing signal recorded"
                        : all.length === 1
                            ? "One thing on this chart contributes to it"
                            : `${all.length} things on this chart contribute to it`}
                </div>
            </div>

            {all.length > 0 && (
                <div className="cs-why-list">
                    {rows.map((c) => {
                        const negative = c.delta < 0;
                        return (
                            <div key={c.signalId} className="cs-why-row">
                                <span className="cs-why-name">
                                    {signalLabels.get(c.signalId) ?? c.signalId}
                                </span>
                                <span className={`cs-why-bar${negative ? " is-against" : ""}`}>
                                    <span
                                        className="cs-why-fill"
                                        style={{ width: `${Math.round((Math.abs(c.delta) / peak) * 100)}%` }}
                                    />
                                </span>
                                {negative && <span className="cs-why-against">argues against</span>}
                            </div>
                        );
                    })}

                    {rest.length > 0 && (
                        <div className="cs-why-rest">
                            + {rest.length} smaller contributor{rest.length === 1 ? "" : "s"}
                            {restTotal < 0 ? " (net against)" : ""}
                        </div>
                    )}
                </div>
            )}

            <div className="cs-why-foot">
                These add together — nothing here is a single cause. The bars compare
                the inputs with each other, not how likely anything is.
            </div>
        </div>,
        document.body
    );
}

/**
 * The affordance itself, so every card opens the sheet the same way.
 *
 * It is a real button rather than a hover target because the sheet is also
 * reachable by double-clicking the row, and a keyboard user has to have one
 * of the two.
 */
export function WhyButton({ label, onOpen }: {
    label: string;
    onOpen: (rect: DOMRect) => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    return (
        <button
            ref={ref}
            type="button"
            className="cs-why-btn"
            aria-label={`Why ${label} is in this list`}
            title="Why is this here?"
            onClick={(e) => {
                e.stopPropagation();
                const r = ref.current?.getBoundingClientRect();
                if (r) onOpen(r);
            }}
        >i</button>
    );
}
