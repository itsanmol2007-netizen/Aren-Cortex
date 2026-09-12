// ── The portal ──────────────────────────────────────────────────────────────
// The one-breath moment between "credentials accepted" and the workspace
// itself. Anmol, 2026-09-12: "whenever the doctor will log in... instead of
// just showing them a simple sign... could make it more interactive and
// better" — the login card's own "paper" identity (LoginPage.tsx) is
// deliberately quiet, matching arenode.com, so this is not a louder version
// of THAT screen. It is the hinge between it and Cortex's own dark/violet
// identity, played once, right where the two already meet.
//
// Nothing here is invented for the occasion. The AREN mark (`ArenMark.tsx`)
// already IS a constellation — nodes and connecting lines drawn as the
// letter A, "a nod to... one system, many connected points of care" by its
// own comment — and the nebula behind it is the exact asset `WorkspaceHeader`
// paints into every dark header in the app. This just draws that same mark
// stroke by stroke, node by node, the way a doctor would actually trace a
// constellation, ending on the one accent star the drawing already singles
// out. "Medical astronomy" is not a new theme; it is the theme this product
// already has, shown for once instead of glanced at.
//
// ── Why it can never be a tax on getting to work ────────────────────────────
// A doctor mid-shift signing back in after a dropped connection needs the
// queue, not a light show. So: `useReducedMotion()` skips it outright (no
// component render at all — not "skip visuals but still wait"), a click, tap
// or key exits it immediately, and even played in full it is under two
// seconds. It is also NEVER the thing standing between a sign-in and the app
// actually working — LoginPage still calls `adoptIdentity` and computes the
// destination route before this ever mounts; the portal only delays the
// `navigate()` call by the length of its own animation or a skip, whichever
// comes first, and a hard safety timeout calls `onDone` regardless if some
// transition event never fires.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

type Props = {
    /** The doctor/staff's first name, already resolved by `loadIdentity` —
     *  never fetched here, this component owns no network of its own. */
    name?: string | null;
    /** "doctor" gets the clinical honorific; everyone else just gets their
     *  name, or a role-neutral line if even that isn't there yet. */
    role?: string | null;
    onDone: () => void;
};

/** Time the full sequence spends on screen before it starts fading, not
 *  counting the fade itself — see the CSS transition below. Short on
 *  purpose: this plays every real sign-in, a doctor mid-shift included. */
const HOLD_MS = 1350;
const FADE_MS = 450;

export function SignInPortal({ name, role, onDone }: Props) {
    const reducedMotion = useReducedMotion();
    const [exiting, setExiting] = useState(false);
    const firedRef = useRef(false);

    const finish = () => {
        if (firedRef.current) return;
        firedRef.current = true;
        onDone();
    };

    useEffect(() => {
        if (reducedMotion) { finish(); return; }
        const toExit = setTimeout(() => setExiting(true), HOLD_MS);
        // A safety net, not the real trigger — see the CSS transitionend
        // handler on `.sip-stage`. If that event is ever missed (a tab
        // thrown into the background mid-fade, say), this still gets the
        // doctor into the app rather than stranding them on a dark screen.
        const safety = setTimeout(finish, HOLD_MS + FADE_MS + 400);
        return () => { clearTimeout(toExit); clearTimeout(safety); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reducedMotion]);

    if (reducedMotion) return null;

    const first = name?.trim().split(/\s+/)[0];
    const line =
        role === "doctor" && first ? `Welcome back, Dr. ${first}`
            : first ? `Welcome back, ${first}`
                : "Welcome back";

    return (
        <div
            className={`sip-root${exiting ? " is-exiting" : ""}`}
            role="status"
            aria-label="Signing in"
            onClick={finish}
            onKeyDown={finish}
            onTransitionEnd={(e) => { if (e.propertyName === "opacity" && exiting) finish(); }}
        >
            <style>{SIP_CSS}</style>
            <img src="/aren-nebula.svg" aria-hidden="true" className="sip-nebula" alt="" />
            <div className="sip-stage">
                <motion.svg
                    width={104}
                    height={104}
                    viewBox="0 0 64 64"
                    fill="none"
                    className="sip-mark"
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
                        out, here the thing the whole drawing builds toward. */}
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
.sip-nebula {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.55;
    filter: blur(0.6px);
    pointer-events: none;
    animation: sip-drift 7s ease-in-out infinite alternate;
}
@keyframes sip-drift {
    from { transform: scale(1.03) translate3d(0, 0, 0); }
    to { transform: scale(1.08) translate3d(-1.2%, -0.6%, 0); }
}
.sip-stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}
.sip-mark {
    filter: drop-shadow(0 0 20px rgba(139, 92, 246, 0.38));
}
.sip-line {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: rgba(255, 255, 255, 0.88);
    text-shadow: 0 2px 14px rgba(5, 9, 22, 0.7);
}
`;
