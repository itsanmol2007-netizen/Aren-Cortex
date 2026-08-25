// ---------------------------------------------------------------------------
// CLINICAL SUGGESTIONS — everything the engine has to say that is neither a
// medicine nor a reading of the chart.
//
// Investigation · Referral · Advice · Exercise, in clinical reading order:
// what confirms it → who else should see them → what to tell them.
//
// ── What left this panel, and why ─────────────────────────────────────────
// `finding` used to lead this list as "Possible Finding". It has its own panel
// now — `ConditionsCard`, up beside the chart — because a reading of the chart
// is not an order to place, and because sitting it above Investigations here
// buried the one output that answers "what is going on" underneath the outputs
// that answer "what do I do about it". Nothing about how a finding is scored,
// guarded or accepted changed; only where it renders.
//
// Relevance is a WORD here, not a bar. These are not competing options the
// doctor picks one of — they are separate considerations, each either worth
// acting on or not. A word says that; a bar invites a comparison between a
// blood test and a referral that means nothing.
//
// The word comes from the same same-type proportion the medicine bars use, so
// the two surfaces can never disagree. It is withheld in a section of one,
// where the comparison has no other side and the word could only ever read
// "High relevance" no matter how weakly the engine scored it.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import {
    Activity, ArrowUpRight, Check, ChevronDown, FlaskConical, Lightbulb, Pill,
    ShieldAlert, Sparkles, Waves, ActivitySquare, X } from "lucide-react";
import type { ActiveSignal, IntentType, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import type { DoctorFreeTerm, DoctorFreeTermType } from "../../lib/db/synapse";
import { GuardReason, RELEVANCE_TEXT, ThinkingRing, rankFillOf, relevanceOf } from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import { matchingFreeTerms, topFreeTermMatches } from "./freeTerms";
import type { AcceptPayload } from "./types";
import { BlankTestArt } from "./BlankArt";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

/** The free-text fallback (§4) only covers these three of this card's types
 *  — `finding` lives in ConditionsCard, `medicine` has its own composition-
 *  anchored path, and exercise/modality/impairment are out of scope for this
 *  round (see docs/aren-cortex-context.md §7's note on the same). */
const FREE_TEXT_TYPES: ReadonlySet<IntentType> = new Set(["test", "referral", "advice"]);
const isFreeTextType = (t: IntentType | null): t is DoctorFreeTermType =>
    !!t && FREE_TEXT_TYPES.has(t);

/**
 * Section order, labels, glyphs and the verb each type is accepted with.
 *
 * `finding` is deliberately absent — see the header comment.
 */
interface Section {
    type: IntentType;
    label: string;
    verb: string;
    icon: React.ReactNode;
}

/**
 * The catalogue of every non-finding intent type this panel can render.
 *
 * It used to be the fixed list of four that this card always showed. It is a
 * CATALOGUE now, and the caller picks which entries to render via `types` —
 * that is what lets the same component be a facility's Primary Recommendation
 * slot (one type, elevated) and its everything-else slot (the remainder), with
 * no second component and no per-specialty branch in the render tree.
 *
 * `medicine` is included here even though `RecommendationsCard` normally owns
 * it: for a facility whose primary output is NOT medicines — physiotherapy
 * elevating exercise plans, diagnostics elevating investigations — medicines
 * fall back into a plain ranked list, which is exactly what this renders.
 * `finding` is deliberately absent; it has its own panel (see header).
 */
const CATALOGUE: Section[] = [
    { type: "medicine", label: "Medicine", verb: "Add", icon: <Pill size={14} /> },
    { type: "test", label: "Investigation", verb: "Order", icon: <FlaskConical size={14} /> },
    { type: "referral", label: "Referral", verb: "Refer", icon: <ArrowUpRight size={14} /> },
    { type: "advice", label: "Advice", verb: "Advise", icon: <Lightbulb size={14} /> },
    { type: "exercise", label: "Exercise", verb: "Add", icon: <Activity size={14} /> },
    // Delivered in the clinic, during this session — see IntentType in
    // engine.ts for why this is not filed under Exercise. "Perform" rather
    // than "Add" because that is what the physiotherapist is agreeing to do.
    { type: "modality", label: "Therapy", verb: "Perform", icon: <Waves size={14} /> },
    // Phase 4. "Note" rather than "Add" because an impairment is something
    // the physiotherapist RECOGNISES about the patient, not something they
    // hand over — the verb is the difference between a finding and a
    // prescription, and every other row here is a prescription.
    { type: "impairment", label: "Impairment", verb: "Note", icon: <ActivitySquare size={14} /> },
];

const VERB_OF: Record<string, string> = Object.fromEntries(
    CATALOGUE.map((s) => [s.type, s.verb])
);

/** Rows shown per type before the panel asks. */

interface Props {
    /** layout class from the plan row — which slot this panel occupies */
    className?: string;
    /**
     * Which intent types this instance renders, in order. The facility's
     * specialty profile decides this — see App.tsx's `planSlots`. Defaults to
     * everything except medicines, which is the historical behaviour.
     */
    types?: IntentType[];
    /** the heading — "Medicines", "Exercise Plans", "Clinical Suggestions"… */
    title?: string;
    byType: Record<IntentType, PersonalizedIntent[]>;
    topOfType: Map<IntentType, number>;
    /** "Synapse is thinking" cue — see ThinkingRing in parts.tsx */
    thinkingKey: string;
    acceptedIntentIds: Set<number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    /** Undo an accept in place, on the same row — §9, 2026-08-24. */
    onRemove?: (intentId: number, type: IntentType, label: string) => void;
    /**
     * The doctor's pin, threaded through to a SEARCHED medicine hit only —
     * §1, 2026-08-24. This card's own ranked medicine rows (when a profile
     * demotes medicine out of `RecommendationsCard`) render as
     * `SuggestionRow`, which has never had a pin concept and is out of
     * scope here; this is specifically the "searched medicines" gap.
     */
    isPinned?: (intentId: number) => boolean;
    onTogglePin?: (intentId: number) => void;
    onExplain: (intent: PersonalizedIntent, anchor: DOMRect) => void;
    /** for the guard verdict on a searched, never-ranked intent */
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    expanded: boolean;
    onToggleExpanded: () => void;
    hasChart: boolean;
    disabled?: boolean;
    /**
     * The free-text fallback — §4, 2026-08-24, widened same day past
     * Assessment to Test/Referral/Advice. `freeTerms` is the doctor's WHOLE
     * list (every type it covers); this card filters it to whichever
     * category is currently in view. Only offered once a single category is
     * in view (one tab picked, or the card only ever renders one section to
     * begin with — see `effectiveType` below): typing a free term while
     * looking at "All" would not know which bucket to file it in.
     */
    freeTerms?: DoctorFreeTerm[];
    onAddFreeText?: (label: string, type: DoctorFreeTermType) => void;
    /**
     * The live plan, read-only, so a free term's row can show "taken" the
     * instant it lands and go back to "add" the instant it's removed —
     * §1 follow-up, 2026-08-24. `test`'s free label is on the plan iff it's
     * in `selectedTests`; `referral`/`advice` share `adviceLines` the same
     * way `useConsultPlan.ts`'s `addFreeReferral`/`addFreeAdvice` write it
     * (`"Refer to X"` vs `X` plain), so both are checked against the one
     * array rather than needing it split.
     */
    selectedTests?: string[];
    adviceLines?: string[];
    /**
     * Caps the RANKED list to this many rows, with a "Show more" button that
     * unlocks a bounded, scrolling list — the same mechanism
     * `ConditionsCard`'s own ranked column already uses, applied here for
     * the first time when this card is squeezed into a SHORT neighbour
     * (the Assessment side-slot) rather than the tall, self-scrolling strip
     * it normally sits in. Absent (the two full-height placements) keeps the
     * old behaviour — unbounded, the panel's own container scrolls.
     * §3, 2026-08-24: "add a show more button on bottom which unlocks the
     * nested scrolling of it."
     */
    capped?: number;
}

export function SuggestionsCard({
    byType, topOfType, thinkingKey, acceptedIntentIds, acknowledged, onAcknowledge, onAccept, onRemove,
    isPinned, onTogglePin, freeTerms = [], onAddFreeText,
    selectedTests = [], adviceLines = [],
    onExplain, ruleset, activeSignals, expanded, onToggleExpanded, hasChart,
    disabled = false, className = "",
    types, title = "Clinical Suggestions", capped,
}: Props) {
    const [showAllCapped, setShowAllCapped] = useState(false);

    /**
     * §1 follow-up — the SAME split ConditionsCard's `isFreeLabel` makes:
     * "is this label a free-text entry" (provenance — needs `freeTerms` or
     * this-session tracking, since the label alone can't say) and "is it
     * currently on the plan" (live — `selectedTests`/`adviceLines`, so
     * removing it from the Plan rail directly is reflected here too, not
     * just a click on this card's own remove button).
     */
    const [freeAddedNow, setFreeAddedNow] = useState<Set<string>>(new Set());
    const freeKey = (type: DoctorFreeTermType, label: string) => `${type}:${label}`;
    const isFreeLabel = (type: DoctorFreeTermType, label: string) =>
        freeAddedNow.has(freeKey(type, label)) || freeTerms.some((f) => f.type === type && f.label === label);
    const isTaken = (type: DoctorFreeTermType, label: string): boolean => {
        if (type === "test") return selectedTests.includes(label);
        if (type === "referral") return adviceLines.includes(`Refer to ${label}`);
        return adviceLines.includes(label); // advice
    };
    // `intentId` is unused by every branch `removeAcceptedIntent` (the only
    // thing ever passed as `onRemove`) takes for test/referral/advice — see
    // its own doc comment in useConsultPlan.ts — so a free term's removal
    // reuses the SAME dispatcher with a dummy id, no second removal path.
    const removeFree = (type: DoctorFreeTermType, label: string) => onRemove?.(0, type, label);
    // The sections this instance renders, in the caller's order.
    const SECTIONS = useMemo(
        () =>
            types
                ? types
                    .map((t) => CATALOGUE.find((c) => c.type === t))
                    .filter((s): s is Section => !!s)
                : CATALOGUE.filter((s) => s.type !== "medicine"),
        [types]
    );
    const SEARCH_TYPES = useMemo(() => SECTIONS.map((s) => s.type), [SECTIONS]);
    /**
     * Which category is in view — §3, 2026-08-24 (was: which category the
     * search box was scoped to, via a `<select>` that had no effect on
     * anything except an active search, so choosing "Tests" while NOT
     * searching visibly did nothing — reported as "the Search Filter button
     * is not working at all."
     *
     * `null` means all types. Now a real filter on the ranked list itself,
     * AND the search scope, from ONE piece of state — picking "Advice" both
     * narrows what a query searches and narrows what the unranked list
     * shows, so the two can never disagree about what "Advice" is currently
     * showing. Rendered as tabs rather than a `<select>` per the same
     * request: "add buttons like tabs for Tests and Advices... to quickly
     * get to it."
     */
    const [scope, setScope] = useState<IntentType | null>(null);
    const search = useIntentSearch(scope ? [scope] : SEARCH_TYPES);

    const addFree = (type: DoctorFreeTermType, label: string) => {
        if (!onAddFreeText) return;
        onAddFreeText(label, type);
        setFreeAddedNow((curr) => new Set(curr).add(freeKey(type, label)));
        search.setQuery("");
    };

    /**
     * The one type free text can safely file into right now — the chosen
     * tab, or (when this instance only ever renders one section, e.g. the
     * Assessment side-slot's Investigations-only card) that one section
     * without making the doctor click a tab that would be the only tab.
     * `null` means "All" is showing, or this card's one section is not one
     * of the three free text covers — either way, no free-text affordance.
     */
    const effectiveType: DoctorFreeTermType | null = (() => {
        const t = scope ?? (SECTIONS.length === 1 ? SECTIONS[0].type : null);
        return isFreeTextType(t) ? t : null;
    })();

    /** the doctor's own terms matching THIS chart, for the ranked view —
     *  taken ones excluded, same as ConditionsCard's identical strip: this
     *  is a SUGGESTION list, and an already-added term is pinned above the
     *  ranked rows instead (see `freeRows` in `body()`). */
    const suggestedFreeTerms = useMemo(() => {
        if (!effectiveType || !onAddFreeText || !freeTerms.length) return [];
        const activeSignalIds = new Set(activeSignals.map((s) => s.signalId));
        const taken = new Set(
            freeTerms.filter((f) => f.type === effectiveType && isTaken(effectiveType, f.label)).map((f) => f.label)
        );
        return topFreeTermMatches(freeTerms, effectiveType, activeSignalIds, acceptedIntentIds, taken);
    }, [effectiveType, onAddFreeText, freeTerms, activeSignals, acceptedIntentIds, selectedTests, adviceLines]);

    /**
     * The same list, filtered to what is actually typed — for search mode.
     * Includes already-taken labels now (§1 follow-up) — see
     * `matchingFreeTerms`'s doc comment; the row itself renders the
     * taken/not-taken state.
     */
    const matchedFreeTerms = useMemo(
        () => (effectiveType ? matchingFreeTerms(freeTerms, effectiveType, search.query) : []),
        [effectiveType, freeTerms, search.query]
    );

    /**
     * The same walk-and-take the other two ranked panels have. This card holds
     * the investigations, so it is the one a doctor reaches for after the
     * medicines — the verb differs per row type ("Order", "Refer", "Add") but
     * `.cs-act` is the class all of them wear, so nothing here needs to know
     * which is which.
     */
    const listRef = useRef<HTMLDivElement>(null);
    const roving = useRovingList({
        containerRef: listRef,
        rowSelector: ".cs-sug",
        actionSelector: "button.cs-act",
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

    /**
     * One flat, ordered list rather than four sub-lists.
     *
     * The doctor is scanning for anything worth acting on, not visiting four
     * sections in turn. The type stays legible on every row, so nothing is lost
     * by flattening.
     */
    // Every row of every section, always — the panel is bounded by the output
    // strip and scrolls internally, so there is nothing to expand into. The
    // per-type CAP that used to sit here existed only to keep this card short
    // beside its neighbour; in a stacked strip that job belongs to the scroll.
    const rows = useMemo(() => {
        const out: { intent: PersonalizedIntent; section: (typeof SECTIONS)[number] }[] = [];
        for (const section of SECTIONS) {
            if (scope && section.type !== scope) continue;
            for (const intent of byType[section.type] ?? []) out.push({ intent, section });
        }
        return out;
    }, [byType, SECTIONS, scope]);

    const total = useMemo(
        () => SECTIONS
            .filter((s) => !scope || s.type === scope)
            .reduce((n, s) => n + (byType[s.type]?.length ?? 0), 0),
        [byType, SECTIONS, scope]
    );

    const rankedIds = useMemo(() => {
        const ids = new Set<number>();
        for (const s of SECTIONS) for (const i of byType[s.type] ?? []) ids.add(i.intentId);
        return ids;
    }, [byType]);

    const body = () => {
        if (search.isSearching) {
            return (
                <>
                    <IntentSearchResults
                        state={search}
                        verbOf={(t) => VERB_OF[t] ?? "Add"}
                        ruleset={ruleset}
                        activeSignals={activeSignals}
                        rankedIntentIds={rankedIds}
                        acceptedIntentIds={acceptedIntentIds}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                        onAccept={onAccept}
                        onRemove={onRemove}
                        isPinned={isPinned}
                        onTogglePin={onTogglePin}
                    />
                    {/* §4/§6, 2026-08-24. Only reachable with one category in
                        view (`effectiveType`) — see its own doc comment for
                        why "All" cannot offer this. Every row here is now
                        shaped exactly like a `.cs-sug` catalogue hit — item 6
                        of the follow-up: "this option should look like just
                        another ranked option belonging to the same list." */}
                    {effectiveType && onAddFreeText && !search.loading && (
                        <div className="cs-freeterm">
                            {matchedFreeTerms.map((f) => (
                                <FreeMatchRow
                                    key={f.label}
                                    label={f.label}
                                    taken={isTaken(effectiveType, f.label)}
                                    onAdd={() => addFree(effectiveType, f.label)}
                                    onRemove={() => removeFree(effectiveType, f.label)}
                                />
                            ))}
                            {!matchedFreeTerms.some((f) => f.label.toLowerCase() === search.query.trim().toLowerCase()) && (
                                <FreeMatchRow
                                    label={search.query.trim()}
                                    taken={false}
                                    isNew
                                    onAdd={() => addFree(effectiveType, search.query.trim())}
                                    onRemove={() => {}}
                                />
                            )}
                        </div>
                    )}
                </>
            );
        }

        if (!hasChart) {
            return (
                <div className="cs-empty">
                    <BlankTestArt />
                    <strong>Start adding observations to activate Synapse</strong>
                    <span>
                        Symptoms, findings and measurements all feed the same reading —
                        suggestions appear here the moment one lands.
                    </span>
                </div>
            );
        }

        // "Show this to that doctor in future for similar inputs" — §4,
        // 2026-08-24. Leads the ranked view (not just search) whenever
        // `effectiveType` is unambiguous, same reasoning as ConditionsCard's
        // identical strip: this is a doctor-local convenience, visually
        // apart (dashed border, violet), never a ranked suggestion.
        const freeTermsStrip = suggestedFreeTerms.length > 0 && effectiveType && onAddFreeText ? (
            <div className="cs-freeterm cs-freeterm-ranked" key="free-terms">
                <span className="cs-freeterm-label">Your terms</span>
                {suggestedFreeTerms.map((f) => (
                    <button
                        key={f.label}
                        type="button"
                        className="cs-freeterm-chip"
                        onClick={() => addFree(effectiveType, f.label)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
        ) : null;

        // §1 follow-up, 2026-08-24: "added assessments should be visible in
        // the ranked/suggested... list too on the very top" — the same fix
        // as ConditionsCard's `freeDiagnoses`, for whichever type is in
        // view. A free term has no engine rank to sit at, so it is pinned
        // ABOVE the ranked rows rather than folded into them.
        const freePinned = effectiveType
            ? [
                ...new Set([
                    ...freeTerms.filter((f) => f.type === effectiveType).map((f) => f.label),
                    ...[...freeAddedNow]
                        .filter((k) => k.startsWith(`${effectiveType}:`))
                        .map((k) => k.slice(effectiveType.length + 1)),
                ]),
              ].filter((label) => isTaken(effectiveType, label))
            : [];
        const freeRows = freePinned.map((label) => (
            <FreeSuggestionRow
                key={`free-${effectiveType}-${label}`}
                label={label}
                onRemove={() => removeFree(effectiveType!, label)}
            />
        ));

        if (rows.length === 0) {
            return (
                <>
                    {freeRows}
                    {freeTermsStrip}
                    {freeRows.length === 0 && (
                        <div className="cs-empty">
                            <BlankTestArt />
                            <strong>Nothing else to suggest for this chart</strong>
                            <span>Search above to order or refer something directly.</span>
                        </div>
                    )}
                </>
            );
        }

        // §3, 2026-08-24: "add a show more button... apply this to literally
        // every section which starts growing over 4-5 cards." Only active
        // when the caller passed `capped` (the Assessment side-slot) — the
        // two full-height placements are unaffected, same as before.
        const visibleRows = capped != null && !showAllCapped
            ? rows.filter(
                (r, i) => i < capped || acceptedIntentIds.has(r.intent.intentId)
              )
            : rows;
        const rowNodes = visibleRows.map(({ intent, section }) => {
            const list = byType[section.type] ?? [];
            const fill = rankFillOf(intent, topOfType.get(section.type) ?? 0);
            // A section of one has no other side to the comparison.
            const relevance = list.length > 1 ? relevanceOf(fill) : null;

            return (
                <SuggestionRow
                    key={intent.intentId}
                    intent={intent}
                    kindLabel={section.label}
                    verb={section.verb}
                    icon={section.icon}
                    relevance={relevance ? RELEVANCE_TEXT[relevance] : null}
                    added={acceptedIntentIds.has(intent.intentId)}
                    acknowledged={acknowledged.has(intent.intentId)}
                    onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                    onExplain={(rect) => onExplain(intent, rect)}
                    onRemove={onRemove && (() => onRemove(intent.intentId, intent.type, intent.label))}
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
            );
        });

        return [
            ...freeRows, freeTermsStrip, ...rowNodes,
            capped != null && rows.length > capped && (
                <button
                    key="cap-toggle"
                    type="button"
                    className="cs-card-foot-more cs-sug-cap-toggle"
                    onClick={() => setShowAllCapped((v) => !v)}
                >
                    {showAllCapped ? "Show less" : `Show all ${rows.length}`}
                    <ChevronDown size={13} className={showAllCapped ? "is-flipped" : undefined} />
                </button>
            ),
        ];
    };

    return (
        <section className={`cs-card ${className}`} aria-label="Clinical suggestions">
            {/* The title takes a glyph tile so this panel and MEDICINE
                RECOMMENDATIONS beside it read as the two halves of one row.
                Before this it was a violet underlined tab — the language of a
                tab strip, on a panel with no second tab, in a colour that
                already means "assessment" two cards above. The restyle is in
                consult.css under `.cs-sug-tab`. */}
            <div className="cs-sug-head">
                <span className="cs-sug-tab">
                    {/* Slate, not a hue — EXCEPT when this instance renders
                        only one section (the Assessment side-slot): item 4,
                        2026-08-24, "these two sections... look alien side by
                        side, the icon". A single-section card IS that
                        section, so its own icon replaces the generic
                        Sparkles, and `.cs-cond-side-sug` (consult.css)
                        recolours the tile to match Assessment's violet —
                        the two panels read as one family now, not two
                        different apps glued together. */}
                    <span className="cs-glyph is-slate cs-glyph-live">
                        <ThinkingRing pulseKey={thinkingKey} />
                        {SECTIONS.length === 1 ? SECTIONS[0].icon : <Sparkles size={14} />}
                    </span>
                    {title}
                </span>
                <span className="cs-sort">Sort by: <b>Relevance</b></span>
            </div>

            {/* §3, 2026-08-24. One button per category — "Tests", "Advice"…
                — to get straight to that section, replacing a `<select>`
                that only ever narrowed an active SEARCH and did nothing to
                the list otherwise (see `scope`'s doc comment above). Tabs
                because the ask named them specifically, and because a
                doctor scanning six words reads them faster than opening a
                dropdown to find the same six.

                Hidden entirely when this instance only ever renders ONE
                section (item 2, 2026-08-24) — "All" and that one section
                are the identical filter, so a two-tab row that always says
                the same thing twice was reading as a stray global search
                bar rather than a scoped one. */}
            {SECTIONS.length > 1 && (
                <div className="cs-sug-filter" role="tablist" aria-label="Filter by category">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={scope === null}
                        className={`cs-sug-filter-btn${scope === null ? " is-on" : ""}`}
                        onClick={() => setScope(null)}
                    >
                        All
                    </button>
                    {SECTIONS.map((s) => (
                        <button
                            key={s.type}
                            type="button"
                            role="tab"
                            aria-selected={scope === s.type}
                            className={`cs-sug-filter-btn${scope === s.type ? " is-on" : ""}`}
                            // A second click on the active tab clears it — the
                            // fastest way back to "All" without a second control.
                            onClick={() => setScope((cur) => (cur === s.type ? null : s.type))}
                        >
                            {s.icon}
                            {s.label}
                        </button>
                    ))}
                </div>
            )}

            <IntentSearchField
                state={search}
                placeholder={
                    // Scoped to whichever ONE section is actually searchable
                    // right now — a chosen tab, or (item 2) the card's only
                    // section when there was never a second one to pick.
                    scope
                        ? `Search ${(SECTIONS.find((s) => s.type === scope)?.label ?? "").toLowerCase()}…`
                        : SECTIONS.length === 1
                            ? `Search ${SECTIONS[0].label.toLowerCase()}…`
                            : "Search tests, referrals, advice, exercises…"
                }
                disabled={disabled}
                onKeyDown={onSearchKeyDown}
            />

            <div
                className={`cs-list${capped != null && showAllCapped ? " is-capped-scroll" : ""}`}
                ref={listRef}
            >
                {body()}
            </div>
        </section>
    );
}

function SuggestionRow({
    intent, kindLabel, verb, icon, relevance, added, acknowledged, onAcknowledge,
    onExplain, onAccept, onRemove,
}: {
    intent: PersonalizedIntent;
    kindLabel: string;
    verb: string;
    icon: React.ReactNode;
    relevance: string | null;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onExplain: (anchor: DOMRect) => void;
    onAccept: () => void;
    /** instant undo, right on the "Taken" badge — see the card's doc comment */
    onRemove?: () => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;
    const tone = intent.type;

    return (
        <div
            ref={rowRef}
            className={`cs-sug${added ? " is-added" : ""}${isHard ? " is-hard" : ""}`}
            onDoubleClick={() => {
                const r = rowRef.current?.getBoundingClientRect();
                if (r) onExplain(r);
            }}
        >
            <span className={`cs-sug-icon is-${tone}`} aria-hidden="true">{icon}</span>

            <div className="cs-sug-main">
                <span className={`cs-sug-kind is-${tone}`}>{kindLabel}</span>
                <div className="cs-sug-name">
                    <span>{intent.label}</span>
                    {intent.isSafetyCritical && (
                        <span className="cs-flag is-safety"><ShieldAlert size={10} /> Safety</span>
                    )}
                    {isWarn && <span className="cs-flag is-warn">Caution</span>}
                    {isHard && <span className="cs-flag is-hard">Check</span>}
                    <WhyButton label={intent.label} onOpen={onExplain} />
                </div>
                {relevance && <span className="cs-sug-rel">{relevance}</span>}
            </div>

            {added ? (
                onRemove ? (
                    <button
                        type="button"
                        className="cs-added is-removable"
                        aria-label={`Remove ${intent.label} from the plan`}
                        title="Taken — click to remove"
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    >
                        <Check size={15} className="cs-added-check" />
                        <X size={13} className="cs-added-x" />
                    </button>
                ) : (
                    <span className="cs-added" aria-label="Taken"><Check size={15} /></span>
                )
            ) : locked ? (
                <span style={{ width: 29 }} aria-hidden="true" />
            ) : (
                <button type="button" className="cs-act" onClick={onAccept}>{verb}</button>
            )}

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <div style={{ gridColumn: "2 / -1" }}>
                    <GuardReason
                        hard={isHard}
                        reasons={intent.guardReasons}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * A confirmed FREE-TEXT entry, pinned above the ranked rows — §1 follow-up,
 * 2026-08-24. Same shape as `SuggestionRow` (`.cs-sug`), violet instead of
 * the row's type colour, so it reads as part of the same list rather than a
 * second kind of thing bolted above it.
 */
function FreeSuggestionRow({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <div className="cs-sug is-free is-added">
            <span className="cs-sug-icon is-free" aria-hidden="true">
                <span className="cs-sug-plus">+</span>
            </span>
            <div className="cs-sug-main">
                <span className="cs-sug-kind is-free">Your term</span>
                <div className="cs-sug-name"><span>{label}</span></div>
            </div>
            <button
                type="button"
                className="cs-added is-removable is-free"
                aria-label={`Remove ${label} from the plan`}
                title="Taken — click to remove"
                onClick={onRemove}
            >
                <Check size={15} className="cs-added-check" />
                <X size={13} className="cs-added-x" />
            </button>
        </div>
    );
}

/**
 * One row of the free-text fallback under a search — §4/§6, 2026-08-24.
 * Shaped like `.cs-sug` (a catalogue hit) throughout — "just another ranked
 * option belonging to the same list" was the ask — violet-tinted as the one
 * honest tell it did not come from the catalogue, and no em dash / link
 * styling anywhere in it.
 */
function FreeMatchRow({
    label, taken, isNew = false, onAdd, onRemove,
}: {
    label: string;
    taken: boolean;
    /** this is the literal typed query, not a remembered term */
    isNew?: boolean;
    onAdd: () => void;
    onRemove: () => void;
}) {
    return (
        <div className={`cs-sug is-free${taken ? " is-added" : ""}`}>
            <span className="cs-sug-icon is-free" aria-hidden="true">
                <span className="cs-sug-plus">+</span>
            </span>
            <div className="cs-sug-main">
                <span className="cs-sug-kind is-free">{isNew ? "Not in the catalogue" : "Your term"}</span>
                <div className="cs-sug-name"><span>{label}</span></div>
            </div>
            {taken ? (
                <button
                    type="button"
                    className="cs-added is-removable is-free"
                    aria-label={`Remove ${label} from the plan`}
                    title="Taken — click to remove"
                    onClick={onRemove}
                >
                    <Check size={15} className="cs-added-check" />
                    <X size={13} className="cs-added-x" />
                </button>
            ) : (
                <button type="button" className="cs-act is-free" onClick={onAdd}>Add</button>
            )}
        </div>
    );
}

/** Re-exported so App can render the idle shortlist without a second import. */
export { Sparkles as SuggestionsGlyph };
