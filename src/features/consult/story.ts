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
        duration: null, onsetMode: null, mechanism: "",
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
