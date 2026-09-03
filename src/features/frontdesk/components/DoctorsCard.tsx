import { useMemo } from "react";
import { Stethoscope } from "lucide-react";
import type { DBDoctor } from "@/lib/db";
import type { TodayVisit } from "../types/frontdesk";
import { initials, padToken, timeAgo } from "../utils";
import { useT } from "../i18n/i18n";

type Props = { doctors: DBDoctor[]; visits: TodayVisit[]; now: Date };

// Presence, not assumption. A doctor is only "online" if their app has checked
// in recently (the `last_seen` heartbeat — see docs/Supabase Wiring TODO.md).
// Until that column + the doctor-side heartbeat exist, `last_seen` is absent and
// everyone reads as offline rather than the old, dishonest always-online. A
// doctor actively seeing a patient ("busy") is real today and always wins.
type Presence = "busy" | "online" | "away" | "offline";

const PRESENCE_STYLE: Record<Presence, { dot: string; ring: string; text: string; avatarBg: string; avatarText: string }> = {
    busy: { dot: "#2f6bed", ring: "rgba(47,107,237,0.30)", text: "#1d51c9", avatarBg: "#e9f0fe", avatarText: "#1d51c9" },
    online: { dot: "#1c8a4d", ring: "rgba(28,138,77,0.32)", text: "#1c7a45", avatarBg: "#e6f5ec", avatarText: "#1c7a45" },
    away: { dot: "#c9791a", ring: "rgba(201,121,26,0.32)", text: "#b06f14", avatarBg: "#fbeed9", avatarText: "#b06f14" },
    offline: { dot: "#c4c9d3", ring: "transparent", text: "#a8aeba", avatarBg: "#eef0f5", avatarText: "#a8aeba" },
};

function presenceFromLastSeen(lastSeen: string | null | undefined, now: number): Presence {
    if (!lastSeen) return "offline";
    const diff = now - new Date(lastSeen).getTime();
    if (Number.isNaN(diff)) return "offline";
    if (diff < 3 * 60_000) return "online";
    if (diff < 15 * 60_000) return "away";
    return "offline";
}

export function DoctorsCard({ doctors, visits, now }: Props) {
    const t = useT();
    const nowMs = now.getTime();
    const rows = useMemo(
        () =>
            doctors.map((d) => {
                const withVisit = visits.find((v) => v.assigned_doctor_id === d.id && v.status === "serving");
                const queueCount = visits.filter((v) => v.assigned_doctor_id === d.id && v.status === "waiting").length;
                const presence: Presence = withVisit ? "busy" : presenceFromLastSeen(d.last_seen, nowMs);
                return { doctor: d, presence, withVisit, queueCount };
            }),
        [doctors, visits, nowMs]
    );

    return (
        <div className="relative shrink-0 p-[16px]">
            <h3 className="m-0 mb-[8px] flex items-center gap-[6px] text-[13.5px] font-bold text-[#161d29]">
                <Stethoscope size={14} className="text-[#7c5cf0]" />
                {t("doctorsTitle")}
            </h3>
            {rows.length === 0 && <p className="m-0 text-[11.5px] text-[#a8aeba]">{t("noDoctors")}</p>}
            {rows.map(({ doctor, presence, withVisit, queueCount }, i) => {
                const s = PRESENCE_STYLE[presence];
                const label =
                    presence === "busy"
                        ? t("docBusy", { t: padToken(withVisit!.token_number) })
                        : presence === "online"
                            ? t("docOnline")
                            : presence === "away"
                                ? (doctor.last_seen ? t("docLastSeen", { t: timeAgo(doctor.last_seen) }) : t("docAway"))
                                : t("docOffline");
                return (
                    <div key={doctor.id} className={`flex items-center gap-[10px] py-[10px] ${i === 0 ? "" : "border-t border-[#f0f1f5]"}`}>
                        <div className="relative shrink-0">
                            <div
                                className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-[10px] text-[11.5px] font-bold ring-2 ring-offset-0"
                                style={{ background: s.avatarBg, color: s.avatarText, boxShadow: `0 0 0 2px ${s.ring}` }}
                            >
                                {doctor.avatar_url ? (
                                    <img src={doctor.avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    initials(doctor.name)
                                )}
                            </div>
                            <span
                                className="absolute -bottom-[1px] -right-[1px] h-[8px] w-[8px] rounded-full border-2 border-white"
                                style={{ background: s.dot }}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-semibold text-[#161d29]">{doctor.name}</div>
                            <div className="mt-[1px] truncate text-[10.5px]" style={{ color: s.text }}>
                                {label}
                            </div>
                        </div>
                        <div className="shrink-0 text-right">
                            <b className={`block font-[Manrope,sans-serif] text-[14px] leading-[1.1] tabular-nums ${presence === "offline" ? "text-[#a8aeba]" : "text-[#161d29]"}`}>
                                {queueCount}
                            </b>
                            <span className="text-[9px] text-[#a8aeba]">{t("queueLabel")}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
