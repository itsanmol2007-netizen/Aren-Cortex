import { ArrowUp, Clock, Stethoscope, CheckCheck, Inbox } from "lucide-react";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";
import { DawnArcs } from "./DawnArcs";

// The three-part empty-state system (§7). One motif (dawn arcs), re-hued;
// per-tab empties stay quiet and small so they don't perform mid-work.

function greetingKey(): StringKey {
    const h = new Date().getHours();
    if (h < 12) return "greetingMorning";
    if (h < 17) return "greetingAfternoon";
    return "greetingEvening";
}

// §7.1 — queue empty AND zero visits today. The one place the morning moment
// lives; the stats/sidebar stay structurally normal (muted zeros).
export function MorningWelcome() {
    const t = useT();
    return (
        <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-[72px] text-center max-[820px]:py-[48px]">
            {/* Static dawn halo (§8): the arcs sit in light, not on blank white. */}
            <div className="relative">
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[120px] w-[220px] -translate-x-1/2 -translate-y-1/2"
                    style={{ background: "radial-gradient(closest-side, rgba(240,171,200,0.16), transparent)" }}
                />
                <DawnArcs variant="morning" className="relative" />
            </div>
            <h3 className="m-0 mt-1 font-[Manrope,sans-serif] text-[24px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[#161d29]">
                {t(greetingKey())}
            </h3>
            <p className="m-0 flex items-center gap-[7px] text-[14px] font-[450] text-[#5a6472]">
                {t("emptyMorningBody")}
                <ArrowUp size={15} className="shrink-0 text-[#a8aeba]" />
            </p>
        </div>
    );
}

// §7.2 — a filter is empty while the day is alive. Quiet: one 20px line icon
// in faint gray plus one line of copy. No illustration, no color, no motion.
const TAB_ICON = {
    waiting: Clock,
    serving: Stethoscope,
    completed: CheckCheck,
    generic: Inbox,
} as const;

const TAB_COPY: Record<keyof typeof TAB_ICON, StringKey> = {
    waiting: "emptyTabWaiting",
    serving: "emptyTabConsult",
    completed: "emptyTabCompleted",
    generic: "emptyGeneric",
};

export function TabEmpty({ kind }: { kind: keyof typeof TAB_ICON }) {
    const t = useT();
    const Icon = TAB_ICON[kind];
    return (
        <div className="flex flex-col items-center gap-[10px] px-5 py-10 text-center">
            <Icon size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
            <p className="m-0 text-[13.5px] font-medium text-[#a8aeba]">{t(TAB_COPY[kind])}</p>
        </div>
    );
}

// §7.3 — every visit completed/cancelled, viewing All. A small satisfied
// sign-off, not a celebration. Entrance fade only.
export function DayDone() {
    const t = useT();
    return (
        <div className="aren-rise flex flex-col items-center gap-[8px] border-t border-[#eef0f5] px-5 py-[38px] text-center">
            <div className="relative">
                <div
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[120px] w-[220px] -translate-x-1/2 -translate-y-1/2"
                    style={{ background: "radial-gradient(closest-side, rgba(28,138,77,0.10), transparent)" }}
                />
                <DawnArcs variant="endOfDay" className="relative" />
            </div>
            <h3 className="m-0 mt-1 font-[Manrope,sans-serif] text-[18px] font-bold leading-[1.2] tracking-[-0.01em] text-[#161d29]">
                {t("dayDoneTitle")}
            </h3>
            <p className="m-0 text-[13.5px] font-[450] text-[#5a6472]">{t("dayDoneBody")}</p>
        </div>
    );
}
