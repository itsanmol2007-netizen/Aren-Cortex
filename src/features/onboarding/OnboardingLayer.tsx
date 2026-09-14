// ---------------------------------------------------------------------------
// What the walkthrough actually looks like.
//
// ── NO SCRIM ───────────────────────────────────────────────────────────────
// The familiar pattern — black overlay, cut a hole over one element — is the
// reason guided tours feel like homework: the app is taken away and handed
// back a piece at a time. Here nothing dims. A soft ring lights the target
// where it sits, a thin line runs from it to a small card, and the rest of
// the workspace stays live and clickable the whole time. A doctor who
// ignores the hint entirely loses nothing.
//
// That also means the layer must not swallow clicks: the overlay is
// `pointer-events: none` throughout, and only the card itself takes them
// back. Pointing at the Consult button while making it unclickable would be
// its own small joke.
//
// Motion is the app's existing spring (`stiffness: 420, damping: 34` — the
// same one `GuardReason` arrives on), so a hint reads as part of this
// product rather than a widget bolted onto it.
// ---------------------------------------------------------------------------

import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Stethoscope, X } from "lucide-react";
import type { AnchorRect } from "./useOnboarding";
import type { CoachStep } from "./onboarding";

/** Breathing room between the target's edge and the ring drawn around it. */
const RING_PAD = 6;
/** Gap between the ring and the callout that points at it. */
const GAP = 16;
const CARD_W = 264;

/**
 * Where the card sits, and where the connector runs.
 *
 * NOTHING HERE MAY ASSUME THE CARD'S HEIGHT. The first version did — it
 * placed a top-side card at `rect.top - 118` — and the moment a title
 * wrapped to two lines the card grew downward and sat right on top of the
 * ring it was supposed to be pointing at. Caught in the browser, not by
 * reading it.
 *
 * So the card is pinned by the edge that FACES the target and the browser
 * decides the rest:
 *   · side placements pin `top` to the target's centre and let
 *     `translateY(-50%)` do the centring, at any height;
 *   · a top placement pins `bottom`, so the card grows upward away from the
 *     target and its lower edge stays exactly GAP above the ring.
 *
 * Horizontal clamping keeps a card near a screen edge on screen. A top-side
 * card with no room above it flips below instead of being clamped into the
 * target — being clamped is how it would end up covering the thing again.
 */
function layout(rect: AnchorRect, placement: CoachStep["placement"]) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const M = 12;
    /** enough room above for a two-or-three line card; below that, flip */
    const NEED_ABOVE = 168;

    const flipped = placement === "top" && rect.top < NEED_ABOVE;
    const side = flipped ? "bottom" : placement;

    const clampX = (x: number) => Math.max(M, Math.min(x, window.innerWidth - CARD_W - M));

    // `style` is handed straight to the card. Exactly one vertical anchor is
    // ever set, so the card can never be stretched between two edges.
    let style: React.CSSProperties;
    let to: { x: number; y: number };

    if (side === "right") {
        const left = clampX(rect.left + rect.width + RING_PAD + GAP);
        style = { left, top: cy, transform: "translateY(-50%)" };
        to = { x: left, y: cy };
    } else if (side === "left") {
        const left = clampX(rect.left - RING_PAD - GAP - CARD_W);
        style = { left, top: cy, transform: "translateY(-50%)" };
        to = { x: left + CARD_W, y: cy };
    } else if (side === "bottom") {
        const left = clampX(cx - CARD_W / 2);
        const top = rect.top + rect.height + RING_PAD + GAP;
        style = { left, top };
        to = { x: left + CARD_W / 2, y: top };
    } else {
        const left = clampX(cx - CARD_W / 2);
        const bottom = window.innerHeight - (rect.top - RING_PAD - GAP);
        style = { left, bottom };
        to = { x: left + CARD_W / 2, y: rect.top - RING_PAD - GAP };
    }

    // The connector leaves the ring on the side the card is on, and meets the
    // card's facing edge — a gentle curve, because a straight rule between
    // two rounded shapes reads as a technical diagram.
    const from = side === "right"
        ? { x: rect.left + rect.width + RING_PAD, y: cy }
        : side === "left"
            ? { x: rect.left - RING_PAD, y: cy }
            : side === "bottom"
                ? { x: cx, y: rect.top + rect.height + RING_PAD }
                : { x: cx, y: rect.top - RING_PAD };

    return { style, from, to };
}

export function CoachMark({
    step, rect, onGotIt, onSkip,
}: {
    step: CoachStep;
    rect: AnchorRect;
    onGotIt: () => void;
    onSkip: () => void;
}) {
    const reduce = useReducedMotion();
    const { style, from, to } = layout(rect, step.placement);

    const spring = { type: "spring" as const, stiffness: 420, damping: 34 };

    return createPortal(
        <div className="ob-layer" role="presentation">
            {/* The ring — welded to the element, never a box floating near it. */}
            <motion.div
                className="ob-ring"
                initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.96 }}
                transition={spring}
                style={{
                    top: rect.top - RING_PAD,
                    left: rect.left - RING_PAD,
                    width: rect.width + RING_PAD * 2,
                    height: rect.height + RING_PAD * 2,
                }}
            />

            <svg className="ob-connector" aria-hidden="true">
                <motion.path
                    d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${from.y} ${to.x} ${to.y}`}
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 0.68, 0, 1] }}
                />
            </svg>

            {/* Two elements, one job each. The outer does POSITION — including
                the `translateY(-50%)` that centres a side card at any height;
                the inner does MOTION. They cannot be the same element:
                Framer writes its own `transform` for `scale`, which would
                overwrite the centring transform and drop every side-placed
                card half its own height too low. */}
            <div className="ob-card-anchor" style={{ ...style, width: CARD_W }}>
                <motion.div
                    className="ob-card"
                    initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={spring}
                    role="dialog"
                    aria-label={step.title}
                >
                    <button
                        type="button"
                        className="ob-card-x"
                        onClick={onSkip}
                        aria-label="Skip the walkthrough"
                        title="Skip the walkthrough"
                    >
                        <X size={13} />
                    </button>
                    <strong className="ob-card-title">{step.title}</strong>
                    <p className="ob-card-body">{step.body}</p>
                    <button type="button" className="ob-card-go" onClick={onGotIt}>Got it</button>
                </motion.div>
            </div>
        </div>,
        document.body,
    );
}

/**
 * The welcome. One card, one idea, two equally-weighted ways out — "Show me
 * around" and "Skip" sit at the same visual weight on purpose: a doctor who
 * wants to start working immediately should not have to hunt for the quiet
 * grey escape hatch under the loud blue one.
 *
 * It teaches exactly one thing, because one thing is what a first screen can
 * carry: you do not fill in a form here. Everything else the workspace can
 * explain in place, at the moment it is true.
 */
export function WelcomeCard({
    doctorName, onStart, onSkip,
}: {
    doctorName: string | null;
    onStart: () => void;
    onSkip: () => void;
}) {
    const reduce = useReducedMotion();
    const first = (doctorName ?? "").trim().replace(/^d[r]\.?\s+/i, "").split(/\s+/)[0];

    return createPortal(
        <div className="ob-welcome-wrap" role="dialog" aria-modal="true" aria-label="Welcome to Cortex">
            <motion.div
                className="ob-welcome"
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
                <span className="ob-welcome-mark" aria-hidden="true">
                    <Stethoscope size={20} />
                </span>
                <strong className="ob-welcome-title">
                    {first ? `Welcome, Dr. ${first}` : "Welcome to Cortex"}
                </strong>
                <p className="ob-welcome-body">
                    Cortex thinks alongside you. Type what the patient tells you and it
                    ranks the conditions, tests and medicines worth considering — you
                    never fill in a form.
                </p>
                <p className="ob-welcome-hint">Three short pointers as you go. Skip them any time.</p>
                <div className="ob-welcome-actions">
                    <button type="button" className="ob-welcome-skip" onClick={onSkip}>Skip</button>
                    <button type="button" className="ob-welcome-go" onClick={onStart}>Show me around</button>
                </div>
            </motion.div>
        </div>,
        document.body,
    );
}

/** Everything the walkthrough draws, or nothing at all. */
export function OnboardingLayer({
    showWelcome, active, doctorName, onAcceptWelcome, onSkipAll, onDismissStep,
}: {
    showWelcome: boolean;
    active: { step: CoachStep; rect: AnchorRect } | null;
    doctorName: string | null;
    onAcceptWelcome: () => void;
    onSkipAll: () => void;
    onDismissStep: (id: string) => void;
}) {
    return (
        <>
            <AnimatePresence>
                {showWelcome && (
                    <WelcomeCard
                        key="welcome"
                        doctorName={doctorName}
                        onStart={onAcceptWelcome}
                        onSkip={onSkipAll}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {!showWelcome && active && (
                    <CoachMark
                        key={active.step.id}
                        step={active.step}
                        rect={active.rect}
                        onGotIt={() => onDismissStep(active.step.id)}
                        onSkip={onSkipAll}
                    />
                )}
            </AnimatePresence>
        </>
    );
}
