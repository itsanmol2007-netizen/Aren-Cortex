// ---------------------------------------------------------------------------
// OVERVIEW — the doctor's own landing page, in both workspaces.
//
// Replaces "land straight in the consult workspace". A doctor now arrives at
// their own numbers with one compact door into the consult, rather than at a
// screen that assumes the first thing they want is a patient.
//
// ── What this is NOT, and why that matters more than what it is
//
// It is not Parallax (`/app/admin`). That answers "how is my CLINIC doing"
// for a non-doctor admin/owner with no clinical work of their own; this
// answers "how am I doing" for a doctor, first and always — a plain doctor
// (no admin authority) sees ONLY their own numbers, full stop, and a
// multi-doctor clinic changes NOTHING about that: same page, same scoping,
// never a bench comparison they didn't ask for and cannot opt out of.
//
// ── 2026-09-06: the admin-doctor layer
//
// A doctor who is ALSO a clinic admin (`useAdminAccess().access ===
// "embedded"` — either the de-facto owner of a clinic with nobody else doing
// the job, or individually flagged `doctors.is_clinic_admin`, and there can
// be more than one at a clinic) gets everything above PLUS an additional
// layer appended below it: a scope toggle that lets the SAME cards above
// represent the whole clinic or any one bench, and a compact bench-
// management card with the authoritative actions Parallax already has (fees,
// admin status, activate/deactivate). This is deliberately an ADDITION to
// the page every doctor already has, not a redesign of it and not a second
// page — see this file's own "Clinic management" section below, and
// Anmol's brief: "Normal Overview + additional clinic visibility + additional
// authority — not: Normal Overview → separate Admin Dashboard → separate
// Clinic Management." `ClinicControlPage` (the page this replaced) is gone;
// its content lives here now, folded in rather than duplicated.
//
// ── Why it doubles as a fix for the blank-canvas invariant
//
// App.tsx has a standing invariant: in Consult, with no active consult and no
// feature page open, the queue sheet is forced open so the doctor never lands
// on a bare dark header. A default landing page collides with that — and the
// resolution chosen is the honest one: Overview IS a feature page
// (`activePage === "overview"`), so the invariant simply does not fire while
// the doctor is standing on it. Pressing "Start consult" sets `activePage` to
// null, which is exactly the moment the invariant is supposed to take over.
//
// ── 2026-09-07: reworked around a reference mock, not a redesign
//
// Anmol supplied a reference screenshot (real dark header untouched, KPI
// cards with mini trend lines, a compact "Start Consultation" action, a
// queue preview, quick actions) with two explicit exclusions: NO persistent
// left sidebar and NO search bar in the dark header — both belong to the
// mock's OWN chrome, not to a second nav rail bolted onto ours. This page's
// actual header stays `WorkspaceHeader`, unmodified, exactly as every other
// Cortex page uses it; nothing below the header adds navigation of its own.
// Progressive disclosure is the organising idea throughout: a KPI tile is a
// DOOR, not a dashboard — "don't add a new card when an existing card can
// become the entry point to that functionality."
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
    Activity, ArrowRight, CalendarClock, Clock, Clock3, FileText, IndianRupee,
    MessageCircle, PieChart, Plus, ShieldCheck, Stethoscope,
    TrendingUp, UserPlus, Users,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { formatShortDate } from "../frontdesk/utils";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { useWorkspaceMode } from "../../hooks/useWorkspaceMode";
import { useAdminAccess } from "../../hooks/useAdminAccess";
import { Card, CardPillButton, EmptyBlock, SkeletonRows } from "../clinic/ui";
import { Delta, Donut, HourBars, Sparkline, TrendChart, type Slice } from "../admin/charts";
import { PeriodBar, type PeriodState } from "../admin/PeriodBar";
import { FeesModal } from "../admin/FeesModal";
import { PracticeModal } from "../practice/PracticeModal";
import { PeoplePage } from "../admin/pages/PeoplePage";
import { TrendDetailModal } from "./TrendDetailModal";
import {
    buildRange, clinicToday, countClinicVisitsToday, fetchClinicAnalytics,
    fetchClinicSetup, fetchDoctorPrescriptionRows, fetchDoctorRoster, fetchDoctorVisitRows, fetchNewPatientRows,
    fetchFeeSettings, formatMoney, formatRangeLabel, previousRange,
    type ClinicAnalytics, type ClinicSetup, type DoctorActivityRow, type DoctorRosterRow, type FeeSettings,
} from "../../lib/db/admin";
import { PaymentDetailsModal } from "./PaymentDetailsModal";
import { ActivityListModal } from "./ActivityListModal";
import type { SidebarPage } from "../sidebar/SidebarNav";
import type { TodayVisit } from "../../lib/db";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    /** The sidebar's own Consult action, reused rather than reimplemented —
     *  it already knows that a Consult clinic opens the queue and a Cortex
     *  clinic opens the patient form, and a second path into the consult
     *  would be a second place for that rule to drift. */
    onStartConsult: () => void;
    /** Same nav handler every other Cortex page already receives. Quick
     *  Actions routes through it rather than opening anything of its own. */
    onNavigate: (page: SidebarPage) => void;
    /** Opens the exact patient record on the Patients page (2026-09-08) —
     *  `patientId` when the caller has one (the normal case), a name-search
     *  fallback otherwise. See `PatientsPage`'s own `initialPatientId` doc
     *  comment. */
    onViewPatient: (patientId: string | null, name: string | null) => void;

    // ── Today's Queue — a READ of App.tsx's own `useConsultQueue`, never a
    // second poll of "who is waiting". Empty and inert in Cortex, where
    // that hook is disabled entirely (no front desk to have queued anyone).
    queueWaiting: TodayVisit[];
    queueLoading: boolean;
    onOpenQueue: () => void;
    onStartFromQueueRow: (visit: TodayVisit) => void;
}

/** "Good morning" / "Good afternoon" / "Good evening" — the one piece of the
 *  reference mock's greeting that is genuinely dynamic. Computed once per
 *  render, not ticked on a timer: this is ambient context for a page a
 *  doctor glances at, not a clock they read. */
function greetingFor(hour: number): string {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

/** How long a queue row has been waiting, in whole minutes — the same "8 min
 *  waiting" shape front desk's own queue rows already use. */
function minutesWaiting(createdAt: string): number {
    return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
}

// ── Skeletons sized to what they become ─────────────────────────────────────
// `SkeletonRows` (clinic/ui.tsx) is flat 22px bars — right for an actual LIST
// of text rows, wrong for anything else on this page: it used to stand in
// for a 132px chart and a 132px donut alike, so both cards visibly JUMPED in
// height the instant real data replaced the skeleton. Below are three
// skeletons, each the exact shape/height of what it is standing in for.

/** A queue/recent-patient row's skeleton — same card, same avatar chip, same
 *  two-line text block, same trailing pill, at the same height as the real
 *  row it precedes. Shared by Today's Queue and Recent Patients: both rows
 *  have identical anatomy. */
function RowSkeleton({ count }: { count: number }) {
    return (
        <div className="flex flex-col gap-[6px]">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex min-w-0 items-center gap-[8px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[7px]">
                    <span className="h-[20px] w-[20px] flex-none animate-pulse rounded-full bg-[#e4e7ee]" />
                    <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <span className="h-[10px] w-[65%] animate-pulse rounded-[4px] bg-[#e4e7ee]" />
                        <span className="h-[8px] w-[42%] animate-pulse rounded-[4px] bg-[#eef0f5]" />
                    </span>
                    <span className="h-[20px] w-[40px] flex-none animate-pulse rounded-full bg-[#eef0f5]" />
                </div>
            ))}
        </div>
    );
}

/** TrendChart's own skeleton — one block at TrendChart's own real rendered
 *  height (132px SVG + its axis-label row below), not four 22px bars
 *  totalling 106px. */
function ChartSkeleton({ height = 150 }: { height?: number }) {
    return <div className="w-full animate-pulse rounded-[10px] bg-[#eef0f5]" style={{ height }} />;
}

/** Donut's own skeleton — a circle at Donut's own default diameter (132px),
 *  centered the same way the real donut is. */
function DonutSkeleton({ size = 132 }: { size?: number }) {
    return (
        <div className="flex flex-1 items-center justify-center py-[4px]">
            <div className="animate-pulse rounded-full bg-[#eef0f5]" style={{ width: size, height: size }} />
        </div>
    );
}

type ActivityKind = "visits" | "prescriptions" | "new_patients";

export function DoctorOverviewPage({
    logoRef, onOpenSidebar, onStartConsult, onNavigate, onViewPatient,
    queueWaiting, queueLoading, onOpenQueue, onStartFromQueueRow,
}: Props) {
    const identity = useClinicalIdentity();
    const workspace = useWorkspaceMode();
    const adminAccess = useAdminAccess();
    const navigate = useNavigate();
    const today = clinicToday();

    // A doctor with clinic-admin authority — either the de-facto owner of a
    // clinic nobody else administers, or individually flagged
    // `doctors.is_clinic_admin` (there can be more than one at a clinic).
    // Everything under "Clinic management" below is gated on this and
    // nothing else changes for anyone else.
    const isAdminDoctor = adminAccess.access === "embedded";

    const [period, setPeriod] = useState<PeriodState>({ preset: "7d", from: today, to: today });
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [clinicToday_, setClinicToday] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartMetric, setChartMetric] = useState<"visits" | "revenue">("visits");

    const [paymentOpen, setPaymentOpen] = useState(false);
    const [activityOpen, setActivityOpen] = useState<ActivityKind | null>(null);
    const [trendOpen, setTrendOpen] = useState(false);

    // ── The scope toggle (admin-doctors only) ─────────────────────────────
    // "" = this doctor's own numbers (the default — an admin's page looks
    // exactly like everyone else's until they touch the toggle), "overall" =
    // the whole clinic, anything else = another doctor's `doctors.id`. Plain
    // doctors never see this control and this state never leaves "".
    const [viewScope, setViewScope] = useState<string>("");
    const effectiveDoctorId = !isAdminDoctor
        ? identity.doctorId
        : viewScope === "" ? identity.doctorId
        : viewScope === "overall" ? undefined
        : viewScope;
    const viewingSelf = !isAdminDoctor || viewScope === "" || viewScope === identity.doctorId;

    // ── Team (admin-doctors only) ──────────────────────────────────────────
    // 2026-09-08: this used to be a whole inline "Clinic management" section
    // — a Doctors roster with its own per-row admin/deactivate actions, plus
    // a separate "request to add staff" card. Anmol: "just one button beside
    // doctors... you can manage all the staffs including doctors, their
    // fees, and their admin thing, and even receptionist thing... or assign
    // a new user as admin too from the same part." That richer surface
    // already exists — it's Parallax's PeoplePage — so rather than a second,
    // thinner copy of the same actions, one button opens THAT page in a
    // modal. `roster` stays: the scope toggle above still needs doctor names
    // and the two-bench threshold, both un-ranged reads unrelated to this.
    const [roster, setRoster] = useState<DoctorRosterRow[] | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [feesOpen, setFeesOpen] = useState(false);
    const [teamOpen, setTeamOpen] = useState(false);

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const loadAnalytics = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        // The ONE scoping decision on this page, in one place: every number
        // below is this doctor's — UNLESS this is an admin doctor who has
        // moved the scope toggle, in which case it's the clinic's or a
        // colleague's. `effectiveDoctorId === undefined` means "don't filter
        // by doctor at all", fetchClinicAnalytics's own "whole clinic" shape.
        fetchClinicAnalytics(identity.hospitalId, range, { doctorId: effectiveDoctorId })
            .then(setData)
            .catch((e: unknown) => { console.error("[overview]", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, effectiveDoctorId, range]);

    const loadContext = useCallback(() => {
        if (!identity.ready) return;
        fetchClinicSetup(identity.hospitalId).then(setSetup).catch(() => setSetup(null));
        countClinicVisitsToday(identity.hospitalId).then(setClinicToday).catch(() => setClinicToday(null));
    }, [identity.ready, identity.hospitalId]);

    // Roster + fees — only an admin doctor's page ever queries either, and
    // both are loaded once per hospital, not per period (neither is
    // date-ranged). The rest of "who works here" now lives in the Team
    // modal (PeoplePage), which fetches its own copy on open.
    const loadManagement = useCallback(() => {
        if (!identity.ready || !isAdminDoctor) return;
        fetchDoctorRoster(identity.hospitalId).then(setRoster).catch((e: unknown) => {
            console.error("[overview] roster:", e); setRoster(null);
        });
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
    }, [identity.ready, identity.hospitalId, isAdminDoctor]);

    useEffect(loadAnalytics, [loadAnalytics]);
    useEffect(loadContext, [loadContext]);
    useEffect(loadManagement, [loadManagement]);

    // ── Recent Patients (Cortex only) ──────────────────────────────────────
    // Today's Queue's exact opposite number: a Cortex clinic has no front
    // desk, so the third slot in the chart row below used to render nothing
    // at all — the grid still reserved that column's width (three FIXED
    // template columns, only two children), so a Cortex doctor's Overview
    // showed a column of dead white space exactly where a Consult doctor
    // sees their queue. "Who did I just see" is the honest equivalent
    // question for a doctor who does their own intake: no desk to preview,
    // but there IS always a most-recent patient. Fixed 30-day window,
    // independent of the page's own period selector — a doctor who just
    // flipped to "Today" with nobody seen yet should still see who they saw
    // yesterday, not an empty card that contradicts the one beside it.
    const [recentPatients, setRecentPatients] = useState<DoctorActivityRow[] | null>(null);
    useEffect(() => {
        if (workspace.isConsult || !identity.ready) return;
        let cancelled = false;
        fetchDoctorVisitRows(identity.hospitalId, identity.doctorId, buildRange("30d"), 5)
            .then((rows) => { if (!cancelled) setRecentPatients(rows); })
            .catch((e: unknown) => { console.error("[overview] recent patients:", e); if (!cancelled) setRecentPatients([]); });
        return () => { cancelled = true; };
    }, [workspace.isConsult, identity.ready, identity.hospitalId, identity.doctorId]);

    // No UNCONDITIONAL currency fetch here — `formatMoney` already defaults
    // to INR, and pulling `fetchFeeSettings` onto every doctor's landing page
    // to format one number would cost a round trip on every sign-in to render
    // the same "₹" in all but a hypothetical clinic. `loadManagement` above
    // is the one exception, and only fires for an admin doctor, who needs the
    // real fee list anyway for the bench-management card below. (Payment
    // Details, opened deliberately rather than on every load, fetches its own
    // copy too, for the same one-doctor fee editor it has always had.)
    const compareLabel = useMemo(() => {
        const p = previousRange(range);
        return p.from === p.to ? "day before" : "previous period";
    }, [range]);

    // "Nothing happened in this window" and "this doctor has never seen
    // anybody" are different states and get different copy. The second one is
    // a brand-new doctor's first sign-in, and telling them to "pick a wider
    // range" would be advice that cannot work.
    const emptyPeriod = !!data && data.patients.value === 0 && data.prescriptions.value === 0;
    const neverSeenAnyone = emptyPeriod && data.patients.previous === 0;

    /** Who this doctor saw, split. New vs returning is the split a doctor
     *  actually reads something into — a rising returning share is a practice
     *  that keeps its patients. Completed-vs-discarded belongs in Parallax's
     *  reports, where somebody is auditing rather than glancing. */
    const mix: Slice[] = useMemo(() => {
        if (!data) return [];
        const seen = data.patients.value;
        const fresh = Math.min(data.newPatients.value, seen);
        return [
            { label: "New patients", value: fresh, token: "blue" },
            { label: "Returning", value: Math.max(seen - fresh, 0), token: "teal" },
        ];
    }, [data]);

    // Whose numbers the cards below are currently showing, in words — only
    // ever different from "Your" for an admin doctor who has moved the scope
    // toggle. A plain doctor's page computes the same "Your"/"you" it always
    // has.
    const scopeDoctorName = viewingSelf
        ? identity.doctorName
        : roster?.find((d) => d.doctorId === viewScope)?.name ?? "that doctor";
    const scopePossessive = !isAdminDoctor || viewingSelf
        ? "Your"
        : viewScope === "overall" ? "Clinic-wide" : `${scopeDoctorName}'s`;
    const scopeSubject = !isAdminDoctor || viewingSelf
        ? "you"
        : viewScope === "overall" ? "the clinic" : scopeDoctorName;

    // Stable across re-renders whenever the range hasn't changed, so
    // ActivityListModal's effect (keyed on this identity) fetches once per
    // open rather than once per keystroke somewhere else on the page.
    const fetchVisitRows = useCallback(
        () => fetchDoctorVisitRows(identity.hospitalId, identity.doctorId, range),
        [identity.hospitalId, identity.doctorId, range]
    );
    const fetchPrescriptionRows = useCallback(
        () => fetchDoctorPrescriptionRows(identity.hospitalId, identity.doctorId, range),
        [identity.hospitalId, identity.doctorId, range]
    );
    const fetchNewPatientRowsForTile = useCallback(
        () => fetchNewPatientRows(identity.hospitalId, range, { doctorId: identity.doctorId }),
        [identity.hospitalId, identity.doctorId, range]
    );

    const queuePreview = queueWaiting.slice(0, 3);

    return (
        <div className="relative flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Overview"
                subtitle={
                    setup
                        ? `${identity.doctorName} · ${setup.name}`
                        : identity.doctorName
                }
                rightSlot={
                    data && (
                        <button type="button" className="ws-stat-pill" onClick={onStartConsult}>
                            <span className="ws-stat-icon"><Activity size={12} /></span>
                            <span className="ws-stat-text">
                                <span className="ws-stat-value">{data.liveWaiting}</span>
                                <span className="ws-stat-label">waiting for you</span>
                            </span>
                        </button>
                    )
                }
            />

            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[56px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                {/* ── Greeting + compact action ────────────────────────────
                    Replaces what used to be a full-width blue banner.
                    Anmol, 2026-09-07: "Compact Start Consultation action" —
                    the door into the consult is still the first thing on the
                    page, just no longer the loudest. */}
                <div className="flex flex-wrap items-center gap-[14px]">
                    <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
                        <span className="text-[13px] font-medium text-[var(--cs-faint)]">
                            {greetingFor(new Date().getHours())},
                        </span>
                        <span className="truncate text-[21px] font-bold leading-[1.2] text-[var(--cs-ink)]">
                            {identity.doctorName}
                        </span>
                        <span className="text-[12px] text-[var(--cs-muted)]">
                            Here's how your clinic is doing today.
                        </span>
                    </div>

                    <span className="hidden flex-none flex-col items-end text-right sm:flex">
                        <span className="text-[12px] font-semibold text-[var(--cs-muted)]">
                            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </span>
                        <span className="text-[11px] text-[var(--cs-faint)]">
                            {new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                        </span>
                    </span>

                    <button
                        type="button"
                        onClick={onStartConsult}
                        className={
                            "group flex flex-none cursor-pointer items-center gap-[8px] rounded-full border-0 " +
                            "bg-[var(--cs-blue)] py-[11px] pl-[16px] pr-[18px] text-[13px] font-bold text-white outline-none " +
                            "shadow-[0_4px_16px_rgba(18,104,232,0.28)] transition-shadow hover:shadow-[0_6px_20px_rgba(18,104,232,0.36)] " +
                            "focus-visible:shadow-[0_0_0_4px_var(--cs-blue-soft)]"
                        }
                    >
                        <Plus size={16} /> Start Consultation
                        <ArrowRight size={15} className="transition-transform group-hover:translate-x-[2px]" />
                    </button>
                </div>

                {/* ── The scope toggle — admin-doctors only ─────────────────
                    "Add a simple filter/toggle to the existing charts rather
                    than creating duplicate charts" (Anmol, 2026-09-06). The
                    KPI tiles, the flow chart, the donut and the busiest-hours
                    card below are ALL the same cards a plain doctor sees —
                    this just changes whose numbers they're reading. Hidden
                    entirely below two benches: comparing a doctor against
                    themselves is not a toggle worth showing. */}
                {isAdminDoctor && roster && roster.length > 1 && (
                    <div className="flex flex-wrap items-center gap-[6px]">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                            Performance
                        </span>
                        {([
                            { key: "overall", label: "Overall" },
                            ...roster.map((d) => ({
                                key: d.doctorId,
                                label: d.doctorId === identity.doctorId ? "You" : d.name,
                            })),
                        ]).map((o) => {
                            const on = viewScope === o.key || (viewScope === "" && o.key === identity.doctorId);
                            return (
                                <button
                                    key={o.key}
                                    type="button"
                                    onClick={() => setViewScope(o.key)}
                                    aria-pressed={on}
                                    className={
                                        "cursor-pointer rounded-full border px-[11px] py-[4px] text-[11.5px] font-semibold transition-colors outline-none " +
                                        (on
                                            ? "border-[var(--cs-violet)] bg-[var(--cs-violet-soft)] text-[var(--cs-violet)]"
                                            : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                    }
                                >
                                    {o.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                <PeriodBar
                    period={period}
                    range={range}
                    onChange={setPeriod}
                    onRefresh={loadAnalytics}
                    busy={loading}
                >
                    {/* Clinic CONTEXT, never a comparison — see the file
                        header. A sentence on the period bar, not a tile
                        beside the doctor's own count. */}
                    {setup && (
                        <span className="mr-[2px] flex flex-none items-center gap-[8px] whitespace-nowrap border-r border-[var(--cs-line)] pr-[10px] text-[11px] text-[var(--cs-faint)]">
                            <span className="font-semibold text-[var(--cs-muted)]">{setup.modeLabel}</span>
                            {clinicToday_ !== null && (
                                <span>{clinicToday_} seen clinic-wide today</span>
                            )}
                        </span>
                    )}
                </PeriodBar>

                {neverSeenAnyone ? (
                    // A brand-new doctor. One bold fact, one short next
                    // action, and deliberately no skeleton or empty chart
                    // frames above it — rendering a loading shape for data
                    // that will resolve to nothing is the bug that was just
                    // fixed in VisitDetailModal (empty-states.md).
                    <Card
                        tone="blue"
                        icon={<Stethoscope size={14} />}
                        title="Your practice"
                        subtitle="Nothing to show yet"
                    >
                        <EmptyBlock
                            fact="You haven't seen a patient yet"
                            next="Start a consult and your numbers begin building here."
                        />
                    </Card>
                ) : (
                    <>
                        {/* ── KPI tiles ────────────────────────────────────
                            Each carries a number, a delta, and a mini trend
                            line, and all four are DOORS: "don't add a new
                            card when an existing card can become the entry
                            point to that functionality." New Patients
                            (2026-09-08) opens its own list — who registered,
                            when, and what they paid — via
                            `fetchNewPatientRows`, not Patients Seen's list:
                            "seen" and "registered" are different questions
                            once a returning patient shows up more than once
                            in the same window. */}
                        <div className="grid grid-cols-4 gap-[10px] max-[1000px]:grid-cols-2">
                            {([
                                {
                                    key: "patients", label: "Patients seen",
                                    value: data ? String(data.patients.value) : "—",
                                    metric: data?.patients,
                                    spark: data?.series.map((p) => p.visits),
                                    sparkColor: "var(--cs-blue)",
                                    accent: false,
                                    onClick: () => setActivityOpen("visits"),
                                },
                                {
                                    key: "new", label: "New patients",
                                    value: data ? String(data.newPatients.value) : "—",
                                    metric: data?.newPatients,
                                    spark: data?.series.map((p) => p.newPatients),
                                    sparkColor: "var(--cs-teal)",
                                    accent: false,
                                    onClick: () => setActivityOpen("new_patients"),
                                },
                                {
                                    key: "rx", label: "Prescriptions",
                                    value: data ? String(data.prescriptions.value) : "—",
                                    metric: data?.prescriptions,
                                    spark: data?.series.map((p) => p.prescriptions),
                                    sparkColor: "var(--cs-teal)",
                                    accent: false,
                                    onClick: () => setActivityOpen("prescriptions"),
                                },
                                {
                                    key: "money", label: "Collected",
                                    // revenueTracked === false means the
                                    // CLINIC has never recorded a payment at
                                    // all. "Not set up" is the truth; ₹0 would
                                    // be a claim about earnings nobody made.
                                    value: !data ? "—" : data.revenueTracked ? formatMoney(data.revenue.value) : "Not set up",
                                    metric: data?.revenueTracked ? data.revenue : undefined,
                                    spark: data?.revenueTracked ? data.series.map((p) => p.revenue) : undefined,
                                    sparkColor: "var(--cs-violet)",
                                    accent: true,
                                    // Clickable even when nothing is tracked
                                    // yet — Payment Details is also where a
                                    // doctor sets their fee for the first
                                    // time, which is the natural way OUT of
                                    // "Not set up", not a dead end.
                                    onClick: identity.ready ? () => setPaymentOpen(true) : undefined,
                                },
                            ] as const).map((k) => {
                                // A plain `<div>` for "New patients" (no
                                // onClick), NOT a `disabled` `<button>` —
                                // measured live 2026-09-07: `styles/base.css`
                                // carries an unlayered `button:disabled {
                                // opacity: ... }` rule (a documented trap,
                                // cortex-gotchas.md) that beats every Tailwind
                                // utility on this element regardless of
                                // source order, and washed the tile's number
                                // out to a pale grey no `text-[var(--cs-ink)]`
                                // override could reach. A tile with nothing to
                                // open has no reason to be a `<button>` at
                                // all — this sidesteps the cascade fight
                                // entirely instead of fighting it.
                                const inner = (
                                    <>
                                        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                                            <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">{k.label}</span>
                                            <span className={`truncate text-[23px] font-bold leading-[1.12] tabular-nums ${k.accent ? "text-[var(--cs-violet)]" : "text-[var(--cs-ink)]"}`}>
                                                {k.value}
                                            </span>
                                            {k.metric && <Delta metric={k.metric} compareLabel={compareLabel} />}
                                        </div>
                                        {k.spark && k.spark.length > 1 && (
                                            <Sparkline values={k.spark} stroke={k.sparkColor} />
                                        )}
                                    </>
                                );
                                const tileClass =
                                    "flex min-w-0 items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[11px] text-left shadow-[var(--cs-shadow)] outline-none transition-[box-shadow,border-color] " +
                                    (k.onClick
                                        ? "cursor-pointer hover:border-[var(--cs-blue)] hover:shadow-[0_6px_18px_rgba(18,104,232,0.10)]"
                                        : "cursor-default");
                                return k.onClick ? (
                                    <button key={k.key} type="button" onClick={k.onClick} className={tileClass}>
                                        {inner}
                                    </button>
                                ) : (
                                    <div key={k.key} className={tileClass}>
                                        {inner}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)] items-stretch gap-[12px] max-[1180px]:grid-cols-1">
                            <Card
                                tone="blue"
                                icon={<TrendingUp size={14} />}
                                title={`${scopePossessive} ${chartMetric === "visits" ? "patient flow" : "collections"}`}
                                subtitle={formatRangeLabel(range)}
                                action={
                                    <div className="flex items-center gap-[6px]">
                                        <div className="flex items-center gap-[3px]">
                                            {(["visits", "revenue"] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setChartMetric(m)}
                                                    className={
                                                        "cursor-pointer rounded-full border px-[9px] py-[3px] text-[10.5px] font-semibold outline-none transition-colors " +
                                                        (chartMetric === m
                                                            ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]"
                                                            : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                                    }
                                                >
                                                    {m === "visits" ? "Patients" : "Money"}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Same door Parallax's own chart already opens onto its
                                            Reports table (OverviewPage.tsx's DetailLink) — a modal
                                            here rather than a route, since a plain doctor has no
                                            business landing on /app/admin. */}
                                        {data && !emptyPeriod && (
                                            <button
                                                type="button"
                                                onClick={() => setTrendOpen(true)}
                                                className="inline-flex cursor-pointer items-center gap-[2px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[11px] font-semibold text-[var(--cs-blue)] outline-none hover:underline"
                                            >
                                                Detail <ArrowRight size={11} />
                                            </button>
                                        )}
                                    </div>
                                }
                            >
                                {!data ? (
                                    <ChartSkeleton />
                                ) : emptyPeriod ? (
                                    <EmptyBlock
                                        fact="No activity in this period"
                                        next="Pick a wider range, or a different date."
                                    />
                                ) : (
                                    // `relative overflow-hidden` scopes the glow to this
                                    // one chart, not the whole card (its own action
                                    // buttons in the header stay unaffected) — a soft
                                    // blurred wash of the card's own tone sitting under
                                    // the line, the way a hero chart reads as more than
                                    // a spreadsheet without turning into decoration.
                                    <div className="relative overflow-hidden rounded-[10px]">
                                        <div
                                            aria-hidden
                                            className="pointer-events-none absolute inset-x-3 bottom-[14px] h-[46px] rounded-full opacity-[0.55] blur-xl"
                                            style={{ background: "radial-gradient(ellipse at center, var(--cs-blue) 0%, transparent 70%)" }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setTrendOpen(true)}
                                            className="relative w-full cursor-pointer border-0 bg-transparent p-0 text-left outline-none"
                                            aria-label="Open the detailed list behind this chart"
                                        >
                                            <TrendChart points={data.series} metricKey={chartMetric} />
                                        </button>
                                    </div>
                                )}
                            </Card>

                            <Card
                                tone="teal"
                                icon={<PieChart size={14} />}
                                title={viewingSelf ? "Who you saw" : `Who ${scopeSubject} saw`}
                                subtitle={formatRangeLabel(range)}
                            >
                                {!data ? (
                                    <DonutSkeleton />
                                ) : data.patients.value === 0 ? (
                                    <EmptyBlock
                                        fact="Nobody yet in this period"
                                        next="Pick a wider range to see the split."
                                    />
                                ) : (
                                    <div className="flex flex-1 items-center justify-center py-[4px]">
                                        <Donut slices={mix} total={data.patients.value} totalLabel="seen" />
                                    </div>
                                )}
                            </Card>

                            {/* ── Today's Queue ─────────────────────────────
                                Consult only: a Cortex clinic has no front
                                desk and nothing waiting to preview — the
                                doctor's own "Start Consultation" already IS
                                their intake. Reuses the exact read the queue
                                sheet polls; see the Props doc comment. */}
                            {workspace.isConsult && (
                                <Card
                                    tone="violet"
                                    icon={<CalendarClock size={14} />}
                                    title="Today's queue"
                                    subtitle={queueLoading ? "Loading…" : `${queueWaiting.length} waiting`}
                                    action={
                                        queueWaiting.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={onOpenQueue}
                                                className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-violet)] outline-none hover:underline"
                                            >
                                                View all <ArrowRight size={11} />
                                            </button>
                                        )
                                    }
                                >
                                    {queueLoading ? (
                                        <RowSkeleton count={3} />
                                    ) : queuePreview.length === 0 ? (
                                        <EmptyBlock
                                            fact="Nobody waiting"
                                            next="The front desk will add patients as they arrive."
                                        />
                                    ) : (
                                        <div className="flex flex-col gap-[6px]">
                                            {queuePreview.map((v, i) => (
                                                <div key={v.visit_id} className="flex min-w-0 items-center gap-[8px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[7px]">
                                                    <span className="grid h-[20px] w-[20px] flex-none place-items-center rounded-full bg-[var(--cs-violet-soft)] text-[10px] font-bold text-[var(--cs-violet)]">
                                                        {i + 1}
                                                    </span>
                                                    <span className="flex min-w-0 flex-col gap-[1px]">
                                                        <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                            {v.patient_name}
                                                        </span>
                                                        <span className="text-[10px] text-[var(--cs-faint)]">
                                                            {v.visit_count <= 1 ? "New patient" : "Follow-up"} · {minutesWaiting(v.created_at)} min waiting
                                                        </span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => onStartFromQueueRow(v)}
                                                        className="ml-auto flex-none cursor-pointer rounded-full border-0 bg-[var(--cs-violet)] px-[10px] py-[4px] text-[10.5px] font-bold text-white outline-none hover:opacity-90"
                                                    >
                                                        Start
                                                    </button>
                                                </div>
                                            ))}
                                            {queueWaiting.length > queuePreview.length && (
                                                <button
                                                    type="button"
                                                    onClick={onOpenQueue}
                                                    className="cursor-pointer rounded-[8px] border-0 bg-transparent py-[3px] text-[11px] font-semibold text-[var(--cs-violet)] outline-none hover:underline"
                                                >
                                                    +{queueWaiting.length - queuePreview.length} more patients in queue
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            )}

                            {/* ── Recent Patients ───────────────────────────
                                Cortex only: the third grid column above is a
                                FIXED template track (`0.9fr`) — with Today's
                                Queue simply absent for two children instead
                                of three, that track still reserved its own
                                width and rendered as dead white space where
                                a Consult doctor sees their queue. Same slot,
                                same card shell, the honest equivalent
                                question for a doctor who does their own
                                intake: not "who's waiting" (nobody is — this
                                doctor IS the front desk) but "who did I just
                                see". */}
                            {!workspace.isConsult && (
                                <Card
                                    tone="blue"
                                    icon={<Users size={14} />}
                                    title="Recent patients"
                                    subtitle={recentPatients === null ? "Loading…" : "Last 30 days"}
                                >
                                    {recentPatients === null ? (
                                        <RowSkeleton count={3} />
                                    ) : recentPatients.length === 0 ? (
                                        <EmptyBlock
                                            fact="No patients yet"
                                            next="Whoever you see next shows up here."
                                        />
                                    ) : (
                                        <div className="flex flex-col gap-[6px]">
                                            {recentPatients.map((r) => (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => onViewPatient(r.patientId, r.patientName)}
                                                    className="flex min-w-0 items-center gap-[8px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[7px] text-left outline-none transition-colors hover:border-[var(--cs-blue)] hover:bg-[var(--cs-blue-soft)]"
                                                >
                                                    <span className="grid h-[20px] w-[20px] flex-none place-items-center rounded-full bg-[var(--cs-blue-soft)] text-[10px] font-bold text-[var(--cs-blue)]">
                                                        {(r.patientName ?? "?").trim().charAt(0).toUpperCase() || "?"}
                                                    </span>
                                                    <span className="flex min-w-0 flex-col gap-[1px]">
                                                        <span className="truncate text-[12px] font-semibold text-[var(--cs-ink)]">
                                                            {r.patientName ?? "Unnamed patient"}
                                                        </span>
                                                        <span className="text-[10px] text-[var(--cs-faint)]">
                                                            {r.detail ?? "Visit"} · {formatShortDate(r.at)}
                                                        </span>
                                                    </span>
                                                    <span className="ml-auto flex-none text-[10.5px] font-semibold text-[var(--cs-blue)]">
                                                        View
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            )}
                        </div>

                        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">
                            <Card
                                tone="violet"
                                icon={<Clock3 size={14} />}
                                title={viewingSelf ? "When you're busiest" : `When ${scopeSubject} is busiest`}
                                subtitle={`Visits by hour · ${formatRangeLabel(range)}`}
                            >
                                {!data ? (
                                    <SkeletonRows count={3} />
                                ) : data.byHour.every((n) => n === 0) ? (
                                    <EmptyBlock
                                        fact="No visits in this period"
                                        next="Your busiest hours appear once you've seen a few patients."
                                    />
                                ) : (
                                    <HourBars byHour={data.byHour} />
                                )}
                            </Card>

                            {/* ── Quick Actions ─────────────────────────────
                                Every tile routes through machinery the app
                                already has (`onNavigate`, `onStartConsult`) —
                                nothing here owns a screen of its own. */}
                            <Card tone="blue" icon={<ArrowRight size={14} />} title="Quick actions" subtitle="Jump straight there">
                                <div className="grid grid-cols-2 gap-[8px]">
                                    {[
                                        {
                                            icon: <Users size={15} />, label: "View Today's Patients",
                                            sub: "See full patient list", onClick: () => onNavigate("patients"),
                                        },
                                        {
                                            icon: <FileText size={15} />, label: "Create Prescription",
                                            sub: "New prescription", onClick: onStartConsult,
                                        },
                                        {
                                            icon: <MessageCircle size={15} />, label: "Send WhatsApp Message",
                                            sub: "Share reports & follow-ups", onClick: () => onNavigate("communication"),
                                        },
                                        isAdminDoctor
                                            ? {
                                                icon: <TrendingUp size={15} />, label: "View Reports",
                                                sub: "Detailed analytics", onClick: () => navigate("/app/admin/reports"),
                                            }
                                            : {
                                                icon: <Stethoscope size={15} />, label: "Manage Practice",
                                                sub: "Meds, labs & templates", onClick: () => onNavigate("practice"),
                                            },
                                    ].map((a) => (
                                        <button
                                            key={a.label}
                                            type="button"
                                            onClick={a.onClick}
                                            className="flex cursor-pointer flex-col items-start gap-[6px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[10px] py-[9px] text-left outline-none transition-colors hover:border-[var(--cs-blue)] hover:bg-[var(--cs-blue-soft)]"
                                        >
                                            <span className="grid h-[26px] w-[26px] place-items-center rounded-[8px] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]">
                                                {a.icon}
                                            </span>
                                            <span className="text-[11.5px] font-semibold leading-[1.2] text-[var(--cs-ink)]">{a.label}</span>
                                            <span className="text-[10px] leading-[1.3] text-[var(--cs-faint)]">{a.sub}</span>
                                        </button>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    </>
                )}

                {/* One quiet line, saying whose numbers these are. A plain
                    doctor always reads "your own numbers" — the only thing
                    that changes here is an admin doctor who has moved the
                    scope toggle above. */}
                <p className="m-0 flex items-center gap-[6px] text-[11px] text-[var(--cs-faint)]">
                    <Users size={12} />
                    {viewingSelf
                        ? "These are your own numbers."
                        : viewScope === "overall"
                            ? "These are the whole clinic's numbers."
                            : `These are ${scopeDoctorName}'s numbers.`}
                    {!data?.revenueTracked && (
                        <span className="inline-flex items-center gap-[3px]">
                            <IndianRupee size={11} /> Payments aren't being recorded at this clinic yet.
                        </span>
                    )}
                </p>

                {/* ── Team — admin-doctors only ─────────────────────────────
                    2026-09-08: replaces the old "Clinic management" section
                    (a Doctors roster with per-row admin/deactivate actions,
                    plus a separate "request staff" card). Anmol: "just one
                    button beside doctors... manage all the staffs including
                    doctors, their fees, and their admin thing, and even
                    receptionist thing... assign a new user as admin too from
                    the same part" — and named the OLD label a problem in its
                    own right, colliding with the existing "Clinic" page. One
                    row: a headcount, a "Fees" pill (unchanged — Fees already
                    manages "rules" like GST/discount, its own rich surface),
                    and "Manage team", which opens Parallax's PeoplePage —
                    already the richer surface this asked for (staff list
                    with role/activate, and now an "Add staff" form that
                    mints a real sign-in) — in a modal, rather than a second,
                    thinner copy of the same actions living here too. */}
                {isAdminDoctor && (
                    <div className="mt-[4px] flex flex-col gap-[10px]">
                        <span className="flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                            <ShieldCheck size={13} /> Team
                        </span>

                        <div className="flex flex-wrap items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[12px] shadow-[var(--cs-shadow)]">
                            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]">
                                <Stethoscope size={14} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
                                <span className="truncate text-[13px] font-semibold text-[var(--cs-ink)]">
                                    {roster ? `${roster.length} ${roster.length === 1 ? "doctor" : "doctors"} on file` : "Who works here"}
                                </span>
                                <span className="text-[11px] text-[var(--cs-faint)]">
                                    Fees, admin access, front-desk staff — all from one place.
                                </span>
                            </span>
                            {fees && (
                                <CardPillButton tone="teal" onClick={() => setFeesOpen(true)}>
                                    Fees
                                </CardPillButton>
                            )}
                            <button
                                type="button"
                                onClick={() => setTeamOpen(true)}
                                className="inline-flex flex-none cursor-pointer items-center gap-[6px] rounded-full border-0 bg-[var(--cs-violet)] px-[14px] py-[8px] text-[12px] font-bold text-white outline-none disabled:opacity-60"
                            >
                                <UserPlus size={13} /> Manage team
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {teamOpen && (
                <PracticeModal
                    accent="violet"
                    icon={<Users size={15} />}
                    eyebrow="Team"
                    title={setup ? `Manage ${setup.name}` : "Manage your team"}
                    onClose={() => setTeamOpen(false)}
                    xl
                >
                    <PeoplePage />
                </PracticeModal>
            )}

            {trendOpen && data && (
                <TrendDetailModal
                    hospitalId={identity.hospitalId}
                    doctorId={effectiveDoctorId}
                    metric={chartMetric}
                    series={data.series}
                    range={range}
                    revenueTracked={data.revenueTracked}
                    currency={fees?.policy.currency ?? "INR"}
                    subjectLabel={scopePossessive.toLowerCase()}
                    onClose={() => setTrendOpen(false)}
                />
            )}

            {paymentOpen && identity.ready && (
                <PaymentDetailsModal
                    hospitalId={identity.hospitalId}
                    doctorId={identity.doctorId}
                    range={range}
                    onClose={() => setPaymentOpen(false)}
                />
            )}

            {activityOpen === "visits" && (
                <ActivityListModal
                    accent="blue"
                    icon={<Clock size={15} />}
                    eyebrow="Patients seen"
                    title="Patient activity"
                    range={range}
                    fetcher={fetchVisitRows}
                    emptyFact="Nobody in this period"
                    emptyNext="Visits you see appear here as soon as they're recorded."
                    onClose={() => setActivityOpen(null)}
                    onViewPatient={onViewPatient}
                />
            )}
            {activityOpen === "prescriptions" && (
                <ActivityListModal
                    accent="teal"
                    icon={<FileText size={15} />}
                    eyebrow="Prescriptions"
                    title="Prescription activity"
                    range={range}
                    fetcher={fetchPrescriptionRows}
                    emptyFact="Nothing written in this period"
                    emptyNext="Prescriptions you write appear here as soon as they're saved."
                    onClose={() => setActivityOpen(null)}
                    onViewPatient={onViewPatient}
                />
            )}
            {activityOpen === "new_patients" && (
                <ActivityListModal
                    accent="teal"
                    icon={<UserPlus size={15} />}
                    eyebrow="New patients"
                    title="New patient activity"
                    range={range}
                    fetcher={fetchNewPatientRowsForTile}
                    emptyFact="Nobody new in this period"
                    emptyNext="New registrations appear here as soon as they're recorded."
                    onClose={() => setActivityOpen(null)}
                    onViewPatient={onViewPatient}
                />
            )}

            {feesOpen && fees && (
                <FeesModal
                    hospitalId={identity.hospitalId}
                    policy={fees.policy}
                    doctors={fees.doctors}
                    onClose={() => setFeesOpen(false)}
                    onSaved={() => { toast.success("Fees saved"); loadManagement(); }}
                />
            )}
        </div>
    );
}
