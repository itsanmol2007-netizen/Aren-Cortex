import { useState } from "react";
import { ClipboardList, History, MoreVertical, RefreshCw, Stethoscope, Thermometer } from "lucide-react";
import { fetchPatientVisits, type DBDoctor, type RealVisit } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { tintFor } from "../statusStyle";
import { formatShortDate, initials, padToken } from "../utils";
import { useT } from "../i18n/i18n";
import { ModalShell } from "./ModalShell";

type Props = {
    visit: TodayVisit;
    doctors: DBDoctor[];
    onClose: () => void;
    onReassignDoctor: (visit: TodayVisit, doctorId: string, doctorName: string) => void;
    onStartConsultation: (visit: TodayVisit) => void;
    onComplete: (visit: TodayVisit) => void;
    onCancel: (visit: TodayVisit) => void;
};

export function VisitDetailModal({ visit, doctors, onClose, onReassignDoctor, onStartConsultation, onComplete, onCancel }: Props) {
    const t = useT();
    // History is fetched ON DEMAND, never on open.
    //
    // It used to fire the moment the modal mounted and paint a two-row
    // skeleton that, for every first-time patient, resolved to nothing at all
    // — a loading state for absent data, which reads as broken. Most opens of
    // this modal are to reassign a doctor or cancel it; the history is the
    // exception, so it costs one click instead of costing every open.
    const [pastVisits, setPastVisits] = useState<RealVisit[] | null>(null);
    const [pastLoading, setPastLoading] = useState(false);
    const [pastError, setPastError] = useState(false);

    const loadPast = () => {
        if (pastLoading || pastVisits) return;
        setPastLoading(true);
        setPastError(false);
        fetchPatientVisits(visit.patient_id)
            .then((rows) => setPastVisits(rows.slice(0, 5)))
            .catch((err) => {
                console.warn("fetchPatientVisits failed (non-fatal):", err);
                setPastError(true);
            })
            .finally(() => setPastLoading(false));
    };

    const tint = tintFor(visit.status);

    return (
        <ModalShell
            eyebrow={t("detEyebrow")}
            title={`#${padToken(visit.token_number)}`}
            icon={<ClipboardList size={19} strokeWidth={2.2} />}
            onClose={onClose}
        >
            {/* Identity card — the same violet-tinted object CreateVisitModal's
                existing-patient state wears (§ visual-standard hard rule: every
                modal in this family carries the same weight). This used to be
                bare text sitting directly on the paper body, the one part of
                the modal that didn't look like it belonged to the same app as
                intake. */}
            <div className="flex items-center gap-3 rounded-[12px] border border-[#e5ddfa] bg-[linear-gradient(135deg,rgba(124,92,240,0.09),rgba(244,114,182,0.03))] px-3 py-[10px]">
                <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[14px] font-bold text-white"
                    style={{ background: "linear-gradient(155deg,#7c5cf0,#f472b6)", boxShadow: "0 3px 10px rgba(124,92,240,0.3)" }}
                >
                    {initials(visit.patient_name)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[8px]">
                        <div className="truncate font-[Manrope,sans-serif] text-[17px] font-extrabold leading-[1.2] tracking-[-0.01em] text-[#161d29]">
                            {visit.patient_name}
                        </div>
                        <span className="shrink-0 rounded-[6px] bg-[rgba(99,102,241,0.1)] px-[7px] py-[2px] font-[Manrope,sans-serif] text-[11px] font-extrabold tracking-[-0.01em] text-[#4c46c9] tabular-nums">
                            #{padToken(visit.token_number)}
                        </span>
                    </div>
                    <div className="mt-[2px] text-[12.5px] text-[#5a6472]">
                        {visit.phone}
                        <span className="mx-[6px] text-[#a8aeba]">·</span>
                        {visit.age}{visit.gender ? `, ${visit.gender[0]}` : ""}
                    </div>
                </div>
                <span className={`shrink-0 rounded-full px-[10px] py-[4px] text-[11px] font-semibold ${tint.chipBg} ${tint.textClass}`}>
                    {t(tint.labelKey)}
                </span>
            </div>

            <Section icon={<Thermometer size={13} />} label={t("detSymptoms")}>
                {/* Symptoms are structured entities — render them as the
                    same chip objects Cortex uses, in paper-zone neutrals. */}
                {visit.symptom_names.length ? (
                    <div className="flex flex-wrap gap-[6px]">
                        {visit.symptom_names.map((s) => (
                            <span
                                key={s}
                                className="rounded-[8px] border border-[#e4e7ee] bg-[#f7f8fb] px-[10px] py-[5px] text-[12.5px] font-medium text-[#374151]"
                            >
                                {s}
                            </span>
                        ))}
                    </div>
                ) : (
                    <div className="text-[13px] text-[#a8aeba]">{t("noSymptoms")}</div>
                )}
            </Section>

            <Section icon={<Stethoscope size={13} />} label={t("detDoctor")}>
                <select
                    value={visit.assigned_doctor_id ?? ""}
                    onChange={(e) => {
                        const d = doctors.find((x) => x.id === e.target.value);
                        if (d) onReassignDoctor(visit, d.id, d.name);
                    }}
                    className="fd-field"
                >
                    {doctors.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
            </Section>

            <Section icon={<RefreshCw size={13} />} label={t("detStatus")}>
                <StatusBar visit={visit} onStartConsultation={onStartConsultation} onComplete={onComplete} onCancel={onCancel} onClose={onClose} />
            </Section>

            {/* Only offered when there IS a history to offer. `visit_count`
                comes free with the queue row, so a first-time patient never
                sees a control that would resolve to an empty list. */}
            {visit.visit_count > 1 && (
                <Section icon={<History size={13} />} label={t("detPast")}>
                    {!pastVisits && !pastLoading && !pastError && (
                        <button
                            type="button"
                            onClick={loadPast}
                            className="flex w-full items-center gap-[8px] rounded-[10px] border-[1.5px] border-dashed border-[#dfe2ea] bg-white px-3 py-[9px] text-[12.5px] font-semibold text-[#5a6472] transition-colors hover:border-[#7c5cf0] hover:bg-[#faf9ff] hover:text-[#161d29]"
                        >
                            <History size={14} className="shrink-0 text-[#8b5cf6]" />
                            Show {visit.visit_count - 1} earlier visit{visit.visit_count - 1 === 1 ? "" : "s"}
                        </button>
                    )}

                    {pastLoading && (
                        <div className="flex items-center gap-[8px] px-1 py-[9px] text-[12.5px] text-[#8a91a0]">
                            <RefreshCw size={13} className="animate-spin" /> Loading history…
                        </div>
                    )}

                    {pastError && (
                        <button
                            type="button"
                            onClick={() => { setPastError(false); loadPast(); }}
                            className="w-full rounded-[10px] border border-[#f3d6d4] bg-[#fffafa] px-3 py-[9px] text-left text-[12.5px] font-semibold text-[#d23b34]"
                        >
                            Could not load history — tap to retry
                        </button>
                    )}

                    {pastVisits && pastVisits.length === 0 && (
                        <div className="px-1 py-[6px] text-[12.5px] text-[#a8aeba]">No earlier visits on record.</div>
                    )}

                    {pastVisits?.map((pv) => {
                        const pvTint = tintFor(pv.status);
                        return (
                            <div key={pv.id} className="mb-[7px] flex items-center justify-between rounded-[10px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[10px]">
                                <div className="min-w-0">
                                    <div className="truncate text-[13px] font-semibold text-[#161d29]">
                                        {pv.symptoms.length ? pv.symptoms.join(", ") : "—"}
                                    </div>
                                    <div className="mt-[1px] flex items-center gap-[6px] text-[12px] font-medium text-[#8a91a0]">
                                        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: pvTint.dotColor }} />
                                        {formatShortDate(pv.created_at)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </Section>
            )}
        </ModalShell>
    );
}

// Violet micro-label + icon + fading hairline: the same section grouping
// device as CreateVisitModal (§4 micro-label system).
function Section({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <div className="mt-4">
            <div className="mb-[7px] flex items-center gap-[6px]">
                {icon && <span className="flex text-[#8b5cf6] opacity-80">{icon}</span>}
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">{label}</span>
                <span aria-hidden className="h-px flex-1 bg-[linear-gradient(90deg,#e9e6f5,transparent)]" />
            </div>
            {children}
        </div>
    );
}

function StatusBar({
    visit,
    onStartConsultation,
    onComplete,
    onCancel,
    onClose,
}: {
    visit: TodayVisit;
    onStartConsultation: (v: TodayVisit) => void;
    onComplete: (v: TodayVisit) => void;
    onCancel: (v: TodayVisit) => void;
    onClose: () => void;
}) {
    const t = useT();
    const [moreOpen, setMoreOpen] = useState(false);
    const btnBase =
        "flex h-10 flex-1 items-center justify-center gap-[6px] rounded-[10px] border-[1.5px] text-[13px] font-semibold transition-colors";

    // Reception can cancel or reorder a visit; only the doctor marks one "in
    // consultation" or "completed" — those two are edge-case overrides now
    // (doctor unavailable, correcting a mistake), tucked behind More rather
    // than sitting as two equally-obvious buttons.
    if (visit.status === "waiting" || visit.status === "serving") {
        const overrideLabel = visit.status === "waiting" ? t("stConsult") : t("stCompleted");
        const runOverride = () => {
            (visit.status === "waiting" ? onStartConsultation : onComplete)(visit);
            onClose();
        };
        return (
            <div className="relative flex gap-[9px]">
                <button
                    onClick={() => { onCancel(visit); onClose(); }}
                    className={`${btnBase} border-[#e4e7ee] bg-white text-[#5a6472] hover:border-[#d23b34] hover:bg-[rgba(210,59,52,0.05)] hover:text-[#d23b34]`}
                >
                    {t("stCancelled")}
                </button>
                <button
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-[#e4e7ee] bg-white text-[#8a91a0] hover:border-[#d5dae4] hover:text-[#5a6472]"
                    title="More"
                >
                    <MoreVertical size={16} />
                </button>
                {moreOpen && (
                    <>
                        <div className="fixed inset-0 z-[59]" onClick={() => setMoreOpen(false)} />
                        <div className="absolute bottom-[46px] right-0 z-[60] min-w-[220px] rounded-[9px] border border-[#e4e7ee] bg-white p-[5px] shadow-[0_24px_60px_rgba(16,24,40,0.24)]">
                            <button
                                onClick={runOverride}
                                className="flex w-full items-center gap-[9px] rounded-[7px] px-[10px] py-[8px] text-left text-[13px] font-medium text-[#161d29] hover:bg-[#f6f6fb]"
                            >
                                {overrideLabel}
                            </button>
                            <p className="m-0 px-[10px] pb-[5px] pt-[2px] text-[10.5px] text-[#a8aeba]">
                                Normally set by the doctor — use this only if they're unavailable.
                            </p>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="flex gap-[9px]">
            <button disabled className={`${btnBase} cursor-default border-[#e4e7ee] bg-[#f5f6f9] text-[#a8aeba]`}>
                {t(tintFor(visit.status).labelKey)}
            </button>
        </div>
    );
}
