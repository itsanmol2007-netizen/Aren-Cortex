import { useMemo } from "react";
import {
    CalendarClock,
    Eye,
    FileText,
    FlaskConical,
    History,
    Info,
    Phone,
    Pill,
    Printer,
    Stethoscope,
} from "lucide-react";
import type { PrescriptionRenderData, PrintQueueRx } from "@/lib/db";
import type { PrintLog } from "../../printLog";
import { formatArchiveDate, initials, padToken } from "../../utils";
import { useT } from "../../i18n/i18n";
import { avatarTint } from "../patients/PatientBrowser";
import { PrintStateChip } from "./PrintQueuePanel";

type Props = {
    entry: PrintQueueRx | null;
    detail: PrescriptionRenderData | null;
    detailLoading: boolean;
    detailFailed: boolean;
    onRetryDetail: () => void;
    printLog: PrintLog;
    // Every loaded prescription for the selected patient (incl. the current
    // one), newest first — the reprint path for older documents.
    patientHistory: PrintQueueRx[];
    onSelect: (rx: PrintQueueRx) => void;
    onPrint: () => void;
    onPreview: () => void;
};

// The action side of Print RX: confirm it's the right patient, press Print,
// hand the paper over. Deliberately not a prescription reader — medicines
// stay behind Preview and on the printed page (the receptionist trusts the
// doctor's work; her task is operational).
export function PrintWorkspace({
    entry,
    detail,
    detailLoading,
    detailFailed,
    onRetryDetail,
    printLog,
    patientHistory,
    onSelect,
    onPrint,
    onPreview,
}: Props) {
    const t = useT();

    if (!entry) return <WorkspaceEmpty />;

    const tint = avatarTint(entry.patient_name);
    const log = printLog[entry.prescription_id];
    const created = new Date(entry.created_at);
    const createdTime = created.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    const ready = !!detail && !detailLoading && !detailFailed;

    return (
        // Keyed re-mount per prescription: each one opens with the quiet
        // aren-rise entrance instead of morphing mid-air into the next.
        <div key={entry.prescription_id} className="aren-rise flex min-h-0 flex-col gap-[14px] overflow-y-auto overscroll-contain pr-[2px]">
            {/* ── Who this paper belongs to ─────────────────────────────── */}
            <section className="shrink-0 rounded-[16px] border border-[#e7e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
                <div className="flex items-start gap-4">
                    <div
                        className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[17px] text-[19px] font-bold"
                        style={{ background: tint.bg, color: tint.text }}
                        aria-hidden
                    >
                        {initials(entry.patient_name)}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
                            {/* a div on purpose — raw h2 is eaten by the §13 layer trap */}
                            <div className="truncate font-[Manrope,sans-serif] text-[20px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                                {entry.patient_name}
                            </div>
                            <PrintStateChip log={log} />
                        </div>

                        <div className="mt-[6px] flex flex-wrap items-center gap-x-[7px] gap-y-[3px] text-[13px] font-medium text-[#5a6472]">
                            {entry.phone && (
                                <span className="inline-flex items-center gap-[5px] font-semibold text-[#374151] tabular-nums">
                                    <Phone size={12.5} className="text-[#8a91a0]" />
                                    {entry.phone}
                                </span>
                            )}
                            {entry.phone && (entry.age > 0 || entry.gender) && <Dot />}
                            {entry.age > 0 && <span className="tabular-nums">{entry.age} {t("yrs")}</span>}
                            {entry.age > 0 && entry.gender && <Dot />}
                            {entry.gender && <span>{entry.gender}</span>}
                        </div>
                    </div>

                    {entry.token_number != null && (
                        <div
                            title={t("rxTokenTip")}
                            className="inline-flex h-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[rgba(99,102,241,0.08)] px-[11px] font-[Manrope,sans-serif] text-[14px] font-extrabold tracking-[-0.01em] text-[#4c46c9] tabular-nums"
                        >
                            #{padToken(entry.token_number)}
                        </div>
                    )}
                </div>

                {/* ── Operational facts about this document ──────────────── */}
                <div className="mt-4 grid grid-cols-4 divide-x divide-[#eef0f5] rounded-[12px] border border-[#eef0f5] bg-[#fbfbfd] py-[11px] max-[1240px]:grid-cols-2 max-[1240px]:gap-y-3">
                    <SummaryCell label={t("rxDoctor")}>
                        <span className={`flex items-center justify-center gap-[6px] text-[13.5px] font-bold ${entry.doctor_name ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {entry.doctor_name && <Stethoscope size={13} className="text-[#8b5cf6] opacity-80" />}
                            <span className="truncate">{entry.doctor_name ?? "—"}</span>
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("rxPrescribed")}>
                        <span className="text-[13.5px] font-bold text-[#161d29] tabular-nums">
                            {formatArchiveDate(entry.created_at)} · {createdTime}
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("rxCopies")}>
                        {/* Zero rule: an unprinted document shows a muted 0, not an alarm. */}
                        <span className={`font-[Manrope,sans-serif] text-[17px] font-extrabold tabular-nums ${log?.count ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {log?.count ?? 0}
                        </span>
                    </SummaryCell>
                    <SummaryCell label={t("rxLastPrinted")}>
                        <span className={`text-[13.5px] font-bold tabular-nums ${log?.last ? "text-[#161d29]" : "text-[#a8aeba]"}`}>
                            {log?.last
                                ? `${formatArchiveDate(log.last)} · ${new Date(log.last).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}`
                                : "—"}
                        </span>
                    </SummaryCell>
                </div>
            </section>

            {/* ── The one job of this page ───────────────────────────────── */}
            <section className="shrink-0 rounded-[16px] border border-[#e7e9f0] bg-white p-5 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
                {/* Supporting context, not review: how much is on the paper. */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <ContentChip icon={<Pill size={12.5} />} text={t("rxMedicines", { n: detail?.medicines.length ?? entry.medicine_count })} />
                    {(detail ? detail.tests.length > 0 : entry.test_count > 0) && (
                        <ContentChip icon={<FlaskConical size={12.5} />} text={t("rxTests", { n: detail?.tests.length ?? entry.test_count })} />
                    )}
                    {(detail?.followUpDays ?? entry.follow_up_days) != null && (
                        <ContentChip icon={<CalendarClock size={12.5} />} text={t("rxFollowUpDays", { n: detail?.followUpDays ?? entry.follow_up_days ?? 0 })} />
                    )}
                </div>

                {detailFailed ? (
                    <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[rgba(210,59,52,0.25)] bg-[rgba(210,59,52,0.04)] px-4 py-3">
                        <span className="text-[13px] font-semibold text-[#a5322c]">{t("rxDetailFailed")}</span>
                        <button
                            type="button"
                            onClick={onRetryDetail}
                            className="h-8 shrink-0 rounded-[8px] border-[1.5px] border-[#e6e3f1] bg-white px-3 text-[12px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                        >
                            {t("retry")}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-[10px]">
                        {/* Printing opens a door (the OS print flow) — it wears the
                            loud brand treatment like the other front doors (§7.7,
                            amended 2026-08-23: was a purple→blue gradient,
                            flattened to solid #2f6bed with a glow — Anmol's call,
                            the gradient "looked terrible"). */}
                        <button
                            type="button"
                            onClick={onPrint}
                            disabled={!ready}
                            aria-busy={detailLoading || undefined}
                            className="flex h-11 items-center gap-[9px] rounded-[11px] bg-[#2f6bed] px-[22px] text-[13.5px] font-bold text-white shadow-[0_3px_12px_rgba(47,107,237,0.4),0_0_16px_rgba(47,107,237,0.28)] transition-[background-color,box-shadow,opacity] duration-100 hover:bg-[#1d51c9] hover:shadow-[0_3px_16px_rgba(47,107,237,0.55),0_0_22px_rgba(47,107,237,0.38)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(47,107,237,0.35)] disabled:cursor-default disabled:opacity-60"
                        >
                            <Printer size={16} strokeWidth={2.2} />
                            {t("printPrescription")}
                        </button>
                        <button
                            type="button"
                            onClick={onPreview}
                            disabled={!ready}
                            aria-busy={detailLoading || undefined}
                            className="flex h-11 items-center gap-[8px] rounded-[11px] border-[1.5px] border-[#e6e3f1] bg-white px-[18px] text-[13px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd] hover:text-[#3b4453] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] disabled:cursor-default disabled:opacity-60"
                        >
                            <Eye size={15} />
                            {t("openPreview")}
                        </button>
                    </div>
                )}

                <p className="m-0 mt-3 flex items-start gap-[7px] text-[12px] leading-[1.5] text-[#8a91a0]">
                    <Info size={13} className="mt-[2px] shrink-0 text-[#b3b9c6]" />
                    {detailLoading ? t("rxPreparing") : t("printInfoLine")}
                </p>
            </section>

            {/* ── The patient's other prescriptions ──────────────────────── */}
            <PrescriptionHistory current={entry} history={patientHistory} printLog={printLog} onSelect={onSelect} />
        </div>
    );
}

function Dot() {
    return <span aria-hidden className="text-[#c4c9d3]">·</span>;
}

function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-center gap-[7px] text-[13.5px] font-bold text-[#161d29]">
            <span className="text-[#8b5cf6] opacity-85">{icon}</span>
            {text}
        </div>
    );
}

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-[3px] px-3 text-center">
            <span className="text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-[#8a91a0]">{label}</span>
            {children}
        </div>
    );
}

function ContentChip({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <span className="inline-flex items-center gap-[6px] rounded-[8px] border border-[#eef0f5] bg-[#f8f8fd] px-[10px] py-[5px] text-[12px] font-semibold text-[#5a6472]">
            <span className="text-[#8a91a0]">{icon}</span>
            {text}
        </span>
    );
}

// Receptionists reprint last month's prescription all the time — the
// patient's other documents sit one click away, without leaving the page.
function PrescriptionHistory({
    current,
    history,
    printLog,
    onSelect,
}: {
    current: PrintQueueRx;
    history: PrintQueueRx[];
    printLog: PrintLog;
    onSelect: (rx: PrintQueueRx) => void;
}) {
    const t = useT();
    const rows = useMemo(() => history.slice(0, 20), [history]);

    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e7e9f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="px-5 pb-[10px] pt-4">
                <CardTitle icon={<History size={14} />} text={t("rxHistoryTitle")} />
                <p className="m-0 mt-[3px] text-[11.5px] font-medium text-[#a8aeba]">{t("rxHistorySub")}</p>
            </div>

            {rows.length <= 1 ? (
                <p className="m-0 px-5 pb-5 text-[12.5px] leading-[1.5] text-[#8a91a0]">{t("rxHistoryOnly")}</p>
            ) : (
                <div className="max-h-[300px] min-h-0 overflow-y-auto overscroll-contain pb-1">
                    {rows.map((rx) => {
                        const isCurrent = rx.prescription_id === current.prescription_id;
                        const d = new Date(rx.created_at);
                        const day = d.toLocaleDateString("en-IN", { day: "2-digit" });
                        const monYear = d.toLocaleDateString("en-IN", {
                            month: "short",
                            year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                        });
                        return (
                            <button
                                key={rx.prescription_id}
                                type="button"
                                onClick={() => { if (!isCurrent) onSelect(rx); }}
                                aria-current={isCurrent || undefined}
                                className={`flex w-full items-center gap-3 border-t border-l-[3px] border-t-[#f2f3f7] px-5 py-[9px] text-left transition-colors duration-100 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${
                                    isCurrent ? "cursor-default border-l-[#7c5cf0] bg-[rgba(124,92,240,0.05)]" : "border-l-transparent hover:bg-[#f8f8fd]"
                                }`}
                            >
                                <div className="w-[40px] shrink-0 text-center">
                                    <div className="font-[Manrope,sans-serif] text-[16px] font-extrabold leading-none text-[#374151] tabular-nums">{day}</div>
                                    <div className="mt-[2px] text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[#a8aeba]">{monYear}</div>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-[7px]">
                                        <FileText size={12.5} className="shrink-0 text-[#8a91a0]" />
                                        <span className="truncate text-[13px] font-semibold text-[#161d29]">
                                            {t("rxMedicines", { n: rx.medicine_count })}
                                        </span>
                                        {isCurrent && (
                                            <span className="shrink-0 rounded-[5px] border border-[#e5ddfa] bg-[rgba(124,92,240,0.07)] px-[6px] py-[1px] text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#6d5bc7]">
                                                {t("rxHistorySelected")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-[1px] truncate text-[11.5px] text-[#8a91a0]">{rx.doctor_name ?? "—"}</div>
                                </div>
                                <PrintStateChip log={printLog[rx.prescription_id]} size="sm" />
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

// The workspace before a selection: a welcoming pause that also teaches how
// the page fills itself — never a blank panel, never technical.
function WorkspaceEmpty() {
    const t = useT();
    return (
        <div className="aren-rise flex min-h-0 flex-1 flex-col items-center justify-center gap-[12px] rounded-[16px] border border-[#e7e9f0] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <h3 className="m-0 mt-1 flex items-center gap-[9px] font-[Manrope,sans-serif] text-[20px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                <Printer size={19} className="text-[#8b5cf6] opacity-80" />
                {t("rxWsEmptyTitle")}
            </h3>
            <p className="m-0 max-w-[320px] text-[13.5px] font-[450] leading-[1.55] text-[#5a6472]">{t("rxWsEmptyBody")}</p>
        </div>
    );
}
