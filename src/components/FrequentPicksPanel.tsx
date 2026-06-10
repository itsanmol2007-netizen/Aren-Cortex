import { Heart, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { FrequentPick } from "../lib/db";

interface Props {
    picks: FrequentPick[];
    loading: boolean;
    addedCompositionIds: number[];
    onAdd: (pick: FrequentPick) => void;
    favouritePicks: FrequentPick[];
}

type Tab = "frequent" | "favourites";

function SkeletonRows() {
    return (
        <div className="flex flex-col gap-1 p-1.5">
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg animate-pulse"
                    style={{ animationDelay: `${i * 120}ms` }}
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-200 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 flex flex-col gap-1.5">
                        <div className="h-3 w-3/4 rounded bg-slate-100" />
                        <div className="h-2 w-1/2 rounded bg-slate-100" />
                    </div>
                    <div className="w-6 h-6 rounded-md bg-slate-100 flex-shrink-0" />
                </div>
            ))}
        </div>
    );
}

function EmptyState({ tab }: { tab: Tab }) {
    const isFav = tab === "favourites";
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center">
            <div className={`w-9 h-9 rounded-xl grid place-items-center opacity-30 ${isFav ? "bg-pink-50 text-pink-400" : "bg-purple-50 text-purple-400"}`}>
                {isFav ? <Heart size={18} /> : <Sparkles size={18} />}
            </div>
            <p className="text-[12px] font-semibold text-slate-500 m-0">
                {isFav ? "No favourites saved yet" : "No suggestions yet"}
            </p>
            <p className="text-[10.5px] text-slate-400 m-0 leading-relaxed max-w-[160px]">
                {isFav
                    ? "Heart a medicine in the ranked list to save it here"
                    : "Select symptoms to see context-aware picks"}
            </p>
        </div>
    );
}

function PickRow({
    pick,
    alreadyAdded,
    isFavTab,
    onAdd,
}: {
    pick: FrequentPick;
    alreadyAdded: boolean;
    isFavTab: boolean;
    onAdd: () => void;
}) {
    return (
        <div
            className={`flex items-start gap-2 px-2 py-2 rounded-lg border-[0.5px] transition-all duration-100 ${alreadyAdded
                    ? "opacity-35 pointer-events-none border-transparent"
                    : isFavTab
                        ? "border-transparent hover:bg-pink-50/60 hover:border-pink-200/50 cursor-pointer"
                        : "border-transparent hover:bg-purple-50/50 hover:border-purple-200/40 cursor-pointer"
                }`}
            onClick={!alreadyAdded ? onAdd : undefined}
        >
            {isFavTab && (
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 self-start mt-[5px] bg-pink-300" />
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                {!isFavTab && pick.hint_label && (
                    <span className="inline-block text-[9px] font-[800] uppercase tracking-[0.07em] text-violet-700 bg-violet-50 border border-violet-200/60 rounded px-1.5 py-px w-fit mb-0.5">
                        {pick.hint_label}
                    </span>
                )}
                <span className="text-[12.5px] font-[700] text-slate-800 truncate leading-tight">
                    {pick.medicine_name}
                </span>
                <span className="text-[10.5px] text-slate-400 truncate">
                    {pick.composition_name}
                </span>
                {!isFavTab && pick.clinical_reason && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug m-0 opacity-80">
                        {pick.clinical_reason}
                    </p>
                )}
            </div>
            {alreadyAdded ? (
                <span className="text-[13px] text-emerald-500 font-bold w-6 text-center flex-shrink-0 mt-0.5">✓</span>
            ) : (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    aria-label={`Add ${pick.medicine_name}`}
                    className={`w-6 h-6 rounded-[7px] border-[0.5px] grid place-items-center flex-shrink-0 transition-all duration-100 cursor-pointer mt-0.5 ${isFavTab
                            ? "border-pink-200 bg-pink-50/60 text-pink-500 hover:bg-pink-100 hover:border-pink-300 hover:scale-110"
                            : "border-purple-200 bg-purple-50/60 text-purple-600 hover:bg-purple-100 hover:border-purple-300 hover:scale-110"
                        }`}
                >
                    <Plus size={13} />
                </button>
            )}
        </div>
    );
}

export function FrequentPicksPanel({
    picks,
    loading,
    addedCompositionIds,
    onAdd,
    favouritePicks,
}: Props) {
    const [tab, setTab] = useState<Tab>("frequent");
    const isFav = tab === "favourites";
    const activePicks = isFav ? favouritePicks : picks;

    // Alt+M toggles between Frequent and Favourites
    useEffect(() => {
        const handler = () => {
            setTab((current) => current === "frequent" ? "favourites" : "frequent");
        };
        window.addEventListener("aren:toggle-favourites", handler);
        return () => window.removeEventListener("aren:toggle-favourites", handler);
    }, []);

    return (
        <div
            className="flex flex-col overflow-hidden frequent-picks-panel"
            style={{
                background: "var(--surface)",
                border: "1px solid rgba(168,85,247,0.13)",
                borderRadius: "var(--radius)",
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-3 py-2 flex-shrink-0"
                style={{ borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}
            >
                <span
                    className="text-[10px] font-[750] uppercase tracking-[0.06em]"
                    style={{
                        color: isFav ? "#be185d" : "#7c3aed",
                        transition: "color 0.2s",
                    }}
                >
                    {isFav ? "Saved" : "Suggested"}
                </span>

                {/* Sliding pill toggle */}
                <div
                    className="relative flex items-center rounded-full p-[2px]"
                    style={{ background: "rgba(241,245,249,0.9)", height: 26 }}
                >
                    <div
                        className="absolute top-[2px] bottom-[2px] rounded-full"
                        style={{
                            background: "white",
                            border: isFav
                                ? "0.5px solid rgba(236,72,153,0.25)"
                                : "0.5px solid rgba(124,58,237,0.2)",
                            left: isFav ? "calc(50% + 1px)" : "2px",
                            right: isFav ? "2px" : "calc(50% + 1px)",
                            transition: "left 0.22s cubic-bezier(0.4,0,0.2,1), right 0.22s cubic-bezier(0.4,0,0.2,1), border-color 0.22s",
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setTab("frequent")}
                        className="relative z-10 flex items-center gap-1 px-2.5 rounded-full border-0 bg-transparent cursor-pointer transition-colors duration-150"
                        style={{ fontSize: 11, fontWeight: 600, height: 22, color: !isFav ? "#7c3aed" : "#94a3b8" }}
                    >
                        <Sparkles size={9} />
                        Frequent
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("favourites")}
                        className="relative z-10 flex items-center gap-1 px-2.5 rounded-full border-0 bg-transparent cursor-pointer transition-colors duration-150"
                        style={{ fontSize: 11, fontWeight: 600, height: 22, color: isFav ? "#be185d" : "#94a3b8" }}
                    >
                        <Heart size={9} />
                        Favourites
                    </button>
                </div>
            </div>

            {/* Body */}
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden"
                style={{
                    maxHeight: 380,
                    scrollbarWidth: "thin",
                    scrollbarColor: isFav
                        ? "rgba(236,72,153,0.15) transparent"
                        : "rgba(168,85,247,0.14) transparent",
                    WebkitMaskImage: "linear-gradient(to bottom, black 88%, transparent 100%)",
                    maskImage: "linear-gradient(to bottom, black 88%, transparent 100%)",
                }}
            >
                {loading && !isFav ? (
                    <SkeletonRows />
                ) : activePicks.length === 0 ? (
                    <EmptyState tab={tab} />
                ) : (
                    <div className="flex flex-col gap-px p-1.5">
                        {activePicks.map((pick) => (
                            <PickRow
                                key={`${pick.composition_id}-${pick.medicine_id}`}
                                pick={pick}
                                alreadyAdded={addedCompositionIds.includes(pick.composition_id)}
                                isFavTab={isFav}
                                onAdd={() => onAdd(pick)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}