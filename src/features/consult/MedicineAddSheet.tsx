// ---------------------------------------------------------------------------
// ADD MEDICINE — the confirm step between "this is ranked" and "this is
// prescribed."
//
// Until 2026-08-12 the + button committed a medicine straight to the plan with
// whatever brand the resolver happened to return and whatever dose the
// composition defaulted to. Two things were wrong with that:
//
//  * THE BRAND WAS CHOSEN FOR THE DOCTOR. A composition has hundreds of
//    products behind it at several strengths, and which one is prescribed is
//    a clinical decision — a 250mg suspension and a 650mg tablet are not
//    interchangeable because they share a molecule.
//
//  * THE DOSE WAS NEVER CONFIRMED. A default is a starting point, not an
//    order. Committing one silently means the doctor has to notice it was
//    wrong in the review modal, at the end, when their attention has moved on.
//
// So this sheet asks once, at the moment of the decision, and pre-fills every
// answer so confirming is one key. Brand is the headline throughout — it is
// what the doctor prescribes and what the patient buys; the molecule is shown
// underneath so the two are never confused, never the other way round.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pill, X } from "lucide-react";
import type { Medicine } from "../../lib/synapse/brands";
import { brandVariantLabel, doseFieldValue } from "../../lib/synapse/brands";
import { defaultTimingFor } from "./dosing";
import { firedChord, matches } from "../../lib/keyboard/keymap";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";

export interface MedicineDraft {
    medicine: Medicine | null;
    dosageMg: string;
    /** slot string, "1-0-1-0" */
    frequency: string;
    durationDays: string;
    instructions: string;
    isSos: boolean;
}

interface Props {
    open: boolean;
    /** the composition being prescribed — the molecule, shown as the subtitle */
    compositionLabel: string;
    /** every product behind this composition, best first */
    brands: Medicine[];
    /** the resolver's pick, pre-selected */
    initialBrand: Medicine | null;
    onCancel: () => void;
    onConfirm: (draft: MedicineDraft) => void;
}

/** The four slots a frequency string encodes: morning-afternoon-evening-night. */
const SLOTS = [
    { key: 0, label: "Morning" },
    { key: 1, label: "Afternoon" },
    { key: 2, label: "Evening" },
    { key: 3, label: "Night" },
];

const TIMINGS = ["After food", "Before food", "With food", "Empty stomach"];

export function MedicineAddSheet({
    open, compositionLabel, brands, initialBrand, onCancel, onConfirm,
}: Props) {
    const [brand, setBrand] = useState<Medicine | null>(initialBrand);
    const [slots, setSlots] = useState<boolean[]>([true, false, true, false]);
    const [duration, setDuration] = useState("5");
    const [dosage, setDosage] = useState("");
    const [timing, setTiming] = useState(TIMINGS[0]);
    const [sos, setSos] = useState(false);

    // Re-seed whenever a different medicine opens the sheet.
    useEffect(() => {
        if (!open) return;
        setBrand(initialBrand);
        setSlots([true, false, true, false]);
        setDuration("5");
        // The doctor should not have to retype a number that is already in the
        // name of the product they just picked. `doseFieldValue` prefers the
        // catalogue's own strength_mg and falls back to reading the name; see
        // its doc comment for the three cases it refuses to guess.
        setDosage(initialBrand ? doseFieldValue(initialBrand) : "");
        // Same idea for the food instruction: a documented, conservative
        // static map (dosing.ts), never a guard — the doctor can still pick
        // any of the four. Every molecule the brand carries is checked, not
        // just the one it was ranked through, so a combination matches on
        // whichever ingredient dosing.ts recognises.
        const molecules = initialBrand?.compositionLabels?.length
            ? initialBrand.compositionLabels.join(" + ")
            : compositionLabel;
        setTiming(defaultTimingFor(molecules) ?? TIMINGS[0]);
        setSos(false);
    }, [open, initialBrand, compositionLabel]);

    /**
     * Strength variants of the SELECTED brand family, so "Acenac-P 100mg" and
     * "Acenac-P 200mg" are one choice with two strengths rather than two
     * unrelated rows. Falls back to the whole list when a family cannot be
     * told apart, which is better than showing nothing.
     */
    const variants = useMemo(() => {
        if (!brand) return [];
        const family = brand.name.split(/\s+\d/)[0].toLowerCase();
        const same = brands.filter((b) => b.name.toLowerCase().startsWith(family));
        return same.length > 1 ? same : [];
    }, [brand, brands]);

    const frequency = slots.map((s) => (s ? 1 : 0)).join("-");
    const anySlot = slots.some(Boolean);
    const canConfirm = !!brand && (anySlot || sos);

    /**
     * The panel takes focus while it is open, and gives it back on close —
     * see `useOverlayFocus.ts` for why every overlay needs this. Focusing the
     * PANEL rather than the Dose input is deliberate: landing in a text field
     * would put the digits right back inside a field, which is the exact bug
     * this exists to prevent.
     */
    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, open);

    /**
     * Scrolls the newly selected brand or strength button into view.
     *
     * Found live, 2026-08-15: walking `brands` with ↑↓ updates `.is-on`
     * correctly but nothing ever moved `.cs-addmed-brands.is-scroll`'s own
     * scroll position, so the highlighted brand walked off the visible edge
     * while the scrollbar stayed put — reported as "the scroll bar is not
     * going down with your down arrow." `data-brand-id` on each button is
     * what this looks the new selection up by; `requestAnimationFrame`
     * because `setBrand` has only just been called and the button carrying
     * that id does not exist with the RIGHT id-to-node mapping until the
     * next render commits.
     */
    const followSelection = (id: number) => {
        window.requestAnimationFrame(() => {
            panelRef.current
                ?.querySelector<HTMLElement>(`[data-brand-id="${id}"]`)
                ?.scrollIntoView({ block: "nearest" });
        });
    };

    const commit = () =>
        onConfirm({
            medicine: brand,
            dosageMg: dosage.trim(),
            frequency,
            durationDays: duration.trim(),
            instructions: timing,
            isSos: sos,
        });

    /**
     * ── The sheet, on the keyboard ──────────────────────────────────────────
     *
     * This is the one modal in the consult that a doctor hits on EVERY
     * medicine, so it is the one where a mouse reach compounds: five medicines
     * is five trips to the brand list, the four timing circles and the confirm
     * button. Everything on it is now one keystroke.
     *
     * The digits are the interesting choice. 1-2-3-4 map to morning, noon,
     * evening and night — the same four positions doctors already write by
     * hand as 1-0-1-0, and the same order the circles sit in on screen — so
     * "1", "4" is literally the notation for a BD dose. `0` is SOS because it
     * is the one that is not a time of day.
     *
     * All of them are bare keys with no modifier, which is only safe because
     * `matches()` refuses a binding without `whileTyping` whenever the event
     * came from a field: this panel has a Dose box and a Duration box, and
     * typing "500" into the first must not silently reschedule the drug. Enter
     * is bound twice for the same reason — bare Enter for a doctor whose hands
     * are on the digits, Ctrl+Enter for one who is still in the Dose field and
     * does not want to Tab out first.
     *
     * Capture phase, matching every other keyboard surface here, so Escape
     * reaches this sheet rather than the panel underneath it.
     */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const take = () => { e.preventDefault(); e.stopPropagation(); };

            if (matches(e, "sheetCancel")) { take(); onCancel(); return; }

            if (matches(e, "sheetConfirm")) {
                take();
                // Same refusal as the button: a null brand used to be
                // confirmable and `commitAccept` then deleted the intent
                // again, so the doctor pressed Add and watched nothing happen.
                if (canConfirm) commit();
                return;
            }

            const slot = firedChord(e, "sheetSlot");
            if (slot) {
                take();
                const i = Number(slot.key) - 1;
                setSlots((cur) => cur.map((v, j) => (j === i ? !v : v)));
                return;
            }

            if (matches(e, "sheetSos")) {
                take();
                setSos((v) => !v);
                return;
            }

            const nav = firedChord(e, "sheetBrand");
            if (nav) {
                take();
                // Walks `brands` rather than the rendered buttons: the list
                // scrolls, and the strength variants below it are a VIEW of
                // the same products, so the DOM holds some of them twice.
                if (brands.length === 0) return;
                const at = brands.findIndex((b) => b.id === brand?.id);
                const dir = nav.key === "ArrowUp" ? -1 : 1;
                const next = at === -1
                    ? (dir === 1 ? 0 : brands.length - 1)
                    : (at + dir + brands.length) % brands.length;
                const picked = brands[next];
                setBrand(picked);
                // Keep the dose honest with the strength that was just chosen,
                // exactly as clicking a strength variant does.
                const value = doseFieldValue(picked);
                if (value) setDosage(value);
                followSelection(picked.id);
                return;
            }

            /**
             * ← → — a SEPARATE axis from ↑ ↓, and deliberately so.
             *
             * Found live, 2026-08-15: a brand with several strengths (an
             * "A250" suspension at 250mg/650mg, say) has no keyboard path to
             * the OTHER strength at all — ↓ only walks `brands`, and a family
             * of two strengths is two SEPARATE entries in that flat list, so
             * reaching the second one meant scrolling past every unrelated
             * brand in between rather than moving sideways within the one
             * already chosen. ↑↓ answers "which drug"; ← → answers "which
             * strength of the drug already chosen" — the same split the
             * Brand/Strength section headings already draw on screen.
             *
             * A no-op while the selected brand has no siblings (`variants`
             * is empty for anything that isn't part of a multi-strength
             * family), so ← → falls through to whatever else might want it —
             * nothing does today, but it means adding one later costs
             * nothing here.
             */
            const strength = firedChord(e, "sheetStrength");
            if (strength && variants.length > 1) {
                take();
                const at = variants.findIndex((v) => v.id === brand?.id);
                const dir = strength.key === "ArrowLeft" ? -1 : 1;
                const next = at === -1 ? 0 : (at + dir + variants.length) % variants.length;
                const picked = variants[next];
                setBrand(picked);
                const value = doseFieldValue(picked);
                if (value) setDosage(value);
                followSelection(picked.id);
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, onCancel, canConfirm, brands, variants, brand, dosage, duration, frequency, timing, sos]);

    // AnimatePresence needs the exiting element to stay mounted for the
    // duration of its `exit` animation, so the `!open` check moved from an
    // early return into this condition — `open` was previously the ONLY
    // reason this component ever rendered nothing, so closing the sheet used
    // to be instant, no different from it never having existed on screen.
    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    className="cs-addmed"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Add medicine"
                >
                    <motion.div
                        className="cs-addmed-scrim"
                        onClick={onCancel}
                        // No entrance/exit motion — Anmol: the sheet used to
                        // fade+blur in over a spring bounce every time a chip
                        // resolved to a medicine that needed a brand/dose
                        // pick, which read as a "weird blue screen animation"
                        // for something that just needs to appear. It still
                        // opens and closes; it no longer animates doing so.
                        initial={false}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{ duration: 0 }}
                    />
                    <motion.div
                        className="cs-addmed-panel cx-kbd-surface"
                        ref={panelRef}
                        // Programmatic focus only — the panel is a landing
                        // place for the keyboard, never a Tab stop of its own.
                        tabIndex={-1}
                        initial={false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{ duration: 0 }}
                    >
                <div className="cs-addmed-topstripe" />
                <div className="cs-addmed-head">
                    <span className="cs-glyph is-teal"><Pill size={16} /></span>
                    <div className="cs-addmed-title">
                        <span className="cs-addmed-eyebrow">Prescribe</span>
                        {/* Brand leads. Always. */}
                        <strong>{brand?.name ?? compositionLabel}</strong>
                        {/* EVERY molecule, joined. The subtitle used to print
                            the one composition this was ranked through, so a
                            combination showed half of what the doctor was
                            about to prescribe: "Acenac-P / Aceclofenac", with
                            the paracetamol nowhere on screen. */}
                        <span>
                            {brand?.compositionLabels?.length
                                ? brand.compositionLabels.join(" + ")
                                : compositionLabel}
                        </span>
                    </div>
                    <button type="button" className="cs-addmed-x" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    {brands.length > 1 && (
                        <section className="cs-addmed-sec">
                            <span className="cs-addmed-label">Brand</span>
                            {/* Was `brands.slice(0, 8)` with nothing behind it.
                                `BRAND_CANDIDATES` fetches 30, so 22 products
                                were rendered unreachable by a hard slice, on a
                                panel whose entire job is choosing between
                                them. The list scrolls instead. */}
                            <div className="cs-addmed-brands is-scroll">
                                {brands.map((b) => {
                                    const molecules = b.compositionLabels ?? [];
                                    return (
                                        <button
                                            key={b.id}
                                            type="button"
                                            data-brand-id={b.id}
                                            className={`cs-addmed-brand${brand?.id === b.id ? " is-on" : ""}`}
                                            onClick={() => setBrand(b)}
                                            title={molecules.join(" + ") || undefined}
                                        >
                                            <span className="cs-addmed-brand-name">{b.name}</span>
                                            {/* Said plainly, because taking a
                                                combination means prescribing a
                                                molecule the doctor did not
                                                search for. Never a reason to
                                                hide it, always a reason to
                                                state it. */}
                                            {molecules.length > 1 && (
                                                <span className="cs-addmed-tag">
                                                    {molecules.length} molecules
                                                </span>
                                            )}
                                            {b.isClinicDefault && (
                                                <span className="cs-addmed-tag">clinic default</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {variants.length > 1 && (
                        <section className="cs-addmed-sec">
                            {/* The digit hint follows the "When" row's own
                                convention. ← → is deliberately DIFFERENT from
                                the ↑↓ that walks Brand above: up/down asks
                                "which drug", left/right asks "which strength
                                of the drug already chosen" — the same split
                                the two section headings already draw, just
                                said in keys too. */}
                            <span className="cs-addmed-label">Strength <em className="cs-addmed-keyhint">← →</em></span>
                            <div className="cs-addmed-brands">
                                {variants.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        data-brand-id={v.id}
                                        className={`cs-addmed-brand is-strength${brand?.id === v.id ? " is-on" : ""}`}
                                        onClick={() => {
                                            setBrand(v);
                                            // Same rule as the initial seed: prefer the catalogue
                                            // column, fall back to the name, and leave whatever the
                                            // doctor already typed alone when neither answers.
                                            const value = doseFieldValue(v);
                                            if (value) setDosage(value);
                                        }}
                                    >
                                        {brandVariantLabel(v)}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="cs-addmed-grid">
                        <section className="cs-addmed-sec">
                            <span className="cs-addmed-label">Dose</span>
                            <input
                                className="cs-addmed-input"
                                value={dosage}
                                placeholder="e.g. 500"
                                inputMode="decimal"
                                onChange={(e) => setDosage(e.target.value)}
                                aria-label="Dose in mg"
                            />
                        </section>

                        <section className="cs-addmed-sec">
                            <span className="cs-addmed-label">Duration (days)</span>
                            <input
                                className="cs-addmed-input"
                                value={duration}
                                placeholder="5"
                                inputMode="numeric"
                                onChange={(e) => setDuration(e.target.value)}
                                aria-label="Duration in days"
                            />
                        </section>
                    </div>

                    <section className="cs-addmed-sec">
                        {/* The digit is printed ON the label rather than only in
                            the shortcuts sheet: this is the one control where the
                            key and the thing it toggles are the same notation the
                            doctor already writes (1-0-1-0), so saying it here is
                            what makes the shortcut discoverable at the moment it
                            is useful. */}
                        <span className="cs-addmed-label">When <em className="cs-addmed-keyhint">1 – 4</em></span>
                        {/* The circle notation doctors already write by hand —
                            1-0-1-0 as ●○●○ — rather than four word buttons.
                            Rendering only: the value underneath is still the
                            existing slot string, built the same way below. */}
                        <div className="cs-addmed-circles" role="group" aria-label="Dose timing">
                            {SLOTS.map((s) => (
                                <button
                                    key={s.key}
                                    type="button"
                                    className={`cs-addmed-circle${slots[s.key] ? " is-on" : ""}`}
                                    aria-pressed={slots[s.key]}
                                    title={s.label}
                                    onClick={() =>
                                        setSlots((cur) => cur.map((v, i) => (i === s.key ? !v : v)))
                                    }
                                >
                                    <span className="cs-addmed-circle-mark" aria-hidden="true" />
                                    <span className="cs-addmed-circle-label">{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="cs-addmed-sec">
                        <span className="cs-addmed-label">Instruction</span>
                        <div className="cs-addmed-slots">
                            {TIMINGS.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={`cs-addmed-slot${timing === t ? " is-on" : ""}`}
                                    onClick={() => setTiming(t)}
                                >
                                    {t}
                                </button>
                            ))}
                            <button
                                type="button"
                                className={`cs-addmed-slot${sos ? " is-on" : ""}`}
                                aria-pressed={sos}
                                onClick={() => setSos((v) => !v)}
                            >
                                SOS
                            </button>
                        </div>
                    </section>
                </div>

                <div className="cs-addmed-foot">
                    <button type="button" className="cs-addmed-cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="cs-addmed-confirm"
                        // A null brand used to be confirmable. `commitAccept`
                        // then rejected it, fired a toast and DELETED the
                        // intent again, so the doctor pressed "Add to plan"
                        // and watched nothing happen. Refuse at the button,
                        // where the reason is still visible, not two steps
                        // later in a toast.
                        title={!brand ? "Choose a product first" : undefined}
                        disabled={!canConfirm}
                        onClick={commit}
                    >
                        <Check size={15} />
                        Add to plan
                        <span className="cs-kbd">Enter</span>
                    </button>
                </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
