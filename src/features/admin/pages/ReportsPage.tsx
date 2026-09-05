// ---------------------------------------------------------------------------
// REPORTS — every chart on Overview, as the table behind it.
//
// Anmol, 2026-09-04: "whenever you're trying to show a chart, there should be
// option to see them in detail, how the chart is going... a beautiful table
// layout that could open a different page."
//
// A chart answers "what shape is this". A table answers "what exactly happened
// on the 14th". Both are needed and neither substitutes for the other, so the
// charts stay on Overview and every one of them has a counterpart here rather
// than being replaced by a grid.
//
// ── Why a totals row, and why it is computed here
//
// The totals are summed from the same rows the table renders, not re-fetched
// or re-derived from the KPI query. If the column and its total ever disagree,
// the reader stops trusting both — so there is exactly one source for each
// number on screen, and it is the array immediately above.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Table2 } from "lucide-react";
import { useClinicalIdentity } from "../../../hooks/useClinicalIdentity";
import { Card, EmptyBlock, SkeletonRows } from "../../clinic/ui";
import { PeriodBar, type PeriodState } from "../PeriodBar";
import { ShareBar } from "../charts";
import {
    buildRange, clinicToday, fetchClinicAnalytics, fetchFeeSettings, formatDayShort,
    formatMoney, formatRangeLabel,
    type ClinicAnalytics, type FeeSettings,
} from "../../../lib/db/admin";

type Tab = "days" | "money" | "hours" | "benches";

const TABS: { key: Tab; label: string }[] = [
    { key: "days", label: "Patients by day" },
    { key: "money", label: "Collections by day" },
    { key: "hours", label: "By hour" },
    { key: "benches", label: "By bench" },
];

/** Weekday name for a yyyy-mm-dd. Formatted in UTC for the same reason
 *  `formatDayShort` is — the string is a calendar date, not an instant. */
function weekday(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

function Th({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
    return (
        <th className={`whitespace-nowrap px-[10px] py-[7px] text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)] ${align === "left" ? "text-left" : "text-right"}`}>
            {children}
        </th>
    );
}

function Td({ children, align = "right", strong, muted }: {
    children: ReactNode; align?: "left" | "right"; strong?: boolean; muted?: boolean;
}) {
    return (
        <td
            className={
                `whitespace-nowrap px-[10px] py-[7px] tabular-nums ${align === "left" ? "text-left" : "text-right"} ` +
                (strong ? "text-[12.5px] font-bold text-[var(--cs-ink)] " : "text-[12px] ") +
                (muted ? "text-[var(--cs-faint)]" : strong ? "" : "text-[var(--cs-muted)]")
            }
        >
            {children}
        </td>
    );
}

/** The scroll box every table sits in. Wide tables scroll THEMSELVES; the page
 *  body must never scroll sideways (design-dna layout rule 10). */
function TableBox({ children }: { children: ReactNode }) {
    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">{children}</table>
        </div>
    );
}

function Row({ children, i }: { children: ReactNode; i: number }) {
    return (
        <tr className={`border-t border-[var(--cs-line)] transition-colors hover:bg-[var(--cs-blue-soft)] ${i % 2 === 1 ? "bg-[rgba(248,250,252,0.6)]" : ""}`}>
            {children}
        </tr>
    );
}

function TotalRow({ children }: { children: ReactNode }) {
    return (
        <tr className="border-t-[1.5px] border-[var(--cs-line-strong)] bg-[var(--cs-page)]">{children}</tr>
    );
}

export function ReportsPage() {
    const identity = useClinicalIdentity();
    const today = clinicToday();

    const [period, setPeriod] = useState<PeriodState>({ preset: "30d", from: today, to: today });
    // Arrived from a chart? Open the table that chart was showing. Read once
    // as the initial value rather than kept in sync — once here, the tab chips
    // own the choice, and rewriting the URL on every click would put four
    // junk entries in the back stack.
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState<Tab>(() => {
        const t = searchParams.get("tab");
        return TABS.some((x) => x.key === t) ? (t as Tab) : "days";
    });
    const [data, setData] = useState<ClinicAnalytics | null>(null);
    const [fees, setFees] = useState<FeeSettings | null>(null);
    const [loading, setLoading] = useState(true);

    const range = useMemo(
        () => buildRange(period.preset, { from: period.from, to: period.to }),
        [period]
    );

    const load = useCallback(() => {
        if (!identity.ready) return;
        setLoading(true);
        fetchClinicAnalytics(identity.hospitalId, range)
            .then(setData)
            .catch((e: unknown) => { console.error("[reports]", e); setData(null); })
            .finally(() => setLoading(false));
    }, [identity.ready, identity.hospitalId, range]);

    useEffect(load, [load]);
    useEffect(() => {
        if (!identity.ready) return;
        fetchFeeSettings(identity.hospitalId).then(setFees).catch(() => setFees(null));
    }, [identity.ready, identity.hospitalId]);

    const currency = fees?.policy.currency ?? "INR";
    const money = (n: number) => formatMoney(n, currency);

    // Newest first: a report is read from "what just happened" backwards, and
    // the chart already shows the period left-to-right.
    const days = useMemo(() => (data ? [...data.series].reverse() : []), [data]);

    const totals = useMemo(() => {
        const z = { visits: 0, completed: 0, discarded: 0, newPatients: 0, prescriptions: 0, revenue: 0, gross: 0, discount: 0, cash: 0, upi: 0, card: 0 };
        for (const d of days) {
            z.visits += d.visits; z.completed += d.completed; z.discarded += d.discarded;
            z.newPatients += d.newPatients; z.prescriptions += d.prescriptions;
            z.revenue += d.revenue; z.gross += d.gross; z.discount += d.discount;
            z.cash += d.cash; z.upi += d.upi; z.card += d.card;
        }
        return z;
    }, [days]);

    const hourRows = useMemo(() => {
        if (!data) return [];
        const total = data.byHour.reduce((a, b) => a + b, 0);
        return data.byHour
            .map((n, h) => ({ h, n, share: total > 0 ? n / total : 0 }))
            .filter((r) => r.n > 0);
    }, [data]);

    const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`;
    const empty = data && data.patients.value === 0 && data.revenue.value === 0;

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex w-full flex-1 flex-col gap-[12px] overflow-y-auto px-[28px] pb-[44px] pt-[15px] max-[900px]:px-[12px]">

                <PeriodBar
                    period={period}
                    range={range}
                    onChange={setPeriod}
                    onRefresh={load}
                    busy={loading}
                />

                <Card
                    id="adm-card-report"
                    tone="blue"
                    icon={<Table2 size={14} />}
                    title="Reports"
                    subtitle={formatRangeLabel(range)}
                    action={
                        <div className="flex flex-wrap items-center gap-[3px]">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    className={
                                        "cursor-pointer rounded-full border px-[10px] py-[3px] text-[10.5px] font-semibold transition-colors outline-none " +
                                        (tab === t.key
                                            ? "border-[var(--cs-blue)] bg-[var(--cs-blue-soft)] text-[var(--cs-blue)]"
                                            : "border-[var(--cs-line-strong)] text-[var(--cs-faint)] hover:bg-[#f1f5f9]")
                                    }
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    }
                    bodyClass="p-0!"
                >
                    {!data ? (
                        <div className="p-[12px]"><SkeletonRows count={6} /></div>
                    ) : empty ? (
                        <EmptyBlock fact="Nothing in this period" next="Pick a wider range, or a different date." />
                    ) : tab === "days" ? (
                        <TableBox>
                            <thead>
                                <tr>
                                    <Th align="left">Date</Th>
                                    <Th align="left">Day</Th>
                                    <Th>Patients</Th>
                                    <Th>Completed</Th>
                                    <Th>Discarded</Th>
                                    <Th>New</Th>
                                    <Th>Rx</Th>
                                    <Th>Collected</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((d, i) => (
                                    <Row key={d.date} i={i}>
                                        <Td align="left" strong>{formatDayShort(d.date)}</Td>
                                        <Td align="left" muted>{weekday(d.date)}</Td>
                                        <Td strong>{d.visits}</Td>
                                        <Td>{d.completed}</Td>
                                        <Td muted={d.discarded === 0}>{d.discarded}</Td>
                                        <Td>{d.newPatients}</Td>
                                        <Td>{d.prescriptions}</Td>
                                        <Td>{data.revenueTracked ? money(d.revenue) : "—"}</Td>
                                    </Row>
                                ))}
                                <TotalRow>
                                    <Td align="left" strong>Total</Td>
                                    <Td align="left" muted>{days.length} days</Td>
                                    <Td strong>{totals.visits}</Td>
                                    <Td strong>{totals.completed}</Td>
                                    <Td strong>{totals.discarded}</Td>
                                    <Td strong>{totals.newPatients}</Td>
                                    <Td strong>{totals.prescriptions}</Td>
                                    <Td strong>{data.revenueTracked ? money(totals.revenue) : "—"}</Td>
                                </TotalRow>
                            </tbody>
                        </TableBox>
                    ) : tab === "money" ? (
                        <TableBox>
                            <thead>
                                <tr>
                                    <Th align="left">Date</Th>
                                    <Th align="left">Day</Th>
                                    <Th>Gross</Th>
                                    <Th>Discount</Th>
                                    <Th>Net</Th>
                                    <Th>Cash</Th>
                                    <Th>UPI</Th>
                                    <Th>Card</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {days.map((d, i) => (
                                    <Row key={d.date} i={i}>
                                        <Td align="left" strong>{formatDayShort(d.date)}</Td>
                                        <Td align="left" muted>{weekday(d.date)}</Td>
                                        <Td>{money(d.gross)}</Td>
                                        <Td muted={d.discount === 0}>
                                            {d.discount > 0 ? `−${money(d.discount)}` : "—"}
                                        </Td>
                                        <Td strong>{money(d.revenue)}</Td>
                                        <Td muted={d.cash === 0}>{d.cash > 0 ? money(d.cash) : "—"}</Td>
                                        <Td muted={d.upi === 0}>{d.upi > 0 ? money(d.upi) : "—"}</Td>
                                        <Td muted={d.card === 0}>{d.card > 0 ? money(d.card) : "—"}</Td>
                                    </Row>
                                ))}
                                <TotalRow>
                                    <Td align="left" strong>Total</Td>
                                    <Td align="left" muted>{days.length} days</Td>
                                    <Td strong>{money(totals.gross)}</Td>
                                    <Td strong>{totals.discount > 0 ? `−${money(totals.discount)}` : "—"}</Td>
                                    <Td strong>{money(totals.revenue)}</Td>
                                    <Td strong>{money(totals.cash)}</Td>
                                    <Td strong>{money(totals.upi)}</Td>
                                    <Td strong>{money(totals.card)}</Td>
                                </TotalRow>
                            </tbody>
                        </TableBox>
                    ) : tab === "hours" ? (
                        <TableBox>
                            <thead>
                                <tr>
                                    <Th align="left">Hour</Th>
                                    <Th>Patients</Th>
                                    <Th align="left">Share of day</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {hourRows.map((r, i) => (
                                    <Row key={r.h} i={i}>
                                        <Td align="left" strong>{hourLabel(r.h)}</Td>
                                        <Td strong>{r.n}</Td>
                                        <td className="px-[10px] py-[7px]">
                                            <div className="flex items-center gap-[9px]">
                                                <span className="w-[42px] flex-none text-[11.5px] tabular-nums text-[var(--cs-muted)]">
                                                    {(r.share * 100).toFixed(1)}%
                                                </span>
                                                <span className="min-w-0 flex-1"><ShareBar share={r.share} tone="violet" /></span>
                                            </div>
                                        </td>
                                    </Row>
                                ))}
                            </tbody>
                        </TableBox>
                    ) : (
                        <TableBox>
                            <thead>
                                <tr>
                                    <Th align="left">Bench</Th>
                                    <Th align="left">Speciality</Th>
                                    <Th>Fee</Th>
                                    <Th>Seen</Th>
                                    <Th>Completed</Th>
                                    <Th>Rx</Th>
                                    <Th>Collected</Th>
                                    <Th align="left">Share</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.benches.map((b, i) => (
                                    <Row key={b.doctorId} i={i}>
                                        <Td align="left" strong>{b.name}</Td>
                                        <Td align="left" muted>{b.specialization ?? "—"}</Td>
                                        <Td muted={b.consultationFee === null}>
                                            {b.consultationFee === null ? "Not set" : money(b.consultationFee)}
                                        </Td>
                                        <Td strong>{b.visits}</Td>
                                        <Td>{b.completed}</Td>
                                        <Td>{b.prescriptions}</Td>
                                        <Td>{data.revenueTracked ? money(b.revenue) : "—"}</Td>
                                        <td className="px-[10px] py-[7px]">
                                            <div className="flex items-center gap-[9px]">
                                                <span className="w-[42px] flex-none text-[11.5px] tabular-nums text-[var(--cs-muted)]">
                                                    {(b.share * 100).toFixed(0)}%
                                                </span>
                                                <span className="min-w-0 flex-1"><ShareBar share={b.share} tone="teal" /></span>
                                            </div>
                                        </td>
                                    </Row>
                                ))}
                            </tbody>
                        </TableBox>
                    )}
                </Card>
            </div>
        </div>
    );
}
