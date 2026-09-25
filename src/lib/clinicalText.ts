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
