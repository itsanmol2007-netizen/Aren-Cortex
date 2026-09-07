// ---------------------------------------------------------------------------
// TREND DETAIL — what the Patient-flow/Collections chart opens onto.
//
// Anmol, 2026-09-08: "whenever you're creating a graph, make the user click
// on that graph, and then user can see how that graph was created... you
// have to show the list of all the collections has happened in the whole
// timeline... also an option of exporting that thing as a CSV." Referencing
// Parallax's own chart → Reports-table pattern (`OverviewPage.tsx`'s
// `DetailLink` → `ReportsPage.tsx`) — but that page lives at `/app/admin`,
// a route only a non-doctor admin/owner can land on; a doctor (admin or
// not) needs the same answer without leaving Overview, so this is a modal
// rather than a second route.
//
// The day-by-day table below costs no extra read: `series` is the exact
// `ClinicAnalytics.series` DoctorOverviewPage already fetched to draw the
// chart, doctor-scoped the same way. The CSV is the one thing that DOES
// fetch on demand — a separate, narrower query (`fetchPatientLedgerRows`)
// because the file that leaves the building is deliberately not the same
// shape as the chart: "just like this patient came into this clinic on
// this date, paid this much amount... not their actual clinical details
// which are sensitive." Date, name, amount — nothing else ever goes in it.
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { EmptyBlock, SkeletonRows } from "../clinic/ui";
import { toCsv, downloadCsv } from "../../lib/csv";
import {
    fetchPatientLedgerRows, formatDayShort, formatMoney, formatRangeLabel,
    type DateRange, type DayPoint,
} from "../../lib/db/admin";

function weekday(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
}

function Th({ children }: { children: ReactNode }) {
    return (
        <th className="whitespace-nowrap px-[9px] py-[6px] text-right text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)] first:text-left">
            {children}
        </th>
    );
}

function Td({ children, strong, muted }: { children: ReactNode; strong?: boolean; muted?: boolean }) {
    return (
        <td
            className={
                "whitespace-nowrap px-[9px] py-[6px] text-right tabular-nums first:text-left " +
                (strong ? "text-[12px] font-bold text-[var(--cs-ink)] " : "text-[11.5px] ") +
                (muted ? "text-[var(--cs-faint)]" : strong ? "" : "text-[var(--cs-muted)]")
            }
        >
            {children}
        </td>
    );
}

export function TrendDetailModal({
    hospitalId, doctorId, metric, series, range, revenueTracked, currency, subjectLabel, onClose,
}: {
    hospitalId: string;
    /** `undefined` = the whole clinic (the admin-doctor scope toggle's
     *  "Overall") — same convention `effectiveDoctorId` already uses. */
    doctorId: string | undefined;
    metric: "visits" | "revenue";
    series: DayPoint[];
    range: DateRange;
    revenueTracked: boolean;
    currency: string;
    /** "your" / "the clinic's" / "Dr Rao's" — already computed by the caller
     *  as `scopePossessive`, lower-cased for a sentence rather than a title. */
    subjectLabel: string;
    onClose: () => void;
}) {
    const [exporting, setExporting] = useState(false);
    const money = (n: number) => formatMoney(n, currency);
    // Newest first, same as ReportsPage — a report reads "what just
    // happened" backwards; the chart itself already runs left-to-right.
    const days = [...series].reverse();

    const exportCsv = async () => {
        setExporting(true);
        try {
            const rows = await fetchPatientLedgerRows(hospitalId, range, { doctorId });
            const csv = toCsv(
                rows.map((r) => ({
                    date: new Date(r.at).toLocaleDateString("en-CA"),
                    patient: r.patientName ?? "Unknown",
                    amount: r.amount ?? "",
                })),
                [
                    { key: "date", label: "Date" },
                    { key: "patient", label: "Patient" },
                    { key: "amount", label: `Amount paid (${currency})` },
                ]
            );
            downloadCsv(`aren-patients-${range.from}-to-${range.to}.csv`, csv);
        } catch (e) {
            console.error("[overview] CSV export:", e);
        } finally {
            setExporting(false);
        }
    };

    return (
        <PracticeModal
            accent="blue"
            icon={<Download size={15} />}
            eyebrow={formatRangeLabel(range)}
            title={metric === "visits" ? "Patient flow, by day" : "Collections, by day"}
            onClose={onClose}
            xl
            footer={
                <button
                    type="button"
                    className="prac-modal-btn is-primary"
                    disabled={exporting || days.length === 0}
                    onClick={exportCsv}
                >
                    <Download size={14} /> {exporting ? "Preparing…" : "Export patient list as CSV"}
                </button>
            }
        >
            <p className="m-0 text-[11.5px] leading-[1.5] text-[var(--cs-muted)]">
                Every day {subjectLabel} numbers cover this chart. The CSV button below is a separate,
                patient-safe export — date, patient, amount paid — with no clinical detail in it.
            </p>

            {days.length === 0 ? (
                <EmptyBlock fact="Nothing in this period" next="Pick a wider range, or a different date." />
            ) : (
                <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-[520px] border-collapse">
                        {metric === "visits" ? (
                            <>
                                <thead>
                                    <tr>
                                        <Th>Date</Th><Th>Day</Th><Th>Patients</Th><Th>Completed</Th>
                                        <Th>Discarded</Th><Th>New</Th><Th>Rx</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map((d, i) => (
                                        <tr key={d.date} className={`border-t border-[var(--cs-line)] ${i % 2 === 1 ? "bg-[rgba(248,250,252,0.6)]" : ""}`}>
                                            <Td strong>{formatDayShort(d.date)}</Td>
                                            <Td muted>{weekday(d.date)}</Td>
                                            <Td strong>{d.visits}</Td>
                                            <Td>{d.completed}</Td>
                                            <Td muted={d.discarded === 0}>{d.discarded}</Td>
                                            <Td>{d.newPatients}</Td>
                                            <Td>{d.prescriptions}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </>
                        ) : (
                            <>
                                <thead>
                                    <tr>
                                        <Th>Date</Th><Th>Day</Th><Th>Gross</Th><Th>Discount</Th>
                                        <Th>Net</Th><Th>Cash</Th><Th>UPI</Th><Th>Card</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map((d, i) => (
                                        <tr key={d.date} className={`border-t border-[var(--cs-line)] ${i % 2 === 1 ? "bg-[rgba(248,250,252,0.6)]" : ""}`}>
                                            <Td strong>{formatDayShort(d.date)}</Td>
                                            <Td muted>{weekday(d.date)}</Td>
                                            <Td>{revenueTracked ? money(d.gross) : "—"}</Td>
                                            <Td muted={d.discount === 0}>{d.discount > 0 ? `−${money(d.discount)}` : "—"}</Td>
                                            <Td strong>{revenueTracked ? money(d.revenue) : "—"}</Td>
                                            <Td muted={d.cash === 0}>{d.cash > 0 ? money(d.cash) : "—"}</Td>
                                            <Td muted={d.upi === 0}>{d.upi > 0 ? money(d.upi) : "—"}</Td>
                                            <Td muted={d.card === 0}>{d.card > 0 ? money(d.card) : "—"}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </>
                        )}
                    </table>
                </div>
            )}
        </PracticeModal>
    );
}
