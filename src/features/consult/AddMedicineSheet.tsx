// ---------------------------------------------------------------------------
// ADD A MEDICINE THE CATALOGUE DOESN'T HAVE YET — §5, 2026-08-24.
//
// "Not found in ranking or search" used to be a dead end: `IntentSearch`'s
// empty state said "Try the name, or the symptom you are treating" and there
// was nowhere to go from there. This is that "somewhere to go" — but it is
// deliberately NOT "type a new medicine and prescribe it": doctrine rule 22
// forbids minting a new COMPOSITION from this path (a new molecule is a
// clinical decision behind compositions → gates → rules, never a self-service
// one), and `add_medicine` — already built, never wired to any screen before
// this — enforces exactly that: it raises if the composition id doesn't
// already exist.
//
// So the one thing this sheet FORCES is the salt/composition, searched from
// our own library, never typed free. Everything else about the brand
// (dosage, form) is optional and skippable — asking for ten fields (MRP,
// manufacturer, batch…) on a doctor who is mid-consultation is precisely the
// friction doctrine rule 17 exists to prevent. Confirming here hands straight
// off into `MedicineAddSheet` (dose/timing/duration) exactly like any other
// accepted medicine — this sheet's whole job ends at "the brand now exists
// and is named", never at "here is how much of it to take".
//
// Deliberately its own file rather than a mode of `MedicineAddSheet`: that
// sheet's entire shape (brand list, strength variants, dose/timing) assumes
// a resolved product already exists. This one exists to CREATE that product;
// once it does, the existing sheet takes over unmodified.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus, Search, X } from "lucide-react";
import { addMedicine } from "../../lib/db/synapse";
import { useIntentSearch } from "./IntentSearch";
import type { AcceptPayload } from "./types";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

/** Dosage forms worth naming up front. Free beyond this list costs nothing —
 *  `route` is a plain text column — but a picker is faster than typing for
 *  the forms that cover almost every real brand. */
const FORMS = [
    "Tablet", "Capsule", "Syrup", "Suspension", "Drops",
    "Injection", "Cream", "Ointment", "Gel", "Inhaler",
];

interface CompositionPick {
    intentId: number;
    compositionId: number;
    label: string;
}

interface Props {
    open: boolean;
    /** the query the doctor had already typed when they reached for this */
    initialName: string;
    onCancel: () => void;
    onAccept: (payload: AcceptPayload) => void;
}

export function AddMedicineSheet({ open, initialName, onCancel, onAccept }: Props) {
    const [name, setName] = useState(initialName);
    const [composition, setComposition] = useState<CompositionPick | null>(null);
    const [dosage, setDosage] = useState("");
    const [form, setForm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The composition search reuses the SAME manual search every other
    // category has (rule 7) — a medicine-type hit's `refId`, when it
    // resolves to a composition, IS the salt this brand is being attached
    // to. No second catalogue, no free-text molecule.
    const compSearch = useIntentSearch(["medicine"]);

    useEffect(() => {
        if (!open) return;
        setName(initialName);
        setComposition(null);
        setDosage("");
        setForm("");
        setError(null);
        compSearch.setQuery("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialName]);

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, open);

    const canSubmit = !!name.trim() && !!composition && !submitting;

    const submit = async () => {
        if (!canSubmit || !composition) return;
        setSubmitting(true);
        setError(null);
        try {
            const strengthMg = dosage.trim() ? Number(dosage.trim().replace(/[^\d.]/g, "")) : null;
            const results = await addMedicine({
                name: name.trim(),
                compositionIds: [composition.compositionId],
                route: form || null,
                strengthMg: strengthMg != null && Number.isFinite(strengthMg) ? strengthMg : null,
            });
            const created = results[0]?.medicine;
            // `brandHint` is what lets `handleAcceptIntent` find this exact
            // row via `resolveProductByName` — a live read against
            // `medicines`, not the materialized view `composition_brands`
            // reads (see that view's own "must be refreshed manually"
            // gotcha) — so the brand this JUST created is reachable
            // immediately, not only after the next refresh.
            onAccept({
                intentId: composition.intentId,
                type: "medicine",
                label: composition.label,
                refTable: "compositions",
                refId: composition.compositionId,
                medicine: null,
                viaSearch: true,
                overridden: false,
                brandHint: created?.name ?? name.trim(),
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSubmitting(false);
        }
    };

    // Composition hits, deduplicated by composition id — `search_intents`
    // can return more than one row resolving to the same composition (a
    // label match and a brand match both landing on it).
    const compositionHits = (() => {
        const seen = new Set<number>();
        const out: CompositionPick[] = [];
        for (const h of compSearch.hits) {
            if (h.refTable !== "compositions" || h.refId == null) continue;
            if (seen.has(h.refId)) continue;
            seen.add(h.refId);
            out.push({ intentId: h.intentId, compositionId: h.refId, label: h.label });
        }
        return out;
    })();

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div className="cs-addmed" role="dialog" aria-modal="true" aria-label="Add a medicine">
                    <motion.div
                        className="cs-addmed-scrim"
                        onClick={onCancel}
                        initial={false}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{ duration: 0 }}
                    />
                    <motion.div
                        className="cs-addmed-panel cs-newmed-panel cx-kbd-surface"
                        ref={panelRef}
                        tabIndex={-1}
                        initial={false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{ duration: 0 }}
                    >
                        <div className="cs-addmed-head">
                            <span className="cs-glyph is-teal"><Plus size={16} /></span>
                            <div className="cs-addmed-title">
                                <strong>Add a medicine</strong>
                                <span>One-time details, saved for next time you reach for it</span>
                            </div>
                            <button type="button" className="cs-addmed-x" onClick={onCancel} aria-label="Cancel">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="cs-addmed-body">
                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">Brand name</span>
                                <input
                                    className="cs-addmed-input"
                                    value={name}
                                    placeholder="e.g. Acenac-XT"
                                    onChange={(e) => setName(e.target.value)}
                                    autoFocus
                                />
                            </section>

                            <section className="cs-addmed-sec">
                                <span className="cs-addmed-label">
                                    Salt / composition <em className="cs-addmed-keyhint">required</em>
                                </span>
                                {composition ? (
                                    <div className="cs-newmed-comp-chosen">
                                        <Check size={13} />
                                        <span>{composition.label}</span>
                                        <button type="button" onClick={() => setComposition(null)}>Change</button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="cs-field">
                                            <Search size={15} />
                                            <input
                                                value={compSearch.query}
                                                placeholder="Search the salt this contains…"
                                                onChange={(e) => compSearch.setQuery(e.target.value)}
                                                aria-label="Search compositions"
                                            />
                                        </div>
                                        {compSearch.isSearching && (
                                            <div className="cs-newmed-comp-hits">
                                                {compSearch.loading ? (
                                                    <span className="cs-newmed-comp-hint">Searching…</span>
                                                ) : compositionHits.length === 0 ? (
                                                    <span className="cs-newmed-comp-hint">
                                                        Nothing matches — try the molecule name.
                                                    </span>
                                                ) : (
                                                    compositionHits.map((c) => (
                                                        <button
                                                            key={c.compositionId}
                                                            type="button"
                                                            onClick={() => setComposition(c)}
                                                        >
                                                            {c.label}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>

                            <div className="cs-addmed-grid">
                                <section className="cs-addmed-sec">
                                    <span className="cs-addmed-label">Dosage <em className="cs-addmed-keyhint">optional</em></span>
                                    <input
                                        className="cs-addmed-input"
                                        value={dosage}
                                        placeholder="e.g. 500mg"
                                        onChange={(e) => setDosage(e.target.value)}
                                    />
                                </section>
                                <section className="cs-addmed-sec">
                                    <span className="cs-addmed-label">Form <em className="cs-addmed-keyhint">optional</em></span>
                                    <select
                                        className="cs-addmed-input"
                                        value={form}
                                        onChange={(e) => setForm(e.target.value)}
                                    >
                                        <option value="">—</option>
                                        {FORMS.map((f) => (
                                            <option key={f} value={f.toLowerCase()}>{f}</option>
                                        ))}
                                    </select>
                                </section>
                            </div>

                            {error && <p className="cs-newmed-error">{error}</p>}
                        </div>

                        <div className="cs-addmed-foot">
                            <button type="button" className="cs-addmed-cancel" onClick={onCancel}>Cancel</button>
                            <button
                                type="button"
                                className="cs-addmed-confirm"
                                title={!composition ? "Pick the salt this medicine contains first" : undefined}
                                disabled={!canSubmit}
                                onClick={submit}
                            >
                                <Check size={15} />
                                {submitting ? "Adding…" : "Add & continue"}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
