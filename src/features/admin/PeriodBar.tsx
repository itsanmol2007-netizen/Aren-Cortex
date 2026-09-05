// ---------------------------------------------------------------------------
// THE PERIOD CONTROL — one component, every admin page that has a range.
//
// It sits ABOVE the cards rather than inside one, because it governs all of
// them; a selector tucked into a card's corner reads as filtering that card
// alone. Overview and Reports both mount it, so the presets, the custom
// pickers and the "no future dates" rule are defined once — two copies would
// drift the first time a preset is added to one of them.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { clinicToday, type DateRange, type RangePreset } from "../../lib/db/admin";

const PRESETS: { key: RangePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "month", label: "This month" },
];

export interface PeriodState {
    preset: RangePreset;
    from: string;
    to: string;
}

export function PeriodBar({
    period, range, onChange, onRefresh, busy, children,
}: {
    period: PeriodState;
    /** The resolved range, so the date inputs show what a preset picked. */
    range: DateRange;
    onChange: (next: PeriodState) => void;
    onRefresh: () => void;
    busy?: boolean;
    /** Anything that belongs on this bar but is page-specific — Overview puts
     *  its live counts here. */
    children?: ReactNode;
}) {
    const today = clinicToday();

    return (
        <div className="flex flex-wrap items-center gap-[8px] rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[12px] py-[9px] shadow-[var(--cs-shadow)]">
            <span className="mr-[2px] flex items-center gap-[5px] text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                <CalendarDays size={13} /> Period
            </span>

            <div className="flex flex-wrap items-center gap-[4px]">
                {PRESETS.map((p) => (
                    <button
                        key={p.key}
                        type="button"
                        onClick={() => onChange({ ...period, preset: p.key })}
                        className={
                            "cursor-pointer rounded-full border px-[11px] py-[4px] text-[11.5px] font-semibold transition-colors outline-none " +
                            "focus-visible:shadow-[0_0_0_3px_var(--cs-blue-soft)] " +
                            (period.preset === p.key
                                ? "border-[var(--cs-blue)] bg-[var(--cs-blue)] text-white"
                                : "border-[var(--cs-line-strong)] bg-transparent text-[var(--cs-muted)] hover:bg-[var(--cs-blue-soft)]")
                        }
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            <div className="ml-auto flex items-center gap-[6px] max-[1100px]:ml-0">
                {children}
                {/* Any given date — the thing v1 had no way to reach at all.
                    Touching either picker switches to the custom preset, so the
                    chips and the dates can never disagree about what is shown. */}
                <input
                    type="date"
                    aria-label="From date"
                    value={period.preset === "custom" ? period.from : range.from}
                    max={today}
                    onChange={(e) => onChange({ preset: "custom", from: e.target.value, to: period.preset === "custom" ? period.to : range.to })}
                    className="h-[30px]! rounded-[8px]! border! border-[var(--cs-line-strong)]! bg-[var(--cs-page)]! px-[8px]! text-[11.5px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-blue)]!"
                />
                <span className="text-[11px] text-[var(--cs-faint)]">to</span>
                <input
                    type="date"
                    aria-label="To date"
                    value={period.preset === "custom" ? period.to : range.to}
                    max={today}
                    onChange={(e) => onChange({ preset: "custom", from: period.preset === "custom" ? period.from : range.from, to: e.target.value })}
                    className="h-[30px]! rounded-[8px]! border! border-[var(--cs-line-strong)]! bg-[var(--cs-page)]! px-[8px]! text-[11.5px]! text-[var(--cs-ink)] outline-none focus:border-[var(--cs-blue)]!"
                />
                <button
                    type="button"
                    onClick={onRefresh}
                    aria-label="Refresh"
                    title="Refresh"
                    className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[8px] border border-[var(--cs-line-strong)] bg-transparent text-[var(--cs-faint)] outline-none transition-colors hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)]"
                >
                    <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
                </button>
            </div>
        </div>
    );
}
