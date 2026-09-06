// ---------------------------------------------------------------------------
// OVERVIEW — the doctor's own landing page, in both workspaces.
//
// Replaces "land straight in the consult workspace". A doctor now arrives at
// their own numbers with one large door into the consult, rather than at a
// screen that assumes the first thing they want is a patient.
//
// ── What this is NOT, and why that matters more than what it is
//
// It is not Parallax (`/app/admin`) and it is not Clinic Control. Those two
// answer "how is my CLINIC doing"; this answers "how am I doing", and the
// difference is one table: **there is no bench comparison here, ever.** A
// doctor's own landing page that ranks them against their colleagues is a
// scoreboard they cannot opt out of and did not ask for, seen every single
// time they sign in. `BenchRow[]` stays exclusive to Parallax, which only an
// admin or owner opens deliberately.
//
// The corollary, stated because it is the question everyone asks: a
// multi-doctor clinic changes NOTHING about this page. Same page, same
// scoping, their own numbers. Multi-bench does not unlock a comparison view
// here — that is the whole point of the previous paragraph.
//
// The one nod to the clinic is a context line (name, shape, how many the
// clinic saw today). Context, not comparison: it is a sentence, not a tile,
// and it never sits next to the doctor's own number in a way that invites
// subtraction.
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
// The intent survives untouched: there is no path to a blank dark header,
// because the state that produced one is now a real screen.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
    Activity, ArrowRight, Clock3, IndianRupee, PieChart, Stethoscope,
    TrendingUp, Users,
} from "lucide-react";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../hooks/useClinicalIdentity";
import { Card, EmptyBlock, SkeletonRows } from "../clinic/ui";
import { Delta, Donut, HourBars, Ring, TrendChart, type Slice } from "../admin/charts";
import { PeriodBar, type PeriodState } from "../admin/PeriodBar";
import {
    buildRange, clinicToday, countClinicVisitsToday, fetchClinicAnalytics,
    fetchClinicSetup, formatMoney, formatRangeLabel, previousRange,
    type ClinicAnalytics, type ClinicSetup,
} from "../../lib/db/admin";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
    /** The sidebar's own Consult action, reused rather than reimplemented —
     *  it already knows that a Consult clinic opens the queue and a Cortex
     *  clinic opens the patient form, and a second path into the consult
     *  would be a second place for that rule to drift. */
    onStartConsult: () => void;
}

export function DoctorOverviewPage({ logoRef, onOpenSidebar, onStartConsult }: Props) {
    const identity = useClinicalIdentity();
    const today = clinicToday();

    const [period, setPeriod] = useState<PeriodState>({ preset: "7d", from: today, to: today });
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [clinicToday_, setClinicToday] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartMetric, setChartMetric] = useState<"visits" | "revenue">("visits");

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const loadAnalytics = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        // The ONE scoping decision on this page, in one place: every number
        // below is this doctor's.
        fetchClinicAnalytics(identity.hospitalId, range, { doctorId: identity.doctorId })
            .then(setData)
            .catch((e: unknown) => { console.error("[overview]", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, identity.doctorId, range]);

    const loadContext = useCallback(() => {
        if (!identity.ready) return;
        fetchClinicSetup(identity.hospitalId).then(setSetup).catch(() => setSetup(null));
        countClinicVisitsToday(identity.hospitalId).then(setClinicToday).catch(() => setClinicToday(null));
    }, [identity.ready, identity.hospitalId]);

    useEffect(loadAnalytics, [loadAnalytics]);
    useEffect(loadContext, [loadContext]);

    // No currency fetch here on purpose. `formatMoney` already defaults to
    // INR, and the only surface that can CHANGE a clinic's currency is
    // Parallax's billing policy — pulling `fetchFeeSettings` (a doctors +
    // hospital read) onto a landing page to format one number would cost a
    // round trip on every sign-in to render the same "₹" in all but a
    // hypothetical clinic.
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

                {/* ── The door ─────────────────────────────────────────────
                    Large, first, and the only primary action on the page. A
                    doctor opening AREN is here to see patients; every number
                    below is what they look at between them, not instead of
                    them. */}
                <button
                    type="button"
                    onClick={onStartConsult}
                    className={
                        "group flex w-full cursor-pointer items-center gap-[14px] rounded-[var(--cs-radius)] border-0 " +
                        "bg-[var(--cs-blue)] px-[22px] py-[18px] text-left outline-none " +
                        "shadow-[0_6px_24px_rgba(18,104,232,0.22)] transition-shadow " +
                        "hover:shadow-[0_10px_32px_rgba(18,104,232,0.30)] " +
                        "focus-visible:shadow-[0_0_0_4px_var(--cs-blue-soft)]"
                    }
                >
                    <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-[13px] bg-[rgba(255,255,255,0.18)] text-white">
                        <Stethoscope size={20} />
                    </span>
                    <span className="flex min-w-0 flex-col gap-[2px]">
                        <span className="text-[18px] font-bold leading-[1.2] text-white">Start consult</span>
                        <span className="text-[12px] font-medium text-[rgba(255,255,255,0.82)]">
                            {data && data.liveWaiting > 0
                                ? `${data.liveWaiting} ${data.liveWaiting === 1 ? "patient is" : "patients are"} waiting`
                                : "Take the next patient"}
                        </span>
                    </span>
                    <ArrowRight
                        size={20}
                        className="ml-auto flex-none text-white transition-transform group-hover:translate-x-[3px]"
                    />
                </button>

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
                            {/* `whitespace-nowrap` + `flex-none`, measured
                                live: the period bar is a flex row, so without
                                them this context line was the thing that gave
                                way — "Multi-bench clinic / 1 seen clinic-wide
                                today" wrapped onto three lines and pushed the
                                bar 20px taller than every other page's. */}
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
                            The same four Clinic Control shows, scoped to one
                            doctor, with the completion ring riding along
                            under "seen" rather than competing for a fifth
                            tile of attention. */}
                        <div className="grid grid-cols-4 gap-[10px] max-[1000px]:grid-cols-2">
                            {[
                                { label: "Patients seen", value: data ? String(data.patients.value) : "—", metric: data?.patients },
                                { label: "New patients", value: data ? String(data.newPatients.value) : "—", metric: data?.newPatients },
                                { label: "Prescriptions", value: data ? String(data.prescriptions.value) : "—", metric: data?.prescriptions },
                                {
                                    label: "Collected",
                                    // revenueTracked === false means the CLINIC
                                    // has never recorded a payment at all.
                                    // "Not set up" is the truth; ₹0 would be a
                                    // claim about earnings nobody made.
                                    value: !data ? "—" : data.revenueTracked ? formatMoney(data.revenue.value) : "Not set up",
                                    metric: data?.revenueTracked ? data.revenue : undefined,
                                    accent: true,
                                },
                            ].map((k) => (
                                <div key={k.label} className="flex min-w-0 items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[11px] shadow-[var(--cs-shadow)]">
                                    <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                                        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">{k.label}</span>
                                        <span className={`truncate text-[23px] font-bold leading-[1.12] tabular-nums ${k.accent ? "text-[var(--cs-violet)]" : "text-[var(--cs-ink)]"}`}>
                                            {k.value}
                                        </span>
                                        {k.metric && <Delta metric={k.metric} compareLabel={compareLabel} />}
                                    </div>
                                    {k.label === "Patients seen" && data && <Ring pct={data.completionRate.value} />}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">
                            <Card
                                tone="blue"
                                icon={<TrendingUp size={14} />}
                                title={chartMetric === "visits" ? "Your patient flow" : "Your collections"}
                                subtitle={formatRangeLabel(range)}
                                action={
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
                                }
                            >
                                {!data ? (
                                    <SkeletonRows count={4} />
                                ) : emptyPeriod ? (
                                    <EmptyBlock
                                        fact="No activity in this period"
                                        next="Pick a wider range, or a different date."
                                    />
                                ) : (
                                    <TrendChart points={data.series} metricKey={chartMetric} />
                                )}
                            </Card>

                            <Card
                                tone="teal"
                                icon={<PieChart size={14} />}
                                title="Who you saw"
                                subtitle={formatRangeLabel(range)}
                            >
                                {!data ? (
                                    <SkeletonRows count={3} />
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
                        </div>

                        <Card
                            tone="violet"
                            icon={<Clock3 size={14} />}
                            title="When you're busiest"
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
                    </>
                )}

                {/* One quiet line, at the bottom, where a bench table would
                    have gone on the admin page. Naming what is deliberately
                    absent is cheaper than fielding the question. */}
                <p className="m-0 flex items-center gap-[6px] text-[11px] text-[var(--cs-faint)]">
                    <Users size={12} />
                    These are your own numbers.
                    {setup && setup.benches > 1
                        ? " Clinic-wide reporting lives in the clinic dashboard."
                        : ""}
                    {!data?.revenueTracked && (
                        <span className="inline-flex items-center gap-[3px]">
                            <IndianRupee size={11} /> Payments aren't being recorded at this clinic yet.
                        </span>
                    )}
                </p>
            </div>
        </div>
    );
}
