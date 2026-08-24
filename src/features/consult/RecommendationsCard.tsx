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
import { motion, useReducedMotion } from "motion/react";
import {
    AlertTriangle, Check, ChevronDown, Pill, Pin, Plus, ShieldAlert, X,
} from "lucide-react";
import {
    guardCombination, medicineIntentIndex,
    type ActiveSignal, type GuardStatus, type GuardVerdict, type Intent, type IntentType, type Ruleset,
} from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import type { Medicine } from "../../lib/synapse/brands";
import { brandKey } from "../../lib/synapse/brands";
import type { CompositionBrands } from "../../lib/db/synapse";
import type { ResolvedProduct } from "../../lib/db/medicines";
import {
    GuardReason, MedicineIdentity, PinButton, RankBar, ThinkingRing, rankFillOf,
} from "./parts";
import { WhyButton } from "./ContributionSheet";
import {
    IntentSearchField, IntentSearchResults, useIntentSearch,
} from "./IntentSearch";
import type { AcceptPayload } from "./types";
import { BlankMedicineArt } from "./BlankArt";
import { useRovingList } from "../../hooks/useRovingList";
import { firedChord, matches } from "../../lib/keyboard/keymap";

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

interface Props {
    /** layout class from the output strip — which slot this panel occupies */
    className?: string;
    /** the ranked medicines, in engine order */
    intents: PersonalizedIntent[];
    /** the strongest final score among them — the bar's denominator */
    topScore: number;
    /** "Synapse is thinking" cue — see ThinkingRing in parts.tsx */
    thinkingKey: string;
    /** compositionId -> the brands under it */
    brands: Map<number, CompositionBrands>;
    brandsLoading: boolean;
    brandError: string | null;
    /**
     * compositionId -> combination products containing it, fewest extra
     * molecules first — the counterpart to `brands`, which only ever holds
     * single-molecule products. See useConsultIntelligence.ts §4b.
     */
    combinations: Map<number, ResolvedProduct[]>;
    combinationsLoading: boolean;
    brandPreferences?: Map<string, { preference: number }>;
    acceptedIntentIds: Set<number>;
    chosenBrands: Map<number, number>;
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    /**
     * Undo an accept in place, on the same row — §9, 2026-08-24. Optional so
     * this card keeps working, unwired, anywhere it has no plan to remove
     * FROM; every real caller today passes `removeAcceptedIntent`.
     */
    onRemove?: (intentId: number, type: IntentType, label: string) => void;
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
    /**
     * "Not found in ranking or search" used to be a dead end — §5,
     * 2026-08-24. Opens `AddMedicineSheet` with the doctor's own query
     * already in the name field. Optional so this card keeps working
     * unwired anywhere that has nowhere to put the sheet it would open.
     */
    onOpenAddMedicine?: (initialName: string) => void;
}

export function RecommendationsCard({
    intents, topScore, thinkingKey, brands, brandsLoading, brandError, combinations,
    combinationsLoading, brandPreferences,
    acceptedIntentIds, chosenBrands, acknowledged, onAcknowledge, onAccept, onRemove,
    isPinned, onTogglePin, onOpenBrandSheet, onExplain, ruleset, activeSignals,
    hasChart, searchRef, onOpenAddMedicine, className = "",
}: Props) {

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

    // The whole ranked list, always. This card is bounded by the output strip
    // and `.cs-list` scrolls inside it, so there is nothing to expand INTO —
    // the rest of the list is simply below the fold of its own panel, which is
    // where a doctor already expects more rows to be.
    //
    // The cap-and-expand it replaces was actively harmful in the strip layout:
    // expanding grew the card, which stretched its row, which left dead white
    // space in the column beside it (Anmol, 2026-08-12).
    const shown = ordered;

    const brandsFor = (intent: PersonalizedIntent) =>
        intent.refTable === "compositions" && intent.refId != null
            ? brands.get(intent.refId) ?? null
            : null;

    const combosFor = (intent: PersonalizedIntent): ResolvedProduct[] =>
        intent.refTable === "compositions" && intent.refId != null
            ? combinations.get(intent.refId) ?? []
            : [];

    // The reverse of `ruleset.intents`: a combination's OTHER molecules are
    // reached by composition id, not by the intent id they were ranked
    // through. Built once per ruleset load, not per row — see its doc comment.
    const intentIndex = useMemo<Map<number, Intent>>(
        () => (ruleset ? medicineIntentIndex(ruleset) : new Map()),
        [ruleset]
    );

    /**
     * Every combination product's OWN full-strength verdict, keyed by its
     * medicine id — checked across EVERY molecule it carries, not only the one
     * composition it happens to sit under in `combinations`. Computed once for
     * the whole card rather than per row, since the same product can appear
     * under more than one ranked composition.
     */
    const comboVerdicts = useMemo(() => {
        const m = new Map<number, GuardVerdict>();
        if (!ruleset) return m;
        for (const list of combinations.values()) {
            for (const product of list) {
                if (!m.has(product.id)) {
                    m.set(
                        product.id,
                        guardCombination(ruleset, activeSignals, intentIndex, product.compositionIds)
                    );
                }
            }
        }
        return m;
    }, [combinations, ruleset, activeSignals, intentIndex]);

    /**
     * The row's REAL guard status: the ranked composition's own verdict,
     * merged with every combination product offered beside it.
     *
     * A combination carries molecules the engine never scored, so checking
     * only the molecule it was ranked through would let it reach the doctor
     * with a WEAKER warning than a direct search for the same product would
     * give it — doctrine rule 11, and the reason this exists rather than
     * reading `intent.status` straight off the engine's output everywhere
     * below. A hard verdict on any one combination locks the whole row —
     * every alternate under it, single-molecule or combination — until it is
     * read and acknowledged, the same as the engine's own hard warnings.
     */
    const effectiveVerdicts = useMemo(() => {
        const m = new Map<number, GuardVerdict>();
        for (const intent of intents) {
            let status: GuardStatus = intent.status;
            const reasons = new Set(intent.guardReasons);
            for (const product of combosFor(intent)) {
                const v = comboVerdicts.get(product.id);
                if (!v) continue;
                if (v.status === "warn_hard") status = "warn_hard";
                else if (v.status === "warn" && status !== "warn_hard") status = "warn";
                v.reasons.forEach((r) => reasons.add(r));
            }
            m.set(intent.intentId, { status, reasons: [...reasons] });
        }
        return m;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [intents, combinations, comboVerdicts]);

    const chosenFor = (
        intent: PersonalizedIntent, list: Medicine[], combos: ResolvedProduct[]
    ): Medicine | null => {
        const id = chosenBrands.get(intent.intentId);
        if (id != null) return [...list, ...combos].find((m) => m.id === id) ?? null;
        return list[0] ?? null;
    };

    const accept = (intent: PersonalizedIntent, medicine: Medicine | null, deliberate = false) => {
        const isHard = (effectiveVerdicts.get(intent.intentId)?.status ?? intent.status) === "warn_hard";
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

    /**
     * ── Walking the list from the search field ──────────────────────────────
     *
     * The cursor covers the ranked rows AND the search hits with no branch,
     * because both render into the same `.cs-list` and the selector picks up
     * whichever is on screen. That is not a coincidence worth relying on
     * accidentally, so it is stated: `.cs-rec` is a ranked medicine and
     * `.cs-sug` is a search hit, and a doctor pressing ↓ after typing
     * "acenac" means the same thing either way.
     *
     * The action selector is deliberately narrow. `.cs-prescribe` and
     * `.cs-act` are the row's verb; the pin, the "why" button and the brand
     * chips are not, and Enter must never fire one of those by being generous
     * about what counts as the primary action.
     *
     * A row whose verb is missing — already prescribed, or withheld behind an
     * unacknowledged hard guard — stays in the walk and does nothing on Enter.
     * Skipping it would make ↓ jump silently over a red warning, which is the
     * exact failure the guards exist to prevent (doctrine rule 11).
     *
     * ── Opening a row's alternates joins the SAME walk, in place ────────────
     *
     * Found live, 2026-08-15: → opened a row's alternates, but ↓ from there
     * jumped straight to the NEXT MEDICINE — the alternate brand chips
     * `.cs-brand` were never part of the walk at all, so there was no way to
     * reach a second brand of the SAME molecule without a mouse.
     *
     * `rowSelector` now excludes an OPEN row from counting as its own step
     * (`:not(.is-open)`) and, in its place, counts each of its `.cs-brand`
     * chips — the regular alternates, the combination alternates, and the "N
     * more" chip that opens the full `BrandSheet`, all of which already carry
     * that class. So the walk becomes, in order: …previous row → [this row's
     * alternates, one step each] → next row… with no branch needed for it.
     * `actionSelector` gaining `button.cs-brand` is what makes Enter correct
     * on those steps too: a `.cs-brand` chip already matches the selector by
     * itself, so `activate()` clicks it directly rather than hunting inside
     * it for something else — the same "row IS the action" shape
     * `PatientModal`'s match rows and `BrandSheet`'s own rows use.
     */
    const listRef = useRef<HTMLDivElement>(null);
    const roving = useRovingList({
        containerRef: listRef,
        // The middle clause is the guard for a row that opens to NOTHING —
        // one brand, no combinations, so `.cs-brands` never renders at all
        // (see MedicineRow's body). Without it, an open-but-empty row would
        // match neither the first clause (it IS open) nor the last (it has
        // no `.cs-brand` children), vanishing from the walk entirely and
        // stranding ↓ on whatever the list's next stale index happens to be.
        rowSelector:
            ".cs-rec:not(.is-open), .cs-rec.is-open:not(:has(.cs-brand)), " +
            ".cs-sug, .cs-rec.is-open .cs-brand",
        actionSelector: "button.cs-prescribe, button.cs-act, button.cs-brand",
    });

    const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const move = firedChord(e, "medMove");
        if (move) {
            e.preventDefault();
            e.stopPropagation();
            roving.move(move.key === "ArrowUp" ? -1 : 1);
            return;
        }
        if (matches(e, "medPrescribe")) {
            e.preventDefault();
            e.stopPropagation();
            roving.activate();
            return;
        }
        const brands = firedChord(e, "medBrands");
        if (brands) {
            const cur = roving.current();
            if (!cur) return;
            e.preventDefault();
            e.stopPropagation();
            // The cursor might be sitting on the row itself (closed) or on
            // one of its alternate chips (open) — either way, the row that
            // owns the toggle is the nearest `.cs-rec` ancestor-or-self.
            const row = cur.classList.contains("cs-brand") ? cur.closest<HTMLElement>(".cs-rec") : cur;
            if (!row) return;
            const open = row.classList.contains("is-open");
            if (brands.key === "ArrowRight" && !open) {
                // The row's own onClick is the toggle (see MedicineRow). Its
                // alternates don't exist in the DOM until the state update
                // this triggers has actually rendered, so the cursor can only
                // be moved onto the first one a frame later — see the
                // `useOverlayFocus.ts` header for why this codebase already
                // treats "wait a frame for React, then touch the DOM" as a
                // normal pattern rather than something to route around.
                row.click();
                window.requestAnimationFrame(() => {
                    const firstAlt = row.querySelector<HTMLElement>(".cs-brand");
                    if (firstAlt) {
                        roving.clear();
                        firstAlt.setAttribute("data-cx-cursor", "on");
                        firstAlt.scrollIntoView({ block: "nearest" });
                    }
                });
            } else if (brands.key === "ArrowLeft" && open) {
                row.click();
                // Land back on the row itself, not on a chip that is about to
                // stop existing — the doctor asked to leave the alternates,
                // not to lose their place in the list that contains them.
                window.requestAnimationFrame(() => {
                    roving.clear();
                    row.setAttribute("data-cx-cursor", "on");
                    row.scrollIntoView({ block: "nearest" });
                });
            }
            return;
        }
        if (matches(e, "medWhy")) {
            const row = roving.current();
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            row.querySelector<HTMLElement>("button.cs-why-btn")?.click();
        }
    };

    const body = () => {
        if (isSearching) {
            return (
                <>
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
                        onRemove={onRemove}
                    />
                    {/* "Not found in ranking or search" is not a dead end any
                        more — §5, 2026-08-24. Deliberately worded around
                        "new medicine": it is not new to the doctor, only to
                        this catalogue. Shown once loading settles, whether
                        or not the search above found something else — the
                        exact brand the doctor is thinking of can be genuinely
                        absent even when its molecule ranks plenty of others. */}
                    {onOpenAddMedicine && !search.loading && (
                        <button
                            type="button"
                            className="cs-newmed-prompt"
                            onClick={() => onOpenAddMedicine(search.query.trim())}
                        >
                            <Plus size={13} />
                            Can’t find it? Add “{search.query.trim()}” to your medicines
                        </button>
                    )}
                </>
            );
        }

        if (!hasChart) {
            return (
                <div className="cs-empty">
                    <BlankMedicineArt />
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
                    <BlankMedicineArt />
                    <strong>No medicine ranked for this chart</strong>
                    <span>Search above to reach one directly, or add more to the chart.</span>
                </div>
            );
        }

        return shown.map((intent) => {
            const combos = combosFor(intent);
            const verdict = effectiveVerdicts.get(intent.intentId)
                ?? { status: intent.status, reasons: intent.guardReasons };
            return (
                <MedicineRow
                    key={intent.intentId}
                    intent={intent}
                    verdict={verdict}
                    position={engineRank.get(intent.intentId) ?? 1}
                    fill={rankFillOf(intent, topScore)}
                    pinned={isPinned(intent.intentId)}
                    onTogglePin={() => onTogglePin(intent.intentId)}
                    added={acceptedIntentIds.has(intent.intentId)}
                    acknowledged={acknowledged.has(intent.intentId)}
                    onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                    composition={brandsFor(intent)}
                    brandsLoading={brandsLoading}
                    combos={combos}
                    combosLoading={combinationsLoading}
                    comboVerdictOf={(productId) => comboVerdicts.get(productId) ?? null}
                    chosen={chosenFor(intent, brandsFor(intent)?.brands ?? [], combos)}
                    brandPreferences={brandPreferences}
                    onAccept={accept}
                    onOpenSheet={(rect) => onOpenBrandSheet(intent, rect)}
                    onExplain={(rect) => onExplain(intent, rect)}
                    onSearchProducts={() => { search.setQuery(intent.label); inputRef.current?.focus(); }}
                    onRemove={onRemove && (() => onRemove(intent.intentId, intent.type, intent.label))}
                />
            );
        });
    };

    return (
        <section className={`cs-card ${className}`} aria-label="Medicine recommendations">
            <div className="cs-card-head">
                <h2 className="cs-card-title">
                    <span className="cs-glyph is-teal cs-glyph-live">
                        <ThinkingRing pulseKey={thinkingKey} />
                        <Pill size={14} />
                    </span>
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
                onKeyDown={onSearchKeyDown}
            />

            {brandError && !isSearching && (
                <p className="cs-picker-hint">
                    Brands could not be loaded, so molecules are shown without them. The
                    ranking below is unaffected.
                </p>
            )}

            <div className="cs-list" ref={listRef}>{body()}</div>
        </section>
    );
}

// ============================================================
// ONE RANKED MEDICINE
// ============================================================

function MedicineRow({
    intent, verdict, position, fill, pinned, onTogglePin, added, acknowledged, onAcknowledge,
    composition, brandsLoading, combos, combosLoading, comboVerdictOf, chosen, brandPreferences,
    onAccept, onOpenSheet, onExplain, onSearchProducts, onRemove,
}: {
    intent: PersonalizedIntent;
    /** the row's REAL status — the engine's own verdict merged with every
     *  combination offered beside it. See `effectiveVerdicts` in the parent. */
    verdict: GuardVerdict;
    position: number;
    fill: number;
    pinned: boolean;
    onTogglePin: () => void;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    composition: CompositionBrands | null;
    brandsLoading: boolean;
    /** combination products containing this molecule, fewest extra molecules first */
    combos: ResolvedProduct[];
    combosLoading: boolean;
    comboVerdictOf: (productId: number) => GuardVerdict | null;
    chosen: Medicine | null;
    brandPreferences?: Map<string, { preference: number }>;
    onAccept: (i: PersonalizedIntent, m: Medicine | null, deliberate?: boolean) => void;
    onOpenSheet: (rect: DOMRect) => void;
    onExplain: (rect: DOMRect) => void;
    onSearchProducts: () => void;
    /** instant undo, right on the "on the plan" badge — see the card's doc comment */
    onRemove?: () => void;
}) {
    const moreRef = useRef<HTMLButtonElement>(null);
    const reduceMotion = useReducedMotion();
    /**
     * Whether this row is the OPEN one.
     *
     * Alternates and "Change brand" belong to a row the doctor has actually
     * turned their attention to. Shown on every row they were pure clutter:
     * the column is scanned far more often than it is acted on, and four brand
     * chips plus a "1,782 more" under each of eight medicines is a wall.
     * Anmol, 2026-08-13: "change brand option should only appear when you click
     * on the medicine."
     */
    const [open, setOpen] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);
    const isHard = verdict.status === "warn_hard";
    const isWarn = verdict.status === "warn";
    const locked = isHard && !acknowledged;

    const all = composition?.brands ?? [];
    // A molecule with no standalone product still has combinations to offer —
    // docs/aren-cortex-atlas.md §14.17. When there is no single-molecule
    // brand at all, the best combination (fewest extra molecules) IS the
    // primary: `primary` gates every action on this row (Prescribe, the pin
    // label, the identity's brand line), so this one fallback is what makes
    // all of them work for a combination-only molecule with no extra code.
    const primary = all[0] ?? combos[0] ?? null;
    const alts = all.length > 0 ? all.slice(1, 1 + INLINE_ALTS) : [];
    const rest = Math.max(0, (composition?.singleTotal ?? 0) - 1 - alts.length);
    const combinationTotal = composition?.combinationTotal ?? 0;
    // Combinations shown as ALTERNATES, i.e. not already claimed as `primary`
    // above — every one of them when a standalone brand leads the row, all
    // but the lead combination when a combination itself leads it.
    const comboAlts = all.length > 0 ? combos : combos.slice(1);

    const isYours = (m: Medicine) => {
        const p = brandPreferences?.get(brandKey(m.compositionId, m.id, m.form));
        return !!p && p.preference > 0.15;
    };

    const face = added ? chosen : primary;
    // EVERY molecule the face actually contains, when it is a combination —
    // the same fix `MedicineAddSheet`'s header applies, and for the same
    // reason: `intent.label` alone is the ONE molecule the engine scored, and
    // printing only that under a combination states half of what is being
    // prescribed. `Medicine.compositionLabels` is exactly this: present when
    // the product was resolved whole (see its doc comment in brands.ts),
    // absent for an ordinary single-molecule brand.
    const faceComposition = face?.compositionLabels?.length
        ? face.compositionLabels.join(" + ")
        : intent.label;

    return (
        <div
            ref={rowRef}
            className={
                `cs-rec${added ? " is-added" : ""}${isHard ? " is-hard" : ""}` +
                `${pinned ? " is-pinned" : ""}${open ? " is-open" : ""}`
            }
            // Clicking the row opens it: alternates and "Change brand" appear.
            // Clicks on the buttons inside stop here, so pressing Prescribe
            // does not also expand the row it is leaving.
            onClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                setOpen((v) => !v);
            }}
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
                    composition={faceComposition}
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
                {added ? (
                    onRemove ? (
                        <button
                            type="button"
                            className="cs-added is-removable"
                            aria-label={`Remove ${face?.name ?? intent.label} from the plan`}
                            title="On the plan — click to remove"
                            onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        >
                            <Check size={15} className="cs-added-check" />
                            <X size={13} className="cs-added-x" />
                        </button>
                    ) : (
                        <span className="cs-added" aria-label="On the plan"><Check size={15} /></span>
                    )
                ) : locked || !primary ? (
                    // Withheld, not disabled. A greyed-out button still reads
                    // as "press me once you scroll past the red text".
                    <span style={{ width: 76 }} aria-hidden="true" />
                ) : (
                    <>
                        {/* Named, not a "+". The verb is what the doctor is
                            doing, and a plus sign on a medicine row could as
                            easily mean "add another". */}
                        <button
                            type="button"
                            className="cs-prescribe"
                            onClick={() => onAccept(intent, primary, false)}
                        >Prescribe</button>
                        {/* Revealed on the open row only. Every row carrying a
                            "Change brand" control plus a line of alternate
                            chips is what made this column read as scattered:
                            three competing actions per row, on a list the
                            doctor mostly scans rather than acts on. */}
                        {/* Tied to the single-molecule browse sheet only —
                            `onOpenSheet` has no idea combinations exist. Those
                            are already fully inline below when the row is
                            open; there is nothing this button would add for
                            them. */}
                        {open && (alts.length > 0 || rest > 0) && (
                            <button
                                ref={moreRef}
                                type="button"
                                className="cs-changebrand"
                                onClick={() => {
                                    const r = moreRef.current?.getBoundingClientRect();
                                    if (r) onOpenSheet(r);
                                }}
                            >Change brand</button>
                        )}
                    </>
                )}
                <PinButton pinned={pinned} label={face?.name ?? intent.label} onToggle={onTogglePin} />
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
                combosLoading ? (
                    // Avoid a flash of "go search manually" the instant before
                    // the real combinations (fetched in parallel, see
                    // useConsultIntelligence.ts §4b) land — this molecule may
                    // turn out to have a direct offer a moment later.
                    <div className="cs-nobrand">Checking for combination products…</div>
                ) : (
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
                )
            ) : open && (alts.length > 0 || rest > 0 || comboAlts.length > 0) ? (
                /* The alternates only exist on the OPEN row. As a permanent
                   second line under every medicine they were the single
                   biggest source of clutter in this column: four brand chips
                   and a "1,782 more" on a row the doctor had not yet decided
                   to act on.

                   Animated open, 2026-08-15: this used to just appear the
                   instant the row was clicked, which read as the row
                   flinching rather than opening. Height + a slight rise, so
                   the chips arrive FROM the row that produced them. */
                <motion.div
                    className="cs-brands"
                    initial={reduceMotion ? false : { opacity: 0, height: 0, y: -4 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    transition={{ type: "spring", stiffness: 460, damping: 34 }}
                    style={{ overflow: "hidden" }}
                >
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
                    {/* Combinations — never hidden behind the "N more" count
                        above, which only ever counted single-molecule brands.
                        `fetchCombinationProducts` already caps this list, so
                        there is no overflow control to build here. Every
                        molecule the product carries is stated on the chip
                        itself, per the same rule MedicineAddSheet follows:
                        taking a combination means prescribing a molecule the
                        doctor did not search for, and that is never a reason
                        to hide it. */}
                    {comboAlts.map((c) => {
                        const cv = comboVerdictOf(c.id);
                        const cHard = cv?.status === "warn_hard";
                        const cWarn = cv?.status === "warn";
                        const extra = c.compositionLabels.filter(
                            (label) => label.toLowerCase() !== intent.label.toLowerCase()
                        );
                        return (
                            <button
                                key={c.id}
                                type="button"
                                className={`cs-brand is-combo${cHard ? " is-hard" : cWarn ? " is-warn" : ""}`}
                                onClick={() => onAccept(intent, c, true)}
                                title={`Contains ${c.compositionLabels.join(" + ")}`}
                            >
                                {cHard && <ShieldAlert size={11} />}
                                {c.name}
                                {extra.length > 0 && (
                                    <span className="cs-brand-extra">+ {extra.join(", ")}</span>
                                )}
                            </button>
                        );
                    })}
                </motion.div>
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

            {(isWarn || isHard) && verdict.reasons.length > 0 && (
                <div className="cs-rec-guard">
                    <GuardReason
                        hard={isHard}
                        reasons={verdict.reasons}
                        acknowledged={acknowledged}
                        onAcknowledge={onAcknowledge}
                    />
                </div>
            )}
        </div>
    );
}
