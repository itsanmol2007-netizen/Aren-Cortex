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

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

export const CASCADE = {
    /**
     * row -> row inside one card.
     *
     * Was 45ms. Anmol, 2026-09-14, watching it live: "it's so much fast that
     * it doesn't even feel like everything is loading... too much fast for a
     * human eye to register." 45ms is above the ~30ms simultaneity floor in
     * the abstract, but that floor is for two bare marks appearing in
     * isolation — a doctor reading dense three-line rows needs materially
     * longer per row to perceive them as arriving in sequence at all.
     */
    ROW_STEP_MS: 75,
    /**
     * card -> card down the order. Deliberately CONSTANT, not growing: a gap
     * that widens further down decelerates, and deceleration reads as fatigue
     * rather than deliberation.
     */
    CARD_STEP_MS: 240,
    /** a new row fading in. Long enough to be seen as an arrival, not a pop. */
    ENTER_MS: 340,
    /**
     * the blue decaying to nothing. Tail length is decay / step, so 620 / 75
     * is a tail of roughly eight rows — the comet, brightest at the newest.
     */
    TINT_MS: 620,
    /** nothing past this row waits any longer — see `delayOf`. */
    STAGGER_CAP: 8,
    /**
     * A replay may not start until the last one has had time to finish, so a
     * doctor tapping four chips in two seconds gets one settle rather than
     * four restarts. Trailing, not leading: the newest order always cascades
     * eventually, it just waits its turn.
     */
    REPLAY_GUARD_MS: 700,
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
 * The reorder slide — a row travelling from 4th to 1st rather than
 * teleporting there. Anmol, 2026-09-14: "instead of teleporting, it will
 * really feel like it is a re-ranking."
 *
 * Spring rather than a duration because the distance varies wildly: a row
 * moving one place and a row moving nine places should both feel like the
 * same gesture, and only a spring gives you that for free. Stiff and
 * heavily damped — this settles in ~300ms with no visible overshoot, which
 * a clinical list wants; a bouncier spring reads as playful on a screen
 * where the thing bouncing is a prescription.
 *
 * Paired with `layout="position"`, never plain `layout`: position-only
 * leaves the row's SIZE alone, so a row whose guard reason expands is not
 * scale-distorted mid-slide and its text never smears. It also keeps the
 * capped-list `RANKED_ROW_H` maths honest, since nothing here changes a
 * row's measured height.
 */
export const CASCADE_SLIDE = {
    type: "spring",
    stiffness: 520,
    damping: 44,
} as const;

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
    /** flips a↔b to restart the blue — see the hook's note */
    "data-cascade": "a" | "b";
}

export interface Cascade {
    binding: CascadeBinding;
    /**
     * How long row `index` waits before it arrives, in ms. Rows take this
     * from JS rather than from `nth-child` in CSS for a reason that is not
     * cosmetic: the fade has to be owned by Framer (see below), and Framer
     * needs the number.
     */
    delayOf: (index: number) => number;
}

/**
 * Bind one ranked list to the cascade.
 *
 * ── WHY THE FADE IS NOT CSS ────────────────────────────────────────────────
 * It was, for one commit, and it was wrong. When a list re-ranks, React
 * reorders the DOM by RE-INSERTING the moved nodes — and re-inserting an
 * element restarts every CSS animation on it. So a row promoted from 4th to
 * 1st replayed its own entrance, sat at opacity 0 for the entire slide, and
 * teleported invisibly: the exact failure this was built to remove, plus an
 * invisible blue, since a tint painted on a transparent row paints nothing.
 * Measured in Chromium, not reasoned about — five of six rows held opacity 0
 * for 245ms straight through the reorder.
 *
 * So the work is split by what each layer can actually promise:
 *
 *   Framer owns OPACITY (`initial`/`animate` on each row) — it is keyed to
 *     mount, so it runs for a genuinely new row and a DOM move cannot replay
 *     it. A re-ranking row therefore stays fully visible for every frame of
 *     its travel.
 *   Framer owns TRANSFORM (`layout="position"`) — the slide itself.
 *   CSS owns THE BLUE (`cs-row-settle`) — and here a restart on DOM move is
 *     not a bug but the point: a row that moved SHOULD re-take the tint. The
 *     a/b flip covers the rest, since rows that did not move are not
 *     re-inserted and would otherwise never replay.
 *
 * ── WHY IT WAITS FOR THE VIEWPORT ──────────────────────────────────────────
 * Anmol, 2026-09-14: "only two things are visible in this screen, and that's
 * this assessment and the test beside it. The medicine and the exercise plan
 * are not visible because they are down." A cascade that plays below the fold
 * is not a subtle cascade, it is no cascade — the doctor scrolls down to a
 * list that has already finished arriving.
 *
 * The rule, and it is deliberately not "animate whenever it scrolls into
 * view": a panel cascades when there is genuinely new ranking for the
 * doctor's eyes, at the first moment those eyes can see it. So — re-ranked
 * while on screen, it cascades now; re-ranked while off screen, it holds the
 * cascade and spends it the moment it scrolls in; scrolled past again with
 * nothing new since, it stays still. Scrolling is not an event worth
 * animating, and a re-rank the doctor never saw is not one worth skipping.
 */
export function useRankCascade(
    stage: CascadeStage,
    orderKey: string,
    /** the scroll container this list renders into — watched for visibility */
    containerRef: RefObject<HTMLElement | null>,
): Cascade {
    const seen = useRef<string | null>(null);
    const lastRunAt = useRef(0);
    const visible = useRef(false);
    /** a re-rank that happened off screen and is owed a cascade */
    const owed = useRef(false);
    /** has this panel ever cascaded where the doctor could see it */
    const shown = useRef(false);
    const [phase, setPhase] = useState<"a" | "b">("a");
    /**
     * A deferred cascade starts at 0, not at its stage's lead. The lead means
     * "you are the Nth step of a cascade running right now"; a panel arriving
     * alone on a scroll is the only step there is, and making it sit through
     * another card's beat would just be latency.
     */
    const [lead, setLead] = useState(stage * CASCADE.CARD_STEP_MS);

    const fire = useCallback((withLead: number) => {
        lastRunAt.current = Date.now();
        owed.current = false;
        shown.current = true;
        setLead(withLead);
        setPhase((prev) => (prev === "a" ? "b" : "a"));
    }, []);

    // ---- visibility ------------------------------------------------------
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") {
            // No observer to lean on: treat the panel as always on screen
            // rather than silently never cascading.
            visible.current = true;
            return;
        }
        const io = new IntersectionObserver(
            ([entry]) => {
                const now = entry.isIntersecting;
                const was = visible.current;
                visible.current = now;
                // Arriving on screen spends a cascade only if one is owed, or
                // if this panel has never shown the doctor anything yet.
                if (now && !was && (owed.current || !shown.current) && seen.current) {
                    fire(0);
                }
            },
            // A third of the panel is enough to be worth animating into; less
            // than that and the top rows are still under the fold.
            { threshold: 0.33 },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [containerRef, fire]);

    // ---- re-rank ---------------------------------------------------------
    useEffect(() => {
        if (seen.current === orderKey) return;
        seen.current = orderKey;

        // Nothing ranked. There is no cascade to run, and letting an empty
        // list spend the replay guard would make the FIRST real cascade — the
        // one right after the doctor's first chip — arrive late.
        if (!orderKey) return;

        if (!visible.current) {
            // Off screen. Hold it; the observer spends it on the way in.
            owed.current = true;
            return;
        }

        // On screen and re-ranking as part of the group that all ranks off
        // the same chip, so this panel really is the Nth step of a cascade
        // happening right now — it keeps its stage lead.
        const withLead = stage * CASCADE.CARD_STEP_MS;

        const since = Date.now() - lastRunAt.current;
        if (since >= CASCADE.REPLAY_GUARD_MS) {
            fire(withLead);
            return;
        }
        const timer = window.setTimeout(() => fire(withLead), CASCADE.REPLAY_GUARD_MS - since);
        return () => window.clearTimeout(timer);
    }, [orderKey, stage, fire]);

    const delayOf = useCallback(
        (index: number) => lead + Math.min(index, CASCADE.STAGGER_CAP) * CASCADE.ROW_STEP_MS,
        [lead],
    );

    return { binding: { "data-cascade": phase }, delayOf };
}

/** The list's shared easing — the same curve the blue decays on. */
const CASCADE_EASE: [number, number, number, number] = [0.22, 0.68, 0, 1];

/**
 * Everything one ranked row needs to take part in the cascade, ready to
 * spread onto its `motion` root.
 *
 * It is a helper rather than four hand-written copies because the three
 * layers have to agree on one number: the row's fade (Framer), its blue
 * (CSS, via `--cs-row-delay`) and its slide all start on the same beat, and
 * a row whose tint led its arrival by a frame would read as the list
 * flickering rather than settling.
 *
 * `layout="position"`, never plain `layout`: position-only leaves the row's
 * SIZE alone, so a row whose guard reason expands mid-slide is not
 * scale-distorted and its text never smears — and the capped-list
 * `RANKED_ROW_H` maths stays honest, since nothing here changes a measured
 * height.
 */
export function cascadeRowProps(delayMs: number, reduce: boolean | null) {
    const delay = reduce ? 0 : delayMs;
    return {
        style: { "--cs-row-delay": `${delay}ms` } as CSSProperties,
        layout: reduce ? (false as const) : ("position" as const),
        // `initial` is keyed to MOUNT, which is the whole reason opacity
        // lives here and not in CSS: a genuinely new row fades in, and a row
        // that merely got re-inserted by React's reorder does not — it stays
        // visible for every frame of its travel.
        initial: reduce ? (false as const) : { opacity: 0 },
        animate: { opacity: 1 },
        transition: {
            layout: CASCADE_SLIDE,
            opacity: reduce
                ? { duration: 0 }
                : { duration: CASCADE.ENTER_MS / 1000, delay: delay / 1000, ease: CASCADE_EASE },
        },
    };
}
