// ---------------------------------------------------------------------------
// SETTINGS — the page that knows where every setting is.
//
// ── What this page is FOR, given most settings aren't on it
//
// Cortex deliberately keeps a setting next to the thing it configures: clinic
// hours sit on Clinic beside the clinic's identity, preferred labs sit on
// Practice beside the medicines they rank. Anmol, 2026-08-31, put the obvious
// objection: "the doctor's profile is already visible into the clinic page.
// So what is the use of settings page now? Seriously... think about it from a
// different way."
//
// The answer this page is built on: it is not the drawer that holds every
// switch, it is the INDEX that finds them, plus the few controls that belong
// to no other page because they are about the workspace itself rather than
// about the clinic or the practice.
//
// So it carries exactly two kinds of thing:
//
//   1. SEARCH across every setting in the app (`settingsRegistry.ts`), which
//      navigates to the owning page AND flashes the specific control
//      (`settingsFocus.ts`). Structure that is right for USING settings is
//      wrong for FINDING them; this is the half that fixes finding.
//   2. Settings with no other home — the specialty profile (which configures
//      the engine, not the clinic), locally cached data, saved drafts, and
//      the session itself.
//
// Anything that has a natural home elsewhere stays there and is reachable
// from the search. Nothing is duplicated: the account card below READS the
// doctor/clinic rows and links to Clinic to edit them, rather than growing a
// second editor that could disagree with the first.
//
// ── Layout
//
// Two columns throughout (layout-composition.md: "a page is a composition of
// panels, not one component stretched to fill the canvas" — nothing here
// takes the whole horizontal canvas, including the search). Cards are the
// SHARED `features/clinic/ui.tsx` primitives, not a new family, so this page
// and Clinic cannot drift into looking like two products.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import type { RefObject } from "react";
import {
    Check, ChevronDown, Database, LogOut, Loader2, Search, Shield,
    SlidersHorizontal, Stethoscope, Trash2, User,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useLogout } from "../auth/useLogout";
import { PROFILES, type ChartKind } from "../synapse/specialtyProfile";
import { updateHospitalSpecialtyProfile, clearProfileCache, invalidateHospital } from "../../lib/db";
import { clearAllConsultDrafts } from "../../lib/consultDraft";
import type { DBHospital, DBDoctor } from "../../lib/db";
import { Card, CardPillButton, EmptyBlock } from "../clinic/ui";
import type { SidebarPage } from "../sidebar/SidebarNav";
import { SETTINGS_INDEX, searchSettings, type SettingEntry } from "./settingsRegistry";
import { requestSettingFocus } from "./settingsFocus";
import { toast } from "sonner";
import "./settings.css";

interface SettingsPageProps {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    /** Always present — `useClinicalIdentity()` falls back to a constant, never null. */
    hospitalId: string;
    hospitalProfile: DBHospital | null;
    doctorProfile: DBDoctor | null;
    doctorName: string;
    /** Fired after a successful write so the caller can update its cached hospital profile without a refetch. */
    onSpecialtyChanged: (specialtyProfileId: string) => void;
    /** Takes a search result to the page that owns it. */
    onNavigate: (page: SidebarPage) => void;
}

const PROFILE_LIST = Object.values(PROFILES);

const CHART_LABEL: Record<ChartKind, string> = {
    dental: "Dental chart",
    body: "Body map",
    joints: "Joint map",
    growth: "Growth chart",
};

/** With nothing typed the index shows a small default set, not all of it —
 *  progressive-disclosure.md's rule for exactly this shape of control, and
 *  the "+N more" line below is the same one `MeasurementSearch` uses. */
const DEFAULT_VISIBLE = 5;

export function SettingsPage({
    logoRef,
    onOpenSidebar,
    hospitalId,
    hospitalProfile,
    doctorProfile,
    doctorName,
    onSpecialtyChanged,
    onNavigate,
}: SettingsPageProps) {
    const logout = useLogout();
    const currentId = hospitalProfile?.specialty_profile ?? "general_opd";
    const currentProfile = PROFILES[currentId] ?? PROFILES.general_opd;

    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [showAllResults, setShowAllResults] = useState(false);
    /** The specialty grid is nine cards for a control changed roughly never —
     *  folded away by default, see the card below. */
    const [specialtyOpen, setSpecialtyOpen] = useState(false);
    /** Inline confirm for the one destructive control on this page. A browser
     *  `confirm()` reads as an unofficial interruption in an app that owns
     *  all of its own chrome — same call as the QR modal's cancel step. */
    const [confirmingDrafts, setConfirmingDrafts] = useState(false);

    const results = useMemo(() => (query.trim() ? searchSettings(query) : SETTINGS_INDEX), [query]);
    const searching = query.trim().length > 0;
    const visibleResults = searching || showAllResults ? results : results.slice(0, DEFAULT_VISIBLE);
    const hiddenCount = results.length - visibleResults.length;

    const handlePick = async (id: string) => {
        if (id === currentId || savingId) return;
        setSavingId(id);
        setError(null);
        try {
            await updateHospitalSpecialtyProfile(hospitalId, id);
            // `updateHospitalSpecialtyProfile` lives in db/patients.ts, which
            // profileCache imports — so it cannot invalidate the cache itself
            // without a circular import. It is the ONE write that invalidates
            // at its call site; everything on the clinic surface does it
            // inside the write function. See profileCache.ts.
            invalidateHospital(hospitalId);
            onSpecialtyChanged(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save — try again");
        } finally {
            setSavingId(null);
        }
    };

    const openSetting = (entry: SettingEntry) => {
        requestSettingFocus(entry.anchor);
        onNavigate(entry.page);
    };

    const doctorInitials = doctorName
        .split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "DR";

    return (
        <div className="settings-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Settings"
                subtitle="Find any setting, and the few that live only here"
            />

            <div className="settings-scroll">
                <div className="settings-grid">
                    {/* ══ Find a setting — the reason this page exists ══════ */}
                    <Card
                        tone="violet"
                        icon={<Search size={14} />}
                        title="Find a Setting"
                        subtitle="Everything configurable in Cortex, wherever it actually lives."
                    >
                        <div className="settings-search-wrap">
                            <Search size={15} className="settings-search-icon" />
                            <input
                                className="settings-search-input"
                                placeholder="Clinic hours, preferred labs, signature…"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setShowAllResults(false); }}
                                aria-label="Search settings"
                            />
                        </div>

                        {visibleResults.length === 0 ? (
                            <EmptyBlock
                                art={<Search size={26} strokeWidth={1.4} className="text-[var(--cs-line-strong)]" aria-hidden="true" />}
                                fact="No setting matches that"
                                next="Try the thing it changes — “hours”, “signature”, “labs”."
                            />
                        ) : (
                            <div className="settings-result-list">
                                {visibleResults.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        className="settings-result"
                                        onClick={() => openSetting(entry)}
                                    >
                                        <span className="settings-result-main">
                                            <span className="settings-result-label">{entry.label}</span>
                                            <span className="settings-result-desc">{entry.description}</span>
                                        </span>
                                        <span className="settings-result-page">{entry.group}</span>
                                    </button>
                                ))}
                                {!searching && hiddenCount > 0 && (
                                    <button
                                        type="button"
                                        className="settings-result-more"
                                        onClick={() => setShowAllResults(true)}
                                    >
                                        +{hiddenCount} more — or search to find one
                                    </button>
                                )}
                            </div>
                        )}
                    </Card>

                    {/* ══ Who you are — read here, edited on Clinic ═════════ */}
                    <Card
                        tone="blue"
                        icon={<User size={14} />}
                        title="Your Account"
                        subtitle="Who Cortex is prescribing as, and where."
                    >
                        <div className="settings-account">
                            <div className="settings-account-avatar">
                                {doctorProfile?.avatar_url
                                    ? <img src={doctorProfile.avatar_url} alt="" />
                                    : doctorInitials}
                            </div>
                            <div className="settings-account-text">
                                <span className="settings-account-name">{doctorName}</span>
                                <span className="settings-account-sub">
                                    {doctorProfile?.specialization || "General"}
                                    {hospitalProfile?.name ? ` · ${hospitalProfile.name}` : ""}
                                </span>
                            </div>
                        </div>

                        <dl className="settings-facts">
                            <div>
                                <dt>Qualification</dt>
                                <dd>{doctorProfile?.qualification || "—"}</dd>
                            </div>
                            <div>
                                <dt>Registration</dt>
                                <dd>{doctorProfile?.registration_number || "—"}</dd>
                            </div>
                            <div>
                                <dt>Signature</dt>
                                <dd>{doctorProfile?.signature_image_url ? "Uploaded" : "Not uploaded"}</dd>
                            </div>
                        </dl>

                        {/* Not a second editor — the one that exists is on
                            Clinic, and this is the way to it. */}
                        <CardPillButton
                            tone="blue"
                            onClick={() => openSetting(SETTINGS_INDEX.find((s) => s.id === "clinic.doctor")!)}
                        >
                            <User size={11} /> Edit on Clinic
                        </CardPillButton>
                    </Card>

                    {/* ══ Workspace — the engine's own configuration ════════ */}
                    <Card
                        tone="slate"
                        icon={<SlidersHorizontal size={14} />}
                        title="Workspace"
                        subtitle="How the consult screen itself is set up for this facility."
                    >
                        {/* Nine cards for something changed once at onboarding
                            is a wall, not a control — Anmol: "hide this
                            facility filter... don't completely remove that
                            setting, but hide that setting at some points."
                            Folded to its current value plus a Change toggle;
                            the grid itself is unchanged underneath. */}
                        <div className="settings-current">
                            <span className="settings-current-icon"><Stethoscope size={15} /></span>
                            <span className="settings-current-text">
                                <span className="settings-current-label">Specialty profile</span>
                                <span className="settings-current-value">{currentProfile.label}</span>
                            </span>
                            <button
                                type="button"
                                className={`settings-disclosure${specialtyOpen ? " is-open" : ""}`}
                                onClick={() => setSpecialtyOpen((v) => !v)}
                                aria-expanded={specialtyOpen}
                            >
                                {specialtyOpen ? "Close" : "Change"}
                                <ChevronDown size={12} />
                            </button>
                        </div>

                        {specialtyOpen && (
                            <>
                                <p className="settings-note">
                                    Decides which chart the consult opens with, which output is elevated, and
                                    which measurements appear by default.
                                </p>
                                <div className="settings-specialty-grid">
                                    {PROFILE_LIST.map((p) => {
                                        const active = p.id === currentId;
                                        const saving = savingId === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                className={`settings-specialty-card${active ? " is-active" : ""}`}
                                                onClick={() => handlePick(p.id)}
                                                disabled={savingId !== null}
                                                aria-pressed={active}
                                            >
                                                <span className="settings-specialty-top">
                                                    <span className="settings-specialty-name">{p.label}</span>
                                                    {saving ? (
                                                        <Loader2 size={16} className="settings-specialty-spinner" />
                                                    ) : active ? (
                                                        <Check size={16} className="settings-specialty-check" />
                                                    ) : null}
                                                </span>
                                                <span className="settings-specialty-meta">
                                                    {p.primaryLabel} primary
                                                    {p.charts.length > 0 && (
                                                        <> · {p.charts.map((c) => CHART_LABEL[c]).join(" + ")}</>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {error && <p className="settings-error">{error}</p>}
                            </>
                        )}
                    </Card>

                    {/* ══ Local data & session — the workspace's own state ══ */}
                    <Card
                        tone="teal"
                        icon={<Database size={14} />}
                        title="Local Data & Session"
                        subtitle="What this browser is holding on to, and the way out."
                    >
                        <div className="settings-action-row">
                            <span className="settings-action-text">
                                <span className="settings-action-label">Cached clinic data</span>
                                <span className="settings-action-sub">
                                    Your clinic and doctor details, kept for a few minutes so pages don’t refetch them.
                                </span>
                            </span>
                            <button
                                type="button"
                                className="settings-action-btn"
                                onClick={() => {
                                    clearProfileCache();
                                    toast.success("Cached clinic data cleared — it reloads on the next page.");
                                }}
                            >
                                Clear
                            </button>
                        </div>

                        <div className="settings-action-row">
                            <span className="settings-action-text">
                                <span className="settings-action-label">Saved consult drafts</span>
                                <span className="settings-action-sub">
                                    Recovery copies of unfinished consults, kept on this device in case of a crash.
                                </span>
                            </span>
                            {confirmingDrafts ? (
                                <span className="settings-confirm">
                                    <button
                                        type="button"
                                        className="settings-action-btn"
                                        onClick={() => setConfirmingDrafts(false)}
                                    >
                                        Keep
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-action-btn is-danger"
                                        onClick={() => {
                                            clearAllConsultDrafts();
                                            setConfirmingDrafts(false);
                                            toast.success("Saved drafts discarded.");
                                        }}
                                    >
                                        Discard
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    className="settings-action-btn"
                                    onClick={() => setConfirmingDrafts(true)}
                                >
                                    <Trash2 size={12} /> Discard
                                </button>
                            )}
                        </div>

                        <div className="settings-action-row">
                            <span className="settings-action-text">
                                <span className="settings-action-label">Session</span>
                                <span className="settings-action-sub">
                                    Signs out everywhere in this browser and clears everything above.
                                </span>
                            </span>
                            <button type="button" className="settings-logout-btn" onClick={logout}>
                                <LogOut size={13} />
                                Log out
                            </button>
                        </div>

                        <p className="settings-support">
                            <Shield size={11} aria-hidden="true" />
                            Account reference <code>{hospitalId.slice(0, 8)}</code> — quote this to support.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    );
}
