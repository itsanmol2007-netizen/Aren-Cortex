import { useMemo } from "react";
import { Users, Hourglass, Stethoscope, CheckCircle2 } from "lucide-react";
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
            {/* Waiting = an hourglass: time passing while someone sits in the
                room, in the app's warm-amber "waiting" family (row tint, tab
                dot). Replaced the Armchair glyph per the 2026-09-03 reference —
                the clock/armchair reads flat at this size, the hourglass reads
                as "still waiting". */}
            <StatCard icon={<Hourglass size={16} />} tone="amber" labelKey="statWaiting" value={stats.waiting} t={t} />
            <StatCard icon={<Stethoscope size={16} />} tone="blue" labelKey="statConsult" value={stats.serving} t={t} />
            <StatCard icon={<CheckCircle2 size={16} />} tone="green" labelKey="statCompleted" value={stats.completed} t={t} />
        </div>
    );
}

// Glass tile, not a flat tint square: a soft two-stop gradient, an inner
// top highlight (the "sheen"), and a colored glow shadow instead of a plain
// drop shadow. Same family of trick as ModalShell's icon tile, scaled down
// for a 30px chip — replaces the single-flat-color treatment that read as
// "clip-art" at this size (Anmol's word for it, live, 2026-08-24).
const TONE = {
    indigo: { from: "#f1effe", to: "#dedbfa", icon: "text-[#5b4fe0]", glow: "rgba(99,102,241,0.32)", num: "text-[#161d29]", sub: "text-[#8a91a0]" },
    amber: { from: "#fff1de", to: "#ffdfb0", icon: "text-[#a05e0c]", glow: "rgba(194,120,15,0.34)", num: "text-[#a05e0c]", sub: "text-[#a05e0c]" },
    blue: { from: "#eef4ff", to: "#d7e6ff", icon: "text-[#1d51c9]", glow: "rgba(47,107,237,0.32)", num: "text-[#1d51c9]", sub: "text-[#2f6bed]" },
    green: { from: "#eafaf1", to: "#cdf1de", icon: "text-[#157a41]", glow: "rgba(28,138,77,0.3)", num: "text-[#1c8a4d]", sub: "text-[#1c8a4d]" },
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
                <div
                    className={`relative flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${tn.icon}`}
                    style={{
                        background: `linear-gradient(155deg, ${tn.from}, ${tn.to})`,
                        boxShadow: `0 3px 10px -2px ${tn.glow}, inset 0 1px 0 rgba(255,255,255,0.65)`,
                    }}
                >
                    {icon}
                    {/* the glass sheen */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.55),transparent_55%)]" />
                </div>
                <div className="min-w-0 truncate text-[11.5px] font-medium text-[#5a6472]">{t(labelKey)}</div>
                <div className={`ml-auto pl-2 font-[Manrope,sans-serif] text-[21px] font-extrabold leading-[1.05] tracking-[-0.01em] ${asleep ? "text-[#a8aeba]" : tn.num}`}>
                    {value}
                </div>
            </div>
        </div>
    );
}
