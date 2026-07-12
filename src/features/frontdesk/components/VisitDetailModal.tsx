import { useEffect, useState } from "react";
import { ClipboardList, History, RefreshCw, Stethoscope, Thermometer } from "lucide-react";
import { fetchPatientVisits, type DBDoctor, type RealVisit } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { tintFor } from "../statusStyle";
import { formatShortDate } from "../utils";
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
    const [pastVisits, setPastVisits] = useState<RealVisit[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchPatientVisits(visit.patient_id)
            .then((rows) => { if (!cancelled) setPastVisits(rows.slice(0, 3)); })
            .catch((err) => console.warn("fetchPatientVisits failed (non-fatal):", err));
        return () => { cancelled = true; };
    }, [visit.patient_id]);

    const tint = tintFor(visit.status);

    return (
        <ModalShell
            eyebrow={t("detEyebrow")}
            title={`#${visit.token_number != null ? String(visit.token_number).padStart(3, "0") : "—"}`}
            icon={<ClipboardList size={19} strokeWidth={2.2} />}
            onClose={onClose}
        >
            <div className="font-[Manrope,sans-serif] text-[22px] font-extrabold leading-[1.15] tracking-[-0.01em]" style={{ color: tint.borderColor }}>
                {visit.patient_name}
            </div>
            <div className="mt-[3px] text-[13px] text-[#5a6472]">
                {visit.phone}
                <span className="mx-[7px] text-[#a8aeba]">·</span>
                {visit.age}{visit.gender ? `, ${visit.gender[0]}` : ""}
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

            {pastVisits.length > 0 && (
                <Section icon={<History size={13} />} label={t("detPast")}>
                    {pastVisits.map((pv) => {
                        const pvTint = tintFor(pv.status);
                        return (
                            <div key={pv.id} className="mb-[7px] flex items-center justify-between rounded-[10px] border border-[#eef0f5] bg-[#fafbfc] px-3 py-[10px]">
                                <div className="min-w-0">
                                    <div className="truncate text-[13px] font-semibold text-[#161d29]">
                                        {pv.symptoms.length ? pv.symptoms.join(", ") : "—"}
                                    </div>
                                    <div className="mt-[1px] flex items-center gap-[6px] text-[12px] font-medium text-[#8a91a0]">
                                        {/* past visits had states too */}
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
        <div className="mt-5">
            <div className="mb-2 flex items-center gap-[6px]">
                {icon && <span className="flex text-[#837bb2] opacity-70">{icon}</span>}
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
    const btnBase =
        "flex h-11 flex-1 items-center justify-center gap-[6px] rounded-[10px] border-[1.5px] text-[13px] font-semibold transition-colors";

    if (visit.status === "waiting") {
        return (
            <div className="flex gap-[9px]">
                <button
                    onClick={() => { onStartConsultation(visit); onClose(); }}
                    className={`${btnBase} border-[#2f6bed] bg-[#2f6bed] text-white hover:bg-[#1d51c9]`}
                >
                    {t("stConsult")}
                </button>
                <button
                    onClick={() => { onCancel(visit); onClose(); }}
                    className={`${btnBase} border-[#e4e7ee] bg-white text-[#5a6472] hover:border-[#d23b34] hover:bg-[rgba(210,59,52,0.05)] hover:text-[#d23b34]`}
                >
                    {t("stCancelled")}
                </button>
            </div>
        );
    }

    if (visit.status === "serving") {
        return (
            <div className="flex gap-[9px]">
                <button
                    onClick={() => { onComplete(visit); onClose(); }}
                    className={`${btnBase} border-[#1c8a4d] bg-[#1c8a4d] text-white hover:brightness-95`}
                >
                    {t("stCompleted")}
                </button>
                <button
                    onClick={() => { onCancel(visit); onClose(); }}
                    className={`${btnBase} border-[#e4e7ee] bg-white text-[#5a6472] hover:border-[#d23b34] hover:bg-[rgba(210,59,52,0.05)] hover:text-[#d23b34]`}
                >
                    {t("stCancelled")}
                </button>
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
