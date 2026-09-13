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

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CloudOff, MessageCircle, MonitorDown, Send, Sparkles, User } from "lucide-react";
import arenLogo from "../../assets/aren-logo-w.png";

const FEATURES = [
    { icon: User, lines: ["One patient.", "One visit."] },
    { icon: Sparkles, lines: ["Your Intelligent", "Autocomplete (Synapse)."] },
    { icon: Send, lines: ["The prescription", "reaches them before they leave."] },
] as const;

export function AuthLayout() {
    const location = useLocation();
    const navigate = useNavigate();
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

    /** The card's own move. Softer and better damped than the bubbles'
     *  spring: this one carries text a person is about to read, so it must
     *  settle without the overshoot that looks lively on a background blob
     *  and merely unsteady under a form. */
    const cardMove = reducedMotion
        ? { duration: 0 }
        : { type: "spring" as const, stiffness: 140, damping: 26, mass: 0.7 };

    /**
     * Pointer parallax on the bubbles — the cheapest version of it that
     * still reads as depth. Anmol, 2026-09-12: "maybe just slight bit of
     * animations when you are hovering your mouse here and there in those
     * bubbles. Not very dramatic... use the simplest animation there
     * possible."
     *
     * So: no per-bubble listeners, no library, no React state (state would
     * re-render this whole subtree on every mouse move). One listener on
     * the shell writes two numbers into CSS custom properties, and the
     * bubbles read them in their own `translate`, each with its own
     * `--depth` so the nearer ones move further — which is the entire
     * trick to making flat circles look like they sit at different
     * distances.
     *
     * `translate` and not `transform`, deliberately: the float keyframe
     * already owns `transform` on the same element, and the two would
     * overwrite each other. They are separate CSS properties and compose.
     *
     * rAF-coalesced, so a mouse reporting 500 events a second still costs
     * at most one style write per frame. Skipped entirely under reduced
     * motion or on a touch device, where there is no hover to respond to.
     */
    /**
     * Click anywhere off the card to go back to the welcome screen.
     *
     * The sign-in form had no way back at all once you were in it —
     * "whenever you click somewhere out of the model, it will take you
     * back to that previous screen... but right now when you come into
     * this login thing, there is no any way to back" (Anmol, 2026-09-13).
     *
     * Guarded three ways so it can never eat a real interaction: only on
     * the sign-in route, only for a primary click, and only when the click
     * did not land inside the card (`closest`, so anything in the form —
     * inputs, the eye toggle, the links in its footer — is untouched).
     * A visible "Back" control lives on the card itself as well; a
     * click-off that nothing announces is a shortcut, not an exit.
     */
    const onShellClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isSignin || e.button !== 0) return;
        if ((e.target as HTMLElement).closest(".auth-card-slot")) return;
        navigate("/login");
    };

    /**
     * The card's height, measured, so the box can animate to a real number.
     *
     * Third attempt at this transition, and the first two each fixed one
     * half and broke the other:
     *   - plain `layout` animates size with a SCALE transform, so the card
     *     spent the move as stretched type and squashed inputs;
     *   - `layout="position"` removed the distortion by removing the size
     *     animation altogether — which is exactly what was reported next:
     *     "it expands (without any animation, just directly) and then the
     *     next frame it's in the centre" (Anmol, 2026-09-13).
     *
     * Both are avoidable: position comes from `layout="position"` (a
     * transform, cheap, no distortion) and SIZE comes from animating the
     * `height` property itself against a measured target. Nothing is
     * scaled, so nothing distorts, and both halves move together.
     *
     * A ResizeObserver keeps the target honest after the swap too — the
     * sign-in card grows when a validation banner appears, and the box
     * should follow that rather than clipping it.
     */
    const measureRef = useRef<HTMLDivElement>(null);
    const [cardHeight, setCardHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        const el = measureRef.current;
        if (!el) return;
        const sync = () => setCardHeight(el.offsetHeight);
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        return () => ro.disconnect();
    }, [isSignin]);

    const shellRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = shellRef.current;
        if (!el || reducedMotion) return;
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

        let frame = 0;
        let nx = 0;
        let ny = 0;
        const write = () => {
            frame = 0;
            el.style.setProperty("--ax", nx.toFixed(3));
            el.style.setProperty("--ay", ny.toFixed(3));
        };
        const onMove = (e: PointerEvent) => {
            nx = e.clientX / window.innerWidth - 0.5;
            ny = e.clientY / window.innerHeight - 0.5;
            if (!frame) frame = requestAnimationFrame(write);
        };
        const onLeave = () => {
            nx = 0;
            ny = 0;
            if (!frame) frame = requestAnimationFrame(write);
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerleave", onLeave, { passive: true });
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [reducedMotion]);

    return (
        <div
            ref={shellRef}
            onClick={onShellClick}
            className={`auth-shell${isSignin ? " is-signin" : ""}${copyGone ? " is-narrow" : ""}`}
        >
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
                    <div className="auth-brand auth-in auth-in-1">
                        <img src={arenLogo} alt="" className="auth-brand-mark" />
                        <div className="auth-brand-text">
                            <span className="auth-brand-name">AREN</span>
                            <span className="auth-brand-sub">CLINICAL OPERATING SYSTEM</span>
                        </div>
                    </div>
                    <div className="auth-corner auth-in auth-in-2">
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
                                /* `initial={false}` on purpose: the copy's
                                   own CHILDREN stagger themselves in via
                                   CSS (.auth-in). Fading the whole block
                                   here as well would just put a second,
                                   flatter animation on top of that one and
                                   hide it. Framer still owns the EXIT. */
                                initial={false}
                                exit={{ opacity: 0, x: -34 }}
                                transition={reducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
                            >
                                <h1 className="auth-headline auth-in auth-in-2">
                                    You Practice,
                                    <br />
                                    <em className="auth-headline-accent">We Handle the Rest!</em>
                                </h1>

                                <p className="auth-tagline auth-in auth-in-4">
                                    LESS FRICTION. MORE CARE.
                                    <span className="auth-rule" />
                                </p>

                                <ul className="auth-features auth-in-list">
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

                                {/* Three facts a doctor arriving cold from
                                    an email link actually wants, in the
                                    smallest form that carries them — asked
                                    for as "some useful things", explicitly
                                    not clutter. Each one is something this
                                    app really does, not a slogan. */}
                                <ul className="auth-facts">
                                    <li><CloudOff size={13} strokeWidth={2} /> Keeps working offline</li>
                                    <li><MonitorDown size={13} strokeWidth={2} /> Installs like a desktop app</li>
                                    <li><MessageCircle size={13} strokeWidth={2} /> Sends the prescription on WhatsApp</li>
                                </ul>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* `layout="position"` and NOT plain `layout`.

                        Plain `layout` animates the box's SIZE as well as its
                        place, and Framer does that with a scale transform —
                        so the welcome card (short) becoming the sign-in form
                        (tall) spent the whole move as stretched, squashed
                        type and controls. That is what "when you click on
                        sign in, the animation... is very terrible" was
                        (Anmol, 2026-09-13). Position-only means the box
                        takes its new size immediately and only GLIDES to its
                        new place: nothing is ever scaled, so nothing is ever
                        distorted. */}
                    <motion.div
                        /* The intro class deliberately does NOT go here.
                           `auth-rise` is a CSS animation with `both` fill, so
                           it keeps `transform` applied on this element for
                           good — and a CSS animation outranks an inline
                           style, so it silently overrode the transform Framer
                           uses for the `layout` glide. The card jumped
                           straight to centre while its height animated
                           correctly beside it. The intro now runs on the clip
                           INSIDE, which owns no transform Framer needs. */
                        className="auth-card-slot"
                        layout="position"
                        /* `null` on the very first paint means "no height
                           opinion yet" — the card lays out naturally and is
                           measured, rather than animating up from zero on
                           load. */
                        animate={cardHeight == null ? undefined : { height: cardHeight }}
                        transition={cardMove}
                    >
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
                        <div className="auth-card-clip auth-in auth-in-3">
                            <div ref={measureRef}>
                                <motion.div
                                    key={isSignin ? "signin" : "welcome"}
                                    initial={{ opacity: 0.45 }}
                                    animate={{ opacity: 1 }}
                                    transition={reducedMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
                                >
                                    {outlet ?? <Outlet />}
                                </motion.div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                <div className="auth-foot auth-in auth-in-6">
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
                    {/* Was "CLINICS · PEOPLE · PROGRESS", which said
                        nothing and did nothing — "progress doesn't make any
                        sense" (Anmol, 2026-09-13). Two real destinations
                        instead, in the same quiet register. */}
                    <span className="auth-foot-item auth-foot-item--right">
                        <a className="auth-foot-link" href="https://arenode.com" target="_blank" rel="noreferrer">
                            ARENODE.COM
                        </a>
                        <span className="auth-dot" />
                        <a className="auth-foot-link" href="mailto:care@arenode.com">
                            CARE@ARENODE.COM
                        </a>
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
    /* Pointer parallax. --ax/--ay are written by the shell (one rAF-
       coalesced listener, see the component); --depth is per-bubble, and
       the spread between depths is what sells these flat circles as
       sitting at different distances. translate, not transform: the
       float keyframe below owns transform on this same element. */
    translate: calc(var(--ax, 0) * var(--depth, 12px)) calc(var(--ay, 0) * var(--depth, 12px));
    transition: translate 600ms cubic-bezier(0.22, 0.68, 0, 1);
}
@media (prefers-reduced-motion: reduce) {
    .auth-bubble { translate: none; transition: none; }
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
    --depth: 26px;
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
    --depth: 54px;
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
    --depth: 18px;
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
    --depth: 12px;
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

/* ── The way in ───────────────────────────────────────────────────────────
   Anmol, 2026-09-12: "there should be also a starting animation when you
   just start the app or load the website... not something very hard, but
   something beautiful... not something like you open the app and it
   randomly pops up."

   One keyframe, and delays. No library, no per-element JS, nothing to
   coordinate: a CSS animation runs when its element is first painted, so
   this costs exactly one composited opacity+transform pass per element and
   is over in under a second. both holds the from-state before the delay
   elapses, which is what stops the flash of everything-at-once that a
   delay without it would give.

   Persistent chrome (the brand, the card slot, the footer) animates once
   on load and never again, because those elements stay mounted across the
   welcome/sign-in change. The copy's own children are remounted by the
   route, so they replay it — which is correct: they really are arriving
   again. */
@keyframes auth-rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
}
.auth-in,
.auth-in-list > * {
    animation: auth-rise 620ms cubic-bezier(0.22, 0.68, 0, 1) both;
}
.auth-in-1 { animation-delay: 60ms; }
.auth-in-2 { animation-delay: 130ms; }
.auth-in-3 { animation-delay: 210ms; }
.auth-in-4 { animation-delay: 290ms; }
.auth-in-6 { animation-delay: 520ms; }
/* The three feature rows, one after another, off the tagline's beat. */
.auth-in-list > *:nth-child(1) { animation-delay: 350ms; }
.auth-in-list > *:nth-child(2) { animation-delay: 410ms; }
.auth-in-list > *:nth-child(3) { animation-delay: 470ms; }

@media (prefers-reduced-motion: reduce) {
    .auth-in,
    .auth-in-list > * { animation: none; }
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

/* The clipping box the animated height acts on. It carries the card's
   drop shadow instead of the card, because overflow: hidden clips a
   CHILD's shadow — moving it up here means the box can crop the card
   mid-transition (which is what stops the content squashing) without
   ever cropping the shadow around it. */
.auth-card-clip {
    height: 100%;
    overflow: hidden;
    border-radius: 20px;
    box-shadow:
        0 32px 70px -30px rgba(58, 30, 92, 0.28),
        0 2px 10px rgba(12, 13, 12, 0.04);
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
/* The three capability facts under the features. Deliberately typed DOWN
   from the feature rows above them -- they are supporting detail, and a
   first-time visitor should read the three big promises first. */
.auth-facts {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 10px;
    margin: 30px 0 0;
    padding: 0;
}
.auth-facts li {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid var(--lg-line);
    background: rgba(255, 255, 255, 0.55);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--lg-muted);
}
.auth-facts svg { color: var(--lg-accent); flex: none; }

.auth-foot-link {
    color: inherit;
    text-decoration: none;
    letter-spacing: inherit;
    transition: color 140ms ease;
}
.auth-foot-link:hover { color: var(--lg-accent-ink); }

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
