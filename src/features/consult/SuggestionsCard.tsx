// ---------------------------------------------------------------------------
// CLINICAL SUGGESTIONS — everything the engine has to say that is not a
// medicine, split by intent type and read as a list of considerations.
//
// Possible Finding · Investigation · Referral · Advice · Exercise, in clinical
// reading order: what could this be → what confirms it → who else should see
// them → what to tell them.
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

import { useMemo } from "react";
import {
    Activity, ArrowUpRight, Check, ChevronDown, FlaskConical, Lightbulb,
    ShieldAlert, Stethoscope, Sparkles,
} from "lucide-react";
import type { IntentType } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import { GuardReason, RELEVANCE_TEXT, rankFillOf, relevanceOf } from "./parts";
import type { AcceptPayload } from "./types";

/** Section order, labels, glyphs and the verb each type is accepted with. */
const SECTIONS: {
    type: IntentType;
    label: string;
    verb: string;
    icon: React.ReactNode;
}[] = [
        { type: "finding", label: "Possible Finding", verb: "Consider", icon: <Stethoscope size={14} /> },
        { type: "test", label: "Investigation", verb: "Order", icon: <FlaskConical size={14} /> },
        { type: "referral", label: "Referral", verb: "Refer", icon: <ArrowUpRight size={14} /> },
        { type: "advice", label: "Advice", verb: "Advise", icon: <Lightbulb size={14} /> },
        { type: "exercise", label: "Exercise", verb: "Add", icon: <Activity size={14} /> },
    ];

/** Rows shown per type before the panel asks. */
const CAP = 2;

interface Props {
    byType: Record<IntentType, PersonalizedIntent[]>;
    topOfType: Map<IntentType, number>;
    acceptedIntentIds: Set<number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    expanded: boolean;
    onToggleExpanded: () => void;
    hasChart: boolean;
}

export function SuggestionsCard({
    byType, topOfType, acceptedIntentIds, acknowledged, onAcknowledge, onAccept,
    expanded, onToggleExpanded, hasChart,
}: Props) {
    /**
     * One flat, ordered list rather than five sub-lists.
     *
     * The mock reads as a single stream with a type label on each row, and that
     * is the right shape: the doctor is scanning for anything worth acting on,
     * not visiting five sections in turn. The type stays legible on every row,
     * so nothing is lost by flattening.
     */
    const rows = useMemo(() => {
        const out: { intent: PersonalizedIntent; section: (typeof SECTIONS)[number] }[] = [];
        for (const section of SECTIONS) {
            const list = byType[section.type] ?? [];
            const take = expanded ? list : list.slice(0, CAP);
            // Anything already taken stays visible regardless of the cap.
            const kept = expanded
                ? take
                : [...take, ...list.slice(CAP).filter((i) => acceptedIntentIds.has(i.intentId))];
            for (const intent of kept) out.push({ intent, section });
        }
        return out;
    }, [byType, expanded, acceptedIntentIds]);

    const total = useMemo(
        () => SECTIONS.reduce((n, s) => n + (byType[s.type]?.length ?? 0), 0),
        [byType]
    );

    const hidden = total - rows.length;

    return (
        <section className="cs-card" aria-label="Clinical suggestions">
            <div className="cs-sug-head">
                <span className="cs-sug-tab">Clinical Suggestions</span>
                <span className="cs-sort">Sort by: <b>Relevance</b></span>
            </div>

            <div className="cs-list">
                {!hasChart ? (
                    <div className="cs-empty">
                        <strong>Start adding observations to activate Synapse</strong>
                        <span>
                            Symptoms, findings and measurements all feed the same reading —
                            suggestions appear here the moment one lands.
                        </span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="cs-empty">
                        <strong>Nothing else to suggest for this chart</strong>
                        <span>The medicines beside this panel are the whole of it.</span>
                    </div>
                ) : (
                    rows.map(({ intent, section }) => {
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
                    })
                )}
            </div>

            {hasChart && (hidden > 0 || expanded) && (
                <button type="button" className="cs-more" onClick={onToggleExpanded}>
                    {expanded ? "Show fewer" : "Show more suggestions"}
                    <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
                </button>
            )}
        </section>
    );
}

function SuggestionRow({
    intent, kindLabel, verb, icon, relevance, added, acknowledged, onAcknowledge, onAccept,
}: {
    intent: PersonalizedIntent;
    kindLabel: string;
    verb: string;
    icon: React.ReactNode;
    relevance: string | null;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onAccept: () => void;
}) {
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;
    const tone = intent.type;

    return (
        <div className={`cs-sug${added ? " is-added" : ""}${isHard ? " is-hard" : ""}`}>
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
