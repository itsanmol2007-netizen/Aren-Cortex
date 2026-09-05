// ---------------------------------------------------------------------------
// ADD A BRAND TO THE CLINIC CATALOGUE — the admin's version.
//
// The consult screen has `AddMedicineSheet`, but that one is welded to the
// consult: it drives `useIntentSearch`, emits an `AcceptPayload` that splices
// into the prescription plan, and carries a keyboard surface. None of that
// applies here. So this is the same IDEA — force an existing salt, keep every
// other field optional (rule 17) — rebuilt on the plain `PracticeModal` shell
// every other admin modal uses.
//
// Rule 22 is enforced where it belongs: the `add_medicine` RPC raises on an
// unknown composition id. This form simply cannot submit without at least one
// salt picked from `searchCompositions`, so there is no free-text molecule
// path to begin with.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Check, Pill, Search, X } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { FormError, FormNote, INPUT_CLASS } from "../clinic/ui";
import {
    addClinicMedicine, searchCompositions, type CompositionHit,
} from "../../lib/db/admin";

const FORMS = [
    "Tablet", "Capsule", "Syrup", "Suspension", "Drops",
    "Injection", "Cream", "Ointment", "Gel", "Inhaler",
];

export function AddMedicineModal({
    onClose, onSaved,
}: {
    onClose: () => void;
    onSaved: () => void;
}) {
    const [name, setName] = useState("");
    const [manufacturer, setManufacturer] = useState("");
    const [strength, setStrength] = useState("");
    const [form, setForm] = useState("");
    const [picked, setPicked] = useState<CompositionHit[]>([]);

    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<CompositionHit[]>([]);
    const [searching, setSearching] = useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounced salt search. The library is small and the query is short, so a
    // 200ms wait is plenty to avoid a request per keystroke without the list
    // ever feeling laggy.
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = query.trim();
        if (q.length < 2) { setHits([]); setSearching(false); return; }
        setSearching(true);
        timer.current = setTimeout(() => {
            searchCompositions(q)
                .then((rows) => setHits(rows.filter((r) => !picked.some((p) => p.id === r.id))))
                .catch(() => setHits([]))
                .finally(() => setSearching(false));
        }, 200);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query, picked]);

    const dirty = !!name.trim() || picked.length > 0 || !!manufacturer.trim() || !!strength.trim() || !!form;
    const canSave = !!name.trim() && picked.length > 0 && !busy;

    const submit = async () => {
        if (!canSave) return;
        setBusy(true);
        setError(null);
        try {
            const mg = strength.trim() ? Number(strength.trim().replace(/[^\d.]/g, "")) : null;
            await addClinicMedicine({
                name: name.trim(),
                compositionIds: picked.map((p) => p.id),
                route: form || null,
                strengthMg: mg != null && Number.isFinite(mg) ? mg : null,
                manufacturer: manufacturer.trim() || null,
            });
            onSaved();
            onClose();
        } catch (e) {
            // The RPC's RAISE text is the message — show it as-is.
            setError(e instanceof Error ? e.message : "Could not add that medicine.");
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="teal"
            icon={<Pill size={15} />}
            eyebrow="Clinic catalogue"
            title="Add a medicine"
            onClose={onClose}
            dirty={dirty}
            footer={
                <>
                    <button type="button" className="prac-modal-btn is-ghost" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        className="prac-modal-btn is-primary"
                        disabled={!canSave}
                        onClick={submit}
                    >
                        {busy ? "Adding…" : "Add medicine"}
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-[14px]">

                <div className="flex flex-col gap-[5px]">
                    <label htmlFor="acm-name" className="text-[11px] font-semibold text-[var(--cs-muted)]">Brand name</label>
                    <input
                        id="acm-name"
                        value={name}
                        placeholder="e.g. Acenac-XT"
                        onChange={(e) => setName(e.target.value)}
                        className={INPUT_CLASS}
                        autoFocus
                    />
                </div>

                {/* ── Salt(s) — the one required, non-free field ─────────── */}
                <div className="flex flex-col gap-[6px]">
                    <span className="text-[11px] font-semibold text-[var(--cs-muted)]">
                        Salt / composition <span className="font-normal text-[var(--cs-faint)]">— required, picked from our library</span>
                    </span>

                    {picked.length > 0 && (
                        <div className="flex flex-wrap gap-[5px]">
                            {picked.map((c) => (
                                <span
                                    key={c.id}
                                    className="inline-flex items-center gap-[5px] rounded-full border border-[var(--cs-teal)] bg-[var(--cs-teal-soft)] px-[9px] py-[3px] text-[11px] font-semibold text-[var(--cs-teal)]"
                                >
                                    <Check size={11} /> {c.name}
                                    <button
                                        type="button"
                                        aria-label={`Remove ${c.name}`}
                                        onClick={() => setPicked((cur) => cur.filter((x) => x.id !== c.id))}
                                        className="cursor-pointer text-[var(--cs-teal)] hover:text-[var(--cs-red)]"
                                    >
                                        <X size={11} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="relative">
                        <Search size={13} className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]" />
                        <input
                            value={query}
                            placeholder={picked.length ? "Add another salt, if this is a combination…" : "Search the salt this contains…"}
                            onChange={(e) => setQuery(e.target.value)}
                            className={`${INPUT_CLASS} pl-[30px]!`}
                        />
                    </div>

                    {query.trim().length >= 2 && (
                        <div className="max-h-[168px] overflow-y-auto rounded-[10px] border border-[var(--cs-line)] bg-[var(--cs-page)] p-[4px]">
                            {searching ? (
                                <span className="block px-[8px] py-[6px] text-[11.5px] text-[var(--cs-faint)]">Searching…</span>
                            ) : hits.length === 0 ? (
                                <span className="block px-[8px] py-[6px] text-[11.5px] text-[var(--cs-faint)]">
                                    Nothing matches — try the molecule name. A salt that genuinely isn't in
                                    AREN has to be requested by a doctor from the consult screen.
                                </span>
                            ) : (
                                hits.map((h) => (
                                    <button
                                        key={h.id}
                                        type="button"
                                        onClick={() => { setPicked((cur) => [...cur, h]); setQuery(""); }}
                                        className="block w-full cursor-pointer rounded-[7px] px-[8px] py-[6px] text-left text-[12px] font-medium text-[var(--cs-ink)] transition-colors hover:bg-[var(--cs-teal-soft)]"
                                    >
                                        {h.name}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* ── Optional details ──────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-[9px] max-[560px]:grid-cols-1">
                    <div className="flex flex-col gap-[5px]">
                        <label htmlFor="acm-mfr" className="text-[11px] font-semibold text-[var(--cs-muted)]">
                            Maker <span className="font-normal text-[var(--cs-faint)]">· optional</span>
                        </label>
                        <input id="acm-mfr" value={manufacturer} placeholder="e.g. Cipla" onChange={(e) => setManufacturer(e.target.value)} className={INPUT_CLASS} />
                    </div>
                    <div className="flex flex-col gap-[5px]">
                        <label htmlFor="acm-str" className="text-[11px] font-semibold text-[var(--cs-muted)]">
                            Strength <span className="font-normal text-[var(--cs-faint)]">· optional</span>
                        </label>
                        <input id="acm-str" value={strength} placeholder="e.g. 500" inputMode="decimal" onChange={(e) => setStrength(e.target.value)} className={INPUT_CLASS} />
                    </div>
                    <div className="flex flex-col gap-[5px]">
                        <label htmlFor="acm-form" className="text-[11px] font-semibold text-[var(--cs-muted)]">
                            Form <span className="font-normal text-[var(--cs-faint)]">· optional</span>
                        </label>
                        <select id="acm-form" value={form} onChange={(e) => setForm(e.target.value)} className={INPUT_CLASS}>
                            <option value="">—</option>
                            {FORMS.map((f) => <option key={f} value={f.toLowerCase()}>{f}</option>)}
                        </select>
                    </div>
                </div>

                <FormNote>
                    This adds a <strong>brand</strong>, attached to a salt that already exists. It becomes
                    searchable for every doctor at this clinic. A new <strong>salt</strong> is a different
                    thing — it changes ranking, and only AREN adds those, after review.
                </FormNote>

                {error && <FormError message={error} />}
            </div>
        </PracticeModal>
    );
}
