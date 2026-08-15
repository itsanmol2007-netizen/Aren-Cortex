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

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Pill, X } from "lucide-react";
import type { Medicine } from "../../lib/synapse/brands";
import { brandVariantLabel, doseFieldValue } from "../../lib/synapse/brands";
import { defaultTimingFor } from "./dosing";

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
    const reduce = useReducedMotion();

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

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onCancel]);

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
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                    />
                    <motion.div
                        className="cs-addmed-panel"
                        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.12 } }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    >
                <div className="cs-addmed-head">
                    <span className="cs-glyph is-teal"><Pill size={16} /></span>
                    <div className="cs-addmed-title">
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
                            <span className="cs-addmed-label">Strength</span>
                            <div className="cs-addmed-brands">
                                {variants.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
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
                        <span className="cs-addmed-label">When</span>
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
                        disabled={!brand || (!anySlot && !sos)}
                        onClick={() =>
                            onConfirm({
                                medicine: brand,
                                dosageMg: dosage.trim(),
                                frequency,
                                durationDays: duration.trim(),
                                instructions: timing,
                                isSos: sos,
                            })
                        }
                    >
                        <Check size={15} />
                        Add to plan
                    </button>
                </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
