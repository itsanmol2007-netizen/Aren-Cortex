// ---------------------------------------------------------------------------
// SPECIALTY MARK — the one place a facility's specialty gets a visual
// identity, not just a text label.
//
// Anmol, 2026-09-21: "we need it for all the specialties, in the UI, that
// person has dedicated part of his life to that field, so we need some
// personal visual treatment... changing the specialty will make you feel
// like oh I am in the ortho or maybe like cardiologist section now."
//
// Follows the exact house style `BlankArt.tsx` already established for this
// app's inline illustration, rather than inventing a second one: inline SVG
// (never an asset — inherits nothing external, costs no request), one line
// weight, the standing colour rule (rose here, matching `--cs-rose`/
// `--cs-rose-soft` — the same pair the rest of the app already uses for
// "reported"/urgent content), small and restrained rather than a hero
// illustration competing with the page around it.
//
// ── Only specialties that have actually earned one render anything
//
// Same rule `patientSnapshot.ts` already follows for its own per-specialty
// builders: General OPD and every profile without a configured mark render
// NOTHING here rather than a generic placeholder mark standing in for a
// visual identity that does not exist yet. A fake mark would be exactly the
// kind of fabrication this codebase's own doctrine refuses elsewhere (see
// patientSnapshot.ts's "Honesty over fabrication" header). Cardiology is the
// first specialty to earn one; Orthopedics gets its own the day that
// profile is built, not a placeholder today.
// ---------------------------------------------------------------------------

/** A heart with a pulse line through it — the standard, recognisable
 *  cardiology mark, drawn in this app's own pastel-fill/soft-stroke
 *  treatment rather than a solid emoji-style heart. */
function CardiologyMark({ size }: { size: number }) {
    return (
        <svg width={size} height={size * 0.9} viewBox="0 0 32 29" fill="none" aria-hidden="true">
            <path
                d="M16 26C16 26 4 17.5 4 9.8C4 5.5 7.4 2.2 11.6 2.2C13.9 2.2 15.4 3.6 16 5.1C16.6 3.6 18.1 2.2 20.4 2.2C24.6 2.2 28 5.5 28 9.8C28 17.5 16 26 16 26Z"
                fill="var(--cs-rose-soft, #fff1f3)"
                stroke="var(--cs-rose, #e11d48)"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path
                d="M2.5 15H10L12.8 8.5L16 21L19 11.5L21.5 15H29.5"
                fill="none"
                stroke="var(--cs-rose, #e11d48)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

const MARKS: Partial<Record<string, (props: { size: number }) => React.JSX.Element>> = {
    cardiology: CardiologyMark,
};

/**
 * The one read point. `size` is the mark's width in px — callers pick a size
 * that fits where they're placing it (a page greeting vs. a settings row are
 * different scales); this never assumes a fixed context.
 *
 * Renders nothing (not even a wrapper element) for any specialty without a
 * configured mark — see the header note above for why that is correct today.
 */
export function SpecialtyMark({ specialtyId, size = 28 }: { specialtyId: string; size?: number }) {
    const Mark = MARKS[specialtyId];
    if (!Mark) return null;
    return <Mark size={size} />;
}

/**
 * For a caller that needs to know BEFORE rendering — e.g. to pick a
 * background wrapper only when there is a mark to sit in it. `<SpecialtyMark
 * .../>` on its own can't answer this: JSX always produces a truthy element
 * description, even for a component whose render returns null, so a caller
 * checking that reference directly would always take the "has a mark"
 * branch. This is the actual data check.
 */
export function hasSpecialtyMark(specialtyId: string): boolean {
    return specialtyId in MARKS;
}
