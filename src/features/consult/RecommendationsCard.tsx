// ---------------------------------------------------------------------------
// MEDICINE RECOMMENDATIONS — the primary recommendation panel.
//
// Four rules live here and nowhere else:
//
//  * No score is printed. Relative rank is a proportional bar; the figure
//    behind it is never rendered, never in a tooltip, never in a title.
//    "92% match" reads as diagnostic confidence to a human being and it is
//    nothing of the kind.
//
//  * A medicine is two lines. Brand first — what the doctor writes — and
//    composition beneath, muted, for verification.
//
//  * Nothing is ever hidden. A guarded medicine stays visible AT ITS REAL RANK,
//    styled red, with its reason on the row; the accept action and the brand
//    picker are withheld until the doctor acknowledges it. Acknowledgement is
//    per-consultation and reversible. There is no global banner — a warning
//    disconnected from the row it describes is a warning the doctor reads once
//    and then scrolls past.
//
//  * The heart is the DOCTOR'S pin, not the engine's opinion. Pinned rows sort
//    to the top; the bar beside them still draws the engine's real reading, so
//    a pin can never disguise weak evidence.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import {
    AlertTriangle, Check, ChevronDown, Pill, Pin, Plus, ShieldAlert,
} from "lucide-react";
import type { ActiveSignal, Ruleset } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import type { Medicine } from "../../lib/synapse/brands";
import { brandKey } from "../../lib/synapse/brands";
import type { CompositionBrands } from "../../lib/db/synapse";
import {
    GuardReason, MedicineIdentity, PinButton, RankBar, rankFillOf,
} from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";

/** Alternatives shown beside the default before the sheet takes over. */
const INLINE_ALTS = 3;

/**
 * How many rows before the panel asks.
 *
 * The ranking exists precisely so the head of the list is the part worth
 * reading; printing all nine turns a decision into a scroll. Anything already
 * accepted, and anything pinned, is always shown regardless of the cap — what
 * the doctor took, or asked for, must never sit behind a "show more".
 */
const CAP = 5;

interface Props {
    /** the ranked medicines, in engine order */
    intents: PersonalizedIntent[];
    /** the strongest final score among them — the bar's denominator */
    topScore: number;
    /** compositionId -> the brands under it */
    brands: Map<number, CompositionBrands>;
    brandsLoading: boolean;
    brandError: string | null;
    brandPreferences?: Map<string, { preference: number }>;
    acceptedIntentIds: Set<number>;
    chosenBrands: Map<number, number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    /** the doctor's pins */
    isPinned: (intentId: number) => boolean;
    onTogglePin: (intentId: number) => void;
    onOpenBrandSheet: (intent: PersonalizedIntent, rect: DOMRect) => void;
    onExplain: (intent: PersonalizedIntent, anchor: DOMRect) => void;
    /** for the guard verdict on a searched, never-ranked medicine */
    ruleset: Ruleset | null;
    activeSignals: ActiveSignal[];
    hasChart: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function RecommendationsCard({
    intents, topScore, brands, brandsLoading, brandError, brandPreferences,
    acceptedIntentIds, chosenBrands, acknowledged, onAcknowledge, onAccept,
    isPinned, onTogglePin, onOpenBrandSheet, onExplain, ruleset, activeSignals,
    hasChart, searchRef,
}: Props) {
    const [expanded, setExpanded] = useState(false);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;

    // The same search every other category now has — this card is where it was
    // first built, and it moved into `IntentSearch` so the other five could
    // have the identical thing rather than a near-copy.
    const search = useIntentSearch(["medicine"]);
    const isSearching = search.isSearching;

    /**
     * The engine's rank for each intent, 1-based, captured BEFORE pinning
     * reorders anything.
     *
     * The number on a row is the engine's position, not the row's position on
     * the page. A pinned medicine that the engine ranked fourth sits at the top
     * still wearing a 4 — renumbering it to 1 would be the interface claiming
     * the engine said something it did not. The pink badge is what says "you
     * put this here".
     */
    const engineRank = useMemo(() => {
        const m = new Map<number, number>();
        intents.forEach((i, idx) => m.set(i.intentId, idx + 1));
        return m;
    }, [intents]);

    /**
     * Pinned first, then the engine's order.
     *
     * A VIEW transform and nothing more — `intent.finalScore` is untouched, so
     * every bar still draws what the engine actually said. A pin moves a row up
     * the page; it does not move it up the ranking.
     */
    const ordered = useMemo(() => {
        const pins: PersonalizedIntent[] = [];
        const rest: PersonalizedIntent[] = [];
        for (const i of intents) (isPinned(i.intentId) ? pins : rest).push(i);
        return [...pins, ...rest];
    }, [intents, isPinned]);

    const shown = expanded
        ? ordered
        : [
            ...ordered.slice(0, CAP),
            ...ordered.slice(CAP).filter((i) => acceptedIntentIds.has(i.intentId)),
        ];
    const hidden = ordered.length - shown.length;

    const brandsFor = (intent: PersonalizedIntent) =>
        intent.refTable === "compositions" && intent.refId != null
            ? brands.get(intent.refId) ?? null
            : null;

    const chosenFor = (intent: PersonalizedIntent, list: Medicine[]): Medicine | null => {
        const id = chosenBrands.get(intent.intentId);
        if (id != null) return list.find((m) => m.id === id) ?? null;
        return list[0] ?? null;
    };

    const accept = (intent: PersonalizedIntent, medicine: Medicine | null, deliberate = false) => {
        const isHard = intent.status === "warn_hard";
        if (isHard && !acknowledged.has(intent.intentId)) return;
        onAccept({
            intentId: intent.intentId,
            type: intent.type,
            label: intent.label,
            refTable: intent.refTable,
            refId: intent.refId,
            medicine,
            viaSearch: false,
            overridden: isHard,
            brandDeliberate: deliberate,
        });
    };

    const rankedIds = useMemo(
        () => new Set(intents.map((i) => i.intentId)),
        [intents]
    );

    const body = () => {
        if (isSearching) {
            return (
                <IntentSearchResults
                    state={search}
                    verbOf={() => "Prescribe"}
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
                    <strong>Nothing on the chart yet</strong>
                    <span>
                        Add a symptom, a finding or a measurement and recommendations
                        appear here as you go.
                    </span>
                </div>
            );
        }

        if (ordered.length === 0) {
            return (
                <div className="cs-empty">
                    <strong>No medicine ranked for this chart</strong>
                    <span>Search above to reach one directly, or add more to the chart.</span>
                </div>
            );
        }

        return shown.map((intent) => (
            <MedicineRow
                key={intent.intentId}
                intent={intent}
                position={engineRank.get(intent.intentId) ?? 1}
                fill={rankFillOf(intent, topScore)}
                pinned={isPinned(intent.intentId)}
                onTogglePin={() => onTogglePin(intent.intentId)}
                added={acceptedIntentIds.has(intent.intentId)}
                acknowledged={acknowledged.has(intent.intentId)}
                onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                composition={brandsFor(intent)}
                brandsLoading={brandsLoading}
                chosen={chosenFor(intent, brandsFor(intent)?.brands ?? [])}
                brandPreferences={brandPreferences}
                onAccept={accept}
                onOpenSheet={(rect) => onOpenBrandSheet(intent, rect)}
                onExplain={(rect) => onExplain(intent, rect)}
                onSearchProducts={() => { search.setQuery(intent.label); inputRef.current?.focus(); }}
            />
        ));
    };

    return (
        <section className="cs-card" aria-label="Medicine recommendations">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-teal"><Pill size={14} /></span>
                    Medicine Recommendations
                </h2>
                {hasChart && !isSearching && ordered.length > 0 && (
                    <span className="cs-count is-quiet">{ordered.length} matched</span>
                )}
            </div>

            <IntentSearchField
                state={search}
                placeholder="Search medicine or composition…"
                inputRef={inputRef}
            />

            {brandError && !isSearching && (
                <p className="cs-picker-hint">
                    Brands could not be loaded, so molecules are shown without them. The
                    ranking below is unaffected.
                </p>
            )}

            <div className="cs-list">{body()}</div>

            {!isSearching && (hidden > 0 || expanded) && (
                <button type="button" className="cs-more" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show fewer" : `Show more medicines`}
                    <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : undefined }} />
                </button>
            )}
        </section>
    );
}

// ============================================================
// ONE RANKED MEDICINE
// ============================================================

function MedicineRow({
    intent, position, fill, pinned, onTogglePin, added, acknowledged, onAcknowledge,
    composition, brandsLoading, chosen, brandPreferences, onAccept, onOpenSheet,
    onExplain, onSearchProducts,
}: {
    intent: PersonalizedIntent;
    position: number;
    fill: number;
    pinned: boolean;
    onTogglePin: () => void;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    composition: CompositionBrands | null;
    brandsLoading: boolean;
    chosen: Medicine | null;
    brandPreferences?: Map<string, { preference: number }>;
    onAccept: (i: PersonalizedIntent, m: Medicine | null, deliberate?: boolean) => void;
    onOpenSheet: (rect: DOMRect) => void;
    onExplain: (rect: DOMRect) => void;
    onSearchProducts: () => void;
}) {
    const moreRef = useRef<HTMLButtonElement>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    const all = composition?.brands ?? [];
    const primary = all[0] ?? null;
    const alts = all.slice(1, 1 + INLINE_ALTS);
    const rest = Math.max(0, (composition?.singleTotal ?? 0) - 1 - alts.length);
    const combinationTotal = composition?.combinationTotal ?? 0;

    const isYours = (m: Medicine) => {
        const p = brandPreferences?.get(brandKey(m.compositionId, m.id, m.form));
        return !!p && p.preference > 0.15;
    };

    const face = added ? chosen : primary;

    return (
        <div
            ref={rowRef}
            className={
                `cs-rec${added ? " is-added" : ""}${isHard ? " is-hard" : ""}` +
                `${pinned ? " is-pinned" : ""}`
            }
            // The shortcut into the contribution sheet. The info button beside
            // the name is the discoverable route and the one a keyboard reaches.
            onDoubleClick={() => {
                const r = rowRef.current?.getBoundingClientRect();
                if (r) onExplain(r);
            }}
        >
            <span className="cs-rank-no">{position}</span>

            <div className="cs-rec-main">
                <MedicineIdentity
                    brand={face?.name ?? null}
                    composition={intent.label}
                    trailing={
                        <>
                            {face?.isClinicDefault && <Pin size={10} aria-label="Clinic default" />}
                            {face && isYours(face) && (
                                <span className="cs-brand-star" title="Your usual brand">★</span>
                            )}
                            {intent.isSafetyCritical && (
                                <span className="cs-flag is-safety"><ShieldAlert size={10} /> Safety</span>
                            )}
                            {isWarn && (
                                <span className="cs-flag is-warn"><AlertTriangle size={10} /> Caution</span>
                            )}
                            {isHard && (
                                <span className="cs-flag is-hard"><ShieldAlert size={10} /> Check</span>
                            )}
                            <WhyButton label={intent.label} onOpen={onExplain} />
                        </>
                    }
                />
            </div>

            <div className="cs-rec-side">
                <RankBar fill={fill} rank={position} hard={isHard} />
                <PinButton pinned={pinned} label={face?.name ?? intent.label} onToggle={onTogglePin} />
                {added ? (
                    <span className="cs-added" aria-label="On the plan"><Check size={15} /></span>
                ) : locked || !primary ? (
                    // Withheld, not disabled. A greyed-out + still reads as
                    // "press me once you scroll past the red text".
                    <span style={{ width: 29 }} aria-hidden="true" />
                ) : (
                    <button
                        type="button"
                        className="cs-add"
                        aria-label={`Prescribe ${face?.name ?? intent.label}`}
                        onClick={() => onAccept(intent, primary, false)}
                    ><Plus size={15} /></button>
                )}
            </div>

            {/* The brand picker is WITHHELD while a hard warning is unread, for
                the same reason the accept is: a row of pickable brands invites
                the doctor to click past the reason. */}
            {added || locked ? null : brandsLoading ? (
                <div className="cs-brands">
                    <span className="cs-brand is-skeleton" />
                    <span className="cs-brand is-skeleton" />
                </div>
            ) : !primary ? (
                <div className="cs-nobrand">
                    {combinationTotal > 0 ? (
                        <>
                            No standalone product — {combinationTotal.toLocaleString("en-IN")} combination
                            {combinationTotal === 1 ? "" : "s"} contain this molecule.
                            <button type="button" onClick={onSearchProducts}>Search products</button>
                        </>
                    ) : (
                        <>Rankable, but no product in the catalogue contains it on its own.</>
                    )}
                </div>
            ) : (alts.length > 0 || rest > 0) ? (
                <div className="cs-brands">
                    <span className="cs-brands-or">or</span>
                    {alts.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            className="cs-brand"
                            onClick={() => onAccept(intent, m, true)}
                            title={`Prescribe ${m.name} instead`}
                        >
                            {m.isClinicDefault && <Pin size={9} />}
                            {isYours(m) && <span className="cs-brand-star">★</span>}
                            {m.name}
                        </button>
                    ))}
                    {rest > 0 && (
                        <button
                            ref={moreRef}
                            type="button"
                            className="cs-brand"
                            onClick={() => {
                                const r = moreRef.current?.getBoundingClientRect();
                                if (r) onOpenSheet(r);
                            }}
                        >
                            {rest.toLocaleString("en-IN")} more <ChevronDown size={11} />
                        </button>
                    )}
                </div>
            ) : null}

            {added && (composition?.singleTotal ?? 0) > 1 && (
                <div className="cs-brands">
                    <button
                        ref={moreRef}
                        type="button"
                        className="cs-brand"
                        onClick={() => {
                            const r = moreRef.current?.getBoundingClientRect();
                            if (r) onOpenSheet(r);
                        }}
                    >change brand</button>
                </div>
            )}

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <div className="cs-rec-guard">
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
