// ---------------------------------------------------------------------------
// THE RANK CASCADE — the engine's order, revealed in the order it reasons.
//
// Synapse ranks in stages: signals feed findings, findings feed the
// assessment, the assessment feeds investigations and medicines. All of that
// already happens — `useConsultIntelligence` runs the whole engine
// synchronously on every chart change — but every panel repainted in the same
// frame, so a real sequence of reasoning arrived on screen as one flat pop.
// Anmol, 2026-09-14: "you click something and randomly everything just
// populates... it doesn't give you a feel that it is populated by something
// intelligent."
//
// So this stages the REVEAL of results that already exist. It never delays
// availability: the ranking is correct and final the instant the engine
// returns, every row is clickable while it is still arriving, and nothing
// here is allowed to gate an accept. Presentation only.
//
// ── WHY THIS IS NOT ThinkingRing ───────────────────────────────────────────
// The 2026-08-24 removal (see `ThinkingRing` in parts.tsx) is the cautionary
// tale this is built against: a radial pulse, screen-level, fired from the
// centre outward on EVERY chip toggle across all four cards at once — "a
// weird blue screen animation", cartoonish, removed rather than tuned. Four
// things make this structurally unable to become that:
//
//   1. Per-row, inside one card's own list — there is no shared surface for
//      it to wash across.
//   2. Top-down, following reading order, never radial from a centre.
//   3. It fires only where the ranked ORDER OR MEMBERSHIP actually changed
//      (`rankOrderKey`), not on every render or every keystroke.
//   4. Bursts coalesce (REPLAY_GUARD_MS) — four chips tapped in two seconds
//      is one cascade, not four.
//
// ── THE TIMING, AND WHY THESE NUMBERS ──────────────────────────────────────
// Two things land less than ~30ms apart read as simultaneous; more than
// ~250ms apart read as two separate events, which is where "sequential"
// turns into "waiting". Everything here lives inside that band: rows at the
// bottom of it, cards near the middle, so the two rhythms stay tellable
// apart — you can SEE that a card is a bigger unit than a row.
//
// Cards overlap rather than queue: card N starts at N * CARD_STEP_MS whether
// or not card N-1 has finished. Serialising them instead would cost
// 5 * ~450ms and feel broken. Interleaved, the last row of the last card
// lands under ~900ms, with two or three cards in motion at any instant —
// which is what reads as a system working in parallel rather than a list
// loading.
//
// And the head is always instant: stage 0 starts at 0ms. Perceived lag is set
// almost entirely by how long nothing moves after the click, so the cascade
// buys its time at the tail and never at the head.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

export const CASCADE = {
    /** row → row inside one card. Bottom of the "sequential but connected" band. */
    ROW_STEP_MS: 45,
    /** card → card down the order. ~3x the row step, so the two rhythms differ. */
    CARD_STEP_MS: 130,
    /**
     * Deliberately CONSTANT, not growing. A gap that widens further down the
     * order decelerates, and deceleration reads as fatigue rather than
     * deliberation — and it penalises Medicines most, which is usually the
     * panel the doctor is actually waiting for.
     */
    /** the whole cascade, head to tail, must stay under this */
    BUDGET_MS: 900,
    /**
     * A replay may not start until the last one has had time to finish, so a
     * doctor tapping four chips in two seconds gets one settle rather than
     * four restarts. Trailing, not leading: the newest order always cascades
     * eventually, it just waits its turn.
     */
    REPLAY_GUARD_MS: 420,
} as const;

/**
 * Which step of the reasoning a panel is, which is its lead delay in
 * CARD_STEP_MS units. Clinical order, top to bottom: what you found, what
 * you would check, what you would give, everything else.
 *
 * These are ORDINALS, not identities — two panels that sit side by side at
 * the same step of the reasoning share one (Investigations and Assessment do
 * not, deliberately: they are siblings on screen but sequential in thought).
 */
export const CASCADE_STAGE = {
    /** Assessment — ranked findings/conditions. Starts at 0: the head is instant. */
    assessment: 0,
    /** Investigations — what would confirm or rule out the above. */
    investigations: 1,
    /** The plan's primary column — medicines, or exercises on a physio chart. */
    plan: 2,
    /** The trailing panel — referrals, advice, whatever the plan row did not take. */
    rest: 3,
} as const;

export type CascadeStage = (typeof CASCADE_STAGE)[keyof typeof CASCADE_STAGE];

/**
 * The identity of a ranked list's ORDER — the one thing worth re-animating
 * for.
 *
 * Scores are deliberately not in it. The engine re-scores everything on every
 * chart change, and a fourth-decimal move that leaves the order untouched has
 * nothing to show a doctor; replaying a cascade for it would be exactly the
 * "fires on every keystroke" failure that killed ThinkingRing. The rank bars
 * still retune themselves continuously — `.cs-bar-fill` transitions its width
 * — so a score change is never invisible, it just is not an event.
 */
export function rankOrderKey(ids: Iterable<{ intentId: number }>): string {
    const out: number[] = [];
    for (const i of ids) out.push(i.intentId);
    return out.join(",");
}

/** What a cascading container spreads onto itself. See `useRankCascade`. */
export interface CascadeBinding {
    /** flips a↔b to restart the CSS animation — see the hook's note */
    "data-cascade": "a" | "b";
    style: CSSProperties;
}

/**
 * Bind one ranked list to the cascade.
 *
 * The animation itself is CSS (`cs-row-in` in consult.css) for one reason
 * that matters: a CSS animation runs once when an element is painted, so a
 * genuinely NEW row animates on arrival for free, with no JS involved and no
 * cost on any of the renders in between. What CSS cannot do on its own is
 * replay for rows that already exist — which is the whole point when a new
 * symptom REORDERS a list the doctor is already looking at.
 *
 * So that is all this hook does: it flips `data-cascade` between "a" and "b",
 * and those two values select two byte-identical keyframes. Changing
 * `animation-name` is the one thing that restarts a running CSS animation
 * without remounting the element — and remounting is not available here: the
 * rows carry focus, the roving-list cursor and open brand pickers, and
 * throwing them away to get an animation would be trading real state for a
 * flourish.
 */
export function useRankCascade(stage: CascadeStage, orderKey: string): CascadeBinding {
    const seen = useRef<string | null>(null);
    const lastRunAt = useRef(0);
    const [phase, setPhase] = useState<"a" | "b">("a");

    useEffect(() => {
        if (seen.current === orderKey) return;
        seen.current = orderKey;

        // Nothing ranked. There is no cascade to run, and — the reason this
        // returns rather than just doing nothing visible — letting an empty
        // list spend the replay guard would make the FIRST real cascade, the
        // one right after the doctor's first chip, arrive late.
        if (!orderKey) return;

        const flip = () => {
            lastRunAt.current = Date.now();
            setPhase((p) => (p === "a" ? "b" : "a"));
        };

        const since = Date.now() - lastRunAt.current;
        if (since >= CASCADE.REPLAY_GUARD_MS) {
            flip();
            return;
        }
        const timer = window.setTimeout(flip, CASCADE.REPLAY_GUARD_MS - since);
        return () => window.clearTimeout(timer);
    }, [orderKey]);

    return {
        "data-cascade": phase,
        style: {
            "--cs-cascade-lead": `${stage * CASCADE.CARD_STEP_MS}ms`,
        } as CSSProperties,
    };
}
