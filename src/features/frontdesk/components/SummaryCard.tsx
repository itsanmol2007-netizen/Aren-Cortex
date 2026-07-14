import { useMemo } from "react";
import { Activity, Radio, Timer, Hourglass, UsersRound } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { padToken } from "../utils";
import { useT } from "../i18n/i18n";

type Props = { visits: TodayVisit[]; now: Date };

// Today's Summary, V3 treatment: the Current Token sits in a lavender brand
// box (violet marks structure — "where the day is right now"), followed by
// three quiet metric rows. `now` comes from the page's 20s clock so the wait
// figures tick without waiting for a queue refresh.
export function SummaryCard({ visits, now }: Props) {
    const t = useT();
    const { currentToken, servingName, avgWait, longestWait, seen } = useMemo(() => {
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
        const waitsMin = waiting.map((v) => Math.max(0, (now.getTime() - new Date(v.created_at).getTime()) / 60000));
        const avgWait = waitsMin.length ? `${Math.round(waitsMin.reduce((s, m) => s + m, 0) / waitsMin.length)} ${t("min")}` : "—";
        const longestWait = waitsMin.length ? `${Math.round(Math.max(...waitsMin))} ${t("min")}` : "—";
        const seen = visits.filter((v) => v.status === "completed").length;

        return { currentToken, servingName, avgWait, longestWait, seen };
    }, [visits, now, t]);

    const tokenAsleep = currentToken === "—";

    return (
        <div className="relative shrink-0 overflow-hidden rounded-[13px] border border-[#e7e9f0] bg-white p-4 shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="absolute inset-x-0 top-0 h-px bg-white/60" />
            <h3 className="m-0 mb-3 flex items-center gap-[7px] text-[14px] font-bold text-[#161d29]">
                <Activity size={15} className="text-[#7c5cf0]" />
                {t("sumTitle")}
            </h3>

            {/* Current Token — the day's "you are here" marker in the brand's
                lavender (structural violet, not a status color). */}
            <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e9e4fa] bg-[linear-gradient(135deg,#f6f3fe,#f1effc)] px-[14px] py-[11px]">
                <div className="min-w-0">
                    <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8b7fd4]">{t("currentToken")}</div>
                    <div
                        className={`mt-[1px] font-[Manrope,sans-serif] text-[25px] font-extrabold leading-[1.1] tracking-[-0.01em] tabular-nums ${
                            tokenAsleep ? "text-[#b6aee0]" : "text-[#5b3df5]"
                        }`}
                    >
                        {currentToken}
                    </div>
                    {servingName && <div className="mt-[1px] truncate text-[11.5px] font-medium text-[#5a6472]">{servingName}</div>}
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-[0_1px_3px_rgba(91,61,245,0.14)] ${tokenAsleep ? "text-[#c4bce8]" : "text-[#7c5cf0]"}`}>
                    <Radio size={17} />
                </div>
            </div>

            <MetricRow icon={<Timer size={14} />} label={t("avgWait")} value={avgWait} />
            <MetricRow icon={<Hourglass size={14} />} label={t("longestWait")} value={longestWait} />
            <MetricRow icon={<UsersRound size={14} />} label={t("patientsSeen")} value={String(seen)} asleep={seen === 0} last />
        </div>
    );
}

function MetricRow({
    icon,
    label,
    value,
    asleep,
    last,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    asleep?: boolean;
    last?: boolean;
}) {
    const dash = value === "—" || asleep;
    return (
        <div className={`flex items-center justify-between pt-[11px] ${last ? "" : "border-b border-[#f2f3f7] pb-[11px]"}`}>
            <div className="flex items-center gap-[9px] text-[12.5px] font-medium text-[#5a6472]">
                <span className="text-[#a3aab8]">{icon}</span>
                {label}
            </div>
            <div className={`font-[Manrope,sans-serif] text-[14.5px] font-extrabold tabular-nums ${dash ? "text-[#a8aeba]" : "text-[#161d29]"}`}>
                {value}
            </div>
        </div>
    );
}
