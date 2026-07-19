import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, FileSearch, Printer, Search, SearchX, X } from "lucide-react";
import type { DBDoctor, PrintQueueRx } from "@/lib/db";
import type { PrintLog } from "../../printLog";
import { formatArchiveDate, initials, padToken } from "../../utils";
import { useT } from "../../i18n/i18n";
import { avatarTint } from "../patients/PatientBrowser";

export type PrintTab = "ready" | "printed";

type Props = {
    entries: PrintQueueRx[];
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
    doctors: DBDoctor[];
    printLog: PrintLog;
    selectedId: string | null;
    onSelect: (rx: PrintQueueRx) => void;
};

// The prescription queue (left workspace): find the right document in
// seconds. Two honest tabs — what still needs printing, what just left the
// printer — and a search that quietly widens to the whole archive, because
// patients come back for last month's prescription all the time.
export function PrintQueuePanel({ entries, loading, failed, onRetry, doctors, printLog, selectedId, onSelect }: Props) {
    const t = useT();
    const [tab, setTab] = useState<PrintTab>("ready");
    const [query, setQuery] = useState("");
    const [doctorId, setDoctorId] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const searching = query.trim().length > 0;

    // Ready = not yet printed, Printed = printed. Every prescription lives in
    // exactly one tab — no time window that could silently swallow forgotten,
    // never-printed documents. The tabs describe state, search spans both.
    const { rows, readyCount, printedCount } = useMemo(() => {
        const byDoctor = doctorId ? entries.filter((e) => e.doctor_id === doctorId) : entries;

        const ready = byDoctor.filter((e) => !printLog[e.prescription_id]);
        const printed = byDoctor
            .filter((e) => !!printLog[e.prescription_id])
            .sort((a, b) => (printLog[b.prescription_id]?.last ?? "").localeCompare(printLog[a.prescription_id]?.last ?? ""));

        let rows: PrintQueueRx[];
        if (searching) {
            // Search leaves the tabs behind: it sweeps every loaded
            // prescription, printed or not, any age.
            const q = query.trim().toLowerCase();
            rows = byDoctor.filter(
                (e) =>
                    e.patient_name.toLowerCase().includes(q) ||
                    e.phone.includes(q) ||
                    (e.token_number != null && (String(e.token_number) === q || padToken(e.token_number) === q)) ||
                    (e.prescription_ref ?? "").toLowerCase().includes(q)
            );
        } else {
            rows = tab === "ready" ? ready : printed;
        }
        return { rows, readyCount: ready.length, printedCount: printed.length };
    }, [entries, printLog, doctorId, tab, query, searching]);

    // Selections can arrive from outside the list — a Front Desk deep link, a
    // Patients quick action, the workspace's prescription history. Follow
    // them: flip to the tab that holds the selection and bring it into view,
    // so the list never contradicts the workspace beside it.
    useEffect(() => {
        if (!selectedId) return;
        const entry = entries.find((e) => e.prescription_id === selectedId);
        if (!entry) return;
        setTab(printLog[selectedId] ? "printed" : "ready");
        // Let the tab's rows render before looking for the selected one.
        const raf = requestAnimationFrame(() => {
            listRef.current
                ?.querySelector('[data-rx-row][aria-selected="true"]')
                ?.scrollIntoView({ block: "nearest" });
        });
        return () => cancelAnimationFrame(raf);
        // printLog intentionally omitted: printing shouldn't yank the list to
        // the Printed tab mid-flow — only a new selection moves it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, entries]);

    // Keyboard path mirrors the Patient Browser: ↓ from the search box drops
    // into the list, ↑/↓ walk it, Enter (native button) selects.
    const focusRow = (index: number) => {
        const els = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-rx-row]");
        els?.[Math.max(0, Math.min(index, (els?.length ?? 1) - 1))]?.focus();
    };

    const onListKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const els = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-rx-row]") ?? [])];
        const idx = els.findIndex((el) => el === document.activeElement);
        if (idx === -1) return;
        e.preventDefault();
        if (e.key === "ArrowUp" && idx === 0) { searchRef.current?.focus(); return; }
        focusRow(idx + (e.key === "ArrowDown" ? 1 : -1));
    };

    const empty = !loading && !failed && rows.length === 0;

    return (
        <section
            aria-label={t("printRxTitle")}
            className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-[#e7e9f0] bg-white shadow-[0_1px_2px_rgba(20,30,50,0.05)] max-[1040px]:max-h-[460px]"
        >
            <div className="px-4 pb-3 pt-4">
                <div className="flex h-11 items-center gap-[9px] rounded-[11px] border-[1.5px] border-[#e9e7f4] bg-[#f8f8fd] px-3 transition-[border-color,box-shadow,background-color] duration-150 focus-within:border-[#7c5cf0] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.22)]">
                    <Search size={15.5} className="shrink-0 text-[#8a91a0]" />
                    <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0); } }}
                        placeholder={t("printRxSearchPh")}
                        className="fd-bare"
                        aria-label={t("printRxSearchPh")}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                            aria-label={t("cancel")}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[#a8aeba] transition-colors hover:bg-[#eef0f5] hover:text-[#5a6472]"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                {/* Tabs: the two operational answers. A live search overrides
                    them (rendered dimmer so the state reads honestly). */}
                <div className={`mt-[10px] flex items-center gap-[5px] rounded-[10px] border border-[#eef0f5] bg-[#f8f8fd] p-[3px] ${searching ? "opacity-45" : ""}`} role="tablist">
                    <TabBtn active={!searching && tab === "ready"} onClick={() => { setQuery(""); setTab("ready"); }} count={readyCount} countTone="amber">
                        {t("tabReady")}
                    </TabBtn>
                    <TabBtn active={!searching && tab === "printed"} onClick={() => { setQuery(""); setTab("printed"); }} count={printedCount} countTone="green">
                        {t("tabPrinted")}
                    </TabBtn>
                </div>

                <div className="mt-[8px]">
                    <select
                        value={doctorId}
                        onChange={(e) => setDoctorId(e.target.value)}
                        className="fd-field-sm"
                        aria-label={t("filterAllDoctors")}
                    >
                        <option value="">{t("filterAllDoctors")}</option>
                        {doctors.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Count strip */}
            <div className="flex items-center justify-between border-b border-t border-[#eef0f5] bg-[#fbfbfd] px-4 py-[7px]">
                <span className="text-[11.5px] font-bold text-[#5a6472] tabular-nums">
                    {searching ? `${t("searchResults")} · ${rows.length}` : t("rxCount", { n: loading ? "…" : rows.length })}
                </span>
                <span className="text-[11px] font-medium text-[#a8aeba]">
                    {searching ? "" : tab === "ready" ? t("tabReady") : t("tabPrinted")}
                </span>
            </div>

            <div
                ref={listRef}
                role="listbox"
                aria-label={t("printRxTitle")}
                onKeyDown={onListKeyDown}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
                {loading && <SkeletonRows />}

                {failed && (
                    <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-14 text-center">
                        <SearchX size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
                        <p className="m-0 text-[13.5px] font-medium text-[#5a6472]">{t("rxLoadFailed")}</p>
                        <button
                            type="button"
                            onClick={onRetry}
                            className="h-9 rounded-[9px] border-[1.5px] border-[#e6e3f1] bg-white px-4 text-[12.5px] font-bold text-[#5a6472] transition-colors hover:border-[#d5cfec] hover:bg-[#f8f7fd]"
                        >
                            {t("retry")}
                        </button>
                    </div>
                )}

                {empty && <EmptyState searching={searching} tab={tab} printedCount={printedCount} />}

                {!loading && !failed &&
                    rows.map((rx) => (
                        <RxRow
                            key={rx.prescription_id}
                            rx={rx}
                            log={printLog[rx.prescription_id]}
                            selected={rx.prescription_id === selectedId}
                            onSelect={onSelect}
                        />
                    ))}
            </div>
        </section>
    );
}

function TabBtn({
    active,
    onClick,
    count,
    countTone,
    children,
}: {
    active: boolean;
    onClick: () => void;
    count: number;
    countTone: "amber" | "green";
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={`flex h-[30px] flex-1 items-center justify-center gap-[6px] whitespace-nowrap rounded-[8px] px-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.28)] ${
                active ? "bg-white font-bold text-[#4c3db2] shadow-[0_1px_3px_rgba(20,30,50,0.08)]" : "font-semibold text-[#8a91a0] hover:text-[#5a6472]"
            }`}
        >
            {children}
            <span
                className={`rounded-[5px] px-[5px] py-[1px] text-[10.5px] font-bold tabular-nums ${
                    count === 0
                        ? "bg-[#eef0f5] text-[#a8aeba]"
                        : countTone === "amber"
                          ? "bg-[#fbeed9] text-[#a9741f]"
                          : "bg-[#e4f5eb] text-[#347d55]"
                }`}
            >
                {count}
            </span>
        </button>
    );
}

// Print-state chip: amber = still to hand over (task), green = done. Same
// semantic vocabulary as the visit queue — nothing new to learn.
export function PrintStateChip({ log, size = "md" }: { log?: { count: number; last: string }; size?: "sm" | "md" }) {
    const t = useT();
    const printed = !!log && log.count > 0;
    const label = !printed ? t("neverPrinted") : log!.count === 1 ? t("printedOnce") : t("printedTimes", { n: log!.count });
    return (
        <span
            className={`inline-flex w-fit items-center gap-[5px] whitespace-nowrap rounded-full font-semibold ${
                size === "sm" ? "px-[8px] py-[2px] text-[10px]" : "px-[9px] py-[3px] text-[10.5px]"
            } ${printed ? "bg-[#e4f5eb] text-[#347d55]" : "bg-[#fbeed9] text-[#a9741f]"}`}
        >
            <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: printed ? "#1c8a4d" : "#c9791a" }} />
            {label}
        </span>
    );
}

function RxRow({
    rx,
    log,
    selected,
    onSelect,
}: {
    rx: PrintQueueRx;
    log?: { count: number; last: string };
    selected: boolean;
    onSelect: (rx: PrintQueueRx) => void;
}) {
    const tint = avatarTint(rx.patient_name);
    const created = new Date(rx.created_at);
    const time = created.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });

    return (
        <button
            type="button"
            data-rx-row
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(rx)}
            className={`group grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-l-[3px] border-t-[#f2f3f7] px-4 py-[11px] text-left transition-colors duration-100 focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_rgba(99,102,241,0.28)] ${
                selected ? "border-l-[#7c5cf0] bg-[rgba(124,92,240,0.06)]" : "border-l-transparent hover:bg-[#f8f8fd]"
            }`}
        >
            <span
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-[12.5px] font-bold"
                style={{ background: tint.bg, color: tint.text }}
                aria-hidden
            >
                {initials(rx.patient_name)}
            </span>

            <span className="min-w-0">
                <span className={`block truncate text-[14px] leading-[1.3] ${selected ? "font-bold text-[#2f2670]" : "font-semibold text-[#161d29]"}`}>
                    {rx.patient_name}
                </span>
                <span className="mt-[1px] block truncate text-[12px] text-[#8a91a0]">
                    {rx.doctor_name ?? "—"}
                    {rx.token_number != null && <span className="tabular-nums"> · #{padToken(rx.token_number)}</span>}
                </span>
            </span>

            <span className="flex flex-col items-end gap-[3px]">
                <PrintStateChip log={log} size="sm" />
                <span className="text-[11px] font-medium text-[#a8aeba] tabular-nums">
                    {formatArchiveDate(rx.created_at)} · {time}
                </span>
            </span>
        </button>
    );
}

function EmptyState({ searching, tab, printedCount }: { searching: boolean; tab: PrintTab; printedCount: number }) {
    const t = useT();

    if (searching) {
        return (
            <div className="flex flex-col items-center gap-[10px] px-5 py-12 text-center">
                <FileSearch size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
                <h3 className="m-0 text-[13.5px] font-bold text-[#5a6472]">{t("rxNoMatchTitle")}</h3>
                <p className="m-0 max-w-[240px] text-[12.5px] leading-[1.5] text-[#a8aeba]">{t("rxNoMatchBody")}</p>
            </div>
        );
    }

    if (tab === "printed") {
        return (
            <div className="flex flex-col items-center gap-[10px] px-5 py-12 text-center">
                <Printer size={20} className="text-[#cbd2df]" strokeWidth={1.8} />
                <h3 className="m-0 text-[13.5px] font-bold text-[#5a6472]">{t("rxEmptyPrintedTitle")}</h3>
                <p className="m-0 max-w-[240px] text-[12.5px] leading-[1.5] text-[#a8aeba]">{t("rxEmptyPrintedBody")}</p>
            </div>
        );
    }

    // Ready tab. If printing already happened recently, an empty queue is an
    // achievement (green sign-off); on a quiet first open it is a warm promise
    // that the page fills itself.
    if (printedCount > 0) {
        return (
            <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-14 text-center">
                <h3 className="m-0 flex items-center gap-[7px] font-[Manrope,sans-serif] text-[16px] font-bold text-[#161d29]">
                    <CheckCheck size={16} className="text-[#1c8a4d] opacity-80" />
                    {t("rxAllPrintedTitle")}
                </h3>
                <p className="m-0 max-w-[250px] text-[12.5px] leading-[1.5] text-[#8a91a0]">{t("rxAllPrintedBody")}</p>
            </div>
        );
    }

    return (
        <div className="aren-rise flex flex-col items-center gap-[10px] px-5 py-14 text-center">
            <h3 className="m-0 font-[Manrope,sans-serif] text-[16px] font-bold text-[#161d29]">{t("rxEmptyReadyTitle")}</h3>
            <p className="m-0 max-w-[250px] text-[12.5px] leading-[1.5] text-[#8a91a0]">{t("rxEmptyReadyBody")}</p>
        </div>
    );
}

// Skeleton rows (frozen rule: skeletons, never spinners).
function SkeletonRows() {
    return (
        <div aria-hidden className="animate-pulse motion-reduce:animate-none">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[#f2f3f7] px-4 py-[11px]">
                    <div className="h-[38px] w-[38px] rounded-[11px] bg-[#eef0f5]" />
                    <div>
                        <div className="h-[13px] w-[55%] rounded bg-[#eef0f5]" />
                        <div className="mt-[7px] h-[10px] w-[70%] rounded bg-[#f2f3f7]" />
                    </div>
                    <div className="flex flex-col items-end gap-[7px]">
                        <div className="h-[14px] w-[74px] rounded-full bg-[#eef0f5]" />
                        <div className="h-[9px] w-[88px] rounded bg-[#f2f3f7]" />
                    </div>
                </div>
            ))}
        </div>
    );
}
