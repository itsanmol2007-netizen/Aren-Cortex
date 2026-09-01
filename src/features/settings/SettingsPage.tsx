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
    Activity, AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight,
    ExternalLink, FileText, HelpCircle, Info, Keyboard, Laptop, Loader2, Lock,
    LogOut, Mail, MonitorSmartphone, Search, Shield, ShieldCheck, Stethoscope,
    Trash2, User, Users, X,
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
import { PROFILES, type ChartKind } from "../synapse/specialtyProfile";
import { updateHospitalSpecialtyProfile, invalidateHospital } from "../../lib/db";
import { BINDINGS } from "../../lib/keyboard/keymap";
import { ShortcutsSheet } from "../../components/ShortcutsSheet";
import { HealthPage } from "./health/HealthPage";
import { probeHealth, isDegraded, type HealthSnapshot } from "./health/model";
import type { SidebarPage } from "../sidebar/SidebarNav";
import { SETTINGS_INDEX, searchSettings, type SettingEntry } from "./settingsRegistry";
import { SupportRequestModal, type SupportTopic } from "./SupportRequestModal";
import { requestSettingFocus } from "./settingsFocus";
import { toast } from "sonner";
import "./settings.css";

/** Where "Privacy & security" goes — the one external URL we were actually
 *  given. */
const PRIVACY_URL = "https://www.arenode.com/privacy";

const PROFILE_LIST = Object.values(PROFILES);

/**
 * A friendly name for the machine you are on, read off the user agent.
 *
 * Deliberately coarse — browser and OS, nothing more. A user agent cannot say
 * "the tablet in room 2", and a confident wrong label on a security surface is
 * worse than a vague right one. When a real device registry lands (a row
 * written on sign-in) THAT carries a name the doctor chose; this is the honest
 * fallback until then.
 */
function describeThisDevice(): { name: string; kind: string } {
    const ua = navigator.userAgent;
    const os =
        /Windows/i.test(ua) ? "Windows"
        : /Macintosh|Mac OS X/i.test(ua) ? "macOS"
        : /iPhone|iPad|iPod/i.test(ua) ? "iPadOS / iOS"
        : /Android/i.test(ua) ? "Android"
        : /Linux/i.test(ua) ? "Linux"
        : "this device";
    const browser =
        /Edg\//i.test(ua) ? "Edge"
        : /OPR\/|Opera/i.test(ua) ? "Opera"
        : /Chrome\//i.test(ua) ? "Chrome"
        : /Safari\//i.test(ua) && !/Chrome/i.test(ua) ? "Safari"
        : /Firefox\//i.test(ua) ? "Firefox"
        : "Browser";
    return { name: `${browser} on ${os}`, kind: /Mobile|iPhone|Android/i.test(ua) ? "Mobile" : "Desktop" };
}

const CHART_LABEL: Record<ChartKind, string> = {
    dental: "Dental chart",
    body: "Body map",
    joints: "Joint map",
    growth: "Growth chart",
};
/** ⚠ ASSUMED, not supplied: derived from PRIVACY_URL's own domain. Correct it
 *  if the terms page lives elsewhere — it is the only invented URL here, and
 *  "Help center" / "Contact support" deliberately route to the in-app Support
 *  page rather than to more guesses. */
const TERMS_URL = "https://www.arenode.com/terms";

interface SettingsPageProps {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    hospitalId: string;
    /** Needed by the health probes and the local draft check. */
    doctorId: string;
    hospitalProfile: DBHospital | null;
    doctorProfile: DBDoctor | null;
    doctorName: string;
    /** Takes a search result to the page that owns it. */
    onNavigate: (page: SidebarPage) => void;
    /** Fired after the specialty write so the caller updates its cached
     *  hospital row without a refetch. */
    onSpecialtyChanged: (specialtyProfileId: string) => void;
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
            {/* The glyph sits in its own tinted well rather than floating as a
                thin outline on a nebula — at 17px, white/45, over a moving
                purple gradient it read as nothing at all. */}
            <span className="pointer-events-none absolute left-[6px] top-1/2 z-[1] grid h-[32px] w-[32px] -translate-y-1/2 place-items-center rounded-[9px] bg-white/[0.10] text-white/80">
                <Search size={17} />
            </span>
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
                    "h-[44px]! w-full rounded-[13px]! border! border-white/25 bg-[rgba(8,12,28,0.55)]! pl-[46px]! pr-[56px] " +
                    "text-[14px]! font-medium text-white! outline-none backdrop-blur-[10px] " +
                    "placeholder:text-white/55 transition-colors " +
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_10px_rgba(0,0,0,0.30)] " +
                    "hover:border-white/40 focus:border-[rgba(167,139,250,0.85)] focus:bg-[rgba(8,12,28,0.72)]!"
                }
            />
            <kbd className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 rounded-[6px] border border-white/20 bg-white/[0.10] px-[7px] py-[3px] text-[10.5px] font-semibold text-white/65">
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
function AccountModal({
    email, accountReference, onClose, onSupport,
}: {
    email: string | null;
    accountReference: string;
    onClose: () => void;
    /** The three operations a doctor should not perform alone — see
     *  SupportRequestModal.tsx for why they are not self-service. */
    onSupport: (topic: SupportTopic) => void;
}) {
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
                                icon={<Users size={16} />} label="Add a colleague"
                                sub="We set up additional doctors on your clinic"
                                onClick={() => onSupport({
                                    title: "Add a doctor to this clinic",
                                    reason: "A second doctor changes who can see which patients, so we set it up with you rather than leaving it to a form. Tell us who to add and we will get them signed in.",
                                })}
                            />
                            <SettingRow
                                icon={<Trash2 size={16} />} label="Close this account"
                                sub="Clinical records carry retention rules — we handle this with you"
                                onClick={() => onSupport({
                                    title: "Close clinic account",
                                    reason: "Clinical records cannot simply be deleted on a button press — there are retention obligations, and you may need a copy first. We will walk through it with you and make sure nothing you are required to keep is lost.",
                                })}
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
    logoRef, onOpenSidebar, hospitalId, doctorId, hospitalProfile, doctorProfile,
    doctorName, onNavigate, onSpecialtyChanged,
}: SettingsPageProps) {
    const logout = useLogout();
    const auth = useAuth();
    const [subscription, setSubscription] = useState<ClinicSubscription | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [accountOpen, setAccountOpen] = useState(false);
    const [confirmingDrafts, setConfirmingDrafts] = useState(false);
    const [confirmingGlobal, setConfirmingGlobal] = useState(false);
    const [globalBusy, setGlobalBusy] = useState(false);
    const [authEmail, setAuthEmail] = useState<string | null>(null);
    const [lastSignIn, setLastSignIn] = useState<string | null>(null);
    /** Non-null while the shared "our team handles this" surface is open. */
    const [supportTopic, setSupportTopic] = useState<SupportTopic | null>(null);

    // Consult Setup — the specialty profile. Back on Settings at Anmol's call
    // (it briefly lived on Clinic): it configures the ENGINE, not the clinic's
    // public identity, which is what the rest of Clinic is about.
    const [specialtyOpen, setSpecialtyOpen] = useState(false);
    const [savingSpecialty, setSavingSpecialty] = useState<string | null>(null);
    const [specialtyError, setSpecialtyError] = useState<string | null>(null);
    const currentSpecialtyId = hospitalProfile?.specialty_profile ?? "general_opd";
    const currentSpecialty = PROFILES[currentSpecialtyId] ?? PROFILES.general_opd;

    const pickSpecialty = async (id: string) => {
        if (id === currentSpecialtyId || savingSpecialty) return;
        setSavingSpecialty(id);
        setSpecialtyError(null);
        try {
            await updateHospitalSpecialtyProfile(hospitalId, id);
            // `updateHospitalSpecialtyProfile` lives in db/patients.ts, which
            // profileCache imports — invalidating inside it would be circular,
            // so this is the one write that invalidates at its call site.
            invalidateHospital(hospitalId);
            onSpecialtyChanged(id);
        } catch (e) {
            setSpecialtyError(e instanceof Error ? e.message : "Could not save — try again");
        } finally {
            setSavingSpecialty(null);
        }
    };

    // The shortcut REFERENCE is a document, not a control. It opens the sheet
    // the consult screen already owns rather than spending a card on a
    // 44-row scrolling list.
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Health is SUMMARISED here and explained on its own page.
    const [view, setView] = useState<"settings" | "health">("settings");
    const [health, setHealth] = useState<HealthSnapshot | null>(null);
    useEffect(() => {
        let cancelled = false;
        probeHealth({ hospitalId, doctorId })
            .then((snap) => { if (!cancelled) setHealth(snap); })
            .catch(() => { /* the strip stays in its checking state */ });
        return () => { cancelled = true; };
    }, [hospitalId, doctorId]);

    const device = useMemo(describeThisDevice, []);

    /** Ends every session on every device — `scope: "global"`, which is a
     *  genuinely different operation from the local sign-out `useLogout`
     *  performs. Supabase invalidates the refresh tokens server-side, so the
     *  local logout afterwards is just this tab catching up. */
    const signOutEverywhere = async () => {
        setGlobalBusy(true);
        try {
            await supabase.auth.signOut({ scope: "global" });
            toast.success("Signed out on every device.");
            await logout();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not sign out everywhere.");
        } finally {
            setGlobalBusy(false);
            setConfirmingGlobal(false);
        }
    };

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
        supabase.auth.getUser().then(({ data }) => {
            setAuthEmail(data.user?.email ?? null);
            const at = data.user?.last_sign_in_at;
            setLastSignIn(at ? new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
        }).catch(() => {});
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

    /**
     * Entitlement keys are machine names; these are the words a doctor would
     * use. A key with no label here is simply not shown — better a shorter
     * list than a chip reading "rx_templates".
     */
    const included = useMemo(() => {
        const LABELS: Record<string, string> = {
            synapse: "Synapse suggestions",
            whatsapp: "WhatsApp",
            prescriptions: "Prescriptions",
            rx_templates: "Templates",
            care_plans: "Care plans",
            longitudinal: "Progress tracking",
            phone_upload: "Phone uploads",
            attachments: "Attachments",
            specialty_packs: "Specialty packs",
        };
        return (subscription?.entitlements ?? [])
            .filter((e) => e.enabled && LABELS[e.featureKey])
            .map((e) => LABELS[e.featureKey]);
    }, [subscription]);

    const renewsOn = subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : null;

    // The health page is a full page in its own right — its own dark header,
    // its own back button, its own scroll region — reached from the strip
    // below rather than being a modal cramped inside this one.
    if (view === "health") {
        return (
            <HealthPage
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                onBack={() => setView("settings")}
                hospitalId={hospitalId}
                doctorId={doctorId}
                clinicName={hospitalProfile?.name ?? "This clinic"}
            />
        );
    }

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

                            <div className="my-[13px] h-px bg-[var(--cs-line)]" />

                            {/* Email, password and sessions live HERE and only
                                here. They previously had a second card of their
                                own that opened this same modal — the identical
                                operation offered twice on one screen. */}
                            <SettingRow
                                icon={<Mail size={17} />}
                                label="Email & password"
                                sub={lastSignIn ? `Last signed in ${lastSignIn}` : "How you sign in to Cortex"}
                                onClick={() => setAccountOpen(true)}
                            />

                            {/* Which clinic, as what — the two facts a doctor
                                signed into more than one place actually needs,
                                and the answer to "why can't I see patient X".
                                Real values off the session, not decoration. */}
                            <dl className="m-0 mt-[2px] flex flex-col">
                                <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[12px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Clinic</dt>
                                    <dd className="m-0 truncate text-[12.5px] font-bold text-[var(--cs-ink)]">
                                        {hospitalProfile?.name ?? "—"}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-[10px] px-[12px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Role</dt>
                                    <dd className="m-0 text-[12.5px] font-bold capitalize text-[var(--cs-ink)]">
                                        {auth.status === "authed" ? (auth.identity.user.role ?? "Doctor") : "Doctor"}
                                    </dd>
                                </div>
                            </dl>

                            {/* Professional and clinic details are NOT duplicated
                                here — Clinic owns that editor, and this is the
                                way to it. */}
                            <button
                                type="button"
                                onClick={() => openSetting(SETTINGS_INDEX.find((e) => e.id === "clinic.doctor")!)}
                                className="mt-[8px] inline-flex w-fit items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-[var(--cs-violet)] transition-colors hover:border-[var(--cs-violet)]"
                            >
                                Professional details <ArrowRight size={14} />
                            </button>
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

                                    {/* What the plan actually carries — the
                                        entitlement rows, labelled. Real data,
                                        already fetched alongside the plan, and
                                        the honest answer to "what am I paying
                                        for" sitting beside "what does it cost". */}
                                    {included.length > 0 && (
                                        <div className="mt-[12px] flex flex-wrap gap-[6px]">
                                            {included.map((label) => (
                                                <span
                                                    key={label}
                                                    className="inline-flex items-center gap-[5px] rounded-full border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[4px] text-[11.5px] font-semibold text-[var(--cs-label)]"
                                                >
                                                    <Check size={11} className="text-[var(--cs-green)]" />
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-[12px]">
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

                        {/* ══ Consult Setup ══════════════════════════════════
                            The engine's own configuration — which chart the
                            consult opens with, which outputs are elevated.
                            Nine options for something set once at onboarding is
                            a wall, so it is folded to its current value. */}
                        <SettingsCard
                            id="set-card-consult"
                            icon={<Stethoscope size={17} />}
                            tint="bg-[rgba(18,104,232,0.10)] text-[var(--cs-blue)]"
                            title="Consult Setup"
                        >
                            <div className="flex items-center gap-[11px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[11px]">
                                <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] border border-[var(--cs-line)] bg-white text-[var(--cs-blue)]">
                                    <Stethoscope size={16} />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                    <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                        Specialty profile
                                    </span>
                                    <span className="text-[14px] font-bold text-[var(--cs-ink)]">
                                        {currentSpecialty.label}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSpecialtyOpen((v) => !v)}
                                    aria-expanded={specialtyOpen}
                                    className="flex flex-none items-center gap-[4px] rounded-full border border-[var(--cs-line-strong)] bg-white px-[12px] py-[6px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                                >
                                    {specialtyOpen ? "Close" : "Change"}
                                    <ChevronDown size={12} className={specialtyOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                                </button>
                            </div>

                            <p className="m-0 mt-[9px] px-[2px] text-[12px] leading-[1.5] text-[var(--cs-faint)]">
                                Decides the chart, the elevated outputs and the measurements the consult
                                screen opens with.
                            </p>

                            {/* What the CURRENT profile actually gives you, read
                                off the profile itself — so the card answers "and
                                what does that mean for me" instead of leaving a
                                fold and a sentence in a stretched box. */}
                            <dl className="m-0 mt-[10px] flex flex-col">
                                <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Primary output</dt>
                                    <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">
                                        {currentSpecialty.primaryLabel}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Charts</dt>
                                    <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">
                                        {currentSpecialty.charts.length > 0
                                            ? currentSpecialty.charts.map((c) => CHART_LABEL[c]).join(" + ")
                                            : "None"}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-[10px] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Applies to</dt>
                                    <dd className="m-0 truncate text-[12.5px] font-bold text-[var(--cs-ink)]">
                                        {hospitalProfile?.name ?? "This clinic"}
                                    </dd>
                                </div>
                            </dl>

                            {specialtyOpen && (
                                <div className="mt-[9px] grid grid-cols-2 gap-[6px] max-[560px]:grid-cols-1">
                                    {PROFILE_LIST.map((sp) => {
                                        const active = sp.id === currentSpecialtyId;
                                        const saving = savingSpecialty === sp.id;
                                        return (
                                            <button
                                                key={sp.id}
                                                type="button"
                                                aria-pressed={active}
                                                disabled={savingSpecialty !== null}
                                                onClick={() => pickSpecialty(sp.id)}
                                                className={
                                                    "flex min-w-0 flex-col gap-[2px] rounded-[10px] border px-[11px] py-[9px] text-left transition-colors " +
                                                    (active
                                                        ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)]"
                                                        : "border-[var(--cs-line)] bg-white hover:border-[rgba(18,104,232,0.4)]")
                                                }
                                            >
                                                <span className="flex items-center gap-[6px]">
                                                    <span className="truncate text-[12.5px] font-bold text-[var(--cs-ink)]">{sp.label}</span>
                                                    {saving && <Loader2 size={13} className="animate-spin text-[var(--cs-blue)]" />}
                                                    {!saving && active && <Check size={13} className="text-[var(--cs-blue)]" />}
                                                </span>
                                                <span className="truncate text-[11px] text-[var(--cs-faint)]">
                                                    {sp.primaryLabel} primary
                                                    {sp.charts.length > 0 && ` · ${sp.charts.map((c) => CHART_LABEL[c]).join(" + ")}`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            {specialtyError && (
                                <p className="mt-[6px] text-[12px] font-medium text-[var(--cs-red)]">{specialtyError}</p>
                            )}

                            {/* The shortcut reference, one row. It opens the
                                sheet the consult screen already has — a
                                44-row scrolling list does not belong in a
                                quarter of this page. */}
                            <button
                                type="button"
                                onClick={() => setShortcutsOpen(true)}
                                className="mt-[10px] flex items-center gap-[11px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[11px] text-left transition-colors hover:border-[var(--cs-line-strong)] hover:bg-[var(--cs-page)]"
                            >
                                <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] bg-[var(--cs-page)] text-[var(--cs-violet)]">
                                    <Keyboard size={16} />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                    <span className="text-[13.5px] font-semibold text-[var(--cs-ink)]">Keyboard shortcuts</span>
                                    <span className="text-[12px] text-[var(--cs-faint)]">
                                        {BINDINGS.length} keys — or press ? during a consult
                                    </span>
                                </span>
                                <ChevronRight size={16} className="flex-none text-[var(--cs-faint)]" />
                            </button>
                        </SettingsCard>

                        {/* ══ Devices ════════════════════════════════════════
                            A doctor moves between a clinic desktop, a laptop
                            and (soon) a tablet, and the only question that
                            matters on a shared machine is "am I still signed
                            in over there". This names the machine you are on
                            and gives you the one control that answers it. */}
                        <SettingsCard
                            id="set-card-devices"
                            icon={<Laptop size={17} />}
                            tint="bg-[rgba(15,118,110,0.10)] text-[var(--cs-teal)]"
                            title="Devices"
                        >
                            <div className="flex items-center gap-[11px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[11px]">
                                <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] border border-[var(--cs-line)] bg-white text-[var(--cs-teal)]">
                                    <Laptop size={16} />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                    <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">
                                        This device
                                    </span>
                                    <span className="truncate text-[14px] font-bold text-[var(--cs-ink)]">{device.name}</span>
                                </span>
                                <span className="flex-none rounded-full bg-[rgba(22,163,74,0.10)] px-[9px] py-[3px] text-[11px] font-bold text-[var(--cs-green)]">
                                    Active now
                                </span>
                            </div>

                            <dl className="m-0 mt-[10px] flex flex-col">
                                <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Type</dt>
                                    <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">{device.kind}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Last signed in</dt>
                                    <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">{lastSignIn ?? "—"}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-[10px] px-[2px] py-[9px]">
                                    <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Other devices</dt>
                                    {/* Honest: Supabase does not expose a session
                                        list to the client, so we do not pretend
                                        to have one. Signing out everywhere works
                                        regardless of what we can enumerate. */}
                                    <dd className="m-0 text-[12.5px] font-semibold text-[var(--cs-faint)]">Not tracked yet</dd>
                                </div>
                            </dl>

                            <div className="mt-[10px] flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px]">
                                <span className="flex min-w-0 flex-col gap-[1px]">
                                    <span className="text-[13px] font-semibold text-[var(--cs-ink)]">Sign out everywhere</span>
                                    <span className="text-[11.5px] leading-[1.45] text-[var(--cs-faint)]">
                                        Ends every session, on every device
                                    </span>
                                </span>
                                {confirmingGlobal ? (
                                    <span className="flex flex-none items-center gap-[6px]">
                                        <button
                                            type="button" onClick={() => setConfirmingGlobal(false)}
                                            className="rounded-full border border-[var(--cs-line-strong)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-label)]"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button" onClick={signOutEverywhere} disabled={globalBusy}
                                            className="flex items-center gap-[5px] rounded-full border border-[var(--cs-red)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-red)] disabled:opacity-60"
                                        >
                                            {globalBusy && <Loader2 size={12} className="animate-spin" />}
                                            Confirm
                                        </button>
                                    </span>
                                ) : (
                                    <button
                                        type="button" onClick={() => setConfirmingGlobal(true)}
                                        className="flex-none rounded-full border border-[var(--cs-line-strong)] bg-white px-[12px] py-[6px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-red)] hover:text-[var(--cs-red)]"
                                    >
                                        Sign out
                                    </button>
                                )}
                            </div>
                        </SettingsCard>
                    </div>

                    {/* ══ System Health — a small section, opening a page ═════
                        Anmol: "the health thing should belong as a small
                        section on the settings page, and then you click on it
                        and the main page appears." A strip, not a fifth card:
                        the answer here is one word, and everything that needs
                        room to explain itself lives on the page behind it. */}
                    <button
                        type="button"
                        id="set-health-strip"
                        onClick={() => setView("health")}
                        className="flex w-full items-center gap-[14px] rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[18px] py-[15px] text-left shadow-[var(--cs-shadow)] transition-colors hover:border-[var(--cs-line-strong)]"
                    >
                        <span className={`${ICON_TILE} ${
                            !health ? "bg-[var(--cs-page)] text-[var(--cs-faint)]"
                            : health.overall === "healthy" ? "bg-[rgba(22,163,74,0.10)] text-[var(--cs-green)]"
                            : health.overall === "warning" ? "bg-[rgba(180,83,9,0.10)] text-[var(--cs-amber)]"
                            : "bg-[rgba(180,35,24,0.10)] text-[var(--cs-red)]"
                        }`}>
                            {!health ? <Activity size={17} />
                                : health.overall === "healthy" ? <ShieldCheck size={17} />
                                : <AlertTriangle size={17} />}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                            <span className="text-[13px] font-bold uppercase tracking-[0.07em] text-[var(--cs-ink)]">
                                System Health
                            </span>
                            <span className="text-[12.5px] text-[var(--cs-faint)]">
                                {!health
                                    ? "Checking records, suggestions and uploads…"
                                    : health.overall === "healthy"
                                        ? "Everything is working — records, suggestions and uploads all responded"
                                        : `${health.services.filter(isDegraded).length} of ${health.services.length} services need attention`}
                            </span>
                        </span>
                        <span className="flex flex-none items-center gap-[6px] text-[12.5px] font-bold text-[var(--cs-blue)]">
                            View details <ChevronRight size={15} />
                        </span>
                    </button>

                    {/* ══ Help & Support — a strip, not a fifth card ═════════ */}
                    <section
                        id="set-help-strip"
                        aria-label="Help, terms and privacy"
                        className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px] rounded-[16px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[18px] py-[14px] shadow-[var(--cs-shadow)]"
                    >
                        {[
                            { icon: <HelpCircle size={15} />, label: "Help & support", sub: "Guides, and a way to reach us", onClick: () => onNavigate("support") },
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
                        <p className="m-0 flex flex-wrap items-center gap-[7px] text-[11.5px] text-[var(--cs-faint)]">
                            Account reference
                            <code className="rounded-[5px] bg-[var(--cs-card)] px-[7px] py-[2px] text-[11px] tracking-[0.04em] text-[var(--cs-label)]">
                                {hospitalId.slice(0, 8)}
                            </code>
                            — quote this to support.
                            {/* Troubleshooting, not a setting: demoted to the
                                footer rather than given a card of its own. */}
                            <span className="mx-[2px] h-[11px] w-px bg-[var(--cs-line-strong)]" />
                            <button
                                type="button"
                                onClick={() => { clearProfileCache(); clearAllConsultDrafts(); toast.success("Local cache and saved drafts cleared."); }}
                                className="text-[11.5px] font-semibold text-[var(--cs-label)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--cs-blue)]"
                                title="Clears this browser's cached clinic details and any saved consult drafts"
                            >
                                Clear local data
                            </button>
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

            {accountOpen && (
                <AccountModal
                    email={authEmail}
                    accountReference={hospitalId.slice(0, 8)}
                    onClose={() => setAccountOpen(false)}
                    onSupport={(topic) => { setAccountOpen(false); setSupportTopic(topic); }}
                />
            )}
            {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}

            {supportTopic && (
                <SupportRequestModal
                    topic={supportTopic}
                    accountReference={hospitalId.slice(0, 8)}
                    onClose={() => setSupportTopic(null)}
                />
            )}
        </div>
    );
}
