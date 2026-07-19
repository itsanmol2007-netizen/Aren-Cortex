// The AREN mark: a small constellation that draws the letter A as a network of
// nodes — a nod to "Arenode" and to the product idea itself (one system,
// many connected points of care). Fine ink strokes, one accent node at the
// apex. Replaces the old semi-circle placeholder mark.

type Props = {
    size?: number;
    // ink + accent default to the login screen's palette; the gate screen
    // passes softer values.
    ink?: string;
    accent?: string;
    className?: string;
};

export function ArenMark({ size = 56, ink = "#0c0d0c", accent = "#6311d3", className }: Props) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            className={className}
            aria-hidden="true"
        >
            {/* legs of the A, drawn node-to-node */}
            <path
                d="M13 53 L23.5 37.5 L28 26.5 L33 12"
                stroke={ink}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.82"
            />
            <path
                d="M33 12 L41.5 37.5 L50 53"
                stroke={ink}
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.82"
            />
            {/* crossbar */}
            <path d="M23.5 37.5 L41.5 37.5" stroke={ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />
            {/* ground nodes */}
            <circle cx="13" cy="53" r="2.4" fill={ink} opacity="0.85" />
            <circle cx="50" cy="53" r="2.4" fill={ink} opacity="0.85" />
            {/* joint nodes */}
            <circle cx="23.5" cy="37.5" r="2" fill={ink} opacity="0.6" />
            <circle cx="41.5" cy="37.5" r="2" fill={ink} opacity="0.6" />
            <circle cx="28" cy="26.5" r="1.5" fill={ink} opacity="0.4" />
            {/* apex node — the one accent in the drawing */}
            <circle cx="33" cy="12" r="4.4" fill={accent} opacity="0.14" />
            <circle cx="33" cy="12" r="2.8" fill={accent} />
            {/* a quiet satellite, off-axis so the mark reads drawn, not built */}
            <circle cx="44" cy="18" r="1.3" fill={accent} opacity="0.45" />
            <path d="M35.6 13.5 L42.8 17.3" stroke={accent} strokeWidth="1" strokeLinecap="round" opacity="0.3" />
        </svg>
    );
}
