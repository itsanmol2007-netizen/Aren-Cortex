// ---------------------------------------------------------------------------
// EXERCISE SHEET — the dose, set once, at the moment of prescribing.
//
// An exercise used to land on the programme with a default 3 × 10 and every
// other choice hidden on a hover-only row, so "Add" read as the whole
// interaction. This is the same staging step medicines and interventions
// have: side, sets × reps (or a timed hold), how often — and behind
// "+ More details", load, days a week, how many weeks, and cues.
//
// Starts from the clinic's own default for this exercise (Practice →
// Exercise Library) when one is saved, else from `doseFor`. "Make this the
// clinic default" writes back to that library, so a physio's usual dose is
// set once, not on every patient.
// ---------------------------------------------------------------------------

import { Activity, Check, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "../features/consult/DetailInput";
import { doseFor, exerciseName, formatLine, type ExerciseDraft, type ExerciseSide } from "../features/consult/exercisePlan";
import { useOverlayFocus } from "../hooks/useOverlayFocus";

function Stepper({
    label, value, onChange, unit, min = 0, max = 999, step = 1,
}: {
    label: string;
    value: number | null;
    onChange: (v: number | null) => void;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
}) {
    const bump = (d: number) => {
        const next = Math.min(max, Math.max(min, (value ?? 0) + d));
        onChange(next === 0 && min === 0 ? null : next);
    };
    return (
        <span className="cs-step">
            <button type="button" aria-label={`Less ${label}`} onClick={() => bump(-step)} disabled={(value ?? 0) <= min}>
                <Minus size={13} />
            </button>
            <input
                type="text"
                inputMode="decimal"
                aria-label={label}
                value={value ?? ""}
                placeholder="—"
                onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d.]/g, "");
                    onChange(raw === "" ? null : Math.min(max, Number(raw)));
                }}
            />
            <button type="button" aria-label={`More ${label}`} onClick={() => bump(step)} disabled={(value ?? 0) >= max}>
                <Plus size={13} />
            </button>
            {unit && <em>{unit}</em>}
        </span>
    );
}

export function ExerciseSheet({
    label, editing, initial, clinicDefault, canSaveDefault, onConfirm, onCancel,
}: {
    label: string;
    editing: boolean;
    /** the line's current values, when editing */
    initial: ExerciseDraft | null;
    /** this clinic's saved default dose for the exercise, if any */
    clinicDefault: Partial<ExerciseDraft> | null;
    /** whether "make this the clinic default" can be offered */
    canSaveDefault: boolean;
    onConfirm: (draft: ExerciseDraft, saveAsDefault: boolean) => void;
    onCancel: () => void;
}) {
    const [d, setD] = useState<ExerciseDraft>(() => initial ?? {
        side: null,
        ...doseFor(label),
        ...(clinicDefault ?? {}),
        loadKg: clinicDefault?.loadKg ?? null,
        daysPerWeek: clinicDefault?.daysPerWeek ?? null,
        weeks: clinicDefault?.weeks ?? null,
        notes: clinicDefault?.notes ?? "",
    });
    const [showMore, setShowMore] = useState(
        !!initial && (initial.loadKg != null || initial.daysPerWeek != null || initial.weeks != null || !!initial.notes),
    );
    const [saveDefault, setSaveDefault] = useState(false);
    const isHold = d.holdSeconds != null && d.reps == null;
    const set = (patch: Partial<ExerciseDraft>) => setD((cur) => ({ ...cur, ...patch }));

    const draft = (): ExerciseDraft => ({ ...d, notes: d.notes.trim() });
    const preview = formatLine({ ...draft(), id: "", intentId: null, label, sortOrder: 0 });

    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
            if (e.key === "Enter") {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "TEXTAREA" || tag === "INPUT" || tag === "BUTTON") return;
                e.preventDefault();
                onConfirm(draft(), saveDefault);
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    return (
        <div className="cs-addmed" role="dialog" aria-modal="true" aria-label={`Prescribe ${label}`}>
            <div className="cs-addmed-scrim" aria-hidden="true" />
            <div className="cs-addmed-panel cs-addmed-anat is-compact cs-ex-sheet" ref={panelRef} tabIndex={-1}>
                <div className="cs-addmed-topstripe" />
                <div className="cs-addmed-head">
                    <span className="cs-glyph is-teal"><Activity size={16} /></span>
                    <div className="cs-addmed-title">
                        <span className="cs-addmed-eyebrow">{editing ? "Edit exercise" : "Prescribe exercise"}</span>
                        <strong>{exerciseName(label)}</strong>
                    </div>
                    <button className="cs-addmed-x" type="button" onClick={onCancel} aria-label="Cancel">
                        <X size={16} />
                    </button>
                </div>

                <div className="cs-addmed-body">
                    <div className="cs-dx-field">
                        <span className="cs-dx-fieldlabel">Side</span>
                        <Segmented
                            label="Side"
                            options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }, { value: "both", label: "Both" }]}
                            value={d.side ?? undefined}
                            onChange={(v) => set({ side: (v as ExerciseSide | undefined) ?? null })}
                        />
                    </div>

                    <div className="cs-dx-field">
                        <span className="cs-dx-fieldlabel">Dose</span>
                        <div className="cs-ex-doserow">
                            <Stepper label="Sets" value={d.sets} onChange={(v) => set({ sets: v })} unit="sets" max={20} />
                            <span className="cs-ex-times">×</span>
                            <Stepper
                                label={isHold ? "Hold seconds" : "Reps"}
                                value={isHold ? d.holdSeconds : d.reps}
                                onChange={(v) => set(isHold ? { holdSeconds: v } : { reps: v })}
                                max={isHold ? 600 : 200}
                                step={isHold ? 5 : 1}
                            />
                            <Segmented
                                label="Reps or hold"
                                options={[{ value: "reps" }, { value: "hold", label: "sec hold" }]}
                                value={isHold ? "hold" : "reps"}
                                onChange={(v) => {
                                    if (v === "hold" && !isHold) set({ holdSeconds: d.reps ?? 10, reps: null });
                                    if (v === "reps" && isHold) set({ reps: 10, holdSeconds: null });
                                }}
                            />
                        </div>
                    </div>

                    <div className="cs-dx-field">
                        <span className="cs-dx-fieldlabel">How often</span>
                        <Stepper label="Times a day" value={d.perDay} onChange={(v) => set({ perDay: v })} unit="× a day" max={10} />
                    </div>

                    {showMore ? (
                        <>
                            <div className="cs-ex-moregrid">
                                <div className="cs-dx-field">
                                    <span className="cs-dx-fieldlabel">Days a week</span>
                                    <Stepper label="Days a week" value={d.daysPerWeek ?? null} onChange={(v) => set({ daysPerWeek: v })} max={7} />
                                </div>
                                <div className="cs-dx-field">
                                    <span className="cs-dx-fieldlabel">For</span>
                                    <Stepper label="Weeks" value={d.weeks ?? null} onChange={(v) => set({ weeks: v })} unit="weeks" max={52} />
                                </div>
                                <div className="cs-dx-field">
                                    <span className="cs-dx-fieldlabel">Load</span>
                                    <Stepper label="Load in kg" value={d.loadKg ?? null} onChange={(v) => set({ loadKg: v })} unit="kg" max={100} step={0.5} />
                                </div>
                            </div>
                            <div className="cs-dx-field">
                                <span className="cs-dx-fieldlabel">Cues</span>
                                <textarea
                                    className="cs-addmed-input cs-addmed-textarea"
                                    rows={2}
                                    value={d.notes}
                                    placeholder="e.g. slow, pain-free range; stop if pain above 3/10"
                                    onChange={(e) => set({ notes: e.target.value })}
                                />
                            </div>
                        </>
                    ) : (
                        <button type="button" className="cs-dx-adddetails" onClick={() => setShowMore(true)}>
                            <Plus size={14} /> More details
                        </button>
                    )}

                    {canSaveDefault && !editing && (
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={saveDefault}
                            className={`cs-dx-check${saveDefault ? " is-on" : ""}`}
                            onClick={() => setSaveDefault((v) => !v)}
                        >
                            <span className="cs-dx-checkbox" aria-hidden="true">{saveDefault && <Check size={11} />}</span>
                            Make this the clinic's usual dose for this exercise
                        </button>
                    )}
                </div>

                <div className="cs-dx-preview" aria-live="polite">
                    <span>Will record</span>
                    <b>{preview}</b>
                </div>

                <div className="cs-addmed-foot">
                    <button className="cs-addmed-cancel" type="button" onClick={onCancel}>Cancel</button>
                    <button className="cs-addmed-confirm" type="button" onClick={() => onConfirm(draft(), saveDefault)}>
                        <Check size={15} />
                        {editing ? "Save" : "Add to programme"}
                        <span className="cs-kbd">Enter</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
