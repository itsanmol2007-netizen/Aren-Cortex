// ── The whole pre-auth surface ─────────────────────────────────────────────
// Everything a visitor sees before a session exists: the brand lockup, the
// marketing copy, the bubbles behind it, and a slot the two card screens
// (WelcomePage's "Let's get started", LoginPage's credential form) render
// into through <Outlet/>.
//
// ── Why the COPY lives here and not in WelcomePage ────────────────────────
// It is welcome-screen content, so the obvious home for it is WelcomePage —
// and that is where it started. But the two screens are not two pages, they
// are one composition in two states, and Anmol was precise about what the
// move between them should look like (2026-09-12): "why don't you give a
// slight bit of fade animation to these text which is like 'you practice,
// we handle the rest' and all, and then those bubbles slightly moving like
// they are 3D bubbles, and this 'let's get started' thing moving in the
// center."
//
// Three things move, together, and none of them can be choreographed from
// inside a route that unmounts:
//   1. the copy FADES OUT (AnimatePresence exit — it has to outlive its own
//      removal for half a second to fade at all),
//   2. the card SLIDES TO CENTRE (a Framer `layout` animation on the slot:
//      when the copy leaves the flex row, the slot's own box moves, and
//      `layout` animates that move instead of cutting to it),
//   3. the bubbles drift to a second arrangement.
// Putting the copy in the layout is what buys all three. It replaced a
// version where the card simply jumped: "you are clicking on sign in and
// then randomly this thing, this model moves in between center of the
// page."
//
// ── The bubbles ───────────────────────────────────────────────────────────
// Plain CSS radial-gradient blobs with a CSS blur, floating on their own
// slow keyframes, with Framer driving only the route-change offset on a
// WRAPPER element (never the same property as the float, or the two fight).
// Not an SVG asset with filters baked in — see SignInPortal.tsx's own note
// on the four-second bug that cost.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Outlet, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Send, Sparkles, User } from "lucide-react";
import arenLogo from "../../assets/aren-logo-w.png";

const FEATURES = [
    { icon: User, lines: ["One patient.", "One visit."] },
    { icon: Sparkles, lines: ["Your Intelligent", "Autocomplete (Synapse)."] },
    { icon: Send, lines: ["The prescription", "reaches them before they leave."] },
] as const;

export function AuthLayout() {
    const location = useLocation();
    const outlet = useOutlet();
    const reducedMotion = useReducedMotion();
    const isSignin = location.pathname.startsWith("/login/signin");

    /**
     * The stage narrows to a single centred column only ONCE THE COPY HAS
     * FINISHED FADING, not the moment the route changes.
     *
     * Driving the narrow layout straight off `isSignin` was a real bug:
     * the CSS flipped on the same frame as the click, so the copy — still
     * mounted, still mid-fade — was reflowed into a 460px column and
     * visibly wrapped itself into "You / Practice, / We / Handle / the /
     * Rest!" on its way out. It has to keep the box it was laid out in
     * until it is gone; `onExitComplete` is when that is true.
     *
     * Starts equal to `isSignin` so a direct load of /login/signin (no
     * transition to wait for) is already narrow on its first paint.
     */
    const [copyGone, setCopyGone] = useState(isSignin);
    useEffect(() => {
        if (!isSignin) setCopyGone(false);
        else if (reducedMotion) setCopyGone(true); // no exit animation to wait on
    }, [isSignin, reducedMotion]);

    const spring = reducedMotion
        ? { duration: 0 }
        : { type: "spring" as const, stiffness: 90, damping: 20, mass: 0.9 };

    return (
        <div className={`auth-shell${isSignin ? " is-signin" : ""}${copyGone ? " is-narrow" : ""}`}>
            <style>{AUTH_LAYOUT_CSS}</style>

            {/* ── The bubbles ───────────────────────────────────────────
                Each is a wrapper (Framer: route-driven offset only) around
                an inner element (CSS: its own slow float). Two systems,
                two different elements, so neither overwrites the other's
                transform. */}
            <motion.div
                className="auth-bubble-wrap auth-bubble-wrap--wash-tr"
                animate={isSignin ? { x: -70, y: 50, scale: 1.08 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            >
                <div className="auth-bubble auth-bubble--wash-tr" />
            </motion.div>

            <motion.div
                className="auth-bubble-wrap auth-bubble-wrap--orb"
                animate={isSignin ? { x: -120, y: -40, scale: 1.15 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            >
                <div className="auth-bubble auth-bubble--orb" />
            </motion.div>

            <motion.div
                className="auth-bubble-wrap auth-bubble-wrap--wash-br"
                animate={isSignin ? { x: 40, y: 60, scale: 1.1 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            >
                <div className="auth-bubble auth-bubble--wash-br" />
            </motion.div>

            <motion.div
                className="auth-bubble-wrap auth-bubble-wrap--wash-bl"
                animate={isSignin ? { x: 60, y: -30, scale: 1.05 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            >
                <div className="auth-bubble auth-bubble--wash-bl" />
            </motion.div>

            {/* The thin drawn curves the reference runs down its right
                side — vector strokes, no filter, effectively free. */}
            <svg className="auth-curves" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
                <motion.path
                    d="M 1105 -40 C 1330 170, 1395 520, 1180 770 S 1215 1035, 960 1010"
                    fill="none"
                    stroke="rgba(124, 58, 237, 0.20)"
                    strokeWidth="1.4"
                    animate={{ opacity: isSignin ? 0.45 : 1 }}
                    transition={spring}
                />
                <motion.path
                    d="M 1290 980 C 1180 890, 1230 700, 1420 640"
                    fill="none"
                    stroke="rgba(236, 72, 153, 0.16)"
                    strokeWidth="1.2"
                    animate={{ opacity: isSignin ? 0.3 : 1 }}
                    transition={spring}
                />
            </svg>

            <div className="auth-page">
                <div className="auth-top">
                    <div className="auth-brand">
                        <img src={arenLogo} alt="" className="auth-brand-mark" />
                        <div className="auth-brand-text">
                            <span className="auth-brand-name">AREN</span>
                            <span className="auth-brand-sub">CLINICAL OPERATING SYSTEM</span>
                        </div>
                    </div>
                    <div className="auth-corner">
                        <span>BUILT FOR</span>
                        <span>A HEALTHIER</span>
                        <span>TOMORROW</span>
                        <div className="auth-corner-rule" />
                    </div>
                </div>

                {/* Sequenced on purpose, and the sequence is the ask: the
                    copy fades FIRST (AnimatePresence's default sync mode —
                    the exiting element keeps its box while it fades, so
                    nothing else moves yet), and only once it unmounts does
                    the slot's `layout` glide the card into the middle.
                    `popLayout` was tried here first and is wrong for this:
                    it yanks the exiting element out of flow, so the copy
                    jumped to the centre of the page mid-fade instead of
                    dissolving where it stood. */}
                <div className="auth-stage">
                    <AnimatePresence initial={false} onExitComplete={() => setCopyGone(true)}>
                        {!isSignin && (
                            <motion.div
                                key="copy"
                                className="auth-copy"
                                initial={{ opacity: 0, x: -18 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -34 }}
                                transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
                            >
                                <h1 className="auth-headline">
                                    You Practice,
                                    <br />
                                    <em className="auth-headline-accent">We Handle the Rest!</em>
                                </h1>

                                <p className="auth-tagline">
                                    LESS FRICTION. MORE CARE.
                                    <span className="auth-rule" />
                                </p>

                                <ul className="auth-features">
                                    {FEATURES.map(({ icon: Icon, lines }) => (
                                        <li key={lines[0]} className="auth-feature">
                                            <span className="auth-feature-icon">
                                                <Icon size={21} strokeWidth={1.9} />
                                            </span>
                                            <span className="auth-feature-text">
                                                {lines[0]}<br />{lines[1]}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.div className="auth-card-slot" layout transition={spring}>
                        {/* No crossfade here, deliberately. An
                            AnimatePresence "wait" swap (old card fades
                            fully out, then the new one fades in) left
                            roughly a third of a second with NO card
                            anywhere on screen — white card on near-white
                            paper is invisible well before opacity actually
                            reaches zero — so the card read as vanishing and
                            reappearing rather than moving. The new content
                            takes over instantly and lifts the last of the
                            way in; the card box is never empty, and the
                            movement people actually watch is the slot's
                            `layout` glide. */}
                        <motion.div
                            key={isSignin ? "signin" : "welcome"}
                            initial={{ opacity: 0.45 }}
                            animate={{ opacity: 1 }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
                        >
                            {outlet ?? <Outlet />}
                        </motion.div>
                    </motion.div>
                </div>

                <div className="auth-foot">
                    <AnimatePresence initial={false}>
                        {!isSignin && (
                            <motion.span
                                key="trusted"
                                className="auth-foot-item"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
                            >
                                <span className="auth-rule auth-rule--lead" />
                                TRUSTED BY CLINICS
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <span className="auth-foot-item auth-foot-item--right">
                        <span className="auth-rule auth-rule--lead" />
                        CLINICS <span className="auth-dot" /> PEOPLE <span className="auth-dot" /> PROGRESS
                    </span>
                </div>
            </div>
        </div>
    );
}

const AUTH_LAYOUT_CSS = `
.auth-shell {
    --lg-paper: #fbfaf8;
    --lg-paper-2: #f4f2ee;
    --lg-paper-3: #ece9e3;
    --lg-ink: #0c0d0c;
    --lg-ink-2: #1c1e1c;
    --lg-muted: #6a6a63;
    --lg-faint: #9a9a93;
    --lg-line: rgba(12, 13, 12, 0.09);
    --lg-line-2: rgba(12, 13, 12, 0.16);
    --lg-accent: #6311d3;
    --lg-accent-soft: #f1e8fb;
    --lg-accent-ink: #4a0da1;
    --lg-sans: "Geist", ui-sans-serif, system-ui, sans-serif;
    --lg-mono: "Geist Mono", ui-monospace, monospace;
    --lg-serif: "Newsreader", Georgia, serif;
    --lg-radius: 0.75rem;

    position: fixed;
    inset: 0;
    overflow-y: auto;
    overflow-x: hidden;
    background:
        linear-gradient(160deg, #ffffff 0%, #fdfbff 45%, #fdf7fb 100%);
    font-family: var(--lg-sans);
    color: var(--lg-ink);
    z-index: 50;
}

/* ── Bubbles ──────────────────────────────────────────────────────────── */
.auth-bubble-wrap {
    position: fixed;
    pointer-events: none;
    will-change: transform;
}
.auth-bubble {
    width: 100%;
    height: 100%;
    border-radius: 50%;
}
@keyframes auth-float-a {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(-14px, 18px, 0) scale(1.04); }
}
@keyframes auth-float-b {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(16px, -20px, 0) scale(1.06); }
}
@keyframes auth-float-c {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    50% { transform: translate3d(-18px, -12px, 0) scale(1.03); }
}
@media (prefers-reduced-motion: reduce) {
    .auth-bubble { animation: none !important; }
}

/* Top-right lavender wash. */
.auth-bubble-wrap--wash-tr {
    top: -260px;
    right: -180px;
    width: 760px;
    height: 620px;
}
.auth-bubble--wash-tr {
    background: radial-gradient(closest-side,
        rgba(196, 181, 253, 0.55) 0%,
        rgba(216, 180, 254, 0.28) 55%,
        transparent 78%);
    filter: blur(50px);
    animation: auth-float-a 22s ease-in-out infinite;
}

/* The distinct 3D-looking orb on the right edge — the one the reference
   reads as an actual sphere rather than a wash: an off-centre highlight,
   a saturated core, a pink falloff, and only enough blur to soften the
   rim without dissolving the ball. */
.auth-bubble-wrap--orb {
    top: 34%;
    right: -40px;
    width: 260px;
    height: 260px;
}
.auth-bubble--orb {
    background: radial-gradient(circle at 34% 28%,
        rgba(237, 233, 254, 0.95) 0%,
        rgba(167, 139, 250, 0.88) 34%,
        rgba(192, 132, 252, 0.80) 58%,
        rgba(244, 114, 182, 0.68) 82%,
        rgba(251, 207, 232, 0.42) 100%);
    filter: blur(14px);
    animation: auth-float-b 18s ease-in-out infinite;
}

/* Bottom-right pink swath. */
.auth-bubble-wrap--wash-br {
    bottom: -320px;
    right: -220px;
    width: 1000px;
    height: 760px;
}
.auth-bubble--wash-br {
    background: radial-gradient(closest-side,
        rgba(244, 171, 215, 0.50) 0%,
        rgba(216, 180, 254, 0.30) 52%,
        transparent 76%);
    filter: blur(60px);
    animation: auth-float-c 26s ease-in-out infinite;
}

/* Bottom-left, very quiet — keeps the left column from floating on flat
   white without competing with the copy. */
.auth-bubble-wrap--wash-bl {
    bottom: -300px;
    left: -240px;
    width: 780px;
    height: 640px;
}
.auth-bubble--wash-bl {
    background: radial-gradient(closest-side,
        rgba(221, 214, 254, 0.34) 0%,
        transparent 72%);
    filter: blur(60px);
    animation: auth-float-a 30s ease-in-out infinite;
}

.auth-curves {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

/* ── Page frame ───────────────────────────────────────────────────────── */
.auth-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 38px clamp(20px, 5vw, 90px) 34px;
    box-sizing: border-box;
}

.auth-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
}
.auth-brand {
    display: flex;
    align-items: center;
    gap: 13px;
}
.auth-brand-mark {
    width: 46px;
    height: 46px;
    object-fit: contain;
}
.auth-brand-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    line-height: 1;
}
.auth-brand-name {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--lg-ink);
}
.auth-brand-sub {
    font-family: var(--lg-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.15em;
    color: var(--lg-faint);
}
.auth-corner {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    font-family: var(--lg-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--lg-muted);
    text-align: right;
}
.auth-corner-rule {
    width: 34px;
    height: 1px;
    background: var(--lg-line-2);
    margin-top: 9px;
}

/* ── The stage: copy + card ───────────────────────────────────────────── */
/* Left-biased on purpose, with a deliberate right gutter the bubbles live
   in — the reference does NOT run the card to the right edge, it stops it
   around three-quarters across and leaves the orb room to breathe. */
.auth-stage {
    display: flex;
    align-items: center;
    gap: clamp(24px, 3.4vw, 58px);
    width: 100%;
    max-width: 1240px;
    margin: auto 0;
}
/* Narrow + centred — but keyed off .is-narrow, which only lands once
   the copy has finished fading out (see the component's own note), not
   off .is-signin, which lands on the click itself. */
.is-narrow .auth-stage {
    max-width: 460px;
    margin: auto;
}

.auth-copy {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 660px;
}
.auth-headline {
    margin: 0;
    font-family: var(--lg-serif);
    font-weight: 600;
    font-size: clamp(40px, 5.1vw, 80px);
    line-height: 1.03;
    letter-spacing: -0.02em;
    color: var(--lg-ink);
}
.auth-headline-accent {
    font-style: italic;
    background: linear-gradient(96deg, #4f46e5 0%, #7c3aed 32%, #a855f7 62%, #ec4899 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
.auth-tagline {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 26px 0 0;
    font-family: var(--lg-mono);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.16em;
    color: var(--lg-muted);
}
.auth-rule {
    width: 46px;
    height: 1px;
    background: var(--lg-line-2);
    flex-shrink: 0;
}
.auth-rule--lead {
    width: 26px;
}

.auth-features {
    list-style: none;
    margin: 38px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
}
.auth-feature {
    display: flex;
    align-items: center;
    gap: 18px;
}
.auth-feature-icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 15px;
    background: rgba(237, 233, 254, 0.85);
    color: #6d28d9;
}
.auth-feature-text {
    font-family: var(--lg-serif);
    font-size: 20px;
    line-height: 1.35;
    color: var(--lg-ink-2);
}

.auth-card-slot {
    flex: 0 0 clamp(300px, 30vw, 452px);
    max-width: 100%;
}
.is-narrow .auth-card-slot {
    flex: 0 0 auto;
    width: 100%;
}

/* ── Footer row ───────────────────────────────────────────────────────── */
.auth-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: 28px;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--lg-faint);
}
.auth-foot-item {
    display: flex;
    align-items: center;
    gap: 10px;
}
.auth-foot-item--right {
    margin-left: auto;
}
.auth-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--lg-faint);
}

@media (max-width: 940px) {
    .auth-stage {
        flex-direction: column;
        align-items: stretch;
        gap: 36px;
        margin: 40px 0;
    }
    .auth-card-slot {
        flex: 0 0 auto;
    }
    .auth-corner { display: none; }
}
`;
