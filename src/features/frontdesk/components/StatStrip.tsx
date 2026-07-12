import { useMemo } from "react";
import { Users, Clock, ClipboardCheck, CheckCircle2 } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";

type Props = { visits: TodayVisit[] };

export function StatStrip({ visits }: Props) {
    const t = useT();
    const stats = useMemo(() => {
        const total = visits.filter((v) => v.status !== "discarded").length;
        const waiting = visits.filter((v) => v.status === "waiting").length;
        const serving = visits.filter((v) => v.status === "serving").length;
        const completed = visits.filter((v) => v.status === "completed").length;
        return { total, waiting, serving, completed };
    }, [visits]);

    return (
        <div className="mb-[14px] grid grid-cols-4 gap-3 max-[1040px]:grid-cols-2">
            <StatCard icon={<Users size={20} />} tone="neutral" labelKey="statTotal" value={stats.total} t={t} />
            <StatCard icon={<Clock size={20} />} tone="amber" labelKey="statWaiting" value={stats.waiting} t={t} />
            <StatCard icon={<ClipboardCheck size={20} />} tone="blue" labelKey="statConsult" value={stats.serving} t={t} />
            <StatCard icon={<CheckCircle2 size={20} />} tone="green" labelKey="statCompleted" value={stats.completed} t={t} />
        </div>
    );
}

const TONE = {
    neutral: { bg: "bg-[#eef0f5]", text: "text-[#5a6472]", num: "text-[#161d29]" },
    amber: { bg: "bg-[#fbeed9]", text: "text-[#c9791a]", num: "text-[#c9791a]" },
    blue: { bg: "bg-[#e9f0fe]", text: "text-[#1d51c9]", num: "text-[#1d51c9]" },
    green: { bg: "bg-[#e4f5eb]", text: "text-[#1c8a4d]", num: "text-[#1c8a4d]" },
} as const;

function StatCard({
    icon,
    tone,
    labelKey,
    value,
    t,
}: {
    icon: React.ReactNode;
    tone: keyof typeof TONE;
    labelKey: StringKey;
    value: number;
    t: (k: StringKey) => string;
}) {
    const tn = TONE[tone];
    // Zero rule (§4.4): a value of 0 renders in muted neutral so the empty
    // morning never looks broken. The icon chip keeps its tint (room is ready,
    // the number is asleep); ≥1 takes its semantic color.
    const numClass = value === 0 ? "text-[#a8aeba]" : tn.num;
    return (
        <div className="relative flex items-center gap-[13px] overflow-hidden rounded-[13px] border border-[#e4e7ee] bg-white p-[15px_17px] shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            {/* glass-edge top highlight (§5) — unifies every surface */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
            <svg
                width="72"
                height="72"
                viewBox="0 0 72 72"
                fill="none"
                className="pointer-events-none absolute -bottom-3 -right-3 opacity-[0.05]"
            >
                <circle cx="36" cy="36" r="34" stroke="currentColor" strokeWidth="4" className={tn.text} />
            </svg>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${tn.bg} ${tn.text}`}>{icon}</div>
            <div className="relative">
                {/* Micro-label format (§4), but neutral gray — a violet label next
                    to a semantic numeral would mix vocabularies. */}
                <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8a91a0]">{t(labelKey)}</div>
                <div className={`font-[Manrope,sans-serif] text-[28px] font-extrabold leading-[1.1] tracking-[-0.01em] ${numClass}`}>
                    {value}
                </div>
            </div>
        </div>
    );
}
