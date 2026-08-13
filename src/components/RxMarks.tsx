// ---------------------------------------------------------------------------
// PRESCRIPTION MARKS — SVG that takes the clinic's colour.
//
// Every mark here is STROKE-BASED and hue-agnostic: it is handed one colour
// and draws itself in that colour, so a clinic with a maroon accent gets a
// maroon sheet and a clinic with teal gets a teal one, from the same code.
//
// Two constraints shaped all of them, and both come from where this document
// actually ends up:
//
//  1. IT GETS PRINTED, usually on cheap white stock from a clinic laser
//     printer, often in greyscale. So nothing depends on hue to be legible:
//     every mark still reads as a shape when the colour is flattened to grey.
//     Fills are avoided in favour of thin strokes, which survive toner
//     starvation better than large flat areas.
//
//  2. IT IS A CLINICAL DOCUMENT, not a brochure. The marks sit at the
//     margins: a header monogram, a corner rule, a watermark at 3% behind the
//     medicines. None of them touches a line of dosage text, because
//     decoration crossing a dose is how a decimal point gets lost.
// ---------------------------------------------------------------------------

interface MarkProps {
    /** the clinic's accent, or a derived tone from it */
    color: string;
    className?: string;
}

/**
 * The header monogram: a stylised caduceus rod as a single continuous stroke,
 * with the two coils reduced to arcs. Reads at 40px and at 8px.
 */
export function RxMonogram({ color, className }: MarkProps & { size?: number }) {
    return (
        <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
            <path d="M20 5v30" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M20 11c-5 0-5 4 0 4s5 4 0 4-5 4 0 4"
                stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
            <path d="M20 11c5 0 5 4 0 4s-5 4 0 4 5 4 0 4"
                stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
            <circle cx="20" cy="6.5" r="2.2" stroke={color} strokeWidth="1.4" />
            <path d="M13 8.5c2.4-1.6 4.6-2.3 7-2.3s4.6.7 7 2.3"
                stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
        </svg>
    );
}

/**
 * The corner rule. A hairline that turns a right angle with a small node at
 * the vertex, echoing the AREN mark's "connected points of care" idea without
 * reproducing the product logo on a clinic's own letterhead.
 */
export function RxCorner({ color, className }: MarkProps) {
    return (
        <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
            <path d="M2 30V6a4 4 0 0 1 4-4h24" stroke={color} strokeWidth="1.3"
                strokeLinecap="round" opacity="0.55" />
            <path d="M9 24V13a4 4 0 0 1 4-4h11" stroke={color} strokeWidth="1.1"
                strokeLinecap="round" opacity="0.3" />
            <circle cx="6" cy="6" r="2.1" fill={color} opacity="0.7" />
            <circle cx="30" cy="2" r="1.3" fill={color} opacity="0.35" />
            <circle cx="2" cy="30" r="1.3" fill={color} opacity="0.35" />
        </svg>
    );
}

/**
 * The watermark behind the medicines block.
 *
 * A pill and a leaf sharing one outline: what is dispensed and what it is
 * made from. Held at very low opacity by the caller, and deliberately drawn
 * with open strokes so a printer that renders it too dark still leaves the
 * text on top readable.
 */
export function RxWatermark({ color, className }: MarkProps) {
    return (
        <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
            <rect x="26" y="46" width="68" height="28" rx="14"
                stroke={color} strokeWidth="2" />
            <path d="M60 46v28" stroke={color} strokeWidth="2" />
            <path d="M60 32c0-9 7-16 16-16 0 9-7 16-16 16z" stroke={color} strokeWidth="1.8"
                strokeLinejoin="round" />
            <path d="M60 32V20" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="60" cy="94" r="10" stroke={color} strokeWidth="1.6" opacity="0.6" />
            <path d="M60 88v12M54 94h12" stroke={color} strokeWidth="1.4" strokeLinecap="round"
                opacity="0.6" />
        </svg>
    );
}

/**
 * A section rule that carries the accent without becoming a coloured bar: a
 * short solid segment at the start, fading to a hairline. Gives each section
 * heading a clinic-specific mark that costs 2px of height.
 */
export function RxRule({ color, className }: MarkProps) {
    return (
        <span
            className={className}
            aria-hidden="true"
            style={{
                display: "block",
                height: 2,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${color} 0%, ${color} 12%, ${color}55 28%, ${color}00 100%)`,
            }}
        />
    );
}
