// ---------------------------------------------------------------------------
// CLINIC CONTROL — the owner-doctor's summarised view, inside their own
// clinical workspace.
//
// Anmol, 2026-09-04: "if there is just one doctor and admin = 0, show the admin
// panel to doctor, with just single doctor config... and when he clicks full
// admin preview, he will be taken to that page without any signup needed, with
// his own credentials."
//
// ── Why this is not just Overview with a different header
//
// It is deliberately SHORTER. A doctor who also owns the clinic is not doing
// administration as a job — they are checking on their own practice between
// patients. So this carries the numbers and the money, and hands off to
// Parallax for anything that needs a table, a roster or a catalogue. The
// bench comparison in particular is DROPPED at a single-bench clinic:
// comparing a doctor against themselves is a row of numbers pretending to be
// a ranking.
//
// ── Named "Clinic Control", not "Admin"
//
// Doctor-facing language (typography.md: clinical language, not implementation
// language). This person does not think of themselves as an administrator;
// they think of it as their clinic. "Admin" is the word Parallax uses about
// itself, to the people whose job it actually is.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
    Activity, ArrowUpRight, IndianRupee, LayoutDashboard, Stethoscope,
    TrendingUp, Users,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceHeader } from "../../../components/WorkspaceHeader";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, CardPillButton, EmptyBlock, RowText, SkeletonRows } from "../../clinic/ui";
import { Delta, Ring, TrendChart } from "../charts";
import { PeriodBar, type PeriodState } from "../PeriodBar";
import { FeesModal } from "../FeesModal";
import {
    buildRange, clinicToday, fetchClinicAnalytics, fetchClinicSetup, fetchFeeSettings,
    formatMoney, formatRangeLabel, previousRange,
    type ClinicAnalytics, type ClinicSetup, type FeeSettings,
} from "../../../lib/db/admin";
import { ADMIN_BRAND } from "../../../lib/workspace/mode";

interface Props {
    logoRef: RefObject<HTMLDivElement>;
    onOpenSidebar: () => void;
}

export function ClinicControlPage({ logoRef, onOpenSidebar }: Props) {
    const identity = useClinicalIdentity();
    const navigate = useNavigate();
    const today = clinicToday();

    const [period, setPeriod] = useState<PeriodState>({ preset: "7d", from: today, to: today });
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [setup, setSetup] = useState<ClinicSetup | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [chartMetric, setChartMetric] = useState<"visits" | "revenue">("visits");
    const [feesOpen, setFeesOpen] = useState(false);

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const loadAnalytics = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchClinicAnalytics(identity.hospitalId, range)
            .then(setData)
            .catch((e: unknown) => { console.error("[clinic-control]", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, range]);

    const loadStatic = useCallback(() => {
        if (!identity.ready) return;
        fetchClinicSetup(identity.hospitalId).then(setSetup).catch(() => setSetup(null));
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
    }, [identity.ready, identity.hospitalId]);

    useEffect(loadAnalytics, [loadAnalytics]);
    useEffect(loadStatic, [loadStatic]);

    const currency = fees?.policy.currency ?? "INR";
    const compareLabel = useMemo(() => {
        const p = previousRange(range);
        return p.from === p.to ? "day before" : "previous period";
    }, [range]);

    // The whole reason this page differs from Parallax's Overview.
    const multiBench = (setup?.benches ?? 1) > 1;
    const pricedDoctors = useMemo(
        () => (fees?.doctors ?? []).filter((d) => d.consultationFee !== null),
        [fees]
    );

    return (
        <div className="relative flex min-h-screen flex-col bg-[var(--cs-page)]">
            <WorkspaceHeader
                logoRef={logoRef}
                onOpenSidebar={onOpenSidebar}
                title="Clinic Control"
                subtitle={setup ? `${setup.name} · ${setup.modeLabel}` : "How your clinic is doing"}
                rightSlot={
                    /* The door. Same session, same credentials — Parallax's
                       route already admits a doctor at a clinic with no
                       dedicated admin, so this is a navigation, not a login. */
                    <button type="button" className="ws-stat-pill" onClick={() => navigate("/app/admin")}>
                        <span className="ws-stat-icon"><LayoutDashboard size={12} /></span>
                        <span className="ws-stat-text">
                            <span className="ws-stat-value">Full</span>
                            <span className="ws-stat-label">{ADMIN_BRAND.product}</span>
                        </span>
                        <ArrowUpRight size={12} className="ws-stat-chevron" />
                    </button>
                }
            />

            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[56px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                <PeriodBar
                    period={period}
                    range={range}
                    onChange={setPeriod}
                    onRefresh={loadAnalytics}
                    busy={loading}
                >
                    {data && (
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

                {/* Four, not five — a solo doctor does not need a completion
                    ring competing with their own patient count for attention;
                    it rides along under "Seen" instead. */}
                <div className="grid grid-cols-4 gap-[10px] max-[1000px]:grid-cols-2">
                    {[
                        { label: "Patients seen", value: data ? String(data.patients.value) : "—", metric: data?.patients },
                        { label: "New patients", value: data ? String(data.newPatients.value) : "—", metric: data?.newPatients },
                        { label: "Prescriptions", value: data ? String(data.prescriptions.value) : "—", metric: data?.prescriptions },
                        {
                            label: "Collected",
                            value: !data ? "—" : data.revenueTracked ? formatMoney(data.revenue.value, currency) : "Not set up",
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
                                                ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]"
                                                : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                        }
                                    >
                                        {m === "visits" ? "Patients" : "Money"}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => navigate(`/app/admin/reports?tab=${chartMetric === "visits" ? "days" : "money"}`)}
                                    className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-blue)] outline-none hover:underline"
                                >
                                    Detail <ArrowUpRight size={11} />
                                </button>
                            </div>
                        }
                    >
                        {!data ? (
                            <SkeletonRows count={4} />
                        ) : data.patients.value === 0 && data.revenue.value === 0 ? (
                            <EmptyBlock fact="No activity in this period" next="Pick a wider range, or a different date." />
                        ) : (
                            <TrendChart points={data.series} metricKey={chartMetric} />
                        )}
                    </Card>

                    <Card
                        tone="violet"
                        icon={<IndianRupee size={14} />}
                        title="Consultation fees"
                        subtitle={multiBench ? "What each bench charges" : "What you charge"}
                        action={
                            fees && (
                                <CardPillButton tone="violet" onClick={() => setFeesOpen(true)}>
                                    {pricedDoctors.length ? "Edit" : "Set fees"}
                                </CardPillButton>
                            )
                        }
                        foot={
                            fees && (
                                <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[3px] text-[11px] text-[var(--cs-faint)]">
                                    <span>GST: <strong className="font-semibold text-[var(--cs-muted)]">{fees.policy.gstEnabled ? `${fees.policy.gstPercent}%` : "Not charged"}</strong></span>
                                    <span>Discount: <strong className="font-semibold text-[var(--cs-muted)]">{fees.policy.allowDiscount ? "Allowed" : "Off"}</strong></span>
                                </div>
                            )
                        }
                    >
                        {!fees ? (
                            <SkeletonRows count={2} />
                        ) : pricedDoctors.length === 0 ? (
                            <EmptyBlock fact="No fee set yet" next="Set it so front desk can collect." />
                        ) : (
                            <div className="flex flex-col gap-[6px]">
                                {pricedDoctors.map((d) => (
                                    <div key={d.id} className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]">
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

                {/* Only where there is something to compare. */}
                {multiBench && (
                    <Card
                        tone="teal"
                        icon={<Stethoscope size={14} />}
                        title="Bench performance"
                        subtitle={`${setup?.benches} benches · ${formatRangeLabel(range)}`}
                        action={
                            <button
                                type="button"
                                onClick={() => navigate("/app/admin/reports?tab=benches")}
                                className="inline-flex cursor-pointer items-center gap-[3px] rounded-[6px] border-0 bg-transparent px-[4px] py-[3px] text-[10.5px] font-semibold text-[var(--cs-teal)] outline-none hover:underline"
                            >
                                Detail <ArrowUpRight size={11} />
                            </button>
                        }
                    >
                        {!data ? <SkeletonRows count={3} /> : (
                            <div className="flex flex-col gap-[6px]">
                                {data.benches.map((b) => (
                                    <div key={b.doctorId} className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] px-[9px] py-[8px]">
                                        <RowText label={b.name} sub={b.specialization} />
                                        <span className="ml-auto flex flex-none items-center gap-[14px] text-[12px] tabular-nums text-[var(--cs-muted)]">
                                            <span><strong className="text-[13px] font-bold text-[var(--cs-ink)]">{b.visits}</strong> seen</span>
                                            <span>{b.prescriptions} Rx</span>
                                            {data.revenueTracked && (
                                                <span className="font-semibold text-[var(--cs-violet)]">{formatMoney(b.revenue, currency)}</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}
            </div>

            {feesOpen && fees && (
                <FeesModal
                    hospitalId={identity.hospitalId}
                    policy={fees.policy}
                    doctors={fees.doctors}
                    onClose={() => setFeesOpen(false)}
                    onSaved={() => { toast.success("Fees saved"); loadStatic(); loadAnalytics(); }}
                />
            )}
        </div>
    );
}
