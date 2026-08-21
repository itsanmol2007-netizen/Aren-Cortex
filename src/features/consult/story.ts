// ---------------------------------------------------------------------------
// THE STORY — how the symptom behaves, how hard the patient can be pushed
// today, and what they want back. Physiotherapy's Subjective half.
//
// Built 2026-08-17 for `docs/Cortex Specialties/physiotherapy-phase-1-plan.md`
// (read that file for the full reasoning — every decision here traces to a
// numbered section in it). This file is data and predicates, no React, same
// convention `measures.ts` and `trend.ts` already use: testable from a node
// script, and the one place the vocabulary lives so a new factor is a
// reviewed code change, not a migration (§4 of the plan).
//
// ── Rank vs record, decided PER ITEM and checked against real signals
//
// `signalId` is populated ONLY where a real, live signal exists in
// `signals` — checked in Postgres before this file was written, not
// assumed from clinical plausibility. Plan §12.2 classified several more
// items as "should rank" on clinical grounds (onset mode; aggravating by
// stairs/overhead reach/sitting/bending/twisting) — real distinctions, but
// with no signal content behind them yet. Writing a `signalId` against a
// signal that does not exist would be the exact class of bug
// `check:measures` exists to catch for `RELEVANT_FIELDS`, introduced by
// hand instead of by typo. Those items stay `signalId: null` — they
// record, they do not rank, until someone writes the signal and rule
// content. See plan §14 for the full audit.
//
// `guardCandidate: true` marks irritability and settling time — neither
// ranks a condition nor is discarded. They answer "how hard can I push
// today", the same question `SEVERE_HIGH_BP` already guards `exercise`
// with. Plan §13 is explicit that this stays inside the existing
// `intent_guards` mechanism (flag, not modify) and stays Phase 5 content,
// not Phase 1 — it needs real irritability data to calibrate against.
// ---------------------------------------------------------------------------

export type StoryDuration = "under_2wk" | "2_6wk" | "6wk_3mo" | "over_3mo";
export type StoryOnsetMode = "sudden" | "gradual" | "post_surgical" | "post_traumatic" | "unknown";
export type StoryIrritability = "low" | "moderate" | "high";
export type StorySettling = "immediate" | "under_5min" | "5_30min" | "over_30min" | "hours";

/** In-memory shape the UI edits. Mirrors `visit_story`'s columns exactly. */
export interface Story {
    duration: StoryDuration | null;
    /**
     * Exactly what was selected — "3 weeks" — where `duration` above is the
     * BUCKET that selection falls into ("2_6wk").
     *
     * Two fields because they answer to two different masters and always did.
     * `duration` is the ranked value: `DURATION_SIGNAL` maps it to PAIN_ACUTE
     * / PAIN_CHRONIC, and a bucket is the honest granularity for that, because
     * no rule anywhere distinguishes three weeks from four. `durationText` is
     * the RECORDED value, and there a bucket is a lie by rounding: the
     * clinician heard "three weeks", and a chart that reads back "2-6 weeks"
     * has quietly discarded what the patient said.
     *
     * Nullable, and null on every row written before 2026-08-20 — the chip
     * falls back to the bucket's own label when it is missing.
     */
    durationText: string | null;
    onsetMode: StoryOnsetMode | null;
    /** free text — revealed only on traumatic/post-surgical onset, see `showMechanism` */
    mechanism: string;
    irritability: StoryIrritability | null;
    /** free text — revealed only at moderate/high irritability, see `showSettling` */
    settling: StorySettling | null;
    /** keys into STORY_FACTORS where direction === "aggravating" */
    aggravating: string[];
    /** keys into STORY_FACTORS where direction === "easing" */
    easing: string[];
    /** keys into STORY_PATTERNS */
    pattern: string[];
    /** free text — "10 min walking -> 6/10". No honest parse into a signal; always record-only. */
    tolerance: string;
    /** last resort. Always optional, always reachable, never default. */
    note: string;
}

export function emptyStory(): Story {
    return {
        duration: null, durationText: null, onsetMode: null, mechanism: "",
        irritability: null, settling: null,
        aggravating: [], easing: [], pattern: [],
        tolerance: "", note: "",
    };
}

/** True only if every field is at its empty value — the "one collapsed line" test. */
export function isStoryEmpty(s: Story): boolean {
    return !s.duration && !s.onsetMode && !s.mechanism.trim()
        && !s.irritability && !s.settling
        && s.aggravating.length === 0 && s.easing.length === 0 && s.pattern.length === 0
        && !s.tolerance.trim() && !s.note.trim();
}

// ── Small closed vocabularies, rendered as chip rows ────────────────────────

export const DURATION_LABEL: Record<StoryDuration, string> = {
    under_2wk: "< 2 weeks", "2_6wk": "2–6 weeks", "6wk_3mo": "6 weeks – 3 months", over_3mo: "> 3 months",
};

export const ONSET_LABEL: Record<StoryOnsetMode, string> = {
    sudden: "Sudden", gradual: "Gradual", post_surgical: "Post-surgical",
    post_traumatic: "Injury", unknown: "Unknown",
};

export const IRRITABILITY_LABEL: Record<StoryIrritability, string> = {
    low: "Low", moderate: "Moderate", high: "High",
};

export const SETTLING_LABEL: Record<StorySettling, string> = {
    immediate: "Immediately", under_5min: "< 5 min", "5_30min": "5–30 min",
    over_30min: "> 30 min", hours: "Hours",
};

// ── Aggravating / easing factors ────────────────────────────────────────────

export interface StoryFactor {
    key: string;
    label: string;
    direction: "aggravating" | "easing";
    /** null = record only. See file header — populated only against a
     *  real, live signal, checked in Postgres, not assumed. */
    signalId: string | null;
}

export const STORY_FACTORS: StoryFactor[] = [
    // Aggravating. Real clinical discriminators (plan §12.2), but none has
    // signal content yet (plan §14) — all record-only for now.
    { key: "stairs_down", label: "Going downstairs", direction: "aggravating", signalId: null },
    { key: "stairs_up", label: "Going upstairs", direction: "aggravating", signalId: null },
    { key: "squatting", label: "Squatting", direction: "aggravating", signalId: null },
    { key: "prolonged_sitting", label: "Prolonged sitting", direction: "aggravating", signalId: null },
    { key: "prolonged_standing", label: "Prolonged standing", direction: "aggravating", signalId: null },
    { key: "bending_forward", label: "Bending forward", direction: "aggravating", signalId: null },
    { key: "twisting", label: "Twisting", direction: "aggravating", signalId: null },
    { key: "lifting", label: "Lifting", direction: "aggravating", signalId: null },
    { key: "overhead_reach", label: "Reaching overhead", direction: "aggravating", signalId: null },
    { key: "lying_affected_side", label: "Lying on that side", direction: "aggravating", signalId: null },
    { key: "rising_from_chair", label: "Rising from a chair", direction: "aggravating", signalId: null },
    { key: "walking", label: "Walking", direction: "aggravating", signalId: null },
    { key: "running", label: "Running", direction: "aggravating", signalId: null },
    { key: "driving", label: "Driving", direction: "aggravating", signalId: null },
    { key: "coughing_sneezing", label: "Coughing / sneezing", direction: "aggravating", signalId: null },
    { key: "general_activity", label: "Activity in general", direction: "aggravating", signalId: null },

    // Easing. Near-universal by design (plan §12.2) — "rest helps" is true
    // of almost every MSK complaint, so this category ranks essentially
    // nothing on purpose, not by oversight.
    { key: "rest", label: "Rest", direction: "easing", signalId: null },
    { key: "gentle_movement", label: "Gentle movement", direction: "easing", signalId: null },
    { key: "heat", label: "Heat", direction: "easing", signalId: null },
    { key: "ice", label: "Ice", direction: "easing", signalId: null },
    { key: "analgesia", label: "Painkillers", direction: "easing", signalId: null },
    { key: "position_change", label: "Changing position", direction: "easing", signalId: null },
    { key: "support_brace", label: "Support / brace", direction: "easing", signalId: null },
    { key: "stretching", label: "Stretching", direction: "easing", signalId: null },
];

export const AGGRAVATING_FACTORS = STORY_FACTORS.filter((f) => f.direction === "aggravating");
export const EASING_FACTORS = STORY_FACTORS.filter((f) => f.direction === "easing");

// ── 24-hour pattern ──────────────────────────────────────────────────────────

export interface StoryPattern {
    key: string;
    label: string;
    signalId: string | null;
}

export const STORY_PATTERNS: StoryPattern[] = [
    // Confirmed live against `signals` / `signal_intent_rules` (plan §14) —
    // STIFFNESS_MORNING (5 rules) and NIGHT_PAIN (1 rule), both real,
    // neither invented for this file.
    { key: "morning_stiffness_over_30", label: "Morning stiffness > 30 min", signalId: "STIFFNESS_MORNING" },
    { key: "night_pain", label: "Night pain", signalId: "NIGHT_PAIN" },
    // Real clinical items, no matching signal yet.
    { key: "morning_stiffness_under_30", label: "Morning stiffness < 30 min", signalId: null },
    { key: "worse_end_of_day", label: "Worse by end of day", signalId: null },
    { key: "worse_with_rest", label: "Worse with rest", signalId: null },
    { key: "worse_with_activity", label: "Worse with activity", signalId: null },
];

/** `story.duration` -> a real, live signal. Only the two clean matches —
 *  see plan §14 for why `2_6wk` / `6wk_3mo` (subacute) have none. */
export const DURATION_SIGNAL: Partial<Record<StoryDuration, string>> = {
    under_2wk: "PAIN_ACUTE",
    over_3mo: "PAIN_CHRONIC",
};

// ── Reveal predicates — the progressive-disclosure mechanism (plan §2) ─────
//
// Same shape as `RELEVANT_FIELDS` / `MeasurementsCard`'s inline+More split:
// a field is CORE (always shown), REVEALED (shown once the story itself
// makes it relevant), or otherwise DISCOVERABLE (reachable, never default).
// Only two fields are conditional at Phase 1; kept as named predicates
// rather than a generic table-driven engine because two rules do not earn
// an abstraction — Phase 3's examination section is where a table-driven
// version will actually pay for itself, and it can lift this shape then.

/** Mechanism: revealed only when the onset itself implies one worth asking about. */
export function showMechanism(s: Story): boolean {
    return s.onsetMode === "post_traumatic" || s.onsetMode === "post_surgical";
}

/** Settling time: revealed only when irritability is already moderate/high —
 *  exactly when dosing precision starts to matter. */
export function showSettling(s: Story): boolean {
    return s.irritability === "moderate" || s.irritability === "high";
}

/**
 * Irritability's pre-selection — a UI default, never a silent write. Mirrors
 * `MeasureCell`'s `suggested`/`because` convention: shown as a soft
 * suggestion with a stated reason, one click to confirm or override. Never
 * downgrades a value the doctor already picked.
 */
export function suggestIrritability(s: Story): { value: StoryIrritability; because: string } | null {
    if (s.irritability) return null; // doctor already answered — never override
    if (s.pattern.includes("night_pain")) {
        return { value: "high", because: "Night pain reported" };
    }
    if (s.pattern.includes("morning_stiffness_over_30")) {
        return { value: "moderate", because: "Morning stiffness over 30 minutes" };
    }
    return null;
}

// ── One searchable vocabulary (2026-08-20) ──────────────────────────────────
//
// The UX brief §3 rejects the fixed questionnaire this file's vocabularies
// were first rendered as — seven permanent rows, every dimension on screen
// at once. It asks for ONE input instead:
//
//     Add to story…  →  Knee pain · 3 weeks · Gradual onset · Worse
//                       downstairs · Better with rest
//
// So the dimensions stop being SECTIONS and become what they always were
// clinically: labelled facts, reached by search. Nothing below invents new
// vocabulary — every item is derived from the six lists already above, which
// is why `check:story` still validates the same `signalId` wiring it always
// did. The card renders this flat list; the `Story` shape it writes back to
// is byte-identical to what the row-based card wrote, so saved visits,
// `visit_story`'s columns and the Phase 5 guard work are all untouched.
//
// `single: true` marks a dimension that holds one value (duration, onset,
// irritability, settling). Picking a second REPLACES the first rather than
// adding to it — which is the behaviour the old single-select rows had, kept
// exactly, just without a row to hold it.

/** The dimension a story item belongs to. Doubles as the chip's sub-label. */
export type StoryDimension =
    | "Duration" | "Onset" | "Aggravating" | "Easing" | "Pattern"
    | "Irritability" | "Settles in";

export interface StorySearchItem {
    /** unique within the list — `${dimension}:${key}` */
    id: string;
    /** the value written into `Story`, e.g. "under_2wk" or "stairs_down" */
    key: string;
    label: string;
    dimension: StoryDimension;
    /** one value only: picking again replaces rather than appends */
    single: boolean;
    /** extra words the search should match on, beyond the label itself */
    synonyms: string[];
}

function item(
    key: string, label: string, dimension: StoryDimension,
    single: boolean, synonyms: string[] = [],
): StorySearchItem {
    return { id: `${dimension}:${key}`, key, label, dimension, single, synonyms };
}

/**
 * Everything a clinician can add to the story, in ONE list.
 *
 * Order matters only as a tiebreak inside an equal search rank, and it runs
 * in the sequence a patient actually narrates — how long, how it started,
 * what brings it on, what helps, how it behaves, then irritability, which is
 * judged after hearing all of the above rather than asked.
 */
/**
 * How long, as a clinician actually says it.
 *
 * The four `DURATION_LABEL` buckets are what gets STORED and ranked; these are
 * what gets typed and shown. A physiotherapist hearing "about three weeks"
 * types `3` and expects `3 days / 3 weeks / 3 months` back — not a menu of
 * ranges to mentally bin the answer into, which is the form-filling the whole
 * brief is written against.
 *
 * Several items therefore share one `key`: "3 weeks" and "4 weeks" are both
 * `2_6wk`. That is why `storyHas` compares Duration on `durationText` rather
 * than on the key — otherwise picking "3 weeks" would light "4 weeks" too.
 *
 * Boundaries follow the bucket labels literally: `under_2wk` is "< 2 weeks",
 * so two weeks itself is the first `2_6wk` entry.
 */
const DURATION_TERMS: { label: string; bucket: StoryDuration }[] = [
    { label: "2 days", bucket: "under_2wk" },
    { label: "3 days", bucket: "under_2wk" },
    { label: "5 days", bucket: "under_2wk" },
    { label: "1 week", bucket: "under_2wk" },
    { label: "10 days", bucket: "under_2wk" },
    { label: "2 weeks", bucket: "2_6wk" },
    { label: "3 weeks", bucket: "2_6wk" },
    { label: "4 weeks", bucket: "2_6wk" },
    { label: "5 weeks", bucket: "2_6wk" },
    { label: "6 weeks", bucket: "6wk_3mo" },
    { label: "2 months", bucket: "6wk_3mo" },
    { label: "3 months", bucket: "6wk_3mo" },
    { label: "4 months", bucket: "over_3mo" },
    { label: "6 months", bucket: "over_3mo" },
    { label: "9 months", bucket: "over_3mo" },
    { label: "1 year", bucket: "over_3mo" },
    { label: "2 years", bucket: "over_3mo" },
    { label: "Several years", bucket: "over_3mo" },
];

export const STORY_SEARCH_ITEMS: StorySearchItem[] = [
    ...DURATION_TERMS.map(({ label, bucket }) => ({
        // `id` carries the label, not the bucket — four items would otherwise
        // collide on `Duration:2_6wk` and React would render duplicate keys.
        id: `Duration:${label}`,
        key: bucket,
        label,
        dimension: "Duration" as const,
        single: true,
        synonyms: ["how long", "duration", "since", "for"],
    })),

    ...(Object.keys(ONSET_LABEL) as StoryOnsetMode[]).map((o) =>
        item(o, `${ONSET_LABEL[o]} onset`, "Onset", true, ["started", "began", "onset"])),

    ...AGGRAVATING_FACTORS.map((f) =>
        item(f.key, f.label, "Aggravating", false, ["worse", "aggravated by", "brings it on"])),

    ...EASING_FACTORS.map((f) =>
        item(f.key, f.label, "Easing", false, ["better", "eases", "relieved by", "helps"])),

    ...STORY_PATTERNS.map((p) =>
        item(p.key, p.label, "Pattern", false, ["pattern", "through the day", "24 hour"])),

    ...(Object.keys(IRRITABILITY_LABEL) as StoryIrritability[]).map((level) =>
        item(level, `${IRRITABILITY_LABEL[level]} irritability`, "Irritability", true,
            ["irritability", "provoked", "how hard to push"])),

    ...(Object.keys(SETTLING_LABEL) as StorySettling[]).map((s) =>
        item(s, `Settles ${SETTLING_LABEL[s].toLowerCase()}`, "Settles in", true,
            ["settles", "settling", "calms down", "how long to settle"])),
];

/** Where each dimension's value lives on `Story`. */
const FIELD_OF: Record<StoryDimension, keyof Story> = {
    Duration: "duration", Onset: "onsetMode", Aggravating: "aggravating",
    Easing: "easing", Pattern: "pattern", Irritability: "irritability",
    "Settles in": "settling",
};

/** Is this item already part of the story? */
export function storyHas(s: Story, it: StorySearchItem): boolean {
    // Duration is the one dimension where several items share a key (see
    // DURATION_TERMS), so the key cannot answer this — "3 weeks" and
    // "4 weeks" are both `2_6wk`, and comparing keys would light both.
    if (it.dimension === "Duration") return s.durationText === it.label;
    const field = FIELD_OF[it.dimension];
    const value = s[field];
    return Array.isArray(value) ? value.includes(it.key) : value === it.key;
}

/**
 * Add an item to the story. Multi-select dimensions append; single-select
 * dimensions replace, which is what the old one-row-per-dimension card did
 * implicitly by only ever rendering one `is-on` chip.
 */
export function addToStory(s: Story, it: StorySearchItem): Story {
    // Duration writes BOTH halves at once — the bucket that ranks and the
    // words that were actually said. They must never disagree, which is why
    // nothing else in this file ever sets one without the other.
    if (it.dimension === "Duration") {
        return { ...s, duration: it.key as StoryDuration, durationText: it.label };
    }
    const field = FIELD_OF[it.dimension];
    const value = s[field];
    if (Array.isArray(value)) {
        if (value.includes(it.key)) return s;
        return { ...s, [field]: [...value, it.key] };
    }
    return { ...s, [field]: it.key };
}

/** Remove an item. Clearing irritability also clears settling, which only
 *  exists as a follow-up to it (`showSettling`) and would otherwise be
 *  stranded in the record with nothing to qualify. */
export function removeFromStory(s: Story, it: StorySearchItem): Story {
    if (it.dimension === "Duration") return { ...s, duration: null, durationText: null };
    const field = FIELD_OF[it.dimension];
    const value = s[field];
    const next: Story = Array.isArray(value)
        ? { ...s, [field]: value.filter((k) => k !== it.key) }
        : { ...s, [field]: null };
    if (it.dimension === "Irritability") next.settling = null;
    return next;
}

/**
 * The story as it currently stands, in narration order — this is what the
 * card renders as confirmation chips and what `storyLine` joins into the
 * one-line summary the brief asks for.
 */
export function selectedStoryItems(s: Story): StorySearchItem[] {
    const picked = STORY_SEARCH_ITEMS.filter((it) => storyHas(s, it));
    // A story saved before `duration_text` existed has a bucket and no words.
    // Synthesise the chip from the bucket's own label rather than dropping the
    // duration off the chart entirely — the fact was recorded, only its
    // precision was lost, and `removeFromStory` still clears it correctly
    // because it keys off the dimension.
    if (s.duration && !s.durationText) {
        picked.unshift({
            id: `Duration:${s.duration}`, key: s.duration,
            label: DURATION_LABEL[s.duration], dimension: "Duration",
            single: true, synonyms: [],
        });
    }
    return picked;
}

/** "3 weeks · Gradual onset · Worse downstairs · Better with rest" */
export function storyLine(s: Story): string {
    return selectedStoryItems(s).map((it) => it.label).join(" · ");
}

/**
 * The word that joins a dimension to the complaint it belongs to.
 *
 * These exist because the chips were wrong about what they were. A story is
 * not seven facts that happen to share a patient — it is ONE statement:
 * "knee pain for 3 weeks, gradual onset, worse going upstairs, better with
 * rest". Rendering that as a chip grid throws the relationships away and
 * leaves the reader to reassemble the sentence in their head, every time.
 *
 * Empty string where the label already reads as a clause on its own
 * ("Gradual onset", "Low irritability", "Morning stiffness > 30 min") —
 * bolting a connective onto those produces "with gradual onset", which is
 * worse than nothing.
 */
const STORY_CONNECTIVE: Record<StoryDimension, string> = {
    Duration: "for",
    Onset: "",
    Aggravating: "worse with",
    Easing: "better with",
    Pattern: "",
    Irritability: "",
    "Settles in": "",
};

export interface StoryClause {
    item: StorySearchItem;
    /** the connective, or "" when the label stands alone */
    lead: string;
    /** the label as it reads mid-sentence */
    text: string;
}

/**
 * The story as clauses, in narration order — what the sheet renders as a
 * running sentence rather than as a row of tiles.
 *
 * Lower-cased mid-sentence unless the label is doing something typographic
 * that would break (a ">" threshold, a unit), because "Knee pain for 3 weeks,
 * Gradual onset, Worse With Going Upstairs" reads like a form and not like a
 * clinician's note.
 */
export function storyClauses(s: Story): StoryClause[] {
    return selectedStoryItems(s).map((item) => {
        const lead = STORY_CONNECTIVE[item.dimension];
        // Leave a label alone if it opens with anything but a plain capital —
        // a symbol, a digit, an abbreviation — where lower-casing either does
        // nothing or damages it.
        const text = /^[A-Z][a-z]/.test(item.label)
            ? item.label.charAt(0).toLowerCase() + item.label.slice(1)
            : item.label;
        return { item, lead, text };
    });
}

/**
 * Rank items against a typed query. Same shape as the Case Sheet's own
 * catalogue search — prefix beats word-start beats substring — so the two
 * search surfaces on this screen behave identically under the hand rather
 * than each having its own idea of a good match.
 */
export function searchStory(query: string, s: Story, limit = 8): StorySearchItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const ranked: { it: StorySearchItem; r: number }[] = [];
    for (const it of STORY_SEARCH_ITEMS) {
        if (storyHas(s, it)) continue; // already said — never offer it twice
        const label = it.label.toLowerCase();
        let r = 99;
        if (label.startsWith(q)) r = 0;
        else if (label.includes(` ${q}`)) r = 1;
        else if (label.includes(q)) r = 2;
        else if (it.dimension.toLowerCase().startsWith(q)) r = 3;
        else if (it.synonyms.some((w) => w.includes(q))) r = 4;
        if (r < 99) ranked.push({ it, r });
    }
    return ranked.sort((a, b) => a.r - b.r).slice(0, limit).map((x) => x.it);
}

/**
 * What to offer when the field is empty — the "guided" half of guided
 * autocomplete. Progressive disclosure lives HERE now rather than in reveal
 * predicates on permanent rows: the card asks what is missing, in narration
 * order, and stops asking the moment the clinician stops answering.
 *
 * `showMechanism` / `showSettling` above still hold; they simply gate a
 * prompt instead of a row, so an unanswered dimension costs one line of
 * suggestion rather than a permanent section of screen.
 */
export function nextStoryPrompts(s: Story, limit = 6): StorySearchItem[] {
    const dimension = openStoryDimensions(s)[0];
    if (!dimension) return [];
    return itemsForDimension(s, dimension, limit);
}

/**
 * The dimensions this story has not answered yet, in narration order.
 *
 * The composer walks this list, and the clinician walks it too — forwards on
 * skip, and never forced. It is a list of what is MISSING, not a sequence that
 * has to be completed: a physiotherapist who wants to record severity before
 * duration types "severe" and the search finds it regardless of which slot is
 * currently offered. The slot decides what is SUGGESTED into an empty box and
 * nothing else.
 */
export function openStoryDimensions(s: Story): StoryDimension[] {
    const wanted: StoryDimension[] = [];
    if (!s.duration) wanted.push("Duration");
    if (!s.onsetMode) wanted.push("Onset");
    if (s.aggravating.length === 0) wanted.push("Aggravating");
    if (s.easing.length === 0) wanted.push("Easing");
    if (s.pattern.length === 0) wanted.push("Pattern");
    if (!s.irritability) wanted.push("Irritability");
    if (showSettling(s) && !s.settling) wanted.push("Settles in");
    return wanted;
}

/** The unpicked items of one dimension — what a slot offers when it is current. */
export function itemsForDimension(
    s: Story, dimension: StoryDimension, limit = 6
): StorySearchItem[] {
    return STORY_SEARCH_ITEMS
        .filter((it) => it.dimension === dimension && !storyHas(s, it))
        .slice(0, limit);
}

/**
 * What the composer calls a slot while the clinician is standing in it.
 *
 * The dimension NAME is the wrong prompt on its own — "Aggravating" is a
 * database word, and a physiotherapist does not think "I am now entering the
 * aggravating dimension". The question is what they are actually being asked.
 */
export const DIMENSION_PROMPT: Record<StoryDimension, string> = {
    Duration: "how long",
    Onset: "how it started",
    Aggravating: "what makes it worse",
    Easing: "what makes it better",
    Pattern: "how it behaves",
    Irritability: "how easily provoked",
    "Settles in": "how long it settles",
};
