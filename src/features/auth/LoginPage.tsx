// /login — the only door into AREN. Phone + password, nothing else.
//
// Auth mechanics follow docs/Login Screen Implementation.md exactly:
// phone → {digits}@aren.internal → supabase.auth.signInWithPassword, then the
// post-login sequence (users row → is_active → hospital → is_active → role
// routing) via loadIdentity(). No signup, no OTP, no email reset — accounts
// are created only by the landing site's registration wizard.
//
// Visually this screen wears the landing page's identity (paper / ink /
// restrained accent purple, serif statements, mono micro-labels) so
// arenode.com and the app read as one product. Styles are scoped `lg-*`
// classes in an inline block: class selectors beat the legacy unlayered
// element CSS (the Tailwind v4 layer trap) without touching Cortex.

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { homeRouteForRole, loadIdentity, phoneToAuthEmail, signOutLocal, withTimeout } from "../../lib/auth";
import { useAuth } from "./AuthProvider";
import type { GateNotice } from "./AuthProvider";
import { ArenMark } from "./ArenMark";

type Banner = { tone: "error" | "pending" | "info"; text: string } | null;

const MSG = {
    phoneLength: "Enter the 10-digit phone number your clinic registered with.",
    passwordEmpty: "Enter your password.",
    invalid: "That phone number and password don't match our records.",
    incomplete: "Your account setup looks incomplete. Write to care@arenode.com and we'll sort it out.",
    disabled: "This account has been disabled. Please contact your clinic administrator.",
    pending: "Your clinic's account isn't active yet. Write to care@arenode.com and we'll get you started.",
    unreachable: "Can't reach AREN right now. Check your connection and try again.",
    sessionLost: "Please sign in again to continue.",
    deviceRevoked: "This device was signed out from your Settings. Sign in again to keep using it.",
} as const;

function bannerFromGateNotice(notice: GateNotice | undefined): Banner {
    switch (notice) {
        case "hospital-inactive":
            return { tone: "pending", text: MSG.pending };
        case "user-inactive":
            return { tone: "error", text: MSG.disabled };
        case "no-user-row":
            return { tone: "error", text: MSG.incomplete };
        case "unreachable":
            return { tone: "info", text: MSG.sessionLost };
        case "device-revoked":
            return { tone: "info", text: MSG.deviceRevoked };
        default:
            return null; // plain visit or ordinary sign-out: no message
    }
}

export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { adoptIdentity } = useAuth();

    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [banner, setBanner] = useState<Banner>(() =>
        bannerFromGateNotice((location.state as { notice?: GateNotice } | null)?.notice)
    );
    const passwordRef = useRef<HTMLInputElement>(null);

    // Numeric only, hard-capped at 10 — letters and symbols never appear.
    // A 12-digit paste beginning "91" is a country-coded number: strip it,
    // since registration stored the bare 10 digits (a different derived email).
    const handlePhone = (raw: string) => {
        let digits = raw.replace(/\D/g, "");
        if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
        setPhone(digits.slice(0, 10));
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (phone.length !== 10) {
            setBanner({ tone: "error", text: MSG.phoneLength });
            return;
        }
        if (!password) {
            setBanner({ tone: "error", text: MSG.passwordEmpty });
            passwordRef.current?.focus();
            return;
        }

        setBusy(true);
        setBanner(null);
        try {
            let userId: string;
            try {
                const { data, error } = await withTimeout(
                    supabase.auth.signInWithPassword({ email: phoneToAuthEmail(phone), password })
                );
                if (error || !data.session) {
                    // 400 = wrong phone, wrong password, or never registered.
                    // One generic message for all three — don't leak which.
                    const invalid = error?.status === 400 || /invalid login credentials/i.test(error?.message ?? "");
                    setBanner({ tone: "error", text: invalid ? MSG.invalid : MSG.unreachable });
                    return;
                }
                userId = data.session.user.id;
            } catch {
                setBanner({ tone: "error", text: MSG.unreachable });
                return;
            }

            const result = await loadIdentity(userId);
            if (!result.ok) {
                // Never keep a session the gate would reject on next load.
                await signOutLocal();
                switch (result.reason) {
                    case "no-user-row":
                        setBanner({ tone: "error", text: MSG.incomplete });
                        break;
                    case "user-inactive":
                        setBanner({ tone: "error", text: MSG.disabled });
                        break;
                    case "hospital-inactive":
                        setBanner({ tone: "pending", text: MSG.pending });
                        break;
                    default:
                        setBanner({ tone: "error", text: MSG.unreachable });
                }
                return;
            }

            adoptIdentity(result.identity);
            navigate(homeRouteForRole(result.identity.user.role), { replace: true });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="lg-root">
            <style>{LOGIN_CSS}</style>
            <div className="lg-wash lg-wash-a" aria-hidden="true" />
            <div className="lg-wash lg-wash-b" aria-hidden="true" />

            <main className="lg-card">
                <ArenMark size={46} />
                <div className="lg-eyebrow">AREN · CLINIC SIGN-IN</div>
                <h1 className="lg-title">Welcome back.</h1>
                <p className="lg-sub">Sign in with your clinic&rsquo;s registered phone number.</p>

                {banner && (
                    <div className={`lg-banner lg-banner-${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"}>
                        {banner.text}
                    </div>
                )}

                <form onSubmit={submit} noValidate>
                    <label className="lg-label" htmlFor="lg-phone">
                        Phone number
                    </label>
                    <div className="lg-inputwrap">
                        <span className="lg-prefix">+91</span>
                        <input
                            id="lg-phone"
                            className="lg-input"
                            type="text"
                            inputMode="numeric"
                            autoComplete="username"
                            autoFocus
                            placeholder="10-digit number"
                            value={phone}
                            onChange={(e) => handlePhone(e.target.value)}
                            disabled={busy}
                        />
                    </div>

                    <label className="lg-label" htmlFor="lg-password">
                        Password
                    </label>
                    <div className="lg-inputwrap">
                        <input
                            id="lg-password"
                            ref={passwordRef}
                            className="lg-input"
                            type={showPw ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="Your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={busy}
                        />
                        <button
                            type="button"
                            className="lg-eye"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label={showPw ? "Hide password" : "Show password"}
                            tabIndex={-1}
                        >
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <button type="submit" className="lg-submit" disabled={busy}>
                        {busy ? "Signing in…" : "Sign in"}
                    </button>
                </form>

                <div className="lg-foot">
                    <p>
                        New here? Register your clinic at{" "}
                        <a href="https://arenode.com" target="_blank" rel="noreferrer">
                            arenode.com
                        </a>
                    </p>
                    <p>
                        Trouble signing in or forgot your password? Write to{" "}
                        <a href="mailto:care@arenode.com">care@arenode.com</a>
                    </p>
                </div>
            </main>

            <div className="lg-baseline" aria-hidden="true">
                AREN — CLINICAL OPERATING SYSTEM
            </div>
        </div>
    );
}

const LOGIN_CSS = `
.lg-root {
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
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 32px 20px 64px;
    background: var(--lg-paper);
    font-family: var(--lg-sans);
    color: var(--lg-ink);
    z-index: 50;
}

/* Soft color fields behind the glass — enough for the blur to catch,
   quiet enough to stay clinical. */
.lg-wash {
    position: fixed;
    border-radius: 50%;
    filter: blur(70px);
    pointer-events: none;
}
.lg-wash-a {
    width: 480px;
    height: 420px;
    top: -120px;
    right: -80px;
    background: radial-gradient(closest-side, var(--lg-accent-soft), transparent 72%);
    opacity: 0.9;
}
.lg-wash-b {
    width: 520px;
    height: 460px;
    bottom: -160px;
    left: -120px;
    background: radial-gradient(closest-side, var(--lg-paper-3), transparent 70%);
}

/* The glass card. */
.lg-card {
    position: relative;
    width: min(420px, 100%);
    padding: 38px 36px 30px;
    border-radius: calc(var(--lg-radius) * 1.5);
    background: rgba(255, 255, 255, 0.55);
    -webkit-backdrop-filter: blur(22px) saturate(1.25);
    backdrop-filter: blur(22px) saturate(1.25);
    border: 1px solid var(--lg-line);
    box-shadow:
        0 28px 64px -28px rgba(12, 13, 12, 0.22),
        0 2px 8px rgba(12, 13, 12, 0.04);
}

.lg-eyebrow {
    margin-top: 18px;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--lg-faint);
}

.lg-title {
    margin: 8px 0 0;
    font-family: var(--lg-serif);
    font-weight: 500;
    font-size: 31px;
    line-height: 1.12;
    letter-spacing: -0.01em;
    color: var(--lg-ink);
}

.lg-sub {
    margin: 8px 0 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--lg-muted);
}

.lg-banner {
    margin-top: 18px;
    padding: 10px 13px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.5;
}
.lg-banner-error {
    background: rgba(178, 58, 44, 0.07);
    border: 1px solid rgba(178, 58, 44, 0.18);
    color: #963527;
}
.lg-banner-pending {
    background: var(--lg-accent-soft);
    border: 1px solid rgba(99, 17, 211, 0.16);
    color: var(--lg-accent-ink);
}
.lg-banner-info {
    background: var(--lg-paper-2);
    border: 1px solid var(--lg-line);
    color: var(--lg-muted);
}

.lg-root form {
    margin-top: 20px;
}

.lg-label {
    display: block;
    margin: 14px 0 6px;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--lg-muted);
}

.lg-inputwrap {
    position: relative;
    display: flex;
    align-items: center;
    height: 46px;
    border: 1px solid var(--lg-line-2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
    transition: border-color 120ms ease, box-shadow 120ms ease;
}
.lg-inputwrap:focus-within {
    border-color: var(--lg-accent);
    box-shadow: 0 0 0 3px var(--lg-accent-soft);
}

.lg-prefix {
    padding: 0 0 0 13px;
    font-family: var(--lg-mono);
    font-size: 13px;
    color: var(--lg-faint);
    user-select: none;
}
.lg-prefix::after {
    content: "";
    display: inline-block;
    width: 1px;
    height: 16px;
    margin: 0 0 -3px 10px;
    background: var(--lg-line-2);
}

/* Class rules out-specify the legacy unlayered element CSS (input { … }). */
input.lg-input {
    flex: 1;
    width: 100%;
    height: 100%;
    padding: 0 13px;
    border: none;
    border-radius: 10px;
    background: transparent;
    box-shadow: none;
    outline: none;
    font-family: var(--lg-sans);
    font-size: 15px;
    color: var(--lg-ink);
}
input.lg-input:hover,
input.lg-input:focus {
    border: none;
    background: transparent;
    box-shadow: none;
}
input.lg-input::placeholder {
    color: var(--lg-faint);
}
input.lg-input:disabled {
    opacity: 0.55;
}

.lg-eye {
    display: grid;
    place-items: center;
    width: 38px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--lg-faint);
    cursor: pointer;
}
.lg-eye:hover {
    color: var(--lg-muted);
}

.lg-submit {
    width: 100%;
    height: 46px;
    margin-top: 22px;
    border: none;
    border-radius: 10px;
    background: var(--lg-ink);
    color: var(--lg-paper);
    font-family: var(--lg-sans);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background 120ms ease, transform 60ms ease;
}
.lg-submit:hover:not(:disabled) {
    background: var(--lg-ink-2);
}
.lg-submit:active:not(:disabled) {
    transform: translateY(0.5px);
}
.lg-submit:focus-visible {
    outline: 2px solid var(--lg-accent);
    outline-offset: 2px;
}
.lg-submit:disabled {
    opacity: 0.6;
    cursor: default;
}

/* Quiet text below the form. */
.lg-foot {
    margin-top: 26px;
    padding-top: 18px;
    border-top: 1px solid var(--lg-line);
    text-align: center;
}
.lg-foot p {
    margin: 0 0 6px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--lg-muted);
}
.lg-foot a {
    color: var(--lg-accent-ink);
    text-decoration: none;
    border-bottom: 1px solid rgba(74, 13, 161, 0.25);
}
.lg-foot a:hover {
    border-bottom-color: var(--lg-accent-ink);
}

.lg-baseline {
    position: fixed;
    bottom: 22px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--lg-mono);
    font-size: 9.5px;
    letter-spacing: 0.22em;
    color: var(--lg-faint);
    opacity: 0.75;
    pointer-events: none;
}

@media (max-height: 640px) {
    .lg-baseline { display: none; }
}
`;
