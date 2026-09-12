// ── The portal ──────────────────────────────────────────────────────────────
// The one-breath moment between "credentials accepted" (or "app just
// opened") and the workspace itself. Anmol, 2026-09-12: "whenever the doctor
// will log in... instead of just showing them a simple sign... could make it
// more interactive and better" — the login card's own "paper" identity
// (LoginPage.tsx) is deliberately quiet, matching arenode.com, so this is
// not a louder version of THAT screen. It is the hinge between it and
// Cortex's own dark/violet identity, played right where the two already
// meet — and, per the same conversation, again at every plain app-open, in
// place of the old "Connecting to AREN database…" text (App.tsx's `dbReady`
// gate).
//
// Nothing here is invented for the occasion. The AREN mark (`ArenMark.tsx`)
// already IS a constellation — nodes and connecting lines drawn as the
// letter A, "a nod to... one system, many connected points of care" by its
// own comment. This just draws that same mark stroke by stroke, node by
// node, the way a doctor would actually trace a constellation, ending on
// the one accent star the drawing already singles out. "Medical astronomy"
// is not a new theme; it is the theme this product already has, shown for
// once instead of glanced at.
//
// ── Two modes, one drawing ──────────────────────────────────────────────────
// TIMED (`waitFor` omitted) — the sign-in celebration. The data is already
// loaded by the time this mounts (LoginPage calls it only after
// `adoptIdentity` succeeds), so it just plays once, in full, then hands off
// on its own. First cut of this held only 1.35s — LESS than the drawing's
// own settle time (~1.53s), so it visibly cut the apex star's ignite
// keyframe off mid-flight: "you are undercutting it... the position is very
// much wrong" (Anmol, 2026-09-12) was two symptoms of that one bug, not two
// separate ones — a glow interrupted mid-scale reads as "in the wrong
// place" because it never reaches the place it was actually going. Fixed by
// holding well past the last element's own finish time, not by moving
// anything.
//
// WAITING (`waitFor` a boolean) — the boot screen. Mounted while real data
// is still in flight (App.tsx's doctor/hospital fetch), so it cannot just
// finish on a clock: it draws in once, holds on a soft looping pulse with
// `holdMessage` underneath, and exits the moment `waitFor` turns true —
// except never sooner than `MIN_MS`, so a fetch that resolves in 80ms still
// reads as a considered branded moment and not a flash. `timeoutMs` (a real
// gap this app had -- the old plain-text version could hang forever on a
// stuck network) gives up and calls `onTimeout` instead of `onDone`, so the
// caller can show its own "something went wrong" state.
//
// ── Why it can never be a tax on getting to work ────────────────────────────
// A doctor mid-shift signing back in after a dropped connection needs the
// queue, not a light show. So: `useReducedMotion()` renders a plain, static
// line instead of the drawing (never a delay itself -- the TIMED case
// finishes immediately, the WAITING case still genuinely waits for
// `waitFor`/`timeoutMs`, just without the animation), a click/tap/key skips
// the TIMED celebration outright (never the WAITING screen -- there is
// nothing honest to skip to before the data exists), and a hard safety
// timer calls the same outcome regardless if a transition event is ever
// missed.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

type Props = {
    /** The doctor/staff's stored name, already resolved by `loadIdentity` —
     *  never fetched here, this component owns no network of its own. */
    name?: string | null;
    /** Present ⇒ WAITING mode: the portal draws in, holds on a soft pulse,
     *  and exits once this turns true (never before `MIN_MS`). Omitted ⇒
     *  TIMED mode: a fixed-length greeting that always finishes on its own. */
    waitFor?: boolean;
    /** WAITING mode only — the line shown under the mark while it holds. */
    holdMessage?: string;
    /** WAITING mode only — call `onTimeout` instead of `onDone` if `waitFor`
     *  never turns true within this many ms of mount. Default 15s. */
    timeoutMs?: number;
    onTimeout?: () => void;
    onDone: () => void;
};

// The drawing's own timeline: the last element to animate in (the apex
// glow) finishes at 0.68s delay + 0.85s duration = 1.53s. Nothing may hold
// for less than that or it cuts something off mid-flight — see the header
// comment above.
const SETTLE_MS = 1550;
/** TIMED mode: how long to sit on the fully-settled frame before fading —
 *  comfortably past SETTLE_MS, long enough to actually read as "arrived",
 *  not "passing through". */
const HOLD_MS = 2300;
/** WAITING mode: the floor on total time on screen, so a fetch that
 *  resolves near-instantly still reads as a considered moment. Same number
 *  as HOLD_MS on purpose — one "this is how long the portal takes" beat,
 *  whichever mode is playing. */
const MIN_MS = 2300;
const DEFAULT_TIMEOUT_MS = 15000;
const FADE_MS = 500;

/**
 * Trim a stored name down to something short enough to greet with — and
 * NEVER add an honorific of its own. Anmol, 2026-09-12: "Doctor is already
 * written in most of the names, so don't [append] doctor by yourself." The
 * old line did exactly that (`Welcome back, Dr. ${firstWord}`), so a
 * `users.full_name` of "Dr Anmol Pandey" greeted the doctor as "Welcome
 * back, Dr. Dr" — the first WORD of that name is the honorific, not a name.
 *
 * So: if the stored name already opens with one, keep it and the name
 * beside it ("Dr Anmol"); otherwise just the first name ("Anmol"). Either
 * way the clinic's own convention is what shows, never one invented here.
 */
function greetingName(raw?: string | null): string | null {
    const parts = (raw ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    const honorific = /^(dr|doctor|prof|mr|mrs|ms|miss)\.?$/i.test(parts[0]);
    return honorific ? parts.slice(0, 2).join(" ") : parts[0];
}

export function SignInPortal({ name, waitFor, holdMessage, timeoutMs = DEFAULT_TIMEOUT_MS, onTimeout, onDone }: Props) {
    const reducedMotion = useReducedMotion();
    const waitingMode = waitFor !== undefined;
    const [exiting, setExiting] = useState(false);
    const firedRef = useRef(false);
    const outcomeRef = useRef<"done" | "timeout">("done");
    const mountedAt = useRef(performance.now());

    const finish = () => {
        if (firedRef.current) return;
        firedRef.current = true;
        if (outcomeRef.current === "timeout") onTimeout?.();
        else onDone();
    };

    const beginExit = (outcome: "done" | "timeout") => {
        if (firedRef.current) return;
        outcomeRef.current = outcome;
        // Reduced motion never shows the fade -- resolve straight away.
        if (reducedMotion) { finish(); return; }
        setExiting(true);
    };

    // TIMED mode: fixed hold, then exit, unconditionally. Reduced motion
    // skips straight to onDone -- the data is already loaded, there is
    // nothing left to wait for.
    useEffect(() => {
        if (waitingMode) return;
        if (reducedMotion) { finish(); return; }
        const toExit = setTimeout(() => beginExit("done"), HOLD_MS);
        // A safety net, not the real trigger -- see the CSS transitionend
        // handler below. If that event is ever missed (a tab thrown into
        // the background mid-fade, say), this still gets the doctor into
        // the app rather than stranding them on a dark screen.
        const safety = setTimeout(finish, HOLD_MS + FADE_MS + 400);
        return () => { clearTimeout(toExit); clearTimeout(safety); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waitingMode, reducedMotion]);

    // WAITING mode: exit the instant `waitFor` is true, but never before
    // MIN_MS of real wall-clock time has passed (reduced motion: never
    // artificially -- exit the instant it is true, full stop). A separate
    // hard timer gives up after `timeoutMs` regardless of `waitFor`.
    useEffect(() => {
        if (!waitingMode || !waitFor) return;
        const elapsed = performance.now() - mountedAt.current;
        const remaining = reducedMotion ? 0 : Math.max(0, MIN_MS - elapsed);
        const t = setTimeout(() => beginExit("done"), remaining);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waitingMode, waitFor, reducedMotion]);

    useEffect(() => {
        if (!waitingMode) return;
        const t = setTimeout(() => beginExit("timeout"), timeoutMs);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waitingMode, timeoutMs]);

    // Reduced motion: a plain, static line -- no drawing, no fade, but
    // WAITING mode still genuinely blocks on `waitFor`/`timeoutMs` above;
    // this is only ever a visual simplification, never a shortcut past the
    // real wait.
    if (reducedMotion) {
        if (!waitingMode) return null;
        return (
            <div className="sip-root sip-root--plain" role="status" aria-label={holdMessage ?? "Loading"}>
                <style>{SIP_PLAIN_CSS}</style>
                <p className="sip-plain-line">{holdMessage ?? "Setting things up…"}</p>
            </div>
        );
    }

    const greeting = greetingName(name);
    const line = waitingMode
        ? (holdMessage ?? "Setting things up…")
        : greeting ? `Welcome back, ${greeting}`
            : "Welcome back";

    return (
        <div
            className={`sip-root${exiting ? " is-exiting" : ""}`}
            role="status"
            aria-label={waitingMode ? (holdMessage ?? "Loading") : "Signing in"}
            onClick={waitingMode ? undefined : finish}
            onKeyDown={waitingMode ? undefined : finish}
            onTransitionEnd={(e) => { if (e.propertyName === "opacity" && exiting) finish(); }}
        >
            <style>{SIP_CSS}</style>
            <div className="sip-nebula" aria-hidden="true" />
            <div className="sip-stage">
                <motion.svg
                    width={116}
                    height={116}
                    viewBox="0 0 64 64"
                    fill="none"
                    className={`sip-mark${waitingMode ? " sip-mark--pulse" : ""}`}
                    aria-hidden="true"
                >
                    {/* Legs of the A, drawn node-to-node — same paths as
                        ArenMark, just traced live instead of shown static. */}
                    <motion.path
                        d="M13 53 L23.5 37.5 L28 26.5 L33 12"
                        stroke="#e9e2ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.9 }}
                        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
                    />
                    <motion.path
                        d="M33 12 L41.5 37.5 L50 53"
                        stroke="#e9e2ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.9 }}
                        transition={{ duration: 0.5, ease: "easeOut", delay: 0.28 }}
                    />
                    <motion.path
                        d="M23.5 37.5 L41.5 37.5"
                        stroke="#e9e2ff" strokeWidth="1.6" strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 0.55 }}
                        transition={{ duration: 0.28, ease: "easeOut", delay: 0.5 }}
                    />
                    {[
                        { cx: 13, cy: 53, r: 2.6, o: 0.92, delay: 0.06 },
                        { cx: 50, cy: 53, r: 2.6, o: 0.92, delay: 0.06 },
                        { cx: 23.5, cy: 37.5, r: 2.2, o: 0.75, delay: 0.36 },
                        { cx: 41.5, cy: 37.5, r: 2.2, o: 0.75, delay: 0.36 },
                        { cx: 28, cy: 26.5, r: 1.6, o: 0.55, delay: 0.56 },
                    ].map((n) => (
                        <motion.circle
                            key={`${n.cx}-${n.cy}`}
                            cx={n.cx} cy={n.cy} r={n.r} fill="#e9e2ff"
                            style={{ transformOrigin: `${n.cx}px ${n.cy}px` }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: n.o, scale: 1 }}
                            transition={{ duration: 0.32, ease: "backOut", delay: n.delay }}
                        />
                    ))}
                    {/* The apex — the one accent star ArenMark already singles
                        out, here the thing the whole drawing builds toward.
                        In WAITING mode, `.sip-mark--pulse` (a plain CSS
                        keyframe, timed to start right as this settles) keeps
                        it gently breathing for however long the real wait
                        runs — cheap, since it's one small SVG circle, not
                        the full-viewport cost the nebula asset was. */}
                    <motion.circle
                        cx={33} cy={12} r={8} fill="#a855f7"
                        style={{ transformOrigin: "33px 12px" }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: [0, 0.4, 0.20], scale: [0, 1.7, 1.3] }}
                        transition={{ duration: 0.85, delay: 0.68, times: [0, 0.55, 1] }}
                    />
                    <motion.circle
                        cx={33} cy={12} r={3.4} fill="#d5bbff"
                        style={{ transformOrigin: "33px 12px" }}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.32, ease: "backOut", delay: 0.72 }}
                    />
                </motion.svg>

                <motion.p
                    className="sip-line"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 1.0 }}
                >
                    {line}
                </motion.p>
            </div>
        </div>
    );
}

const SIP_CSS = `
.sip-root {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: grid;
    place-items: center;
    background: #050916;
    overflow: hidden;
    cursor: pointer;
    opacity: 1;
    transition: opacity ${FADE_MS}ms ease;
}
.sip-root.is-exiting {
    opacity: 0;
}
/* This was aren-nebula.svg (the same asset WorkspaceHeader paints into
   every dark header) at full-viewport size. Removing it -- and ONLY it --
   was what fixed a real, reproducible bug: this component was taking
   ~4s to hand off instead of ~1.5-2s, confirmed by instrumenting a
   standalone render (every setTimeout inside it fired exactly on
   schedule in isolation, but landed together, seconds late, specifically
   whenever that image was in the tree). The asset carries 6 internal
   feGaussianBlur filters -- cheap to rasterize at a 64-84px header
   strip, not cheap at full viewport height, and this is a screen with no
   GPU-accelerated path to fall back on in some environments.

   A plain CSS radial-gradient glow is what the rest of this app already
   uses for "violet bloom on navy" wherever the source isn't the nebula
   PNG/SVG itself -- .ws-header's own vignette, .rail-head::before's
   corner bloom -- so this isn't a downgrade from the real thing, it's
   the same technique those already use, and it costs one gradient fill,
   not a filter pass over every pixel on screen. */
.sip-nebula {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
        radial-gradient(720px 480px at 22% 28%, rgba(139, 92, 246, 0.16) 0%, transparent 70%),
        radial-gradient(560px 420px at 78% 74%, rgba(99, 58, 200, 0.13) 0%, transparent 72%);
}
.sip-stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
}
.sip-mark {
    filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.38));
}
/* WAITING mode's hold -- a slow, small breathe on the whole mark so a long
   wait reads as "alive", not stalled. Delayed to start exactly when the
   draw-in's own last keyframe (the apex glow, at 0.68s + 0.85s) finishes,
   so there's no seam between "drawing" and "holding". */
.sip-mark--pulse {
    animation: sip-pulse 2.1s ease-in-out 1.53s infinite;
}
@keyframes sip-pulse {
    0%, 100% { filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.38)); transform: scale(1); }
    50% { filter: drop-shadow(0 0 30px rgba(139, 92, 246, 0.56)); transform: scale(1.035); }
}
.sip-line {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: rgba(255, 255, 255, 0.88);
    text-shadow: 0 2px 14px rgba(5, 9, 22, 0.7);
    text-align: center;
}
`;

// Reduced-motion WAITING fallback: no drawing, no pulse, just the dark
// screen and the message, for however long the real wait takes.
const SIP_PLAIN_CSS = `
.sip-root--plain {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: grid;
    place-items: center;
    background: #050916;
}
.sip-plain-line {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.82);
}
`;
