// /login (index route, inside AuthLayout) — the card a fresh visitor lands
// on before any credential form. Anmol, 2026-09-12: "whenever a link will
// very direct the doctor to the app app.domain.com they will simply see a
// login page that will be not very good thing impression... instead of
// directly asking you for sign up or login... a first landing screen."
//
// This file is ONLY the card. The headline, the features, the bubbles and
// the brand lockup around it belong to AuthLayout.tsx — see its own header
// for why (the copy has to outlive this route to fade out while the card
// glides to centre, which it cannot do from inside a route that unmounts).
//
// Two doors, both already real: "Sign in" goes to the existing credential
// form (`/login/signin` — LoginPage.tsx, unchanged in substance); "Create a
// new account" goes where LoginPage's own footer always sent that same
// request — arenode.com's registration wizard. Accounts are still created
// there, not here (see LoginPage's own top comment on why).

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function WelcomePage() {
    return (
        <section className="wc-card">
            <style>{WELCOME_CSS}</style>
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
                Need help? Write to <a href="mailto:care@arenode.com">care@arenode.com</a>
            </p>
        </section>
    );
}

const WELCOME_CSS = `
.wc-card {
    position: relative;
    display: block;
    padding: 36px 34px 28px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.82);
    -webkit-backdrop-filter: blur(22px) saturate(1.25);
    backdrop-filter: blur(22px) saturate(1.25);
    border: 1px solid rgba(255, 255, 255, 0.9);
    /* No shadow here — AuthLayout's .auth-card-clip draws it, so the
       clipping box that animates this card's height can crop the card
       without cropping its shadow. */
}
.wc-card-eyebrow {
    display: block;
    font-family: var(--lg-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.15em;
    color: var(--lg-faint);
}
.wc-card-title {
    margin: 10px 0 0;
    font-family: var(--lg-serif);
    font-weight: 500;
    font-size: 30px;
    /* The app's own base.css has an unlayered "h2 { text-transform:
       uppercase }" rule for its own settings-page headers -- a class
       selector beats it on every OTHER property here, but text-transform
       is one this rule never sets, so without this line the browser falls
       through to that unrelated rule and this reads as "LET'S GET
       STARTED." instead of "Let's get started." */
    text-transform: none;
    letter-spacing: -0.015em;
    color: var(--lg-ink);
}
.wc-card-sub {
    margin: 11px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--lg-muted);
}

.wc-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 50px;
    margin-top: 20px;
    padding: 0 18px;
    border-radius: 11px;
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
    background: #0d0d10;
    color: #ffffff;
}
.wc-btn-primary:hover {
    background: #1c1e22;
}
.wc-btn-secondary {
    margin-top: 11px;
    border: 1px solid var(--lg-line-2);
    background: rgba(255, 255, 255, 0.7);
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
    margin: 24px 0 16px;
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
