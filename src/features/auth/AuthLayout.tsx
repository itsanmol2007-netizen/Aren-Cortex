// ── The shared backdrop for everything before a session exists ─────────────
// WelcomePage (the first thing a fresh visitor sees) and LoginPage (the
// credential form) used to each own their own background wash — meaning
// clicking "Sign in" swapped one soft-gradient page for an unrelated one
// underneath it. Anmol, 2026-09-12, on exactly that seam: "when you log in
// there should be some changes in the bubbles behind the slides smooth
// animations." This is that shared surface: one persistent backdrop that
// both screens render `<Outlet/>` through, so the blobs are the SAME
// elements easing to a new position, not two different paintings.
//
// `isSignin` (derived from the route, not passed down) is the one signal
// the backdrop reacts to — the blobs drift to a second arrangement the
// moment the URL is the credential form, and back when it isn't. Nothing
// else about the two screens needs to know this layout exists.
//
// Perf note, learned the hard way on SignInPortal.tsx: these are plain CSS
// radial-gradient blobs with a CSS `filter: blur()`, not a filtered SVG
// asset — a blur on a flat gradient plane is cheap; a blur baked into a
// complex vector image rasterized at large size is not. Same lesson,
// applied here before it became a second bug.
// ---------------------------------------------------------------------------

import { Outlet, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";

export function AuthLayout() {
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const isSignin = location.pathname.startsWith("/login/signin");

    const spring = reducedMotion
        ? { duration: 0 }
        : { type: "spring" as const, stiffness: 60, damping: 18 };

    return (
        <div className="auth-shell">
            <style>{AUTH_LAYOUT_CSS}</style>

            <motion.div
                className="auth-blob auth-blob-a"
                initial={false}
                animate={isSignin ? { x: -60, y: 40, scale: 0.92 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            />
            <motion.div
                className="auth-blob auth-blob-b"
                initial={false}
                animate={isSignin ? { x: 50, y: -30, scale: 1.08 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            />
            <motion.div
                className="auth-blob auth-blob-c"
                initial={false}
                animate={isSignin ? { x: -30, y: -50, scale: 1.1 } : { x: 0, y: 0, scale: 1 }}
                transition={spring}
                aria-hidden="true"
            />

            <svg className="auth-arc" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
                <motion.path
                    d="M 1180 -40 C 1420 160, 1480 520, 1220 760 S 1260 1080, 1000 1040"
                    fill="none"
                    stroke="rgba(124, 58, 237, 0.22)"
                    strokeWidth="1.5"
                    initial={false}
                    animate={{ opacity: isSignin ? 0.5 : 1 }}
                    transition={spring}
                />
            </svg>

            <div className="auth-content">
                <Outlet />
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
    background: var(--lg-paper);
    font-family: var(--lg-sans);
    color: var(--lg-ink);
    z-index: 50;
}
.auth-blob {
    position: fixed;
    border-radius: 50%;
    filter: blur(70px);
    pointer-events: none;
    will-change: transform;
}
.auth-blob-a {
    width: 480px;
    height: 420px;
    top: -120px;
    right: -80px;
    background: radial-gradient(closest-side, var(--lg-accent-soft), transparent 72%);
    opacity: 0.9;
}
.auth-blob-b {
    width: 320px;
    height: 320px;
    top: 30%;
    right: 4%;
    background: radial-gradient(closest-side, rgba(232, 121, 249, 0.30), transparent 70%);
}
.auth-blob-c {
    width: 520px;
    height: 460px;
    bottom: -160px;
    left: -120px;
    background: radial-gradient(closest-side, var(--lg-paper-3), transparent 70%);
}
.auth-arc {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.auth-content {
    position: relative;
    z-index: 1;
    min-height: 100%;
}
`;
