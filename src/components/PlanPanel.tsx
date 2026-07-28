import { useState } from "react";
import { CalendarClock, ClipboardList, Crosshair, FileText, FlaskConical, NotebookPen, Pill } from "lucide-react";
import type { PrescriptionMedicine } from "../types";
import { freqLabelToKeys, keysToFreqLabel } from "../lib/db";

const SLOTS = [
    { key: "M", label: "Morn" },
    { key: "A", label: "Noon" },
    { key: "E", label: "Eve" },
    { key: "N", label: "Night" },
];

/**
 * Dose, frequency and duration, edited on the line itself.
 *
 * These three are the whole of a routine edit, and sending the doctor to a
 * modal for them meant every prescription cost a dialog. The modal survives for
 * notes and clinical context, one button away.
 *
 * Frequency derives from the shared slot map, so what these buttons show and
 * what the prescription stores cannot drift apart (lib/db/reference.ts).
 */
function DoseEditor({
    medicine, onUpdate, onMore,
}: {
    medicine: PrescriptionMedicine;
    onUpdate: (m: PrescriptionMedicine) => void;
    onMore: () => void;
}) {
    const slots = freqLabelToKeys(medicine.frequency);
    const days = parseInt(medicine.duration, 10);
    const dayCount = Number.isFinite(days) ? days : 5;

    const setDays = (n: number) =>
        onUpdate({ ...medicine, duration: `${Math.max(1, Math.min(90, n))} days` });

    return (
        <div className="cx-dose" onClick={(e) => e.stopPropagation()}>
            <div className="cx-dose-row">
                <label className="cx-dose-field">
                    <span>Dose</span>
                    <input
                        value={medicine.dosage}
                        placeholder="1 tab"
                        onChange={(e) => onUpdate({ ...medicine, dosage: e.target.value })}
                    />
                </label>

                <div className="cx-dose-field">
                    <span>Days</span>
                    <div className="cx-stepper">
                        <button type="button" onClick={() => setDays(dayCount - 1)} aria-label="Fewer days">−</button>
                        <b>{dayCount}</b>
                        <button type="button" onClick={() => setDays(dayCount + 1)} aria-label="More days">+</button>
                    </div>
                </div>
            </div>

            <div className="cx-dose-field">
                <span>When</span>
                <div className="cx-slots">
                    {SLOTS.map((s) => {
                        const on = slots.includes(s.key);
                        return (
                            <button
                                key={s.key}
                                type="button"
                                className="cx-slot"
                                aria-pressed={on}
                                title={s.label}
                                onClick={() =>
                                    onUpdate({
                                        ...medicine,
                                        frequency: keysToFreqLabel(
                                            on ? slots.filter((k) => k !== s.key) : [...slots, s.key]
                                        ),
                                    })
                                }
                            >{s.key}</button>
                        );
                    })}
                    <button
                        type="button"
                        className={`cx-slot is-sos${medicine.is_sos ? " is-on" : ""}`}
                        aria-pressed={!!medicine.is_sos}
                        title="Only when needed"
                        onClick={() => onUpdate({ ...medicine, is_sos: !medicine.is_sos })}
                    >SOS</button>
                </div>
            </div>

            <button type="button" className="cx-dose-more" onClick={onMore}>
                Notes &amp; details…
            </button>
        </div>
    );
}

/**
 * PLAN — the right column of the redesigned workspace, and the live
 * prescription itself.
 *
 * Everything the doctor has decided to issue this consult, in the order it
 * prints: medicines, investigations, advice & referrals, follow-up. What this
 * column shows is exactly what `saveConsult` writes — there is no hidden
 * state between here and the Rx, which is why it replaces both the old
 * SelectedMedicinesBar (medicines under the suggestions) and PreviewPanel
 * (tests in a far-right sliver).
 *
 * Clicking a medicine line opens the MedicineInspector for dosage; removal
 * releases the accepted intent upstream (App owns that bookkeeping — an
 * accept the doctor took back must not reach the decision log).
 */

const FOLLOW_UP_CHOICES = [3, 5, 7, 14];

interface Props {
    /** impressions the doctor agreed with — the working diagnosis */
    diagnoses: string[];
    onRemoveDiagnosis: (label: string) => void;
    prescription: PrescriptionMedicine[];
    selectedMedicineId: string | null;
    /** opens the full editor (notes, clinical context) */
    onSelectMedicine: (id: string) => void;
    onUpdateMedicine: (m: PrescriptionMedicine) => void;
    onRemoveMedicine: (id: string) => void;
    tests: string[];
    onRemoveTest: (label: string) => void;
    adviceLines: string[];
    onRemoveAdviceLine: (line: string) => void;
    followUpDays: number | null;
    onFollowUpChange: (days: number | null) => void;
    onReviewRx: () => void;
    /** the third Tab stop — the keyboard hook focuses the first line inside */
    panelRef?: React.RefObject<HTMLElement>;
    onShowShortcuts: () => void;
}

export function PlanPanel({
    diagnoses, onRemoveDiagnosis,
    prescription, selectedMedicineId, onSelectMedicine, onUpdateMedicine, onRemoveMedicine,
    tests, onRemoveTest,
    adviceLines, onRemoveAdviceLine,
    followUpDays, onFollowUpChange,
    onReviewRx, panelRef, onShowShortcuts,
}: Props) {
    /** which line is open for editing, inline */
    const [openId, setOpenId] = useState<string | null>(selectedMedicineId);

    const isEmpty =
        diagnoses.length === 0 && prescription.length === 0 &&
        tests.length === 0 && adviceLines.length === 0;

    const summary = [
        prescription.length > 0 && `${prescription.length} medicine${prescription.length === 1 ? "" : "s"}`,
        tests.length > 0 && `${tests.length} test${tests.length === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" · ");

    return (
        <aside className="cx-panel cx-plan" aria-label="Plan" ref={panelRef}>
            <div className="cx-plan-head">
                <h2 className="cx-plan-title">Plan</h2>
                {summary && <span className="cx-plan-sum">{summary}</span>}
            </div>

            <div className="cx-plan-scroll">
                {isEmpty ? (
                    <div className="cx-empty">
                        <span className="cx-empty-mark"><ClipboardList size={15} /></span>
                        <span className="cx-empty-title">Nothing planned yet</span>
                        <span className="cx-empty-sub">
                            Everything you take from the suggestions — medicines, tests,
                            advice — builds the prescription here.
                        </span>
                    </div>
                ) : (
                    <>
                        {diagnoses.length > 0 && (
                            <section aria-label="Diagnosis">
                                <div className="cx-sec-label"><Crosshair size={11} /> Diagnosis</div>
                                {diagnoses.map((dx) => (
                                    <div key={dx} className="cx-line is-dx">
                                        <div className="cx-line-main">
                                            <div className="cx-line-name"><span>{dx}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cx-x"
                                            aria-label={`Remove ${dx}`}
                                            onClick={() => onRemoveDiagnosis(dx)}
                                        >×</button>
                                    </div>
                                ))}
                            </section>
                        )}

                        {prescription.length > 0 && (
                            <section aria-label="Medicines">
                                <div className="cx-sec-label"><Pill size={11} /> Medicines</div>
                                {prescription.map((m) => (
                                    <div
                                        key={m.id}
                                        className={`cx-line is-click${openId === m.id ? " is-active" : ""}`}
                                    >
                                        <div
                                            className="cx-line-main"
                                            data-cx-planline=""
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={openId === m.id}
                                            onClick={() => setOpenId(openId === m.id ? null : m.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    setOpenId(openId === m.id ? null : m.id);
                                                }
                                            }}
                                        >
                                            <div className="cx-line-name">
                                                <span>{m.name}</span>
                                                {m.is_sos && <span className="cx-pill sos">SOS</span>}
                                            </div>
                                            {m.composition && m.composition !== m.name && (
                                                <div className="cx-line-sub">{m.composition}</div>
                                            )}
                                            <div className="cx-line-meta">
                                                {m.dosage && <span className="cx-pill">{m.dosage}</span>}
                                                {m.frequency && <span className="cx-pill">{m.frequency}</span>}
                                                {m.duration && <span className="cx-pill">{m.duration}</span>}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cx-x"
                                            aria-label={`Remove ${m.name}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveMedicine(m.id); }}
                                        >×</button>

                                        {openId === m.id && (
                                            <DoseEditor
                                                medicine={m}
                                                onUpdate={onUpdateMedicine}
                                                onMore={() => onSelectMedicine(m.id)}
                                            />
                                        )}
                                    </div>
                                ))}
                            </section>
                        )}

                        {tests.length > 0 && (
                            <section aria-label="Investigations">
                                <div className="cx-sec-label"><FlaskConical size={11} /> Investigations</div>
                                {tests.map((t) => (
                                    <div key={t} className="cx-line is-plain">
                                        <div className="cx-line-main">
                                            <div className="cx-line-name"><span>{t}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cx-x"
                                            aria-label={`Remove ${t}`}
                                            onClick={() => onRemoveTest(t)}
                                        >×</button>
                                    </div>
                                ))}
                            </section>
                        )}

                        {adviceLines.length > 0 && (
                            <section aria-label="Advice and referrals">
                                <div className="cx-sec-label"><NotebookPen size={11} /> Advice &amp; referrals</div>
                                {adviceLines.map((line) => (
                                    <div key={line} className="cx-line is-plain">
                                        <div className="cx-line-main">
                                            <div className="cx-line-name"><span>{line}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cx-x"
                                            aria-label={`Remove ${line}`}
                                            onClick={() => onRemoveAdviceLine(line)}
                                        >×</button>
                                    </div>
                                ))}
                            </section>
                        )}

                        <section aria-label="Follow-up">
                            <div className="cx-sec-label"><CalendarClock size={11} /> Follow-up</div>
                            <div className="cx-followup">
                                <button
                                    type="button"
                                    className="cx-chip-toggle"
                                    aria-pressed={followUpDays == null}
                                    onClick={() => onFollowUpChange(null)}
                                >None</button>
                                {FOLLOW_UP_CHOICES.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        className="cx-chip-toggle"
                                        aria-pressed={followUpDays === d}
                                        onClick={() => onFollowUpChange(followUpDays === d ? null : d)}
                                    >{d} days</button>
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>

            <div className="cx-plan-foot">
                <button
                    type="button"
                    className="cx-review"
                    disabled={isEmpty}
                    onClick={onReviewRx}
                >
                    <FileText size={15} />
                    Review Prescription
                    <kbd>Ctrl ↵</kbd>
                </button>
                <button type="button" className="cx-keys-hint" onClick={onShowShortcuts}>
                    Press <kbd>?</kbd> for keyboard shortcuts
                </button>
            </div>
        </aside>
    );
}
