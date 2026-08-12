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

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ShieldAlert, Stethoscope, X } from "lucide-react";
import type { ActiveSignal, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import { GuardReason, RELEVANCE_TEXT, rankFillOf, relevanceOf } from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";

/** Rows shown before the panel asks. */
const CAP = 4;

interface Props {
    /** the ranked `finding` intents, in engine order */
    intents: PersonalizedIntent[];
    /** the strongest score among them — the relevance denominator */
    topScore: number;
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
    disabled?: boolean;
}

export function ConditionsCard({
    intents, topScore, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    onExplain, ruleset, activeSignals, hasChart,
    diagnoses, onRemoveDiagnosis, disabled = false,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const search = useIntentSearch(["finding"]);

    const shown = expanded
        ? intents
        : [
            ...intents.slice(0, CAP),
            // Anything already confirmed stays visible regardless of the cap.
            ...intents.slice(CAP).filter((i) => acceptedIntentIds.has(i.intentId)),
        ];
    const hidden = intents.length - shown.length;

    const rankedIds = useMemo(
        () => new Set(intents.map((i) => i.intentId)),
        [intents]
    );

    const body = () => {
        if (search.isSearching) {
            return (
                <IntentSearchResults
                    state={search}
                    verbOf={() => "Confirm"}
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
                    <strong>Nothing to read yet</strong>
                    <span>
                        Conditions appear as you enter symptoms, findings and
                        measurements — and re-order as you go.
                    </span>
                </div>
            );
        }

        if (intents.length === 0) {
            return (
                <div className="cs-empty">
                    <strong>No condition ranks for this chart</strong>
                    <span>Search above to record one directly.</span>
                </div>
            );
        }

        return shown.map((intent) => (
            <ConditionRow
                key={intent.intentId}
                intent={intent}
                // A list of one has no other side to the comparison, and the
                // word could only ever read "High relevance" however weakly the
                // engine scored it.
                relevance={
                    intents.length > 1
                        ? RELEVANCE_TEXT[relevanceOf(rankFillOf(intent, topScore))]
                        : null
                }
                confirmed={acceptedIntentIds.has(intent.intentId)}
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
        ));
    };

    // The doctor's own assessment, in the order they confirmed it. First is
    // PRIMARY, the rest are SECONDARY — a convention, not a derivation: the
    // engine never decides which diagnosis is primary, because that is the one
    // judgement in this workspace that is entirely the doctor's.
    const [primaryDx, ...secondaryDx] = diagnoses;

    return (
        <section className="cs-card cs-assess" aria-label="Assessment">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-violet"><Stethoscope size={16} /></span>
                    Assessment
                </h2>
            </div>

            {/* ONE column, read top to bottom: search → what you have chosen →
                what is ranked. The two-column version this replaces put the
                doctor's decision beside the engine's list, which made the
                module twice as wide as it needed to be and read as two
                separate panels sharing a border. Sequence carries the
                distinction better than adjacency does — the chip is above the
                list because it is the OUTCOME of it. */}
            <div className="cs-assess-body">
                <div className="cs-assess-decide">
                    <IntentSearchField
                        state={search}
                        placeholder="Search diagnosis / condition…"
                        disabled={disabled}
                    />

                    {search.isSearching ? (
                        <div className="cs-list">{body()}</div>
                    ) : (
                        <>
                            <div className="cs-assess-slot">
                                <span className="cs-assess-slot-label">Primary</span>
                                {primaryDx ? (
                                    <DxChip
                                        label={primaryDx}
                                        tone="primary"
                                        onRemove={() => onRemoveDiagnosis(primaryDx)}
                                    />
                                ) : (
                                    <span className="cs-assess-slot-empty">
                                        Confirm one from the suggestions, or search above
                                    </span>
                                )}
                            </div>

                            {secondaryDx.length > 0 && (
                                <div className="cs-assess-slot">
                                    <span className="cs-assess-slot-label">Secondary</span>
                                    <span className="cs-assess-chips">
                                        {secondaryDx.map((dx) => (
                                            <DxChip
                                                key={dx}
                                                label={dx}
                                                tone="secondary"
                                                onRemove={() => onRemoveDiagnosis(dx)}
                                            />
                                        ))}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* The ranked list, full width beneath the decision. Titled as
                    possibilities and never as an assessment — ranking is a
                    safety property, not a verdict (handoff §1), and the
                    heading is where that promise is kept or broken. */}
                {!search.isSearching && (
                    <div className="cs-assess-ranked">
                        <div className="cs-assess-ranked-head">
                            <span className="cs-assess-ranked-title">Ranked Conditions</span>
                            {intents.length > 0 && (
                                <span className="cs-count is-quiet">{intents.length} ranked</span>
                            )}
                        </div>
                        <p className="cs-cond-note">
                            Ranked from symptoms, findings and measurements. You decide.
                        </p>
                        <div className="cs-list">{body()}</div>
                        {hidden > 0 && !expanded && (
                            <button type="button" className="cs-more" onClick={() => setExpanded(true)}>
                                Show {hidden} more
                                <ChevronDown size={14} />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

function ConditionRow({
    intent, relevance, confirmed, acknowledged, onAcknowledge, onExplain, onAccept,
}: {
    intent: PersonalizedIntent;
    relevance: string | null;
    confirmed: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onExplain: (anchor: DOMRect) => void;
    onAccept: () => void;
}) {
    const rowRef = useRef<HTMLDivElement>(null);
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    return (
        <div
            ref={rowRef}
            className={`cs-sug${confirmed ? " is-added" : ""}${isHard ? " is-hard" : ""}`}
            // The second way in. The info button is the discoverable one and
            // the only one a keyboard reaches; double-click is the shortcut for
            // a doctor who already knows it is there.
            onDoubleClick={() => {
                const r = rowRef.current?.getBoundingClientRect();
                if (r) onExplain(r);
            }}
        >
            <span className="cs-sug-icon is-finding" aria-hidden="true">
                <Stethoscope size={14} />
            </span>

            <div className="cs-sug-main">
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

            {confirmed ? (
                <span className="cs-added" aria-label="Confirmed"><Check size={15} /></span>
            ) : locked ? (
                <span style={{ width: 29 }} aria-hidden="true" />
            ) : (
                <button type="button" className="cs-act" onClick={onAccept}>Confirm</button>
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
 * One confirmed diagnosis, as a chip.
 *
 * Deliberately a different object from the suggestion rows beside it: those
 * carry a relevance bar and a "Confirm" verb, this carries neither. A chip is
 * a decision that has been made; a row is one that has not. Making them look
 * alike is precisely how a ranked possibility gets read as a diagnosis.
 */
function DxChip({
    label, tone, onRemove,
}: {
    label: string;
    tone: "primary" | "secondary";
    onRemove: () => void;
}) {
    return (
        <span className={`cs-dx is-${tone}`}>
            <i className="cs-dx-dot" aria-hidden="true" />
            <span className="cs-dx-label">{label}</span>
            <button
                type="button"
                className="cs-dx-x"
                onClick={onRemove}
                aria-label={`Remove ${label}`}
            >
                <X size={13} />
            </button>
        </span>
    );
}
