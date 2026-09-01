// ---------------------------------------------------------------------------
// SETTINGS — the page that finds every setting, and holds the few that live
// nowhere else.
//
// ── The question this page answers
//
// Most of AREN's settings deliberately live next to the thing they configure:
// clinic hours on Clinic, preferred labs on Practice, the prescription pad in
// its own editor. Anmol put the obvious objection — if the doctor's profile is
// already on Clinic, what is Settings for? The answer this is built on:
// Settings is the INDEX, plus the technical account surface. It never
// duplicates Clinic, Practice, Medicines, Labs or the Prescription Pad; those
// are reachable only through the master search, which is exactly the point.
//
// ── Structure (2026-08-31 rebuild, against a supplied reference design)
//
//   dark header  — brand, title, ONE master search (no second search anywhere)
//   row 1        — Your Account   | Subscription
//   row 2        — Preferences    | Data & Privacy
//   below        — a compact Help & Support strip, deliberately secondary
//
// Written in Tailwind rather than extending the old `settings.css` section
// stack, which was a single full-width column — the thing
// layout-composition.md's first rule exists to prevent. Only the cross-page
// deep-link flash (`.cx-setting-flash`) and the page shell stay in CSS,
// because the flash is applied to elements on OTHER pages.
//
// ── What is real and what is honestly marked as not-yet
//
// Real: the master search and its deep links; the subscription card (live
// data, `lib/db/subscriptions.ts`); change email and change password (both
// Supabase Auth); clearing cached clinic data and saved drafts; log out.
// Marked "Not yet": notifications, appearance, export, data management, and
// the account operations with no backend (phone, users, deletion). They
// render because the shape of the page is the deliverable, but nothing
// pretends to work — a control that silently does nothing is worse than one
// that says it isn't built.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
    ArrowRight, Bell, ChevronRight, Database, Download, ExternalLink, FileText,
    HelpCircle, Info, Loader2, Lock, LogOut, Mail, MessageCircle, Palette,
    Search, Shield, ShieldCheck, Trash2, User, Users, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useAuth } from "../auth/AuthProvider";
import { useLogout } from "../auth/useLogout";
import { supabase } from "../../lib/supabase";
import {
    billingIntervalLabel, clearProfileCache, fetchClinicSubscription,
    type ClinicSubscription, type DBDoctor, type DBHospital,
} from "../../lib/db";
import { clearAllConsultDrafts } from "../../lib/consultDraft";
import type { SidebarPage } from "../sidebar/SidebarNav";
import { SETTINGS_INDEX, searchSettings, type SettingEntry } from "./settingsRegistry";
import { requestSettingFocus } from "./settingsFocus";
import { toast } from "sonner";
import "./settings.css";

/** Where "Privacy & security" goes — the one external URL we were actually
 *  given. */
const PRIVACY_URL = "https://www.arenode.com/privacy";
/** ⚠ ASSUMED, not supplied: derived from PRIVACY_URL's own domain. Correct it
 *  if the terms page lives elsewhere — it is the only invented URL here, and
 *  "Help center" / "Contact support" deliberately route to the in-app Support
 *  page rather than to more guesses. */
const TERMS_URL = "https://www.arenode.com/terms";

interface SettingsPageProps {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    hospitalId: string;
    hospitalProfile: DBHospital | null;
    doctorProfile: DBDoctor | null;
    doctorName: string;
    /** Takes a search result to the page that owns it. */
    onNavigate: (page: SidebarPage) => void;
}

// ── Shared shapes ───────────────────────────────────────────────────────────

const CARD =
    "flex min-w-0 flex-col rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] " +
    "shadow-[var(--cs-shadow)] p-[18px]";

const ICON_TILE = "grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px]";

function SettingsCard({
    id, icon, tint, title, children,
}: {
    id: string;
    icon: ReactNode;
    /** Tailwind classes for the icon tile — one of the seven semantic tones. */
    tint: string;
    title: string;
    children: ReactNode;
}) {
    return (
        <section id={id} aria-label={title} className={CARD}>
            <div className="mb-[14px] flex items-center gap-[10px]">
                <span className={`${ICON_TILE} ${tint}`}>{icon}</span>
                <h2 className="text-[13px] font-bold uppercase tracking-[0.07em] text-[var(--cs-ink)]">
                    {title}
                </h2>
            </div>
            {children}
        </section>
    );
}

/**
 * One setting row. `trailing` says what will happen: a chevron opens
 * something here, an external glyph leaves the app, and "Not yet" is the
 * honest state for a row whose backend does not exist.
 */
function SettingRow({
    icon, label, sub, onClick, href, pending,
}: {
    icon: ReactNode;
    label: string;
    sub: string;
    onClick?: () => void;
    href?: string;
    pending?: boolean;
}) {
    const body = (
        <>
            <span className="mt-[1px] flex-none text-[var(--cs-faint)]">{icon}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                <span className="text-[13.5px] font-semibold text-[var(--cs-ink)]">{label}</span>
                <span className="text-[12px] leading-[1.45] text-[var(--cs-faint)]">{sub}</span>
            </span>
            {pending ? (
                <span className="flex-none rounded-full bg-[var(--cs-page)] px-[8px] py-[2px] text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                    Not yet
                </span>
            ) : href ? (
                <ExternalLink size={15} className="flex-none text-[var(--cs-faint)]" />
            ) : (
                <ChevronRight size={16} className="flex-none text-[var(--cs-faint)]" />
            )}
        </>
    );

    const shared =
        "flex w-full items-start gap-[11px] rounded-[10px] px-[10px] py-[11px] text-left transition-colors";

    if (href) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={`${shared} hover:bg-[var(--cs-page)]`}>
                {body}
            </a>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${shared} ${pending ? "cursor-default" : "cursor-pointer hover:bg-[var(--cs-page)]"}`}
        >
            {body}
        </button>
    );
}

// ── The master search ───────────────────────────────────────────────────────

/**
 * ONE search box for the whole product, living in the dark header.
 *
 * It indexes settings wherever they actually live (`settingsRegistry.ts`) and
 * a result navigates to the owning page AND flashes the specific control
 * (`settingsFocus.ts`). That is the entire reason a doctor never has to know
 * which of five pages owns a switch.
 */
function MasterSearch({ onPick }: { onPick: (entry: SettingEntry) => void }) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = useMemo(
        () => (query.trim() ? searchSettings(query) : SETTINGS_INDEX.slice(0, 6)),
        [query]
    );

    // ⌘K / Ctrl+K focuses it, the shortcut the header itself advertises.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Clicking anywhere else closes the dropdown.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    const choose = (entry: SettingEntry) => {
        setOpen(false);
        setQuery("");
        onPick(entry);
    };

    return (
        <div ref={wrapRef} className="relative w-full">
            <Search
                size={17}
                className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2 text-white/45"
            />
            <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter" && results[active]) { e.preventDefault(); choose(results[active]); }
                    else if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
                }}
                placeholder="Search any setting across AREN…"
                aria-label="Search any setting across AREN"
                /* Every `!` here is load-bearing: `styles/base.css` styles bare
                   `input` UNLAYERED (height 31px, pale background, 7px radius,
                   9px padding), and unlayered CSS outranks every Tailwind
                   utility regardless of specificity. Without them this field
                   renders as a squat pale box in a dark header — measured at
                   31px against the 42px asked for. Same trap as the
                   `label`/`svg` ones in cortex-gotchas.md. */
                className={
                    "h-[42px]! w-full rounded-[12px]! border! border-white/12 bg-white/[0.07]! pl-[44px]! pr-[52px] " +
                    "text-[13.5px]! font-medium text-white/95! outline-none backdrop-blur-[8px] " +
                    "placeholder:text-white/40 transition-colors " +
                    "hover:border-white/20 focus:border-[rgba(167,139,250,0.6)] focus:bg-white/[0.10]!"
                }
            />
            <kbd className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 rounded-[6px] border border-white/12 bg-white/[0.06] px-[7px] py-[3px] text-[10.5px] font-semibold text-white/45">
                ⌘ K
            </kbd>

            {open && (
                <div
                    role="listbox"
                    className={
                        "absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[14px] " +
                        "border border-[var(--cs-line)] bg-[var(--cs-card)] p-[6px] " +
                        "shadow-[0_24px_60px_-20px_rgba(11,23,51,0.55)]"
                    }
                >
                    {results.length === 0 ? (
                        <p className="px-[12px] py-[16px] text-center text-[12.5px] text-[var(--cs-faint)]">
                            No setting matches that. Try what it changes — “hours”, “signature”, “labs”.
                        </p>
                    ) : (
                        results.map((entry, i) => {
                            const Icon = entry.icon;
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="option"
                                    aria-selected={i === active}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => choose(entry)}
                                    className={
                                        "flex w-full items-center gap-[11px] rounded-[9px] px-[10px] py-[9px] text-left " +
                                        (i === active ? "bg-[var(--cs-page)]" : "")
                                    }
                                >
                                    <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-[rgba(124,58,237,0.10)] text-[var(--cs-violet)]">
                                        <Icon size={15} />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[13px] font-semibold text-[var(--cs-ink)]">
                                            {entry.label}
                                        </span>
                                        <span className="truncate text-[11.5px] text-[var(--cs-faint)]">
                                            {entry.description}
                                        </span>
                                    </span>
                                    {/* Where it lives — the whole reason the row exists. */}
                                    <span className="flex-none rounded-full bg-[var(--cs-page)] px-[9px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-label)]">
                                        {entry.group}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

// ── Account operations ──────────────────────────────────────────────────────

/**
 * The technical account surface. Email and password are wired to Supabase
 * Auth for real; phone, multi-user management and deletion have no backend
 * yet and say so rather than rendering a control that quietly fails.
 */
function AccountModal({ email, onClose }: { email: string | null; onClose: () => void }) {
    const [mode, setMode] = useState<"menu" | "email" | "password">("menu");
    const [nextEmail, setNextEmail] = useState(email ?? "");
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitEmail = async () => {
        setError(null);
        if (!nextEmail.trim() || nextEmail.trim() === email) { setError("Enter a different email address."); return; }
        setBusy(true);
        const { error: e } = await supabase.auth.updateUser({ email: nextEmail.trim() });
        setBusy(false);
        if (e) { setError(e.message); return; }
        toast.success("Confirm the change from the link sent to your new address.");
        onClose();
    };

    const submitPassword = async () => {
        setError(null);
        if (pw.length < 8) { setError("Use at least 8 characters."); return; }
        if (pw !== pw2) { setError("Both passwords must match."); return; }
        setBusy(true);
        const { error: e } = await supabase.auth.updateUser({ password: pw });
        setBusy(false);
        if (e) { setError(e.message); return; }
        toast.success("Password changed.");
        onClose();
    };

    // `!` for the same reason as the header search — see its comment.
    const inputClass =
        "h-[40px]! w-full rounded-[10px]! border! border-[var(--cs-line-strong)] bg-white! px-[12px]! " +
        "text-[13.5px]! text-[var(--cs-ink)]! outline-none focus:border-[var(--cs-blue)] " +
        "focus:shadow-[0_0_0_3px_rgba(18,104,232,0.13)]";

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-[rgba(11,23,51,0.28)] p-[32px] backdrop-blur-[14px]">
            <div className="w-[min(440px,100%)] overflow-hidden rounded-[20px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,252,0.94))] shadow-[0_40px_80px_-32px_rgba(11,23,51,0.55)]">
                <div className="h-[4px] bg-[linear-gradient(90deg,#f472b6_0%,#a855f7_50%,#6366f1_100%)]" />
                <div className="flex items-center justify-between gap-[12px] px-[18px] pb-[10px] pt-[16px]">
                    <div className="flex items-center gap-[10px]">
                        <span className="grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-[linear-gradient(135deg,#fce7f3_0%,#ede9fe_100%)] text-[#a855f7]">
                            <User size={15} />
                        </span>
                        <div>
                            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[#a855f7]">Account</p>
                            <span className="text-[14px] font-bold text-[var(--cs-ink)]">
                                {mode === "email" ? "Change email" : mode === "password" ? "Change password" : "Manage account"}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-[26px] w-[26px] place-items-center rounded-[8px] border border-[var(--cs-line-strong)] bg-white text-[var(--cs-muted)]"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex flex-col gap-[4px] px-[12px] pb-[16px]">
                    {mode === "menu" && (
                        <>
                            <SettingRow
                                icon={<Mail size={16} />} label="Change email"
                                sub={email ? `Currently ${email}` : "Set the address you sign in with"}
                                onClick={() => { setMode("email"); setError(null); }}
                            />
                            <SettingRow
                                icon={<Lock size={16} />} label="Change password"
                                sub="Set a new sign-in password" onClick={() => { setMode("password"); setError(null); }}
                            />
                            <SettingRow
                                icon={<MessageCircle size={16} />} label="Change phone"
                                sub="Contact support to update the number on your account" pending
                            />
                            <SettingRow
                                icon={<Users size={16} />} label="Manage users"
                                sub="Adding colleagues arrives with multi-doctor clinics" pending
                            />
                            <SettingRow
                                icon={<Trash2 size={16} />} label="Delete account"
                                sub="Clinical records have retention rules — support handles this" pending
                            />
                        </>
                    )}

                    {mode === "email" && (
                        <div className="flex flex-col gap-[10px] px-[10px] pt-[6px]">
                            <label className="text-[11.5px] font-semibold text-[var(--cs-label)]">
                                New email address
                                <input
                                    className={`${inputClass} mt-[5px]`} type="email" value={nextEmail}
                                    onChange={(e) => setNextEmail(e.target.value)} autoFocus
                                />
                            </label>
                            <p className="m-0 text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                                We send a confirmation link to the new address. The change only takes effect once
                                you open it.
                            </p>
                        </div>
                    )}

                    {mode === "password" && (
                        <div className="flex flex-col gap-[10px] px-[10px] pt-[6px]">
                            <label className="text-[11.5px] font-semibold text-[var(--cs-label)]">
                                New password
                                <input
                                    className={`${inputClass} mt-[5px]`} type="password" value={pw}
                                    onChange={(e) => setPw(e.target.value)} autoFocus
                                />
                            </label>
                            <label className="text-[11.5px] font-semibold text-[var(--cs-label)]">
                                Confirm new password
                                <input
                                    className={`${inputClass} mt-[5px]`} type="password" value={pw2}
                                    onChange={(e) => setPw2(e.target.value)}
                                />
                            </label>
                        </div>
                    )}

                    {error && (
                        <p className="mx-[10px] mt-[4px] text-[12px] font-medium text-[var(--cs-red)]">{error}</p>
                    )}

                    {mode !== "menu" && (
                        <div className="mt-[10px] flex items-center justify-end gap-[8px] px-[10px]">
                            <button
                                type="button" onClick={() => setMode("menu")} disabled={busy}
                                className="h-[38px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[16px] text-[12.5px] font-bold text-[var(--cs-muted)]"
                            >
                                Back
                            </button>
                            <button
                                type="button" disabled={busy}
                                onClick={mode === "email" ? submitEmail : submitPassword}
                                className="flex h-[38px] items-center gap-[6px] rounded-[10px] bg-[var(--cs-blue)] px-[18px] text-[12.5px] font-bold text-white disabled:opacity-60"
                            >
                                {busy && <Loader2 size={14} className="animate-spin" />}
                                Save
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── The page ────────────────────────────────────────────────────────────────

export function SettingsPage({
    logoRef, onOpenSidebar, hospitalId, hospitalProfile, doctorProfile, doctorName, onNavigate,
}: SettingsPageProps) {
    const logout = useLogout();
    const auth = useAuth();
    const [subscription, setSubscription] = useState<ClinicSubscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [accountOpen, setAccountOpen] = useState(false);
    const [confirmingDrafts, setConfirmingDrafts] = useState(false);
    const [authEmail, setAuthEmail] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSubLoading(true);
        fetchClinicSubscription(hospitalId)
            .then((s) => { if (!cancelled) setSubscription(s); })
            .catch(() => { if (!cancelled) setSubscription(null); })
            .finally(() => { if (!cancelled) setSubLoading(false); });
        return () => { cancelled = true; };
    }, [hospitalId]);

    // The email lives in Supabase Auth, not in `users` — see lib/auth.ts's
    // `AppUser`, which deliberately carries no email column.
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setAuthEmail(data.user?.email ?? null)).catch(() => {});
    }, []);

    const openSetting = (entry: SettingEntry) => {
        requestSettingFocus(entry.anchor);
        // Already here — the runner keys on the page changing, so nudge the
        // element ourselves rather than waiting for a navigation that isn't
        // going to happen.
        if (entry.page === "settings") {
            const el = document.getElementById(entry.anchor);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.classList.add("cx-setting-flash");
            setTimeout(() => el?.classList.remove("cx-setting-flash"), 2400);
            return;
        }
        onNavigate(entry.page);
    };

    // The doctor row's number first, then the signed-in user's — `??` chained
    // with a ternary parsed in an order that only worked by accident here.
    const authPhone = auth.status === "authed" ? auth.identity.user.phone : null;
    const phone = doctorProfile?.phone ?? authPhone;
    const initials = doctorName.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "DR";

    const renewsOn = subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : null;

    return (
        <div className="flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Settings"
                subtitle="Find any setting, and the few that live only here"
                centerSlot={<MasterSearch onPick={openSetting} />}
                rightSlot={
                    <>
                        <button
                            type="button"
                            onClick={() => onNavigate("support")}
                            className="flex items-center gap-[9px] rounded-[10px] px-[10px] py-[6px] transition-colors hover:bg-white/[0.07]"
                        >
                            <span className="grid h-[26px] w-[26px] place-items-center rounded-full border border-white/15 bg-white/[0.06] text-white/70">
                                <HelpCircle size={14} />
                            </span>
                            <span className="flex flex-col leading-[1.25]">
                                <span className="text-[11.5px] font-bold text-white/90">Need help?</span>
                                <span className="text-[10.5px] text-[rgba(196,167,250,0.94)]">Visit help center</span>
                            </span>
                        </button>
                        <span className="mx-[4px] h-[26px] w-px bg-white/12" />
                        <button
                            type="button"
                            onClick={() => openSetting(SETTINGS_INDEX.find((s) => s.id === "settings.account")!)}
                            className="flex items-center gap-[9px] rounded-[10px] px-[8px] py-[5px] transition-colors hover:bg-white/[0.07]"
                        >
                            <span className="grid h-[30px] w-[30px] flex-none place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#1268e8,#6366f1)] text-[11px] font-bold text-white">
                                {doctorProfile?.avatar_url
                                    ? <img src={doctorProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                                    : initials}
                            </span>
                            <span className="flex flex-col items-start leading-[1.25]">
                                <span className="text-[12px] font-bold text-white/95">{doctorName}</span>
                                <span className="text-[10.5px] text-white/50">{hospitalProfile?.name ?? "Your clinic"}</span>
                            </span>
                            <ChevronRight size={14} className="text-white/35" />
                        </button>
                    </>
                }
            />

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1220px] flex-col gap-[16px] px-[56px] pb-[40px] pt-[22px] max-[900px]:px-[14px]">

                    <div className="grid grid-cols-2 gap-[16px] max-[980px]:grid-cols-1">
                        {/* ══ Your Account ═══════════════════════════════════ */}
                        <SettingsCard
                            id="set-card-account"
                            icon={<User size={17} />}
                            tint="bg-[rgba(124,58,237,0.10)] text-[var(--cs-violet)]"
                            title="Your Account"
                        >
                            <div className="flex items-center gap-[16px]">
                                <span className="grid h-[84px] w-[84px] flex-none place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#1268e8,#6366f1)] text-[24px] font-bold text-white">
                                    {doctorProfile?.avatar_url
                                        ? <img src={doctorProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                                        : initials}
                                </span>
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="text-[17px] font-bold text-[var(--cs-ink)]">{doctorName}</span>
                                    <span className="truncate text-[13px] text-[var(--cs-muted)]">{authEmail ?? "No email on file"}</span>
                                    {phone && <span className="text-[13px] text-[var(--cs-muted)]">{phone}</span>}
                                </div>
                            </div>

                            <div className="my-[14px] h-px bg-[var(--cs-line)]" />

                            <SettingRow
                                icon={<ShieldCheck size={17} />}
                                label="Security"
                                sub="Email and password for signing in"
                                onClick={() => setAccountOpen(true)}
                            />

                            {/* Professional and clinic details are NOT duplicated
                                here — Clinic owns that editor, and this is the
                                way to it. */}
                            <div className="mt-[10px] flex flex-wrap gap-[8px]">
                                <button
                                    type="button"
                                    onClick={() => setAccountOpen(true)}
                                    className="inline-flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-[var(--cs-violet)] transition-colors hover:border-[var(--cs-violet)]"
                                >
                                    Manage account <ArrowRight size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openSetting(SETTINGS_INDEX.find((s) => s.id === "clinic.doctor")!)}
                                    className="inline-flex items-center gap-[7px] rounded-[10px] border border-transparent px-[12px] py-[9px] text-[12.5px] font-semibold text-[var(--cs-muted)] transition-colors hover:bg-[var(--cs-page)]"
                                >
                                    Professional details <ChevronRight size={14} />
                                </button>
                            </div>
                        </SettingsCard>

                        {/* ══ Subscription ═══════════════════════════════════ */}
                        <SettingsCard
                            id="set-card-subscription"
                            icon={<Shield size={17} />}
                            tint="bg-[rgba(124,58,237,0.10)] text-[var(--cs-violet)]"
                            title="Subscription"
                        >
                            {subLoading ? (
                                <div className="flex flex-1 items-center justify-center gap-[10px] py-[18px] text-[13px] text-[var(--cs-faint)]">
                                    <Loader2 size={16} className="animate-spin" /> Loading your plan…
                                </div>
                            ) : !subscription ? (
                                /* A clinic with no subscription row is a real
                                   state — Admin assigns them. Never invent one. */
                                <div className="flex flex-1 flex-col justify-center gap-[6px] py-[10px]">
                                    <span className="text-[15px] font-bold text-[var(--cs-ink)]">No subscription on file</span>
                                    <span className="text-[12.5px] text-[var(--cs-faint)]">
                                        Contact support to have a plan assigned to this clinic.
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-[16px]">
                                        <span className="grid h-[76px] w-[76px] flex-none place-items-center rounded-full bg-[linear-gradient(135deg,#a855f7,#6366f1)] text-white">
                                            <Shield size={30} />
                                        </span>
                                        <div className="flex min-w-0 flex-col gap-[5px]">
                                            {/* Plan NAME comes from the row — nothing in
                                                this file may branch on it. */}
                                            <span className="text-[17px] font-bold text-[var(--cs-ink)]">
                                                {subscription.plan.name}
                                            </span>
                                            <span className="text-[13px] text-[var(--cs-muted)]">
                                                {billingIntervalLabel(subscription.plan.billingInterval)}
                                            </span>
                                            <span className="inline-flex w-fit items-center gap-[5px] rounded-full bg-[rgba(22,163,74,0.10)] px-[9px] py-[3px] text-[11.5px] font-bold capitalize text-[var(--cs-green)]">
                                                {subscription.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="my-[14px] h-px bg-[var(--cs-line)]" />

                                    {renewsOn && (
                                        <div className="flex items-center justify-between gap-[10px] px-[2px] py-[4px]">
                                            <span className="text-[13.5px] font-semibold text-[var(--cs-ink)]">Renews on</span>
                                            <span className="text-[13.5px] font-semibold text-[var(--cs-muted)]">{renewsOn}</span>
                                        </div>
                                    )}

                                    <div className="mt-[10px]">
                                        <button
                                            type="button"
                                            onClick={() => toast("Billing is handled by support for now — we'll reach out with options.")}
                                            className="inline-flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-[var(--cs-violet)] transition-colors hover:border-[var(--cs-violet)]"
                                        >
                                            Manage subscription <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </SettingsCard>

                        {/* ══ Preferences ════════════════════════════════════ */}
                        <SettingsCard
                            id="set-card-preferences"
                            icon={<Palette size={17} />}
                            tint="bg-[rgba(18,104,232,0.10)] text-[var(--cs-blue)]"
                            title="Preferences"
                        >
                            <SettingRow icon={<Bell size={17} />} label="Notifications" sub="Manage alerts and reminders" pending />
                            <div className="my-[2px] h-px bg-[var(--cs-line)]" />
                            <SettingRow icon={<Palette size={17} />} label="Appearance" sub="Theme and interface density" pending />
                        </SettingsCard>

                        {/* ══ Data & Privacy ═════════════════════════════════ */}
                        <SettingsCard
                            id="set-card-data"
                            icon={<Database size={17} />}
                            tint="bg-[rgba(15,118,110,0.10)] text-[var(--cs-teal)]"
                            title="Data & Privacy"
                        >
                            <SettingRow icon={<Download size={17} />} label="Export data" sub="Download your clinic data" pending />
                            <div className="my-[2px] h-px bg-[var(--cs-line)]" />
                            <SettingRow
                                icon={<Shield size={17} />} label="Privacy & security"
                                sub="How we protect your data, and your rights" href={PRIVACY_URL}
                            />
                            <div className="my-[2px] h-px bg-[var(--cs-line)]" />
                            {/* The one genuinely working data control — it clears
                                what THIS browser is holding (profileCache.ts and
                                the consult draft store), which is real, local and
                                safe to expose. */}
                            <div className="flex items-start gap-[11px] rounded-[10px] px-[10px] py-[11px]">
                                <span className="mt-[1px] flex-none text-[var(--cs-faint)]"><Database size={17} /></span>
                                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                    <span className="text-[13.5px] font-semibold text-[var(--cs-ink)]">Local data</span>
                                    <span className="text-[12px] leading-[1.45] text-[var(--cs-faint)]">
                                        Cached clinic details and saved consult drafts on this device
                                    </span>
                                </span>
                                <span className="flex flex-none items-center gap-[6px]">
                                    <button
                                        type="button"
                                        onClick={() => { clearProfileCache(); toast.success("Cached clinic data cleared."); }}
                                        className="rounded-full border border-[var(--cs-line-strong)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-teal)] hover:text-[var(--cs-teal)]"
                                    >
                                        Clear cache
                                    </button>
                                    {confirmingDrafts ? (
                                        <>
                                            <button
                                                type="button" onClick={() => setConfirmingDrafts(false)}
                                                className="rounded-full border border-[var(--cs-line-strong)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-label)]"
                                            >
                                                Keep
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { clearAllConsultDrafts(); setConfirmingDrafts(false); toast.success("Saved drafts discarded."); }}
                                                className="rounded-full border border-[var(--cs-red)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-red)]"
                                            >
                                                Discard
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button" onClick={() => setConfirmingDrafts(true)}
                                            className="rounded-full border border-[var(--cs-line-strong)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-red)] hover:text-[var(--cs-red)]"
                                        >
                                            Drafts
                                        </button>
                                    )}
                                </span>
                            </div>
                        </SettingsCard>
                    </div>

                    {/* ══ Help & Support — a strip, not a fifth card ═════════ */}
                    <section
                        aria-label="Help and support"
                        className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px] rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[18px] py-[14px] shadow-[var(--cs-shadow)]"
                    >
                        <span className="mr-[8px] flex items-center gap-[9px]">
                            <span className={`${ICON_TILE} bg-[rgba(124,58,237,0.10)] text-[var(--cs-violet)]`}>
                                <HelpCircle size={17} />
                            </span>
                            <span className="text-[13px] font-bold uppercase tracking-[0.07em] text-[var(--cs-ink)]">
                                Help &amp; Support
                            </span>
                        </span>
                        {[
                            { icon: <HelpCircle size={15} />, label: "Help center", sub: "Guides and tutorials", onClick: () => onNavigate("support") },
                            { icon: <MessageCircle size={15} />, label: "Contact support", sub: "We're here to help", onClick: () => onNavigate("support") },
                            { icon: <Info size={15} />, label: "About AREN", sub: "Cortex v1.0.0" },
                            { icon: <FileText size={15} />, label: "Terms of service", sub: "Read our terms", href: TERMS_URL },
                            { icon: <Shield size={15} />, label: "Privacy policy", sub: "arenode.com/privacy", href: PRIVACY_URL },
                        ].map((item) => {
                            const inner = (
                                <>
                                    <span className="flex-none text-[var(--cs-faint)]">{item.icon}</span>
                                    <span className="flex flex-col leading-[1.3]">
                                        <span className="whitespace-nowrap text-[12.5px] font-semibold text-[var(--cs-ink)]">{item.label}</span>
                                        <span className="whitespace-nowrap text-[11px] text-[var(--cs-faint)]">{item.sub}</span>
                                    </span>
                                    {item.href && <ExternalLink size={13} className="flex-none text-[var(--cs-faint)]" />}
                                </>
                            );
                            const cls = "flex flex-1 min-w-[146px] items-center gap-[8px] rounded-[10px] px-[8px] py-[8px] transition-colors hover:bg-[var(--cs-page)]";
                            return item.href ? (
                                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>
                            ) : (
                                <button key={item.label} type="button" onClick={item.onClick} className={`${cls} text-left`}>{inner}</button>
                            );
                        })}
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-[12px] px-[4px] pb-[4px]">
                        <p className="m-0 flex items-center gap-[7px] text-[11.5px] text-[var(--cs-faint)]">
                            Account reference
                            <code className="rounded-[5px] bg-[var(--cs-card)] px-[7px] py-[2px] text-[11px] tracking-[0.04em] text-[var(--cs-label)]">
                                {hospitalId.slice(0, 8)}
                            </code>
                            — quote this to support.
                        </p>
                        <button
                            type="button"
                            onClick={logout}
                            className="inline-flex items-center gap-[8px] rounded-[10px] border border-[rgba(180,35,24,0.35)] bg-[var(--cs-card)] px-[16px] py-[10px] text-[13px] font-bold text-[var(--cs-red)] transition-colors hover:bg-[rgba(180,35,24,0.05)]"
                        >
                            <LogOut size={15} /> Log out
                        </button>
                    </div>
                </div>
            </div>

            {accountOpen && <AccountModal email={authEmail} onClose={() => setAccountOpen(false)} />}
        </div>
    );
}
