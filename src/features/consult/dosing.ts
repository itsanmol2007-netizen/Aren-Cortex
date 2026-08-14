// ---------------------------------------------------------------------------
// DOSING — the food-instruction PRE-FILL for the medicine add sheet.
//
// There is no food-instruction data anywhere in the schema. Checked against
// the live database 2026-08-14 (docs/SESSION-HANDOFF.md §4.1): `compositions`
// carries only `id`, `name`, `specialization_scope`; `medicines` has no such
// column either; `medicine_composition_map.route` is the dosage FORM
// (tablet / syrup / ...), not a timing. So this file is authored content, not
// a database lookup, and it must behave like what it is: a PRE-FILL the
// doctor can change on the sheet, never a guard and never a warning. It never
// blocks anything and it never prints a reason — `MedicineAddSheet` just
// starts the "Instruction" picker on a different button.
//
// Deliberately conservative and short. Only classes where the food
// relationship is standard, undisputed teaching are here. When a composition
// matches nothing below, the sheet keeps its existing default ("After food")
// — a wrong specific answer would be worse than the generic one, and this
// file's whole job is to not be that.
//
// Keyed on the COMPOSITION NAME, the same way `measures.ts`'s
// `RELEVANT_FIELDS` is keyed on signal id rather than chip label: it is the
// stable vocabulary this module actually has to work with. There is no
// drug-class column to key on instead.
// ---------------------------------------------------------------------------

export type TimingInstruction = "After food" | "Before food" | "With food" | "Empty stomach";

interface DosingRule {
    timing: TimingInstruction;
    /** substrings of a composition name that identify the class, lowercase */
    matches: string[];
}

const RULES: DosingRule[] = [
    {
        // NSAIDs — gastric irritation is the reason, and it is the single most
        // commonly taught food rule in this list.
        timing: "After food",
        matches: [
            "ibuprofen", "diclofenac", "aceclofenac", "naproxen", "indomethacin",
            "mefenamic acid", "ketorolac", "nimesulide", "etoricoxib", "celecoxib",
            "piroxicam", "aspirin",
        ],
    },
    {
        // Metformin's GI upset is the reason, kept as its own row rather than
        // folded into the NSAID list so the two reasons stay legible on their
        // own if this file is ever extended.
        timing: "After food",
        matches: ["metformin"],
    },
    {
        // Proton-pump inhibitors need to be present before the meal that
        // triggers acid secretion.
        timing: "Before food",
        matches: [
            "omeprazole", "pantoprazole", "esomeprazole", "rabeprazole",
            "lansoprazole", "dexlansoprazole",
        ],
    },
    {
        // Sulfonylureas are timed to the meal they cover.
        timing: "Before food",
        matches: [
            "glimepiride", "glipizide", "gliclazide", "glyburide", "glibenclamide",
            "chlorpropamide",
        ],
    },
    {
        // Levothyroxine and the oral bisphosphonates both depend on empty-stomach
        // absorption — food (and, for levothyroxine, many other drugs) cuts
        // uptake meaningfully.
        timing: "Empty stomach",
        matches: [
            "levothyroxine", "alendronate", "alendronic acid", "risedronate",
            "ibandronate",
        ],
    },
];

/**
 * The food instruction to pre-fill, or `null` when nothing in the (short,
 * deliberate) list above applies. `compositionName` is whatever the sheet is
 * already showing as the subtitle — a single molecule, or a combination's
 * molecules joined with " + " — so a combination matches if ANY of its
 * molecules is a known class; the rule that fires first in `RULES` wins.
 */
export function defaultTimingFor(compositionName: string | null | undefined): TimingInstruction | null {
    if (!compositionName) return null;
    const name = compositionName.toLowerCase();
    for (const rule of RULES) {
        if (rule.matches.some((m) => name.includes(m))) return rule.timing;
    }
    return null;
}
