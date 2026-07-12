import { useMemo } from "react";
import { Stethoscope } from "lucide-react";
import type { DBDoctor } from "@/lib/db";
import type { DoctorActivity, TodayVisit } from "../types/frontdesk";
import { initials, padToken } from "../utils";
import { useT } from "../i18n/i18n";

type Props = { doctors: DBDoctor[]; visits: TodayVisit[] };

export function DoctorsCard({ doctors, visits }: Props) {
    const t = useT();
    const rows = useMemo(
        () =>
            doctors.map((d) => {
                const withVisit = visits.find((v) => v.assigned_doctor_id === d.id && v.status === "serving");
                const queueCount = visits.filter((v) => v.assigned_doctor_id === d.id && v.status === "waiting").length;
                const offDuty = d.availability_status != null && d.availability_status !== "active";
                const activity: DoctorActivity = offDuty ? "off" : withVisit ? "busy" : "free";
                return { doctor: d, activity, withVisit, queueCount };
            }),
        [doctors, visits]
    );

    return (
        <div className="relative mb-3 overflow-hidden rounded-[13px] border border-[#e4e7ee] bg-white p-4 pt-[18px] shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
            <h3 className="m-0 mb-3 flex items-center gap-[7px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">
                <Stethoscope size={13} className="opacity-70" />
                {t("doctorsTitle")}
            </h3>
            {rows.length === 0 && <p className="m-0 text-[12px] text-[#a8aeba]">{t("noDoctors")}</p>}
            {rows.map(({ doctor, activity, withVisit, queueCount }, i) => (
                <div key={doctor.id} className={`flex items-center gap-[11px] py-[10px] ${i === 0 ? "" : "border-t border-[#eef0f5]"}`}>
                    <div className="relative shrink-0">
                        <div
                            className={`flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-bold ring-2 ring-offset-0 ${activity === "busy"
                                    ? "bg-[#e9f0fe] text-[#1d51c9] ring-[rgba(47,107,237,0.3)]"
                                    : activity === "free"
                                        ? "bg-[#eef0f5] text-[#5a6472] ring-[rgba(28,138,77,0.3)]"
                                        : "bg-[#eef0f5] text-[#a8aeba] ring-transparent"
                                }`}
                        >
                            {doctor.avatar_url ? (
                                <img src={doctor.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                initials(doctor.name)
                            )}
                        </div>
                        <span
                            className={`absolute -bottom-[1px] -right-[1px] h-[9px] w-[9px] rounded-full border-2 border-white ${activity === "busy" ? "bg-[#2f6bed]" : activity === "free" ? "bg-[#1c8a4d]" : "bg-[#a8aeba]"
                                }`}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[#161d29]">{doctor.name}</div>
                        <div
                            className={`mt-[1px] text-[11.5px] ${activity === "busy" ? "text-[#1d51c9]" : activity === "free" ? "text-[#1c8a4d]" : "text-[#a8aeba]"
                                }`}
                        >
                            {activity === "busy" ? t("docBusy", { t: padToken(withVisit!.token_number) }) : activity === "free" ? t("docFree") : t("docOff")}
                        </div>
                    </div>
                    <div className="shrink-0 text-right">
                        <b className={`block font-[Manrope,sans-serif] text-[15px] leading-[1.1] tabular-nums ${activity === "off" ? "text-[#a8aeba]" : "text-[#161d29]"}`}>
                            {queueCount}
                        </b>
                        <span className="text-[10px] text-[#a8aeba]">{t("queueLabel")}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
