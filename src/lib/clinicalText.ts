// ---------------------------------------------------------------------------
// CLINICAL TEXT — how a generated clinical line is joined on screen.
//
// Lines the product composes ("Fracture — Right knee, displaced", "Cast —
// Right knee, backslab") were written with an em dash. The house style is a
// plain spaced hyphen, "Fracture - Right knee", so anything already saved
// that way is normalised as it is displayed, not rewritten in the database.
// ---------------------------------------------------------------------------

/** "Fracture — Right knee" / "Fracture – Right knee" → "Fracture - Right knee".
 *  An unspaced en dash is a range ("3–5 days") and is left alone. */
export function dashText(s: string): string {
    return s.replace(/\s*—\s*|\s+–\s+/g, " - ");
}

/** The joiner every generated clinical line uses: "Fracture - Right knee". */
export const JOIN = " - ";

/** `text` is `head` followed by a joiner — either the house " - " or the
 *  " — " older saved lines carry ("X-Ray Knee - Left, AP"). */
export function isHeadOf(text: string, head: string): boolean {
    return text.startsWith(`${head} - `) || text.startsWith(`${head} — `);
}

/** `text` with its headline and joiner taken off, whichever joiner it has. */
export function afterHead(text: string, head: string): string {
    for (const j of [" - ", " — "]) if (text.startsWith(head + j)) return text.slice(head.length + j.length);
    return text;
}
