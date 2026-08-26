// ---------------------------------------------------------------------------
// The small shared vocabulary of the consultation screen.
//
// Everything here exists because it appears on more than one surface and must
// look and mean the same thing on all of them. A convention repeated four times
// is a convention that drifts.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Heart, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { IntentType } from "../../lib/synapse/engine";
import type { PersonalizedIntent } from "../../lib/synapse/personalize";
import type { CompanionScope, CompanionSuggestion } from "../../lib/synapse/companions";

// ============================================================
// THE CAPPED/RANKED LIST — one row height, everywhere it caps
// ============================================================

/**
 * One collapsed row for a capped ranked list (`ConditionsCard`'s ranked
 * conditions, `SuggestionsCard`'s ranked suggestions wherever `capped` is
 * passed). ConditionsCard measured this live 2026-08-13 at 52.9px, rounded
 * to 53. SuggestionsCard used to keep its OWN separate guess (58, then 79)
 * — which is exactly why the two panels' capped box and expanded "Show
 * more" box ended up different heights side by side (Anmol, 2026-08-25:
 * "when clicking show more, the final height of both panels are
 * different"). One constant now: both cards animate `maxHeight` off the
 * SAME number, so `capped * ROW_H` and `4.5 * ROW_H` land on the same pixel
 * for both, not two numbers that happen to start out close.
 */
export const RANKED_ROW_H = 53;

// ============================================================
// THE THINKING RING — Synapse recomputing, said in motion
// ============================================================

/**
 * REMOVED 2026-08-24 — Anmol: every accept/chip-toggle re-runs the engine
 * (doctrine §4: `useConsultIntelligence` runs synchronously on every chart
 * change), which fired this ripple on Possible Conditions, Medicine
 * Recommendations, Suggestions and Exercise Plan simultaneously — in
 * practice a wash across the whole output strip on nearly every keystroke,
 * reported as a "weird blue screen animation" that showed up "whenever a
 * new thing is added in Synapse, selecting any chip." Rather than pull the
 * `<ThinkingRing pulseKey={thinkingKey} />` call out of all four cards (a
 * bigger, riskier diff for the same net effect), this stays the one place
 * that decides whether it renders — it renders nothing, always. Kept as a
 * no-op rather than deleted so those four call sites don't need touching,
 * and `.cs-thinking-ring`/`.cs-glyph-live` in consult.css are dead CSS now,
 * same status as the rest of that file's already-dead classes.
 */
export function ThinkingRing(_props: { pulseKey: string }) {
    return null;
}

// ============================================================
// MEDICINE IDENTITY — two lines, everywhere, always
// ============================================================

/**
 * Brand over composition, as one unit.
 *
 * Doctors think and prescribe in brand names; composition is supporting
 * context, shown for verification, never promoted to the label. This is a
 * component rather than a convention because "everywhere a medicine is
 * rendered" is five surfaces — recommendations, search, the frequent list, the
 * Plan and the print.
 *
 * `brand` may be absent: the engine ranks molecules, and some have no
 * standalone product. In that case the composition IS the identity and it is
 * rendered as the primary line rather than printed twice.
 */
export function MedicineIdentity({
    brand, composition, trailing,
}: {
    brand: string | null;
    composition: string;
    /** pins, clinic markers — anything belonging on the brand line */
    trailing?: React.ReactNode;
}) {
    const hasBrand =
        !!brand && brand.trim().toLowerCase() !== composition.trim().toLowerCase();

    return (
        <span className="cs-ident">
            <span className="cs-ident-brand">
                <span className={hasBrand ? undefined : "cs-cap"}>
                    {hasBrand ? brand : composition}
                </span>
                {trailing}
            </span>
            {hasBrand && <span className="cs-ident-comp">{composition}</span>}
        </span>
    );
}

// ============================================================
// RANK — a proportional bar, never a figure
// ============================================================

/**
 * How long the bar is, in [0, 1], relative to the strongest option OF THE SAME
 * TYPE in this consultation.
 *
 * Same-type is the only comparison that means anything. Findings score around
 * 3 and medicines around 0.5 in the same run, so a bar normalised across all
 * types would draw every medicine as a stub and say nothing about which
 * medicine to reach for — the entire question the doctor is asking.
 *
 * The floor is deliberate: a suggestion the engine chose to show is never
 * drawn as empty. Zero length reads as "this is nothing", and the engine is not
 * saying that about anything it put on the screen.
 */
export const RANK_FLOOR = 0.16;

export function rankFillOf(intent: PersonalizedIntent, topOfType: number): number {
    if (!(topOfType > 0)) return 1;
    return Math.max(RANK_FLOOR, Math.min(1, intent.finalScore / topOfType));
}

export function topScoreByType(intents: PersonalizedIntent[]): Map<IntentType, number> {
    const top = new Map<IntentType, number>();
    for (const i of intents) {
        top.set(i.type, Math.max(top.get(i.type) ?? 0, i.finalScore));
    }
    return top;
}

/**
 * `aria-label` carries the ORDINAL — "2nd in this list" — because a screen
 * reader cannot see a length, and the normalised figure is exactly what this
 * component exists to withhold. Position is honest; a score is not.
 */
export function RankBar({ fill, rank, hard = false }: {
    fill: number;
    rank: number;
    hard?: boolean;
}) {
    return (
        <span
            className={`cs-bar${hard ? " is-hard" : ""}`}
            role="img"
            aria-label={`Rank ${rank}`}
        >
            <span className="cs-bar-fill" style={{ width: `${Math.round(fill * 100)}%` }} />
        </span>
    );
}

// ============================================================
// RELEVANCE — the same proportion, said in words
// ============================================================

export type Relevance = "high" | "medium" | "low";

export function relevanceOf(fill: number): Relevance {
    if (fill >= 0.7) return "high";
    if (fill >= 0.35) return "medium";
    return "low";
}

export const RELEVANCE_TEXT: Record<Relevance, string> = {
    high: "High relevance",
    medium: "Medium relevance",
    low: "Low relevance",
};

// ============================================================
// PIN — the doctor's own shortcut, not a signal
// ============================================================

/**
 * The heart is a toggle the DOCTOR sets. Pinning lifts that medicine to the top
 * of the recommendations every time it is ranked again.
 *
 * It is deliberately kept off the ranking: pinning reorders what the doctor
 * sees, it does not change what the engine scored. The rank bar beside it still
 * shows the engine's real reading, so a pinned item that the engine ranks
 * poorly still says so — the doctor's shortcut never disguises the evidence.
 */
export function PinButton({ pinned, label, onToggle }: {
    pinned: boolean;
    label: string;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            className={`cs-pin${pinned ? " is-on" : ""}`}
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${label}` : `Pin ${label} to the top`}
            title={pinned
                ? "Pinned — shows at the top whenever it is suggested. Click to unpin."
                : "Pin to the top of recommendations"}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
            <Heart size={15} />
        </button>
    );
}

// ============================================================
// A GUARD, SAID OUT LOUD — on the row it belongs to
// ============================================================

/**
 * Never a floating banner. A guarded item stays visible at its real rank, in
 * red, with its reason attached, and the accept action and brand picker are
 * withheld until the doctor acknowledges it. Acknowledgement is
 * per-consultation and reversible. Nothing is ever hidden outright.
 *
 * Self-animates its own arrival: every caller already mounts this
 * conditionally (`{isWarn && <GuardReason .../>}`), so a `motion` root here
 * gives every one of those call sites a smooth reveal for free — a warning
 * that snaps into existence reads as the page jumping, not as a message
 * arriving. Height, not just opacity, because a badge shifting straight
 * from nothing to full height above content that is about to move is what
 * makes a guard feel like it shoved the row.
 *
 * ── Collapsed by default — §2, 2026-08-24 ──────────────────────────────────
 * A row can carry more than one reason at once (a malaria antimalarial
 * guarded on BOTH "rigors" and "recurrent fever" firing together, checked
 * live — two ~190-character WHO-guidance paragraphs), and every one of them
 * used to render in full underneath the medicine's name. On a compact row
 * that is not "a warning with a drug name near it" any more, it is a wall
 * of red text with a drug name lost above it — reported as "the guard
 * instructions... taking too much space that the actual medicine name is
 * invisible." The full text is never hidden (rule 8 — no guard may hide
 * anything) — it is one click away behind "Show N more" — but the DEFAULT
 * is now the first reason, clamped to two lines, which is enough to know
 * this needs reading without it outweighing the row it is attached to.
 */
export function GuardReason({
    hard, reasons, acknowledged, onAcknowledge,
}: {
    hard: boolean;
    reasons: string[];
    acknowledged: boolean;
    onAcknowledge: (v: boolean) => void;
}) {
    const reduce = useReducedMotion();
    const [expanded, setExpanded] = useState(false);
    const extra = reasons.length - 1;

    return (
        <motion.div
            className={`cs-reason ${hard ? "is-hard" : "is-warn"}`}
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            style={{ overflow: "hidden" }}
        >
            {hard && <strong>Contraindicated — read before prescribing</strong>}
            {reasons.length > 0 && (
                <p className={expanded ? undefined : "cs-reason-clamp"}>{reasons[0]}</p>
            )}
            {expanded && reasons.slice(1).map((r, i) => <p key={i}>{r}</p>)}
            {extra > 0 && (
                <button
                    type="button"
                    className="cs-reason-more"
                    onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                >
                    {expanded ? "Show less" : `Show ${extra} more reason${extra === 1 ? "" : "s"}`}
                </button>
            )}
            {hard && (
                <button
                    type="button"
                    className={`cs-ack${acknowledged ? " is-on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); onAcknowledge(!acknowledged); }}
                >
                    {acknowledged
                        ? "Read — prescribing allowed (undo)"
                        : "I've read this — allow prescribing"}
                </button>
            )}
        </motion.div>
    );
}

// ============================================================
// COMPANION — the suggestion that attaches to a medicine
// ============================================================
//
// Some medicines travel with others: an NSAID prompts a PPI for gastric cover,
// an antibiotic a probiotic. That belongs in exactly one place — a small,
// indented, dismissible line directly beneath the medicine that triggered it,
// inside the Consultation Plan. Never a separate section, never a modal, never
// blocking.
//
// It appears only AFTER the trigger is on the plan. Before that there is
// nothing to pair with, and a PPI offered beside an NSAID the doctor has not
// taken is just a second medicine competing for the same glance.
//
// ── WHAT IS NOT WIRED, AND WHY (flagged, not invented) ────────────────────
// `intent_companions` carries a `scope` column with 'authored' and 'learned',
// but the table has no doctor_id — every row is global, and all 26 live rows
// are 'authored'. So a doctor-specific "Your pattern" tag has no source yet:
// `sourceOf` maps 'learned' to the honest global wording rather than claiming a
// habit the database cannot attribute to anyone. The habit branch below is
// complete and lights up the moment a doctor_id (or a v_doctor_companion view)
// exists.
//
// A third scope, 'practice', IS wired (2026-08-26) — a hospital-scoped edge
// authored from Practice's Clinical Companions card
// (`hospital_companion_preference`, source='practice_authored'), unioned
// into the edge list this consult resolves against (see `useSynapse.ts`).
// It gets its own tag rather than folding into 'authored' so a doctor can
// tell "every Cortex clinic sees this" from "this clinic's own standing
// pairing" at a glance.

export type CompanionSource = "authored" | "habit" | "observed" | "practice";

const SOURCE_TAG: Record<CompanionSource, string> = {
    authored: "Common pairing",
    habit: "Your pattern",
    observed: "Often co-prescribed",
    practice: "Your practice",
};

const SOURCE_TITLE: Record<CompanionSource, string> = {
    authored: "A clinically authored pairing — the same for every doctor",
    habit: "Learned from your own prescribing — not clinical advice",
    observed: "Seen together across prescriptions — not specific to you",
    practice: "Configured for this practice, from the Practice page",
};

export function sourceOf(scopes: CompanionScope[]): CompanionSource {
    if (scopes.includes("practice")) return "practice";
    if (scopes.includes("authored")) return "authored";
    return "observed";
}

export function CompanionLine({
    suggestion, onAdd, onDismiss,
}: {
    suggestion: CompanionSuggestion;
    onAdd: () => void;
    onDismiss: () => void;
}) {
    const source = sourceOf(suggestion.scopes);
    const reason = suggestion.reasons[0];
    const guarded = suggestion.status !== "ok";

    return (
        <div className={`cs-comp${guarded ? " is-guarded" : ""}`}>
            <span className="cs-comp-mark" aria-hidden="true"><Sparkles size={11} /></span>

            <div className="cs-comp-body">
                <div className="cs-comp-line">
                    <button
                        type="button"
                        className="cs-comp-add"
                        onClick={onAdd}
                        title={`Add ${suggestion.label} to the plan`}
                    >
                        Add {suggestion.label}
                    </button>
                    <span className={`cs-comp-tag is-${source}`} title={SOURCE_TITLE[source]}>
                        {SOURCE_TAG[source]}
                    </span>
                </div>
                {reason && <div className="cs-comp-why">{reason}</div>}
                {guarded && suggestion.guardReasons[0] && (
                    <div className="cs-comp-guard">{suggestion.guardReasons[0]}</div>
                )}
            </div>

            <button
                type="button"
                className="cs-comp-x"
                onClick={onDismiss}
                aria-label={`Dismiss the ${suggestion.label} suggestion`}
                title="Dismiss — this will not come back this consultation"
            >
                <X size={11} />
            </button>
        </div>
    );
}
