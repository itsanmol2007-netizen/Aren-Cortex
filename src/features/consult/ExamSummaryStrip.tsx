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
// ── Why it renders per SITE and not per reading (one line each)
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
import { REGION_BY_KEY, regionPainKey } from "./examination";
import { examCounts } from "./ExaminationCard";
import { NV_CHECKS, NV_REGIONS, nvKey } from "./NeurovascularCheck";
import type { CaseSheetEntry } from "./CaseSheet";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";
import { clinicalSiteLabel, sameSite, siteFromRegionKey, siteKey, type SiteRef } from "../../lib/body/clinicalSite";

interface Props {
    exam: ExaminationHook;
    /** every site the body map has marked, oldest first; a left and a right
     *  wrist are two sites, and a thigh is a site even with no range grid */
    markedSites: { region: string; side: MeasureSide | null }[];
    /** the chart, for what was recorded AT each site */
    entries: CaseSheetEntry[];
    /** assessments made at a site, "Fracture" at the right wrist */
    assessments?: { label: string; site: SiteRef | null }[];
    onOpen: () => void;
    disabled?: boolean;
}

interface SiteLine {
    key: string;
    name: string;
    pain: number | null;
    /** "Swelling", "Tenderness" — the chart's findings and complaints here */
    recorded: string[];
    /** "2 ROM · 1 test" */
    counts: string[];
    /** neurovascular: null (not checked), "intact", "compromised" */
    nv: "intact" | "compromised" | null;
}

export function siteName(regionKey: string, side: MeasureSide | null): string {
    const region = REGION_BY_KEY.get(regionKey);
    if (!region) return regionKey;
    if (!region.paired || !side) return region.label;
    return `${side === "left" ? "Left" : "Right"} ${region.label.toLowerCase()}`;
}

export function ExamSummaryStrip({
    exam, markedSites, entries, assessments = [], onOpen, disabled = false,
}: Props) {
    // Every site, once: what the map marked, then any place a finding was
    // recorded at from the command bar without the map ever being opened.
    const refs: { ref: SiteRef; region: string; side: MeasureSide | null }[] = [];
    const add = (ref: SiteRef | null, region: string, side: MeasureSide | null) => {
        if (!ref || refs.some((r) => sameSite(r.ref, ref))) return;
        refs.push({ ref, region, side });
    };
    for (const m of markedSites) add(siteFromRegionKey(m.region, m.side), m.region, m.side);
    for (const a of assessments) if (a.site) {
        add(a.site, a.site.region, a.site.side === "left" || a.site.side === "right" ? a.site.side : null);
    }
    for (const e of entries) for (const s of e.sites ?? []) {
        const side = s.side === "left" || s.side === "right" ? s.side : null;
        add(s, s.region, side);
    }

    const sites: SiteLine[] = refs.map(({ ref, region, side }) => {
        const c = examCounts(exam, region, side);
        const counts: string[] = [];
        if (c.rom > 0) counts.push(`${c.rom} ROM`);
        if (c.strength > 0) counts.push(`${c.strength} strength`);
        if (c.tests > 0) counts.push(`${c.tests} test${c.tests === 1 ? "" : "s"}`);
        const nvValues = NV_REGIONS.has(region) ? NV_CHECKS.map((k) => exam.getText(nvKey(k.key, region), side)) : [];
        const nv = nvValues.some((v, i) => v && v !== NV_CHECKS[i].normal) ? "compromised"
            : nvValues.length && nvValues.every((v, i) => v === NV_CHECKS[i].normal) ? "intact" : null;
        return {
            key: siteKey(ref),
            name: REGION_BY_KEY.has(region) ? siteName(region, side) : clinicalSiteLabel(ref),
            pain: c.pain ?? exam.getNumber(regionPainKey(region), side, null),
            recorded: [
                ...assessments.filter((a) => sameSite(a.site, ref)).map((a) => a.label),
                ...entries.filter((e) => e.sites?.some((s) => sameSite(s, ref))).map((e) => e.label),
            ],
            counts,
            nv,
        };
    });

    return (
        <section
            aria-label="Body map and examination"
            className="flex overflow-hidden rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] shadow-[var(--cs-shadow)]"
        >
            <button
                type="button"
                disabled={disabled}
                onClick={onOpen}
                aria-label="Open the body map and examination"
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cs-blue-soft)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
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
                        <span className="flex flex-col gap-[3px]">
                            {sites.map((site) => {
                                // A site with nothing recorded yet still shows,
                                // because the map marking it IS a clinical
                                // statement — this is the joint being treated.
                                const rest = [...site.recorded, ...site.counts];
                                return (
                                    <span key={site.key} className="inline-flex min-w-0 items-center gap-2">
                                        <b className="text-[13px] font-bold text-[var(--cs-ink)]">
                                            {site.name}
                                        </b>
                                        {site.pain !== null && (
                                            <i
                                                className={
                                                    "rounded-[5px] px-[7px] py-[1px] text-[11px] font-bold not-italic tabular-nums " +
                                                    // Amber at 7+, the same threshold `painVas` warned on,
                                                    // so the two surfaces cannot disagree about "severe".
                                                    (site.pain >= 7
                                                        ? "bg-[var(--cs-amber-soft)] text-[var(--cs-amber)]"
                                                        : "bg-[var(--cs-teal-soft)] text-[var(--cs-teal)]")
                                                }
                                            >
                                                Pain {site.pain}/10
                                            </i>
                                        )}
                                        {site.nv === "compromised" && (
                                            <i className="rounded-[5px] bg-[var(--cs-red-soft)] px-[7px] py-[1px] text-[11px] font-bold not-italic text-[var(--cs-red)]">
                                                NV compromised
                                            </i>
                                        )}
                                        <em className="truncate text-[11.5px] font-medium not-italic text-[var(--cs-faint)]">
                                            {rest.length > 0 ? rest.join(" · ") : site.nv === "intact" ? "NV intact" : "nothing recorded yet"}
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
