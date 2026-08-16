// ---------------------------------------------------------------------------
// CARE PLAN SHEET — start, adjust or close a course of treatment.
//
// `cortex-longitudinal-spec.md` §3.3 asks for the smallest thing that works:
// "stated goal, expected number of visits or expected end point, current
// position in that sequence... It does not need to be elaborate. It needs to
// exist, persist, and be visible."
//
// So this is five fields and three buttons, and the restraint is deliberate
// rather than a first cut. Every field a care plan asks for is a field the
// doctor fills in during a consultation, and the product's whole thesis is
// removing those. Goal is the only required one.
//
// ── Closing is a first-class action, not a delete
//
// The spec's §6 names the failure directly: "A doctor may abandon or change a
// plan mid-course. The plan must be editable and closable without leaving a
// stale 'session 4 of 12' showing forever." Close is therefore on the same
// screen as Save, not hidden behind a menu, and it is worded as finishing
// rather than as destroying — the record of a course that was abandoned is
// still a record worth keeping.
//
// It arms before it fires, the same two-step the Cancel button in the topbar
// uses, because closing is the one thing here that cannot be undone from this
// sheet.
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { useOverlayFocus } from "../../hooks/useOverlayFocus";
import type { CarePlan } from "../../lib/db";

export interface CarePlanDraft {
    goal: string;
    diagnosis: string;
    targetVisitCount: string;
    targetDate: string;
    notes: string;
}

export function CarePlanSheet({
    plan, sessionNumber, busy, onSave, onClosePlan, onDismiss,
}: {
    /** null when starting a new plan */
    plan: CarePlan | null;
    /** which session the current consult would be — shown, never edited */
    sessionNumber: number;
    busy: boolean;
    onSave: (draft: CarePlanDraft) => void;
    onClosePlan: () => void;
    onDismiss: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    useOverlayFocus(panelRef, true);

    const [goal, setGoal] = useState(plan?.goal ?? "");
    const [diagnosis, setDiagnosis] = useState(plan?.diagnosis ?? "");
    const [targetVisitCount, setTargetVisitCount] = useState(
        plan?.target_visit_count != null ? String(plan.target_visit_count) : ""
    );
    const [targetDate, setTargetDate] = useState(plan?.target_date ? plan.target_date.slice(0, 10) : "");
    const [notes, setNotes] = useState(plan?.notes ?? "");
    const [closeArmed, setCloseArmed] = useState(false);

    const canSave = goal.trim().length > 0 && !busy;

    const submit = () => {
        if (!canSave) return;
        onSave({ goal: goal.trim(), diagnosis: diagnosis.trim(), targetVisitCount, targetDate, notes: notes.trim() });
    };

    return (
        <div className="cs-cpsheet-scrim" onClick={onDismiss} role="presentation">
            <div
                ref={panelRef}
                className="cs-cpsheet cx-kbd-surface"
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={plan ? "Edit care plan" : "Start a care plan"}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); onDismiss(); }
                    // Ctrl+Enter saves from anywhere in the form, including
                    // the notes textarea where a bare Enter is a newline.
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
                }}
            >
                <header className="cs-cpsheet-head">
                    <div>
                        <p className="cs-cpsheet-eyebrow">Care plan</p>
                        <h3 className="cs-cpsheet-title">
                            {plan ? "Adjust this course" : "Start a course of treatment"}
                        </h3>
                    </div>
                    <button type="button" className="cs-cpsheet-x" onClick={onDismiss} aria-label="Close">
                        <X size={15} />
                    </button>
                </header>

                <div className="cs-cpsheet-body">
                    <label className="cs-cpsheet-field">
                        <span>Goal</span>
                        <input
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            placeholder="Restore full knee function and return to sport"
                            autoFocus
                        />
                    </label>

                    <label className="cs-cpsheet-field">
                        <span>Condition <em>optional</em></span>
                        <input
                            value={diagnosis}
                            onChange={(e) => setDiagnosis(e.target.value)}
                            placeholder="Post ACL reconstruction (R knee)"
                        />
                    </label>

                    {/* Two ways to say where the course ends, because the
                        specialties genuinely differ: physiotherapy sells a
                        package of sessions, cardiology titrates towards a date
                        or a target dose. Neither is required — an open-ended
                        plan still shows "Session 4" and simply has no "of". */}
                    <div className="cs-cpsheet-pair">
                        <label className="cs-cpsheet-field">
                            <span>Planned sessions <em>optional</em></span>
                            <input
                                type="number"
                                min={1}
                                value={targetVisitCount}
                                onChange={(e) => setTargetVisitCount(e.target.value)}
                                placeholder="12"
                            />
                        </label>
                        <label className="cs-cpsheet-field">
                            <span>Target date <em>optional</em></span>
                            <input
                                type="date"
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                            />
                        </label>
                    </div>

                    <label className="cs-cpsheet-field">
                        <span>Notes <em>optional</em></span>
                        <textarea
                            rows={2}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Progress load 10–15% per week; avoid deep squatting"
                        />
                    </label>

                    {plan && (
                        <p className="cs-cpsheet-pos">
                            This consult would be session <strong>{sessionNumber}</strong>
                            {plan.target_visit_count ? ` of ${plan.target_visit_count}` : ""}.
                        </p>
                    )}
                </div>

                <footer className="cs-cpsheet-foot">
                    {plan ? (
                        <button
                            type="button"
                            className={`cs-cpsheet-close${closeArmed ? " armed" : ""}`}
                            onClick={() => (closeArmed ? onClosePlan() : setCloseArmed(true))}
                            disabled={busy}
                        >
                            {closeArmed ? "Sure? Click again" : "Close this plan"}
                        </button>
                    ) : <span />}

                    <div className="cs-cpsheet-actions">
                        <button type="button" className="cs-cpsheet-cancel" onClick={onDismiss} disabled={busy}>
                            Cancel
                        </button>
                        <button type="button" className="cs-cpsheet-save" onClick={submit} disabled={!canSave}>
                            {busy ? "Saving…" : plan ? "Save changes" : "Start plan"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
