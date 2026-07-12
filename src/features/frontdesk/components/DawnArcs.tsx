// The "dawn arcs" motif (§7): three concentric arcs rising over a horizon
// line with a small sun dot. One line-art SVG, re-hued per moment so the empty
// states read as a system rather than clip-art. Strokes only (rounded caps),
// no fills except the sun dot.

type Variant = "morning" | "endOfDay";

const PALETTE: Record<Variant, { arcs: [string, string, string]; sun: string; opacity: number }> = {
    // Morning: violet → pink → faint gray, warm sun. ~55% opacity.
    morning: { arcs: ["#7c5cf0", "#f0abc8", "#cbd2df"], sun: "#f2a986", opacity: 0.55 },
    // End of day: green → blue → faint gray, resting green sun. ~45% opacity.
    endOfDay: { arcs: ["#1c8a4d", "#3a5da8", "#cbd2df"], sun: "#1c8a4d", opacity: 0.45 },
};

export function DawnArcs({ variant, className }: { variant: Variant; className?: string }) {
    const p = PALETTE[variant];
    return (
        <svg
            width="140"
            height="72"
            viewBox="0 0 140 72"
            fill="none"
            className={className}
            style={{ opacity: p.opacity }}
            aria-hidden="true"
        >
            {/* horizon */}
            <path d="M14 56H126" stroke="#cbd2df" strokeWidth="1.6" strokeLinecap="round" />
            {/* concentric arcs, outermost (faintest) first */}
            <path d="M24 56A46 46 0 0 1 116 56" stroke={p.arcs[2]} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M38 56A32 32 0 0 1 102 56" stroke={p.arcs[1]} strokeWidth="1.8" strokeLinecap="round" />
            <path d="M52 56A18 18 0 0 1 88 56" stroke={p.arcs[0]} strokeWidth="2" strokeLinecap="round" />
            {/* sun */}
            <circle cx="70" cy="56" r="5" fill={p.sun} />
        </svg>
    );
}
