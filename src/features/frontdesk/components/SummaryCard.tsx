import { useMemo } from "react";
import { Activity, Timer } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { padToken } from "../utils";
import { useT } from "../i18n/i18n";

type Props = { visits: TodayVisit[] };

export function SummaryCard({ visits }: Props) {
    const t = useT();
    const { currentToken, servingName, avgWait } = useMemo(() => {
        const active = visits
            .filter((v) => v.status === "serving")
            .sort(
                (a, b) =>
                    new Date(b.started_at ?? b.created_at).getTime() -
                    new Date(a.started_at ?? a.created_at).getTime()
            );
        const currentToken = active.length ? `#${padToken(active[0].token_number)}` : "—";
        const servingName = active.length ? active[0].patient_name : null;

        const waiting = visits.filter((v) => v.status === "waiting");
        let avgWait = "—";
        if (waiting.length) {
            const ms =
                waiting.reduce((s, v) => s + (Date.now() - new Date(v.created_at).getTime()), 0) / waiting.length;
            avgWait = `${Math.max(0, Math.round(ms / 60000))} ${t("min")}`;
        }
        return { currentToken, servingName, avgWait };
    }, [visits, t]);

    const tokenAsleep = currentToken === "—";
    const waitDash = avgWait === "—";

    return (
        <div className="relative mb-3 overflow-hidden rounded-[13px] border border-[#e4e7ee] bg-white p-4 pt-[18px] shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
            <h3 className="m-0 mb-3 flex items-center gap-[7px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#837bb2]">
                <Activity size={13} className="opacity-70" />
                {t("sumTitle")}
            </h3>

            {/* Now Serving — the sidebar's ink moment (§10.3): the day's current
                moment formally framed, echoing Cortex's dark letterhead. */}
            <div
                className="relative overflow-hidden rounded-[11px] p-[13px_14px]"
                style={{
                    background:
                        "radial-gradient(ellipse 200px 110px at 80% -20%, rgba(244,114,182,0.12), transparent 65%)," +
                        "linear-gradient(135deg, #0d1b35 0%, #120f28 38%, #170d27 62%, #0b1525 100%)",
                }}
            >
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                    style={{
                        background: "linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)",
                        boxShadow: "0 1px 10px rgba(168,85,247,0.45), 0 2px 20px rgba(244,114,182,0.18)",
                    }}
                />
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#b9b4d6]">{t("currentToken")}</div>
                <div
                    className={`mt-[2px] font-[Manrope,sans-serif] text-[26px] font-extrabold leading-[1.1] tracking-[-0.01em] tabular-nums ${
                        tokenAsleep ? "text-white/35" : "text-white"
                    }`}
                >
                    {currentToken}
                </div>
                {servingName && <div className="mt-[2px] truncate text-[11.5px] font-medium text-[#c7d2fe]">{servingName}</div>}
            </div>

            <div className="flex items-center justify-between pt-[11px]">
                <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#5a6472]">
                    <span className="text-[#8a91a0]"><Timer size={14} /></span>
                    {t("avgWait")}
                </div>
                <div
                    className={`font-[Manrope,sans-serif] text-[15px] font-extrabold tabular-nums ${
                        waitDash ? "text-[#a8aeba]" : "text-[#161d29]"
                    }`}
                >
                    {avgWait}
                </div>
            </div>
        </div>
    );
}
