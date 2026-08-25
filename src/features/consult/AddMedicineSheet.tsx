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
import { addMedicine, requestNewComposition } from "../../lib/db/synapse";
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
    /**
     * The composition-adding fallback — same-day follow-up: "there should
     * be a fallback to composition adding too, if a composition is not
     * found in our db." Present only under a REAL identity (see
     * `requestNewComposition`'s doc comment — this is a doctor-attributed
     * request, not an anonymous one), same as every other identity-gated
     * write in this app. Absent means the request affordance below simply
     * does not render, which is what "no real doctor signed in" already
     * means everywhere else.
     */
    identity?: { doctorId: string; hospitalId: string } | null;
}

export function AddMedicineSheet({ open, initialName, onCancel, onAccept, identity }: Props) {
    const [name, setName] = useState(initialName);
    const [composition, setComposition] = useState<CompositionPick | null>(null);
    const [dosage, setDosage] = useState("");
    const [form, setForm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The composition-request fallback — its own small state machine,
    // separate from the brand form above: requesting a missing SALT and
    // adding a BRAND are two different asks, and conflating their state
    // would mean a sent request silently resetting if the doctor then
    // typed in the brand name field.
    const [requestOpen, setRequestOpen] = useState(false);
    const [requestNotes, setRequestNotes] = useState("");
    const [requestSubmitting, setRequestSubmitting] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [requestError, setRequestError] = useState<string | null>(null);

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
        setRequestOpen(false);
        setRequestNotes("");
        setRequestSent(false);
        setRequestError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialName]);

    const submitCompositionRequest = async () => {
        if (!identity) return;
        const requestedName = compSearch.query.trim();
        if (!requestedName) return;
        setRequestSubmitting(true);
        setRequestError(null);
        try {
            await requestNewComposition({
                doctorId: identity.doctorId,
                hospitalId: identity.hospitalId,
                requestedName,
                notes: requestNotes,
            });
            setRequestSent(true);
        } catch (e) {
            // Never claim "sent" on a failed write — the doctor's next
            // move (try again, or just move on) depends on knowing which
            // one actually happened.
            setRequestError(e instanceof Error ? e.message : String(e));
        } finally {
            setRequestSubmitting(false);
        }
    };

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

                                        {/* The composition-adding fallback — same-day follow-up.
                                            Deliberately NOT a way to finish adding THIS brand: the
                                            salt still does not exist, so "Add & continue" below stays
                                            disabled. This only tells the team it is missing — see
                                            `requestNewComposition`'s doc comment for why that is a
                                            request, never a live mint (rule 22). */}
                                        {identity && compSearch.isSearching && !compSearch.loading && (
                                            <div className="cs-newmed-request">
                                                {requestSent ? (
                                                    <span className="cs-newmed-request-sent">
                                                        <Check size={13} /> Request sent — the team will review it.
                                                        This brand can be added once the salt is in our library.
                                                    </span>
                                                ) : requestOpen ? (
                                                    <div className="cs-newmed-request-form">
                                                        <span className="cs-newmed-comp-hint">
                                                            Requesting “{compSearch.query.trim()}” be added to our library.
                                                        </span>
                                                        <input
                                                            className="cs-addmed-input"
                                                            value={requestNotes}
                                                            placeholder="Strength, form, or anything else — optional"
                                                            onChange={(e) => setRequestNotes(e.target.value)}
                                                        />
                                                        {requestError && <p className="cs-newmed-error">{requestError}</p>}
                                                        <div className="cs-newmed-request-actions">
                                                            <button type="button" onClick={() => setRequestOpen(false)}>
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="cs-newmed-request-send"
                                                                disabled={requestSubmitting}
                                                                onClick={submitCompositionRequest}
                                                            >
                                                                {requestSubmitting ? "Sending…" : "Send request"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="cs-newmed-request-open"
                                                        onClick={() => setRequestOpen(true)}
                                                    >
                                                        Salt not in our library either? Request it be added
                                                    </button>
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
