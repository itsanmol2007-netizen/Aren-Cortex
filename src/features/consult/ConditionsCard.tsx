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
import { Check, ChevronDown, ShieldAlert, Stethoscope } from "lucide-react";
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
    disabled?: boolean;
}

export function ConditionsCard({
    intents, topScore, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    onExplain, ruleset, activeSignals, hasChart, disabled = false,
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

    return (
        <section className="cs-card cs-picker" aria-label="Possible conditions">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-violet"><Stethoscope size={14} /></span>
                    Possible Conditions
                </h2>
                {!search.isSearching && intents.length > 0 && (
                    <span className="cs-count is-quiet">{intents.length} ranked</span>
                )}
            </div>

            {/* The honesty line. It is permanent rather than a tooltip because
                what this panel reads from is exactly the thing a doctor would
                otherwise assume wrongly. */}
            <p className="cs-cond-note">
                Ranked from everything entered so far — symptoms, examination
                findings and measurements. Not a diagnosis.
            </p>

            <IntentSearchField
                state={search}
                placeholder="Search conditions…"
                disabled={disabled}
            />

            <div className="cs-list">{body()}</div>

            {!search.isSearching && (hidden > 0 || expanded) && (
                <button type="button" className="cs-more" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show fewer" : "Show more conditions"}
                    <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
                </button>
            )}
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
