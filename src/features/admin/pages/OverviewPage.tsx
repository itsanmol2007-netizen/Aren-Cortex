// ---------------------------------------------------------------------------
// ADMIN CONTROL — the clinic owner's workspace.
//
// ── What this is NOT, after the first attempt was rightly called hollow
//
// v1 showed today's counts and a fee list. That is a status widget, not a
// management surface: a manager does not manage by looking at today, and a
// page with no yesterday, no last week and no comparison gives them nothing to
// decide with. Anmol, 2026-09-04: "the manager of a clinic want to see
// performance and all, it doesn't even have thing to go back yesterday or a
// given date."
//
// So every number on this page is scoped to a RANGE the owner picks, and every
// headline number carries its change against the equally-long range before it.
// That comparison is the product. A count with nothing beside it is trivia.
//
// ── This is its own workspace, deliberately
//
// It is NOT a page in the Cortex/Consult sidebar. It was, briefly, and that
// was wrong on its own terms: the clinical sidebar's rule is "a destination
// per JOB the doctor does with the patient in front of them", and "how is my
// clinic performing" is a different person's job even when it is the same
// human. Mixing them also meant a consulting doctor's nav grew a row about
// money and staff mid-consultation. It lives at /app/admin, reached by role.
//
// ── Where the numbers come from
//
// Nowhere in this file. `lib/db/admin.ts` owns every query (standing rule 1),
// including the range arithmetic, so this file is layout and nothing else.
// Charts are hand-rolled inline SVG on the same `--cs-*` tokens as every other
// card — see `charts.tsx` for why there is no charting dependency.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
    Activity, AlertTriangle, ArrowUpRight, Building2, CalendarDays, CreditCard,
    IndianRupee, Layers, Stethoscope, TrendingUp, Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, EmptyBlock, RowText, SkeletonRows, CardPillButton } from "../../clinic/ui";
import { Delta, HourBars, Ring, ShareBar, TrendChart } from "../charts";
import { PeriodBar, type PeriodState } from "../PeriodBar";
import { FeesModal } from "../FeesModal";
import {
    buildRange, clinicToday, fetchClinicAnalytics, fetchClinicSetup, fetchFeeSettings,
    formatMoney, formatRangeLabel, previousRange,
    type ClinicAnalytics, type ClinicSetup, type DateRange, type FeeSettings,
    type Metric, type RangePreset,
} from "../../../lib/db/admin";
import { fetchStaff, type StaffMember } from "../../../lib/db/staff";

const ROLE_LABEL: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    doctor: "Doctor",
    reception: "Front desk",
    lab: "Lab",
    pharmacist: "Pharmacy",
};

// ── Small pieces ───────────────────────────────────────────────────────────

/** A headline number with its comparison underneath. The comparison is not
 *  decoration — see the file header. */
function Kpi({
    label, value, metric, compareLabel, accent, aside,
}: {
    label: string;
    value: string;
    metric?: Metric;
    compareLabel: string;
    accent?: "violet";
    aside?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-[10px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[14px] py-[11px] shadow-[var(--cs-shadow)]">
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                    {label}
                </span>
                <span
                    className={
                        "truncate text-[23px] font-bold leading-[1.12] tabular-nums " +
                        (accent === "violet" ? "text-[var(--cs-violet)]" : "text-[var(--cs-ink)]")
                    }
                >
                    {value}
                </span>
                {metric && <Delta metric={metric} compareLabel={compareLabel} />}
            </div>
            {aside}
        </div>
    );
}

/** A labelled fact inside the clinic-setup card. */
function SetupRow({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: "warn" }) {
    return (
        <div className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]">
            <span className="grid h-[24px] w-[24px] flex-none place-items-center rounded-[7px] bg-[#f1f5f9] text-[#475569]">
                {icon}
            </span>
            <span className="text-[11.5px] font-medium text-[var(--cs-muted)]">{label}</span>
            <span
                className={
                    "ml-auto flex-none text-[12px] font-bold tabular-nums " +
                    (tone === "warn" ? "text-[var(--cs-amber)]" : "text-[var(--cs-ink)]")
                }
            >
                {value}
            </span>
        </div>
    );
}

/** "Detail" — the door from a chart to the table behind it. Anmol, 2026-09-04:
 *  "there should be option to see them in detail, how the chart is going."
 *  A chart says what SHAPE the period was; the table says what happened on the
 *  14th. Neither replaces the other, so every chart gets one of these. */
function DetailLink({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-blue)] outline-none hover:underline focus-visible:shadow-[0_0_0_3px_var(--cs-blue-soft)]"
        >
            Detail <ArrowUpRight size={11} />
        </button>
    );
}

// ── The page ───────────────────────────────────────────────────────────────

export function OverviewPage() {
    const identity = useClinicalIdentity();
    const navigate = useNavigate();

    const today = clinicToday();
    const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });

    const range: DateRange = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [staff, setStaff] = useState<StaffMember[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartMetric, setChartMetric] = useState<"visits" | "revenue">("visits");
    const [feesOpen, setFeesOpen] = useState(false);

    // Range-scoped. Re-runs whenever the owner moves the period.
    const loadAnalytics = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchClinicAnalytics(identity.hospitalId, range)
            .then(setData)
            .catch((e: unknown) => {
                console.error("[admin] analytics:", e);
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, range]);

    // Range-independent. Fetched once — re-fetching the roster every time
    // someone clicks "Yesterday" would be three wasted queries per click.
    const loadStatic = useCallback(() => {
        if (!identity.ready) return;
        const h = identity.hospitalId;
        fetchClinicSetup(h).then(setSetup).catch((e: unknown) => console.error("[admin] setup:", e));
        fetchFeeSettings(h).then(setFees).catch((e: unknown) => console.error("[admin] fees:", e));
        fetchStaff(h).then(setStaff).catch((e: unknown) => console.error("[admin] staff:", e));
    }, [identity.ready, identity.hospitalId]);

    useEffect(loadAnalytics, [loadAnalytics]);
    useEffect(loadStatic, [loadStatic]);

    const currency = fees?.policy.currency ?? "INR";
    const compareLabel = useMemo(() => {
        const p = previousRange(range);
        return p.from === p.to ? "day before" : "previous period";
    }, [range]);

    const activeStaff = useMemo(() => (staff ?? []).filter((s) => s.is_active), [staff]);
    const pricedDoctors = useMemo(
        () => (fees?.doctors ?? []).filter((d) => d.consultationFee !== null),
        [fees]
    );

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                <PeriodBar
                    period={period}
                    range={range}
                    onChange={setPeriod}
                    onRefresh={loadAnalytics}
                    busy={loading}
                >
                    {data && (
                        /* Live, never range-scoped — an admin opening this
                           wants to know the clinic is moving right now,
                           whatever period they happen to be reading. */
                        <span className="mr-[2px] flex items-center gap-[8px] border-r border-[var(--cs-line)] pr-[10px]">
                            <span className="flex items-center gap-[4px] text-[11px] font-semibold text-[var(--cs-blue)]">
                                <Activity size={12} /> {data.liveActive} in room
                            </span>
                            <span className="flex items-center gap-[4px] text-[11px] font-semibold text-[var(--cs-amber)]">
                                <Users size={12} /> {data.liveWaiting} waiting
                            </span>
                        </span>
                    )}
                </PeriodBar>

                {/* ── Headline numbers ─────────────────────────────────────── */}
                <div className="grid grid-cols-5 gap-[10px] max-[1180px]:grid-cols-3 max-[700px]:grid-cols-2">
                    <Kpi
                        label="Patients seen"
                        value={data ? String(data.patients.value) : "—"}
                        metric={data?.patients}
                        compareLabel={compareLabel}
                    />
                    <Kpi
                        label="New patients"
                        value={data ? String(data.newPatients.value) : "—"}
                        metric={data?.newPatients}
                        compareLabel={compareLabel}
                    />
                    <Kpi
                        label="Prescriptions"
                        value={data ? String(data.prescriptions.value) : "—"}
                        metric={data?.prescriptions}
                        compareLabel={compareLabel}
                    />
                    <Kpi
                        label="Collected"
                        accent="violet"
                        value={
                            !data ? "—"
                                : data.revenueTracked ? formatMoney(data.revenue.value, currency)
                                    : "Not set up"
                        }
                        metric={data?.revenueTracked ? data.revenue : undefined}
                        compareLabel={compareLabel}
                    />
                    <Kpi
                        label="Completed"
                        value={data ? `${Math.round(data.completionRate.value)}%` : "—"}
                        metric={data?.completionRate}
                        compareLabel={compareLabel}
                        aside={data && <Ring pct={data.completionRate.value} />}
                    />
                </div>

                {/* ── Trend · busiest hours ────────────────────────────────── */}
                <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">
                    <Card
                        id="adm-card-trend"
                        tone="blue"
                        icon={<TrendingUp size={14} />}
                        title={chartMetric === "visits" ? "Patient flow" : "Collections"}
                        subtitle={formatRangeLabel(range)}
                        action={
                            <div className="flex items-center gap-[3px]">
                                {(["visits", "revenue"] as const).map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setChartMetric(m)}
                                        className={
                                            "cursor-pointer rounded-full border px-[9px] py-[3px] text-[10.5px] font-semibold transition-colors outline-none " +
                                            (chartMetric === m
                                                ? "border-[var(--cs-blue)] text-[var(--cs-blue)] bg-[var(--cs-blue-soft)]"
                                                : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                        }
                                    >
                                        {m === "visits" ? "Patients" : "Money"}
                                    </button>
                                ))}
                                <DetailLink onClick={() => navigate(chartMetric === "visits" ? "/app/admin/reports?tab=days" : "/app/admin/reports?tab=money")} />
                            </div>
                        }
                    >
                        {!data ? (
                            <SkeletonRows count={4} />
                        ) : data.patients.value === 0 && data.revenue.value === 0 ? (
                            <EmptyBlock
                                fact="No activity in this period"
                                next="Pick a wider range, or a different date."
                            />
                        ) : (
                            <TrendChart points={data.series} metricKey={chartMetric} />
                        )}
                    </Card>

                    <Card
                        id="adm-card-hours"
                        tone="violet"
                        icon={<Layers size={14} />}
                        title="Busiest hours"
                        subtitle="When patients actually arrive"
                        action={<DetailLink onClick={() => navigate("/app/admin/reports?tab=hours")} />}
                    >
                        {!data ? <SkeletonRows count={3} /> : <HourBars byHour={data.byHour} />}
                    </Card>
                </div>

                {/* ── Bench performance ────────────────────────────────────── */}
                <Card
                    id="adm-card-benches"
                    tone="teal"
                    icon={<Stethoscope size={14} />}
                    title="Bench performance"
                    subtitle={
                        setup
                            ? `${setup.benches} consultation ${setup.benches === 1 ? "bench" : "benches"} · ${formatRangeLabel(range)}`
                            : formatRangeLabel(range)
                    }
                    action={<DetailLink onClick={() => navigate("/app/admin/reports?tab=benches")} />}
                >
                    {!data ? (
                        <SkeletonRows count={3} />
                    ) : data.benches.length === 0 ? (
                        <EmptyBlock fact="No doctors on file" next="Add a doctor to this clinic to see bench performance." />
                    ) : (
                        <div className="flex flex-col gap-[2px]">
                            {/* A real table header — this is the one place on the
                                page where columns of numbers need naming. */}
                            <div className="grid grid-cols-[minmax(0,2.2fr)_58px_58px_58px_88px] items-center gap-[9px] border-b border-[var(--cs-line)] px-[9px] pb-[5px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                                <span>Bench</span>
                                <span className="text-right">Seen</span>
                                <span className="text-right">Done</span>
                                <span className="text-right">Rx</span>
                                <span className="text-right">Collected</span>
                            </div>
                            {data.benches.map((b) => (
                                <div
                                    key={b.doctorId}
                                    className="grid grid-cols-[minmax(0,2.2fr)_58px_58px_58px_88px] items-center gap-[9px] rounded-[8px] px-[9px] py-[8px] transition-colors hover:bg-[var(--cs-page)]"
                                >
                                    <div className="flex min-w-0 flex-col gap-[4px]">
                                        <RowText
                                            label={b.name}
                                            sub={[b.specialization, b.consultationFee !== null ? formatMoney(b.consultationFee, currency) : null]
                                                .filter(Boolean).join(" · ") || null}
                                        />
                                        <ShareBar share={b.share} tone="teal" />
                                    </div>
                                    <span className="text-right text-[13px] font-bold tabular-nums text-[var(--cs-ink)]">{b.visits}</span>
                                    <span className="text-right text-[12px] tabular-nums text-[var(--cs-muted)]">{b.completed}</span>
                                    <span className="text-right text-[12px] tabular-nums text-[var(--cs-muted)]">{b.prescriptions}</span>
                                    <span className="text-right text-[12.5px] font-semibold tabular-nums text-[var(--cs-violet)]">
                                        {data.revenueTracked ? formatMoney(b.revenue, currency) : "—"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* ── Setup · fees ─────────────────────────────────────────── */}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[12px] max-[980px]:grid-cols-1">

                    <Card
                        id="adm-card-setup"
                        tone="slate"
                        icon={<Building2 size={14} />}
                        title="Clinic & plan"
                        subtitle="What this clinic runs, and what it is licensed for"
                    >
                        {!setup ? (
                            <SkeletonRows count={4} />
                        ) : (
                            <div className="flex flex-col gap-[6px]">
                                <SetupRow icon={<Building2 size={12} />} label="Setup" value={setup.modeLabel} />
                                <SetupRow icon={<Stethoscope size={12} />} label="Consultation benches" value={String(setup.benches)} />
                                <SetupRow
                                    icon={<CreditCard size={12} />}
                                    label="Plan seats"
                                    value={setup.seats === null ? "Not set" : String(setup.seats)}
                                    tone={setup.seatsExceeded ? "warn" : undefined}
                                />
                                <SetupRow icon={<Users size={12} />} label="Active logins" value={String(setup.staffCount)} />
                                <SetupRow
                                    icon={<CalendarDays size={12} />}
                                    label={setup.isFounding ? "Founding plan until" : "Plan renews"}
                                    value={setup.periodEnd
                                        ? new Date(setup.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                        : "—"}
                                />

                                {/* The one thing on this card that is an ACTION,
                                    not a fact: more benches than seats is the
                                    likeliest billing mismatch in a growing
                                    clinic, and only the owner can fix it. */}
                                {setup.seatsExceeded && (
                                    <div className="mt-[2px] flex items-start gap-[7px] rounded-[9px] border border-[var(--cs-amber)] bg-[var(--cs-amber-soft)] px-[10px] py-[8px]">
                                        <AlertTriangle size={13} className="mt-[1px] flex-none text-[var(--cs-amber)]" />
                                        <span className="text-[11px] leading-[1.45] text-[var(--cs-muted)]">
                                            <strong className="font-semibold text-[var(--cs-ink)]">
                                                {setup.benches} benches on {setup.seats} seats.
                                            </strong>{" "}
                                            Your plan is behind your setup — ask AREN to add seats.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    <Card
                        id="adm-card-fees"
                        tone="violet"
                        icon={<IndianRupee size={14} />}
                        title="Consultation fees"
                        subtitle="What each bench charges, and how the clinic bills it"
                        action={
                            fees && (
                                <CardPillButton tone="violet" onClick={() => setFeesOpen(true)}>
                                    {pricedDoctors.length ? "Edit fees" : "Set fees"}
                                </CardPillButton>
                            )
                        }
                        foot={
                            fees && (
                                <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[3px] text-[11px] text-[var(--cs-faint)]">
                                    <span>
                                        GST:{" "}
                                        <strong className="font-semibold text-[var(--cs-muted)]">
                                            {fees.policy.gstEnabled ? `${fees.policy.gstPercent}%` : "Not charged"}
                                        </strong>
                                    </span>
                                    <span>
                                        Desk discount:{" "}
                                        <strong className="font-semibold text-[var(--cs-muted)]">
                                            {fees.policy.allowDiscount ? "Allowed" : "Off"}
                                        </strong>
                                    </span>
                                </div>
                            )
                        }
                    >
                        {!fees ? (
                            <SkeletonRows count={3} />
                        ) : pricedDoctors.length === 0 ? (
                            <EmptyBlock
                                fact="No fees set yet"
                                next="Add what each bench charges so front desk can collect it."
                            />
                        ) : (
                            <div className="flex flex-col gap-[6px]">
                                {pricedDoctors.map((d) => (
                                    <div
                                        key={d.id}
                                        className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]"
                                    >
                                        <RowText label={d.name} sub={d.specialization} />
                                        <span className="ml-auto flex flex-none flex-col items-end gap-[1px]">
                                            <span className="text-[13px] font-bold tabular-nums text-[var(--cs-ink)]">
                                                {formatMoney(d.consultationFee!, currency)}
                                            </span>
                                            {d.followUpFee !== null && (
                                                <span className="text-[10px] tabular-nums text-[var(--cs-faint)]">
                                                    {formatMoney(d.followUpFee, currency)} follow-up
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* ── People ───────────────────────────────────────────────── */}
                <Card
                    id="adm-card-people"
                    tone="blue"
                    icon={<Users size={14} />}
                    title="People"
                    subtitle={
                        staff
                            ? `${activeStaff.length} active · ${staff.length - activeStaff.length} inactive`
                            : "Everyone with a login at this clinic"
                    }
                >
                    {!staff ? (
                        <SkeletonRows count={2} />
                    ) : activeStaff.length === 0 ? (
                        <EmptyBlock fact="Nobody has a login yet" next="Staff join by registering against this clinic." />
                    ) : (
                        <div className="grid grid-cols-3 gap-[6px] max-[900px]:grid-cols-1">
                            {activeStaff.map((s) => (
                                <div
                                    key={s.id}
                                    className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]"
                                >
                                    <RowText label={s.full_name ?? "Unnamed"} sub={s.phone} />
                                    <span className="ml-auto flex-none rounded-full border border-[var(--cs-line-strong)] bg-[var(--cs-card)] px-[9px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-[var(--cs-label)]">
                                        {ROLE_LABEL[s.role ?? ""] ?? s.role ?? "—"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {feesOpen && fees && (
                <FeesModal
                    hospitalId={identity.hospitalId}
                    policy={fees.policy}
                    doctors={fees.doctors}
                    onClose={() => setFeesOpen(false)}
                    onSaved={() => {
                        toast.success("Fees saved");
                        loadStatic();
                        loadAnalytics();
                    }}
                />
            )}
        </div>
    );
}
