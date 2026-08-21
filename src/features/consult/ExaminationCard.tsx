// ---------------------------------------------------------------------------
// EXAMINATION — Phase 3, plus Phase 5's within-session re-test.
//
// One region at a time. The catalogue in `examination.ts` knows every joint;
// this shows one, which is the "know a lot, show little" law applied to the
// deepest catalogue in the product.
//
// ── It is no longer a card on the consultation (2026-08-20)
//
// This used to render as a permanent section below Measurements, which put
// the deepest surface in the product on screen whether or not anyone had
// examined anything, and put it a long way from the body map that chose its
// region. Both halves of that were wrong in the same way: an examination is
// something you do TO A SITE, so the site is the context and the readings
// belong inside it.
//
// So the component below is now a plain region block with no card around it,
// mounted inside the body-map surface once a joint is selected. The
// consultation itself carries only `ExamSummaryStrip` — one line per examined
// site — and that strip is what opens the map. See `JointMapCard.tsx`.
//
// ── Active and passive share a row, and the GAP is computed
//
// The gap is the finding — a large one points at weakness or neurological
// involvement, a small one at a mechanical block. Two fields far apart
// would make the physiotherapist do that subtraction on every row.
//
// ── The re-test (Phase 5) is the same row, not a second screen
//
// Baseline -> intervention -> re-test is the loop that makes this a
// physiotherapy record rather than a form. It is deliberately NOT a
// separate mode: pressing the re-test control on a row that already has a
// baseline reveals one more box on that row, storing `context =
// 'post_intervention'`. The delta appears immediately beside it.
//
// Those readings must never reach a trend — a range that improved because
// it was just mobilised is not this session's progress. That separation is
// enforced in storage by `context`, which is exactly why Phase 2 added the
// column instead of leaving the re-test to a naming convention.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Undo2 } from "lucide-react";
import {
    EXAM_REGIONS, REGION_BY_KEY, MMT_LABEL,
    rangeMeasureKey, mmtMeasureKey, testMeasureKey, regionPainKey,
    activePassiveGap, outsideExpected,
} from "./examination";
import type { MmtGrade, TestResult } from "./examination";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";

interface Props {
    exam: ExaminationHook;
    /** the region being examined — already chosen, by pointing at the body */
    regionKey: string;
    /** which side, for a paired joint */
    side: MeasureSide | null;
    disabled?: boolean;
}

const RESULT_CYCLE: TestResult[] = ["not_done", "negative", "positive"];

/**
 * What has been recorded at one site, as counts — the compact summary the
 * consultation shows in place of this whole surface.
 *
 * Counts readings, not fields: a movement with only an active value counts
 * once, the same as one with both, because the question the strip answers is
 * "has this been looked at" rather than "is it complete". Nothing here is
 * ever mandatory, so a completeness ratio would be measuring against a
 * denominator that does not exist.
 */
export function examCounts(
    exam: ExaminationHook, regionKey: string, side: MeasureSide | null
): { rom: number; strength: number; tests: number; pain: number | null } {
    const region = REGION_BY_KEY.get(regionKey);
    if (!region) return { rom: 0, strength: 0, tests: 0, pain: null };

    let rom = 0;
    for (const m of region.movements) {
        const key = rangeMeasureKey(m.key);
        if (exam.getNumber(key, side, "active") !== null || exam.getNumber(key, side, "passive") !== null) rom++;
    }
    let strength = 0;
    for (const mu of region.muscles) {
        if (exam.getNumber(mmtMeasureKey(mu.key), side, "mmt") !== null) strength++;
    }
    let tests = 0;
    for (const t of region.tests) {
        if (exam.getText(testMeasureKey(t.key), side)) tests++;
    }
    return { rom, strength, tests, pain: exam.getNumber(regionPainKey(regionKey), side, null) };
}

export function RegionExam({ exam, regionKey, side, disabled = false }: Props) {
    // Rows the doctor has opened a re-test on. Local, not persisted: whether
    // the box is SHOWING is a UI state, whether it has a VALUE is the record.
    const [retesting, setRetesting] = useState<Set<string>>(new Set());

    const region = REGION_BY_KEY.get(regionKey) ?? null;
    // A body zone with no examination catalogue behind it — a hand, a foot,
    // the chest. The map still marks it; there is simply nothing to measure.
    if (!region) return null;

    const numInput = (
        key: string, method: string | null, context: "baseline" | "post_intervention", hint: boolean
    ) => (
        <input
            type="number"
            // `is-outside` is a HINT that a reading sits outside the published
            // normal, never a warning: a restricted range is the reason the
            // patient is in the room.
            className={
                "h-[26px] w-full rounded-md border bg-white px-1.5 text-center text-[12.5px] font-semibold tabular-nums text-[var(--cs-ink)] outline-none transition-colors focus:border-[var(--cs-blue)] focus:shadow-[0_0_0_2px_rgba(18,104,232,0.12)] " +
                (hint ? "border-[#e3c9a0] bg-[#fffdf6]" : "border-[var(--cs-line-strong)]")
            }
            value={exam.getNumber(key, side, method, context) ?? ""}
            disabled={disabled}
            onChange={(e) => {
                const raw = e.target.value.trim();
                exam.setNumber(key, side, method, raw === "" ? null : Number(raw), context);
            }}
        />
    );

    const painKey = regionPainKey(region.key);
    const pain = exam.getNumber(painKey, side, null);

    return (
        <div className="mt-3 space-y-4 border-t border-[var(--cs-line)] pt-3.5">
            {/* ── Pain, for THIS site ───────────────────────────────────────
                First, because it is the reading a physiotherapist takes first
                and the one the patient volunteers. Picked, not typed: 0-10 is
                an ordinal a patient says out loud, and eleven targets is faster
                than a field plus a keyboard.

                Drawn as one continuous track rather than eleven loose buttons.
                A pain score is a POSITION on a scale, and a row of separate
                boxes says "eleven unrelated choices" — the segmented track says
                "somewhere between none and worst", which is the actual
                question. The anchors underneath name both ends, so nobody has
                to remember which direction is bad. */}
            <section>
                <header className="mb-1.5 flex items-baseline justify-between">
                    <h4 className="m-0 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                        Pain
                    </h4>
                    <span className="text-[12.5px] font-bold tabular-nums text-[var(--cs-ink)]">
                        {pain === null ? <span className="font-medium text-[var(--cs-faint)]">Not recorded</span> : `${pain} / 10`}
                    </span>
                </header>

                <div className="flex overflow-hidden rounded-lg border border-[var(--cs-line-strong)]">
                    {Array.from({ length: 11 }, (_, n) => {
                        const on = pain === n;
                        return (
                            <button
                                key={n}
                                type="button"
                                disabled={disabled}
                                aria-label={`Pain ${n} out of 10`}
                                aria-pressed={on}
                                onClick={() => exam.setNumber(painKey, side, null, on ? null : n, "baseline", "/10")}
                                className={
                                    "h-[26px] flex-1 border-r border-[var(--cs-line)] text-[11.5px] font-semibold tabular-nums transition-colors last:border-r-0 " +
                                    (on
                                        // Severity colours the SELECTED segment only. Tinting
                                        // 0-10 in advance would be the scale grading the
                                        // patient before they had answered.
                                        ? (n >= 7
                                            ? "bg-[var(--cs-amber)] text-white"
                                            : n >= 4
                                                ? "bg-[#b8860b] text-white"
                                                : "bg-[var(--cs-teal)] text-white")
                                        : "bg-white text-[var(--cs-muted)] hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)]")
                                }
                            >
                                {n}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-1 flex justify-between text-[10.5px] font-medium text-[var(--cs-faint)]">
                    <span>No pain</span>
                    <span>Worst imaginable</span>
                </div>
            </section>

            {/* ── Range ─────────────────────────────────────────────────────
                Active and passive on one row because the GAP between them is
                the finding, not either number — a large gap points at weakness
                or neurological involvement, a small one at a mechanical block.
                Two fields far apart would make the physiotherapist do that
                subtraction on every row. */}
            <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                    Range of motion
                </h4>
                <div className="overflow-hidden rounded-lg border border-[var(--cs-line)]">
                    <div className="grid grid-cols-[minmax(96px,1fr)_64px_64px_52px_auto] items-center gap-x-2 border-b border-[var(--cs-line)] bg-[var(--cs-page)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--cs-faint)]">
                        <span>Movement</span>
                        <span className="text-center">Active</span>
                        <span className="text-center">Passive</span>
                        <span className="text-center">Gap</span>
                        <span />
                    </div>

                    {region.movements.map((m) => {
                        const key = rangeMeasureKey(m.key);
                        const a = exam.getNumber(key, side, "active");
                        const p = exam.getNumber(key, side, "passive");
                        const gap = activePassiveGap(a, p);
                        const isRetesting = retesting.has(key);
                        const post = exam.getNumber(key, side, "active", "post_intervention");
                        const delta = post !== null && a !== null ? post - a : null;

                        return (
                            <div
                                key={m.key}
                                className="grid grid-cols-[minmax(96px,1fr)_64px_64px_52px_auto] items-center gap-x-2 border-b border-[var(--cs-line)] px-2.5 py-1.5 last:border-b-0"
                            >
                                <span className="text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                    {m.label}
                                    {/* The published normal, stated quietly. A
                                        physiotherapist knows these; a locum
                                        covering a shoulder clinic may not. */}
                                    <i className="ml-1.5 text-[10.5px] font-medium not-italic text-[var(--cs-faint)]">
                                        {m.normal}°
                                    </i>
                                </span>
                                {numInput(key, "active", "baseline", outsideExpected(m, a))}
                                {numInput(key, "passive", "baseline", outsideExpected(m, p))}
                                <span className="text-center text-[12px] font-bold tabular-nums text-[var(--cs-muted)]">
                                    {gap === null ? <span className="font-normal text-[var(--cs-faint)]">—</span> : `${gap}°`}
                                </span>

                                {isRetesting ? (
                                    <span className="flex items-center gap-1.5">
                                        <span className="text-[var(--cs-faint)]">→</span>
                                        {numInput(key, "active", "post_intervention", false)}
                                        {delta !== null && (
                                            <b className={
                                                "text-[11.5px] font-bold tabular-nums " +
                                                (delta > 0 ? "text-[var(--cs-teal)]" : delta < 0 ? "text-[var(--cs-amber)]" : "text-[var(--cs-faint)]")
                                            }>
                                                {delta > 0 ? "+" : ""}{delta}°
                                            </b>
                                        )}
                                        <button
                                            type="button"
                                            aria-label="Cancel re-test"
                                            className="grid size-[20px] place-items-center rounded text-[var(--cs-faint)] hover:bg-[var(--cs-line)] hover:text-[var(--cs-muted)]"
                                            onClick={() => {
                                                exam.setNumber(key, side, "active", null, "post_intervention");
                                                setRetesting((st) => { const n = new Set(st); n.delete(key); return n; });
                                            }}
                                        >
                                            <Undo2 size={11} />
                                        </button>
                                    </span>
                                ) : a !== null ? (
                                    // Only offered once there is a baseline to compare against.
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setRetesting((st) => new Set(st).add(key))}
                                        className="rounded-md border border-[var(--cs-line-strong)] px-2 py-[3px] text-[10.5px] font-semibold text-[var(--cs-faint)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]"
                                    >
                                        Re-test
                                    </button>
                                ) : (
                                    // MUST render an element, not `false` — an empty
                                    // grid cell still has to BE a cell, or every row
                                    // below shifts one column left.
                                    <span aria-hidden="true" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── Strength ──────────────────────────────────────────────────
                Oxford/MRC 0-5. An ordinal with no arithmetic, so it is picked
                from a segmented control and never typed, and each grade carries
                its meaning on hover — "4" is not self-explanatory to anyone who
                does not use the scale daily. */}
            <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                    Strength <span className="font-semibold normal-case tracking-normal text-[var(--cs-faint)]">(MMT)</span>
                </h4>
                <div className="space-y-1">
                    {region.muscles.map((mu) => {
                        const key = mmtMeasureKey(mu.key);
                        const grade = exam.getNumber(key, side, "mmt");
                        return (
                            <div key={mu.key} className="flex items-center gap-3">
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                    {mu.label}
                                </span>
                                <span className="flex flex-none overflow-hidden rounded-lg border border-[var(--cs-line-strong)]">
                                    {([0, 1, 2, 3, 4, 5] as MmtGrade[]).map((g) => {
                                        const on = grade === g;
                                        return (
                                            <button
                                                key={g}
                                                type="button"
                                                disabled={disabled}
                                                title={MMT_LABEL[g]}
                                                aria-pressed={on}
                                                onClick={() => exam.setNumber(key, side, "mmt", on ? null : g, "baseline", "/5")}
                                                className={
                                                    "h-[24px] w-[30px] border-r border-[var(--cs-line)] text-[11.5px] font-semibold tabular-nums transition-colors last:border-r-0 " +
                                                    (on
                                                        ? "bg-[var(--cs-blue)] text-white"
                                                        : "bg-white text-[var(--cs-muted)] hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)]")
                                                }
                                            >
                                                {g}
                                            </button>
                                        );
                                    })}
                                </span>
                                <span className="hidden w-[132px] flex-none text-[10.5px] font-medium text-[var(--cs-faint)] lg:block">
                                    {grade === null ? "" : MMT_LABEL[grade as MmtGrade]}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── Special tests ─────────────────────────────────────────────
                Three states on one control, cycled by clicking: not done →
                negative → positive. The mark carries the state so the row is
                readable without colour alone. What a positive SUGGESTS is on
                hover and never on screen as a verdict — a positive Lachman is
                evidence, not a diagnosis. */}
            <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--cs-label)]">
                    Special tests
                </h4>
                <div className="flex flex-wrap gap-1.5">
                    {region.tests.map((t) => {
                        const key = testMeasureKey(t.key);
                        const result = (exam.getText(key, side) as TestResult | null) ?? "not_done";
                        const next = RESULT_CYCLE[(RESULT_CYCLE.indexOf(result) + 1) % RESULT_CYCLE.length];
                        return (
                            <button
                                key={t.key}
                                type="button"
                                disabled={disabled}
                                title={`Positive suggests ${t.suggests}`}
                                onClick={() => exam.setText(key, side, next === "not_done" ? null : next)}
                                className={
                                    "inline-flex items-center gap-1.5 rounded-lg border py-[4px] pl-[7px] pr-[10px] text-[12.5px] font-semibold transition-colors " +
                                    (result === "positive"
                                        ? "border-[#f6c3cd] bg-[#fff1f3] text-[#b3103b]"
                                        : result === "negative"
                                            ? "border-[#a4e3d1] bg-[#f4fdfa] text-[#0b6a62]"
                                            : "border-[var(--cs-line-strong)] bg-white text-[var(--cs-muted)] hover:border-[var(--cs-blue)] hover:text-[var(--cs-blue)]")
                                }
                            >
                                <i className={
                                    "grid size-[16px] flex-none place-items-center rounded not-italic text-[11px] font-bold " +
                                    (result === "positive"
                                        ? "bg-[#ffe0e6] text-[#b3103b]"
                                        : result === "negative"
                                            ? "bg-[#d7f3ea] text-[#0b6a62]"
                                            : "bg-[var(--cs-page)] text-[var(--cs-faint)]")
                                }>
                                    {result === "positive" ? "+" : result === "negative" ? "−" : "?"}
                                </i>
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {exam.error && (
                <p className="rounded-md bg-[var(--cs-red-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--cs-red)]">
                    {exam.error}
                </p>
            )}
        </div>
    );
}

export { EXAM_REGIONS };
