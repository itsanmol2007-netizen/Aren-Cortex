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
            className={`cs-exam-num${hint ? " is-outside" : ""}`}
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
        <div className="cs-exam-block">
            <div className="cs-exam-body">
                {/* ── Pain, for THIS site ───────────────────────────────────
                    First, because it is the reading a physiotherapist takes
                    first and the one the patient volunteers. Picked, not
                    typed: an 0-10 is an ordinal a patient says out loud, and
                    eleven buttons is faster than a field plus a keyboard. */}
                <div className="cs-exam-pain">
                    <span className="cs-exam-label">Pain</span>
                    <span className="cs-exam-pain-scale">
                        {Array.from({ length: 11 }, (_, n) => (
                            <button
                                key={n}
                                type="button"
                                disabled={disabled}
                                className={`cs-exam-pip${pain === n ? " is-on" : ""}${n >= 7 ? " is-high" : ""}`}
                                aria-label={`Pain ${n} out of 10`}
                                onClick={() => exam.setNumber(painKey, side, null, pain === n ? null : n, "baseline", "/10")}
                            >
                                {n}
                            </button>
                        ))}
                    </span>
                    <span className="cs-exam-pain-read">{pain === null ? "—" : `${pain}/10`}</span>
                </div>

                {/* ── Range ─────────────────────────────────────────────── */}
                <div className="cs-exam-grid">
                    <span className="cs-exam-col-head" />
                    <span className="cs-exam-col-head">Active</span>
                    <span className="cs-exam-col-head">Passive</span>
                    <span className="cs-exam-col-head">Gap</span>
                    <span className="cs-exam-col-head" />

                    {region.movements.map((m) => {
                        const key = rangeMeasureKey(m.key);
                        const a = exam.getNumber(key, side, "active");
                        const p = exam.getNumber(key, side, "passive");
                        const gap = activePassiveGap(a, p);
                        const isRetesting = retesting.has(key);
                        const post = exam.getNumber(key, side, "active", "post_intervention");
                        const delta = post !== null && a !== null ? post - a : null;

                        return (
                            <div key={m.key} className="cs-exam-row" style={{ display: "contents" }}>
                                <span className="cs-exam-label">{m.label}</span>
                                {numInput(key, "active", "baseline", outsideExpected(m, a))}
                                {numInput(key, "passive", "baseline", outsideExpected(m, p))}
                                <span className="cs-exam-gap">{gap === null ? "—" : `${gap}°`}</span>

                                {/* Phase 5 — the re-test, on the row it belongs to. */}
                                {isRetesting ? (
                                    <span className="cs-exam-retest">
                                        <span className="cs-exam-arrow">→</span>
                                        {numInput(key, "active", "post_intervention", false)}
                                        {delta !== null && (
                                            <b className={delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}>
                                                {delta > 0 ? "+" : ""}{delta}°
                                            </b>
                                        )}
                                        <button
                                            type="button"
                                            className="cs-exam-retest-undo"
                                            aria-label="Cancel re-test"
                                            onClick={() => {
                                                exam.setNumber(key, side, "active", null, "post_intervention");
                                                setRetesting((s) => { const n = new Set(s); n.delete(key); return n; });
                                            }}
                                        >
                                            <Undo2 size={11} />
                                        </button>
                                    </span>
                                ) : (
                                    // Only offered once there is a baseline to compare against.
                                    a !== null && (
                                        <button
                                            type="button"
                                            className="cs-exam-retest-btn"
                                            disabled={disabled}
                                            onClick={() => setRetesting((s) => new Set(s).add(key))}
                                        >
                                            Re-test
                                        </button>
                                    )
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Strength ──────────────────────────────────────────── */}
                <p className="cs-exam-sub">Strength</p>
                {region.muscles.map((mu) => {
                    const key = mmtMeasureKey(mu.key);
                    const grade = exam.getNumber(key, side, "mmt");
                    return (
                        <div key={mu.key} className="cs-exam-mmt">
                            <span className="cs-exam-label">{mu.label}</span>
                            <span className="cs-exam-grades">
                                {([0, 1, 2, 3, 4, 5] as MmtGrade[]).map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        disabled={disabled}
                                        title={MMT_LABEL[g]}
                                        className={`cs-exam-grade${grade === g ? " is-on" : ""}`}
                                        onClick={() => exam.setNumber(key, side, "mmt", grade === g ? null : g, "baseline", "/5")}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </span>
                        </div>
                    );
                })}

                {/* ── Special tests ─────────────────────────────────────── */}
                <p className="cs-exam-sub">Tests</p>
                <div className="cs-exam-tests">
                    {region.tests.map((t) => {
                        const key = testMeasureKey(t.key);
                        const result = (exam.getText(key, side) as TestResult | null) ?? "not_done";
                        const next = RESULT_CYCLE[(RESULT_CYCLE.indexOf(result) + 1) % RESULT_CYCLE.length];
                        return (
                            <button
                                key={t.key}
                                type="button"
                                disabled={disabled}
                                // The suggestion is on hover, never on screen as a
                                // verdict — a positive Lachman is evidence, not a
                                // diagnosis, and doctrine §5 is explicit that
                                // nothing is presented as the cause.
                                title={`Positive suggests ${t.suggests}`}
                                className={`cs-exam-test is-${result}`}
                                onClick={() => exam.setText(key, side, next === "not_done" ? null : next)}
                            >
                                <i className="cs-exam-test-mark" aria-hidden="true">
                                    {result === "positive" ? "+" : result === "negative" ? "−" : "?"}
                                </i>
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {exam.error && <p className="cs-attach-error">{exam.error}</p>}
            </div>
        </div>
    );
}

export { EXAM_REGIONS };
