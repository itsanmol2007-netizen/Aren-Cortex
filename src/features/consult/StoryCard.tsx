// ---------------------------------------------------------------------------
// STORY CARD — physiotherapy's Subjective half, SEARCH-first.
//
// Rewritten 2026-08-20 against `docs/Cortex Specialties/AREN Cortex
// Physiotherapy Consultation UX Workflow Brief.md` §3, after the row-based
// version was tested live and failed the brief's own headline test: it was
// "a prettier paper form".
//
// ── What changed, and why the previous reasoning does not survive
//
// The old card rendered seven permanent rows — How long / Onset / Worse with
// / Better with / Pattern / Irritability / Settles in — and its header
// defended that: "every field renders at once — no hide-until-reached,
// because a doctor is listening to a patient talk, not stepping through a
// form."
//
// The premise was right and the conclusion was wrong. A clinician listening
// to a patient talk does not want SEVEN ROWS OF CHIPS either; showing every
// dimension at once is the same interrogation as a wizard, merely delivered
// all in one breath instead of one screen at a time. What that clinician
// wants is to type the two words the patient just said and have the system
// know which dimension they belong to. Brief §3:
//
//     Add to story…
//       → Knee pain          → Knee pain
//       → 3 weeks            → Knee pain · 3 weeks
//       → Gradual onset      → Knee pain · 3 weeks · Gradual onset
//
// So there is now ONE input. The dimensions did not go away — they became
// the SUB-LABEL on each confirmation chip, which is where a dimension
// belongs once its value is known. `story.ts` holds the flat searchable
// vocabulary; the `Story` shape written back is unchanged, so saved visits
// and `visit_story`'s columns are untouched by this.
//
// ── Progressive disclosure moved from rows to prompts
//
// `showMechanism` / `showSettling` still hold, but they now gate a PROMPT
// rather than a permanent row (see `nextStoryPrompts`). An unanswered
// dimension costs one line of quiet suggestion instead of a section of
// screen, and the clinician may stop at any point — brief §3's last line,
// and §12 rule 7.
//
// ── Irritability is still suggested, never assumed
//
// `suggestIrritability` survives intact. It surfaces as a one-click
// suggestion above the prompts with its reason stated, the same
// `is-suggested` + "why" convention `MeasureCell` uses. It never overrides
// an answer already given — still checked in `story-catalogue.mjs`.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search, Sparkles, X } from "lucide-react";
import type { Story, StorySearchItem } from "./story";
import {
    addToStory, removeFromStory, searchStory, selectedStoryItems,
    nextStoryPrompts, showMechanism, suggestIrritability, isStoryEmpty,
    STORY_SEARCH_ITEMS,
} from "./story";

interface Props {
    story: Story;
    onChange: (s: Story) => void;
    disabled?: boolean;
}

export function StoryCard({ story, onChange, disabled = false }: Props) {
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [noteOpen, setNoteOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const results = searchStory(query, story);
    const open = query.trim().length > 0;
    const chips = selectedStoryItems(story);
    const prompts = nextStoryPrompts(story);
    const suggestion = suggestIrritability(story);

    useEffect(() => { setActive(0); }, [query]);

    const take = (it: StorySearchItem) => {
        onChange(addToStory(story, it));
        setQuery("");
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = results[active];
            if (pick) take(pick);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery("");
        }
    };

    // The suggested irritability, as the real item it would add — so
    // confirming it goes through exactly the same path as typing it.
    const suggestedItem = suggestion
        ? STORY_SEARCH_ITEMS.find((it) => it.dimension === "Irritability" && it.key === suggestion.value)
        : undefined;

    return (
        <section className="cs-card cs-story" aria-label="Story">
            <div className="cs-card-head">
                <span className="cs-card-num" aria-hidden="true">1</span>
                <span className="cs-card-title">
                    Story
                    <em>What happened?</em>
                </span>
            </div>

            <div className="cs-story-body">
                <div className="cs-story-searchwrap">
                    <div className="cs-story-search">
                        <Search size={15} aria-hidden="true" />
                        <input
                            ref={inputRef}
                            value={query}
                            disabled={disabled}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKey}
                            placeholder="Add to story…"
                            aria-label="Add to story"
                            role="combobox"
                            aria-expanded={open}
                            aria-controls="cs-story-results"
                        />
                    </div>

                    {open && (
                        <div className="cs-story-results" id="cs-story-results" role="listbox">
                            {results.length === 0 ? (
                                <p className="cs-story-noresult">Nothing matches “{query.trim()}”</p>
                            ) : (
                                results.map((it, i) => (
                                    <button
                                        key={it.id}
                                        type="button"
                                        role="option"
                                        aria-selected={i === active}
                                        className={`cs-story-result${i === active ? " is-active" : ""}`}
                                        onMouseEnter={() => setActive(i)}
                                        onClick={() => take(it)}
                                    >
                                        <span className="cs-story-result-label">{it.label}</span>
                                        {/* The dimension, stated BEFORE it is committed, so
                                            the clinician sees the system's reading while
                                            disagreeing with it is still cheap. */}
                                        <span className="cs-story-result-dim">{it.dimension}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Confirmation display, not a checkbox grid — brief §1. Each
                    chip is a fact the clinician already committed; the
                    dimension rides along as its sub-label. */}
                {chips.length > 0 && (
                    <div className="cs-story-chips">
                        {chips.map((it) => (
                            <span key={it.id} className="cs-story-chip">
                                <Check size={13} className="cs-story-chip-tick" aria-hidden="true" />
                                <span className="cs-story-chip-text">
                                    <b>{it.label}</b>
                                    <em>{it.dimension}</em>
                                </span>
                                <button
                                    type="button"
                                    className="cs-story-chip-x"
                                    disabled={disabled}
                                    aria-label={`Remove ${it.label}`}
                                    onClick={() => onChange(removeFromStory(story, it))}
                                >
                                    <X size={12} aria-hidden="true" />
                                </button>
                            </span>
                        ))}
                        <button
                            type="button"
                            className="cs-story-more"
                            disabled={disabled}
                            onClick={() => inputRef.current?.focus()}
                        >
                            <Plus size={13} aria-hidden="true" />
                            Add more
                        </button>
                    </div>
                )}

                {/* Guided, not mandatory: the NEXT unanswered dimension only,
                    never all of them. Disappears entirely once answered, and
                    the clinician may ignore it and move on. */}
                {!open && prompts.length > 0 && (
                    <div className="cs-story-prompts">
                        <span className="cs-story-prompt-label">
                            {isStoryEmpty(story) ? "Start with" : prompts[0].dimension}
                        </span>
                        {prompts.map((it) => (
                            <button
                                key={it.id}
                                type="button"
                                className={
                                    "cs-story-prompt" +
                                    (suggestedItem && it.id === suggestedItem.id ? " is-suggested" : "")
                                }
                                disabled={disabled}
                                title={
                                    suggestedItem && it.id === suggestedItem.id
                                        ? `Suggested — ${suggestion!.because}`
                                        : undefined
                                }
                                onClick={() => take(it)}
                            >
                                {suggestedItem && it.id === suggestedItem.id && (
                                    <Sparkles size={11} aria-hidden="true" />
                                )}
                                {it.label}
                            </button>
                        ))}
                    </div>
                )}

                {suggestion && prompts.some((p) => p.dimension === "Irritability") && (
                    <p className="cs-story-because">Suggested: {suggestion.because}</p>
                )}

                {/* Free text, and only where a chip genuinely cannot carry the
                    fact. Mechanism appears only on a traumatic/post-surgical
                    onset — the one dimension with no closed vocabulary worth
                    having. Tolerance and the catch-all note stay one click
                    away rather than occupying the card forever. */}
                {showMechanism(story) && (
                    <input
                        className="cs-story-free"
                        placeholder="What happened — twisted it playing cricket…"
                        value={story.mechanism}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...story, mechanism: e.target.value })}
                    />
                )}

                {noteOpen || story.tolerance || story.note ? (
                    <div className="cs-story-freerow">
                        <input
                            className="cs-story-free"
                            placeholder="Tolerance — e.g. 10 min walking → 6/10"
                            value={story.tolerance}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...story, tolerance: e.target.value })}
                        />
                        <input
                            className="cs-story-free"
                            placeholder="Anything a chip doesn't capture"
                            value={story.note}
                            disabled={disabled}
                            onChange={(e) => onChange({ ...story, note: e.target.value })}
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        className="cs-story-notetoggle"
                        disabled={disabled}
                        onClick={() => setNoteOpen(true)}
                    >
                        <Plus size={12} aria-hidden="true" />
                        Tolerance or a note
                    </button>
                )}
            </div>
        </section>
    );
}

export { isStoryEmpty };
