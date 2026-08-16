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
    ShieldAlert, Sparkles, Waves,
} from "lucide-react";
import type { ActiveSignal, IntentType, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import { GuardReason, RELEVANCE_TEXT, ThinkingRing, rankFillOf, relevanceOf } from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";
import { BlankTestArt } from "./BlankArt";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

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
    onExplain: (intent: PersonalizedIntent, anchor: DOMRect) => void;
    /** for the guard verdict on a searched, never-ranked intent */
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    expanded: boolean;
    onToggleExpanded: () => void;
    hasChart: boolean;
    disabled?: boolean;
}

export function SuggestionsCard({
    byType, topOfType, thinkingKey, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    onExplain, ruleset, activeSignals, expanded, onToggleExpanded, hasChart,
    disabled = false, className = "",
    types, title = "Clinical Suggestions",
}: Props) {
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
     * Which category the search box is pointed at.
     *
     * `null` means all four. A filter rather than four separate boxes: the
     * doctor is looking for one thing and usually knows its name before they
     * know which of our four buckets we filed it under, and four search fields
     * on one card is four places to look for the same feature.
     */
    const [scope, setScope] = useState<IntentType | null>(null);
    const search = useIntentSearch(scope ? [scope] : SEARCH_TYPES);

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
            for (const intent of byType[section.type] ?? []) out.push({ intent, section });
        }
        return out;
    }, [byType]);

    const total = useMemo(
        () => SECTIONS.reduce((n, s) => n + (byType[s.type]?.length ?? 0), 0),
        [byType]
    );

    const rankedIds = useMemo(() => {
        const ids = new Set<number>();
        for (const s of SECTIONS) for (const i of byType[s.type] ?? []) ids.add(i.intentId);
        return ids;
    }, [byType]);

    const body = () => {
        if (search.isSearching) {
            return (
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
                />
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

        if (rows.length === 0) {
            return (
                <div className="cs-empty">
                    <BlankTestArt />
                    <strong>Nothing else to suggest for this chart</strong>
                    <span>Search above to order or refer something directly.</span>
                </div>
            );
        }

        return rows.map(({ intent, section }) => {
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
                    {/* Slate, not a hue. This panel mixes four intent types
                        that already carry their own row colours (test, referral,
                        advice, exercise), and the standing rule reserves blue
                        for the action — a category tile is not one. */}
                    <span className="cs-glyph is-slate cs-glyph-live">
                        <ThinkingRing pulseKey={thinkingKey} />
                        <Sparkles size={14} />
                    </span>
                    {title}
                </span>
                <span className="cs-sort">Sort by: <b>Relevance</b></span>
            </div>

            <IntentSearchField
                state={search}
                placeholder={
                    scope
                        ? `Search ${(SECTIONS.find((s) => s.type === scope)?.label ?? "").toLowerCase()}…`
                        : "Search tests, referrals, advice, exercises…"
                }
                disabled={disabled}
                trailing={
                    <select
                        className="cs-scope"
                        value={scope ?? ""}
                        aria-label="Limit the search to one category"
                        onChange={(e) => setScope((e.target.value || null) as IntentType | null)}
                    >
                        <option value="">All</option>
                        {SECTIONS.map((s) => (
                            <option key={s.type} value={s.type}>{s.label}</option>
                        ))}
                    </select>
                }
                onKeyDown={onSearchKeyDown}
            />

            <div className="cs-list" ref={listRef}>{body()}</div>
        </section>
    );
}

function SuggestionRow({
    intent, kindLabel, verb, icon, relevance, added, acknowledged, onAcknowledge,
    onExplain, onAccept,
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
                <span className="cs-added" aria-label="Taken"><Check size={15} /></span>
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

/** Re-exported so App can render the idle shortlist without a second import. */
export { Sparkles as SuggestionsGlyph };
