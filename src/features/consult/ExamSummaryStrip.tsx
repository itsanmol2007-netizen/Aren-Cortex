// ---------------------------------------------------------------------------
// BODY MAP & EXAMINATION — the compact summary, and the only thing the
// consultation itself carries.
//
// Brief §7: "The full SVG body map should not permanently occupy consultation
// space... The default consultation should show only a compact summary/widget.
// Selecting it opens the detailed body-map/examination interface."
//
// So this is one line per examined site — what was looked at, and what came
// back — and clicking anywhere on it opens the map. Everything that used to
// sit permanently on the page (the figure, the range grid, the strength
// grades, the special tests) lives inside that surface now, next to the joint
// it belongs to.
//
// ── Why it renders per SITE and not per reading
//
// Brief §6: a patient can have a right knee and a left shoulder at once, and
// those are two examinations, not one. Every reading underneath carries its
// own `side` column already (Phase 2), so this only has to group by what the
// map marked and count what each one holds.
//
// ── Empty is an invitation, not a frame
//
// With nothing marked this is a single button — "Body map & examination /
// Open to record what you examined" — rather than an empty card with headings
// waiting to be filled. Nothing has been examined, so there is nothing to
// summarise, and the doctrine's standing test ("does an empty consultation get
// shorter?") says the surface should say one line and get out of the way.
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
        <section className="cs-card cs-exsum" aria-label="Body map and examination">
            <button
                type="button"
                className="cs-exsum-open"
                disabled={disabled}
                onClick={onOpen}
                aria-label="Open the body map and examination"
            >
                <span className="cs-exsum-figure" aria-hidden="true">
                    <PersonStanding size={18} />
                </span>

                <span className="cs-exsum-main">
                    <span className="cs-exsum-title">Body map &amp; examination</span>

                    {sites.length === 0 ? (
                        <span className="cs-exsum-empty">
                            Open to mark a joint and record what you examined
                        </span>
                    ) : (
                        <span className="cs-exsum-sites">
                            {sites.map((r) => {
                                const side = markedSides.get(r) ?? null;
                                const c = examCounts(exam, r, side);
                                // A site with nothing recorded yet still shows,
                                // because the map marking it IS a clinical
                                // statement — this is the joint we are treating.
                                const parts: string[] = [];
                                if (c.rom > 0) parts.push(`${c.rom} ROM`);
                                if (c.strength > 0) parts.push(`${c.strength} strength`);
                                if (c.tests > 0) parts.push(`${c.tests} test${c.tests === 1 ? "" : "s"}`);
                                return (
                                    <span key={r} className="cs-exsum-site">
                                        <b>{siteName(r, side)}</b>
                                        {c.pain !== null && (
                                            <i className={`cs-exsum-pain${c.pain >= 7 ? " is-high" : ""}`}>
                                                Pain {c.pain}/10
                                            </i>
                                        )}
                                        <em>{parts.length > 0 ? parts.join(" · ") : "nothing recorded yet"}</em>
                                    </span>
                                );
                            })}
                        </span>
                    )}
                </span>

                <ChevronRight size={16} className="cs-exsum-chev" aria-hidden="true" />
            </button>
        </section>
    );
}
