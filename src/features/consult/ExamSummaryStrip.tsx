// ---------------------------------------------------------------------------
// BODY MAP & EXAMINATION — the compact summary, and the only thing the
// consultation itself carries.
//
// Brief §7: "The full SVG body map should not permanently occupy consultation
// space... The default consultation should show only a compact summary/widget.
// Selecting it opens the detailed body-map/examination interface."
//
// So this is one line per examined site — what was looked at, and what came
// back — and clicking it opens the map. Everything that used to sit
// permanently on the page (the figure, the range grid, the strength grades,
// the special tests) lives inside that surface now, next to the joint it
// belongs to. It is also the ONLY launcher for that surface: `App.tsx`
// suppresses `SpecialtyExamCard` for this profile so one modal does not get
// two buttons on one screen.
//
// ── Why it renders per SITE and not per reading
//
// Brief §6: a patient can have a right knee and a left shoulder at once, and
// those are two examinations, not one. Every reading underneath carries its
// own `side` column already (Phase 2), so this only has to group by what the
// map marked and count what each one holds.
//
// ── Styled in Tailwind, on purpose
//
// The first cut of this component styled itself from `consult.css` and shipped
// with the rules missing entirely — the strip rendered as a run-on line of
// unstyled text. A component-local surface has no business in a 7000-line
// stylesheet it can silently fall out of; the classes belong next to the
// markup, where deleting one is visible in the same diff as deleting the other.
// ---------------------------------------------------------------------------

import { ChevronRight, PersonStanding } from "lucide-react";
import { REGION_BY_KEY } from "./examination";
import { examCounts } from "./ExaminationCard";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";

interface Props {
    exam: ExaminationHook;
    /** regions the body map has marked, in the order they were marked */
    markedRegions: string[];
    /** which side each marked region was on, when it was paired */
    markedSides: Map<string, MeasureSide | null>;
    onOpen: () => void;
    disabled?: boolean;
}

/** "Right knee" / "Lumbar spine" — the side is part of the name, never beside it. */
function siteName(regionKey: string, side: MeasureSide | null): string {
    const region = REGION_BY_KEY.get(regionKey);
    if (!region) return regionKey;
    if (!region.paired || !side) return region.label;
    return `${side === "left" ? "Left" : "Right"} ${region.label.toLowerCase()}`;
}

export function ExamSummaryStrip({
    exam, markedRegions, markedSides, onOpen, disabled = false,
}: Props) {
    const sites = markedRegions.filter((r) => REGION_BY_KEY.has(r));

    return (
        <section
            aria-label="Body map and examination"
            className="mb-1.5 overflow-hidden rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] shadow-[var(--cs-shadow)]"
        >
            <button
                type="button"
                disabled={disabled}
                onClick={onOpen}
                aria-label="Open the body map and examination"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--cs-blue-soft)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
            >
                <span className="grid size-[30px] flex-none place-items-center rounded-lg bg-[linear-gradient(180deg,#f3f6fc_0%,#e6ecf7_100%)] text-[#41506b] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                    <PersonStanding size={17} />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cs-label)]">
                        Body map &amp; examination
                    </span>

                    {sites.length === 0 ? (
                        <span className="text-[12.5px] font-medium text-[var(--cs-muted)]">
                            Open to mark a joint and record what you examined
                        </span>
                    ) : (
                        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                            {sites.map((r) => {
                                const side = markedSides.get(r) ?? null;
                                const c = examCounts(exam, r, side);
                                // A site with nothing recorded yet still shows,
                                // because the map marking it IS a clinical
                                // statement — this is the joint being treated.
                                const parts: string[] = [];
                                if (c.rom > 0) parts.push(`${c.rom} ROM`);
                                if (c.strength > 0) parts.push(`${c.strength} strength`);
                                if (c.tests > 0) parts.push(`${c.tests} test${c.tests === 1 ? "" : "s"}`);
                                return (
                                    <span key={r} className="inline-flex items-center gap-2">
                                        <b className="text-[13px] font-bold text-[var(--cs-ink)]">
                                            {siteName(r, side)}
                                        </b>
                                        {c.pain !== null && (
                                            <i
                                                className={
                                                    "rounded-[5px] px-[7px] py-[1px] text-[11px] font-bold not-italic tabular-nums " +
                                                    // Amber at 7+, the same threshold `painVas` warned on,
                                                    // so the two surfaces cannot disagree about "severe".
                                                    (c.pain >= 7
                                                        ? "bg-[var(--cs-amber-soft)] text-[var(--cs-amber)]"
                                                        : "bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]")
                                                }
                                            >
                                                Pain {c.pain}/10
                                            </i>
                                        )}
                                        <em className="text-[11.5px] font-medium not-italic text-[var(--cs-faint)]">
                                            {parts.length > 0 ? parts.join(" · ") : "nothing recorded yet"}
                                        </em>
                                    </span>
                                );
                            })}
                        </span>
                    )}
                </span>

                <ChevronRight size={16} className="flex-none text-[var(--cs-faint)]" aria-hidden="true" />
            </button>
        </section>
    );
}
