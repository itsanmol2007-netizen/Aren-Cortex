// ---------------------------------------------------------------------------
// EXAMINATION — Phase 3, plus Phase 5's within-session re-test.
//
// One region at a time, chosen from what the joint map marked. The
// catalogue in `examination.ts` knows every joint; this shows one, which is
// the "know a lot, show little" law applied to the deepest catalogue in the
// product.
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
import { Stethoscope, ChevronDown, Undo2 } from "lucide-react";
import {
    EXAM_REGIONS, REGION_BY_KEY, MMT_LABEL,
    rangeMeasureKey, mmtMeasureKey, testMeasureKey,
    activePassiveGap, outsideExpected,
} from "./examination";
import type { MmtGrade, TestResult } from "./examination";
import type { ExaminationHook } from "../../hooks/useExamination";
import type { MeasureSide } from "../../lib/db/examination";

interface Props {
    exam: ExaminationHook;
    /** regions the joint map has marked, in the order they were marked */
    markedRegions: string[];
    /** which side each marked region was on, when it was paired */
    markedSides: Map<string, MeasureSide | null>;
    disabled?: boolean;
}

const RESULT_CYCLE: TestResult[] = ["not_done", "negative", "positive"];

export function ExaminationCard({ exam, markedRegions, markedSides, disabled = false }: Props) {
    // Default to the first marked region. A physiotherapist marking a knee
    // then opening Examination should be looking at the knee, not choosing
    // it again.
    const available = markedRegions.filter((r) => REGION_BY_KEY.has(r));
    const [active, setActive] = useState<string | null>(null);
    const regionKey = active ?? available[0] ?? null;
    const region = regionKey ? REGION_BY_KEY.get(regionKey) ?? null : null;

    // Rows the doctor has opened a re-test on. Local, not persisted: whether
    // the box is SHOWING is a UI state, whether it has a VALUE is the record.
    const [retesting, setRetesting] = useState<Set<string>>(new Set());

    // Nothing marked, nothing to examine. The card does not render at all
    // rather than rendering an empty frame asking to be filled.
    if (!region) return null;

    const side: MeasureSide | null = region.paired
        ? (markedSides.get(region.key) ?? "right")
        : null;

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

    return (
        <section className="cs-card cs-exam-card" aria-label="Examination">
            <div className="cs-card-head">
                <span className="cs-card-title">
                    <span className="cs-glyph is-slate"><Stethoscope size={14} /></span>
                    Examination
                </span>

                {/* Region switcher — only when more than one joint is marked.
                    A single-option dropdown is a control that answers nothing. */}
                {available.length > 1 ? (
                    <label className="cs-exam-region">
                        <select
                            value={region.key}
                            disabled={disabled}
                            onChange={(e) => setActive(e.target.value)}
                        >
                            {/* The side is IN the option, not beside the
                                dropdown — with two joints marked, "Knee"
                                alone does not say which knee, and in
                                physiotherapy that is the whole question. */}
                            {available.map((r) => {
                                const reg = REGION_BY_KEY.get(r)!;
                                const sd = markedSides.get(r) ?? null;
                                return (
                                    <option key={r} value={r}>
                                        {reg.paired && sd
                                            ? `${sd === "left" ? "Left" : "Right"} ${reg.label.toLowerCase()}`
                                            : reg.label}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown size={12} aria-hidden="true" />
                    </label>
                ) : (
                    <span className="cs-exam-region-static">
                        {side ? `${side === "left" ? "Left" : "Right"} ` : ""}{region.label.toLowerCase()}
                    </span>
                )}
            </div>

            <div className="cs-exam-body">
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
        </section>
    );
}

export { EXAM_REGIONS };
