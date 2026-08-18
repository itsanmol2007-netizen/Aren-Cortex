// ---------------------------------------------------------------------------
// STORY CARD — physiotherapy's Subjective half, chip-first.
//
// See `docs/Cortex Specialties/physiotherapy-phase-1-plan.md` for the full
// reasoning; every design choice here traces to a numbered section there.
//
// ── Guided, not a wizard (plan §12.1)
//
// Every field renders at once — no hide-until-reached, because a doctor is
// listening to a patient talk, not stepping through a form. The ORDER on the
// page matches how a patient actually narrates (how long / how it started ->
// what brings it on -> what helps -> how it behaves through the day ->
// irritability last, because irritability is not asked, it is judged after
// hearing everything above).
//
// Auto-advance is honest about its own scope: `duration` and `onset` are
// single-select, so picking one has an unambiguous "next field" and reuses
// `MeasurementsCard`'s own `focusNext` shape. The chip GROUPS (aggravating,
// easing, pattern) are multi-select — auto-advancing after the first click
// would make picking a second chip require clicking back, which is worse
// than not advancing at all — so those are reached by ordinary tab order
// instead of a bespoke chain. This is a scope decision, not an oversight.
//
// ── Irritability is suggested, never assumed (plan §12.1, §13)
//
// `suggestIrritability` is a UI default with a stated reason, the same
// `is-suggested` + "why" convention `MeasureCell` already uses for a
// chart-relevant measurement. It never overrides an answer already given —
// checked directly in `story-catalogue.mjs`.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { Story, StoryDuration, StoryOnsetMode, StoryIrritability } from "./story";
import {
    DURATION_LABEL, ONSET_LABEL, IRRITABILITY_LABEL, SETTLING_LABEL,
    AGGRAVATING_FACTORS, EASING_FACTORS, STORY_PATTERNS,
    showMechanism, showSettling, suggestIrritability, isStoryEmpty,
} from "./story";

interface Props {
    story: Story;
    onChange: (s: Story) => void;
    disabled?: boolean;
}

function toggleIn(list: string[], key: string): string[] {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export function StoryCard({ story, onChange, disabled = false }: Props) {
    // Open by default on every visit — an empty Story is one collapsed
    // line either way (doctrine's "does an empty consultation get
    // shorter?" test), so there is no clinical cost to defaulting open,
    // and no last-visit summary is fetched to render a collapsed
    // preview (carry-forward is explicitly not built — plan §9).
    const [expanded, setExpanded] = useState(true);
    const onsetRef = useRef<HTMLDivElement>(null);
    const aggravatingRef = useRef<HTMLDivElement>(null);

    const set = <K extends keyof Story>(key: K, value: Story[K]) => onChange({ ...story, [key]: value });

    const suggestion = suggestIrritability(story);

    const summary = [
        story.duration && DURATION_LABEL[story.duration],
        story.onsetMode && ONSET_LABEL[story.onsetMode],
        story.irritability && `${IRRITABILITY_LABEL[story.irritability]} irritability`,
    ].filter(Boolean).join(" · ") || "Nothing recorded yet";

    return (
        <section className={`cs-card cs-story${expanded ? "" : " is-collapsed"}`} aria-label="Story">
            <button
                type="button"
                className="cs-card-head is-trigger"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
            >
                <span className="cs-card-title">
                    <span className="cs-glyph is-slate"><Info size={14} /></span>
                    Story
                </span>
                {!expanded && <span className="cs-story-summary">{summary}</span>}
                <ChevronDown size={14} className={`cs-story-chevron${expanded ? " is-open" : ""}`} aria-hidden="true" />
            </button>

            {expanded && (
                <div className="cs-story-body">
                    {/* Duration + onset — one exchange: "how long, how did it start" */}
                    <div className="cs-story-row">
                        <span className="cs-story-label">How long</span>
                        <div className="cs-attach-tagrow">
                            {(Object.keys(DURATION_LABEL) as StoryDuration[]).map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-attach-chip${story.duration === d ? " is-on" : ""}`}
                                    onClick={() => {
                                        set("duration", d);
                                        onsetRef.current?.focus();
                                    }}
                                >
                                    {DURATION_LABEL[d]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="cs-story-row" ref={onsetRef} tabIndex={-1}>
                        <span className="cs-story-label">Onset</span>
                        <div className="cs-attach-tagrow">
                            {(Object.keys(ONSET_LABEL) as StoryOnsetMode[]).map((o) => (
                                <button
                                    key={o}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-attach-chip${story.onsetMode === o ? " is-on" : ""}`}
                                    onClick={() => {
                                        set("onsetMode", o);
                                        aggravatingRef.current?.focus();
                                    }}
                                >
                                    {ONSET_LABEL[o]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Revealed only on traumatic/post-surgical onset (story.ts's showMechanism) */}
                    {showMechanism(story) && (
                        <div className="cs-story-row">
                            <span className="cs-story-label">What happened</span>
                            <input
                                className="cs-attach-region-input"
                                placeholder="twisted it playing cricket…"
                                value={story.mechanism}
                                disabled={disabled}
                                onChange={(e) => set("mechanism", e.target.value)}
                            />
                        </div>
                    )}

                    {/* Aggravating + tolerance — paired: "what brings it on, how much before it does" */}
                    <div className="cs-story-row" ref={aggravatingRef} tabIndex={-1}>
                        <span className="cs-story-label">Worse with</span>
                        <div className="cs-attach-tagrow">
                            {AGGRAVATING_FACTORS.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-attach-chip${story.aggravating.includes(f.key) ? " is-on" : ""}`}
                                    onClick={() => set("aggravating", toggleIn(story.aggravating, f.key))}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <input
                            className="cs-attach-region-input cs-story-tolerance"
                            placeholder="e.g. 10 min walking → 6/10"
                            value={story.tolerance}
                            disabled={disabled}
                            onChange={(e) => set("tolerance", e.target.value)}
                        />
                    </div>

                    {/* Easing — "what helps" */}
                    <div className="cs-story-row">
                        <span className="cs-story-label">Better with</span>
                        <div className="cs-attach-tagrow">
                            {EASING_FACTORS.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-attach-chip${story.easing.includes(f.key) ? " is-on" : ""}`}
                                    onClick={() => set("easing", toggleIn(story.easing, f.key))}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 24-hour pattern — "how's it through the day and night" */}
                    <div className="cs-story-row">
                        <span className="cs-story-label">Pattern</span>
                        <div className="cs-attach-tagrow">
                            {STORY_PATTERNS.map((p) => (
                                <button
                                    key={p.key}
                                    type="button"
                                    disabled={disabled}
                                    className={`cs-attach-chip${story.pattern.includes(p.key) ? " is-on" : ""}`}
                                    onClick={() => set("pattern", toggleIn(story.pattern, p.key))}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Irritability — last, and judged rather than asked. See file header. */}
                    <div className="cs-story-row">
                        <span className="cs-story-label">
                            Irritability
                            <span className="cs-story-info" title="How easily this is provoked, and how long it takes to settle — how hard you can push today.">
                                <Info size={11} aria-hidden="true" />
                            </span>
                        </span>
                        <div className="cs-attach-tagrow">
                            {(Object.keys(IRRITABILITY_LABEL) as StoryIrritability[]).map((level) => {
                                const isSuggested = !story.irritability && suggestion?.value === level;
                                return (
                                    <button
                                        key={level}
                                        type="button"
                                        disabled={disabled}
                                        className={
                                            `cs-attach-chip${story.irritability === level ? " is-on" : ""}` +
                                            (isSuggested ? " is-suggested" : "")
                                        }
                                        title={isSuggested ? `Suggested — ${suggestion!.because}` : undefined}
                                        onClick={() => set("irritability", level)}
                                    >
                                        {IRRITABILITY_LABEL[level]}
                                        {isSuggested && <i className="cs-meas-mark" aria-hidden="true">+</i>}
                                    </button>
                                );
                            })}
                        </div>
                        {suggestion && !story.irritability && (
                            <p className="cs-story-because">Suggested: {suggestion.because}</p>
                        )}
                    </div>

                    {/* Revealed only at moderate/high irritability (story.ts's showSettling) */}
                    {showSettling(story) && (
                        <div className="cs-story-row">
                            <span className="cs-story-label">Settles in</span>
                            <div className="cs-attach-tagrow">
                                {(Object.keys(SETTLING_LABEL) as (keyof typeof SETTLING_LABEL)[]).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        disabled={disabled}
                                        className={`cs-attach-chip${story.settling === s ? " is-on" : ""}`}
                                        onClick={() => set("settling", s)}
                                    >
                                        {SETTLING_LABEL[s]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Last resort. Always here, never default. */}
                    <div className="cs-story-row">
                        <input
                            className="cs-attach-region-input"
                            placeholder="Anything a chip doesn't capture"
                            value={story.note}
                            disabled={disabled}
                            onChange={(e) => set("note", e.target.value)}
                        />
                    </div>
                </div>
            )}
        </section>
    );
}

export { isStoryEmpty };
