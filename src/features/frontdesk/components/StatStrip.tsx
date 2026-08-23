import { useMemo } from "react";
import { Users, Clock, ClipboardCheck, BadgeCheck } from "lucide-react";
import type { TodayVisit } from "../types/frontdesk";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";

type Props = { visits: TodayVisit[] };

// Stat cards, compact treatment: a single horizontal row — tinted icon chip,
// sentence-case label, and the big Manrope numeral pushed to the right edge.
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
        <div className="mb-[10px] grid grid-cols-4 gap-[10px] max-[1040px]:grid-cols-2">
            <StatCard icon={<Users size={16} />} tone="indigo" labelKey="statTotal" value={stats.total} t={t} />
            <StatCard icon={<Clock size={16} />} tone="amber" labelKey="statWaiting" value={stats.waiting} t={t} />
            <StatCard icon={<ClipboardCheck size={16} />} tone="blue" labelKey="statConsult" value={stats.serving} t={t} />
            <StatCard icon={<BadgeCheck size={16} />} tone="green" labelKey="statCompleted" value={stats.completed} t={t} />
        </div>
    );
}

const TONE = {
    // indigo decorates only the icon chip (brand aura, not data); the Today
    // numeral itself stays ink and the subline neutral.
    indigo: { bg: "#eceafc", glow: "rgba(99,102,241,0.18)", icon: "text-[#4f46e5]", num: "text-[#161d29]", sub: "text-[#8a91a0]" },
    amber: { bg: "#fdf1de", glow: "rgba(201,121,26,0.18)", icon: "text-[#c9791a]", num: "text-[#c9791a]", sub: "text-[#c9791a]" },
    blue: { bg: "#e9f0fe", glow: "rgba(47,107,237,0.18)", icon: "text-[#1d51c9]", num: "text-[#1d51c9]", sub: "text-[#2f6bed]" },
    green: { bg: "#e4f5eb", glow: "rgba(28,138,77,0.16)", icon: "text-[#1c8a4d]", num: "text-[#1c8a4d]", sub: "text-[#1c8a4d]" },
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
    const asleep = value === 0;
    return (
        <div className="relative overflow-hidden rounded-[12px] border border-[#e7e9f0] bg-white px-[12px] py-[9px] shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
            {/* Single horizontal row: icon chip · label · number pushed right. */}
            <div className="flex items-center gap-[9px]">
                {/* Flat tinted chip with one soft tone-colored shadow — enough
                    lift to not look pasted-on, without the busy multi-layer
                    gradient treatment that read as messy at this size. */}
                <div
                    className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${tn.icon}`}
                    style={{ background: tn.bg, boxShadow: `0 2px 6px -2px ${tn.glow}` }}
                >
                    {icon}
                </div>
                <div className="min-w-0 truncate text-[11.5px] font-medium text-[#5a6472]">{t(labelKey)}</div>
                <div className={`ml-auto pl-2 font-[Manrope,sans-serif] text-[21px] font-extrabold leading-[1.05] tracking-[-0.01em] ${asleep ? "text-[#a8aeba]" : tn.num}`}>
                    {value}
                </div>
            </div>
        </div>
    );
}
