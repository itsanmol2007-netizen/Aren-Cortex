// ---------------------------------------------------------------------------
// POSSIBLE CONDITIONS — the engine's reading of the chart.
//
// This was called "Possible Finding" and lived inside Clinical Suggestions,
// between investigations and advice. Two things were wrong with that:
//
//  * THE NAME. Cortex already has a panel called Findings, and it means
//    something else entirely — what the doctor saw on examination. One is an
//    input the doctor records, the other is an output the engine proposes.
//    Sharing a word between them is how a doctor comes to believe the system
//    examined the patient. They are kept separate and named separately: the
//    examination panel keeps "Findings", this one is "Possible Conditions".
//
//  * THE PLACE. A reading of the chart belongs beside the chart, not four
//    sections down a list of things to order. It sits in the entry band now
//    and re-ranks in the same frame a chip lands, so the doctor sees their own
//    reasoning move as they type.
//
// ── What the heading has to say, and why ──────────────────────────────────
// It reads from SYMPTOMS, EXAMINATION FINDINGS AND MEASUREMENTS alike — the
// engine receives one flat set of observations plus a set of numbers and cannot
// tell which surface any of them came from. A doctor who believed this panel
// only reflected the symptom chips would read a list that silently included
// their blood-pressure reading and wonder why it disagreed with them. The
// subtitle says so in as many words.
//
// The plural is load-bearing too. Ranking IS the safety property here (handoff
// §1): a named condition shown at rank 1 alongside three alternatives is
// honest, and the same label shown alone reads as a verdict. Nothing in this
// panel is ever presented as the cause.
// ---------------------------------------------------------------------------

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, MapPin, PersonStanding, Plus, ShieldAlert, Stethoscope, X } from "lucide-react";
import type { AssessmentLine } from "./assessmentPlan";
import { isAnatomicalAssessment } from "./assessmentFamilies";
import type { ActiveSignal, IntentType, Ruleset } from "../../lib/synapse/engine";
import type { DoctorFreeTerm } from "../../lib/db/synapse";
import { matchingFreeTerms, topFreeTermMatches } from "./freeTerms";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import { GuardReason, RANKED_ROW_H, RELEVANCE_TEXT, ThinkingRing, rankFillOf, relevanceOf } from "./parts";
import { CASCADE_STAGE, cascadeRowProps, rankOrderKey, useRankCascade } from "./cascade";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";
import { BlankConditionArt, BlankSelectedArt } from "./BlankArt";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

/** Rows shown before the panel asks. */
const CAP = 4;

/** Now `RANKED_ROW_H` in parts.tsx — shared with SuggestionsCard's capped
 *  list, see that constant's doc comment for why this moved out of here. */
const ROW_H = RANKED_ROW_H;

interface Props {
    /** the ranked `finding` intents, in engine order */
    intents: PersonalizedIntent[];
    /** the strongest score among them — the relevance denominator */
    topScore: number;
    /** "Synapse is thinking" cue — see ThinkingRing in parts.tsx */
    thinkingKey: string;
    acceptedIntentIds: Set<number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    /** opens the contribution sheet for one row */
    onExplain: (intent: PersonalizedIntent, anchor: DOMRect) => void;
    /** for the guard verdict on a searched, never-ranked condition */
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    hasChart: boolean;
    /** the doctor's confirmed assessment, in confirmation order */
    diagnoses: string[];
    onRemoveDiagnosis: (label: string) => void;
    /**
     * Undo an accept found through search, right on the hit — §9, 2026-08-24.
     * The ranked list's own confirmed rows use `onRemoveDiagnosis` directly
     * (a finding is the one type this card ever ranks), so this is only
     * threaded to `IntentSearchResults`, which spans every type search can
     * reach here.
     */
    onRemove?: (intentId: number, type: IntentType, label: string) => void;
    /**
     * The free-text fallback — §4, 2026-08-24. "if I don't get 'Cardio
     * Aquinian' in Assessment, I can simply add it as a new free text" —
     * Anmol's own example. `freeTerms` is this doctor's WHOLE remembered
     * list across every type it covers (Supabase-backed, `useSynapse`) —
     * this card filters it to `type === "finding"` itself, the same way
     * `SuggestionsCard` filters it to whichever tab is active.
     * `onAddFreeText` both puts a label straight onto `diagnoses` (no
     * catalogue intent behind it — `diagnoses` has always been a plain
     * string array, see `useConsultPlan.ts`) and saves/bumps it against
     * today's active signals AND accepted intents so a similar chart
     * surfaces it again next time. Optional so this card keeps working
     * unwired anywhere that has no doctor identity to save against.
     */
    freeTerms?: DoctorFreeTerm[];
    onAddFreeText?: (label: string) => void;
    disabled?: boolean;
    /** the Assessment Tab stop — see STOPS in useConsultKeyboard.ts */
    searchRef?: React.RefObject<HTMLInputElement>;
    /**
     * What occupies this card's SECOND column, when a specialty has something
     * better to put there than the confirmed list.
     *
     * ── Why the confirmed column was worth giving up (2026-08-16)
     *
     * Anmol, looking at the real screen: "that's essentially a useless thing,
     * because it is already visible which you have selected." He is right, and
     * this file already admitted as much — the comment on that column records
     * that its blank state left roughly 230px of white space and calls it the
     * largest single void on a WORKING screen. Everything it showed is also in
     * the Consultation Plan rail, three inches to the right, permanently.
     *
     * So a profile with an instrument — a dentist's odontogram, a
     * dermatologist's or physiotherapist's body map — puts it here instead:
     * beside the assessment it informs, at the moment the doctor is forming
     * one. The instrument itself still opens in `ChartSurface`; this column
     * holds the launcher and its one-line extract, which is the shape
     * `SpecialtyExamCard` already had.
     *
     * The one thing that had to survive the swap is WHICH DIAGNOSIS IS
     * PRIMARY — a convention this card used to carry and the engine is
     * forbidden from deciding. `PlanCard` marks it now.
     *
     * Absent means the confirmed column renders exactly as before, so General
     * OPD and every profile with no chart is untouched.
     */
    sideSlot?: React.ReactNode;
    /**
     * The structure behind site-placed assessments ("Fracture — Left knee").
     * Each line's text is also in `diagnoses`; these let the ranked row show
     * its sites as pills, reopen one to edit, and add another. Absent means
     * no assessment ever asks for a site (older callers).
     */
    assessmentLines?: AssessmentLine[];
    onEditAssessmentLine?: (id: string) => void;
    onAddAssessmentSite?: (intentId: number | null, label: string) => void;
}

/** The small marker on an assessment that will ask where on the body. */
function SiteMarker() {
    return (
        <span className="cs-dx-sitemark" title="Asks where on the body">
            <PersonStanding size={12} aria-hidden="true" />
        </span>
    );
}

/** "Left knee, open, displaced" — a line's text without its own headline. */
function siteText(line: AssessmentLine): string {
    const prefix = `${line.label} — `;
    return line.text.startsWith(prefix) ? line.text.slice(prefix.length) : line.text;
}

export function ConditionsCard({
    intents, topScore, thinkingKey, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    onExplain, ruleset, activeSignals, hasChart,
    diagnoses, onRemoveDiagnosis, onRemove, freeTerms = [], onAddFreeText,
    disabled = false, searchRef, sideSlot,
    assessmentLines = [], onEditAssessmentLine, onAddAssessmentSite,
}: Props) {
    const siteAware = !!onEditAssessmentLine;
    const lineByText = useMemo(() => new Map(assessmentLines.map((l) => [l.text, l])), [assessmentLines]);
    const linesOf = (intent: PersonalizedIntent) =>
        assessmentLines.filter((l) =>
            (l.intentId != null && l.intentId === intent.intentId)
            || l.label.trim().toLowerCase() === intent.label.trim().toLowerCase());
    const [expanded, setExpanded] = useState(false);
    const reduce = useReducedMotion();
    const search = useIntentSearch(["finding"]);

    /** the labels already confirmed — nothing to suggest re-adding */
    const takenLabels = useMemo(() => new Set(diagnoses), [diagnoses]);

    /**
     * §1 follow-up, 2026-08-24: "added Clinical Assessment don't appear
     * anywhere except Sidebar" — a free-text diagnosis used to vanish the
     * instant it was added: `topFreeTermMatches`/`matchingFreeTerms` both
     * dropped taken labels, and nothing rendered a free entry back into the
     * ranked list. Fixed two ways below — this Set is the instant half.
     * `freeTerms` (the Supabase-backed list) only catches up after
     * `synapse.reload()` resolves, which is a real round trip; tracking
     * what THIS session just added locally means the row appears the same
     * frame the doctor clicks it, not a moment later.
     */
    const [freeAddedNow, setFreeAddedNow] = useState<Set<string>>(new Set());
    const isFreeLabel = (label: string) =>
        freeAddedNow.has(label) || freeTerms.some((f) => f.type === "finding" && f.label === label);
    const addFree = (label: string) => {
        if (!onAddFreeText) return;
        onAddFreeText(label);
        setFreeAddedNow((curr) => new Set(curr).add(label));
        search.setQuery("");
    };

    /**
     * This doctor's free-text terms that match THIS chart, best match first
     * — the "show this to that doctor in future for similar inputs" half of
     * §4. Scored on signal overlap AND accepted-intent overlap together —
     * see `scoreFreeTerm` in `freeTerms.ts` for why the second counts more.
     */
    const suggestedFreeTerms = useMemo(() => {
        if (!freeTerms.length) return [];
        const activeSignalIds = new Set(activeSignals.map((s) => s.signalId));
        return topFreeTermMatches(freeTerms, "finding", activeSignalIds, acceptedIntentIds, takenLabels);
    }, [freeTerms, activeSignals, acceptedIntentIds, takenLabels]);

    /**
     * The same list, filtered to what is actually typed — for search mode.
     * Includes already-added terms now (§1 follow-up) — `matchingFreeTerms`
     * no longer drops them, `FreeTextFallback` renders the taken ones as
     * removable instead of hiding them, the same split a catalogue hit
     * already gets in `IntentSearchResults`.
     */
    const matchedFreeTerms = useMemo(
        () => matchingFreeTerms(freeTerms, "finding", search.query),
        [freeTerms, search.query]
    );

    /**
     * This card is the second Tab stop, so its search field is where a doctor
     * arrives with their hands already on the keyboard — it needs the same
     * walk-and-take the medicines panel has. See `useRovingList` for why the
     * cursor is in the DOM rather than in state here: this list re-ranks in the
     * same frame a chip lands on the case sheet above it.
     */
    const listRef = useRef<HTMLDivElement>(null);
    const roving = useRovingList({
        containerRef: listRef,
        // ".cs-sug" is what a SEARCH hit renders as (IntentSearchResults) —
        // the RANKED list renders `ConditionRow`, a bespoke Tailwind
        // component that carries neither `cs-sug` nor `cs-act`. Missing that
        // meant ↓ found zero rows and did nothing the instant a doctor
        // wasn't searching, which is the only state most doctors are in.
        // `.cx-cond-row`/`.cx-cond-act` are pure selector hooks on
        // `ConditionRow` below — no styling of their own, same convention as
        // `ActiveConsultGuard`'s `.cx-guard-opt`.
        rowSelector: ".cs-sug, .cx-cond-row",
        actionSelector: "button.cs-act, button.cx-cond-act",
        enabled: !disabled,
    });

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const move = firedChord(e, "conditionMove");
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            roving.move(move.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (matches(e, "conditionTake")) {
            e.preventDefault();
            e.stopPropagation();
            roving.activate();
        }
    };

    const isConditionConfirmed = (intent: PersonalizedIntent) => {
        if (acceptedIntentIds.has(intent.intentId)) return true;
        const target = intent.label.trim().toLowerCase();
        return diagnoses.some((d) => d.trim().toLowerCase() === target);
    };

    const sortedIntents = useMemo(() => {
        const confirmed: PersonalizedIntent[] = [];
        const unconfirmed: PersonalizedIntent[] = [];
        for (const i of intents) {
            if (isConditionConfirmed(i)) {
                confirmed.push(i);
            } else {
                unconfirmed.push(i);
            }
        }
        return [...confirmed, ...unconfirmed];
    }, [intents, acceptedIntentIds, diagnoses]);

    const shown = expanded
        ? sortedIntents
        : [
            ...sortedIntents.slice(0, CAP),
            // Anything already confirmed stays visible regardless of the cap.
            ...sortedIntents.slice(CAP).filter(isConditionConfirmed),
        ];
    const hidden = intents.length - shown.length;

    /**
     * Confirmed diagnoses (from Repeat Rx, past visits, or manual additions) that
     * do not correspond to an engine-ranked intent in `shown`.
     * Pinned prominently at the top of the Assessment list so the doctor
     * always has full visibility and 1-click removal of every confirmed diagnosis.
     */
    const unrankedConfirmed = useMemo(() => {
        return diagnoses.filter((d) => {
            const target = d.trim().toLowerCase();
            if (shown.some((i) => i.label.trim().toLowerCase() === target)) return false;
            // A site line of a ranked assessment shows as a pill on that row.
            const line = lineByText.get(d);
            if (line && shown.some((i) =>
                (line.intentId != null && line.intentId === i.intentId)
                || line.label.trim().toLowerCase() === i.label.trim().toLowerCase())) return false;
            return true;
        });
    }, [diagnoses, shown, lineByText]);

    // Stage 0 of the cascade — the head, so it starts at 0ms. Assessment is
    // what the doctor's signals resolve into first; everything downstream
    // leads off this panel. Keyed on what is actually RENDERED (`shown`), so
    // unlocking "Show more" cascades the newly revealed rows in too.
    const cascade = useRankCascade(CASCADE_STAGE.assessment, rankOrderKey(shown), listRef);

    // Collapsed, the list already holds only CAP rows (plus confirmed ones),
    // so its box is sized to what those rows actually measure. A fixed
    // CAP × ROW_H clipped the last row once a confirmed assessment grew a
    // second line of site pills.
    const [collapsedH, setCollapsedH] = useState(CAP * ROW_H);
    useLayoutEffect(() => {
        if (expanded || search.isSearching || !listRef.current) return;
        const h = listRef.current.scrollHeight;
        if (h > 0 && h !== collapsedH) setCollapsedH(h);
    });

    const rankedIds = useMemo(
        () => new Set(intents.map((i) => i.intentId)),
        [intents]
    );

    const body = () => {
        if (search.isSearching) {
            return (
                <>
                    <IntentSearchResults
                        state={search}
                        verbOf={() => "Confirm"}
                        nameBadge={siteAware
                            ? (label, type) => (type === "finding" && isAnatomicalAssessment(label) ? <SiteMarker /> : null)
                            : undefined}
                        ruleset={ruleset}
                        activeSignals={activeSignals}
                        rankedIntentIds={rankedIds}
                        acceptedIntentIds={acceptedIntentIds}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                        onAccept={onAccept}
                        onRemove={onRemove}
                    />
                    {onAddFreeText && !search.loading && (
                        <FreeTextFallback
                            query={search.query}
                            matches={matchedFreeTerms}
                            takenLabels={takenLabels}
                            onAdd={addFree}
                            onRemove={onRemoveDiagnosis}
                        />
                    )}
                </>
            );
        }

        if (!hasChart && unrankedConfirmed.length === 0) {
            return (
                <div className="cs-empty">
                    <BlankConditionArt />
                    <strong>Nothing to read yet</strong>
                    <span>Conditions appear as you add symptoms and findings.</span>
                </div>
            );
        }

        if (intents.length === 0 && unrankedConfirmed.length === 0) {
            return (
                <div className="cs-empty">
                    <BlankConditionArt />
                    <strong>No condition ranks for this chart</strong>
                    <span>Search above to add one.</span>
                </div>
            );
        }

        return [
            ...unrankedConfirmed.map((label, i) => {
                const line = lineByText.get(label);
                return (
                    <FreeConditionRow
                        key={`unranked-${label}`}
                        label={label}
                        cascadeDelay={cascade.delayOf(i)}
                        onRemove={() => onRemoveDiagnosis(label)}
                        onEdit={line && onEditAssessmentLine ? () => onEditAssessmentLine(line.id) : undefined}
                        onAddSite={line && onAddAssessmentSite ? () => onAddAssessmentSite(line.intentId, line.label) : undefined}
                    />
                );
            }),
            ...shown.map((intent, i) => (
            <ConditionRow
                key={intent.intentId}
                intent={intent}
                rank={i + 1}
                /* Continues the run started by the confirmed rows above, so
                   the wave never restarts halfway down one list. */
                cascadeDelay={cascade.delayOf(unrankedConfirmed.length + i)}
                // A list of one has no other side to the comparison, and the
                // word could only ever read "High relevance" however weakly the
                // engine scored it.
                relevance={
                    intents.length > 1
                        ? RELEVANCE_TEXT[relevanceOf(rankFillOf(intent, topScore))]
                        : null
                }
                confirmed={isConditionConfirmed(intent)}
                anatomical={siteAware && isAnatomicalAssessment(intent.label)}
                sites={siteAware ? linesOf(intent) : []}
                onEditSite={(id) => onEditAssessmentLine?.(id)}
                onRemoveSite={(text) => onRemoveDiagnosis(text)}
                onAddSite={() => onAddAssessmentSite?.(intent.intentId, intent.label)}
                acknowledged={acknowledged.has(intent.intentId)}
                onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                onExplain={(rect) => onExplain(intent, rect)}
                onRemove={() => onRemoveDiagnosis(intent.label)}
                onAccept={() =>
                    onAccept({
                        intentId: intent.intentId,
                        type: intent.type,
                        label: intent.label,
                        refTable: intent.refTable,
                        refId: intent.refId,
                        medicine: null,
                        viaSearch: false,
                        overridden: intent.status === "warn_hard",
                    })
                }
            />
            )),
        ];
    };

    // The doctor's own assessment, in the order they confirmed it. First is
    // PRIMARY, the rest are SECONDARY — a convention, not a derivation: the
    // engine never decides which diagnosis is primary, because that is the one
    // judgement in this workspace that is entirely the doctor's.
    const [primaryDx, ...secondaryDx] = diagnoses;

    // Whether there is anything at all for the ranked column to show — an
    // engine rank, OR a confirmed diagnosis pinned above them.
    const hasAnyConditions = intents.length > 0 || diagnoses.length > 0;

    return (
        <section
            aria-label="Assessment"
            // `cs-assess` carries the one piece of hierarchy this card needs
            // and Tailwind should not own: it is the pivot of the screen —
            // everything above feeds it, everything below reads from it — and
            // it was rendering as one more white card in a stack of five. A
            // stronger edge and one more degree of lift, in consult.css beside
            // the tokens it depends on.
            className="cs-assess flex min-w-0 flex-col rounded-[var(--cs-radius)] border border-[var(--cs-line)] bg-[var(--cs-card)] pb-4 shadow-[var(--cs-shadow)]"
        >
            {/* ── ONE GRID, FROM THE TOP ──────────────────────────────────
                Assessment's own icon/title/search used to sit OUTSIDE this
                grid, full card width — which put it visually "above" the
                sideSlot too, and a doctor reads a bar spanning both columns
                as the search for BOTH of them. "Investigation is not a
                subsection of Assessment, they are two sections living side
                by side" — §1/§2, 2026-08-25. Scoping the header AND the
                search field to the left column, and starting both columns
                on the same row, is what makes them read as siblings instead
                of section-and-subsection: `sideSlot` (Investigations, when
                that's what this is) carries its own icon/title/search at
                the SAME height Assessment's now sits at, not a level below
                it.

                Retains the 2-column layout while searching so Assessment search
                stays confined to the left column and the right column (sideSlot
                or confirmed diagnoses) remains visible side-by-side. */}
            <div className="grid gap-4 px-4 pt-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                {/* left: Assessment's identity, then either search results or
                    the ranked list */}
                <div className="min-w-0 flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {/* `cs-glyph-live` is the one plain-CSS class on an
                                otherwise Tailwind icon — it only supplies
                                `position: relative` for ThinkingRing to anchor
                                to; see consult.css. */}
                            <span className="cs-glyph-live grid size-[26px] flex-none place-items-center rounded-lg bg-[linear-gradient(180deg,#f7f2ff_0%,#ede2fe_100%)] text-[#6d28d9] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                                <ThinkingRing pulseKey={thinkingKey} />
                                <Stethoscope size={14} />
                            </span>
                            <h2 className="m-0 text-[13.5px] font-bold uppercase tracking-[0.045em] text-[var(--cs-ink)]">
                                Assessment
                            </h2>
                        </div>
                        {/* Matches Investigations' `.cs-sort` (SuggestionsCard.tsx)
                            — this panel is ALSO sorted by relevance, it just
                            never said so, which was one of the two "still not
                            symmetric" gaps left after the 2026-08-25 handoff's
                            three blind passes. Gated on `hasAnyConditions` now
                            (2026-08-25 follow-up) for the same reason
                            Investigations' whole controls row is gated on
                            `anyContent`: a chart with nothing ranked has
                            nothing for "most relevant first" to describe, and
                            showing it anyway was the other half of why this
                            panel's empty state sat in a different amount of
                            leftover space than its neighbour's. Wording moved
                            off "Sort by… Relevance" (item 7) — that reads as a
                            generic list-sorting control; this says what
                            Cortex is actually doing, without naming the
                            mechanism. */}
                        {!search.isSearching && hasAnyConditions && (
                            <span className="cs-sort">Most relevant first</span>
                        )}
                    </div>

                    <div className="mt-3">
                        <IntentSearchField
                            state={search}
                            placeholder="Search diagnosis / condition…"
                            disabled={disabled}
                            inputRef={searchRef}
                            onKeyDown={onSearchKeyDown}
                        />
                    </div>

                    {search.isSearching ? (
                        /* Same ref on both branches: only one of them is
                           mounted at a time, so the cursor walks whichever
                           list the card is currently showing — ranked
                           conditions, or search hits. Bounded within Assessment column. */
                        <div
                            className="mt-3 flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1"
                            ref={listRef}
                        >
                            {body()}
                        </div>
                    ) : (
                        <>
                            {/* `.cs-ranked-*` — shared with SuggestionsCard's
                                identical row (consult.css), not a one-off
                                Tailwind string, so the two panels cannot
                                drift apart again. See that class's comment.

                                Gated on `intents.length > 0` now — matching
                                SuggestionsCard's identical gate exactly,
                                which this one never had. Showing "RANKED
                                CONDITIONS" over an empty-state message that
                                already says "No condition ranks for this
                                chart" was saying the same thing twice, AND
                                it was the actual source of item 2/4's icon
                                and "Show more" misalignment (Anmol,
                                2026-08-25): this column carried a header row
                                Investigations' empty state didn't, so the
                                two `.cs-empty` blocks centred in two
                                DIFFERENT amounts of leftover space even
                                though the cards themselves were the same
                                height. */}
                            {hasAnyConditions && (
                                <div className="cs-ranked-head">
                                    {/* The honesty line still exists — a doctor
                                        who assumes this column reads only from
                                        the symptom chips is reading a list that
                                        silently includes their BP — it is just
                                        not a standing line of its own any more.
                                        Anmol, 2026-08-25: "remove most of the
                                        useless things... you can simply write
                                        ranked somewhere else instead of
                                        assigning one line vertical space to
                                        it." The label already says "ranked";
                                        the rest is one hover away. */}
                                    <span
                                        className="cs-ranked-label"
                                        title="Ranked from symptoms, findings and measurements. You decide."
                                    >
                                        Ranked conditions
                                    </span>
                                    {intents.length > 0 && (
                                        <span className="cs-ranked-count">
                                            {shown.length} of {intents.length}
                                        </span>
                                    )}
                                </div>
                            )}
                            {/* "Show this to that doctor in future for similar
                                inputs" — §4, 2026-08-24. A quiet strip, not a
                                ranked row: these never came from the shared
                                catalogue, so they sit visually apart (dashed
                                border, violet-on-white rather than the ranked
                                list's slate badge) — "obviously slightly
                                different color and visual tone" was the ask. */}
                            {onAddFreeText && suggestedFreeTerms.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-[#8b5cf6]">
                                        Your terms
                                    </span>
                                    {suggestedFreeTerms.map((f) => (
                                        <button
                                            key={f.label}
                                            type="button"
                                            title="From your own earlier notes — not the shared catalogue"
                                            onClick={() => addFree(f.label)}
                                            className="rounded-full border border-dashed border-[#c4b5fd] bg-[#faf7ff] px-2.5 py-1 text-[12px] font-semibold text-[#6d28d9] transition-colors hover:bg-[#f3ecff]"
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* ── SCROLL IS OFF UNTIL ASKED FOR ────────────────
                                Collapsed, the list shows CAP rows and simply ends:
                                no inner scrollbar, because a scroll region the
                                doctor did not ask for steals the page's wheel and
                                hides its own contents behind an edge they have no
                                reason to look at.

                                "Show more" is what unlocks it. Expanded, the list
                                scrolls INSIDE a bounded box rather than growing,
                                so a chart with fifteen conditions cannot push the
                                prescription off the screen. Anmol, 2026-08-13:
                                "keep the nested scrolling off by default, but when
                                you click show more, more will be shown there ...
                                it should not grow endlessly." */}
                            {/* The collapse-to-scroll transition is animated on
                                max-height rather than switched, so the panel grows
                                into its scroll box instead of snapping and shoving
                                everything below it down a screen. */}
                            <motion.div
                                initial={false}
                                // Expanded stops on a HALF row on purpose: this one
                                // is a scroll box, and a clean edge there would say
                                // the list ends where it does not.
                                animate={{ maxHeight: expanded ? 4.5 * ROW_H + (collapsedH - CAP * ROW_H) : collapsedH }}
                                transition={
                                    reduce
                                        ? { duration: 0 }
                                        : { type: "spring", stiffness: 260, damping: 32 }
                                }
                                className={
                                    "cs-cascade mt-1.5 flex flex-col " +
                                    (expanded ? "overflow-y-auto pr-1" : "overflow-hidden")
                                }
                                ref={listRef}
                                layoutScroll
                                /* Search results share this container, and a
                                   staged lead on them would be pure latency:
                                   those are a direct answer to typing, not the
                                   engine re-reasoning. Unbound while searching,
                                   so they keep the plain 0ms row stagger. */
                                {...(search.isSearching ? {} : cascade.binding)}
                            >
                                {body()}
                            </motion.div>
                            {/* At the BOTTOM now, not beside the count above —
                                §2, 2026-08-25: "one show more button is on the
                                bottom of clinical investigation, another is on
                                top right of clinical assessment... both should
                                be at one place." Same class, same shape
                                SuggestionsCard's own capped list already uses
                                (`cs-card-foot-more cs-sug-cap-toggle`), so the
                                two "unlock more" controls sitting beside each
                                other read as one mechanism, not two. */}
                            {(hidden > 0 || (expanded && intents.length > CAP)) && (
                                <button
                                    type="button"
                                    onClick={() => setExpanded((v) => !v)}
                                    className="cs-card-foot-more cs-sug-cap-toggle"
                                >
                                    {expanded ? "Show less" : `Show all ${intents.length}`}
                                    <ChevronDown size={13} className={expanded ? "is-flipped" : undefined} />
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* right: the specialty's own instrument, when it has one —
                    otherwise what has been taken. See `sideSlot`. */}
                {sideSlot ? (
                    <div className="cs-cond-side flex min-w-0 flex-col">{sideSlot}</div>
                ) : (
                    /* A flex column so the blank state can take the space
                       the ranked list decides. This column is as tall as
                       its neighbour by grid, and with the blank pinned
                       under the heading a four-row chart left ~230px of
                       white below one line of text — the largest single
                       void left on a WORKING screen rather than an empty
                       one. */
                    <div className="flex min-w-0 flex-col">
                        <div className="flex items-baseline gap-2 border-b border-[var(--cs-line)] pb-1.5">
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-[var(--cs-label)]">
                                Selected / confirmed
                            </span>
                            {diagnoses.length > 0 && (
                                <span className="ml-auto rounded-[6px] bg-[var(--cs-blue-soft)] px-1.5 py-[2px] text-[11px] font-semibold text-[var(--cs-blue)]">
                                    {diagnoses.length} selected
                                </span>
                            )}
                        </div>

                        {diagnoses.length === 0 ? (
                            /* py-7 was 56px of padding around one line, in a
                               column whose neighbour is already short. */
                            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-4 text-center">
                                <BlankSelectedArt />
                                <span className="text-[12.5px] font-[460] text-[var(--cs-muted)]">
                                    Confirm a condition from the ranked list
                                </span>
                            </div>
                        ) : (
                            <div className="mt-2 flex flex-col gap-1.5">
                                {/* First confirmed is PRIMARY, the rest are
                                    secondary. A convention, never a derivation:
                                    the engine does not decide which diagnosis
                                    is primary, because that is the one
                                    judgement here that is entirely the
                                    doctor's. */}
                                {primaryDx && (
                                    <DxChip
                                        label={primaryDx}
                                        tone="primary"
                                        onRemove={() => onRemoveDiagnosis(primaryDx)}
                                        onEdit={lineByText.has(primaryDx) && onEditAssessmentLine
                                            ? () => onEditAssessmentLine(lineByText.get(primaryDx)!.id) : undefined}
                                    />
                                )}
                                {secondaryDx.map((dx) => (
                                    <DxChip
                                        key={dx}
                                        label={dx}
                                        tone="secondary"
                                        onRemove={() => onRemoveDiagnosis(dx)}
                                        onEdit={lineByText.has(dx) && onEditAssessmentLine
                                            ? () => onEditAssessmentLine(lineByText.get(dx)!.id) : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

/**
 * The Assessment free-text fallback, under the search results — §4,
 * 2026-08-24, restyled per follow-up (item 6): "this option should look
 * like just another ranked option belonging to the same list, maybe
 * slightly different color." Every row here is now the SAME shape as a
 * `ConditionRow` (icon, name + subtitle, one action on the right) — just
 * violet instead of slate/green, which is the one honest tell that it
 * came from the doctor's own notes rather than the catalogue. No em dash,
 * no link-styled text — this was previously punctuation ("— not in the
 * catalogue") and an underlined link, neither of which read as a row in a
 * list.
 */
function FreeTextFallback({
    query, matches, takenLabels, onAdd, onRemove,
}: {
    query: string;
    /** this doctor's own earlier terms that match what is typed now */
    matches: DoctorFreeTerm[];
    /** already-confirmed labels — rendered as taken, not as another "add" */
    takenLabels: ReadonlySet<string>;
    onAdd: (label: string) => void;
    onRemove: (label: string) => void;
}) {
    const q = query.trim();
    const exact = matches.some((m) => m.label.toLowerCase() === q.toLowerCase());

    if (!q) return null;

    return (
        <div className="mx-4 my-2 flex flex-col gap-1.5">
            {matches.map((m) => (
                <FreeMatchRow
                    key={m.label}
                    label={m.label}
                    taken={takenLabels.has(m.label)}
                    onAdd={() => onAdd(m.label)}
                    onRemove={() => onRemove(m.label)}
                />
            ))}
            {!exact && <FreeMatchRow label={q} taken={false} isNew onAdd={() => onAdd(q)} onRemove={() => onRemove(q)} />}
        </div>
    );
}

/** One row of the fallback above — a search hit shaped like a ranked row. */
function FreeMatchRow({
    label, taken, isNew = false, onAdd, onRemove,
}: {
    label: string;
    taken: boolean;
    /** this is the literal query, not a remembered term — "not in the catalogue" */
    isNew?: boolean;
    onAdd: () => void;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#e6ddfb] bg-[#faf8ff] px-2.5 py-2">
            <span
                aria-hidden="true"
                className="grid size-[22px] flex-none place-items-center rounded-full bg-[linear-gradient(180deg,#a78bfa_0%,#8b5cf6_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
            >
                {taken ? <Check size={12} /> : <span className="text-[13px] font-bold leading-none">+</span>}
            </span>
            <div className="min-w-0 flex-1">
                <span className="text-[13.5px] font-semibold leading-tight text-[#5b21b6]">{label}</span>
                <span className="mt-[1px] block text-[11px] font-semibold text-[#8b5cf6]">
                    {isNew ? "Not in the catalogue" : "Your term"}
                </span>
            </div>
            {taken ? (
                <button
                    type="button"
                    aria-label={`Remove ${label} from the assessment`}
                    title="Click to remove"
                    onClick={onRemove}
                    className="group grid size-[22px] flex-none place-items-center rounded-full border-0 bg-[#ede4fd] text-[#7c3aed] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626]"
                >
                    <Check size={14} className="group-hover:hidden" />
                    <X size={13} className="hidden group-hover:block" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onAdd}
                    className="cx-cond-act flex-none rounded-md border border-[#d9c9fb] bg-white px-2.5 py-[5px] text-[12px] font-semibold text-[#7c3aed] transition-colors duration-150 hover:bg-[#f3ecff]"
                >
                    Add
                </button>
            )}
        </div>
    );
}

/**
 * A confirmed FREE-TEXT diagnosis, pinned above the ranked list — §1
 * follow-up, 2026-08-24. Shaped like `ConditionRow` (same row height, same
 * slots) so it reads as part of the same list, not a second kind of thing
 * bolted above it — but violet instead of green/slate, the one honest tell
 * that this came from the doctor's own notes, not the engine.
 */
function FreeConditionRow({ label, onRemove, cascadeDelay, onEdit, onAddSite }: {
    label: string; onRemove: () => void; cascadeDelay: number;
    /** a site-placed assessment: click the name to change site or details */
    onEdit?: () => void;
    onAddSite?: () => void;
}) {
    const reduce = useReducedMotion();
    return (
        <motion.div
            {...cascadeRowProps(cascadeDelay, reduce)}
            className="flex items-center gap-2.5 rounded-lg border border-[#c4b5fd] bg-[#faf7ff] px-2.5 py-2"
        >
            <span
                aria-hidden="true"
                className="grid size-[22px] flex-none place-items-center rounded-full bg-[linear-gradient(180deg,#7c3aed_0%,#6d28d9_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
            >
                <Check size={12} />
            </span>
            <div className="min-w-0 flex-1">
                {onEdit ? (
                    <button type="button" className="cs-dx-editname" onClick={onEdit} title="Change site or details">
                        {label}
                    </button>
                ) : (
                    <span className="text-[13.5px] font-bold leading-tight text-[#4c1d95]">{label}</span>
                )}
                <span className="mt-[1px] flex items-center gap-2 text-[11px] font-semibold text-[#6d28d9]">
                    Confirmed diagnosis
                    {onAddSite && (
                        <button type="button" className="cs-dx-addsite" onClick={onAddSite}>
                            <Plus size={11} /> Another site
                        </button>
                    )}
                </span>
            </div>
            <button
                type="button"
                aria-label={`Remove ${label} from the assessment`}
                title="Click to remove"
                onClick={onRemove}
                className="grid size-[24px] flex-none place-items-center rounded-full border-0 bg-[#ede4fd] text-[#6d28d9] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626]"
            >
                <X size={14} />
            </button>
        </motion.div>
    );
}

function ConditionRow({
    intent, rank, relevance, confirmed, acknowledged, onAcknowledge, onExplain, onAccept, onRemove,
    cascadeDelay, anatomical, sites, onEditSite, onRemoveSite, onAddSite,
}: {
    /** asks for a site when taken — shows the body marker */
    anatomical: boolean;
    /** the sites this assessment is confirmed at, as pills */
    sites: AssessmentLine[];
    onEditSite: (id: string) => void;
    onRemoveSite: (text: string) => void;
    onAddSite: () => void;
    /** ms this row waits before arriving — see `delayOf` in cascade.ts */
    cascadeDelay: number;
    intent: PersonalizedIntent;
    /** position in the list, 1-based, for the badge */
    rank: number;
    relevance: string | null;
    confirmed: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onExplain: (anchor: DOMRect) => void;
    onAccept: () => void;
    /** instant undo, right on the confirmed badge — see parent's doc comment */
    onRemove: () => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const reduce = useReducedMotion();
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    return (
        <motion.div
            /* Fade, slide and blue all off one beat — see cascadeRowProps. */
            {...cascadeRowProps(cascadeDelay, reduce)}
            ref={rowRef}
            // The second way in. The info button is the discoverable one and
            // the only one a keyboard reaches; double-click is the shortcut for
            // a doctor who already knows it is there.
            onDoubleClick={() => {
                const r = rowRef.current?.getBoundingClientRect();
                if (r) onExplain(r);
            }}
            className={
                "cx-cond-row flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors duration-150 " +
                (confirmed
                    ? "border-[#b6e6cd] bg-[linear-gradient(180deg,#f4fdf8_0%,#e6f8ef_100%)] "
                    : isHard
                        ? "border-[#f4cfcb] bg-[#fef6f5] "
                        : "border-transparent hover:border-[var(--cs-line)] hover:bg-[#fafbfd] ")
            }
        >
            {/* The rank, as a number. It was a stethoscope glyph repeated down
                the column, which said the same thing on every row and so said
                nothing. A ranked list should be numbered: the position IS the
                content. Green once taken, so the state is legible from the
                badge alone. */}
            <span
                aria-hidden="true"
                className={
                    "grid size-[22px] flex-none place-items-center rounded-full text-[11.5px] font-bold tabular-nums " +
                    (confirmed
                        ? "bg-[linear-gradient(180deg,#22a565_0%,#16924f_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                        : "bg-[linear-gradient(180deg,#1e293b_0%,#0f172a_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]")
                }
            >
                {rank}
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold leading-tight text-[var(--cs-ink)]">
                        {intent.label}
                    </span>
                    {anatomical && sites.length === 0 && <SiteMarker />}
                    {intent.isSafetyCritical && (
                        <span className="cs-flag is-safety"><ShieldAlert size={10} /> Safety</span>
                    )}
                    {isWarn && <span className="cs-flag is-warn">Caution</span>}
                    {isHard && <span className="cs-flag is-hard">Check</span>}
                    <WhyButton label={intent.label} onOpen={onExplain} />
                </div>
                {confirmed && sites.length > 0 ? (
                    <div className="cs-dx-sites">
                        {sites.map((l) => (
                            <span key={l.id} className="cs-dx-site">
                                <button type="button" onClick={() => onEditSite(l.id)} title="Change site or details">
                                    <MapPin size={11} aria-hidden="true" />
                                    {siteText(l)}
                                </button>
                                <button
                                    type="button"
                                    className="cs-dx-site-x"
                                    aria-label={`Remove ${l.text}`}
                                    onClick={() => onRemoveSite(l.text)}
                                >
                                    <X size={11} />
                                </button>
                            </span>
                        ))}
                        <button type="button" className="cs-dx-addsite" onClick={onAddSite}>
                            <Plus size={11} /> Another site
                        </button>
                    </div>
                ) : relevance && (
                    <span className="mt-[1px] block text-[11.5px] font-semibold text-[var(--cs-label)]">
                        {relevance}
                    </span>
                )}
            </div>

            {confirmed ? (
                <button
                    type="button"
                    aria-label={`Remove ${intent.label} from the assessment`}
                    title="Confirmed — click to remove"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="group grid size-[22px] flex-none place-items-center rounded-full border-0 bg-[#dcf5e8] text-[#15803d] transition-colors duration-150 hover:bg-[#fee2e2] hover:text-[#dc2626]"
                >
                    <Check size={14} className="group-hover:hidden" />
                    <X size={13} className="hidden group-hover:block" />
                </button>
            ) : locked ? (
                <span className="w-[62px] flex-none" aria-hidden="true" />
            ) : (
                <button
                    type="button"
                    onClick={onAccept}
                    className="cx-cond-act flex-none rounded-md border border-[var(--cs-line-strong)] bg-white px-2.5 py-[5px] text-[12px] font-semibold text-[var(--cs-muted)] transition-colors duration-150 hover:border-[rgba(18,104,232,0.5)] hover:bg-[var(--cs-blue-soft)] hover:text-[var(--cs-blue)]"
                >
                    Select
                </button>
            )}

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <div className="basis-full">
                    <GuardReason
                        hard={isHard}
                        reasons={intent.guardReasons}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                    />
                </div>
            )}
        </motion.div>
    );
}

/**
 * One confirmed diagnosis, as a chip.
 *
 * Deliberately a different object from the suggestion rows beside it: those
 * carry a relevance bar and a "Confirm" verb, this carries neither. A chip is
 * a decision that has been made; a row is one that has not. Making them look
 * alike is precisely how a ranked possibility gets read as a diagnosis.
 */
function DxChip({
    label, tone, onRemove, onEdit,
}: {
    label: string;
    tone: "primary" | "secondary";
    onRemove: () => void;
    /** a site-placed assessment: click to change site or details */
    onEdit?: () => void;
}) {
    return (
        <span
            className={
                "flex items-center gap-2 rounded-lg border px-3 py-2 " +
                (tone === "primary"
                    ? "border-[#d9c9fb] bg-[linear-gradient(180deg,#faf7ff_0%,#efe7fe_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                    : "border-[#e6ddfb] bg-[#faf8ff]")
            }
        >
            {onEdit ? (
                <button
                    type="button"
                    onClick={onEdit}
                    title="Change site or details"
                    className={
                        "min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[13.5px] leading-tight text-[#5b21b6] hover:underline " +
                        (tone === "primary" ? "font-bold" : "font-semibold")
                    }
                >
                    {label}
                </button>
            ) : (
                <span
                    className={
                        "min-w-0 flex-1 truncate text-[13.5px] leading-tight text-[#5b21b6] " +
                        (tone === "primary" ? "font-bold" : "font-semibold")
                    }
                >
                    {label}
                </span>
            )}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${label}`}
                className="grid size-[18px] flex-none place-items-center rounded border-0 bg-transparent p-0 text-[#7c5bd0] opacity-60 transition hover:bg-black/5 hover:opacity-100"
            >
                <X size={13} />
            </button>
        </span>
    );
}
