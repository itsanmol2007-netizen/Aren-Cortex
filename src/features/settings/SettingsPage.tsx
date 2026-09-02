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
    Activity, AlertTriangle, ArrowRight, Check, ChevronRight,
    ExternalLink, FileText, HelpCircle, Info, Keyboard, Laptop, Loader2, Lock,
    LogOut, Mail, MonitorSmartphone, Receipt, Search, Settings2, Shield,
    ShieldCheck, Smartphone, Stethoscope, Tablet, Trash2, User, Users, X,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useAuth } from "../auth/AuthProvider";
import { useLogout } from "../auth/useLogout";
import { supabase } from "../../lib/supabase";
import {
    billingIntervalLabel, clearProfileCache, fetchClinicSubscription,
    formatPlanPrice, fetchSubscriptionRequests, submitSubscriptionRequest,
    REQUEST_KIND_LABEL, updateDoctorContactEmail,
    describeDevice, fetchDevices, formFactorLabel, lastSeenLabel, revokeDevice,
    type ClinicSubscription, type DBDoctor, type DBHospital,
    type SubscriptionRequest, type SubscriptionRequestKind, type UserDevice,
} from "../../lib/db";
import { clearAllConsultDrafts } from "../../lib/consultDraft";
import { PROFILES, type ChartKind } from "../synapse/specialtyProfile";
import { updateHospitalSpecialtyProfile, invalidateHospital } from "../../lib/db";
import { BINDINGS } from "../../lib/keyboard/keymap";
import { ShortcutsSheet } from "../../components/ShortcutsSheet";
import { HealthPage } from "./health/HealthPage";
import {
    cacheSnapshot, isDegraded, probeHealth, readCachedSnapshot, type HealthSnapshot,
} from "./health/model";
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
 * The doctor photo's backdrop, ON SCREEN.
 *
 * It used to be a saturated blue→indigo fill, which read as a coloured tile
 * with a face on it rather than as a portrait — "why are you putting that
 * blue background behind the doctor's profile?" (2026-09-01). This is the
 * brand gradient at wash strength: enough to be ours, faint enough that the
 * photo, or the initials, is the thing you see.
 *
 * PRESCRIPTIONS DO NOT USE THIS. Printed output keeps a plain white ground —
 * a tinted disc behind a prescriber's photo costs ink and reads as decoration
 * on a clinical document. See `PrescriptionPreview`, which paints its own.
 */
const AVATAR_SCREEN_BG =
    "bg-[linear-gradient(135deg,rgba(18,104,232,0.13),rgba(124,58,237,0.13))] " +
    "text-[var(--cs-blue)] ring-1 ring-inset ring-[rgba(18,104,232,0.16)]";

/** Form-factor icon for a device row — a tablet should not wear a laptop. */
function deviceIcon(formFactor: string) {
    if (formFactor === "tablet") return <Tablet size={16} />;
    if (formFactor === "phone") return <Smartphone size={16} />;
    return <Laptop size={16} />;
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

// ── Managing a subscription, before there is billing ────────────────────────

/**
 * What "Manage subscription" opens.
 *
 * There is no payment provider wired up, so this cannot be a billing portal
 * and must not pretend to be one. What it can honestly be is the plan in
 * full — what the clinic is on, what that carries, who we bill — plus the one
 * thing a doctor actually wants from a billing portal: a way to ask for a
 * change and know the ask landed. That goes to `subscription_requests`
 * (lib/db/subscriptions.ts), against this clinic, in their own words.
 *
 * Nothing here branches on the plan's NAME. Every string a doctor reads —
 * name, tagline, highlights, support promise, the note under the form — is a
 * row an Admin can edit without a deploy.
 */
function ManageSubscriptionModal({
    subscription, hospitalId, userId, contactEmail, onClose,
}: {
    subscription: ClinicSubscription;
    hospitalId: string;
    userId: string | null;
    /** Pre-fills who to reply to. The doctor's own address or nothing —
     *  never the phone-derived sign-in address. */
    contactEmail: string | null;
    onClose: () => void;
}) {
    const [kind, setKind] = useState<SubscriptionRequestKind | null>(null);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<SubscriptionRequest[] | null>(null);

    // Requests already filed. Shown so a doctor who asked on Monday sees that
    // it landed rather than asking again on Tuesday.
    useEffect(() => {
        let cancelled = false;
        fetchSubscriptionRequests(hospitalId)
            .then((rows) => { if (!cancelled) setHistory(rows); })
            .catch(() => { if (!cancelled) setHistory([]); });
        return () => { cancelled = true; };
    }, [hospitalId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const submit = async () => {
        if (!kind) return;
        if (!userId) { setError("Sign in again to file this request."); return; }
        setBusy(true);
        setError(null);
        try {
            await submitSubscriptionRequest({
                hospitalId,
                subscriptionId: subscription.id,
                requestedBy: userId,
                kind,
                message,
                contactEmail,
            });
            toast.success("Sent. We'll come back to you on this.");
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not send that just now.");
        } finally {
            setBusy(false);
        }
    };

    const price = formatPlanPrice(subscription.plan);
    const started = new Date(subscription.startedAt).toLocaleDateString("en-IN", {
        day: "numeric", month: "short", year: "numeric",
    });

    return (
        <div
            className="fixed inset-0 z-[900] flex items-center justify-center bg-[rgba(11,23,51,0.28)] p-[32px] backdrop-blur-[14px]"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="flex max-h-[min(720px,88vh)] w-[min(560px,100%)] flex-col overflow-hidden rounded-[20px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,252,0.94))] shadow-[0_40px_80px_-32px_rgba(11,23,51,0.55)]">
                <div className="h-[4px] flex-none bg-[linear-gradient(90deg,#a855f7_0%,#6366f1_100%)]" />

                <div className="flex flex-none items-start justify-between gap-[12px] px-[18px] pb-[12px] pt-[16px]">
                    <div className="flex min-w-0 items-center gap-[10px]">
                        <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] bg-[linear-gradient(135deg,rgba(168,85,247,0.16),rgba(99,102,241,0.16))] text-[var(--cs-violet)]">
                            <Shield size={16} />
                        </span>
                        <div className="min-w-0">
                            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cs-violet)]">
                                Your subscription
                            </p>
                            <span className="truncate text-[15px] font-bold text-[var(--cs-ink)]">
                                {subscription.plan.name}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button" onClick={onClose} aria-label="Close"
                        className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] border border-[var(--cs-line-strong)] bg-white text-[var(--cs-muted)]"
                    >
                        <X size={14} />
                    </button>
                </div>

                {/* One scroll region, so the sheet never grows past the
                    viewport and the form never scrolls the page behind it. */}
                <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] pb-[18px]">
                    {subscription.plan.description && (
                        <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--cs-muted)]">
                            {subscription.plan.description}
                        </p>
                    )}

                    {/* The commercial facts, in one block. Every value is a
                        column, including the ones that are legitimately blank
                        — "not set" beats a plausible-looking zero. */}
                    <dl className="m-0 grid grid-cols-2 gap-x-[14px] gap-y-[2px] rounded-[12px] border border-[var(--cs-line)] bg-white px-[14px] py-[10px]">
                        {/* `cap` only where the VALUE is a machine word.
                            Tailwind's `capitalize` title-cases every word, so
                            applying it to the whole grid turned "Agreed with
                            us directly" into "Agreed With Us Directly". */}
                        {([
                            ["Plan", subscription.plan.name, false],
                            ["Status", subscription.status, true],
                            ["Billing", price ?? "Agreed with us directly", false],
                            ["Doctors included", subscription.seats === 1 ? "1 doctor" : `${subscription.seats} doctors`, false],
                            ["Started", started, false],
                            ["Billed to", subscription.billingEmail ?? contactEmail ?? "Not set", false],
                        ] as [string, string, boolean][]).map(([label, value, cap]) => (
                            <div key={label} className="flex flex-col gap-[1px] border-b border-[var(--cs-line)] py-[7px] last:border-b-0 [&:nth-last-child(2)]:border-b-0">
                                <dt className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--cs-faint)]">{label}</dt>
                                <dd className={`m-0 truncate text-[12.5px] font-bold text-[var(--cs-ink)] ${cap ? "capitalize" : ""}`}>{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {subscription.plan.highlights.length > 0 && (
                        <div>
                            <p className="m-0 mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-faint)]">
                                What this plan carries
                            </p>
                            <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
                                {subscription.plan.highlights.map((line) => (
                                    <li key={line} className="flex items-start gap-[8px] text-[12.5px] leading-[1.5] text-[var(--cs-label)]">
                                        <Check size={13} className="mt-[3px] flex-none text-[var(--cs-green)]" />
                                        {line}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {subscription.plan.supportResponse && (
                        <p className="m-0 flex items-start gap-[8px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                            <HelpCircle size={14} className="mt-[2px] flex-none text-[var(--cs-violet)]" />
                            {subscription.plan.supportResponse}
                        </p>
                    )}

                    <div className="h-px bg-[var(--cs-line)]" />

                    {/* The ask. Not a mailto — a row against this clinic, so
                        it survives an unconfigured mail client. */}
                    <div>
                        <p className="m-0 mb-[3px] text-[13px] font-bold text-[var(--cs-ink)]">Need a change?</p>
                        <p className="m-0 mb-[9px] text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                            {subscription.plan.ctaNote ?? "Tell us what you need and we handle it with you."}
                        </p>

                        <div className="flex flex-wrap gap-[6px]">
                            {(Object.keys(REQUEST_KIND_LABEL) as SubscriptionRequestKind[]).map((k) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setKind(kind === k ? null : k)}
                                    className={`rounded-full border px-[11px] py-[5px] text-[11.5px] font-semibold transition-colors ${
                                        kind === k
                                            ? "border-[var(--cs-violet)] bg-[rgba(124,58,237,0.08)] text-[var(--cs-violet)]"
                                            : "border-[var(--cs-line-strong)] bg-white text-[var(--cs-label)] hover:border-[var(--cs-violet)]"
                                    }`}
                                >
                                    {REQUEST_KIND_LABEL[k]}
                                </button>
                            ))}
                        </div>

                        {kind && (
                            <div className="mt-[10px] flex flex-col gap-[8px]">
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    rows={3}
                                    autoFocus
                                    placeholder="Anything we should know? Optional."
                                    className="w-full resize-none rounded-[10px]! border! border-[var(--cs-line-strong)] bg-white! px-[12px]! py-[9px]! text-[12.5px]! leading-[1.5] text-[var(--cs-ink)]! outline-none focus:border-[var(--cs-violet)]"
                                />
                                <div className="flex items-center justify-between gap-[10px]">
                                    <span className="min-w-0 truncate text-[11.5px] text-[var(--cs-faint)]">
                                        {contactEmail
                                            ? `We'll reply to ${contactEmail}`
                                            : "Add a contact email to your account and we'll reply there."}
                                    </span>
                                    <button
                                        type="button" onClick={submit} disabled={busy}
                                        className="flex h-[36px] flex-none items-center gap-[6px] rounded-[10px] bg-[var(--cs-violet)] px-[16px] text-[12.5px] font-bold text-white disabled:opacity-60!"
                                    >
                                        {busy && <Loader2 size={13} className="animate-spin" />}
                                        Send request
                                    </button>
                                </div>
                            </div>
                        )}

                        {error && <p className="m-0 mt-[8px] text-[12px] font-medium text-[var(--cs-red)]">{error}</p>}
                    </div>

                    {history && history.length > 0 && (
                        <div>
                            <p className="m-0 mb-[7px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-faint)]">
                                Your recent requests
                            </p>
                            <ul className="m-0 flex list-none flex-col gap-[5px] p-0">
                                {history.map((r) => (
                                    <li key={r.id} className="flex items-center justify-between gap-[10px] rounded-[9px] border border-[var(--cs-line)] bg-white px-[11px] py-[7px]">
                                        <span className="flex min-w-0 flex-col">
                                            <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                {REQUEST_KIND_LABEL[r.kind] ?? r.kind}
                                            </span>
                                            <span className="text-[11px] text-[var(--cs-faint)]">
                                                {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                            </span>
                                        </span>
                                        <span className={`flex-none rounded-full px-[8px] py-[2px] text-[10.5px] font-bold capitalize ${
                                            r.status === "resolved"
                                                ? "bg-[rgba(22,163,74,0.10)] text-[var(--cs-green)]"
                                                : "bg-[var(--cs-page)] text-[var(--cs-faint)]"
                                        }`}>
                                            {r.status.replace("_", " ")}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* An invoice is the one thing a doctor will look for here
                        and not find. Say where it is instead of leaving them
                        hunting. */}
                    <p className="m-0 flex items-start gap-[8px] text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                        <Receipt size={13} className="mt-[2px] flex-none" />
                        Invoices are issued by us directly — ask above and we will send the ones you need.
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Specialty profile picker ────────────────────────────────────────────────

/**
 * A floating picker, not an in-place expansion.
 *
 * The grid used to render INSIDE the Consult Setup card when "Change" was
 * pressed, which grew that one card past its neighbour on the same row —
 * "clicking Change in speciality is just expanding the same box and the box
 * around it" (2026-09-02). A settings grid where opening one control resizes
 * its own card, but not the card beside it, is exactly the mismatched-height
 * row this page's cards were rebuilt to avoid. The picker now lives here, in
 * its own layer above the page — the card behind it never changes size.
 */
function SpecialtyModal({
    currentId, saving, error, onPick, onClose,
}: {
    currentId: string;
    saving: string | null;
    error: string | null;
    onPick: (id: string) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, saving]);

    return (
        <div
            className="fixed inset-0 z-[900] flex items-center justify-center bg-[rgba(11,23,51,0.28)] p-[32px] backdrop-blur-[14px]"
            onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
        >
            <div className="flex max-h-[min(600px,88vh)] w-[min(560px,100%)] flex-col overflow-hidden rounded-[20px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,252,0.94))] shadow-[0_40px_80px_-32px_rgba(11,23,51,0.55)]">
                <div className="h-[4px] flex-none bg-[linear-gradient(90deg,#1268e8_0%,#6366f1_100%)]" />
                <div className="flex flex-none items-center justify-between gap-[12px] px-[18px] pb-[10px] pt-[16px]">
                    <div className="flex items-center gap-[10px]">
                        <span className="grid h-[30px] w-[30px] place-items-center rounded-[8px] bg-[rgba(18,104,232,0.10)] text-[var(--cs-blue)]">
                            <Stethoscope size={15} />
                        </span>
                        <div>
                            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cs-blue)]">Consult Setup</p>
                            <span className="text-[14px] font-bold text-[var(--cs-ink)]">Change specialty profile</span>
                        </div>
                    </div>
                    <button
                        type="button" onClick={onClose} disabled={!!saving} aria-label="Close"
                        className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[8px] border border-[var(--cs-line-strong)] bg-white text-[var(--cs-muted)] disabled:opacity-60!"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[18px] pb-[18px]">
                    <p className="m-0 text-[12px] leading-[1.5] text-[var(--cs-faint)]">
                        Decides the chart, the elevated outputs and the measurements the consult screen opens with.
                    </p>

                    <div className="grid grid-cols-2 gap-[6px] max-[420px]:grid-cols-1">
                        {PROFILE_LIST.map((sp) => {
                            const active = sp.id === currentId;
                            const isSaving = saving === sp.id;
                            return (
                                <button
                                    key={sp.id}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={saving !== null}
                                    onClick={() => onPick(sp.id)}
                                    className={
                                        "flex min-w-0 flex-col gap-[2px] rounded-[10px] border px-[11px] py-[9px] text-left transition-colors disabled:cursor-default " +
                                        (active
                                            ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)]"
                                            : "border-[var(--cs-line)] bg-white hover:border-[rgba(18,104,232,0.4)]")
                                    }
                                >
                                    <span className="flex items-center gap-[6px]">
                                        <span className="truncate text-[12.5px] font-bold text-[var(--cs-ink)]">{sp.label}</span>
                                        {isSaving && <Loader2 size={13} className="animate-spin text-[var(--cs-blue)]" />}
                                        {!isSaving && active && <Check size={13} className="text-[var(--cs-blue)]" />}
                                    </span>
                                    <span className="truncate text-[11px] text-[var(--cs-faint)]">
                                        {sp.primaryLabel} primary
                                        {sp.charts.length > 0 && ` · ${sp.charts.map((c) => CHART_LABEL[c]).join(" + ")}`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {error && <p className="m-0 text-[12px] font-medium text-[var(--cs-red)]">{error}</p>}
                </div>
            </div>
        </div>
    );
}

// ── Account operations ──────────────────────────────────────────────────────

/**
 * The technical account surface.
 *
 * ── Two emails, and only one of them is real
 *
 * Sign-in is by phone. The landing repo turns the digits into a synthetic
 * Supabase Auth address (`<digits>@aren.internal`) purely so Supabase has
 * something shaped like an email to key on. This modal used to display that
 * address and offer "Change email" against `supabase.auth.updateUser` — which
 * would have rewritten the login identity out from under
 * `phoneToAuthEmail()` and locked the doctor out of their own clinic on the
 * next sign-in. It also published their phone number to anyone reading the
 * screen.
 *
 * So: the auth address is never shown and never editable. What this edits is
 * `doctors.email`, a plain contact address the doctor owns, which changes
 * nothing about how they sign in. Password IS the auth credential and is
 * still wired to Supabase Auth for real.
 */
function AccountModal({
    doctorId, email, phoneHint, accountReference, onClose, onSaved, onSupport,
}: {
    /** `null` when the signed-in user has no `doctors` row — rare, but then
     *  there is nowhere to store a contact address and the row says so. */
    doctorId: string | null;
    email: string | null;
    /** Last two digits of the sign-in number, e.g. "••••••••42", so a doctor
     *  can confirm WHICH account this is without the number being on screen. */
    phoneHint: string | null;
    accountReference: string;
    onClose: () => void;
    onSaved: (email: string | null) => void;
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
        if (!doctorId) { setError("This account has no doctor profile to attach an address to."); return; }
        const trimmed = nextEmail.trim();
        // Clearing it is legitimate — "no email on file" is a state we render
        // truthfully rather than a failure.
        if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
            setError("That doesn't look like an email address.");
            return;
        }
        if (trimmed === (email ?? "")) { setError("That's already the address on file."); return; }
        setBusy(true);
        try {
            await updateDoctorContactEmail(doctorId, trimmed || null);
            onSaved(trimmed || null);
            toast.success(trimmed ? "Contact email saved." : "Contact email removed.");
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save that address.");
        } finally {
            setBusy(false);
        }
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
                                {mode === "email" ? "Contact email" : mode === "password" ? "Change password" : "Manage account"}
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
                            {/* How you sign in, stated plainly and NOT editable.
                                The number is masked: it identifies the account
                                without putting a personal phone number on a
                                screen anyone in the room can read. */}
                            <div className="mx-[10px] mb-[4px] flex items-center gap-[10px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px]">
                                <span className="grid h-[28px] w-[28px] flex-none place-items-center rounded-[8px] border border-[var(--cs-line)] bg-white text-[var(--cs-faint)]">
                                    <ShieldCheck size={14} />
                                </span>
                                <span className="flex min-w-0 flex-col gap-[1px]">
                                    <span className="text-[12.5px] font-bold text-[var(--cs-ink)]">
                                        You sign in with your phone number
                                    </span>
                                    <span className="text-[11.5px] text-[var(--cs-faint)]">
                                        {phoneHint ? `${phoneHint} · ` : ""}changing it needs us — write to care@arenode.com
                                    </span>
                                </span>
                            </div>
                            <SettingRow
                                icon={<Mail size={16} />} label="Contact email"
                                sub={email ? `Currently ${email}` : "Where we reach you. Not used to sign in."}
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
                                Contact email address
                                <input
                                    className={`${inputClass} mt-[5px]`} type="email" value={nextEmail}
                                    onChange={(e) => setNextEmail(e.target.value)} autoFocus
                                    placeholder="you@yourclinic.com"
                                />
                            </label>
                            <p className="m-0 text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                                Where we send account and subscription mail. It does not change how you sign in —
                                that stays your phone number. Leave it blank to remove the address entirely.
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
    const [lastSignIn, setLastSignIn] = useState<string | null>(null);
    const [devices, setDevices] = useState<UserDevice[] | null>(null);
    const [devicesError, setDevicesError] = useState(false);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [manageSubOpen, setManageSubOpen] = useState(false);
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
            // A successful pick is the modal's own job done — close it. A
            // failed one leaves it open with the error in view so retrying
            // doesn't mean finding the "Change" button again.
            setSpecialtyOpen(false);
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
    // Seeded from the last check taken on this device, so the strip reads
    // truthfully the instant Settings opens — including with no internet,
    // where the live probe now short-circuits rather than hanging.
    const [health, setHealth] = useState<HealthSnapshot | null>(() => readCachedSnapshot());
    useEffect(() => {
        let cancelled = false;
        probeHealth({ hospitalId, doctorId })
            .then((snap) => { if (!cancelled) { setHealth(snap); cacheSnapshot(snap); } })
            .catch(() => { /* the strip keeps whatever it had */ });
        return () => { cancelled = true; };
    }, [hospitalId, doctorId]);

    /** Always available, even before (or without) the registry — the machine
     *  you are reading this on describes itself. */
    const thisDevice = useMemo(() => describeDevice(), []);

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

    // ⚠ THE AUTH EMAIL IS NEVER READ OUT OF THIS.
    //
    // Cortex signs in by phone: the landing repo derives a synthetic Supabase
    // Auth address from the digits (`<digits>@aren.internal`, lib/auth.ts).
    // It is undeliverable, it is not the doctor's address, and printing it
    // publishes their phone number on screen. This page used to show it as
    // "your email" and offer to change it — the change would have rewritten
    // the login identity and locked the doctor out.
    //
    // The only address we display is `doctors.email`, which the doctor sets
    // themselves. All we take from the auth user is when they last signed in.
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            const at = data.user?.last_sign_in_at;
            setLastSignIn(at ? new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null);
        }).catch(() => {});
    }, []);

    // Devices this account has signed in from. A failure here is cosmetic —
    // the card falls back to naming the machine you are on, which it can
    // always do from the user agent alone.
    const userId = auth.status === "authed" ? auth.identity.user.id : null;
    const loadDevices = useMemo(() => async () => {
        // No resolved session yet: fall through to the empty list so the card
        // renders its "this device" fallback row instead of holding a skeleton
        // that will never resolve.
        if (!userId) { setDevices([]); return; }
        try {
            setDevices(await fetchDevices(userId));
            setDevicesError(false);
        } catch {
            setDevicesError(true);
        }
    }, [userId]);
    useEffect(() => { void loadDevices(); }, [loadDevices]);

    const revokeOne = async (device: UserDevice) => {
        setRevoking(device.id);
        try {
            await revokeDevice(device.id);
            setDevices((list) => (list ?? []).filter((d) => d.id !== device.id));
            toast.success(`${device.label ?? "That device"} will be signed out when it next opens Cortex.`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not sign that device out.");
        } finally {
            setRevoking(null);
        }
    };

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

    // The doctor's own address, or nothing. Never `auth.user.email` (the
    // phone-derived placeholder) and never the phone number itself — see the
    // getUser effect above for why both are off limits on this surface.
    // `doctorProfile` is a prop the parent refetches on its own schedule, so a
    // save inside the modal would otherwise show the old value until the next
    // reload. `undefined` means "no local edit"; `null` means "cleared".
    const [emailOverride, setEmailOverride] = useState<string | null | undefined>(undefined);
    const contactEmail = emailOverride !== undefined ? emailOverride : (doctorProfile?.email?.trim() || null);

    // Enough of the sign-in number to recognise the account, never enough to
    // read it off someone's screen.
    const phoneHint = useMemo(() => {
        const raw = doctorProfile?.phone ?? (auth.status === "authed" ? auth.identity.user.phone : null);
        const digits = (raw ?? "").replace(/\D/g, "");
        return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doctorProfile?.phone, auth.status]);
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

    const price = subscription ? formatPlanPrice(subscription.plan) : null;

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
                            <span className={`grid h-[30px] w-[30px] flex-none place-items-center overflow-hidden rounded-full text-[11px] font-bold text-white ${doctorProfile?.avatar_url ? "bg-white/10" : "bg-white/[0.14]"}`}>
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
                                {/* Brand wash, not a blue tile — see
                                    AVATAR_SCREEN_BG. A photo covers it
                                    entirely; initials sit on it in brand ink. */}
                                <span className={`grid h-[84px] w-[84px] flex-none place-items-center overflow-hidden rounded-full text-[24px] font-bold ${AVATAR_SCREEN_BG}`}>
                                    {doctorProfile?.avatar_url
                                        ? <img src={doctorProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                                        : initials}
                                </span>
                                <div className="flex min-w-0 flex-col gap-[3px]">
                                    <span className="text-[17px] font-bold text-[var(--cs-ink)]">{doctorName}</span>
                                    <span className="truncate text-[12px] font-semibold text-[var(--cs-faint)]">
                                        {doctorProfile?.specialization?.trim() || "Doctor"}
                                        {hospitalProfile?.name ? ` · ${hospitalProfile.name}` : ""}
                                    </span>
                                    {/* The doctor's OWN address, or an honest
                                        blank. Never the phone-derived sign-in
                                        address, and never the phone number. */}
                                    {contactEmail ? (
                                        <span className="truncate text-[13px] text-[var(--cs-muted)]">{contactEmail}</span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setAccountOpen(true)}
                                            className="w-fit text-[12.5px] font-semibold text-[var(--cs-blue)] hover:underline"
                                        >
                                            Add a contact email
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* What this card is FOR, said once. A doctor
                                opening Settings for the first time should not
                                have to infer the difference between "your
                                account" and "your professional details". */}
                            <p className="m-0 mt-[12px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[12px] py-[9px] text-[12px] leading-[1.5] text-[var(--cs-muted)]">
                                <strong className="font-bold text-[var(--cs-ink)]">This card is your sign-in.</strong>{" "}
                                Your password, the address we reach you on, and which clinic you belong to. The
                                name, qualification and registration that print on a prescription live in
                                Professional details.
                            </p>

                            <div className="my-[13px] h-px bg-[var(--cs-line)]" />

                            {/* Password and contact address live HERE and only
                                here. They previously had a second card of their
                                own that opened this same modal — the identical
                                operation offered twice on one screen. */}
                            <SettingRow
                                icon={<Mail size={17} />}
                                label="Contact email & password"
                                sub={lastSignIn ? `Last signed in ${lastSignIn}` : "How we reach you, and how you sign in"}
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

                            {/* Two doors, side by side, because they are two
                                different jobs: manage the ACCOUNT here, edit
                                what PRINTS on Clinic. Naming both is what stops
                                "Professional details" reading as the only thing
                                this card can do. */}
                            <div className="mt-[10px] flex flex-wrap items-center gap-[8px]">
                                <button
                                    type="button"
                                    onClick={() => setAccountOpen(true)}
                                    className="inline-flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-[var(--cs-violet)] transition-colors hover:border-[var(--cs-violet)]"
                                >
                                    <Settings2 size={14} /> Manage account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openSetting(SETTINGS_INDEX.find((e) => e.id === "clinic.doctor")!)}
                                    className="inline-flex items-center gap-[7px] rounded-[10px] border border-[var(--cs-line-strong)] bg-white px-[14px] py-[9px] text-[12.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-violet)] hover:text-[var(--cs-violet)]"
                                >
                                    Professional details <ArrowRight size={14} />
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
                                        <span className="grid h-[76px] w-[76px] flex-none place-items-center rounded-full bg-[linear-gradient(135deg,rgba(168,85,247,0.16),rgba(99,102,241,0.16))] text-[var(--cs-violet)] ring-1 ring-inset ring-[rgba(124,58,237,0.18)]">
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
                                                {price ? ` · ${price}` : ""}
                                            </span>
                                            <span className="flex flex-wrap items-center gap-[5px]">
                                                <span className="inline-flex w-fit items-center gap-[5px] rounded-full bg-[rgba(22,163,74,0.10)] px-[9px] py-[3px] text-[11.5px] font-bold capitalize text-[var(--cs-green)]">
                                                    {subscription.status}
                                                </span>
                                                {/* A founding clinic is on terms
                                                    nobody else gets. Worth saying. */}
                                                {subscription.isFounding && (
                                                    <span className="inline-flex w-fit items-center gap-[4px] rounded-full bg-[rgba(124,58,237,0.10)] px-[9px] py-[3px] text-[11.5px] font-bold text-[var(--cs-violet)]">
                                                        <Check size={11} /> Founding clinic
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {subscription.plan.tagline && (
                                        <p className="m-0 mt-[12px] text-[12.5px] leading-[1.55] text-[var(--cs-muted)]">
                                            {subscription.plan.tagline}
                                        </p>
                                    )}

                                    <div className="my-[14px] h-px bg-[var(--cs-line)]" />

                                    <dl className="m-0 flex flex-col">
                                        {renewsOn && (
                                            <div className="flex items-center justify-between gap-[10px] border-b border-[var(--cs-line)] px-[2px] py-[8px]">
                                                <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Renews on</dt>
                                                <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">{renewsOn}</dd>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-[10px] px-[2px] py-[8px]">
                                            <dt className="text-[12px] font-semibold text-[var(--cs-faint)]">Doctors included</dt>
                                            <dd className="m-0 text-[12.5px] font-bold text-[var(--cs-ink)]">
                                                {subscription.seats === 1 ? "1 doctor" : `${subscription.seats} doctors`}
                                            </dd>
                                        </div>
                                    </dl>

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
                                            onClick={() => setManageSubOpen(true)}
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
                                    onClick={() => { setSpecialtyError(null); setSpecialtyOpen(true); }}
                                    className="flex flex-none items-center gap-[4px] rounded-full border border-[var(--cs-line-strong)] bg-white px-[12px] py-[6px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                                >
                                    Change
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
                            {/* The real list, from `user_devices`. Until the
                                first row comes back we still name the machine
                                you are on — that fact needs no network. */}
                            {devices === null && !devicesError ? (
                                <div className="flex flex-col gap-[8px]">
                                    {[0, 1].map((i) => (
                                        <div key={i} className="h-[54px] animate-pulse rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)]" />
                                    ))}
                                </div>
                            ) : (
                                <ul className="m-0 flex list-none flex-col gap-[8px] p-0">
                                    {(devices && devices.length > 0
                                        ? devices
                                        : [{
                                            id: "local", deviceKey: "local", label: thisDevice.label,
                                            platform: thisDevice.platform, browser: thisDevice.browser,
                                            formFactor: thisDevice.formFactor, firstSeenAt: "", lastSeenAt: "",
                                            revokedAt: null, isThisDevice: true,
                                        } as UserDevice]
                                    ).map((d) => (
                                        <li
                                            key={d.id}
                                            className={`flex items-center gap-[11px] rounded-[10px] border px-[12px] py-[10px] ${
                                                d.isThisDevice
                                                    ? "border-[rgba(15,118,110,0.30)] bg-[rgba(15,118,110,0.05)]"
                                                    : "border-[var(--cs-line)] bg-[var(--cs-page)]"
                                            }`}
                                        >
                                            <span className="grid h-[32px] w-[32px] flex-none place-items-center rounded-[9px] border border-[var(--cs-line)] bg-white text-[var(--cs-teal)]">
                                                {deviceIcon(d.formFactor)}
                                            </span>
                                            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                                <span className="truncate text-[13.5px] font-bold text-[var(--cs-ink)]">
                                                    {d.label ?? "Unknown device"}
                                                </span>
                                                <span className="truncate text-[11.5px] text-[var(--cs-faint)]">
                                                    {formFactorLabel(d.formFactor)}
                                                    {d.lastSeenAt ? ` · ${lastSeenLabel(d.lastSeenAt)}` : ""}
                                                </span>
                                            </span>
                                            {d.isThisDevice ? (
                                                <span className="flex-none rounded-full bg-[rgba(22,163,74,0.10)] px-[9px] py-[3px] text-[11px] font-bold text-[var(--cs-green)]">
                                                    This device
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => revokeOne(d)}
                                                    disabled={revoking === d.id}
                                                    className="flex flex-none items-center gap-[5px] rounded-full border border-[var(--cs-line-strong)] bg-white px-[11px] py-[5px] text-[11.5px] font-bold text-[var(--cs-label)] transition-colors hover:border-[var(--cs-red)] hover:text-[var(--cs-red)] disabled:opacity-60!"
                                                >
                                                    {revoking === d.id && <Loader2 size={11} className="animate-spin" />}
                                                    Sign out
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Revoking is enforced the next time that device
                                opens Cortex (lib/db/devices.ts). Saying so is
                                the difference between a control the doctor can
                                trust and one they find out about later. */}
                            <p className="m-0 mb-[10px] mt-[9px] px-[2px] text-[11.5px] leading-[1.5] text-[var(--cs-faint)]">
                                {devicesError
                                    ? "Couldn't load your other devices just now. Signing out everywhere still works."
                                    : devices && devices.length > 1
                                        ? "Signing a device out takes effect the next time it opens Cortex. To end every session immediately, use the button below."
                                        : "New machines appear here the first time you sign in on them."}
                            </p>

                            {/* Pinned to the foot of the card. The device list
                                above it grows with the account; the kill switch
                                stays where the eye lands last, and the card
                                never shows a pool of dead space under a short
                                list. */}
                            <div className="mt-auto flex items-center justify-between gap-[10px] rounded-[10px] border border-[var(--cs-line)] px-[12px] py-[10px]">
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
                    doctorId={doctorProfile?.id ?? null}
                    email={contactEmail}
                    phoneHint={phoneHint}
                    accountReference={hospitalId.slice(0, 8)}
                    onClose={() => setAccountOpen(false)}
                    onSaved={setEmailOverride}
                    onSupport={(topic) => { setAccountOpen(false); setSupportTopic(topic); }}
                />
            )}
            {manageSubOpen && subscription && (
                <ManageSubscriptionModal
                    subscription={subscription}
                    hospitalId={hospitalId}
                    userId={auth.status === "authed" ? auth.identity.user.id : null}
                    contactEmail={contactEmail}
                    onClose={() => setManageSubOpen(false)}
                />
            )}
            {specialtyOpen && (
                <SpecialtyModal
                    currentId={currentSpecialtyId}
                    saving={savingSpecialty}
                    error={specialtyError}
                    onPick={pickSpecialty}
                    onClose={() => setSpecialtyOpen(false)}
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
