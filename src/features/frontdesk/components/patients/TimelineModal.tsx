import { History } from "lucide-react";
import type { PatientDirectoryEntry, PatientHistoryVisit } from "@/lib/db";
import { tintFor } from "../../statusStyle";
import { useT } from "../../i18n/i18n";
import { ModalShell } from "../ModalShell";

// The full visit timeline — a pure exploration surface (no editing). Renders
// in the shared Bhor modal shell, slightly wider than the form modals.
// Vertical rhythm is proportional: the gap above each visit scales with the
// real time since the one before it, so bursts cluster and droughts stretch.

type Props = {
    patient: PatientDirectoryEntry;
    visits: PatientHistoryVisit[]; // newest first
    onClose: () => void;
};

export function TimelineModal({ patient, visits, onClose }: Props) {
    const t = useT();
    const firstVisitId = visits.length ? visits[visits.length - 1].visit_id : null;

    return (
        <ModalShell
            eyebrow={t("timelineEyebrow")}
            title={`${t("timelineTitle")} · ${patient.name}`}
            icon={<History size={19} strokeWidth={2.2} />}
            onClose={onClose}
            maxWidth={640}
        >
            <div className="max-h-[56vh] overflow-y-auto overscroll-contain pr-1">
                <div className="relative">
                    {/* one continuous rail behind every dot */}
                    {visits.length > 1 && (
                        <span aria-hidden className="absolute bottom-[18px] left-[7px] top-[14px] w-px bg-[#ece9f6]" />
                    )}
                    {visits.map((v, i) => {
                    const tint = tintFor(v.status);
                    const isFirstEver = v.visit_id === firstVisitId;
                    const d = new Date(v.created_at);
                    const day = d.toLocaleDateString("en-IN", { day: "2-digit" });
                    const monthYear = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
                    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

                    // Proportional breathing room: gap grows with the days since
                    // the previous (newer) visit, capped so a two-year gap doesn't
                    // become a scroll desert.
                    const gapDays = i === 0 ? 0 : (new Date(visits[i - 1].created_at).getTime() - d.getTime()) / 86400000;
                    const marginTop = i === 0 ? 0 : Math.round(6 + Math.min(54, gapDays * 1.2));

                    return (
                        <div key={v.visit_id} className="relative pl-[30px]" style={{ marginTop }}>
                            <span
                                aria-hidden
                                className="absolute left-0 top-[7px] block h-[15px] w-[15px] rounded-full border-[3px] border-white"
                                style={{ background: tint.dotColor, boxShadow: `0 0 0 1.5px ${tint.dotColor}33` }}
                            />

                            <div className="flex items-center gap-3 rounded-[12px] border border-[#eef0f5] bg-[#fcfcfe] px-[14px] py-[10px]">
                                <div className="w-[52px] shrink-0 text-center">
                                    <div className="font-[Manrope,sans-serif] text-[19px] font-extrabold leading-none text-[#161d29] tabular-nums">{day}</div>
                                    <div className="mt-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#8a91a0]">{monthYear}</div>
                                </div>
                                <div className="h-8 w-px shrink-0 bg-[#eef0f5]" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13.5px] font-bold text-[#161d29]">
                                        {isFirstEver ? t("visitFirst") : t("visitFollowUp")}
                                    </div>
                                    <div className="mt-[1px] truncate text-[12px] text-[#8a91a0]">
                                        {v.doctor_name ?? "—"}
                                        <span className="mx-[5px] text-[#c4c9d3]">·</span>
                                        <span className="tabular-nums">{time}</span>
                                    </div>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-[6px] rounded-full px-[10px] py-[4px] text-[11px] font-semibold ${tint.chipBg} ${tint.textClass}`}>
                                    <span className="h-[5px] w-[5px] rounded-full" style={{ background: tint.dotColor }} />
                                    {t(tint.labelKey)}
                                </span>
                            </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ModalShell>
    );
}
