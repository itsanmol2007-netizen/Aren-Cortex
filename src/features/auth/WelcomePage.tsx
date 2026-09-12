// /login (index route, inside AuthLayout) — the FIRST thing a fresh visitor
// sees, before any credential form. Anmol, 2026-09-12: "whenever a link will
// very direct to the doctor to the app app.domain.com they will simply see
// a login page that will be not very good thing impression... instead of
// directly asking you for sign up or login... a first landing screen."
// Built from a supplied reference image — arenode.com's own marketing
// identity (the same one LoginPage already wears, per its own header
// comment), not a new visual language for this one screen.
//
// Two doors, both already real: "Sign in" goes to the existing credential
// form (`/login/signin` — LoginPage.tsx, unchanged in substance); "Create a
// new account" goes where LoginPage's own footer always sent that same
// request — arenode.com's registration wizard. Accounts are still created
// there, not here (see LoginPage's own top comment on why).

import { Link } from "react-router-dom";
import { ArrowRight, Send, Sparkles, User } from "lucide-react";
import arenLogo from "../../assets/aren-logo-w.png";

const FEATURES = [
    { icon: User, lines: ["One patient.", "One visit."] },
    { icon: Sparkles, lines: ["Your Intelligent", "Autocomplete (Synapse)."] },
    { icon: Send, lines: ["The prescription", "reaches them before they leave."] },
] as const;

export function WelcomePage() {
    return (
        <div className="wc-root">
            <style>{WELCOME_CSS}</style>

            <div className="wc-brand">
                <img src={arenLogo} alt="" className="wc-brand-mark" />
                <div className="wc-brand-text">
                    <span className="wc-brand-name">AREN</span>
                    <span className="wc-brand-sub">CLINICAL OPERATING SYSTEM</span>
                </div>
            </div>

            <div className="wc-corner">
                <span>BUILT FOR</span>
                <span>A HEALTHIER</span>
                <span>TOMORROW</span>
                <div className="wc-corner-rule" />
            </div>

            <main className="wc-grid">
                <section className="wc-copy">
                    <h1 className="wc-headline">
                        You Practice,
                        <br />
                        <em className="wc-headline-accent">We Handle the Rest!</em>
                    </h1>

                    <p className="wc-tagline">
                        <span className="wc-rule" />
                        LESS FRICTION. MORE CARE.
                    </p>

                    <ul className="wc-features">
                        {FEATURES.map(({ icon: Icon, lines }) => (
                            <li key={lines[0]} className="wc-feature">
                                <span className="wc-feature-icon">
                                    <Icon size={20} strokeWidth={2} />
                                </span>
                                <span className="wc-feature-text">
                                    {lines[0]}<br />{lines[1]}
                                </span>
                            </li>
                        ))}
                    </ul>

                    <p className="wc-trusted">
                        <span className="wc-rule" />
                        TRUSTED BY CLINICS
                    </p>
                </section>

                <section className="wc-card">
                    <span className="wc-card-eyebrow">WELCOME TO AREN</span>
                    <h2 className="wc-card-title">Let&rsquo;s get started.</h2>
                    <p className="wc-card-sub">
                        Sign in to your clinic account or create a new one to continue.
                    </p>

                    <Link to="signin" className="wc-btn wc-btn-primary">
                        Sign in
                        <ArrowRight size={16} />
                    </Link>
                    <a
                        href="https://arenode.com"
                        target="_blank"
                        rel="noreferrer"
                        className="wc-btn wc-btn-secondary"
                    >
                        Create a new account
                        <ArrowRight size={16} />
                    </a>

                    <div className="wc-card-divider" />

                    <p className="wc-card-help">
                        Need help? Write to{" "}
                        <a href="mailto:care@arenode.com">care@arenode.com</a>
                    </p>
                </section>
            </main>

            <footer className="wc-foot">
                <span className="wc-rule" />
                CLINICS <span className="wc-dot" /> PEOPLE <span className="wc-dot" /> PROGRESS
            </footer>
        </div>
    );
}

const WELCOME_CSS = `
.wc-root {
    position: relative;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: 36px clamp(20px, 5vw, 88px) 48px;
    box-sizing: border-box;
}

.wc-brand {
    display: flex;
    align-items: center;
    gap: 12px;
}
.wc-brand-mark {
    width: 42px;
    height: 42px;
    object-fit: contain;
}
.wc-brand-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1;
}
.wc-brand-name {
    font-family: var(--lg-sans);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: var(--lg-ink);
}
.wc-brand-sub {
    font-family: var(--lg-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--lg-faint);
}

.wc-corner {
    position: absolute;
    top: 40px;
    right: clamp(20px, 5vw, 88px);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--lg-faint);
    text-align: right;
}
.wc-corner-rule {
    width: 30px;
    height: 1px;
    background: var(--lg-line-2);
    margin-top: 8px;
}

.wc-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(280px, 460px);
    gap: clamp(24px, 5vw, 64px);
    align-items: center;
    width: 100%;
    max-width: 1360px;
    /* Centres this block in whatever vertical space is left between the
       brand header above and the footer below, in a flex-column root --
       the standard "auto margins split the leftover space" trick, rather
       than a fixed padding-top that only looked centred at one viewport
       height and left a dead gap at any taller one. */
    margin: auto auto;
    flex-shrink: 0;
}
@media (max-width: 880px) {
    .wc-grid {
        grid-template-columns: 1fr;
        margin-top: 48px;
    }
}

.wc-copy {
    min-width: 0;
}
.wc-headline {
    margin: 0;
    font-family: var(--lg-serif);
    font-weight: 600;
    font-size: clamp(34px, 5vw, 56px);
    line-height: 1.08;
    letter-spacing: -0.01em;
    color: var(--lg-ink);
}
.wc-headline-accent {
    font-style: italic;
    background: linear-gradient(100deg, #7c3aed 0%, #a855f7 45%, #ec4899 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
}
.wc-tagline, .wc-trusted {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 22px 0 0;
    font-family: var(--lg-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--lg-muted);
}
.wc-trusted {
    margin-top: 40px;
}
.wc-rule {
    width: 22px;
    height: 1px;
    background: var(--lg-line-2);
    flex-shrink: 0;
}

.wc-features {
    list-style: none;
    margin: 30px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
}
.wc-feature {
    display: flex;
    align-items: center;
    gap: 16px;
}
.wc-feature-icon {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 13px;
    background: var(--lg-accent-soft);
    color: var(--lg-accent);
}
.wc-feature-text {
    font-family: var(--lg-serif);
    font-size: 17px;
    line-height: 1.35;
    color: var(--lg-ink-2);
}

.wc-foot {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 56px;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--lg-faint);
}
.wc-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--lg-faint);
}

/* ── The card ─────────────────────────────────────────────────────────── */
.wc-card {
    position: relative;
    padding: 34px 32px 28px;
    border-radius: calc(var(--lg-radius) * 1.5);
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(22px) saturate(1.25);
    backdrop-filter: blur(22px) saturate(1.25);
    border: 1px solid var(--lg-line);
    box-shadow:
        0 28px 64px -28px rgba(12, 13, 12, 0.22),
        0 2px 8px rgba(12, 13, 12, 0.04);
}
.wc-card-eyebrow {
    display: block;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--lg-faint);
}
.wc-card-title {
    margin: 8px 0 0;
    font-family: var(--lg-serif);
    font-weight: 500;
    font-size: 28px;
    /* The app's own base.css has an unlayered "h2 { text-transform:
       uppercase }" rule for its own settings-page headers -- a class
       selector beats it on every OTHER property here, but text-transform
       is one this rule never sets, so without this line the browser falls
       through to that unrelated rule and this reads as "LET'S GET
       STARTED." instead of "Let's get started." */
    text-transform: none;
    letter-spacing: -0.01em;
    color: var(--lg-ink);
}
.wc-card-sub {
    margin: 10px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--lg-muted);
}

.wc-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 48px;
    margin-top: 18px;
    padding: 0 18px;
    border-radius: 10px;
    font-family: var(--lg-sans);
    font-size: 14.5px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    box-sizing: border-box;
    transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
}
.wc-btn-primary {
    border: none;
    background: var(--lg-ink);
    color: var(--lg-paper);
}
.wc-btn-primary:hover {
    background: var(--lg-ink-2);
}
.wc-btn-secondary {
    margin-top: 10px;
    border: 1px solid var(--lg-line-2);
    background: rgba(255, 255, 255, 0.6);
    color: var(--lg-ink);
}
.wc-btn-secondary:hover {
    border-color: var(--lg-accent);
    color: var(--lg-accent-ink);
}
.wc-btn:active {
    transform: translateY(0.5px);
}

.wc-card-divider {
    height: 1px;
    margin: 22px 0 16px;
    background: var(--lg-line);
}
.wc-card-help {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--lg-muted);
    text-align: center;
}
.wc-card-help a {
    color: var(--lg-accent-ink);
    text-decoration: none;
    border-bottom: 1px solid rgba(74, 13, 161, 0.25);
}
.wc-card-help a:hover {
    border-bottom-color: var(--lg-accent-ink);
}
`;
