// ---------------------------------------------------------------------------
// CONSULTATION PLAN — the destination of the consultation.
//
// Not merely a prescription: it represents today's clinical decisions, grouped
// by recommendation type. The structure is identical for every specialty; only
// the content changes.
//
// What this column shows is exactly what `saveConsult` writes. There is no
// hidden state between here and the Rx.
//
// The companion slot lives here, and only here: a suggestion that a medicine
// travels with another belongs directly beneath the medicine that triggered it,
// never in a section of its own.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
    CalendarClock, ClipboardList, FileText, FlaskConical, NotebookPen, Pill,
    Printer, Stethoscope,
} from "lucide-react";
import type { PrescriptionMedicine } from "../../types";
import type { CompanionSuggestion } from "../../lib/synapse/companions";
import { freqLabelToKeys, keysToFreqLabel } from "../../lib/db";
import { CompanionLine, MedicineIdentity } from "./parts";

const SLOTS = [
    { key: "M", label: "Morning" },
    { key: "A", label: "Noon" },
    { key: "E", label: "Evening" },
    { key: "N", label: "Night" },
];

const FOLLOW_UP_CHOICES = [3, 5, 7, 14];

/**
 * Dose, frequency and duration, edited on the line itself.
 *
 * These three are the whole of a routine edit, and sending the doctor to a
 * modal for them meant every prescription cost a dialog. The modal survives for
 * notes and clinical context, one button away.
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
        <div className="cs-dose" onClick={(e) => e.stopPropagation()}>
            <div className="cs-dose-row">
                <label className="cs-dose-field">
                    <span>Dose</span>
                    <input
                        value={medicine.dosage}
                        placeholder="1 tab"
                        onChange={(e) => onUpdate({ ...medicine, dosage: e.target.value })}
                    />
                </label>
                <div className="cs-dose-field">
                    <span>Days</span>
                    <div className="cs-stepper">
                        <button type="button" onClick={() => setDays(dayCount - 1)} aria-label="Fewer days">−</button>
                        <b>{dayCount}</b>
                        <button type="button" onClick={() => setDays(dayCount + 1)} aria-label="More days">+</button>
                    </div>
                </div>
            </div>

            <div className="cs-dose-field">
                <span>When</span>
                <div className="cs-slots">
                    {SLOTS.map((s) => {
                        const on = slots.includes(s.key);
                        return (
                            <button
                                key={s.key}
                                type="button"
                                className="cs-slot"
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
                        className={`cs-slot is-sos${medicine.is_sos ? " is-on" : ""}`}
                        aria-pressed={!!medicine.is_sos}
                        title="Only when needed"
                        onClick={() => onUpdate({ ...medicine, is_sos: !medicine.is_sos })}
                    >SOS</button>
                </div>
            </div>

            <button type="button" className="cs-dose-more" onClick={onMore}>
                Notes &amp; details…
            </button>
        </div>
    );
}

function Group({
    icon, tone, title, count, onAdd, children,
}: {
    icon: React.ReactNode;
    tone: "blue" | "teal" | "rose" | "slate";
    title: string;
    count?: number;
    onAdd?: () => void;
    children: React.ReactNode;
}) {
    return (
        <section aria-label={title}>
            <div className="cs-group-head">
                <span className={`cs-glyph is-${tone}`}>{icon}</span>
                <span className="cs-group-title">
                    {title}{count != null && ` (${count})`}
                </span>
                {onAdd && (
                    <button type="button" className="cs-group-add" onClick={onAdd}>+ Add</button>
                )}
            </div>
            {children}
        </section>
    );
}

interface Props {
    diagnoses: string[];
    onRemoveDiagnosis: (label: string) => void;
    prescription: PrescriptionMedicine[];
    onSelectMedicine: (id: string) => void;
    onUpdateMedicine: (m: PrescriptionMedicine) => void;
    onRemoveMedicine: (id: string) => void;
    tests: string[];
    onRemoveTest: (label: string) => void;
    adviceLines: string[];
    onRemoveAdviceLine: (line: string) => void;
    followUpDays: number | null;
    onFollowUpChange: (days: number | null) => void;
    notes: string;
    onNotesChange: (v: string) => void;
    /**
     * Companions for one medicine already on the plan. The panel asks per line
     * rather than receiving a flat list, because the whole point of the slot is
     * that a suggestion belongs to the medicine that triggered it — a list the
     * panel had to match up itself would be one mismatched key away from
     * offering a PPI under the wrong drug.
     */
    companionsFor: (intentId: number) => CompanionSuggestion[];
    onAddCompanion: (c: CompanionSuggestion) => void;
    onDismissCompanion: (companionIntentId: number) => void;
    /** jumps focus to the matching picker/search — the "+ Add" affordances */
    onAddMedicine: () => void;
    onAddTest: () => void;
    onReviewRx: () => void;
    onPrint: () => void;
    panelRef?: React.RefObject<HTMLElement>;
}

export function PlanCard({
    diagnoses, onRemoveDiagnosis,
    prescription, onSelectMedicine, onUpdateMedicine, onRemoveMedicine,
    tests, onRemoveTest,
    adviceLines, onRemoveAdviceLine,
    followUpDays, onFollowUpChange,
    notes, onNotesChange,
    companionsFor, onAddCompanion, onDismissCompanion,
    onAddMedicine, onAddTest, onReviewRx, onPrint, panelRef,
}: Props) {
    const [openId, setOpenId] = useState<string | null>(null);

    const itemCount =
        diagnoses.length + prescription.length + tests.length + adviceLines.length +
        (followUpDays != null ? 1 : 0);

    const isEmpty = itemCount === 0;

    return (
        <aside className="cs-card cs-plan" aria-label="Consultation plan" ref={panelRef}>
            <div className="cs-plan-head">
                <h2 className="cs-card-title">Consultation Plan</h2>
                <span className="cs-count is-quiet">
                    {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
            </div>

            <div className="cs-plan-scroll">
                {isEmpty ? (
                    <div className="cs-plan-empty">
                        <ClipboardList size={18} style={{ margin: "0 auto 4px", opacity: 0.35 }} />
                        <strong>Nothing planned yet</strong>
                        <span>
                            Everything you take from the recommendations — medicines, tests,
                            advice — builds the prescription here.
                        </span>
                    </div>
                ) : (
                    <>
                        {diagnoses.length > 0 && (
                            <Group icon={<Stethoscope size={12} />} tone="rose" title="Diagnosis" count={diagnoses.length}>
                                {diagnoses.map((dx) => (
                                    <div key={dx} className="cs-line">
                                        <div className="cs-line-main">
                                            <div className="cs-line-name"><span>{dx}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${dx}`}
                                            onClick={() => onRemoveDiagnosis(dx)}
                                        >×</button>
                                    </div>
                                ))}
                            </Group>
                        )}

                        <Group
                            icon={<Pill size={12} />}
                            tone="teal"
                            title="Medicines"
                            count={prescription.length}
                            onAdd={onAddMedicine}
                        >
                            {prescription.map((m) => {
                                // Companions attach to the RANKED intent, so a line with
                                // no intent — a Repeat Rx import, never ranked this
                                // consult — simply has none. That is correct, not a gap.
                                const companions =
                                    m.intent_id != null ? companionsFor(m.intent_id) : [];

                                return (
                                    <div
                                        key={m.id}
                                        className={`cs-line is-click${openId === m.id ? " is-active" : ""}`}
                                    >
                                        <div
                                            className="cs-line-main"
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
                                            <div className="cs-line-name">
                                                {/* Brand over composition, the same two lines the
                                                    recommendations and the print use. */}
                                                <MedicineIdentity
                                                    brand={m.name}
                                                    composition={m.composition || m.name}
                                                />
                                                {m.is_sos && <span className="cs-pill is-sos">SOS</span>}
                                            </div>
                                            <div className="cs-line-sub">
                                                {[m.dosage, m.frequency, m.duration, m.notes]
                                                    .filter(Boolean).join(" • ")}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${m.name}`}
                                            onClick={(e) => { e.stopPropagation(); onRemoveMedicine(m.id); }}
                                        >×</button>

                                        {openId === m.id && (
                                            <div style={{ gridColumn: "1 / -1" }}>
                                                <DoseEditor
                                                    medicine={m}
                                                    onUpdate={onUpdateMedicine}
                                                    onMore={() => onSelectMedicine(m.id)}
                                                />
                                            </div>
                                        )}

                                        {companions.length > 0 && (
                                            <div className="cs-comp-slot">
                                                {companions.map((c) => (
                                                    <CompanionLine
                                                        key={c.companionIntentId}
                                                        suggestion={c}
                                                        onAdd={() => onAddCompanion(c)}
                                                        onDismiss={() => onDismissCompanion(c.companionIntentId)}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </Group>

                        <Group
                            icon={<FlaskConical size={12} />}
                            tone="blue"
                            title="Investigations"
                            count={tests.length}
                            onAdd={onAddTest}
                        >
                            {tests.map((t) => (
                                <div key={t} className="cs-line">
                                    <div className="cs-line-main">
                                        <div className="cs-line-name"><span>{t}</span></div>
                                    </div>
                                    <button
                                        type="button"
                                        className="cs-x"
                                        aria-label={`Remove ${t}`}
                                        onClick={() => onRemoveTest(t)}
                                    >×</button>
                                </div>
                            ))}
                        </Group>

                        {adviceLines.length > 0 && (
                            <Group
                                icon={<NotebookPen size={12} />}
                                tone="slate"
                                title="Advice"
                                count={adviceLines.length}
                            >
                                {adviceLines.map((line) => (
                                    <div key={line} className="cs-line">
                                        <div className="cs-line-main">
                                            <div className="cs-line-name"><span>{line}</span></div>
                                        </div>
                                        <button
                                            type="button"
                                            className="cs-x"
                                            aria-label={`Remove ${line}`}
                                            onClick={() => onRemoveAdviceLine(line)}
                                        >×</button>
                                    </div>
                                ))}
                            </Group>
                        )}

                        <Group icon={<CalendarClock size={12} />} tone="slate" title="Follow up">
                            <div className="cs-followup">
                                <button
                                    type="button"
                                    className="cs-toggle"
                                    aria-pressed={followUpDays == null}
                                    onClick={() => onFollowUpChange(null)}
                                >None</button>
                                {FOLLOW_UP_CHOICES.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        className="cs-toggle"
                                        aria-pressed={followUpDays === d}
                                        onClick={() => onFollowUpChange(followUpDays === d ? null : d)}
                                    >{d} days</button>
                                ))}
                            </div>
                        </Group>
                    </>
                )}
            </div>

            <div className="cs-plan-foot">
                <textarea
                    className="cs-notes"
                    value={notes}
                    placeholder="Add notes for this visit…"
                    onChange={(e) => onNotesChange(e.target.value)}
                    aria-label="Notes for this visit"
                />
                <div className="cs-plan-actions">
                    <button
                        type="button"
                        className="cs-print"
                        onClick={onPrint}
                        disabled={isEmpty}
                        aria-label="Print"
                        title="Print"
                    >
                        <Printer size={17} />
                    </button>
                    <button
                        type="button"
                        className="cs-review"
                        disabled={isEmpty}
                        onClick={onReviewRx}
                    >
                        <FileText size={15} />
                        Review &amp; Print
                        <span className="cs-kbd">Ctrl P</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
