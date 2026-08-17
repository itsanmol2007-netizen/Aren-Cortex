// Settings — specialty switch + session exit.
//
// Two things live here on purpose, and only these two:
//
// 1. SPECIALTY. `hospitals.specialty_profile` is documented everywhere else
//    (features/synapse/specialtyProfile.ts) as "set once at onboarding, per
//    facility, never relearned at runtime" — true of the ENGINE's relationship
//    to it, never true of who gets to change it. During solo piloting there is
//    no onboarding flow and no admin panel (that's §14.5 of the atlas, not
//    built yet), so a doctor testing five specialties in one sitting needs a
//    fast, self-service switch. This page is that switch, deliberately
//    temporary: the day an admin panel exists, this control either moves
//    behind it or is gated to admin-only — the column doesn't change, only
//    who's allowed to write it.
//
// 2. SESSION. Log out moved here from the sidebar (2026-08-11, Anmol) — one
//    fewer irreversible action sitting one click away in the nav rail.
//
// Nothing here is read by the Synapse engine. Same law as the specialty
// profile itself: configuration, never inference.

import { useState } from "react";
import type { RefObject } from "react";
import { LogOut, Check, Loader2 } from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useLogout } from "../auth/useLogout";
import { PROFILES, type ChartKind } from "../synapse/specialtyProfile";
import { updateHospitalSpecialtyProfile } from "../../lib/db";
import type { DBHospital, DBDoctor } from "../../lib/db";
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
}

const PROFILE_LIST = Object.values(PROFILES);

const CHART_LABEL: Record<ChartKind, string> = {
    dental: "Dental chart",
    body: "Body map",
    joints: "Joint map",
    growth: "Growth chart",
};

export function SettingsPage({
    logoRef,
    onOpenSidebar,
    hospitalId,
    hospitalProfile,
    doctorProfile,
    doctorName,
    onSpecialtyChanged,
}: SettingsPageProps) {
    const logout = useLogout();
    const currentId = hospitalProfile?.specialty_profile ?? "general_opd";
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handlePick = async (id: string) => {
        if (id === currentId || savingId) return;
        setSavingId(id);
        setError(null);
        try {
            await updateHospitalSpecialtyProfile(hospitalId, id);
            onSpecialtyChanged(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save — try again");
        } finally {
            setSavingId(null);
        }
    };

    const doctorInitials = doctorName
        .split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "DR";

    return (
        <div className="settings-page">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Settings"
                subtitle={hospitalProfile?.name ?? "Account & configuration"}
            />

            <div className="settings-scroll">
                <div className="settings-body">
                    <section className="settings-section">
                        <div className="settings-section-head">
                            <h2>Specialty</h2>
                            <p>
                                Decides which chart shows on the consult screen, which output is elevated, and which
                                measurements appear by default. Testing-only control — moves behind admin approval
                                after piloting.
                            </p>
                        </div>

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
                    </section>

                    <section className="settings-section">
                        <div className="settings-section-head">
                            <h2>Session</h2>
                        </div>
                        <div className="settings-session-row">
                            <div className="settings-doctor-pill">
                                <span className="settings-doctor-avatar">{doctorInitials}</span>
                                <span className="settings-doctor-info">
                                    <span className="settings-doctor-name">{doctorName}</span>
                                    <span className="settings-doctor-spec">
                                        {doctorProfile?.specialization || "General"}
                                    </span>
                                </span>
                            </div>
                            <button type="button" className="settings-logout-btn" onClick={logout}>
                                <LogOut size={15} />
                                Log out
                            </button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
