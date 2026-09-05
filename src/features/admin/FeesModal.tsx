// ---------------------------------------------------------------------------
// CONSULTATION FEES — the whole money setup, in one modal.
//
// One surface for both halves (what each doctor charges, and whether the
// clinic adds GST or allows a discount) because they are one decision made
// once, at onboarding. Splitting them into two modals would make an owner open
// two things to answer "what do we charge" — and the second one is three
// switches, which is not a screen.
//
// It mounts `PracticeModal` for the chrome, like every other modal in the app
// (docs/aren-modal-design.md: "one modal family, never a one-off look").
// Everything inside is Tailwind on `--cs-*` values.
//
// ── The one rule this form is careful about
// An empty fee box saves NULL ("not set"), and a typed `0` saves 0 ("this
// doctor does not charge"). They look almost identical on screen and mean
// completely different things at front desk — one shows no amount at all, the
// other shows a free consultation. `readMoney` below is the only place that
// distinction is decided.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { IndianRupee, Percent } from "lucide-react";
import { PracticeModal } from "../practice/PracticeModal";
import { FormError, FormNote, INPUT_CLASS } from "../clinic/ui";
import {
    updateBillingPolicy, updateDoctorFees,
    type BillingPolicy, type DoctorFee,
} from "../../lib/db/admin";

/**
 * Text box → what actually gets stored.
 *
 * Blank (or whitespace) is NULL, not 0 — see the file header. Anything that
 * isn't a number is also NULL rather than 0, because a typo must not quietly
 * become a free consultation.
 */
function readMoney(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

/** Stored value → what shows in the box. NULL renders empty, 0 renders "0". */
function writeMoney(v: number | null): string {
    return v === null || v === undefined ? "" : String(v);
}

/** A money box with a ₹ glyph inside it — the glyph is decoration, the input
 *  itself is a plain number field so a phone keyboard opens numeric. */
function MoneyField({
    id, label, value, placeholder, onChange,
}: {
    id: string;
    label: string;
    value: string;
    placeholder?: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-[5px]">
            <label htmlFor={id} className="text-[11px] font-semibold text-[var(--cs-muted)]">{label}</label>
            <div className="relative">
                <IndianRupee
                    size={12}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]"
                />
                <input
                    id={id}
                    type="number"
                    min={0}
                    step={10}
                    inputMode="numeric"
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${INPUT_CLASS} pl-[28px]!`}
                />
            </div>
        </div>
    );
}

/** A switch row: label, one-line explanation, and the control on the right. */
function ToggleRow({
    id, label, hint, checked, onChange,
}: {
    id: string;
    label: string;
    hint: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-center gap-[12px] rounded-[10px] border border-[var(--cs-line)] bg-[rgba(248,250,252,0.7)] px-[12px] py-[9px]">
            <div className="flex min-w-0 flex-col gap-[1px]">
                <label htmlFor={id} className="cursor-pointer text-[12px]! font-semibold text-[var(--cs-ink)]">
                    {label}
                </label>
                <span className="text-[10.5px] font-normal leading-[1.4] text-[var(--cs-faint)]">{hint}</span>
            </div>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={() => onChange(!checked)}
                className={
                    "ml-auto flex h-[22px] w-[38px] flex-none cursor-pointer items-center rounded-full border-0 p-[2px] " +
                    "outline-none transition-colors focus-visible:shadow-[0_0_0_3px_var(--cs-violet-soft)] " +
                    (checked ? "bg-[var(--cs-violet)]" : "bg-[#cbd5e1]")
                }
            >
                <span
                    className={
                        "h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(16,28,46,0.25)] " +
                        "transition-transform " + (checked ? "translate-x-[16px]" : "translate-x-0")
                    }
                />
            </button>
        </div>
    );
}

export function FeesModal({
    hospitalId, policy, doctors, onClose, onSaved,
}: {
    hospitalId: string;
    policy: BillingPolicy;
    doctors: DoctorFee[];
    onClose: () => void;
    /** Fires after every write succeeds, so the page can refetch once. */
    onSaved: () => void;
}) {
    // One editable copy of every fee, keyed by doctor id. Held as strings
    // because that is what an input carries — converting on save (once, in
    // `readMoney`) rather than on every keystroke means a half-typed "12" on
    // the way to "120" never round-trips through a number and back.
    const [fees, setFees] = useState<Record<string, { consult: string; followUp: string }>>(() =>
        Object.fromEntries(doctors.map((d) => [
            d.id,
            { consult: writeMoney(d.consultationFee), followUp: writeMoney(d.followUpFee) },
        ]))
    );
    const [gstEnabled, setGstEnabled] = useState(policy.gstEnabled);
    const [gstPercent, setGstPercent] = useState(String(policy.gstPercent));
    const [allowDiscount, setAllowDiscount] = useState(policy.allowDiscount);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const feesDirty = doctors.some((d) => {
        const row = fees[d.id];
        return row.consult !== writeMoney(d.consultationFee) || row.followUp !== writeMoney(d.followUpFee);
    });
    const dirty =
        feesDirty ||
        gstEnabled !== policy.gstEnabled ||
        allowDiscount !== policy.allowDiscount ||
        Number(gstPercent) !== policy.gstPercent;

    const percentInvalid = gstEnabled && !(Number(gstPercent) >= 0 && Number(gstPercent) <= 100);

    const submit = async () => {
        if (busy || percentInvalid) return;
        setBusy(true);
        setError(null);
        try {
            // Policy first, then fees. If a fee write fails halfway the policy
            // is already correct and the owner can retry the fees — the
            // reverse order would leave fees set under a policy that never
            // saved, which is the more confusing half-state of the two.
            await updateBillingPolicy(hospitalId, {
                gstEnabled,
                gstPercent: Number(gstPercent),
                allowDiscount,
            });

            // Only the doctors whose numbers actually changed. A clinic with
            // one doctor should not issue eleven no-op UPDATEs.
            const changed = doctors.filter((d) => {
                const row = fees[d.id];
                return row.consult !== writeMoney(d.consultationFee) || row.followUp !== writeMoney(d.followUpFee);
            });
            for (const d of changed) {
                await updateDoctorFees(d.id, {
                    consultationFee: readMoney(fees[d.id].consult),
                    followUpFee: readMoney(fees[d.id].followUp),
                });
            }

            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save fees.");
            setBusy(false);
        }
    };

    return (
        <PracticeModal
            accent="violet"
            icon={<IndianRupee size={15} />}
            eyebrow="Clinic billing"
            title="Consultation fees"
            onClose={onClose}
            wide
            dirty={dirty}
            footer={
                <>
                    <button type="button" className="prac-modal-btn is-ghost" onClick={onClose}>Cancel</button>
                    <button
                        type="button"
                        className="prac-modal-btn is-primary"
                        disabled={!dirty || busy || percentInvalid}
                        onClick={submit}
                    >
                        {busy ? "Saving…" : "Save fees"}
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-[16px]">

                {/* ── What each doctor charges ─────────────────────────── */}
                <section className="flex flex-col gap-[9px]">
                    <div className="flex flex-col gap-[2px]">
                        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cs-ink)]">
                            What each doctor charges
                        </span>
                        <FormNote>
                            Leave a box empty if you don't charge a set fee — front desk will simply
                            show no amount. Enter <strong>0</strong> only for a genuinely free consultation.
                        </FormNote>
                    </div>

                    {doctors.length === 0 ? (
                        <FormNote>No doctors on file for this clinic yet.</FormNote>
                    ) : (
                        <div className="flex flex-col gap-[12px]">
                            {doctors.map((d) => (
                                <div
                                    key={d.id}
                                    className="rounded-[11px] border border-[var(--cs-line)] bg-[var(--cs-card)] px-[12px] py-[10px]"
                                >
                                    <div className="mb-[8px] flex min-w-0 flex-col gap-[1px]">
                                        <span className="truncate text-[12.5px] font-semibold text-[var(--cs-ink)]">
                                            {d.name}
                                        </span>
                                        {d.specialization && (
                                            <span className="text-[10.5px] text-[var(--cs-faint)]">{d.specialization}</span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-[9px]">
                                        <MoneyField
                                            id={`fee-consult-${d.id}`}
                                            label="Consultation"
                                            placeholder="Not set"
                                            value={fees[d.id]?.consult ?? ""}
                                            onChange={(v) => setFees((f) => ({ ...f, [d.id]: { ...f[d.id], consult: v } }))}
                                        />
                                        <MoneyField
                                            id={`fee-followup-${d.id}`}
                                            label="Follow-up"
                                            placeholder="Same as above"
                                            value={fees[d.id]?.followUp ?? ""}
                                            onChange={(v) => setFees((f) => ({ ...f, [d.id]: { ...f[d.id], followUp: v } }))}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* ── Clinic policy ────────────────────────────────────── */}
                <section className="flex flex-col gap-[9px]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--cs-ink)]">
                        Clinic policy
                    </span>

                    <ToggleRow
                        id="fees-gst"
                        label="Add GST to the fee"
                        hint="Only turn this on if your clinic has a GSTIN."
                        checked={gstEnabled}
                        onChange={setGstEnabled}
                    />

                    {gstEnabled && (
                        <div className="flex flex-col gap-[5px] pl-[12px]">
                            <label htmlFor="fees-gst-pct" className="text-[11px] font-semibold text-[var(--cs-muted)]">
                                GST rate
                            </label>
                            <div className="relative w-[140px]">
                                <Percent
                                    size={12}
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 text-[var(--cs-faint)]"
                                />
                                <input
                                    id="fees-gst-pct"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    inputMode="decimal"
                                    value={gstPercent}
                                    onChange={(e) => setGstPercent(e.target.value)}
                                    className={`${INPUT_CLASS} pr-[28px]!`}
                                />
                            </div>
                            {percentInvalid && <FormError message="Enter a rate between 0 and 100." />}
                        </div>
                    )}

                    <ToggleRow
                        id="fees-discount"
                        label="Allow a discount at the desk"
                        hint="Front desk can reduce the fee when collecting."
                        checked={allowDiscount}
                        onChange={setAllowDiscount}
                    />
                </section>

                {error && <FormError message={error} />}
            </div>
        </PracticeModal>
    );
}
