import { useMemo, useState } from "react";
import type { QueueTab, TodayVisit } from "../types/frontdesk";
import { VisitRow } from "./VisitRow";
import { MorningWelcome, TabEmpty, DayDone } from "./EmptyStates";
import { useT } from "../i18n/i18n";
import type { StringKey } from "../i18n/strings";

type Props = {
    visits: TodayVisit[];
    now: Date;
    loading: boolean;
    onOpen: (visit: TodayVisit) => void;
    onComplete: (visit: TodayVisit) => void;
    onCancel: (visit: TodayVisit) => void;
    selectedVisitId?: string | null;
};

const ORDER: Record<string, number> = { waiting: 0, serving: 1, completed: 2, discarded: 3, referred: 3 };

// tab → empty-state icon kind (§7.2)
const TAB_KIND: Record<QueueTab, "waiting" | "serving" | "completed" | "generic"> = {
    all: "generic",
    waiting: "waiting",
    serving: "serving",
    completed: "completed",
};

export function QueuePanel({ visits, now, loading, onOpen, onComplete, onCancel, selectedVisitId }: Props) {
    const t = useT();
    const [tab, setTab] = useState<QueueTab>("all");

    const counts = useMemo(
        () => ({
            all: visits.filter((v) => v.status !== "discarded").length,
            waiting: visits.filter((v) => v.status === "waiting").length,
            serving: visits.filter((v) => v.status === "serving").length,
            completed: visits.filter((v) => v.status === "completed").length,
        }),
        [visits]
    );

    const rows = useMemo(() => {
        const list = tab === "all" ? visits.filter((v) => v.status !== "discarded") : visits.filter((v) => v.status === tab);
        return [...list].sort((a, b) => {
            const byStatus = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
            if (byStatus !== 0) return byStatus;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
    }, [visits, tab]);

    // Day-arc state (§7): morning = no visits at all today; end-of-day = there
    // are visits but nothing is still waiting or in consultation.
    const hasVisitsToday = visits.length > 0;
    const everyoneDone = hasVisitsToday && counts.waiting === 0 && counts.serving === 0;

    return (
        <div className="relative h-full min-h-0 overflow-hidden rounded-[13px] border border-[#e4e7ee] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)]">
            {/* The dawn thread, paper weight (§3.2): 55% opacity, no glow. The
                queue is the flagship surface — the thread marks it as AREN's. */}
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
                style={{ background: "linear-gradient(90deg, #f2a986 0%, #f472b6 32%, #a855f7 68%, #6366f1 100%)", opacity: 0.55 }}
            />
            {/* div, not h2 — Cortex's unlayered legacy CSS restyles raw heading
                elements and silently beats Tailwind here (§13 layer trap). */}
            <div className="flex items-center justify-between px-5 pt-[15px]">
                <div role="heading" aria-level={2} className="font-[Manrope,sans-serif] text-[16px] font-extrabold text-[#161d29]">{t("queueTitle")}</div>
            </div>

            <div className="flex flex-wrap gap-[6px] px-5 py-[13px]">
                <Tab active={tab === "all"} onClick={() => setTab("all")} labelKey="tabAll" count={counts.all} t={t} />
                <Tab active={tab === "waiting"} onClick={() => setTab("waiting")} labelKey="tabWaiting" dot="#c9791a" count={counts.waiting} t={t} />
                <Tab active={tab === "serving"} onClick={() => setTab("serving")} labelKey="tabConsult" dot="#2f6bed" count={counts.serving} t={t} />
                <Tab active={tab === "completed"} onClick={() => setTab("completed")} labelKey="tabCompleted" dot="#1c8a4d" count={counts.completed} t={t} />
            </div>

            {loading ? (
                <SkeletonRows />
            ) : rows.length === 0 ? (
                !hasVisitsToday ? (
                    tab === "all" ? <MorningWelcome /> : <TabEmpty kind={TAB_KIND[tab]} />
                ) : tab === "all" && everyoneDone ? (
                    <DayDone />
                ) : (
                    <TabEmpty kind={TAB_KIND[tab]} />
                )
            ) : (
                <>
                    {/* Nested scroll (V3): the queue scrolls inside its own panel
                        instead of growing the page as the day fills up. Column
                        headers stay pinned to the top of the scroll area. */}
                    <div
                        role="listbox"
                        aria-label={t("queueTitle")}
                        className="overflow-y-auto overscroll-contain"
                        style={{ maxHeight: "clamp(260px, calc(100vh - 380px), 640px)" }}
                    >
                        <ColumnHeaders t={t} />
                        {rows.map((v) => (
                            <VisitRow
                                key={v.visit_id}
                                visit={v}
                                now={now}
                                selected={selectedVisitId === v.visit_id}
                                onOpen={onOpen}
                                onComplete={onComplete}
                                onCancel={onCancel}
                            />
                        ))}
                        {tab === "all" && everyoneDone && <DayDone />}
                    </div>
                    <div className="border-t border-[#eef0f5] px-5 py-[9px] text-[11.5px] font-medium text-[#8a91a0]">
                        {t("showingCount", { n: rows.length })}
                    </div>
                </>
            )}
        </div>
    );
}

// Table headers, image-style: quiet uppercase micro-labels that pin to the
// top of the scroll area. Grid template mirrors VisitRow exactly.
function ColumnHeaders({ t }: { t: (k: StringKey) => string }) {
    const th = "text-[10px] font-bold uppercase tracking-[0.08em] text-[#a3aab8]";
    return (
        <div className="sticky top-0 z-10 grid grid-cols-[64px_1.7fr_1.4fr_0.9fr_0.8fr_148px_34px] max-lg:grid-cols-[56px_1.5fr_0.9fr_132px_34px] items-center gap-3 border-b border-[#eef0f5] bg-white pl-[23px] pr-5 pb-[7px] pt-[3px]">
            <span className={th}>{t("colToken")}</span>
            <span className={th}>{t("colPatient")}</span>
            <span className={`${th} max-lg:hidden`}>{t("colSymptoms")}</span>
            <span className={th}>{t("colDoctor")}</span>
            <span className={`${th} max-lg:hidden`}>{t("colTime")}</span>
            <span className={th}>{t("colStatus")}</span>
            <span />
        </div>
    );
}

function Tab({
    active,
    onClick,
    labelKey,
    count,
    dot,
    t,
}: {
    active: boolean;
    onClick: () => void;
    labelKey: StringKey;
    count: number;
    dot?: string;
    t: (k: StringKey) => string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex h-[34px] items-center gap-[7px] rounded-lg border px-[13px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] ${active ? "border-[#2f6bed] bg-[rgba(47,107,237,0.055)] text-[#1d51c9]" : "border-[#e4e7ee] bg-white text-[#5a6472] hover:border-[#d5dae4]"
                }`}
        >
            {dot && <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: dot }} />}
            {t(labelKey)}
            <span className={active ? "font-semibold text-[#1d51c9]" : "font-semibold text-[#a8aeba]"}>({count})</span>
        </button>
    );
}

function SkeletonRows() {
    return (
        <div>
            {Array.from({ length: 5 }).map((_, i) => (
                <div
                    key={i}
                    className="grid grid-cols-[64px_1.7fr_1.4fr_0.9fr_0.8fr_148px_34px] items-center gap-3 border-t border-[#eef0f5] px-5 py-[14px]"
                >
                    <div className="h-8 animate-pulse rounded-md bg-[linear-gradient(90deg,#eef0f4_25%,#e4e7ee_37%,#eef0f4_63%)]" />
                    <div>
                        <div className="h-3 w-[70%] animate-pulse rounded-md bg-[#eef0f4]" />
                        <div className="mt-[6px] h-3 w-[50%] animate-pulse rounded-md bg-[#eef0f4]" />
                    </div>
                    <div className="h-3 w-[90%] animate-pulse rounded-md bg-[#eef0f4]" />
                    <div className="h-3 w-[70%] animate-pulse rounded-md bg-[#eef0f4]" />
                    <div className="h-3 w-[50%] animate-pulse rounded-md bg-[#eef0f4]" />
                    <div className="h-3 w-[70%] animate-pulse rounded-md bg-[#eef0f4]" />
                    <div />
                </div>
            ))}
        </div>
    );
}
