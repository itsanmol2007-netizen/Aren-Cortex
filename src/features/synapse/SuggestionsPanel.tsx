// ---------------------------------------------------------------------------
// SYNAPSE — the engine's voice, as one continuous column.
//
// Spec: docs/aren-cortex-workspace-design.md §5.
//
// This used to be four tabs. Tabs were the wrong shape for a consultation:
// a doctor reading "Community acquired pneumonia" needs to see, in the same
// glance, what confirms it and what treats it. Putting those behind a click
// each meant the tests tab was effectively invisible — orders got missed
// because nobody opened it. So every intent type now has its own permanent
// section, in clinical reading order: what could this be → what confirms it →
// who else should see it → what to give.
//
// Two rules from the Synapse handoff are enforced HERE and nowhere else, so
// read §14 before touching them:
//
//  * Nothing is ever hidden. A guard attaches a reason and, when hard,
//    withholds the ACTION until the doctor acknowledges it — never the
//    suggestion itself. A shorter list the doctor cannot see is a decision the
//    system took on their behalf.
//
//  * No score is printed. Rank order and the movement chip carry the same
//    information honestly; "0.84" next to a medicine reads as a confidence
//    percentage to a human being and it is nothing of the kind.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle, Check, ChevronDown, Pin, Plus, Search, ShieldAlert, Sparkles,
    TrendingUp,
} from "lucide-react";
import type { IntentType } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import type { Medicine } from "../../lib/synapse/brands";
import { brandKey } from "../../lib/synapse/brands";
import { searchIntents, type IntentSearchHit } from "../../lib/db/synapse";
import type { ConsultIntelligence } from "../../hooks/useConsultIntelligence";
import type { SynapseData } from "../../hooks/useSynapse";
import { BrandSheet } from "./BrandSheet";

export interface AcceptPayload {
    intentId: number;
    type: IntentType;
    label: string;
    refTable: string | null;
    refId: number | null;
    /** the brand chosen for a medicine intent, when one exists */
    medicine: Medicine | null;
    /** true when the doctor reached this by searching, not from the ranked list */
    viaSearch: boolean;
    /** true when this was hard-warned and the doctor acknowledged it */
    overridden: boolean;
    /**
     * True only when the doctor picked a brand that was NOT the default.
     * Accepting the default must not teach the brand model — that would make
     * the model reinforce its own output (handoff §12).
     */
    brandDeliberate?: boolean;
}

/** Sections below Impression, in the order a consultation is read. */
const SECTIONS: { type: IntentType; label: string }[] = [
    { type: "test", label: "Investigations" },
    { type: "referral", label: "Referrals" },
    { type: "medicine", label: "Medicines" },
    { type: "exercise", label: "Exercises" },
    { type: "advice", label: "Advice" },
];

/** Alternatives shown beside the default before the sheet takes over. */
const INLINE_ALTS = 3;

/**
 * How many suggestions a section shows before it asks.
 *
 * The ranking exists precisely so the head of each list is the part worth
 * reading; printing all nine medicines turns a decision into a scroll. Anything
 * already accepted is always shown regardless of the cap — what the doctor took
 * must never disappear behind a "show more".
 */
const SECTION_CAP: Partial<Record<IntentType, number>> = {
    test: 4,
    referral: 3,
    medicine: 4,
    exercise: 3,
    advice: 3,
};

interface Props {
    intelligence: ConsultIntelligence;
    data: SynapseData | null;
    acceptedIntentIds: Set<number>;
    chosenBrands: Map<number, number>;
    /** hard warnings this doctor has read — lifted to App so save can gate on it */
    acknowledged: Set<number>;
    onAcknowledge: (intentId: number, ack: boolean) => void;
    onAccept: (payload: AcceptPayload) => void;
    onChangeBrand: (intentId: number, medicine: Medicine) => void;
    onPinClinicBrand: (medicine: Medicine, pinned: boolean) => void;
    hasChart: boolean;
    searchRef?: React.RefObject<HTMLInputElement>;
}

export function SuggestionsPanel({
    intelligence, data, acceptedIntentIds, chosenBrands, acknowledged,
    onAcknowledge, onAccept, onChangeBrand, onPinClinicBrand, hasChart, searchRef,
}: Props) {
    const { byType, intents, brands, brandsLoading, brandError, signals, companions } = intelligence;

    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<IntentSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [showSignals, setShowSignals] = useState(false);
    const [expanded, setExpanded] = useState<Set<IntentType>>(new Set());
    const [sheet, setSheet] = useState<
        { intentId: number; compositionId: number; label: string; rect: DOMRect } | null
    >(null);

    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (searchRef ?? internalRef) as React.RefObject<HTMLInputElement>;
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ---- search: by molecule, by brand, or by what it treats ----
    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        const q = query.trim();
        if (q.length < 2) { setHits([]); setSearching(false); return; }

        setSearching(true);
        debounce.current = setTimeout(() => {
            searchIntents({ query: q, limit: 20 })
                .then(setHits)
                .catch((e) => { console.warn("search failed:", e); setHits([]); })
                .finally(() => setSearching(false));
        }, 220);

        return () => { if (debounce.current) clearTimeout(debounce.current); };
    }, [query]);

    const isSearching = query.trim().length >= 2;

    const unreadHard = useMemo(
        () => intelligence.hardWarned.filter((i) => !acknowledged.has(i.intentId)),
        [intelligence.hardWarned, acknowledged]
    );

    const signalLabels = data?.signalLabels;
    const whyOf = (intent: PersonalizedIntent) =>
        intent.contributors
            .slice(0, 2)
            .map((c) => signalLabels?.get(c.signalId) ?? c.signalId)
            .join(" · ");

    const brandsFor = (intent: PersonalizedIntent) => {
        if (intent.type !== "medicine" || intent.refTable !== "compositions" || intent.refId == null) {
            return null;
        }
        return brands.get(intent.refId) ?? null;
    };

    const chosenFor = (intent: PersonalizedIntent, list: Medicine[]): Medicine | null => {
        const id = chosenBrands.get(intent.intentId);
        if (id != null) return list.find((m) => m.id === id) ?? null;
        return list[0] ?? null;
    };

    const accept = (
        intent: PersonalizedIntent,
        medicine: Medicine | null,
        brandDeliberate = false
    ) => {
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
            brandDeliberate,
        });
    };

    // ── the ranked body ─────────────────────────────────────────────────────
    const body = () => {
        if (isSearching) {
            return (
                <SearchResults
                    hits={hits}
                    searching={searching}
                    query={query}
                    acceptedIntentIds={acceptedIntentIds}
                    rankedIds={new Set(intents.map((i) => i.intentId))}
                    onAccept={(hit) =>
                        onAccept({
                            intentId: hit.intentId,
                            type: hit.type,
                            label: hit.label,
                            refTable: hit.refTable,
                            refId: hit.refId,
                            medicine: null,
                            viaSearch: true,
                            overridden: false,
                        })
                    }
                />
            );
        }

        if (!hasChart) {
            return <Frequent data={data} onAccept={onAccept} acceptedIntentIds={acceptedIntentIds} />;
        }

        return (
            <>
                <Impression
                    findings={byType.finding}
                    accepted={acceptedIntentIds}
                    whyOf={whyOf}
                    onUse={(intent) => accept(intent, null)}
                />

                {SECTIONS.map(({ type, label }) => {
                    const list = byType[type];
                    if (!list || list.length === 0) return null;

                    const cap = SECTION_CAP[type] ?? 4;
                    const isOpen = expanded.has(type);
                    // Below the cap, but never hiding something already taken.
                    const shown = isOpen
                        ? list
                        : [
                            ...list.slice(0, cap),
                            ...list.slice(cap).filter((i) => acceptedIntentIds.has(i.intentId)),
                        ];
                    const hidden = list.length - shown.length;

                    return (
                        <section key={type} className="cx-sec">
                            <h3 className="cx-sec-head">
                                {label}<span>{list.length}</span>
                            </h3>

                            {type === "medicine"
                                ? shown.map((intent) => {
                                    const cb = brandsFor(intent);
                                    return (
                                        <MedicineCard
                                            key={intent.intentId}
                                            intent={intent}
                                            why={whyOf(intent)}
                                            added={acceptedIntentIds.has(intent.intentId)}
                                            acknowledged={acknowledged.has(intent.intentId)}
                                            onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                                            brands={cb?.brands ?? []}
                                            singleTotal={cb?.singleTotal ?? 0}
                                            combinationTotal={cb?.combinationTotal ?? 0}
                                            brandsLoading={brandsLoading}
                                            chosen={chosenFor(intent, cb?.brands ?? [])}
                                            brandPreferences={data?.brandPreferences}
                                            onAccept={accept}
                                            onOpenSheet={(rect) =>
                                                intent.refId != null &&
                                                setSheet({
                                                    intentId: intent.intentId,
                                                    compositionId: intent.refId,
                                                    label: intent.label,
                                                    rect,
                                                })
                                            }
                                            onSearchProducts={() => {
                                                setQuery(intent.label);
                                                inputRef.current?.focus();
                                            }}
                                        />
                                    );
                                })
                                : shown.map((intent) => (
                                    <IntentRow
                                        key={intent.intentId}
                                        intent={intent}
                                        why={whyOf(intent)}
                                        added={acceptedIntentIds.has(intent.intentId)}
                                        acknowledged={acknowledged.has(intent.intentId)}
                                        onAcknowledge={(v) => onAcknowledge(intent.intentId, v)}
                                        onAccept={() => accept(intent, null)}
                                    />
                                ))}

                            {(hidden > 0 || isOpen) && (
                                <button
                                    type="button"
                                    className="cx-sec-more"
                                    onClick={() =>
                                        setExpanded((s) => {
                                            const next = new Set(s);
                                            if (next.has(type)) next.delete(type);
                                            else next.add(type);
                                            return next;
                                        })
                                    }
                                >
                                    {isOpen ? "Show fewer" : `${hidden} more ranked`}
                                </button>
                            )}
                        </section>
                    );
                })}

                {companions && companions.suggestions.length > 0 && (
                    <section className="cx-sec">
                        <h3 className="cx-sec-head">
                            Often goes with<span>{companions.suggestions.length}</span>
                        </h3>
                        <p className="cx-sec-note">
                            Pharmacological pairings, the same for every doctor — not your history.
                        </p>
                        {companions.suggestions
                            .filter((c) => !acceptedIntentIds.has(c.companionIntentId))
                            .slice(0, 4)
                            .map((c) => (
                                <div
                                    key={c.companionIntentId}
                                    className={`cx-int${c.status === "warn_hard" ? " is-hard" : ""}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                        onAccept({
                                            intentId: c.companionIntentId,
                                            type: c.type,
                                            label: c.label,
                                            refTable: null,
                                            refId: null,
                                            medicine: null,
                                            viaSearch: false,
                                            overridden: c.status === "warn_hard",
                                        })
                                    }
                                >
                                    <div className="cx-int-main">
                                        <div className="cx-int-name">
                                            <span className={c.type === "medicine" ? "cx-cap" : undefined}>
                                                {c.label}
                                            </span>
                                        </div>
                                        <div className="cx-why">{c.reasons.join(" · ")}</div>
                                    </div>
                                    <div className="cx-int-side">
                                        {c.status !== "ok" && (
                                            <span className={`cx-flag ${c.status === "warn_hard" ? "hard" : "warn"}`}>
                                                <AlertTriangle size={11} />
                                                {c.status === "warn_hard" ? "Check" : "Caution"}
                                            </span>
                                        )}
                                        <span className="cx-add"><Plus size={15} /></span>
                                    </div>
                                </div>
                            ))}
                    </section>
                )}
            </>
        );
    };

    return (
        <section className="cx-panel cx-syn" aria-label="Synapse">
            <div className="cx-syn-head">
                <div>
                    <h2 className="cx-syn-title">Synapse</h2>
                    <p className="cx-syn-sub">what it suggests</p>
                </div>
                <button
                    type="button"
                    className="cx-reading"
                    disabled={signals.length === 0}
                    onClick={() => setShowSignals((v) => !v)}
                >
                    {signals.length === 0
                        ? "Nothing read yet"
                        : `Reading ${signals.length} signal${signals.length === 1 ? "" : "s"}`}
                    {signals.length > 0 && (showSignals ? " ▾" : " ▸")}
                </button>
            </div>

            {showSignals && signals.length > 0 && (
                <div className="cx-signals">
                    {signals.map((s) => (
                        <span key={s.id} className="cx-signal" title={`strength ${s.strength.toFixed(2)}`}>
                            {s.label}
                        </span>
                    ))}
                </div>
            )}

            <div className="cx-syn-search">
                <Search size={15} />
                <input
                    ref={inputRef}
                    value={query}
                    placeholder="Search a medicine, a test, or what it's for…"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
                    aria-label="Search suggestions"
                />
                {query && (
                    <button
                        type="button"
                        className="cx-chart-clear"
                        onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                        aria-label="Clear search"
                    >×</button>
                )}
            </div>

            {/* The §14 ledger. Non-collapsible by design: it indexes what must be
                read, and a summary you can fold away is not a summary. */}
            {!isSearching && unreadHard.length > 0 && (
                <div className="cx-ledger">
                    <div className="cx-ledger-head">
                        <ShieldAlert size={14} />
                        {unreadHard.length} contraindication{unreadHard.length === 1 ? "" : "s"} to read
                        before prescribing
                    </div>
                    {unreadHard.map((i) => (
                        <div key={i.intentId} className="cx-ledger-row">
                            <span className="cx-cap">{i.label}</span>
                            <span>{i.guardReasons[0]}</span>
                        </div>
                    ))}
                </div>
            )}

            {brandError && !isSearching && (
                <p className="cx-syn-note">
                    Brands could not be loaded, so molecules are shown without them. The
                    ranking below is unaffected.
                </p>
            )}

            <div className="cx-syn-scroll">{body()}</div>

            {sheet && brands.get(sheet.compositionId) && (
                <BrandSheet
                    anchor={sheet.rect}
                    composition={brands.get(sheet.compositionId)!}
                    compositionLabel={sheet.label}
                    currentMedicineId={chosenBrands.get(sheet.intentId) ?? null}
                    brandPreferences={data?.brandPreferences ?? new Map()}
                    clinicDefaults={data?.clinicBrandDefaults ?? new Map()}
                    onChoose={(m) => onChangeBrand(sheet.intentId, m)}
                    onPinClinic={onPinClinicBrand}
                    onClose={() => setSheet(null)}
                />
            )}
        </section>
    );
}

// ============================================================
// IMPRESSION — the engine's reading of the chart
// ============================================================

function Impression({
    findings, accepted, whyOf, onUse,
}: {
    findings: PersonalizedIntent[];
    accepted: Set<number>;
    whyOf: (i: PersonalizedIntent) => string;
    onUse: (i: PersonalizedIntent) => void;
}) {
    // Which one is being READ. Purely presentational — the engine's order is
    // never touched (rule 4); this only decides whose [Use as Dx] is reachable.
    const [focus, setFocus] = useState(0);
    const top = findings.slice(0, 3);

    useEffect(() => { setFocus(0); }, [findings]);

    if (top.length === 0) return null;

    const primary = top[Math.min(focus, top.length - 1)];
    const others = top.filter((_, i) => i !== Math.min(focus, top.length - 1));
    const taken = accepted.has(primary.intentId);

    return (
        <section className="cx-sec cx-impression">
            <h3 className="cx-sec-head">Impression</h3>

            <div className="cx-imp-primary">
                <div className="cx-imp-main">
                    <div className="cx-imp-name">{primary.label}</div>
                    {whyOf(primary) && (
                        <div className="cx-why"><em>for</em> {whyOf(primary)}</div>
                    )}
                </div>
                {taken ? (
                    <span className="cx-imp-taken"><Check size={13} /> Diagnosis</span>
                ) : (
                    <button type="button" className="cx-imp-use" onClick={() => onUse(primary)}>
                        Use as Dx
                    </button>
                )}
            </div>

            {others.length > 0 && (
                <div className="cx-imp-alts">
                    <span>also considering</span>
                    {others.map((o) => (
                        <button
                            key={o.intentId}
                            type="button"
                            className="cx-imp-alt"
                            onClick={() => setFocus(top.indexOf(o))}
                            title="Read this one"
                        >
                            {o.label}
                            {accepted.has(o.intentId) && <Check size={11} />}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

// ============================================================
// ONE INTENT — tests, referrals, exercises, advice
// ============================================================

function IntentRow({
    intent, why, added, acknowledged, onAcknowledge, onAccept,
}: {
    intent: PersonalizedIntent;
    why: string;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    onAccept: () => void;
}) {
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    return (
        <div
            className={`cx-int${added ? " is-added" : ""}${isHard ? " is-hard" : ""}`}
            role="button"
            tabIndex={0}
            title={`rank ${intent.clinicalRank}`}
            onClick={() => !added && !locked && onAccept()}
            onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !added && !locked) {
                    e.preventDefault();
                    onAccept();
                }
            }}
        >
            <div className="cx-int-main">
                <div className="cx-int-name">
                    <span>{intent.label}</span>
                    {intent.isSafetyCritical && (
                        <span className="cx-flag safety"><ShieldAlert size={11} /> Safety</span>
                    )}
                </div>
                {why && <div className="cx-why"><em>for</em> {why}</div>}
            </div>

            <div className="cx-int-side">
                {intent.movement > 0 && (
                    <span className="cx-move" title="Promoted by your prescribing history">
                        <TrendingUp size={12} />{intent.movement}
                    </span>
                )}
                {isWarn && <span className="cx-flag warn"><AlertTriangle size={11} /> Caution</span>}
                {isHard && <span className="cx-flag hard"><ShieldAlert size={11} /> Check</span>}
                {added ? (
                    <span className="cx-added" aria-label="Added"><Check size={15} /></span>
                ) : locked ? null : (
                    <button
                        type="button"
                        className="cx-add"
                        aria-label={`Add ${intent.label}`}
                        onClick={(e) => { e.stopPropagation(); onAccept(); }}
                    ><Plus size={15} /></button>
                )}
            </div>

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <GuardReason
                    hard={isHard}
                    reasons={intent.guardReasons}
                    acknowledged={acknowledged}
                    onAcknowledge={onAcknowledge}
                />
            )}
        </div>
    );
}

// ============================================================
// ONE MEDICINE — the brands ARE the interface
// ============================================================

function MedicineCard({
    intent, why, added, acknowledged, onAcknowledge, brands, singleTotal,
    combinationTotal, brandsLoading, chosen, brandPreferences, onAccept,
    onOpenSheet, onSearchProducts,
}: {
    intent: PersonalizedIntent;
    why: string;
    added: boolean;
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
    brands: Medicine[];
    singleTotal: number;
    combinationTotal: number;
    brandsLoading: boolean;
    chosen: Medicine | null;
    brandPreferences?: Map<string, { preference: number }>;
    onAccept: (i: PersonalizedIntent, m: Medicine | null, deliberate?: boolean) => void;
    onOpenSheet: (rect: DOMRect) => void;
    onSearchProducts: () => void;
}) {
    const cardRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLButtonElement>(null);
    const isHard = intent.status === "warn_hard";
    const isWarn = intent.status === "warn";
    const locked = isHard && !acknowledged;

    // A doctor prescribes a PRODUCT. The engine ranks a molecule, so the
    // molecule is what arrives here — but it is not what should be read first.
    // The default brand is the headline; the composition drops to the subtitle
    // where it belongs, next to the reason this was suggested at all.
    const primary = brands[0] ?? null;
    const alts = brands.slice(1, 1 + INLINE_ALTS);
    const rest = Math.max(0, singleTotal - 1 - alts.length);

    const isYours = (m: Medicine) => {
        const p = brandPreferences?.get(brandKey(m.compositionId, m.id, m.form));
        return !!p && p.preference > 0.15;
    };

    const onCardKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (locked || added) return;
        if (e.key === "Enter" && primary) {
            e.preventDefault();
            onAccept(intent, primary, false);
            return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const chips = [...(cardRef.current?.querySelectorAll<HTMLElement>("[data-cx-brand]") ?? [])];
            const i = chips.indexOf(document.activeElement as HTMLElement);
            const next = chips[e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(chips.length - 1, i + 1)];
            if (next) { e.preventDefault(); next.focus(); }
        }
    };

    const headline = added
        ? (chosen?.name ?? intent.label)
        : primary?.name ?? intent.label;

    return (
        <div
            ref={cardRef}
            className={`cx-med${added ? " is-added" : ""}${isHard ? " is-hard" : ""}`}
            tabIndex={added || locked ? -1 : 0}
            onKeyDown={onCardKey}
            title={`rank ${intent.clinicalRank}`}
        >
            <div className="cx-med-head">
                <span className={`cx-med-name${primary || added ? "" : " cx-cap"}`}>
                    {headline}
                </span>
                <span className="cx-int-side">
                    {intent.movement > 0 && (
                        <span className="cx-move" title="Promoted by your prescribing history">
                            <TrendingUp size={12} />{intent.movement}
                        </span>
                    )}
                    {intent.isSafetyCritical && (
                        <span className="cx-flag safety"><ShieldAlert size={11} /> Safety</span>
                    )}
                    {isWarn && <span className="cx-flag warn"><AlertTriangle size={11} /> Caution</span>}
                    {isHard && <span className="cx-flag hard"><ShieldAlert size={11} /> Check</span>}
                    {added ? (
                        <span className="cx-added" aria-label="On the plan"><Check size={15} /></span>
                    ) : locked || !primary ? null : (
                        <button
                            type="button"
                            className="cx-add"
                            aria-label={`Prescribe ${headline}`}
                            onClick={() => onAccept(intent, primary, false)}
                        ><Plus size={15} /></button>
                    )}
                </span>
            </div>

            <div className="cx-med-sub">
                {primary && (
                    <>
                        <span className="cx-med-comp cx-cap">{intent.label}</span>
                        {primary.isClinicDefault && <Pin size={9} />}
                        {isYours(primary) && <span className="cx-brand-star" title="Your usual brand">★</span>}
                        {why && " · "}
                    </>
                )}
                {why && <><em>for</em> {why}</>}
                {added && rest + alts.length > 0 && (
                    <button
                        ref={moreRef}
                        type="button"
                        className="cx-med-swap"
                        onClick={() => {
                            const r = moreRef.current?.getBoundingClientRect();
                            if (r) onOpenSheet(r);
                        }}
                    >change brand</button>
                )}
            </div>

            {added ? null : brandsLoading ? (
                <div className="cx-brands">
                    <span className="cx-brand is-skeleton" />
                    <span className="cx-brand is-skeleton" />
                </div>
            ) : !primary ? (
                <div className="cx-med-nobrand">
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
                <div className="cx-brands">
                    <span className="cx-brands-or">or</span>
                    {alts.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            data-cx-brand=""
                            className="cx-brand"
                            disabled={locked}
                            onClick={() => onAccept(intent, m, true)}
                            title={`Prescribe ${m.name} instead`}
                        >
                            {m.isClinicDefault && <Pin size={9} />}
                            {isYours(m) && <span className="cx-brand-star">★</span>}
                            {m.name}
                        </button>
                    ))}
                    {rest > 0 && (
                        <button
                            ref={moreRef}
                            type="button"
                            className="cx-brand is-more"
                            disabled={locked}
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

            {(isWarn || isHard) && intent.guardReasons.length > 0 && (
                <GuardReason
                    hard={isHard}
                    reasons={intent.guardReasons}
                    acknowledged={acknowledged}
                    onAcknowledge={onAcknowledge}
                />
            )}
        </div>
    );
}

// ============================================================
// A GUARD, SAID OUT LOUD
// ============================================================

function GuardReason({
    hard, reasons, acknowledged, onAcknowledge,
}: {
    hard: boolean;
    reasons: string[];
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
}) {
    return (
        <div className={`cx-reason ${hard ? "hard" : "warn"}`}>
            {hard && <strong>Contraindicated — read before prescribing</strong>}
            {reasons.map((r, i) => <p key={i}>{r}</p>)}
            {hard && (
                <button
                    type="button"
                    className={`cx-ack${acknowledged ? " is-on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); onAcknowledge(!acknowledged); }}
                >
                    {acknowledged
                        ? "Read — prescribing allowed (undo)"
                        : "I've read this — allow prescribing"}
                </button>
            )}
        </div>
    );
}

// ============================================================
// SEARCH RESULTS
// ============================================================

function SearchResults({
    hits, searching, query, acceptedIntentIds, rankedIds, onAccept,
}: {
    hits: IntentSearchHit[];
    searching: boolean;
    query: string;
    acceptedIntentIds: Set<number>;
    rankedIds: Set<number>;
    onAccept: (hit: IntentSearchHit) => void;
}) {
    if (searching && hits.length === 0) return <Empty title="Searching…" sub="" />;
    if (hits.length === 0) {
        return (
            <Empty
                title={`Nothing matches “${query.trim()}”`}
                sub="Try a molecule, a brand name, or the symptom you are treating."
            />
        );
    }

    return (
        <section className="cx-sec">
            <h3 className="cx-sec-head">Search results<span>{hits.length}</span></h3>
            {hits.map((hit) => {
                const added = acceptedIntentIds.has(hit.intentId);
                return (
                    <div
                        key={hit.intentId}
                        className={`cx-int${added ? " is-added" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => !added && onAccept(hit)}
                        onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && !added) {
                                e.preventDefault();
                                onAccept(hit);
                            }
                        }}
                    >
                        <div className="cx-int-main">
                            <div className="cx-int-name">
                                <span className={hit.type === "medicine" ? "cx-cap" : undefined}>
                                    {hit.label}
                                </span>
                                {rankedIds.has(hit.intentId) && (
                                    <span className="cx-flag safety">
                                        <Sparkles size={11} /> Already ranked
                                    </span>
                                )}
                            </div>
                            <div className="cx-why">
                                {hit.matchKind === "symptom" && <><em>treats</em> {hit.viaLabel}</>}
                                {hit.matchKind === "brand" && <><em>sold as</em> {hit.viaLabel}</>}
                                {hit.matchKind === "label" && <em>{hit.type}</em>}
                            </div>
                        </div>
                        <div className="cx-int-side">
                            {added
                                ? <span className="cx-added"><Check size={15} /></span>
                                : <span className="cx-add"><Plus size={15} /></span>}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

// ============================================================
// IDLE — this doctor's own shortlist
// ============================================================

function Frequent({
    data, onAccept, acceptedIntentIds,
}: {
    data: SynapseData | null;
    onAccept: (p: AcceptPayload) => void;
    acceptedIntentIds: Set<number>;
}) {
    const frequent = data?.frequent ?? [];

    if (frequent.length === 0) {
        return (
            <Empty
                title="Nothing on the chart yet"
                sub="Add a symptom, a finding or a vital and suggestions appear here as you go."
            />
        );
    }

    return (
        <section className="cx-sec">
            <h3 className="cx-sec-head">Your frequent<span>{frequent.length}</span></h3>
            <p className="cx-sec-note">
                Your own history · not a suggestion. This list does not read the
                consultation.
            </p>
            {frequent.map((f) => {
                const added = acceptedIntentIds.has(f.intentId);
                return (
                    <div
                        key={f.intentId}
                        className={`cx-int${added ? " is-added" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                            if (added) return;
                            onAccept({
                                intentId: f.intentId,
                                type: "medicine",
                                label: f.composition,
                                refTable: "compositions",
                                refId: f.compositionId,
                                medicine:
                                    f.usualMedicineId != null && f.compositionId != null
                                        ? {
                                            id: f.usualMedicineId,
                                            compositionId: f.compositionId,
                                            name: f.usualBrand ?? f.composition,
                                            form: null,
                                            prescriptionCount: f.timesPrescribed,
                                            isClinicDefault: false,
                                        }
                                        : null,
                                // It did not come from a ranking, so it is not a
                                // ranked accept (handoff §10a).
                                viaSearch: true,
                                overridden: false,
                            });
                        }}
                    >
                        <div className="cx-int-main">
                            <div className="cx-int-name">
                                <span className="cx-cap">{f.usualBrand ?? f.composition}</span>
                            </div>
                            <div className="cx-why">
                                {f.usualBrand ? <span className="cx-cap">{f.composition}</span> : null}
                                {f.usualBrand ? " · " : ""}
                                prescribed {f.timesPrescribed}×
                            </div>
                        </div>
                        <div className="cx-int-side">
                            {added
                                ? <span className="cx-added"><Check size={15} /></span>
                                : <span className="cx-add"><Plus size={15} /></span>}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

function Empty({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="cx-empty">
            <span className="cx-empty-mark"><Sparkles size={15} /></span>
            <span className="cx-empty-title">{title}</span>
            {sub && <span className="cx-empty-sub">{sub}</span>}
        </div>
    );
}
